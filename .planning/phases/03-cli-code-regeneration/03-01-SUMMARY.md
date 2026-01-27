---
phase: 03-cli-code-regeneration
plan: 01
subsystem: codegen
tags: [diff, chalk, prisma, zod, typescript, schema-introspection]

# Dependency graph
requires:
  - phase: 02-schema-distribution-endpoint
    provides: "HTTP API endpoint /api/schemas/:entity returning ColumnMetadata/ConstraintMetadata"
  - phase: 01-schema-introspection
    provides: "ColumnMetadata and ConstraintMetadata types with normalized PostgreSQL types"
provides:
  - "Code generation pipeline (Prisma + Zod) from schema metadata"
  - "Diff computation and colored display utilities"
  - "BigInt detection heuristic for id and *_id columns"
  - "Annotation preservation (@@map, @db.*, relations, indexes)"
affects: [03-02-cli-command, prisma-schema-regeneration, zod-schema-regeneration]

# Tech tracking
tech-stack:
  added: [diff, chalk, @types/diff]
  patterns:
    - "Parse existing schema.prisma to extract structural annotations"
    - "BigInt detection via column name pattern (id, *_id)"
    - "Separate generated schemas (*.generated.ts) from hand-written business schemas"
    - "Database-structure-only Zod schemas (no business validation)"

key-files:
  created:
    - objetiva-sync-gateway/src/codegen/types.ts
    - objetiva-sync-gateway/src/codegen/diff-display.ts
    - objetiva-sync-gateway/src/codegen/prisma-generator.ts
    - objetiva-sync-gateway/src/codegen/zod-generator.ts
  modified:
    - objetiva-sync-gateway/package.json

key-decisions:
  - "BigInt detection via column name pattern (id, *_id) not type introspection"
  - "Parse existing schema.prisma to preserve relations, indexes, and @map annotations"
  - "COLUMN_PRECISION_MAP constant for known decimal precision/scale values"
  - "Generated Zod schemas use z.record(z.unknown()) for JSONB (not z.any())"
  - "Skip auto-managed columns (id, creado, actualizado) in Zod schemas"

patterns-established:
  - "ExistingSchemaInfo structure for parsed Prisma schema metadata"
  - "PrismaFieldConfig separates type from database annotation"
  - "SchemaResponse matches Phase 2 API contract exactly"

# Metrics
duration: 6min
completed: 2026-01-27
---

# Phase 3 Plan 1: Code Generation Modules Summary

**Complete Prisma and Zod generators with BigInt detection, @db.* annotations, @map preservation, and colored diff display**

## Performance

- **Duration:** 6 minutes
- **Started:** 2026-01-27T23:51:03Z
- **Completed:** 2026-01-27T23:56:37Z
- **Tasks:** 3
- **Files modified:** 5

## Accomplishments

- Created full code generation pipeline transforming PostgreSQL metadata to Prisma and Zod schemas
- Implemented BigInt detection heuristic (id and *_id columns) despite normalized int type
- Built parseExistingSchema() to extract and preserve @map directives, relations, and indexes
- Zod generator produces database-structure-only schemas (types + nullability, no business logic)
- Diff display renders colored output with green additions, red deletions, yellow summaries

## Task Commits

Each task was committed atomically:

1. **Task 1: Install deps and create codegen types and diff display** - `ead9621` (feat)
2. **Task 2: Create Prisma model generator with BigInt and annotation handling** - `75fdb15` (feat)
3. **Task 3: Create Zod schema generator for database-structure schemas** - `f7f80a1` (feat)

## Files Created/Modified

- `objetiva-sync-gateway/src/codegen/types.ts` - All codegen interfaces (RegenerateOptions, DiffResult, PrismaFieldConfig, SchemaResponse)
- `objetiva-sync-gateway/src/codegen/diff-display.ts` - computeDiff(), displayDiff(), displaySummary() with chalk colors
- `objetiva-sync-gateway/src/codegen/prisma-generator.ts` - generatePrismaSchema() with full annotation handling
- `objetiva-sync-gateway/src/codegen/zod-generator.ts` - generateZodSchema() for database-structure validation
- `objetiva-sync-gateway/package.json` - Added diff, chalk, @types/diff dependencies

## Decisions Made

**BigInt detection heuristic (Research question 2, option b):**
- Introspection normalizes bigint to int, so type detection is unreliable
- Solution: Column name pattern detection (id, *_id) identifies BigInt columns
- All other int columns map to Prisma Int
- Rationale: Known-column-pattern is reliable for current schema structure (all PKs are id, all FKs end with _id)

**Annotation preservation via existing schema parsing:**
- parseExistingSchema() extracts @map directives, relations, and indexes from current schema.prisma
- Generated schema preserves these structural annotations
- New columns use database column name directly (no @map unless already defined)
- Rationale: Avoids breaking existing field names/relations when regenerating

**COLUMN_PRECISION_MAP constant for decimal types:**
- ColumnMetadata doesn't include numeric_precision/numeric_scale
- Created hardcoded map with known precision/scale from existing schema
- Unknown decimal columns default to @db.Decimal(10, 2)
- Rationale: Correct precision is critical for financial calculations (prevents rounding errors)

**Database-structure-only Zod schemas:**
- Generated schemas reflect DB types + nullability only
- No business rules (.min(), .positive(), .enum(), .describe())
- Skip auto-managed columns (id, creado, actualizado)
- Fields with defaults are .optional() (DB provides value)
- Rationale: Separates schema structure (stable, derived from DB) from business logic (changes independently)

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

**TypeScript Hunk import issue:**
- Problem: `import type { Hunk } from 'diff'` failed (Hunk not exported directly)
- Solution: Defined Hunk interface inline in types.ts (matches diff package structure)
- Verification: TypeScript compilation passed

## Next Phase Readiness

**Ready for 03-02 (CLI command implementation):**
- All code generation functions exported and tested
- parseExistingSchema() integration test confirms annotation extraction works on actual schema.prisma
- BigInt detection handles all current entity schemas
- Diff display ready for dry-run mode

**No blockers:**
- Dependencies installed
- All modules compile without errors
- Type mapping covers all PostgreSQL types in current schemas

---
*Phase: 03-cli-code-regeneration*
*Completed: 2026-01-27*
