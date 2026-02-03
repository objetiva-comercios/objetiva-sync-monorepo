---
phase: 08-sync-reliability
plan: 01
subsystem: sync
tags: [sse, nginx, sqlserver, timeout, streaming, heartbeat]

# Dependency graph
requires:
  - phase: 07-phase-3-schema-driven
    provides: sync streaming endpoint, SQL Server adapter, batch processing
provides:
  - SSE heartbeat mechanism preventing proxy timeout
  - SQL Server extended timeouts for large queries (120s)
  - Reduced batch delay for faster throughput (100ms)
  - Nginx reverse proxy configuration for SSE streaming
affects: [monitoring, deployment]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "SSE heartbeat pattern for long-lived streaming connections"
    - "Nginx SSE-specific configuration (proxy_buffering off)"

key-files:
  created:
    - objetiva-sync/nginx/objetiva-sync.conf
  modified:
    - objetiva-sync/src/dashboard/routes/api/sync.ts
    - objetiva-sync/src/config/constants.ts
    - objetiva-sync/src/adapters/sqlserver/sqlserver-adapter.ts

key-decisions:
  - "15s heartbeat interval chosen to stay well under typical 60s proxy timeouts"
  - "120s SQL Server timeout allows 100K+ row queries over network"
  - "100ms batch delay reduced from 500ms for 5x throughput improvement"

patterns-established:
  - "SSE heartbeat: setInterval writing ': heartbeat\\n\\n' every 15s"
  - "Cleanup pattern: clearInterval on both connection close and stream end"

# Metrics
duration: 6min
completed: 2026-02-03
---

# Phase 8 Plan 1: Sync Reliability Summary

**SSE heartbeat preventing ~60s timeout, SQL Server timeout increased to 120s, batch delay reduced 5x to 100ms**

## Performance

- **Duration:** 6 min
- **Started:** 2026-02-03T21:28:53Z
- **Completed:** 2026-02-03T21:35:04Z
- **Tasks:** 2
- **Files modified:** 4

## Accomplishments
- SSE stream endpoint sends heartbeat every 15 seconds to keep proxy connections alive
- SQL Server queries can now handle 100K+ records without timeout (120s limit)
- Batch processing delay reduced from 500ms to 100ms (5x faster sync throughput)
- Nginx configuration created for sync service with SSE-appropriate settings

## Task Commits

Each task was committed atomically:

1. **Task 1: Add SSE heartbeat and connection cleanup to sync stream endpoint** - `a1bca6f` (feat)
2. **Task 2: Increase SQL Server timeout, reduce batch delay, create nginx config** - `8b87f5e` (feat)

## Files Created/Modified

### Created
- `objetiva-sync/nginx/objetiva-sync.conf` - Nginx reverse proxy config for sync service with SSE-specific settings (proxy_buffering off, 600s timeout, Connection '' header)

### Modified
- `objetiva-sync/src/dashboard/routes/api/sync.ts` - Added 15s heartbeat interval writing SSE comment lines, cleanup on connection close and before all reply.raw.end() calls
- `objetiva-sync/src/config/constants.ts` - Changed DELAY_BETWEEN_BATCHES_MS from 500ms to 100ms, QUERY_TIMEOUT_MS from 30s to 120s
- `objetiva-sync/src/adapters/sqlserver/sqlserver-adapter.ts` - Changed requestTimeout default from 10s to 120s, connectionTimeout from 10s to 30s (both in Zod schema and runtime defaults)

## Decisions Made

1. **15-second heartbeat interval** - Chosen to stay well under typical 60s proxy timeouts while minimizing overhead. Heartbeat writes SSE comment format (`: heartbeat\\n\\n`) per spec.

2. **120-second SQL Server timeout** - Large queries returning 100K+ rows over network can take 15-60 seconds. Previous 10s timeout was too aggressive for production dataset sizes.

3. **100ms batch delay** - Reduced from 500ms for 5x throughput improvement. 500ms * 1000 batches = 500s of pure waiting. 100ms * 1000 = 100s. Still provides backpressure but dramatically faster.

4. **Nginx proxy_buffering off** - Critical for SSE. Buffering would prevent real-time event delivery to client. Also set 600s proxy_read_timeout for 10+ minute syncs.

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None.

## User Setup Required

**Deployment configuration required.** Nginx config created at `objetiva-sync/nginx/objetiva-sync.conf`:

1. Adjust `server_name` from placeholder `sync.sanchezrepuestos.com.ar` to actual domain
2. Verify internal port matches Fastify (default 3000)
3. Copy config to `/etc/nginx/sites-available/` and symlink to `sites-enabled/`
4. Run certbot for SSL certificates
5. Reload nginx: `sudo nginx -t && sudo systemctl reload nginx`

## Next Phase Readiness

**Ready for Phase 8 Plan 2 (Error Classification).** Timeout root cause addressed:

- SSE heartbeat prevents proxy timeout
- SQL Server can handle large queries without timing out
- Batch delay reduced for faster sync completion
- Nginx configuration ready for deployment

**Remaining Phase 8 scope:**
- Error classification (plan 2)
- Gateway bulk ingestion (plan 3)

---
*Phase: 08-sync-reliability*
*Completed: 2026-02-03*
