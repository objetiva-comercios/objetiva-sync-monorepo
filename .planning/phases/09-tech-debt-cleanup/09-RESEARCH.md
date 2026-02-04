# Phase 9: Tech Debt Cleanup - Research

**Researched:** 2026-02-04
**Domain:** TypeScript compilation, Fastify type system, Prisma ORM, codebase maintenance
**Confidence:** HIGH

## Summary

Phase 9 addresses technical debt accumulated during rapid development of v1.0 and Phase 8. The phase has two distinct domains: (1) fixing TypeScript compilation errors and schema imports in the gateway, and (2) removing development garbage from both modules.

The gateway currently has 46 TypeScript compilation errors stemming from three root causes: **incomplete Prisma schema** (missing 3 of 4 models causes "Property does not exist" errors), **Fastify plugin type mismatches** (FastifyTypeProvider vs FastifyTypeProviderDefault incompatibility), and **manual schema imports** (ingestion service uses hardcoded schemas instead of generated ones). Investigation reveals the schema.prisma file only contains the Articulo model while schema.prisma.backup contains all four models (Articulo, ComprobanteCabecera, ComprobanteDetalle, ComprobantePagos).

Codebase analysis identified 23 development artifacts across both modules: 12 .mjs test scripts in monorepo root, 11 temporary files in gateway root (test scripts, output logs, isolated .md files), and 11 .backup/.bak files throughout the repository. The generated schemas infrastructure exists (shared/schemas/generated/) but the manual schemas (shared/schemas/*.ts) are still being imported by the ingestion service.

**Primary recommendation:** Restore missing Prisma models from backup, configure Fastify without type provider to eliminate plugin type errors, switch ingestion imports to generated schemas, then systematically remove all temporary files and backup artifacts using a comprehensive cleanup script.

## Standard Stack

The technical domains for this phase use established TypeScript/Node.js tooling without additional library requirements.

### Core

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| TypeScript | 5.7.2 | Static type checking | Already in use, compiler errors are blocking deployment |
| Prisma | 5.22.0 | ORM and schema management | Already in use, schema completeness required for type safety |
| Fastify | 4.29.1 | Web framework | Already in use, type configuration affects plugin registration |
| Zod | 3.23.8 | Runtime schema validation | Already in use, generated schemas exist but not imported |

### Supporting

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| Node.js built-in `fs` | - | File system operations | For cleanup scripts to remove temporary files |
| Bash/shell scripting | - | Batch file operations | For finding and removing backup files across modules |

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Manual cleanup | `knip` (unused code detector) | Knip is for dead code removal, not temporary file cleanup |
| Fastify without type provider | `withTypeProvider<TypeBoxTypeProvider>()` | Type provider adds complexity; default types work for current API structure |
| Shell script cleanup | `rimraf` or Node.js cleanup script | Shell script is simpler for file patterns like `*.backup`, `*.bak`, `*.mjs` |

**Installation:**
No new packages required. All necessary tools (tsc, prisma, bash) are already installed.

## Architecture Patterns

### Recommended Project Structure

The codebase already follows best practices for monorepo structure:

```
objetiva-sync-monorepo/
├── objetiva-sync-gateway/        # Gateway module (clean root)
│   ├── prisma/
│   │   └── schema.prisma          # Complete Prisma schema (all 4 models)
│   ├── shared/
│   │   └── schemas/
│   │       ├── generated/         # Auto-generated Zod schemas
│   │       └── index.ts           # Re-exports generated schemas
│   └── src/
│       └── services/
│           └── ingestion.ts       # Import from generated schemas
├── objetiva-sync/                 # Sync service module (clean root)
└── .planning/                     # Planning docs (preserved)
```

No .mjs scripts, .backup files, or isolated .md files in module roots.

### Pattern 1: Fastify Plugin Registration without Type Provider

**What:** Register Fastify plugins using default type inference without explicit type provider configuration.
**When to use:** When not using advanced schema-to-type inference (TypeBox, json-schema-to-ts). Default types work for standard Fastify usage.
**Example:**

```typescript
// Source: https://fastify.dev/docs/latest/Reference/TypeScript/
import Fastify from 'fastify'
import cors from '@fastify/cors'
import jwt from '@fastify/jwt'

const app = Fastify({
  logger: logger as any,
  trustProxy: true
})

// Register plugins without type provider - uses FastifyTypeProviderDefault
await app.register(cors, {
  origin: true,
  credentials: true
})

await app.register(jwt, {
  secret: process.env.JWT_SECRET || 'change-me-in-production',
  sign: { expiresIn: jwtExpiresIn }
})
```

**Why this works:** The type mismatch errors (`FastifyTypeProvider` vs `FastifyTypeProviderDefault`) occur because some parts of the codebase expect a custom type provider while plugins are registered with default types. Removing `.withTypeProvider<>()` calls and using default Fastify types eliminates the incompatibility.

### Pattern 2: Prisma Model Naming with `@@map` for snake_case Tables

**What:** Use PascalCase model names in Prisma schema with `@@map()` to map to snake_case database tables.
**When to use:** Always. Prisma conventions use PascalCase models (Articulo, ComprobanteCabecera) while PostgreSQL tables use snake_case (articulos, comprobantes_cabecera).
**Example:**

```prisma
// Source: https://github.com/prisma/docs/blob/main/content/200-orm/100-prisma-schema/20-data-model/50-database-mapping.mdx
model ComprobanteCabecera {
  id         BigInt  @id @default(autoincrement())
  operacion  String  @db.Text
  formulario String  @db.Text
  numero     String  @db.Text
  // ... other fields

  @@map("comprobantes_cabecera")
}
```

**Key insight:** The generated Prisma Client uses PascalCase model names (e.g., `prisma.comprobanteCabecera`) regardless of the database table name. The current TypeScript errors (`Property 'comprobanteCabecera' does not exist`) occur because the schema.prisma file is incomplete - it only defines the Articulo model.

### Pattern 3: Generated Schema Import Strategy

**What:** Import Zod schemas from auto-generated files, not manual schema definitions.
**When to use:** After schema regeneration creates `shared/schemas/generated/*.generated.ts` files.
**Example:**

```typescript
// WRONG - importing manual schemas
import type {
  ArticuloInput,
  ComprobanteCabeceraInput
} from '../../shared/schemas/index.js'

// CORRECT - importing from generated schemas
import type {
  ArticuloInput,
  ComprobanteCabeceraInput
} from '../../shared/schemas/generated/index.js'
```

The `shared/schemas/generated/` directory already exists with generated files, but the manual schemas in `shared/schemas/*.ts` are still being imported. The plan should switch all imports to the generated versions.

### Pattern 4: Systematic Temporary File Cleanup

**What:** Use shell commands with explicit patterns to identify and remove development artifacts without touching production code or planning docs.
**When to use:** Before deployment or when preparing a release candidate.
**Example:**

```bash
# Find temporary scripts in monorepo root (safe to remove)
find . -maxdepth 1 -name "*.mjs" -type f

# Find backup files across repository
find . -name "*.backup" -o -name "*.bak" | grep -v node_modules

# Find isolated markdown files in module roots (not in .planning/)
find objetiva-sync-gateway -maxdepth 1 -name "*.md" -type f
find objetiva-sync -maxdepth 1 -name "*.md" -type f
```

**Why patterns matter:** Using `-maxdepth 1` prevents removing legitimate files in subdirectories. Excluding `node_modules` and `.planning/` preserves dependencies and project documentation. The `-type f` flag ensures only files (not directories) are matched.

### Anti-Patterns to Avoid

- **Deleting .planning/ directory:** This contains project roadmap, phase plans, and state tracking. Never remove planning docs during cleanup.
- **Using `rm -rf` without dry-run:** Always list files first, review the list, then delete. Prevents accidental removal of production code.
- **Keeping "just in case" backups:** Files like `schema.prisma.backup` and `package.json.backup` should be removed after restoring correct versions. Git history already provides backup capability.
- **Type provider over-engineering:** Don't add `withTypeProvider<TypeBoxTypeProvider>()` to "improve" type safety. The current API doesn't use advanced schema-to-type inference, so default types are sufficient.

## Don't Hand-Roll

Problems that look simple but have existing solutions:

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Finding unused exports/imports | Custom AST parser | `knip` package | Handles module resolution, dynamic imports, monorepo structure |
| Removing files from git history | Manual filter-branch | `BFG Repo-Cleaner` | Efficiently rewrites history, safer than filter-branch |
| TypeScript migration to strict mode | All-at-once flag flip | Gradual per-flag enablement | Avoids thousands of errors; enable `noImplicitAny` first, then `strictNullChecks`, etc. |
| Prisma schema generation | Manual model writing | `prisma db pull` | Introspects existing database and generates accurate schema |

**Key insight:** For this phase, no custom tooling is needed. The problems are straightforward: restore missing schema models, remove type provider configuration, switch imports, and delete files matching known patterns.

## Common Pitfalls

### Pitfall 1: Incomplete Prisma Schema After Restoration

**What goes wrong:** After restoring the three missing models from schema.prisma.backup, running `npx prisma generate` might still produce type errors if the schema has inconsistencies (e.g., wrong field names, missing @map attributes).

**Why it happens:** The backup file may be from an earlier version before snake_case migration was completed. Field names like `erpCodigo` (camelCase) need to become `erp_codigo` (snake_case) with `@map("erp_codigo")` attributes.

**How to avoid:** After copying models from backup, compare field names against the current Articulo model (which already uses snake_case). Ensure all models follow the same snake_case convention with proper `@map()` attributes.

**Warning signs:** TypeScript errors like `Type 'bigint' is not assignable to type 'number'` or `Property 'erpCodigo' does not exist`. These indicate field name/type mismatches between schema and code.

### Pitfall 2: Fastify Type Provider Type Errors Persist After Removal

**What goes wrong:** Removing `.withTypeProvider<TypeBoxTypeProvider>()` from app initialization doesn't eliminate all type errors because route handler files still have type assertions or imports expecting the custom type provider.

**Why it happens:** Type provider affects not just plugin registration but also request/reply typing in route handlers. Files may have explicit type annotations like `FastifyRequest<{ Body: UserType }, TypeBoxTypeProvider>` that need to be simplified.

**How to avoid:** After removing type provider from app.ts, run `npx tsc --noEmit` and fix any remaining route handler type errors. Look for `TypeBoxTypeProvider` imports and remove them. Replace explicit type annotations with Fastify's default types.

**Warning signs:** Errors like `Type 'FastifyInstance<..., TypeBoxTypeProvider>' is not assignable to type 'FastifyInstance<..., FastifyTypeProviderDefault>'`.

### Pitfall 3: Deleting Wrong .md Files

**What goes wrong:** A cleanup script removes legitimate documentation like README.md or CHANGELOG.md when trying to remove isolated .md files like "RETOMAR_TRABAJO.md" or "PROGRESO.md".

**Why it happens:** Using overly broad file patterns like `find . -name "*.md"` matches all markdown files, including important ones.

**How to avoid:** Be explicit about which .md files to remove. List files first with `find objetiva-sync-gateway -maxdepth 1 -name "*.md"`, review the list manually, then delete only the temporary ones (AYUDA.txt, CAMBIOS-SCHEMA.md, GUIA-REGENERACION-SCHEMAS.md, PROGRESO.md, RETOMAR_TRABAJO.md). Keep legitimate docs (README.md, CHANGELOG.md, DEPLOYMENT.md, SETUP.md) if they contain useful information.

**Warning signs:** CI/CD expects README.md but it's missing. New developers can't onboard because setup docs were deleted.

### Pitfall 4: Switching Schema Imports Breaks Type Inference

**What goes wrong:** After changing ingestion.ts to import from `shared/schemas/generated/`, TypeScript reports type errors because the generated schema exports have different names or types than the manual schemas.

**Why it happens:** Manual schemas in `shared/schemas/*.ts` may have custom type definitions (e.g., `ArticuloInput`) that don't exist in generated schemas. The generated files export raw Zod schemas without TypeScript type aliases.

**How to avoid:** Before switching imports, inspect the generated schema files to see what they export. Verify that types like `ArticuloInput` are either exported or can be inferred using `z.infer<typeof ArticuloSchema>`. Update type imports accordingly.

**Warning signs:** Errors like `Cannot find name 'ArticuloInput'` or `Property 'ArticuloInput' does not exist in module`.

## Code Examples

Verified patterns from official sources:

### Restoring Prisma Models from Backup

```bash
# Source: Standard Unix file operations
# Step 1: Verify current schema only has Articulo model
grep "^model" objetiva-sync-gateway/prisma/schema.prisma
# Expected output: "model Articulo {"

# Step 2: Extract missing models from backup (ComprobanteCabecera, ComprobanteDetalle, ComprobantePagos)
# Extract lines from backup starting after "model ComprobanteCabecera" to end of file
sed -n '/^model ComprobanteCabecera/,$p' objetiva-sync-gateway/prisma/schema.prisma.backup

# Step 3: Append missing models to current schema (manual operation - review before append)
# After manual review and snake_case field verification, append to schema.prisma

# Step 4: Generate Prisma Client with complete schema
cd objetiva-sync-gateway
npx prisma generate
```

### Removing Fastify Type Provider to Fix Plugin Type Errors

```typescript
// Source: https://fastify.dev/docs/latest/Reference/TypeScript/
// BEFORE - with type provider causing errors
import Fastify from 'fastify'
import { TypeBoxTypeProvider } from '@fastify/type-provider-typebox'

const app = Fastify().withTypeProvider<TypeBoxTypeProvider>()

await app.register(cors, { /* options */ })  // ERROR: Type mismatch

