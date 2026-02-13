# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-02-11)

**Core value:** PostgreSQL schema changes propagate correctly through entire sync pipeline without breaking queries, validation, or data ingestion
**Current focus:** Milestone v1.1-rc2 — Multi-source sync & hardening

## Current Position

Phase: 17 of 17 (Dashboard Modernization)
Plan: 03 of 06 complete
Status: In progress
Last activity: 2026-02-13 — Completed 17-03-PLAN.md (Data Table Components)

Progress: [███████████████████████░░░] Plans 17-01 through 17-03 complete, 17-04 through 17-06 pending

## Completed Milestones

| Milestone | Phases | Plans | Completed |
|-----------|--------|-------|-----------|
| v1.0 | 1-7 | 14 | 2026-02-03 |
| v1.1-rc | 8-12 | 15 | 2026-02-05 |

See: .planning/MILESTONES.md for full details

## Decisions Made

| ID | Decision | Phase | Impact |
|-----|----------|-------|--------|
| POSTGRES-01 | Use pg library Pool for connection management | 13-01 | Standard PostgreSQL client with proven reliability |
| POSTGRES-02 | Convert @param/:param to $1 positional parameters | 13-01 | Transparent SQL dialect translation in adapter layer |
| POSTGRES-03 | Default schema is 'public' instead of 'dbo' | 13-01 | PostgreSQL convention handling in schema introspection |
| UI-01 | Map server field to host for PostgreSQL in UI layer | 13-02 | Transparent field name translation keeps UI consistent |
| TEST-01 | Skip PostgreSQL integration tests when no database available | 13-02 | CI environments gracefully handle missing PostgreSQL |
| ORIGIN-01 | Origin columns nullable for backwards compatibility | 14-01 | Existing records without origin tracking remain valid |
| ORIGIN-02 | Hostname-based source ID with default suffix | 14-02 | Stable identifier without external dependencies |
| ORIGIN-03 | Conflict detection is best-effort (doesn't block ingestion) | 14-03 | Observability without impacting sync performance |
| AUTH-01 | Parse JWT_EXPIRES_IN to seconds for expiresIn response field | 15-01 | Clients know exact token lifetime for proactive refresh |
| AUTH-02 | Map FST_JWT_* codes to TOKEN_EXPIRED/INVALID/MISSING | 15-01 | Descriptive error codes for troubleshooting |
| AUTH-03 | Refresh-first token strategy with login fallback | 15-03 | Long-running syncs can renew tokens without full re-login |
| AUTH-04 | Diagnostics exposes config status as booleans only | 15-02 | Security: never expose actual JWT_SECRET or password hash values |
| AUTH-05 | Password change requires current password verification | 15-02 | Security: bcrypt.compare before allowing update |
| HEALTH-01 | Gateway critical, scheduler optional in sync health | 16-04 | Gateway connectivity required, scheduler state informational |
| HEALTH-02 | 3-second timeout on all health probes | 16-04 | Kubernetes expects 5s max, 3s probe + 2s margin |
| PROM-01 | Custom Registry to avoid default registry pollution | 16-02 | Isolated metrics, enables testing without conflicts |
| PROM-02 | gateway_ prefix for all metrics | 16-02 | Namespace clarity in multi-service environments |
| PROM-03 | Use route patterns not URLs to prevent cardinality explosion | 16-02 | /api/articulos/:id instead of /api/articulos/123 |
| SYNC-METRICS-01 | Exponential buckets 0.1s-102.4s for sync duration | 16-03 | Covers small batches to large syncs |
| SYNC-METRICS-02 | Labels limited to 3 per metric | 16-03 | Prevents cardinality explosion in Prometheus |
| TEST-02 | Use app.inject() for in-process auth integration tests | 15-04 | Fast tests without requiring running server |
| VITE-01 | Use Vite 5.x for build compatibility | 17-01 | Consistent build behavior with vitest versions |
| REACT-PEER-01 | React as peerDependency in dashboard package | 17-01 | Prevents duplicate React instances across workspace |

## Pending Human Verification

From v1.1-rc audit (carried forward):
1. Run manual sync with 100K+ records, verify completion (SYNC-01)
2. Test batch sizes 200 and 500, verify no degradation (SYNC-04)
3. Execute real PostgreSQL schema change E2E workflow
4. Validate incremental sync with live database

From Phase 13 (PostgreSQL Adapter):
5. Test PostgreSQL connection with real Supabase/RDS/local database
6. Verify SSL enabled/disabled modes work correctly
7. Run integration tests with real PostgreSQL: POSTGRES_TEST_HOST=... npm test -- postgresql-adapter.integration.test.ts
8. Validate end-to-end sync workflow with PostgreSQL source

From Phase 14 (Origin Tracking):
9. Run sync from two different sources, verify origin columns populated
10. Verify conflict logging when same record modified within 5-minute window
11. Run origin tracking integration tests with gateway: npm test -- origin-tracking.integration.test.ts

From Phase 15 (Auth Simplification):
12. Test token refresh: login, wait, call /auth/refresh, verify new token works
13. Verify error codes: missing header returns TOKEN_MISSING, expired token returns TOKEN_EXPIRED
14. Verify AuthManager refresh works: start sync, observe "[AuthManager] Token refreshed successfully" in logs
15. Test diagnostics: call GET /api/auth/diagnostics with valid token, verify token metadata returned
16. Test password change: call POST /api/auth/change-password with wrong current password, verify PASSWORD_INVALID error

From Phase 16 (Observability):
17. Verify /metrics endpoint returns Prometheus format: curl http://localhost:3335/metrics
18. Confirm gateway_ prefix on all metrics in output
19. Trigger sync and verify gateway_sync_operation_duration_seconds appears
20. Verify gateway_sync_records_total counter increments after sync

## Blockers & Concerns

None currently. Phase 17 Plans 01-03 complete. Plans 04-06 pending.

## Session Continuity

Last session: 2026-02-13 — Created missing 17-02-SUMMARY.md (Layout Components)
Stopped at: Plan 17-02 SUMMARY created (was missing)
Resume file: .planning/phases/17-dashboard-modernization/17-02-SUMMARY.md
Next action: Continue with pending plans (17-04 through 17-06)

---
*Last updated: 2026-02-13 after documenting Plan 17-02 (Layout Components)*
