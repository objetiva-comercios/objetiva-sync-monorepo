# Phase 3: CLI Code Regeneration - Research

**Researched:** 2026-01-27
**Domain:** CLI tooling for Prisma schema introspection from PostgreSQL and Zod schema generation
**Confidence:** HIGH

## Summary

This phase builds a CLI command (`npm run regenerate-schemas`) that lives in the **gateway module** (`objetiva-sync-gateway`) because that is where both the Prisma schema (`prisma/schema.prisma`) and the Zod validation schemas (`shared/schemas/`) reside. The CLI fetches schema metadata from the gateway's own `/api/schemas/:entity` endpoint (Phase 2), then regenerates the Prisma schema file and per-entity Zod validation schemas, showing a colored diff before writing.

The approach is **custom code generation** rather than relying on Prisma's built-in `db pull` or third-party Prisma generators (like `zod-prisma-types`). This is the correct approach because: (1) the existing Prisma schema has extensive manual annotations (`@@map`, `@map`, comments, indexes, relations) that `prisma db pull` would overwrite; (2) the existing Zod schemas have hand-written business logic (`.min()`, `.positive()`, `.describe()`, enums like `z.enum(['producto', 'servicio'])`) that Prisma generators cannot reproduce; and (3) the gateway API endpoint already provides normalized schema metadata ready for code generation.

The CLI pipeline is: **fetch schema from API** -> **generate Prisma model string** -> **generate Zod schema string** -> **diff against existing files** -> **display diff** -> **write files** (unless `--dry-run`) -> **run `prisma generate`**.

**Primary recommendation:** Build a custom TypeScript CLI script (`scripts/regenerate-schemas.ts`) in the gateway module. Use `diff` npm package for structured text diffs, `chalk` for colored output, and `node:process` for argument parsing (no commander needed for 2 flags). Fetch from gateway API using `undici` or native `fetch`. Run `prisma generate` via `child_process.execSync`.

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| diff | 8.0.x | Text diff computation (structuredPatch) | Most widely used JS diff library (7600+ dependents), provides structured hunks for custom rendering |
| chalk | 5.x | Terminal color output (green/red/yellow) | Standard for CLI color output, ESM native, zero dependencies |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| zod | 3.23.8 | Validate API response | Already installed in gateway, validate schema endpoint response shape |
| pino | 9.5.0 | Logging | Already installed in gateway, log regeneration operations |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Custom code generation | `prisma db pull` | `db pull` overwrites entire schema.prisma including manual annotations (@@map, @map, relations, comments, indexes) -- destroys existing work |
| Custom Zod generation | `zod-prisma-types` or `prisma-zod-generator` | Prisma generators produce generic Zod schemas; existing schemas have hand-written business logic (.min(), .positive(), .describe(), enums) that generators cannot reproduce |
| `diff` npm package | Custom line-by-line comparison | `diff` handles edge cases (whitespace, trailing newlines, context lines) and provides structured output |
| `chalk` | `picocolors` | picocolors is smaller but chalk is more readable API and widely known; only used in one script |
| Custom arg parsing | `commander` or `yargs` | Only 2 flags (--dry-run, --entity); `process.argv` parsing is sufficient, no library needed |
| `fetch` (native) | `undici` | Native fetch available in Node 20+, simpler for single HTTP calls. Either works since both are available. |

**Installation:**
```bash
cd objetiva-sync-gateway
npm install diff chalk
npm install --save-dev @types/diff
```

## Architecture Patterns

### Recommended Project Structure
```
objetiva-sync-gateway/
  scripts/
    regenerate-schemas.ts       # CLI entry point
  src/
    codegen/
      index.ts                  # Main orchestrator (fetchSchemas, generateAll, writeDiffs)
      prisma-generator.ts       # Generate Prisma model text from TableSchema
      zod-generator.ts          # Generate Zod schema text from TableSchema
      diff-display.ts           # Format and display colored diffs
      types.ts                  # CodegenResult, DiffResult interfaces
  package.json                  # Add "regenerate-schemas" script
```

