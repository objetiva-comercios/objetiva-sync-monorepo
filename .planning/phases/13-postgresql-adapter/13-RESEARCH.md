# Phase 13: PostgreSQL Adapter - Research

**Researched:** 2026-02-11
**Domain:** Database Adapter Pattern, PostgreSQL Connectivity
**Confidence:** HIGH

## Summary

This phase adds PostgreSQL as a data source adapter in objetiva-sync, enabling users to sync data from PostgreSQL ERPs alongside existing SQL Server support. The codebase already has a well-established adapter pattern (`IDataSourceAdapter` interface, `AbstractAdapter` base class, factory pattern with `ADAPTER_REGISTRY`) that makes this implementation straightforward.

The `pg` library (node-postgres) is already a dependency in the gateway (`^8.17.2`) and provides an excellent reference implementation. The sync client currently has no `pg` dependency and will need it added. The existing SQLServerAdapter provides a complete reference implementation showing exactly how to implement connection pooling, Zod validation, introspection queries, and test methods.

**Primary recommendation:** Create `PostgreSQLAdapter` following the exact patterns of `SQLServerAdapter`, using `pg` Pool for connection management, PostgreSQL `information_schema` for introspection, and extend the dashboard connection form to support PostgreSQL-specific fields.

## Standard Stack

The established libraries/tools for this domain:

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| pg | ^8.17.2 | PostgreSQL client for Node.js | Industry standard, already in gateway, Pool-based, well-maintained |
| @types/pg | ^8.16.0 | TypeScript types for pg | First-party types, already in gateway devDeps |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| zod | ^3.23.8 | Config validation | Already in project, used by all adapters |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| pg | postgres.js | Different API, AWS Lambda issues documented, NOT RECOMMENDED per roadmap |
| pg | pg-promise | Additional abstraction layer, unnecessary complexity |

**Installation:**
```bash
# In objetiva-sync package only (gateway already has pg)
cd objetiva-sync && npm install pg && npm install -D @types/pg
```

## Architecture Patterns

### Recommended Project Structure
```
objetiva-sync/src/adapters/
  types.ts              # IDataSourceAdapter, IAdapterRegistry (existing)
  base-adapter.ts       # AbstractAdapter (existing)
  index.ts              # ADAPTER_REGISTRY, createAdapter factory (extend)
  database-adapter.ts   # testDatabaseConnection helper (existing)
  sqlserver/
    index.ts            # Re-exports (existing)
    sqlserver-adapter.ts # Reference implementation (existing)
  postgresql/           # NEW
    index.ts            # Re-exports
    postgresql-adapter.ts # New adapter implementation
```

### Pattern 1: Adapter Interface Compliance
**What:** PostgreSQLAdapter must implement all IDataSourceAdapter methods exactly as SQLServerAdapter does
**When to use:** Always - this is the contract that SyncEngine depends on
**Example:**
```typescript
// Source: objetiva-sync/src/adapters/types.ts (existing)
export interface IDataSourceAdapter {
  readonly type: string;
  readonly displayName: string;
  readonly isConnected: boolean;

  getConfigSchema(): z.ZodTypeAny;
  connect(config: IConnectionConfig): Promise<void>;
  disconnect(): Promise<void>;
  testConnection(config?: IConnectionConfig): Promise<TestResult>;
  executeQuery(sql: string, params?: IQueryParams): Promise<IQueryResult>;
  getTables(): Promise<string[]>;
  getColumns(tableName: string): Promise<IColumnInfo[]>;
  getSampleData(tableName: string, limit?: number): Promise<IQueryResult>;
}
```

### Pattern 2: pg Pool-Based Connection
**What:** Use `pg.Pool` for connection pooling with similar config to SQLServerAdapter
**When to use:** For all database operations
**Example:**
```typescript
// Source: node-postgres.com/apis/pool
import { Pool, PoolConfig, QueryResult } from 'pg';

const poolConfig: PoolConfig = {
  host: config.host,
  port: config.port ?? 5432,
  database: config.database,
  user: config.user,
  password: config.password,
  max: 10,                    // Match SQLServerAdapter pool size
  idleTimeoutMillis: 30000,   // 30 seconds
  connectionTimeoutMillis: config.connectionTimeout ?? 30000,
};

this.pool = new Pool(poolConfig);
```