// AFTER - using default types
import Fastify from 'fastify'

const app = Fastify({
  logger: logger as any,
  trustProxy: true
})

await app.register(cors, { /* options */ })  // Works with FastifyTypeProviderDefault
```

**Key change:** Remove `.withTypeProvider<TypeBoxTypeProvider>()` call. Remove `TypeBoxTypeProvider` import. Plugins now register with default Fastify types, eliminating the `FastifyTypeProvider` vs `FastifyTypeProviderDefault` incompatibility.

### Switching Ingestion Service to Generated Schemas

```typescript
// Source: objetiva-sync-gateway/src/services/ingestion.ts
// BEFORE - importing manual schemas
import type {
  ArticuloInput,
  ComprobanteCabeceraInput,
  ComprobanteDetalleInput,
  ComprobantePagosInput
} from '../../shared/schemas/index.js'

// AFTER - importing from generated schemas
import type {
  ArticuloInput,
  ComprobanteCabeceraInput,
  ComprobanteDetalleInput,
  ComprobantePagosInput
} from '../../shared/schemas/generated/index.js'

// NOTE: Verify that generated schemas export these type names.
// If not, derive types using: type ArticuloInput = z.infer<typeof ArticuloSchema>
```

**Impact:** Ingestion service now uses schemas generated from PostgreSQL introspection, ensuring consistency between database structure and runtime validation.

### Safe Temporary File Cleanup Script

```bash
# Source: Standard Unix file operations + safety patterns
# Create cleanup script that lists files before deleting