### Pattern 1: CLI Entry Point as Standalone Script
**What:** A standalone TypeScript script that parses args, calls the codegen module, and handles process exit
**When to use:** For the `npm run regenerate-schemas` command
**Example:**
```typescript
// scripts/regenerate-schemas.ts
import { regenerateSchemas } from '../src/codegen/index.js';

const args = process.argv.slice(2);
const dryRun = args.includes('--dry-run');
const entityIndex = args.indexOf('--entity');
const entity = entityIndex !== -1 ? args[entityIndex + 1] : undefined;

async function main() {
  try {
    const result = await regenerateSchemas({ dryRun, entity });
    if (result.hasChanges) {
      console.log(`\nRegeneration complete. ${result.filesWritten} files updated.`);
    } else {
      console.log(`\nValidated ${result.entitiesChecked} entities, no changes needed.`);
    }
    process.exit(0);
  } catch (error) {
    console.error(`\nE001: ${error.message}`);
    process.exit(1);
  }
}

main();
```

**Confidence:** HIGH -- standard Node.js CLI pattern, matches existing scripts/ directory convention

### Pattern 2: Fetch Schema from Gateway API
**What:** HTTP call to the Phase 2 endpoint to get normalized schema metadata per entity
**When to use:** To get current PostgreSQL schema without direct database access from CLI
**Example:**
```typescript
// src/codegen/index.ts
import { getSyncEntities } from '../config/entities.js';

interface SchemaResponse {
  entity: string;
  columns: ColumnMetadata[];
  constraints: ConstraintMetadata[];
}

async function fetchEntitySchema(
  gatewayUrl: string,
  token: string,
  entity: string
): Promise<SchemaResponse> {
  const response = await fetch(`${gatewayUrl}/api/schemas/${entity}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    throw new Error(
      `Failed to fetch schema for ${entity}: ${response.status} - ${body.error || 'Unknown error'}`
    );
  }
  return response.json();
}
```

**Confidence:** HIGH -- reuses Phase 2 endpoint, standard fetch pattern

### Pattern 3: Prisma Schema Generation from Introspection Metadata
**What:** Convert TableSchema metadata into Prisma model text preserving existing annotations
**When to use:** Generating the Prisma model block for each entity
**Example:**
```typescript
// src/codegen/prisma-generator.ts

// Map from normalized introspection types to Prisma types
const PRISMA_TYPE_MAP: Record<string, string> = {
  'text': 'String',
  'varchar': 'String',
  'char': 'String',
  'int': 'Int',
  'float': 'Float',
  'decimal': 'Decimal',
  'boolean': 'Boolean',
  'timestamp': 'DateTime',
  'date': 'DateTime',
  'time': 'DateTime',
  'jsonb': 'Json',
  'uuid': 'String',
  'array': 'String[]',  // Default to String array, refine per column
};

function generatePrismaField(col: ColumnMetadata): string {
  const prismaType = PRISMA_TYPE_MAP[col.data_type] || 'String';
  const nullable = col.is_nullable ? '?' : '';
  const dbAnnotation = getDbAnnotation(col);
  const defaultAnnotation = getDefaultAnnotation(col);

  return `  ${col.column_name} ${prismaType}${nullable}${defaultAnnotation}${dbAnnotation}`;
}
```

**Confidence:** MEDIUM -- type mapping needs careful validation against existing schema; the existing Prisma schema has rich annotations (@db.Text, @db.Decimal(10,2), @db.Timestamp(6), @db.JsonB, @db.Timestamptz) that must be reproduced from introspection data

### Pattern 4: Zod Schema Generation from Introspection Metadata
**What:** Convert TableSchema metadata into Zod schema code with correct type validators
**When to use:** Generating per-entity Zod schema files
**Example:**
```typescript
// src/codegen/zod-generator.ts

