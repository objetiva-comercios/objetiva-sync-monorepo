# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-01-26)

**Core value:** PostgreSQL schema changes propagate correctly through entire sync pipeline without breaking queries, validation, or data ingestion
**Current focus:** Phase 3 - CLI Code Regeneration (COMPLETE + VERIFIED)

## Current Position

Phase: 3 of 5 (CLI Code Regeneration) ✅ COMPLETE
Plan: 3 of 3 completed (including verification)
Status: Phase 3 complete and verified - All requirements tested and working
Last activity: 2026-01-30 — Completed 03-03-PLAN.md (verification testing), fixed array syntax bug

Progress: [████████░░] 80%

## Performance Metrics

**Velocity:**
- Total plans completed: 6
- Average duration: 12.2 minutes
- Total execution time: 1.2 hours

**By Phase:**

| Phase | Plans | Total | Avg/Plan |
|-------|-------|-------|----------|
| 01 | 2/2 | 41m | 20.5m |
| 02 | 1/1 | 3.5m | 3.5m |
| 03 | 3/3 | 29m | 9.7m |

**Recent Trend:**
- Last 5 plans: 02-01 (3.5m), 03-01 (6m), 03-02 (15m), 03-03 (8m)
- Trend: Sustained high velocity with efficient bug discovery and resolution

*Updated after each plan completion*

## Accumulated Context

### Decisions

Decisions are logged in PROJECT.md Key Decisions table.
Recent decisions affecting current work:

- PostgreSQL as single source of truth: Destination schema is what ultimately matters for data integrity
- Gateway exposes schemas via HTTP: Sync needs access to schemas but runs on different server
- Manual regeneration command: User must consciously propagate schema changes, prevents accidents
- Distribute tooling between sync/gateway: Avoid third module complexity, leverage existing architecture

**From 01-01:**
- Pool statement timeout: 5s - introspection queries should be fast
- Retry only connection errors: SQL errors are permanent, don't waste time retrying
- Small connection pool (max 5): Introspection is infrequent, reduces resource usage

**From 01-02:**
- Sequential entity processing: Process entities one at a time to avoid exhausting database pool
- Partial results pattern: Return successful tables + errors instead of failing completely
- Type normalization: Map PostgreSQL verbose types to simplified standards for consistency
- Environment variable override: Allow SYNC_ENTITIES env var to customize entity list without code changes

**From 02-01:**
- 1-hour cache TTL: Balance between schema freshness and database load for infrequent schema changes
- Response shape mapping: API uses entity (domain language) not table_name (database language)
- Cache stores mapped responses: Cache final API shape to avoid re-mapping on cache hits
- Entity validation: Only allow introspection of configured sync entities for security

**From 03-01:**
- BigInt detection via column name pattern (id, *_id): Introspection normalizes bigint to int, so name pattern is reliable heuristic
- Parse existing schema.prisma to preserve annotations: Extract @map, relations, indexes from current schema before regenerating
- COLUMN_PRECISION_MAP for decimal types: ColumnMetadata lacks precision/scale, hardcoded map ensures correct financial calculations
- Database-structure-only Zod schemas: Separate stable schema structure from volatile business validation rules

**From 03-02:**
- All-or-nothing fetch pattern: Fail immediately if any entity schema fetch fails (prevents partial regeneration)
- Sequential diff display before writing: Show all diffs first, then write all files (CLI-05 requirement)
- Automatic prisma generate after schema.prisma write: Ensures Prisma Client stays in sync (CLI-03 requirement)
- Actionable E00X error codes: Each common failure has specific code and fix instruction

**From 03-03:**
- Arrays cannot be optional in Prisma: Fixed generator to skip '?' for array types (String[] not String[]?)
- Windows file lock during prisma generate: Document workaround to stop gateway before CLI (expected OS behavior)
- Phase verification via UAT testing: Comprehensive end-to-end tests confirm all requirements before phase completion

### Pending Todos

None yet.

### Blockers/Concerns

None yet.

## Session Continuity

Last session: 2026-01-30 — Phase 3 verified and complete
Stopped at: Completed 03-03-PLAN.md (verification testing + bug fix), Phase 3 fully verified, ready for Phase 4
Resume file: None
