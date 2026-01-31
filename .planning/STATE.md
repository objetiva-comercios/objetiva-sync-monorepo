# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-01-26)

**Core value:** PostgreSQL schema changes propagate correctly through entire sync pipeline without breaking queries, validation, or data ingestion
**Current focus:** Phase 5 - Integration Testing and Hardening (COMPLETE)

## Current Position

Phase: 5 of 5 (Integration Testing and Hardening) - COMPLETE
Plan: 5 of 5 completed
Status: All Phase 5 integration tests passing - Gap closure complete, 38 tests executing successfully
Last activity: 2026-01-31 — Completed 05-05-PLAN.md (Gap Closure - Test Bug Fixes)

Progress: [██████████] 100%

## Performance Metrics

**Velocity:**
- Total plans completed: 12
- Average duration: 12.2 minutes
- Total execution time: 2.5 hours

**By Phase:**

| Phase | Plans | Total | Avg/Plan |
|-------|-------|-------|----------|
| 01 | 2/2 | 41m | 20.5m |
| 02 | 1/1 | 3.5m | 3.5m |
| 03 | 3/3 | 29m | 9.7m |
| 04 | 2/2 | 27m | 13.5m |
| 05 | 5/5 | 90m | 12.9m |

**Recent Trend:**
- Last 5 plans: 05-01 (18m), 05-03 (8m), 05-01-fixed (28m), 05-04 (15m), 05-05 (11m)
- Trend: Excellent velocity in Phase 5 with established patterns and test infrastructure

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

**From 04-02:**
- Empty rows as warning not error: Filtered queries may legitimately return 0 rows, don't block saves
- Schema unavailable as warning not error: Gateway may be down, allow saves to proceed with graceful degradation
- Levenshtein distance ≤ 3 for suggestions: Catches typos without suggesting unrelated words
- Field length ratio 0.5-2.0 for suggestions: Avoids suggesting very short/long words for typos
- Lenient type compatibility: String compatible with number (could be stringified) to avoid false positives
- Skip validation when no active connection: Don't block query configuration when ERP database is offline

**From 05-03:**
- Human-readable log messages: "Batch X/Y - entity: N processed (M inserted, K updated) in Zms" format enables quick visual scanning
- Sample up to 3 errors: Provides diagnostic context without flooding logs when many records fail
- Warn level for failures, info for success: Enables easy production log filtering for problematic batches
- Optional metadata handling: Include syncId/queryId/queryName when available, gracefully handle missing metadata

**From 05-04:
- Native Fastify SSE over @fastify/sse: Simpler implementation, well-supported, avoids compatibility issues
- 15-second heartbeat: Prevents proxy timeout and confirms active SSE connection per CONTEXT.md requirement
- Server-side filtering: Apply entityType/status filters in SSE handler before sending to reduce bandwidth
- logEventEmitter singleton: Centralized event broadcasting from route file, supports multiple dashboard clients (maxListeners: 50)
- 5 reconnection attempts with 3s delay: Handles temporary network issues with exponential backoff
**From 05-05:**
- Use beforeAll() for loadEnv() calls: Follows established pattern from all other integration tests
- Single-character syntax fixes commit separately: Enables precise git bisect and rollback if needed
### Pending Todos

None yet.

### Blockers/Concerns

**Gateway TypeScript errors (pre-existing):**
- Gateway has compilation errors (Prisma schema mismatches, Fastify types)
- Not blocking: Tests run successfully, logging works correctly
- For future consideration: May need Prisma regeneration or tsconfig fixes

## Session Continuity

Last session: 2026-01-31 — Phase 5 complete
Stopped at: Completed 05-05-PLAN.md (Gap Closure - Test Bug Fixes)
Resume file: None