// Map from normalized introspection types to Zod validators
const ZOD_TYPE_MAP: Record<string, string> = {
  'text': 'z.string()',
  'varchar': 'z.string()',
  'char': 'z.string()',
  'int': 'z.number().int()',
  'float': 'z.number()',
  'decimal': 'z.number()',
  'boolean': 'z.boolean()',
  'timestamp': 'z.string().datetime().or(z.date())',
  'date': 'z.string().date().or(z.date())',
  'jsonb': 'z.record(z.any())',
  'uuid': 'z.string().uuid()',
  'array': 'z.array(z.string())',
};

function generateZodField(col: ColumnMetadata): string {
  const baseType = ZOD_TYPE_MAP[col.data_type] || 'z.string()';
  const optional = col.is_nullable ? '.optional()' : '';
  const hasDefault = col.default_value !== null;

  // Fields with defaults and nullable should be optional in input schemas
  return `  ${col.column_name}: ${baseType}${optional}`;
}
```

**Confidence:** MEDIUM -- Zod type mapping is straightforward, but existing schemas have hand-written refinements (.min(), .positive(), .describe()) that generated schemas should NOT include (those are business logic, not database structure)

### Pattern 5: Structured Diff with Color Output
**What:** Compare existing file content with generated content, show colored diff
**When to use:** Before writing any file, to show what changed
**Example:**
```typescript
// src/codegen/diff-display.ts
import { structuredPatch } from 'diff';
import chalk from 'chalk';

interface DiffResult {
  fileName: string;
  hasChanges: boolean;
  summary: { added: number; removed: number; modified: number };
  hunks: Array<{ oldStart: number; newStart: number; lines: string[] }>;
}

function computeDiff(fileName: string, oldContent: string, newContent: string): DiffResult {
  const patch = structuredPatch(fileName, fileName, oldContent, newContent, '', '', { context: 3 });

  let added = 0, removed = 0;
  for (const hunk of patch.hunks) {
    for (const line of hunk.lines) {
      if (line.startsWith('+')) added++;
      if (line.startsWith('-')) removed++;
    }
  }

  return {
    fileName,
    hasChanges: patch.hunks.length > 0,
    summary: { added, removed, modified: Math.min(added, removed) },
    hunks: patch.hunks,
  };
}

function displayDiff(diff: DiffResult): void {
  if (!diff.hasChanges) return;

  console.log(chalk.bold(`\n--- ${diff.fileName}`));
  console.log(chalk.yellow(`  Added: ${diff.summary.added}, Removed: ${diff.summary.removed}`));

  for (const hunk of diff.hunks) {
    console.log(chalk.cyan(`@@ -${hunk.oldStart} +${hunk.newStart} @@`));
    for (const line of hunk.lines) {
      if (line.startsWith('+')) console.log(chalk.green(line));
      else if (line.startsWith('-')) console.log(chalk.red(line));
      else console.log(line);
    }
  }
}
```

**Confidence:** HIGH -- `diff` package's structuredPatch API verified via npm documentation

### Pattern 6: Post-Generation Prisma Client Regeneration
**What:** After updating schema.prisma, run `prisma generate` to regenerate the Prisma Client
**When to use:** Automatically after schema.prisma file is written (not in dry-run mode)
**Example:**
```typescript
// src/codegen/index.ts
import { execSync } from 'node:child_process';

