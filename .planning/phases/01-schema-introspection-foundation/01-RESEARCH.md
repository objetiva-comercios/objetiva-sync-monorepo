# Phase 1: Schema Introspection Foundation - Research

**Researched:** 2026-01-26
**Domain:** PostgreSQL schema introspection via information_schema
**Confidence:** HIGH

## Summary

PostgreSQL schema introspection is a well-established pattern with two main approaches: SQL-standard information_schema views (portable, stable) and PostgreSQL-specific pg_catalog system tables (more powerful, includes PostgreSQL-specific features). For this phase, information_schema provides all needed metadata (columns, types, nullability, constraints, defaults, comments) with better long-term compatibility.

The standard approach uses information_schema.columns for column metadata, information_schema.table_constraints + key_column_usage for constraints, and helper functions (col_description, obj_description) for comments. Node.js implementation uses the pg (node-postgres) driver version 8.17.1 with connection pooling, retry logic via exponential-backoff library, and per-query statement_timeout configuration.

Type normalization requires mapping PostgreSQL's verbose type names (character varying, integer, timestamp without time zone) to simplified standard names (varchar, int, timestamp) while handling special cases like arrays (data_type = 'ARRAY', use udt_name for element type) and domains (coalesce domain_name with udt_name).

**Primary recommendation:** Use information_schema views for all introspection, implement retry with exponential-backoff library, configure statement_timeout per query, normalize type names with a mapping table, and query entities sequentially to avoid connection pool exhaustion.

## Standard Stack

The established libraries/tools for PostgreSQL introspection in Node.js:

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| pg (node-postgres) | 8.17.1+ | PostgreSQL client driver | Official Node.js PostgreSQL driver, pure JavaScript with optional native bindings, supports connection pooling and statement_timeout |
| exponential-backoff | 1.4.1+ | Retry logic with exponential delays | Dedicated retry library with jitter support, prevents thundering herd, configurable max attempts and delays |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| zod | 3.23.8+ | Schema validation | Already in gateway dependencies - validate introspection output format |
| pino | 9.5.0+ | Logging | Already in gateway dependencies - log introspection errors with severity levels |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| pg | postgres.js (porsager/postgres) | Faster performance but different API, pg is more established and compatible |
| exponential-backoff | Custom retry logic | More control but requires handling jitter, max delays, and error classification manually |
| information_schema | pg_catalog queries | More PostgreSQL-specific features (e.g., sequences) but version-dependent, breaks portability |
| Dedicated library | pg-introspection, extract-pg-schema | More features but adds dependency; information_schema queries are straightforward |

**Installation:**
```bash
npm install pg exponential-backoff
npm install --save-dev @types/pg
```

## Architecture Patterns

### Recommended Project Structure
```
src/
├── services/
│   └── introspection.ts     # Core introspection logic
├── schemas/
│   └── introspection.ts     # Zod schemas for validation
├── lib/
│   ├── db.ts                # Database connection pool
│   └── retry.ts             # Retry wrapper with backoff
└── types/
    └── schema.ts            # TypeScript types for schema metadata
```

### Pattern 1: Connection Pool with Retry Wrapper
**What:** Create a dedicated PostgreSQL connection pool for introspection queries, wrap all queries with retry logic
**When to use:** For all database connections to handle transient failures gracefully
**Example:**
```typescript
// lib/db.ts
// Source: https://node-postgres.com/ + https://www.npmjs.com/package/exponential-backoff
import { Pool } from 'pg';

export const pool = new Pool({
  host: process.env.POSTGRES_HOST,
  port: parseInt(process.env.POSTGRES_PORT || '5432'),
  database: process.env.POSTGRES_DB,
  user: process.env.POSTGRES_USER,
  password: process.env.POSTGRES_PASSWORD,
  statement_timeout: 5000, // 5 seconds per query
  max: 10, // Max connections
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 10000
});

// lib/retry.ts
import { backOff } from 'exponential-backoff';

export async function withRetry<T>(
  operation: () => Promise<T>,
  operationName: string
): Promise<T> {
  return backOff(operation, {
    numOfAttempts: 3,
    startingDelay: 1000, // 1s
    timeMultiple: 2, // Exponential: 1s, 2s, 4s
    jitter: 'full',
    retry: (error: any) => {
      // Retry on connection errors, not on SQL syntax errors
      const retryableCodes = ['ECONNREFUSED', 'ETIMEDOUT', 'ENOTFOUND'];
      return retryableCodes.includes(error.code);
    }
  });
}
```

