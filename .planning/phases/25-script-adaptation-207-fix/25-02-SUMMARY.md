---
phase: 25-script-adaptation-207-fix
plan: 02
subsystem: api
tags: [api-client, 207, multi-status, vitest, unit-tests, batch-sync]

requires:
  - phase: 25-00 (Wave 0 test scaffold — created inline in this plan due to missing execution)

provides:
  - 207 Multi-Status conditional success logic in all 4 sync API clients
  - Unit tests for 207 handling behavior (20 tests, all green)
  - articulos-client: preserves data.result fallback, now returns success:true for 0-error 207
  - comprobantes-cabecera-client: returns success:true for 0-error 207
  - comprobantes-detalle-client: returns success:true for 0-error 207
  - comprobantes-pagos-client: returns success:true for 0-error 207

affects: [sync-metrics, batch-processing, sync-orchestration]

tech-stack:
  added: []
  patterns:
    - "207 conditional success: hasErrors = errors.length > 0; success: !hasErrors"
    - "Conditional log level: logger.info for success, logger.warn for partial errors"
    - "Per-client result extraction preserved: articulos uses data.result, others use data"

key-files:
  created:
    - objetiva-sync/tests/unit/api-client-207-fix.test.ts
  modified:
    - objetiva-sync/src/api-client/articulos-client.ts
    - objetiva-sync/src/api-client/comprobantes-cabecera-client.ts
    - objetiva-sync/src/api-client/comprobantes-detalle-client.ts
    - objetiva-sync/src/api-client/comprobantes-pagos-client.ts

key-decisions:
  - "207 with errors.length === 0 is a full success (success: true), not a failure"
  - "Log level is info for 0-error batches, warn for partial errors (D-05, D-06)"
  - "Each client's result extraction pattern preserved as-is (data.result vs data fallback)"

patterns-established:
  - "207 success gate: const hasErrors = errors.length > 0; return { success: !hasErrors }"
  - "Unit test mock pattern: vi.spyOn(globalThis, 'fetch').mockResolvedValue(mockResponse(207, body))"

requirements-completed: [FIX-01]

duration: 10min
completed: 2026-03-29
---

# Phase 25 Plan 02: 207 Multi-Status Fix Summary

**Fixed 207 Multi-Status bug in all 4 sync API clients — batches with 0 errors now return `success: true` and log at `info` level instead of always failing with `success: false`**

## Performance

- **Duration:** ~10 min
- **Started:** 2026-03-29T22:47:00Z
- **Completed:** 2026-03-29T22:52:22Z
- **Tasks:** 1
- **Files modified:** 5 (4 clients + 1 new test file)

## Accomplishments

- Fixed the 207 bug in all 4 sync API clients: `articulos-client`, `comprobantes-cabecera-client`, `comprobantes-detalle-client`, `comprobantes-pagos-client`
- Each client now computes `const hasErrors = errors.length > 0` and returns `success: !hasErrors`
- Log level is `info` when errors === 0 ("Batch exitoso, sin errores"), `warn` when errors > 0 ("207 Multi-Status")
- Created 20 unit tests covering all 4 clients for 207/0-errors and 207/errors>0 paths — all green

## Task Commits

1. **Task 1: Fix 207 handling in all 4 sync API clients and unskip tests** - `c9b8a1f` (fix)

## Files Created/Modified

- `objetiva-sync/src/api-client/articulos-client.ts` - Fixed 207 block: `success: !hasErrors`, conditional log level, preserves `data.data || data.result`
- `objetiva-sync/src/api-client/comprobantes-cabecera-client.ts` - Fixed 207 block: `success: !hasErrors`, conditional log level, preserves `data.data || data`
- `objetiva-sync/src/api-client/comprobantes-detalle-client.ts` - Fixed 207 block: `success: !hasErrors`, conditional log level, preserves `data.data || data`
- `objetiva-sync/src/api-client/comprobantes-pagos-client.ts` - Fixed 207 block: `success: !hasErrors`, conditional log level, preserves `data.data || data`
- `objetiva-sync/tests/unit/api-client-207-fix.test.ts` - 20 unit tests for 207 behavior across all 4 clients

## Decisions Made

- Applied the fix inline with test creation since Wave 0 (25-00) test scaffold was not yet executed — combined both into one commit for atomic delivery
- Preserved each client's existing result extraction line exactly (articulos uses `data.result`, others use `data`)

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Test file created inline (Wave 0 not executed)**
- **Found during:** Task 1 (before unskipping tests)
- **Issue:** `objetiva-sync/tests/unit/api-client-207-fix.test.ts` did not exist — Wave 0 plan (25-00) had not been executed, blocking Step 1 of Task 1
- **Fix:** Created the test file directly with all tests active (no `it.skip` needed since the fix was applied in the same task), covering all 4 clients with 5 tests each (20 total)
- **Files modified:** `objetiva-sync/tests/unit/api-client-207-fix.test.ts`
- **Verification:** `npx vitest run tests/unit/api-client-207-fix.test.ts` — 20/20 tests pass
- **Committed in:** `c9b8a1f`

---

**Total deviations:** 1 auto-fixed (1 blocking)
**Impact on plan:** Combined Wave 0 test creation with Wave 1 fix — functionally equivalent outcome, no scope creep.

## Issues Encountered

None beyond the missing test file (handled as deviation above).

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- All 4 sync API clients correctly handle 207 responses with conditional success based on `errors.length`
- 20 unit tests provide regression coverage for the 207 bug
- Ready for Phase 25 plans 03+ (script adaptation, schema status page)

---
*Phase: 25-script-adaptation-207-fix*
*Completed: 2026-03-29*

## Self-Check: PASSED