function runPrismaGenerate(): void {
  console.log(chalk.cyan('\nRunning prisma generate...'));
  try {
    execSync('npx prisma generate', {
      cwd: process.cwd(),
      stdio: 'pipe',
    });
    console.log(chalk.green('Prisma Client regenerated successfully.'));
  } catch (error) {
    throw new Error(
      `E003: prisma generate failed. ${error instanceof Error ? error.message : String(error)}`
    );
  }
}
```

**Confidence:** HIGH -- standard pattern, `prisma generate` is documented CLI command

### Anti-Patterns to Avoid
- **Using `prisma db pull` directly:** Would overwrite the entire schema.prisma including all manual annotations (@@map, @map, comments, indexes, relations, @db.* decorators). The existing schema has extensive manual work.
- **Using Prisma generator plugins for Zod:** `zod-prisma-types` and `prisma-zod-generator` produce generic Zod schemas. The existing hand-written schemas have business-specific validations (.min(), .positive(), .describe(), .enum()) that generators cannot reproduce. The generated schemas should reflect DATABASE structure (types + nullability), not business rules.
- **Generating the entire schema.prisma from scratch:** The generator/datasource blocks, relations, @@map directives, and indexes are structural. Only the model field definitions should be updated from introspection.
- **Interactive prompts in CLI:** Context decisions specify non-interactive: diff shown, files written (or not in dry-run). No confirmation prompts.
- **Fetching directly from database:** CLI should use the gateway API endpoint (Phase 2), not connect to PostgreSQL directly. This maintains the architecture boundary (gateway owns the database).

## Don't Hand-Roll

Problems that look simple but have existing solutions:

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Text diffing | Custom line comparison | `diff` npm package (structuredPatch) | Handles edge cases: trailing newlines, whitespace, context windows, hunk boundaries |
| Terminal colors | ANSI escape sequences | `chalk` | Cross-platform, color level detection, chainable API |
| Prisma Client regen | Custom TS compilation | `npx prisma generate` via execSync | Prisma's own toolchain handles all client generation complexity |
| JWT authentication for API calls | Custom HTTP auth | Reuse gateway's auth endpoint pattern from api-client | Auth flow already established in codebase |

**Key insight:** The code generation itself (Prisma model text, Zod schema text) MUST be custom because the output format is domain-specific. But the surrounding infrastructure (diffing, colors, process management) should use established libraries.

## Common Pitfalls

### Pitfall 1: Overwriting Manual Prisma Annotations
**What goes wrong:** Regenerated schema.prisma loses `@@map("table_name")`, `@map("column_name")`, `@db.Text`, `@db.Decimal(10,2)`, `@db.Timestamp(6)`, `@db.JsonB`, `@db.Timestamptz`, relation directives, and index definitions.
**Why it happens:** Naive code generation only emits field names and types without preserving decorators.
**How to avoid:** The Prisma generator must map introspection metadata back to Prisma-specific decorators. For example: `data_type: 'text'` -> `String @db.Text`, `data_type: 'decimal'` with precision -> `Decimal @db.Decimal(p,s)`, `data_type: 'timestamp'` -> `DateTime @db.Timestamp(6)`. The mapping must be explicit and tested.
**Warning signs:** Generated schema differs from original in @db.* annotations; `prisma generate` or `prisma db push` reports drift.

### Pitfall 2: BigInt vs Int Field Mapping
**What goes wrong:** PostgreSQL `bigint` columns (like `id`) are mapped to Prisma `Int` instead of `BigInt`.
**Why it happens:** The introspection type normalizer maps `bigint` to `int` (Phase 1 decision). But Prisma distinguishes `Int` (32-bit) from `BigInt` (64-bit).
**How to avoid:** The Prisma generator must check the raw PostgreSQL type (from introspection data) and map `bigint` -> Prisma `BigInt`, `integer` -> Prisma `Int`, `smallint` -> Prisma `Int`. This requires the generator to look at the original data_type, not just the normalized one.
**Warning signs:** `id` fields generated as `Int` instead of `BigInt`; Prisma Client type errors on ID operations.

### Pitfall 3: Missing Relation Directives in Generated Schema
**What goes wrong:** Generated Prisma schema omits `@relation(fields: [...], references: [...])` directives and relation field declarations.
**Why it happens:** Introspection returns foreign key constraints but not Prisma's relation syntax. Prisma relations require both a scalar field (e.g., `comprobante_id BigInt?`) AND a relation field (e.g., `comprobante ComprobanteCabecera? @relation(...)`).
**How to avoid:** Parse FK constraints from introspection data. For each FK: generate the scalar field AND a relation field with proper `@relation` directive. Also generate the reverse relation (e.g., `detalles ComprobanteDetalle[]` on `ComprobanteCabecera`).
**Warning signs:** `prisma generate` fails with "relation field missing" errors; FK constraints exist in DB but not in schema.

### Pitfall 4: @map Column Name Discrepancy
**What goes wrong:** Some Prisma fields use `@map("db_column_name")` where the Prisma field name differs from the database column name (e.g., `operacion @map("comprobante_operacion")`).
**How to avoid:** The introspection data returns the actual database column names. The generator needs a mapping table (or heuristic) to determine when to use `@map`. For Phase 3, consider preserving the existing field-to-column mappings from the current schema.prisma rather than inferring them from scratch.
**Warning signs:** Prisma field names don't match existing codebase usage; IngestionService calls break.

### Pitfall 5: Zod Schema Overwrites Business Logic
**What goes wrong:** Generated Zod schemas replace hand-written business validations like `.min(1, 'ERP codigo es requerido')`, `.positive()`, `.describe('...')`, `.enum(['producto', 'servicio'])`.
**Why it happens:** The generator only knows database types and nullability; business rules live in hand-written schemas.
**How to avoid:** Generate Zod schemas that reflect DATABASE structure only (types + nullability + defaults). Write generated schemas to separate files (e.g., `shared/schemas/generated/articulos.generated.ts`) so hand-written schemas in `shared/schemas/articulos.ts` can import and extend them. Alternatively, generate "base" schemas and let hand-written schemas override fields.
**Warning signs:** Business validation rules lost after regeneration; sync pipeline accepts invalid data.

### Pitfall 6: chalk v5 ESM-Only Import Issues
**What goes wrong:** `import chalk from 'chalk'` fails or produces unexpected results in the build.
**Why it happens:** chalk v5 is ESM-only (no CommonJS). The gateway project uses `"type": "module"` so this should work, but tsx execution of scripts may have edge cases.
**How to avoid:** Verify the gateway project's module type is ESM (`"type": "module"` in package.json -- confirmed). Use `import chalk from 'chalk'` directly. Test script execution with `tsx scripts/regenerate-schemas.ts`.
**Warning signs:** "ERR_REQUIRE_ESM" or "Cannot find module" errors when running the script.

### Pitfall 7: Gateway Authentication for Local API Calls
**What goes wrong:** CLI script cannot authenticate with the gateway's `/api/schemas/:entity` endpoint because it requires a JWT token.
**Why it happens:** The gateway uses JWT authentication for all API endpoints. The CLI needs a valid token.
**How to avoid:** The CLI must first call `POST /auth/login` with credentials (from environment variables: SYNC_USERNAME, SYNC_PASSWORD) to get a JWT token, then use that token for schema requests. This matches the existing api-client pattern in objetiva-sync.
**Warning signs:** 401 Unauthorized responses from schema endpoint.

### Pitfall 8: Partial File Write on Error
**What goes wrong:** CLI updates schema.prisma but crashes before writing Zod schemas, leaving files in inconsistent state.
**Why it happens:** Sequential file writing without atomicity.
**How to avoid:** Per context decisions, this is "all or nothing" -- collect ALL generated content first, compute ALL diffs, then write ALL files in one batch. If any generation step fails, write nothing. This is already a locked decision from CONTEXT.md.
**Warning signs:** Some files updated, others stale; `prisma generate` fails because schema is out of sync with Zod.

## Code Examples

### PostgreSQL Type to Prisma Type Mapping (Complete)
```typescript
// Source: Derived from existing schema.prisma analysis
// Must handle all types present in the current 4-entity schema