### Pattern 2: Information Schema Query Structure
**What:** Query information_schema views with explicit filtering and joining for complete metadata
**When to use:** For all schema introspection operations
**Example:**
```typescript
// Source: https://www.postgresql.org/docs/current/infoschema-columns.html
const COLUMNS_QUERY = `
  SELECT
    c.table_name,
    c.column_name,
    c.ordinal_position,
    c.data_type,
    c.udt_name,
    c.is_nullable,
    c.column_default,
    c.character_maximum_length,
    c.numeric_precision,
    c.numeric_scale,
    col_description((c.table_schema || '.' || c.table_name)::regclass, c.ordinal_position) as column_comment
  FROM information_schema.columns c
  WHERE c.table_schema = $1
    AND c.table_name = $2
  ORDER BY c.ordinal_position
`;

const result = await pool.query(COLUMNS_QUERY, ['public', tableName]);
```

### Pattern 3: Constraint Introspection with Multi-View Join
**What:** Join information_schema.table_constraints with key_column_usage and referential_constraints for complete constraint metadata
**When to use:** When gathering primary keys, foreign keys, unique constraints, and check constraints
**Example:**
```typescript
// Source: https://dataedo.com/kb/query/postgresql/list-of-foreign-keys-with-columns
const CONSTRAINTS_QUERY = `
  SELECT
    tc.constraint_name,
    tc.constraint_type,
    kcu.column_name,
    rc.unique_constraint_name,
    ccu.table_name AS foreign_table_name,
    ccu.column_name AS foreign_column_name
  FROM information_schema.table_constraints tc
  LEFT JOIN information_schema.key_column_usage kcu
    ON tc.constraint_name = kcu.constraint_name
    AND tc.table_schema = kcu.table_schema
  LEFT JOIN information_schema.referential_constraints rc
    ON tc.constraint_name = rc.constraint_name
    AND tc.table_schema = rc.constraint_schema
  LEFT JOIN information_schema.constraint_column_usage ccu
    ON rc.unique_constraint_name = ccu.constraint_name
    AND rc.unique_constraint_schema = ccu.constraint_schema
  WHERE tc.table_schema = $1
    AND tc.table_name = $2
  ORDER BY tc.constraint_type, kcu.ordinal_position
`;
```

### Pattern 4: Type Normalization Mapping
**What:** Create a mapping function to convert PostgreSQL verbose type names to simplified standard names
**When to use:** After querying information_schema.columns, before returning normalized JSON
**Example:**
```typescript
// Source: Based on PostgreSQL data types documentation
const TYPE_MAPPING: Record<string, string> = {
  'character varying': 'varchar',
  'character': 'char',
  'integer': 'int',
  'smallint': 'int',
  'bigint': 'int',
  'timestamp without time zone': 'timestamp',
  'timestamp with time zone': 'timestamp',
  'double precision': 'float',
  'real': 'float',
  'numeric': 'decimal',
  'jsonb': 'jsonb',
  'json': 'jsonb',
  'ARRAY': 'array',
  // Add more as needed
};

function normalizeType(dataType: string, udtName: string): string {
  // For arrays, data_type is 'ARRAY', actual type is in udt_name prefixed with '_'
  if (dataType === 'ARRAY') {
    return 'array';
  }

  return TYPE_MAPPING[dataType] || dataType;
}
```