### Pattern 3: Parameterized Queries
**What:** Use $1, $2 placeholders for parameters (pg style, different from SQL Server's @param)
**When to use:** All queries with dynamic values
**Example:**
```typescript
// Source: node-postgres.com/features/queries
// SQL Server uses @param style, PostgreSQL uses $1 style
const result = await this.pool.query(
  'SELECT * FROM users WHERE id = $1 AND status = $2',
  [userId, status]
);
```

### Anti-Patterns to Avoid
- **Using postgres.js instead of pg:** Different API, documented AWS issues, inconsistent with gateway
- **Creating pool per query:** Always use shared pool, release properly
- **Mixing parameter styles:** Use $1 for pg, @param for SQL Server - keep adapters consistent within themselves
- **Not handling pool.on('error'):** Silent failures if backend disconnects

## Don't Hand-Roll

Problems that look simple but have existing solutions:

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Connection pooling | Custom pool manager | `pg.Pool` | Built-in, handles timeouts, errors, reconnection |
| Config validation | Manual checks | Zod schema like SQLServerAdapter | Consistent with existing pattern, type inference |
| Introspection | Parse `\d` output | `information_schema` queries | Standard SQL, already proven in gateway |
| SQL injection | String interpolation | pg parameterized queries ($1, $2) | Built-in escaping, safe by default |

**Key insight:** The gateway already has working PostgreSQL introspection queries in `src/services/introspection.ts` that can be directly reused/adapted for the adapter's `getTables()`, `getColumns()`, and `getSampleData()` methods.

## Common Pitfalls

### Pitfall 1: Parameter Style Mismatch
**What goes wrong:** Trying to use SQL Server style `@param` in PostgreSQL queries
**Why it happens:** Copy-paste from SQLServerAdapter without adapting
**How to avoid:** PostgreSQL uses `$1`, `$2`, etc. for positional parameters
**Warning signs:** Query fails with "syntax error at or near @"

### Pitfall 2: Pool Exhaustion
**What goes wrong:** All pool connections are in use, new queries hang
**Why it happens:** Not releasing clients after use, or forgetting `await` on async operations
**How to avoid:** Use `pool.query()` for simple queries (auto-releases). For transactions, always use try/finally with `client.release()`
**Warning signs:** `pool.waitingCount` grows indefinitely

### Pitfall 3: Type Mapping Inconsistency
**What goes wrong:** PostgreSQL types not normalized consistently with SQL Server
**Why it happens:** Different type names between databases (e.g., `integer` vs `int`, `character varying` vs `varchar`)
**How to avoid:** Use the TYPE_MAPPING from gateway's introspection.ts as reference
**Warning signs:** Schema validation fails on type comparisons

### Pitfall 4: Missing SSL Configuration
**What goes wrong:** Connection fails on production PostgreSQL instances that require SSL
**Why it happens:** Development instances often don't require SSL, production does
**How to avoid:** Add `ssl` option to config schema with `rejectUnauthorized` option
**Warning signs:** "SSL required" errors in production

### Pitfall 5: Default Port Assumption
**What goes wrong:** Port 5432 assumed but actual PostgreSQL runs on different port
**Why it happens:** PostgreSQL default is 5432, but many cloud providers use different ports
**How to avoid:** Always make port configurable with 5432 as default (like SQL Server's 1433 default)
**Warning signs:** Connection timeout on correct host but wrong port

## Code Examples

Verified patterns from official sources and existing codebase:

### PostgreSQL Config Schema
```typescript
// Pattern from: SQLServerAdapter config schema
// Source: objetiva-sync/src/adapters/sqlserver/sqlserver-adapter.ts
const postgresConfigSchema = z.object({
  host: z.string().min(1, 'El host es requerido'),
  port: z.number().int().min(1).max(65535).default(5432),
  database: z.string().min(1, 'La base de datos es requerida'),
  user: z.string().min(1, 'El usuario es requerido'),
  password: z.string().min(1, 'La contrasena es requerida'),
  ssl: z.object({
    enabled: z.boolean().default(false),
    rejectUnauthorized: z.boolean().default(true),
  }).optional(),
  connectionTimeout: z.number().int().min(1000).default(30000),
});

export type PostgreSQLConfig = z.infer<typeof postgresConfigSchema>;
```

### Pool Connection
```typescript
// Source: node-postgres.com/apis/pool + gateway db.ts pattern
protected async doConnect(config: IConnectionConfig): Promise<void> {
  const pgConfig = config as PostgreSQLConfig;

  const poolConfig: PoolConfig = {
    host: pgConfig.host,
    port: pgConfig.port ?? 5432,
    database: pgConfig.database,
    user: pgConfig.user,
    password: pgConfig.password,
    max: 10,
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: pgConfig.connectionTimeout ?? 30000,
  };

  // SSL configuration
  if (pgConfig.ssl?.enabled) {
    poolConfig.ssl = {
      rejectUnauthorized: pgConfig.ssl.rejectUnauthorized ?? true,
    };
  }

  this.pool = new Pool(poolConfig);

  // Register error handler for idle client errors
  this.pool.on('error', (err) => {
    logger.error(err, '[PostgreSQL] Pool error on idle client');
  });

  logger.info(
    `[${this.type}] Pool de conexiones creado: ${pgConfig.host}:${pgConfig.port}/${pgConfig.database}`
  );
}
```

### Execute Query with Parameters
```typescript
// Source: node-postgres.com/features/queries
protected async doExecuteQuery(sql: string, params?: IQueryParams): Promise<IQueryResult> {
  if (!this.pool) {
    throw new Error('Pool de conexiones no inicializado');
  }

  // Convert named params (from adapter interface) to positional params for pg
  // Adapter interface uses {lastSync: '2024-01-01'} format
  // pg uses $1, $2 positional format
  let paramValues: unknown[] = [];
  let processedSql = sql;

  if (params) {
    // Replace @paramName or :paramName with $1, $2, etc.
    let paramIndex = 1;
    const paramMap = new Map<string, number>();

    for (const [key, value] of Object.entries(params)) {
      paramMap.set(key, paramIndex);
      paramValues.push(value);
      paramIndex++;
    }

    // Replace both @lastSync and :lastSync style placeholders
    processedSql = sql.replace(/@(\w+)|:(\w+)/g, (match, p1, p2) => {
      const paramName = p1 || p2;
      const index = paramMap.get(paramName);
      if (index !== undefined) {
        return `$${index}`;
      }
      return match; // Leave unchanged if not in params
    });
  }

  const result = await this.pool.query(processedSql, paramValues);

  return {
    rows: result.rows ?? [],
    rowCount: result.rowCount ?? 0,
    executionTimeMs: 0, // Calculated by AbstractAdapter
  };
}
```

### Get Tables (Information Schema)
```typescript
// Source: Gateway introspection.ts pattern + PostgreSQL documentation
protected async doGetTables(): Promise<string[]> {
  const query = `
    SELECT
      table_schema || '.' || table_name as table_name
    FROM
      information_schema.tables
    WHERE
      table_type = 'BASE TABLE'
      AND table_schema NOT IN ('pg_catalog', 'information_schema')
    ORDER BY
      table_schema, table_name
  `;

  const result = await this.doExecuteQuery(query);

  return (result.rows as Record<string, unknown>[]).map((row) => row.table_name as string);
}
```

### Get Columns (Information Schema)
```typescript
// Source: Gateway introspection.ts + PostgreSQL info schema docs
protected async doGetColumns(tableName: string): Promise<IColumnInfo[]> {
  // Parse schema.table format
  const parts = tableName.split('.');
  const schemaName = parts.length > 1 ? parts[0] : 'public';
  const table = parts.length > 1 ? parts[1] : parts[0];

  const query = `
    SELECT
      column_name as name,
      data_type as type,
      is_nullable as nullable,
      character_maximum_length as "maxLength",
      numeric_precision as precision,
      numeric_scale as scale
    FROM
      information_schema.columns
    WHERE
      table_schema = $1
      AND table_name = $2
    ORDER BY
      ordinal_position
  `;

  const result = await this.pool!.query(query, [schemaName, table]);

  return result.rows.map((row) => ({
    name: row.name,
    type: normalizePostgresType(row.type), // Map to standard types
    nullable: row.nullable === 'YES',
    maxLength: row.maxLength ? Number(row.maxLength) : undefined,
    precision: row.precision ? Number(row.precision) : undefined,
    scale: row.scale ? Number(row.scale) : undefined,
  }));
}
```

### Test Connection
```typescript
// Source: SQLServerAdapter pattern
protected async doTestConnection(config: IConnectionConfig): Promise<TestResult> {
  const pgConfig = config as PostgreSQLConfig;
  let testPool: Pool | null = null;

  try {
    const poolConfig: PoolConfig = {
      host: pgConfig.host,
      port: pgConfig.port ?? 5432,
      database: pgConfig.database,
      user: pgConfig.user,
      password: pgConfig.password,
      connectionTimeoutMillis: pgConfig.connectionTimeout ?? 30000,
    };

    if (pgConfig.ssl?.enabled) {
      poolConfig.ssl = {
        rejectUnauthorized: pgConfig.ssl.rejectUnauthorized ?? true,
      };
    }

    testPool = new Pool(poolConfig);

    // Query version to verify connection
    const result = await testPool.query('SELECT version() as version');
    const version = result.rows[0]?.version ?? 'Desconocida';
    const shortVersion = version.split(' ').slice(0, 2).join(' '); // e.g., "PostgreSQL 15.4"

    await testPool.end();

    return {
      success: true,
      message: `Conexion exitosa. ${shortVersion}`,
    };
  } catch (error) {
    if (testPool) {
      try {
        await testPool.end();
      } catch {
        // Ignore cleanup errors
      }
    }

    const errorMessage = error instanceof Error ? error.message : String(error);
    return {
      success: false,
      message: `Error de conexion: ${errorMessage}`,
    };
  }
}
```

### Registry Update
```typescript
// Source: objetiva-sync/src/adapters/index.ts
import { PostgreSQLAdapter } from './postgresql/index.js';

export const ADAPTER_REGISTRY: IAdapterRegistry = {
  sqlserver: SQLServerAdapter,
  postgres: PostgreSQLAdapter,  // Add this line
  // Future adapters:
  // mysql: MySQLAdapter,
  // excel: ExcelAdapter,
};
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| callbacks | async/await with pg | pg 7.0+ | Cleaner code, better error handling |
| pg without pool | pg.Pool everywhere | pg best practices 2024+ | Connection efficiency, no exhaustion |
| manual type checks | Zod schemas | Project standard | Type safety, validation |

**Deprecated/outdated:**
- Using `postgres.js` for this project: Different API style, AWS issues reported, inconsistent with gateway
- Manual connection management without pool: Inefficient, risk of connection leaks

## UI Extension Patterns

The dashboard already has conditional form fields for different adapter types. The connection.ejs template shows the pattern:

```javascript
// Source: objetiva-sync/src/dashboard/views/config/connection.ejs
function handleAdapterChange() {
  const adapter = document.getElementById('conn-adapter').value;
  // ...
  if (adapter === 'sqlserver' || adapter === 'postgres' || adapter === 'mysql') {
    sqlFields.classList.remove('hidden');

    // Set default ports
    if (adapter === 'postgres') {
      portField.value = '5432';
      portField.placeholder = '5432';
    }
  }
}
```

**PostgreSQL-specific UI considerations:**
1. Default port: 5432 (already handled in existing code)
2. No Windows Authentication (remove that section for postgres)
3. SSL options needed for cloud PostgreSQL (Supabase, RDS, etc.)
4. No driver selection needed (unlike SQL Server's tedious vs msnodesqlv8)

## Open Questions

Things that couldn't be fully resolved:

1. **SSL Certificate Path**
   - What we know: pg supports `ssl.ca`, `ssl.key`, `ssl.cert` for custom certificates
   - What's unclear: Do users need custom certificate upload via UI?
   - Recommendation: Start with `ssl.rejectUnauthorized` toggle only, add certificate upload if requested

2. **Connection String vs Individual Fields**
   - What we know: pg supports both `connectionString` and individual fields
   - What's unclear: Should we support `DATABASE_URL` format like gateway?
   - Recommendation: Use individual fields (consistent with SQL Server) for Phase 1, consider connection string in future

## Sources

### Primary (HIGH confidence)
- [node-postgres.com/apis/pool](https://node-postgres.com/apis/pool) - Official Pool API documentation
- [node-postgres.com/features/queries](https://node-postgres.com/features/queries) - Parameterized queries
- [node-postgres.com/features/pooling](https://node-postgres.com/features/pooling) - Best practices for pooling
- objetiva-sync/src/adapters/sqlserver/sqlserver-adapter.ts - Reference implementation in codebase
- objetiva-sync-gateway/src/services/introspection.ts - PostgreSQL introspection queries (same patterns)
- objetiva-sync-gateway/src/lib/db.ts - pg Pool configuration example

### Secondary (MEDIUM confidence)
- [PostgreSQL INFORMATION_SCHEMA Documentation](https://www.postgresql.org/docs/current/infoschema-columns.html) - Column metadata queries
- [Beekeeper Studio PostgreSQL Guide](https://www.beekeeperstudio.io/blog/postgresql-information-schema) - Practical introspection examples

### Tertiary (LOW confidence)
- Web search results for pg best practices 2026 - General guidance

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH - pg is already in gateway, well-documented, industry standard
- Architecture: HIGH - Follows existing adapter pattern exactly, codebase provides clear reference
- Pitfalls: HIGH - Based on official documentation and common patterns

**Research date:** 2026-02-11
**Valid until:** 2026-04-11 (90 days - pg library is stable)
