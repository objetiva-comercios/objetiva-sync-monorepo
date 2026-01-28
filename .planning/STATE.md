# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-01-26)

**Core value:** PostgreSQL schema changes propagate correctly through entire sync pipeline without breaking queries, validation, or data ingestion
**Current focus:** Phase 3 - CLI Code Regeneration (In Progress)

## Current Position

Phase: 3 of 5 (CLI Code Regeneration)
Plan: 2 of 2 completed
Status: Phase 3 complete - CLI code regeneration ready
Last activity: 2026-01-27 — Completed 03-02-PLAN.md (CLI orchestrator and entry point)

Progress: [████████░░] 80%

## Performance Metrics

**Velocity:**
- Total plans completed: 5
- Average duration: 13.3 minutes
- Total execution time: 1.1 hours

**By Phase:**

| Phase | Plans | Total | Avg/Plan |
|-------|-------|-------|----------|
| 01 | 2/2 | 41m | 20.5m |
| 02 | 1/1 | 3.5m | 3.5m |
| 03 | 2/2 | 21m | 10.5m |

**Recent Trend:**
- Last 5 plans: 01-02 (3m), 02-01 (3.5m), 03-01 (6m), 03-02 (15m)
- Trend: Sustained high velocity with efficient execution

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

### Pending Todos

None yet.

### Blockers/Concerns

None yet.

## Session Continuity

Last session: 2026-01-27 — Phase 3 complete
Stopped at: Completed 03-02-PLAN.md (CLI orchestrator), Phase 3 complete, ready for Phase 4
Resume file: None