### Pattern 5: Sequential Entity Processing with Partial Results
**What:** Process entities one at a time, accumulate successful results and errors separately
**When to use:** When introspecting multiple tables to avoid connection pool exhaustion
**Example:**
```typescript
interface IntrospectionResult {
  tables: TableSchema[];
  errors: IntrospectionError[];
}

async function introspectEntities(entityNames: string[]): Promise<IntrospectionResult> {
  const result: IntrospectionResult = { tables: [], errors: [] };

  for (const entityName of entityNames) {
    try {
      const schema = await withRetry(
        () => introspectSingleTable(entityName),
        `introspect-${entityName}`
      );
      result.tables.push(schema);
    } catch (error) {
      result.errors.push({
        entity: entityName,
        message: `Failed to introspect ${entityName}: ${error.message}`,
        reason: error.code || 'unknown'
      });
    }
  }

  return result;
}
```

### Pattern 6: Configuration-Driven Entity List
**What:** Store entity list in configuration file (JSON or environment variable), easily modifiable without code changes
**When to use:** For defining which tables to introspect
**Example:**
```typescript
// config/entities.json or .env
const SYNC_ENTITIES = process.env.SYNC_ENTITIES?.split(',') || [
  'clientes',
  'productos',
  'pedidos',
  'detalle_pedidos'
];

// Load from JSON for more structure
import entitiesConfig from './config/entities.json';
const SYNC_ENTITIES = entitiesConfig.tables.map(t => t.name);
```

### Anti-Patterns to Avoid
- **Querying pg_catalog directly for basic metadata:** Use information_schema for portability, only use pg_catalog when absolutely needed (e.g., sequences)
- **Caching schema results:** Per context decisions, always query fresh to ensure current schema state
- **Parallel entity queries:** Per context decisions, query sequentially to avoid overwhelming connection pool
- **Generic retry on all errors:** Only retry connection failures (ECONNREFUSED, ETIMEDOUT), not SQL syntax errors or permission errors
- **Ignoring constraint duplicate names:** PostgreSQL allows duplicate constraint names across schemas; group by table_name to avoid confusion

## Don't Hand-Roll

Problems that look simple but have existing solutions:

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Exponential backoff retry | Custom setTimeout loop with exponential math | exponential-backoff npm package | Handles jitter to prevent thundering herd, configurable retry predicates, well-tested edge cases |
| PostgreSQL connection pooling | Array of connections with manual management | pg.Pool from node-postgres | Handles connection lifecycle, idle timeout, max connections, queue management, reconnection |
| Type validation of introspection output | Manual object checking with if statements | Zod schemas | Type-safe validation, clear error messages, automatic TypeScript type inference |
| Comment retrieval | Joining pg_description manually with OID resolution | col_description() and obj_description() functions | PostgreSQL built-in functions handle OID lookup and classoid matching |

**Key insight:** PostgreSQL introspection has mature, battle-tested libraries and SQL standard views. Custom solutions introduce bugs around connection management, retry logic, and type mapping edge cases (arrays, domains, user-defined types).

## Common Pitfalls

### Pitfall 1: Array Type Misidentification
**What goes wrong:** Querying information_schema.columns for array columns returns data_type = 'ARRAY' without element type information
**Why it happens:** SQL standard doesn't specify array element types in data_type column; PostgreSQL stores actual type in udt_name with '_' prefix (e.g., '_int4' for integer[])
**How to avoid:** Always check both data_type and udt_name; when data_type = 'ARRAY', note it as 'array' base type per context decisions (base type only, no element types)
**Warning signs:** Type normalization produces 'ARRAY' instead of simplified 'array'; missing element type info causes confusion

### Pitfall 2: Default Value Expression Parsing
**What goes wrong:** column_default contains PostgreSQL expressions like "nextval('seq_name'::regclass)" or "'default_text'::text" that look like values but are executable code
**Why it happens:** column_default stores the expression as-written, including type casts and function calls
**How to avoid:** Store default values as-is without parsing; document that default_value is an expression string, not a literal value
**Warning signs:** Trying to parse default_value as JSON or eval() it; removing quotes/casts breaks recreating schema

