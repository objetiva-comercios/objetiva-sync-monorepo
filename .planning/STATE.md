# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-02-03)

**Core value:** PostgreSQL schema changes propagate correctly through entire sync pipeline without breaking queries, validation, or data ingestion
**Current focus:** Milestone v1.1-rc -- Phase 11: Deployment Configuration

## Current Position

Phase: 11 of 12 (Deployment Configuration)
Plan: 2/2
Status: Phase complete
Last activity: 2026-02-04 -- Completed 11-01-PLAN.md

Progress: [####################] 100% (v1.0 complete, Phase 8 complete, Phase 9 complete, Phase 10 complete, Phase 11 complete)

## Performance Metrics

**Velocity (v1.0):**
- Total plans completed: 14
- Phases completed: 7
- Total execution time: ~7 days (2026-01-27 to 2026-02-03)

**v1.1-rc:**
- Plans estimated: 9 across 5 phases
- Plans completed: 13 (08-01, 08-02, 08-03, 09-01, 09-02, 09-03, 10-01, 10-02, 10-03, 10-04, 11-01, 11-02)
- Phases completed: 4 (Phase 8, Phase 9, Phase 10)

## Accumulated Context

### Decisions

All v1.0 decisions archived in \`.planning/archive/v1.0-MILESTONE.md\`.

**v1.1-rc decisions (Phase 8):**

| Decision | Phase-Plan | Rationale |
|----------|----------|------------|
| Phase numbering continues from v1.0 (start at 8) | Roadmap | Maintain continuity with v1.0 milestone |
| Sync timeout fix is critical blocker, must be Phase 8 | Roadmap | Blocks production use of sync feature |
| 15s SSE heartbeat interval | 08-01 | Stays well under typical 60s proxy timeouts |
| 120s SQL Server timeout | 08-01 | Allows 100K+ row queries over network |
| 100ms batch delay (down from 500ms) | 08-01 | 5x throughput improvement while maintaining backpressure |
| proxy_buffering off for SSE | 08-01 | Critical for real-time event delivery |
| 2-minute fetch timeout (120,000ms) | 08-02 | Balances large batch processing with preventing indefinite hangs |
| AbortSignal.any() for timeout + cancellation | 08-02 | Standard API for merging user cancel and timeout signals |
| Spanish error root cause messages | 08-02 | User-facing errors should be in application language |
| JWT string-to-number parsing for expiresIn | Post-08 | jsonwebtoken treats string "86400" as 86.4s (ms), number 86400 as 24h (s) |
| Incremental job tracking in metrics | Post-08 | Re-aggregating from raw events caused RECIBIDOS to change on completed ops |

**v1.1-rc decisions (Phase 9):**

| Decision | Phase-Plan | Rationale |
|----------|----------|------------|
| Preserve scripts/ directory | 09-02 | Legitimate utility scripts distinct from temporary test scripts |
| Delete schema.prisma.backup | 09-02 | Content well-documented in research notes, safe for parallel execution |
| Keep essential documentation | 09-02 | README.md, DEPLOYMENT.md, SETUP.md needed for Phase 11 deployment |
| Use manual Zod schemas (not generated) | 09-01 | Generated schemas are outdated (pre-IVA-migration); manual schemas are correct and match current Prisma schema |
| Prisma schema must match database exactly | 09-01 | Schema is source of truth for TypeScript types; discrepancies cause compilation errors |
| Generated schemas as source of truth | 09-03 | index.ts re-exports from generated schemas (DEBT-02 satisfied) |
| Backward-compatible aliases during migration | 09-03 | Type aliases ensure consumer code doesn't break while migrating to generated schemas |
| nullToUndefined helper for Prisma | 09-03 | Bridges Zod nullable (T | null) with Prisma optional (T | undefined) |
| Complete event uses fullSync param | 10-01 | Complete event emitted after all queries finish, no single progressData to reference; fullSync param is user's original intent |

**v1.1-rc decisions (Phase 10):**

| Decision | Phase-Plan | Rationale |
|----------|----------|------------|
| Preserve lastSyncValue on cancellation | 10-04 | Cancelled sync shouldn't update timestamps - only successful syncs advance the watermark |
| Reset status to IDLE on cancellation | 10-04 | Dashboard must show correct state after cancel, not perpetual RUNNING |
| 179-line comprehensive documentation | 10-04 | Users need detailed guide for incrementalField, @lastSync, clock skew, troubleshooting |

### Known Issues

1. **Sync timeout bug** -- **FIXED** (root cause: JWT expiring in 86.4s not 24h, plus SSE/timeout improvements)
2. **Gateway TypeScript errors** -- **FIXED** (Prisma schema updated to match IVA migration, bigint types corrected)
3. **Generated schemas outdated** -- **FIXED** (manually updated to match Prisma schema, re-export from index.ts); regenerate after deployment recommended
4. **Cancellation state bug** -- **FIXED** (10-04: CANCELED branch now resets status to IDLE)

### Pending Todos

None.

### Blockers/Concerns

None.

## Session Continuity

Last session: 2026-02-04 -- Phase 11 plan 11-01 execution complete
Stopped at: Completed 11-01-PLAN.md - Phase 11 complete
Resume file: None

### Phase 8 Summary (Completed 2026-02-04)
- 08-01: SSE heartbeat (15s), SQL timeout 120s, batch delay 100ms, nginx config
- 08-02: Error classifier (11 types), AbortSignal.timeout (2min) in all 4 API clients
- 08-03: Gateway bulk ingestion (createMany + $transaction) replacing N+1
- Post-plan fixes: JWT expiration parsing (root cause of ~60s failure), dashboard UI (button reset, localStorage persistence, timestamp format dd/mm/yyyy HH:mm:ss, cancel button flash fix, RECIBIDOS incremental tracking, clear metrics button, background circles removed)

### Phase 9 Summary (Completed 2026-02-04)
- 09-01: Gateway TypeScript compilation fix (Prisma schema aligned with IVA migration, bigint types fixed, zero compilation errors)
- 09-02: Repository cleanup (60+ temporary files removed: test scripts, backups, debug logs)
- 09-03: Schema consolidation (index.ts re-exports from generated schemas with backward-compatible aliases, nullToUndefined helper for Prisma compatibility, DEBT-02 and DEBT-04 satisfied)

### Phase 10 Summary (Completed 2026-02-04)
- 10-01: Clock skew protection (5-min overlap), ProgressData extended with syncType and queryId, SSE events enriched, GET /api/sync/sync-state and /api/sync/history endpoints
- 10-02: Gap closure verification plan (re-verified Phase 10, found 2 new gaps: cancellation bug, missing docs)
- 10-03: Dead code removal and numeric sort fix (removed 520-line syncEntity method, fixed getMaxFieldValue for numeric IDs)
- 10-04: Cancellation bug fix and incremental sync documentation (status reset to IDLE, 179-line user guide)

**v1.1-rc decisions (Phase 11):**

| Decision | Phase-Plan | Rationale |
|----------|----------|------------|
| PM2 fork mode for gateway (not cluster) | 11-01 | Gateway uses Server-Sent Events (SSE) for sync progress streaming; cluster mode would break SSE connections |
| Target AlmaLinux (RHEL) instead of Ubuntu/Debian | 11-01 | VPS runs AlmaLinux; different package manager (dnf vs apt), paths, firewall (firewalld vs ufw) |
| Automated pg_dump backup before every migration | 11-01 | Migrations can fail; backups enable rollback; using custom format (-Fc) with compression (-Z 9), 7-day retention |
| Bash script instead of package.json scripts | 11-01 | Need platform-specific logic (pg_dump parsing, pm2 detection, health checks); better error handling than npm scripts |
| PM2 fork mode for sync (not cluster) | 11-02 | Sync has stateful scheduler, cron jobs, dashboard sessions, and SQLite database |
| ENCRYPTION_KEY/SESSION_SECRET not required in validation | 11-02 | Auto-generated by app on first run (src/config/env.ts) |
| Explicit mkdir ./database/ with coupling comment | 11-02 | drizzle.config.ts hardcodes path, drizzle-kit ignores DATABASE_PATH env var |
| Git Bash compatible commands only | 11-02 | No readlink -f, portable mkdir -p and stat usage |

### Phase 11 Summary (Completed 2026-02-04)
- 11-01: Gateway deployment automation (deploy.sh with pre-flight checks, env validation, PostgreSQL backup, Prisma migrations, PM2 fork mode, AlmaLinux DEPLOYMENT.md)
- 11-02: Sync deployment automation (deploy.sh for Windows/Git Bash, PM2 fork mode, .env.example with 17 vars, Git Bash-compatible commands)
