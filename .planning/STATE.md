# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-02-03)

**Core value:** PostgreSQL schema changes propagate correctly through entire sync pipeline without breaking queries, validation, or data ingestion
**Current focus:** Milestone v1.1-rc -- Phase 9: Tech Debt Cleanup

## Current Position

Phase: 9 of 12 (Tech Debt Cleanup)
Plan: 1/2
Status: In progress
Last activity: 2026-02-04 -- Completed 09-02-PLAN.md (repository cleanup)

Progress: [################░░░░] 80% (v1.0 complete, Phase 8 complete, Phase 9 in progress)

## Performance Metrics

**Velocity (v1.0):**
- Total plans completed: 14
- Phases completed: 7
- Total execution time: ~7 days (2026-01-27 to 2026-02-03)

**v1.1-rc:**
- Plans estimated: 9 across 5 phases
- Plans completed: 4 (08-01, 08-02, 08-03, 09-02)
- Phases completed: 1 (Phase 8)
- Phase 9 in progress: 1/2 plans complete

## Accumulated Context

### Decisions

All v1.0 decisions archived in `.planning/archive/v1.0-MILESTONE.md`.

**v1.1-rc decisions (Phase 8):**

| Decision | Phase-Plan | Rationale |
|----------|------------|-----------|
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
|----------|------------|-----------|
| Preserve scripts/ directory | 09-02 | Legitimate utility scripts distinct from temporary test scripts |
| Delete schema.prisma.backup | 09-02 | Content well-documented in research notes, safe for parallel execution |
| Keep essential documentation | 09-02 | README.md, DEPLOYMENT.md, SETUP.md needed for Phase 11 deployment |

### Known Issues

1. **Sync timeout bug** -- **FIXED** (root cause: JWT expiring in 86.4s not 24h, plus SSE/timeout improvements)
2. **Gateway TypeScript errors** -- Prisma schema mismatches, Fastify type issues (Phase 9 scope)
3. **Ingestion manual schemas** -- Uses hardcoded schemas instead of generated ones (Phase 9 scope)

### Pending Todos

None.

### Blockers/Concerns

None.

## Session Continuity

Last session: 2026-02-04 -- Completed 09-02-PLAN.md (repository cleanup)
Stopped at: Phase 9 Plan 02 complete - 1/2 plans done
Resume file: None

### Phase 8 Summary (Completed 2026-02-04)
- 08-01: SSE heartbeat (15s), SQL timeout 120s, batch delay 100ms, nginx config
- 08-02: Error classifier (11 types), AbortSignal.timeout (2min) in all 4 API clients
- 08-03: Gateway bulk ingestion (createMany + $transaction) replacing N+1
- Post-plan fixes: JWT expiration parsing (root cause of ~60s failure), dashboard UI (button reset, localStorage persistence, timestamp format dd/mm/yyyy HH:mm:ss, cancel button flash fix, RECIBIDOS incremental tracking, clear metrics button, background circles removed)

### Phase 9 Progress (In Progress)
- 09-02: Repository cleanup (60+ temporary files removed: test scripts, backups, debug logs) - **COMPLETE**