interface PrismaFieldConfig {
  prismaType: string;
  dbAnnotation?: string;  // @db.Text, @db.Decimal(10,2), etc.
}

function mapToPrismaType(col: ColumnMetadata): PrismaFieldConfig {
  // The introspection normalizes types (Phase 1).
  // We need to map back to precise Prisma types.

  switch (col.data_type) {
    case 'text':
      return { prismaType: 'String', dbAnnotation: '@db.Text' };

    case 'int':
      // Check if original type was bigint (id columns, FK references)
      // Need ordinal_position=1 heuristic or column_name check
      // IMPORTANT: This is the BigInt pitfall - needs careful handling
      return { prismaType: 'Int' };  // Default to Int, override for known BigInt columns

    case 'decimal':
      // Existing schema uses @db.Decimal(10,2), @db.Decimal(12,2), @db.Decimal(12,4), etc.
      // character_maximum_length won't help, need numeric_precision and numeric_scale
      return { prismaType: 'Decimal', dbAnnotation: '@db.Decimal(10, 2)' }; // parameterized

    case 'boolean':
      return { prismaType: 'Boolean' };

    case 'timestamp':
      return { prismaType: 'DateTime', dbAnnotation: '@db.Timestamp(6)' };

    case 'jsonb':
      return { prismaType: 'Json', dbAnnotation: '@db.JsonB' };

    case 'array':
      return { prismaType: 'String[]', dbAnnotation: '@db.Text' };

    default:
      return { prismaType: 'String' };
  }
}
```

### PostgreSQL Type to Zod Type Mapping (Complete)
```typescript
// Source: Derived from existing shared/schemas analysis
// Database-structure-only schemas (no business logic)

