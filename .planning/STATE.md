# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-01-26)

**Core value:** PostgreSQL schema changes propagate correctly through entire sync pipeline without breaking queries, validation, or data ingestion
**Current focus:** Phase 4 - Enhanced Query Validation (IN PROGRESS)

## Current Position

Phase: 4 of 5 (Enhanced Query Validation)
Plan: 1 of 3 completed
Status: In progress - Schema cache infrastructure complete
Last activity: 2026-01-30 — Completed 04-01-PLAN.md (schema cache infrastructure)

Progress: [████████░░] 83%

## Performance Metrics

**Velocity:**
- Total plans completed: 7
- Average duration: 11.4 minutes
- Total execution time: 1.33 hours

**By Phase:**

| Phase | Plans | Total | Avg/Plan |
|-------|-------|-------|----------|
| 01 | 2/2 | 41m | 20.5m |
| 02 | 1/1 | 3.5m | 3.5m |
| 03 | 3/3 | 29m | 9.7m |
| 04 | 1/3 | 8m | 8.0m |

**Recent Trend:**
- Last 5 plans: 03-01 (6m), 03-02 (15m), 03-03 (8m), 04-01 (8m)
- Trend: Excellent velocity maintained, infrastructure tasks completing efficiently

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

**From 04-01:**
- Use fast-jwt via @fastify/jwt: Native, fast JWT library already in ecosystem, ensures compatibility with gateway
- 1-hour cache TTL matching gateway: Consistency between gateway and sync cache durations
- Stale cache fallback: Serve expired cache when gateway unreachable for graceful degradation
- Non-throwing initialization: Service starts even if gateway is down, schemas fetched on-demand
- JWT_SECRET shared between services: Sync and gateway use same secret for service-to-service auth

### Pending Todos

None yet.

### Blockers/Concerns

None yet.

## Session Continuity

Last session: 2026-01-30 — Phase 4 started
Stopped at: Completed 04-01-PLAN.md (schema cache infrastructure)
Resume file: None
