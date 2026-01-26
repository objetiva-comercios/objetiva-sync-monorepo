# Stack Research: PostgreSQL Schema Introspection & TypeScript Codegen

**Research Date**: 2026-01-26
**Research Type**: Project Research - Stack dimension
**Milestone Context**: Subsequent milestone - Add schema introspection, validation, and codegen to existing TypeScript sync system

---

## Executive Summary

For a TypeScript sync system that needs PostgreSQL schema introspection, validation, and codegen, the 2025 standard stack centers around **Prisma** as the schema source of truth, with **Zod** for runtime validation and **kysely** or **Drizzle** for type-safe query building. The key insight: PostgreSQL should be the ultimate source of truth, with introspection driving schema updates that regenerate all downstream artifacts (Prisma schema, Zod validators, TypeScript types).

**Core Value Proposition**: PostgreSQL schema changes → Introspection → Regenerated Prisma/Zod/Types → Breaking changes caught at compile/validation time.

---

## 1. PostgreSQL Schema Introspection

### Recommended: Prisma Introspection (Confidence: 95%)

**Package**: `prisma@^5.22.0` (current as of Jan 2025)
**Command**: `prisma db pull`

**Why Prisma Introspection**:
- **Native PostgreSQL support**: Prisma introspection is battle-tested against PostgreSQL, handling edge cases like enums, arrays, jsonb, composite types
- **Bidirectional workflow**: Supports both schema-first (introspection) and code-first (migrations) approaches
- **Rich type mapping**: Correctly maps PostgreSQL types to Prisma schema language including `@db.Text`, `@db.Decimal(12,2)`, `@db.JsonB`
- **Relation inference**: Automatically detects foreign keys and generates proper Prisma relations
- **Index preservation**: Captures indexes, unique constraints, compound keys
- **Already in stack**: Your gateway already uses Prisma 5.22.0, zero new dependencies

**How it works**:
1. `prisma db pull` connects to PostgreSQL via `DATABASE_URL`
2. Reads `information_schema` and `pg_catalog` system tables
3. Generates/updates `schema.prisma` file with current database state
4. Runs `prisma generate` to update `@prisma/client` with new types

**Limitations**:
- Cannot introspect views as models (treated as tables)
- Multi-schema support requires manual configuration
- Custom PostgreSQL types may need manual `@db.` annotations

**When to use**: This should be your PRIMARY introspection tool. Run `prisma db pull` whenever PostgreSQL schema changes are detected.

---

### Alternative: pg-structure (Confidence: 70%)

**Package**: `pg-structure@^9.0.0`

**Why consider it**:
- **Deeper introspection**: Access to more PostgreSQL metadata than Prisma exposes (comments, triggers, functions)
- **Schema comparison**: Built-in schema diffing capabilities
- **Custom tooling**: If you need to build custom codegen beyond Prisma's capabilities

**Why NOT primary choice**:
- **Extra dependency**: Adds another tool when Prisma already does 90% of what you need
- **Manual codegen**: Requires writing custom templates to generate Prisma/Zod schemas
- **No standard workflow**: You'd be building a custom pipeline vs. using Prisma's proven introspection flow

**When to use**: Only if you need deep PostgreSQL metadata that Prisma doesn't expose (e.g., reading table/column comments for documentation generation).

---

### NOT Recommended: node-postgres direct queries

**Why avoid**:
- Requires writing manual SQL against `information_schema`
- High maintenance burden as PostgreSQL versions evolve
- No built-in type mapping to TypeScript/Prisma
- Reinvents the wheel that Prisma already solves

---

## 2. Zod Schema Generation from Prisma

### Recommended: zod-prisma-types (Confidence: 90%)

**Package**: `zod-prisma-types@^3.1.8`
**Generator**: Add to `schema.prisma`

```prisma
generator zod {
  provider = "zod-prisma-types"
  output   = "../src/generated/zod"
}
```

**Why zod-prisma-types**:
- **Most mature**: 3+ years in production, handles complex Prisma schemas
- **Comprehensive mapping**: Generates Zod schemas for ALL Prisma types including:
  - `Decimal` → `z.number()` or `z.string()` with custom refinement
  - `DateTime` → `z.date()` or `z.string().datetime()`
  - `Json` → `z.record()` or custom schema
  - Arrays → `z.array()`
  - Relations → Separate schemas with nesting support