function mapToZodType(col: ColumnMetadata): string {
  const base = (() => {
    switch (col.data_type) {
      case 'text':
      case 'varchar':
      case 'char':
      case 'uuid':
        return 'z.string()';
      case 'int':
        return 'z.number().int()';
      case 'float':
        return 'z.number()';
      case 'decimal':
        return 'z.number()';
      case 'boolean':
        return 'z.boolean()';
      case 'timestamp':
      case 'date':
      case 'time':
        return 'z.coerce.date()';
      case 'jsonb':
        return 'z.record(z.any())';
      case 'array':
        return 'z.array(z.string())';
      default:
        return 'z.string()';
    }
  })();

  // Apply nullability
  if (col.is_nullable) {
    return `${base}.optional().nullable()`;
  }
  return base;
}
```

### Complete Regeneration Orchestrator
```typescript
// Source: Combines all patterns from this research
// src/codegen/index.ts

import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { execSync } from 'node:child_process';
import { resolve } from 'node:path';
import chalk from 'chalk';
import { computeDiff, displayDiff } from './diff-display.js';
import { generatePrismaSchema } from './prisma-generator.js';
import { generateZodSchema } from './zod-generator.js';

interface RegenerateOptions {
  dryRun: boolean;
  entity?: string;
}

interface RegenerateResult {
  hasChanges: boolean;
  filesWritten: number;
  entitiesChecked: number;
}

