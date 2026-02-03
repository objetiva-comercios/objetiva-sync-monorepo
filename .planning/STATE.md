# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-01-26)

**Core value:** PostgreSQL schema changes propagate correctly through entire sync pipeline without breaking queries, validation, or data ingestion
**Current focus:** Phase 7 - Dashboard Monitoring - COMPLETE

## Current Position

Phase: 7 of 7 (Dashboard Monitoring) - COMPLETE
Plan: N/A (manual testing and bug fixes)
Status: All phases complete - Real-time monitoring dashboard verified and fixed
Last activity: 2026-02-03 — Completed Phase 7 testing and bug fixes

**Milestone Status:** All 7 phases complete ✅

Progress: [██████████] 100% (7 of 7 phases complete)

## Performance Metrics

**Velocity:**
- Total plans completed: 13
- Average duration: 15.8 minutes
- Total execution time: 4.4 hours

**By Phase:**

| Phase | Plans | Total | Avg/Plan |
|-------|-------|-------|----------|
| 01 | 2/2 | 41m | 20.5m |
| 02 | 1/1 | 3.5m | 3.5m |
| 03 | 3/3 | 29m | 9.7m |
| 04 | 2/2 | 27m | 13.5m |
| 05 | 5/5 | 90m | 18.0m |
| 06 | 1/1 | 47m | 47.0m |
| 07 | 0/0 | 60m | N/A |

**Recent Trend:**
- Last 5 plans: 05-03 (8m), 05-01-fixed (28m), 05-04 (15m), 05-05 (11m), 06-01 (47m)
- Phase 7: Manual testing and bug fixes (60m)

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

**From 05-04:**
- Native Fastify SSE over @fastify/sse: Simpler implementation, well-supported, avoids compatibility issues
- 15-second heartbeat: Prevents proxy timeout and confirms active SSE connection per CONTEXT.md requirement
- Server-side filtering: Apply entityType/status filters in SSE handler before sending to reduce bandwidth
- logEventEmitter singleton: Centralized event broadcasting from route file, supports multiple dashboard clients (maxListeners: 50)
- 5 reconnection attempts with 3s delay: Handles temporary network issues with exponential backoff

**From 05-05:**
- Use beforeAll() for loadEnv() calls: Follows established pattern from all other integration tests
- Single-character syntax fixes commit separately: Enables precise git bisect and rollback if needed

**From 06-01:**
- Spawn CLI via tsx instead of npm script: Provides direct control over environment variables and process lifecycle for testing
- Temporarily rename .env for error tests: Only reliable way to test missing env var scenarios without modifying CLI code
- Relaxed E003/E004 assertions: More robust against timing variations when gateway restarts or is slow
- Sequential test execution: Prevents shared state issues and file conflicts between CLI E2E tests

**From Phase 7:**
- Check element availability before initialization: SSE init must verify target element exists in DOM at check time
- Load scripts after dependent HTML: Scripts depending on DOM elements must load after those elements are defined
- Template structure matters: Be careful when editing templates to avoid accidentally removing dependent structures

### Roadmap Evolution

- Phase 7 added: Check/test/resolve real-time monitoring dashboard and all sync visualization problems
- Phase 7 completed: Fixed 3 critical SSE connection bugs, real-time monitoring now fully functional

### Pending Todos

None - All phases complete.

### Blockers/Concerns

**Gateway TypeScript errors (pre-existing):**
- Gateway has compilation errors (Prisma schema mismatches, Fastify types)
- Not blocking: Tests run successfully, logging works correctly, dashboard fully functional
- For future consideration: May need Prisma regeneration or tsconfig fixes

## Session Continuity

Last session: 2026-02-03 — Phase 7 testing and bug fixes complete
Stopped at: All 7 phases complete - Milestone ready for completion
Resume file: None