# Step 1: List all temporary files (DRY RUN)
echo "=== Temporary .mjs scripts in monorepo root ==="
find . -maxdepth 1 -name "*.mjs" -type f | grep -v node_modules

echo "=== Backup files across repository ==="
find . \( -name "*.backup" -o -name "*.bak" \) -type f | grep -v node_modules

echo "=== Gateway temporary files ==="
find objetiva-sync-gateway -maxdepth 1 \( -name "*.mjs" -o -name "*-output.txt" \) -type f

echo "=== Gateway isolated .md files (review before deleting) ==="
find objetiva-sync-gateway -maxdepth 1 -name "*.md" -type f

# Step 2: After manual review, delete files
# find . -maxdepth 1 -name "*.mjs" -type f -delete
# find . \( -name "*.backup" -o -name "*.bak" \) -type f -delete
# etc.
```

**Safety measures:** Using `-maxdepth 1` prevents deleting files in subdirectories. Running dry-run first allows manual review. Excluding `node_modules` preserves dependencies. Using `-type f` ensures only files (not directories) are matched.

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Manual Prisma schema writing | `prisma db pull` introspection + codegen | Prisma 2.0+ | Ensures schema matches actual database structure |
| TypeScript gradual adoption | Strict mode from start | TypeScript 4.0+ | New projects use `"strict": true` by default |
| Hand-written Zod schemas | Generated from Prisma schema | Recent (2024+) | Single source of truth for types (database → Prisma → Zod) |
| Type provider for all projects | Type provider only when needed | Fastify 4.0+ | Default types sufficient unless using advanced schema-to-type inference |

**Deprecated/outdated:**
- **Fastify type-provider-typebox for simple APIs:** Only needed when using TypeBox for schema-driven type inference. For APIs with pre-defined Prisma models, default Fastify types work fine.
- **Keeping .backup files in repository:** Git history provides backup capability. Development backups (.backup, .bak) should be removed before production deployment.
- **Isolated progress tracking .md files:** Use .planning/ directory for roadmap/state tracking. Files like PROGRESO.md and RETOMAR_TRABAJO.md are temporary and should be removed after consolidating information into .planning/STATE.md.

## Open Questions

Things that couldn't be fully resolved:

1. **Do generated schemas export TypeScript types?**
   - What we know: The `shared/schemas/generated/*.generated.ts` files exist and contain Zod schemas
   - What's unclear: Whether they export type aliases like `ArticuloInput` or only Zod schemas requiring `z.infer<typeof Schema>`
   - Recommendation: Inspect `shared/schemas/generated/articulos.generated.ts` to verify exports. If types aren't exported, add type derivation like `export type ArticuloInput = z.infer<typeof ArticuloSchema>` to a generated index file

2. **Should manual schemas be deleted or kept?**
   - What we know: Manual schemas in `shared/schemas/*.ts` (articulos.ts, comprobantes-cabecera.ts, etc.) are currently imported by ingestion service
   - What's unclear: Whether these files serve as templates, documentation, or are truly obsolete after switching to generated schemas
   - Recommendation: After verifying generated schemas work correctly in ingestion service, move manual schemas to a `_deprecated/` subdirectory for one release cycle. If no issues arise, delete them in the next cleanup phase

3. **Are all isolated .md files safe to delete?**
   - What we know: Gateway root has 11 .md files including AYUDA.txt, CAMBIOS-SCHEMA.md, GUIA-REGENERACION-SCHEMAS.md, PROGRESO.md, RETOMAR_TRABAJO.md
   - What's unclear: Which ones contain information not captured elsewhere (README.md and DEPLOYMENT.md likely have useful content)
   - Recommendation: Manually review each .md file. Extract any unique useful information into .planning/STATE.md or permanent documentation (README.md, DEPLOYMENT.md), then delete temporary tracking files

## Sources

### Primary (HIGH confidence)

- [Fastify TypeScript Type Providers Documentation](https://fastify.dev/docs/latest/Reference/Type-Providers/) - Official guide on type provider usage and scoping
- [Fastify TypeScript Reference](https://fastify.dev/docs/latest/Reference/TypeScript/) - Official TypeScript integration patterns
- [Prisma Schema Database Mapping](https://github.com/prisma/docs/blob/main/content/200-orm/100-prisma-schema/20-data-model/50-database-mapping.mdx) - Official `@@map` attribute documentation
- [Prisma Custom Model and Field Names](https://github.com/prisma/docs/blob/main/content/200-orm/200-prisma-client/000-setup-and-configuration/100-custom-model-and-field-names.mdx) - Official guide on PascalCase models with snake_case tables
- Context7 Fastify documentation (`/llmstxt/fastify_dev_llms_txt`) - Type provider configuration patterns
- Context7 Prisma documentation (`/prisma/docs`) - Schema modeling best practices

### Secondary (MEDIUM confidence)

- [Fastify GitHub Issue #4032: FastifyRegister type does not propagate type provider](https://github.com/fastify/fastify/issues/4032) - Known issue explaining type mismatch errors
- [TypeScript Strict Mode Best Practices (OneUpTime)](https://oneuptime.com/blog/post/2026-01-24-typescript-strict-mode/view) - Gradual strict mode migration strategy
- [How to Clean Your Codebase (Medium)](https://medium.com/@walcottiv/how-to-clean-your-codebase-751a37596eea) - Development artifact cleanup patterns
- [Codebase Cleanup with Knip (Tim Santeford)](https://www.timsanteford.com/posts/how-to-clean-up-your-codebase-with-knip/) - Unused code detection tools

### Tertiary (LOW confidence)

- WebSearch results for "Fastify TypeScript plugin type errors 2026" - Community discussions about type provider issues
- WebSearch results for "codebase cleanup strategy 2026" - General cleanup approaches

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH - All libraries already in use, versions verified from package.json
- Architecture patterns: HIGH - Patterns derived from official documentation (Context7 Fastify/Prisma docs) and codebase inspection
- Pitfalls: HIGH - Identified from actual TypeScript errors (46 compilation errors analyzed) and manual file audits
- Code examples: HIGH - Based on official documentation and existing codebase structure

**Research date:** 2026-02-04
**Valid until:** 2026-03-04 (30 days - TypeScript/Fastify/Prisma are stable ecosystems)

**Codebase findings:**
- Gateway TypeScript errors: 46 total
  - 24 errors: "Property does not exist" (comprobanteCabecera, comprobanteDetalle, comprobantePagos) - **Root cause: incomplete Prisma schema**
  - 18 errors: Plugin type mismatches (cors, jwt) - **Root cause: FastifyTypeProvider vs FastifyTypeProviderDefault**
  - 3 errors: Type inference issues (implicit any, bigint/number mismatch) - **Root cause: strict mode with incomplete types**
  - 1 error: Unused variable (ConstraintMetadata) - **Root cause: leftover import**

- Temporary files identified: 23 total
  - Monorepo root: 12 .mjs test scripts
  - Gateway root: 11 files (3 .mjs scripts, 3 .txt output files, 5+ .md temporary docs)
  - Backup files: 11 total (.backup, .bak) across both modules

- Schema infrastructure:
  - Manual schemas: 4 files in `shared/schemas/*.ts` (articulos.ts, comprobantes-cabecera.ts, comprobantes-detalle.ts, comprobantes-pagos.ts)
  - Generated schemas: 4 files in `shared/schemas/generated/*.generated.ts` (articulos, comprobantes_cabecera, comprobantes_detalle, comprobantes_pagos)
  - Current imports: Ingestion service imports from manual schemas (wrong)
  - Target: Switch imports to generated schemas (correct)