### Pitfall 3: Nullable Column String Confusion
**What goes wrong:** is_nullable returns 'YES' or 'NO' as strings, not booleans; direct comparison fails
**Why it happens:** information_schema follows SQL standard which uses string values
**How to avoid:** Convert explicitly: `is_nullable: row.is_nullable === 'YES'` when building JSON output
**Warning signs:** Boolean checks fail, type errors in TypeScript without proper conversion

### Pitfall 4: Comment Function Returns NULL
**What goes wrong:** col_description() returns NULL for columns without comments; results in null in JSON output
**Why it happens:** Not all columns have comments, PostgreSQL returns NULL for missing comments
**How to avoid:** Handle NULL explicitly with COALESCE or filter in application code: `column_comment: row.column_comment || null`
**Warning signs:** Unexpected null values in column_comment field; need to document that comments are optional

### Pitfall 5: Constraint Name Duplication
**What goes wrong:** Multiple rows returned for single logical constraint because PostgreSQL allows duplicate constraint names across schemas
**Why it happens:** SQL standard requires unique constraint names per schema, but PostgreSQL doesn't enforce this
**How to avoid:** Always filter by table_schema in WHERE clause; group constraints by constraint_name + table_name combination
**Warning signs:** Duplicate constraint entries in output; constraints appearing multiple times for different tables

### Pitfall 6: Connection Pool Exhaustion
**What goes wrong:** Parallel queries to introspect multiple tables exhaust connection pool, causing timeout errors
**Why it happens:** Each query holds a connection until complete; parallel execution requests more connections than pool.max
**How to avoid:** Process entities sequentially as per context decisions; log each entity start/complete for visibility
**Warning signs:** "Connection pool exhausted" errors, queries hanging indefinitely, sudden performance degradation

### Pitfall 7: Retrying Non-Retryable Errors
**What goes wrong:** Retry logic repeatedly retries SQL syntax errors or permission errors that will never succeed
**Why it happens:** Generic retry logic doesn't distinguish between transient (connection) and permanent (syntax) errors
**How to avoid:** Check error.code in retry predicate; only retry connection errors (ECONNREFUSED, ETIMEDOUT, ENOTFOUND)
**Warning signs:** Logs show 3+ attempts for syntax errors; total time spent is retry_delay * attempts for non-transient failures

### Pitfall 8: Statement Timeout Not Per-Query
**What goes wrong:** Setting global statement_timeout affects all queries across all connections, including unrelated application queries
**Why it happens:** Configuring statement_timeout at pool level or in postgresql.conf applies globally
**How to avoid:** Set statement_timeout in Pool config (applies to pool connections only) or use SET LOCAL statement_timeout in transaction
**Warning signs:** Unrelated queries timing out at 5 seconds; other services sharing database affected

## Code Examples

Verified patterns from official sources:

### Complete Column Introspection
```typescript
// Source: https://www.postgresql.org/docs/current/infoschema-columns.html
interface ColumnMetadata {
  column_name: string;
  data_type: string;
  is_nullable: boolean;
  default_value: string | null;
  ordinal_position: number;
  character_maximum_length: number | null;
  numeric_precision: number | null;
  numeric_scale: number | null;
  column_comment: string | null;
}

async function introspectColumns(
  schema: string,
  tableName: string
): Promise<ColumnMetadata[]> {
  const query = `
    SELECT
      c.column_name,
      c.data_type,
      c.udt_name,
      c.is_nullable,
      c.column_default,
      c.ordinal_position,
      c.character_maximum_length,
      c.numeric_precision,
      c.numeric_scale,
      col_description(
        (quote_ident(c.table_schema) || '.' || quote_ident(c.table_name))::regclass,
        c.ordinal_position
      ) as column_comment
    FROM information_schema.columns c
    WHERE c.table_schema = $1
      AND c.table_name = $2
    ORDER BY c.ordinal_position
  `;

  const result = await pool.query(query, [schema, tableName]);

  return result.rows.map(row => ({
    column_name: row.column_name,
    data_type: normalizeType(row.data_type, row.udt_name),
    is_nullable: row.is_nullable === 'YES',
    default_value: row.column_default,
    ordinal_position: row.ordinal_position,
    character_maximum_length: row.character_maximum_length,
    numeric_precision: row.numeric_precision,
    numeric_scale: row.numeric_scale,
    column_comment: row.column_comment
  }));
}
```