- **Validation modes**: Generates schemas for create, update, findUnique (respects optionality)
- **Custom validators**: Supports `/// @zod.string().email()` comments in Prisma schema
- **Enum support**: Automatically generates Zod enums from Prisma enums

**Generated structure**:
```typescript
// Auto-generated from Prisma schema
export const ArticuloSchema = z.object({
  id: z.bigint(),
  erp_codigo: z.string(),
  erp_nombre: z.string(),
  precio: z.number().nullable(),
  // ... all fields
});

export const ArticuloCreateInputSchema = z.object({
  // Only fields allowed in create
});

export const ArticuloUpdateInputSchema = z.object({
  // All fields optional for updates
});
```

**Workflow integration**:
1. `prisma db pull` → Updates `schema.prisma`
2. `prisma generate` → Runs zod-prisma-types generator
3. Import generated Zod schemas in validation layer

**Limitations**:
- Large schemas generate MANY files (can be 1000+ LOC for complex models)
- Some Prisma types require custom mappings (e.g., `Decimal` as string vs number)

---

### Alternative: prisma-zod-generator (Confidence: 75%)

**Package**: `prisma-zod-generator@^0.8.13`

**Differences from zod-prisma-types**:
- Lighter output, fewer generated files
- Less comprehensive validation schemas
- May not handle all edge cases (like Decimal precision)

**When to use**: If zod-prisma-types output is too verbose for your needs.

---

### Alternative: Manual Zod schemas (Confidence: 50%)

**Why consider**:
- Full control over validation logic
- Can add business rules that aren't in database schema

**Why NOT recommended**:
- High maintenance: Schema changes require manual Zod updates
- Drift risk: Zod schemas can get out of sync with Prisma/DB
- Defeats purpose of "PostgreSQL as source of truth"

**When to use**: Only for complex business validation that can't be expressed in Prisma schema (e.g., "price must be > cost", cross-field validations).

---

## 3. Type-Safe Query Building

Your current stack uses Prisma Client for queries. For enhanced type safety and query validation, consider:

### Option A: Continue with Prisma Client (Confidence: 85%)

**Why stick with Prisma**:
- Already integrated (`@prisma/client@^5.22.0`)
- Excellent TypeScript types auto-generated
- Type-safe queries without SQL strings
- Handles relations elegantly

**Query validation**: Prisma validates queries at runtime against database schema. Type errors caught at compile time.

**Example**:
```typescript
// Type error if 'invalid_field' doesn't exist
await prisma.articulo.findMany({
  where: { invalid_field: 'x' } // TS error
});
```

**Limitation**: No compile-time validation against live PostgreSQL schema. If column is removed from DB but Prisma schema not regenerated, runtime error occurs.

---

### Option B: Add Kysely for raw SQL (Confidence: 75%)

**Package**: `kysely@^0.27.0` + `kysely-codegen@^0.16.0`

**Why Kysely**:
- **Direct PostgreSQL introspection**: `kysely-codegen` reads PostgreSQL schema, generates TypeScript types
- **Type-safe SQL**: Write SQL with full autocomplete and type checking
- **No ORM overhead**: Closer to SQL for complex queries
- **Complement to Prisma**: Use Prisma for simple CRUD, Kysely for complex queries

**Setup**:
```bash
kysely-codegen --out-file src/generated/kysely.ts
```

**Generated types**:
```typescript
// Auto-generated from PostgreSQL
export interface Database {
  articulos: ArticulosTable;
  comprobantes_cabecera: ComprobantesCabeceraTable;
  // ...
}
```

**When to use**: If you have complex SQL queries that are awkward in Prisma, OR if you want compile-time guarantees against live PostgreSQL schema (not just Prisma schema).

---

### Option C: Drizzle ORM (Confidence: 70%)

**Package**: `drizzle-orm@^0.36.4` (already in objetiva-sync!)

**Why consider**:
- You're already using Drizzle in `objetiva-sync` for SQLite
- Could standardize on Drizzle across both services
- Excellent TypeScript inference
- `drizzle-kit introspect` can pull from PostgreSQL

**Why NOT recommended for gateway**:
- Gateway is already Prisma-based; rewrite would be significant
- Drizzle introspection less mature than Prisma's
- Better to maintain consistency: Drizzle for sync service, Prisma for gateway