export async function regenerateSchemas(
  options: RegenerateOptions
): Promise<RegenerateResult> {
  // Pre-flight checks
  const gatewayUrl = process.env.GATEWAY_URL;
  if (!gatewayUrl) {
    throw new Error('E001: GATEWAY_URL environment variable not set.');
  }

  // 1. Authenticate with gateway
  const token = await authenticate(gatewayUrl);

  // 2. Determine entities to process
  const entities = options.entity
    ? [options.entity]
    : getSyncEntities();

  // 3. Fetch all schemas (fail fast on any error)
  const schemas = [];
  for (const entity of entities) {
    console.log(chalk.cyan(`Fetching schema for ${entity}...`));
    const schema = await fetchEntitySchema(gatewayUrl, token, entity);
    schemas.push(schema);
  }

  // 4. Generate all content
  const prismaContent = generatePrismaSchema(schemas);
  const zodFiles = schemas.map(s => ({
    entity: s.entity,
    content: generateZodSchema(s),
    path: resolve('shared/schemas/generated', `${s.entity}.generated.ts`),
  }));

  // 5. Compute all diffs
  const diffs = [];

  const prismaPath = resolve('prisma/schema.prisma');
  const existingPrisma = existsSync(prismaPath)
    ? readFileSync(prismaPath, 'utf-8')
    : '';
  diffs.push(computeDiff('prisma/schema.prisma', existingPrisma, prismaContent));

  for (const zodFile of zodFiles) {
    const existing = existsSync(zodFile.path)
      ? readFileSync(zodFile.path, 'utf-8')
      : '';
    diffs.push(computeDiff(zodFile.path, existing, zodFile.content));
  }

  // 6. Display diffs (sequential per entity, per context decision)
  const changedDiffs = diffs.filter(d => d.hasChanges);

  if (changedDiffs.length === 0) {
    return { hasChanges: false, filesWritten: 0, entitiesChecked: entities.length };
  }

  for (const diff of changedDiffs) {
    displayDiff(diff);
  }

  // 7. Write files (unless dry-run)
  if (options.dryRun) {
    console.log(chalk.yellow('\n--dry-run: No files were modified.'));
    return { hasChanges: true, filesWritten: 0, entitiesChecked: entities.length };
  }

  writeFileSync(prismaPath, prismaContent, 'utf-8');
  for (const zodFile of zodFiles) {
    writeFileSync(zodFile.path, zodFile.content, 'utf-8');
  }

  // 8. Run prisma generate (CLI-03 requirement)
  runPrismaGenerate();

  return { hasChanges: true, filesWritten: changedDiffs.length, entitiesChecked: entities.length };
}
```

### npm Script Configuration
```json
// package.json addition for objetiva-sync-gateway
{
  "scripts": {
    "regenerate-schemas": "tsx scripts/regenerate-schemas.ts",
    "regenerate-schemas:dry-run": "tsx scripts/regenerate-schemas.ts --dry-run"
  }
}
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| `prisma db pull` for full schema regen | Custom code generation from API metadata | This project (Phase 3) | Preserves manual annotations, relations, indexes |
| `zod-prisma-types` generator | Custom Zod generation from introspection | This project (Phase 3) | Separates database structure from business validation |
| `zod-prisma-types` (Chris Hoermann) | `prisma-zod-generator` (Omar Dulaimi) | 2024-2025 | zod-prisma-types is in limited maintenance mode; author recommends prisma-zod-generator. Neither is suitable for this project due to need for custom output. |
| chalk v4 (CommonJS + ESM) | chalk v5 (ESM-only) | chalk v5.0.0 (2022) | Must use ESM import; gateway project already uses `"type": "module"` |
| `diff` v5 | `diff` v8 | 2024-2025 | Current major version, structuredPatch API unchanged |

**Deprecated/outdated:**
- `zod-prisma-types`: In limited maintenance mode. Author recommends `prisma-zod-generator`. Neither is used in this project.
- `zod-prisma` (CarterGrimmeisen): Older, less maintained alternative. Not applicable here.

## Open Questions

1. **Generated vs. Hand-Written Schema Coexistence Strategy**
   - What we know: Existing Zod schemas in `shared/schemas/` have business logic (.min(), .positive(), .describe(), .enum()). Generated schemas will only reflect database structure (types + nullability).
   - What's unclear: Whether generated schemas should be in separate files (e.g., `shared/schemas/generated/*.generated.ts`) that hand-written schemas import, OR whether generated schemas should be the ONLY schemas (replacing hand-written ones).
   - Recommendation: Use **separate generated files** (`shared/schemas/generated/`). Hand-written schemas can import the generated base and extend. This preserves business logic across regeneration cycles. The planner should decide the exact coexistence pattern.

2. **BigInt Column Detection Without Raw PostgreSQL Type**
   - What we know: Phase 1's type normalizer maps `bigint` -> `int`. But Prisma needs `BigInt` for bigint columns.
   - What's unclear: Whether the introspection API response includes enough data to distinguish `bigint` from `integer`. The normalized `data_type` field loses this distinction.
   - Recommendation: Either (a) modify the introspection service to include `udt_name` or the raw PostgreSQL type alongside the normalized type, OR (b) use a heuristic (columns named `id` or ending in `_id` with `int` type are likely `BigInt`), OR (c) maintain a known-column-type override map in the codegen config. Option (a) is cleanest but requires Phase 1 modification.