### Constraint Introspection (Primary Keys, Foreign Keys, Unique)
```typescript
// Source: https://dataedo.com/kb/query/postgresql/list-of-foreign-keys-with-columns
interface ConstraintMetadata {
  constraint_name: string;
  constraint_type: 'PRIMARY KEY' | 'FOREIGN KEY' | 'UNIQUE' | 'CHECK';
  columns: string[];
  foreign_table?: string;
  foreign_columns?: string[];
}

async function introspectConstraints(
  schema: string,
  tableName: string
): Promise<ConstraintMetadata[]> {
  const query = `
    SELECT
      tc.constraint_name,
      tc.constraint_type,
      kcu.column_name,
      kcu.ordinal_position,
      ccu.table_name AS foreign_table_name,
      ccu.column_name AS foreign_column_name
    FROM information_schema.table_constraints tc
    LEFT JOIN information_schema.key_column_usage kcu
      ON tc.constraint_name = kcu.constraint_name
      AND tc.table_schema = kcu.table_schema
      AND tc.table_name = kcu.table_name
    LEFT JOIN information_schema.constraint_column_usage ccu
      ON tc.constraint_name = ccu.constraint_name
      AND tc.constraint_schema = ccu.constraint_schema
    WHERE tc.table_schema = $1
      AND tc.table_name = $2
      AND tc.constraint_type IN ('PRIMARY KEY', 'FOREIGN KEY', 'UNIQUE', 'CHECK')
    ORDER BY tc.constraint_name, kcu.ordinal_position
  `;

  const result = await pool.query(query, [schema, tableName]);

  // Group by constraint_name since multi-column constraints return multiple rows
  const grouped = result.rows.reduce((acc, row) => {
    if (!acc[row.constraint_name]) {
      acc[row.constraint_name] = {
        constraint_name: row.constraint_name,
        constraint_type: row.constraint_type,
        columns: [],
        foreign_table: row.foreign_table_name,
        foreign_columns: []
      };
    }
    acc[row.constraint_name].columns.push(row.column_name);
    if (row.foreign_column_name) {
      acc[row.constraint_name].foreign_columns.push(row.foreign_column_name);
    }
    return acc;
  }, {} as Record<string, any>);

  return Object.values(grouped);
}
```

### Table Comment Retrieval
```typescript
// Source: https://www.postgresql.org/docs/current/catalog-pg-description.html
async function getTableComment(
  schema: string,
  tableName: string
): Promise<string | null> {
  const query = `
    SELECT obj_description(
      (quote_ident($1) || '.' || quote_ident($2))::regclass,
      'pg_class'
    ) as table_comment
  `;

  const result = await pool.query(query, [schema, tableName]);
  return result.rows[0]?.table_comment || null;
}
```