---

## 4. Schema Comparison & Drift Detection

### Recommended: Prisma Migrate Diff (Confidence: 85%)

**Command**: `prisma migrate diff`

**Why Prisma Migrate**:
- Built-in to Prisma CLI
- Compares Prisma schema vs. live database
- Generates migration SQL
- Can detect:
  - Missing tables/columns
  - Type mismatches
  - Index differences
  - Constraint changes

**Usage for drift detection**:
```bash
# Compare local schema.prisma vs. production DB
prisma migrate diff \
  --from-schema-datamodel prisma/schema.prisma \
  --to-schema-datasource $DATABASE_URL \
  --script
```

**Output**: SQL script showing differences (or empty if in sync)

**Integration strategy**:
1. After `prisma db pull`, run `prisma migrate diff` to verify sync
2. In CI/CD, fail build if drift detected
3. Alert if production schema diverges from committed `schema.prisma`

---

### Alternative: pg-diff (Confidence: 60%)

**Package**: `@databases/pg-diff@^1.0.0`

**Why consider**:
- Database-to-database comparison (doesn't require Prisma schema)
- Can compare two PostgreSQL databases directly

**Why NOT primary choice**:
- Another dependency
- Prisma diff is more integrated with your workflow

**When to use**: If comparing two live PostgreSQL instances (e.g., staging vs. production schema drift).

---

## 5. TypeScript Codegen Patterns

### Recommended Pattern: Prisma as Single Source of Truth

**Workflow**:
1. **PostgreSQL schema changes** (manually or via migrations)
2. **Introspect**: `prisma db pull` → Updates `schema.prisma`
3. **Generate artifacts**:
   - `prisma generate` → Updates `@prisma/client` types
   - `prisma generate` (zod generator) → Updates Zod schemas
   - Optional: `kysely-codegen` → Updates Kysely types
4. **Compile TypeScript** → Catches type errors if code uses removed fields
5. **Runtime validation** → Zod schemas validate incoming data against new schema

**File structure**:
```
src/
  generated/
    prisma/           # @prisma/client output
    zod/              # zod-prisma-types output
      index.ts
      articulo.ts
      comprobante.ts
    kysely.ts         # Optional: kysely-codegen output
  routes/
    articulos.ts      # Imports from generated/
```

**Key principles**:
- **Never hand-edit generated files**: Always regenerate from schema
- **Commit generated files**: So team sees breaking changes in PRs
- **CI validation**: Build fails if generated files are out of sync

---

### NOT Recommended: Multiple competing sources of truth

**Anti-pattern to avoid**:
- Prisma schema + separate hand-written Zod schemas
- Kysely types + Prisma types with divergence
- SQL migrations that don't update Prisma schema

**Why avoid**: Leads to drift, validation errors, runtime surprises.

---

## 6. Query Validation Against Live Schema

### Runtime Validation Strategy

**Problem**: Even with perfect introspection, there's a window where:
1. PostgreSQL schema changes (column added/removed)
2. App hasn't regenerated types yet
3. Queries fail at runtime

**Solution layers**:

1. **Prisma Client catches most issues**:
   - Invalid column names → Runtime error with helpful message
   - Type mismatches → Caught by Prisma's internal validation

2. **Zod validates input data**:
   ```typescript
   // Route handler
   const parseResult = ArticuloCreateInputSchema.safeParse(req.body);
   if (!parseResult.success) {
     return reply.status(400).send({
       error: 'Validation failed',
       details: parseResult.error
     });
   }
   ```

3. **Schema version checking** (custom):
   - Store schema hash/version in database
   - App checks on startup if its generated types match DB version
   - Refuse to start if mismatch detected

**Example schema version check**:
```typescript
// migrations/schema_version.sql
CREATE TABLE schema_metadata (
  version TEXT PRIMARY KEY,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

// src/schema-validator.ts
async function validateSchemaVersion() {
  const dbVersion = await prisma.$queryRaw`
    SELECT version FROM schema_metadata LIMIT 1
  `;
  const codeVersion = process.env.SCHEMA_VERSION; // Set during build

  if (dbVersion !== codeVersion) {
    throw new Error(
      `Schema mismatch! DB: ${dbVersion}, Code: ${codeVersion}. ` +
      `Run 'prisma db pull && prisma generate' and rebuild.`
    );
  }
}
```

---

## 7. Package Versions & Installation

### Core Dependencies

```json
{
  "dependencies": {
    "@prisma/client": "^5.22.0",
    "zod": "^3.23.8"
  },
  "devDependencies": {
    "prisma": "^5.22.0",
    "zod-prisma-types": "^3.1.8",
    "kysely": "^0.27.0",           // Optional
    "kysely-codegen": "^0.16.0"    // Optional
  }
}
```

**Note on versions**:
- Prisma 5.22.0 is current as of your gateway's package.json
- Zod 3.23.8 is latest stable (your current version)
- Kysely 0.27+ supports PostgreSQL introspection
- zod-prisma-types 3.x compatible with Prisma 5.x

---

## 8. What NOT to Use & Why

### ❌ TypeORM with TypeScript codegen

**Why avoid**:
- Decorator-based approach less type-safe than Prisma
- Introspection story weaker
- Active development less consistent than Prisma

---

### ❌ Sequelize

**Why avoid**:
- Older ORM with weaker TypeScript support
- Introspection requires third-party tools
- Migration to Prisma would be painful

---

### ❌ Knex.js for type-safe queries

**Why avoid**:
- No built-in TypeScript types
- Requires `@types/knex` which are incomplete
- If you want raw SQL, Kysely is superior

---

### ❌ Custom introspection via pg library

**Why avoid**:
- Reinventing what Prisma does
- High maintenance cost
- Poor type inference

---

### ❌ GraphQL schema as source of truth

**Why avoid**:
- Adds unnecessary layer (GraphQL → Prisma → PostgreSQL)
- Your system is REST/RPC, not GraphQL
- Introspection flow more complex

---

## 9. Confidence Levels Summary

| Component | Tool | Confidence | Rationale |
|-----------|------|------------|-----------|
| **Introspection** | Prisma db pull | 95% | Proven, already in stack, best PostgreSQL support |
| **Zod Generation** | zod-prisma-types | 90% | Most mature generator, handles edge cases |
| **Query Building** | Prisma Client | 85% | Already integrated, good enough for most needs |
| **Drift Detection** | Prisma migrate diff | 85% | Built-in, minimal setup |
| **Alternative SQL** | Kysely | 75% | Excellent tool but adds complexity |
| **Schema Comparison** | pg-structure | 70% | Useful for advanced scenarios only |

---

## 10. Recommended Workflow: PostgreSQL → Code Pipeline

### Step-by-step integration

1. **Setup generators** in `schema.prisma`:
   ```prisma
   generator client {
     provider = "prisma-client-js"
     output   = "../node_modules/@prisma/client"
   }

   generator zod {
     provider = "zod-prisma-types"
     output   = "../src/generated/zod"
   }
   ```

2. **Add npm scripts** to `package.json`:
   ```json
   {
     "scripts": {
       "schema:pull": "prisma db pull",
       "schema:generate": "prisma generate",
       "schema:validate": "prisma migrate diff --from-schema-datamodel prisma/schema.prisma --to-schema-datasource $DATABASE_URL --exit-code",
       "schema:refresh": "npm run schema:pull && npm run schema:generate",
       "prebuild": "npm run schema:validate"
     }
   }
   ```

3. **Development flow**:
   ```bash
   # When PostgreSQL schema changes
   npm run schema:refresh

   # Fix TypeScript errors that appear
   npm run build

   # Commit updated schema.prisma + generated files
   git add prisma/schema.prisma src/generated/
   git commit -m "chore: sync schema from PostgreSQL"
   ```

4. **CI/CD validation**:
   ```yaml
   # .github/workflows/ci.yml
   - name: Validate schema sync
     run: npm run schema:validate

   - name: Check generated files committed
     run: |
       npm run schema:generate
       git diff --exit-code src/generated/
   ```

---

## 11. Addressing Your Specific Use Case

### Current Problem
> Schema changes in PostgreSQL break validation/queries without detection

### Solution Architecture

1. **Detection Layer**:
   - `prisma migrate diff` in CI fails build if schema.prisma out of sync with PostgreSQL
   - Pre-startup schema version check refuses to boot if mismatch

2. **Propagation Layer**:
   - `prisma db pull` captures PostgreSQL changes → `schema.prisma`
   - `prisma generate` propagates to Prisma Client types
   - `zod-prisma-types` propagates to Zod validators

3. **Validation Layer**:
   - Zod schemas validate incoming sync batches from `objetiva-sync`
   - Prisma Client validates queries at runtime
   - TypeScript catches compile-time errors in route handlers

4. **Failure Modes**:
   - PostgreSQL adds column → Next introspection picks it up → Types regenerate → No breakage
   - PostgreSQL removes column → Introspection removes it → TypeScript errors where code uses it → Fix before deploy
   - PostgreSQL changes type → Introspection updates → Zod validation may reject old data format → Handle migration

---

## 12. Migration Strategy for Existing Codebase

Since your gateway already uses Prisma 5.22.0, you're 80% there:

### Phase 1: Add Zod Generation (Low Risk)
```bash
npm install -D zod-prisma-types
# Add generator to schema.prisma
npx prisma generate
```
**Impact**: Zero breaking changes, just adds new generated Zod schemas

### Phase 2: Integrate Zod Validation (Medium Risk)
Replace manual validation with generated Zod schemas in routes:
```typescript
// Before
if (!req.body.erp_codigo || !req.body.erp_nombre) {
  return reply.status(400).send({ error: 'Missing required fields' });
}

// After
const result = ArticuloCreateInputSchema.safeParse(req.body);
if (!result.success) {
  return reply.status(400).send({ error: result.error });
}
```

### Phase 3: Add Drift Detection (Low Risk)
```bash
# Add to package.json scripts
"schema:validate": "prisma migrate diff ..."
```
Run in CI, doesn't affect runtime.

### Phase 4: Schema Version Checking (Medium Risk)
Add runtime schema version validation. Requires coordination with deployment process.

---

## 13. Open Questions for Roadmap Planning

1. **Kysely adoption?**: Do you have complex SQL queries that are painful in Prisma? If yes, budget time for Kysely integration.

2. **Multi-schema support?**: Does your PostgreSQL use multiple schemas beyond `public`? Prisma requires manual configuration.

3. **Schema migration strategy?**:
   - Who owns schema changes? (DBA manually via SQL, or devs via Prisma Migrate?)
   - Do you need bidirectional sync (code → DB) or only introspection (DB → code)?

4. **Downtime tolerance?**: Can app restart when schema changes, or need hot-reload capability?

5. **Monorepo coordination**: Does `objetiva-sync` need same generated types? Consider sharing Prisma schema between packages.

---

## 14. Cost-Benefit Analysis

### Benefits of Full Implementation

- **Compile-time safety**: Breaking schema changes caught in build, not production
- **Reduced validation bugs**: Zod schemas auto-updated with schema, can't get out of sync
- **Faster development**: Autocomplete for all DB fields, no guessing types
- **Confidence in deploys**: CI validates schema sync before merge
- **Documentation**: Generated Zod schemas serve as API contract

### Costs

- **Build complexity**: More codegen steps, larger git diffs
- **Learning curve**: Team must understand Prisma → Zod flow
- **Generated code**: 1000+ LOC of generated files in repo (though should not be hand-edited)
- **Initial setup**: ~1-2 days to integrate and test

**ROI**: High. One prevented production incident from schema mismatch pays for setup cost.

---

## 15. References & Documentation

- **Prisma Introspection**: https://www.prisma.io/docs/concepts/components/introspection
- **zod-prisma-types**: https://github.com/chrishoermann/zod-prisma-types
- **Kysely**: https://kysely.dev/docs/getting-started
- **Prisma Migrate Diff**: https://www.prisma.io/docs/reference/api-reference/command-reference#migrate-diff

---

## Conclusion

**TL;DR Stack for 2025**:
- **Introspection**: Prisma `db pull` (already have it)
- **Zod Generation**: `zod-prisma-types` generator
- **Query Building**: Stick with Prisma Client (optionally add Kysely for complex SQL)
- **Drift Detection**: Prisma `migrate diff` in CI
- **Validation**: Generated Zod schemas at API boundary

This stack is battle-tested, minimally invasive to your existing architecture, and directly addresses the "PostgreSQL as source of truth" requirement.

**Next steps for roadmap**:
1. Add zod-prisma-types generator
2. Create schema refresh scripts
3. Integrate Zod validation in sync batch routes
4. Add CI schema validation
5. (Optional) Evaluate Kysely for complex queries