3. **@map Column Name Preservation**
   - What we know: Some Prisma fields use `@map("db_column_name")` where the field name differs from the DB column name (e.g., `operacion @map("comprobante_operacion")` in ComprobanteDetalle).
   - What's unclear: How to detect when a Prisma field name should differ from the database column name.
   - Recommendation: Parse the existing schema.prisma BEFORE regeneration to extract current field-name-to-column-name mappings. Apply these mappings during generation. New columns (not in existing schema) use the database column name directly.

4. **Authentication for Local CLI Calls**
   - What we know: The gateway requires JWT for the schema endpoint. The CLI needs GATEWAY_URL plus credentials.
   - What's unclear: Whether the CLI should use the same SYNC_USERNAME/SYNC_PASSWORD as the objetiva-sync module, or have its own credentials.
   - Recommendation: Reuse SYNC_USERNAME and SYNC_PASSWORD from the gateway's .env file (the CLI runs in the gateway directory). The `POST /auth/login` endpoint returns a JWT. This follows the existing authentication pattern.

## Sources

### Primary (HIGH confidence)
- `/prisma/docs` via Context7 -- `prisma db pull` introspection behavior, CLI reference, generated schema format
- `/chrishoermann/zod-prisma-types` via Context7 -- Generator configuration, useMultipleFiles, field-level Zod customization
- `/omar-dulaimi/prisma-zod-generator` via Context7 -- Generator configuration, JSON config, pureModels, variants
- `/chalk/chalk` via Context7 -- Color API, ESM usage, chainable styles
- Existing codebase files (directly inspected):
  - `objetiva-sync-gateway/prisma/schema.prisma` -- Current Prisma schema with all annotations
  - `objetiva-sync-gateway/shared/schemas/articulos.ts` -- Hand-written Zod schema with business logic
  - `objetiva-sync-gateway/src/services/introspection.ts` -- IntrospectionService from Phase 1
  - `objetiva-sync-gateway/src/types/schema.ts` -- TableSchema, ColumnMetadata interfaces
  - `objetiva-sync-gateway/src/config/entities.ts` -- getSyncEntities() configuration
  - `objetiva-sync-gateway/package.json` -- Dependencies and scripts

### Secondary (MEDIUM confidence)
- [diff npm package](https://www.npmjs.com/package/diff) -- structuredPatch API, version 8.0.x
- [zod-prisma-types npm](https://www.npmjs.com/package/zod-prisma-types) -- Limited maintenance mode notice, recommendation to use prisma-zod-generator
- [prisma-zod-generator npm](https://www.npmjs.com/package/prisma-zod-generator) -- Active maintenance, v2.1.2
- [Snyk diff.structuredPatch usage](https://snyk.io/advisor/npm-package/diff/functions/diff.structuredPatch) -- API usage examples

### Tertiary (LOW confidence)
- WebSearch: "prisma db pull programmatic API" -- confirmed no programmatic API; must use CLI via execSync or shell
- WebSearch: "zod-prisma-types vs prisma-zod-generator" -- confirmed maintenance status and recommendation

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH -- diff and chalk are well-established, verified via Context7 and npm
- Architecture: HIGH -- follows existing gateway patterns, script entry point matches codebase conventions
- Code generation approach: MEDIUM -- custom generation is the right choice but type mapping needs careful validation against existing schema
- Pitfalls: HIGH -- derived from direct codebase analysis, every pitfall references specific existing files
- Open questions: MEDIUM -- BigInt detection and @map preservation need planner decisions

**Research date:** 2026-01-27
**Valid until:** 2026-02-27 (30 days -- stable libraries, custom code generation patterns don't change)