### Complete Table Schema Introspection
```typescript
// Source: Combined from above patterns
interface TableSchema {
  table_name: string;
  table_comment: string | null;
  columns: ColumnMetadata[];
}

async function introspectTable(
  schema: string,
  tableName: string
): Promise<TableSchema> {
  return await withRetry(async () => {
    const [columns, tableComment] = await Promise.all([
      introspectColumns(schema, tableName),
      getTableComment(schema, tableName)
    ]);

    return {
      table_name: tableName,
      table_comment: tableComment,
      columns
    };
  }, `introspect-${tableName}`);
}
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Raw pg_catalog queries | information_schema views | SQL:2003 standard | Better portability, version stability, clearer column names |
| Manual connection management | pg.Pool with connection pooling | node-postgres v4.0 (2014) | Automatic connection lifecycle, better resource management |
| Custom retry with setTimeout | exponential-backoff library | Library released 2019 | Jitter support, configurable retry predicates, less code |
| format_type() for type names | udt_name + data_type mapping | Always available | Simpler queries, but requires type mapping table |

**Deprecated/outdated:**
- **pg_type.typname for arrays:** Using array type naming convention (e.g., '_int4') is deprecated; use pg_type.typarray instead (though for base-type-only approach, this doesn't apply)
- **Global statement_timeout in postgresql.conf:** Setting timeout globally affects all sessions; use pool-level or session-level configuration instead

## Open Questions

Things that couldn't be fully resolved:

1. **Check Constraint Expression Parsing**
   - What we know: CHECK constraints are stored in information_schema.check_constraints with raw SQL expression
   - What's unclear: Whether to parse expressions or store as-is; parsing is complex (SQL AST parsing)
   - Recommendation: Store check_constraint expression as string per context decisions (capture check constraints), don't attempt parsing

2. **Domain Handling Strategy**
   - What we know: Domains are custom types built on base types; column can be based on domain
   - What's unclear: Whether to expose domain name or underlying type in normalized output
   - Recommendation: Use `COALESCE(domain_name, udt_name)` to prefer domain name, document that domains are treated as base types per context decisions

3. **Multi-Column Constraint Ordering**
   - What we know: Multi-column primary keys and foreign keys have ordinal_position in key_column_usage
   - What's unclear: Whether column order matters for introspection output (it matters for SQL generation but not for schema metadata)
   - Recommendation: Preserve ordinal_position order when grouping constraint columns; array order represents constraint definition order

## Sources

### Primary (HIGH confidence)
- PostgreSQL Official Documentation: Information Schema - https://www.postgresql.org/docs/current/information-schema.html
- PostgreSQL Official Documentation: information_schema.columns - https://www.postgresql.org/docs/current/infoschema-columns.html
- PostgreSQL Official Documentation: pg_description Catalog - https://www.postgresql.org/docs/current/catalog-pg-description.html
- PostgreSQL Official Documentation: Client Connection Defaults (statement_timeout) - https://www.postgresql.org/docs/current/runtime-config-client.html
- node-postgres Official Documentation - https://node-postgres.com/
- node-postgres npm package (v8.17.1) - https://www.npmjs.com/package/pg

### Secondary (MEDIUM confidence)
- Joan Arnaldich: Introspection in PostgreSQL (2021) - https://jarnaldich.me/blog/2021/08/30/postgres-introspection.html (verified with official docs)
- Dataedo: List foreign keys with columns in PostgreSQL - https://dataedo.com/kb/query/postgresql/list-of-foreign-keys-with-columns (verified query pattern)
- Beekeeper Studio: Understanding PostgreSQL Information_Schema Views - https://www.beekeeperstudio.io/blog/postgres-information-schema (verified with official docs)
- pgPedia: format_type() function - https://pgpedia.info/f/format_type.html (verified against PostgreSQL docs)
- Medium: PostgreSQL information_schema examples by Tomasz Gintowt - https://tomasz-gintowt.medium.com/postgresql-information-schema-with-practical-examples-604c250a4065

### Tertiary (LOW confidence)
- exponential-backoff npm package - https://www.npmjs.com/package/exponential-backoff (could not fetch npm page directly, using WebSearch only)
- Google Cloud SQL: Retry connection with backoff example - https://docs.cloud.google.com/sql/docs/postgres/samples/cloud-sql-postgres-knex-backoff (example only, not used for core recommendations)

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH - node-postgres is official driver, exponential-backoff is established library
- Architecture: HIGH - information_schema patterns verified in official PostgreSQL documentation
- Pitfalls: HIGH - pitfalls derived from official documentation warnings and constraint behavior

**Research date:** 2026-01-26
**Valid until:** 2026-03-26 (60 days - PostgreSQL introspection is stable, information_schema is SQL standard)
