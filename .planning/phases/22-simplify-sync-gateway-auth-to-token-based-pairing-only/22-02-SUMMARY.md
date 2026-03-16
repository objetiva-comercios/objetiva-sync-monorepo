---
phase: 22-simplify-sync-gateway-auth-to-token-based-pairing-only
plan: 02
subsystem: auth
tags: [jwt, fast-jwt, gateway-client, pairing, dashboard]

requires:
  - phase: 21
    provides: "gateway-client.ts with getJwtToken() and pairing claim route"
provides:
  - "Sync batch clients authenticate via getJwtToken() directly, no AuthManager"
  - "APIClient with simplified constructor (baseUrl only)"
  - "Dashboard config form without password/username fields"
  - "Pairing claim saves only REMOTE_API_URL + JWT_SECRET"
  - "Test Connection via JWT + /health instead of /auth/login"
affects: []

tech-stack:
  added: []
  patterns:
    - "Direct JWT signing in batch clients via getJwtToken() import"
    - "Pairing-based auth: no credentials in config, JWT secret from pairing flow"

key-files:
  created: []
  modified:
    - "objetiva-sync/src/api-client/index.ts"
    - "objetiva-sync/src/api-client/articulos-client.ts"
    - "objetiva-sync/src/api-client/comprobantes-cabecera-client.ts"
    - "objetiva-sync/src/api-client/comprobantes-detalle-client.ts"
    - "objetiva-sync/src/api-client/comprobantes-pagos-client.ts"
    - "objetiva-sync/src/sync/scheduler-instance.ts"
    - "objetiva-sync/src/dashboard/routes/api/config.ts"
    - "objetiva-sync/src/dashboard/routes/api/sync.ts"
    - "objetiva-sync/src/dashboard/views/config/api.ejs"
    - "objetiva-sync/tests/unit/config-pairing-claim.test.ts"
    - "objetiva-sync/src/__tests__/api-client-metadata.test.ts"

key-decisions:
  - "AuthManager class deleted entirely -- no backward compat shim"
  - "Batch clients import getJwtToken directly (no abstraction layer)"
  - "Scheduler checks JWT_SECRET instead of password to determine pairing status"
  - "Test Connection hits /health with JWT instead of /auth/login with credentials"
  - "Pairing claim saves only 2 keys (URL + JWT_SECRET) instead of 4"

patterns-established:
  - "JWT-only auth: all sync API requests use getJwtToken() from gateway-client.ts"
  - "Pairing status: check JWT_SECRET config key to determine if gateway is paired"

requirements-completed: [AUTH-RM-06, AUTH-RM-07, AUTH-RM-08]

duration: 14min
completed: 2026-03-16
---

# Phase 22 Plan 02: Sync Auth Simplification Summary

**Deleted AuthManager, refactored all batch clients to direct JWT signing via getJwtToken(), simplified APIClient constructor to baseUrl-only, and updated dashboard config to show pairing status instead of token expiry**

## Performance

- **Duration:** 14 min
- **Started:** 2026-03-16T16:27:29Z
- **Completed:** 2026-03-16T16:41:30Z
- **Tasks:** 2
- **Files modified:** 11

## Accomplishments
- Deleted AuthManager class and all login/refresh/token caching logic (282 lines removed)
- All 4 batch clients now use getJwtToken() directly for auth -- no intermediate abstraction
- Dashboard config form simplified: no password/username fields, shows pairing status (Enlazado/No enlazado)
- Pairing claim handler saves only REMOTE_API_URL + JWT_SECRET (was saving 4 keys including password)
- Test Connection uses JWT + /health endpoint instead of /auth/login with credentials

## Task Commits

Each task was committed atomically:

1. **Task 1: Delete AuthManager and refactor batch clients + APIClient + scheduler** - `04c5f55` (feat)
2. **Task 2: Update sync dashboard config form, pairing claim handler, and connection test** - `bf5d4e8` (feat)

## Files Created/Modified
- `objetiva-sync/src/api-client/auth.ts` - DELETED (AuthManager class)
- `objetiva-sync/src/api-client/index.ts` - Simplified APIClient: baseUrl-only constructor, JWT-based testConnection
- `objetiva-sync/src/api-client/articulos-client.ts` - Uses getJwtToken() directly
- `objetiva-sync/src/api-client/comprobantes-cabecera-client.ts` - Uses getJwtToken() directly
- `objetiva-sync/src/api-client/comprobantes-detalle-client.ts` - Uses getJwtToken() directly
- `objetiva-sync/src/api-client/comprobantes-pagos-client.ts` - Uses getJwtToken() directly
- `objetiva-sync/src/sync/scheduler-instance.ts` - Checks JWT_SECRET for pairing, no password decryption
- `objetiva-sync/src/dashboard/routes/api/config.ts` - JWT-based test connection, 2-key pairing claim
- `objetiva-sync/src/dashboard/routes/api/sync.ts` - APIClient creation without password
- `objetiva-sync/src/dashboard/views/config/api.ejs` - Removed password/username fields, pairing status display
- `objetiva-sync/tests/unit/config-pairing-claim.test.ts` - Updated for 2-key save behavior
- `objetiva-sync/src/__tests__/api-client-metadata.test.ts` - Mock getJwtToken instead of AuthManager

## Decisions Made
- AuthManager deleted entirely with no backward compat shim -- clean break from password-based auth
- Batch clients import getJwtToken directly rather than through an abstraction layer (simpler, fewer indirections)
- Scheduler checks JWT_SECRET config key (not password) to determine if gateway is paired
- Test Connection hits /health with JWT bearer token instead of /auth/login with credentials
- Pairing claim saves only 2 config keys (URL + JWT_SECRET) instead of 4 (removing USERNAME + PASSWORD)

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Updated sync.ts APIClient creation**
- **Found during:** Task 1
- **Issue:** sync.ts creates APIClient instances with username/password in 3 places -- would break with simplified interface
- **Fix:** Updated all 3 APIClient creation sites in sync.ts to use baseUrl-only, check JWT_SECRET instead of password
- **Files modified:** objetiva-sync/src/dashboard/routes/api/sync.ts
- **Verification:** No compilation errors, pattern matches all other APIClient usages
- **Committed in:** 04c5f55 (Task 1 commit)

**2. [Rule 1 - Bug] Fixed empty batch test assertions**
- **Found during:** Task 1
- **Issue:** Two metadata format tests sent empty batches (0 items), which return early without calling fetch, causing undefined access on mock.calls
- **Fix:** Changed tests to send 1-item batches so fetch is actually called
- **Verification:** All 7 api-client-metadata tests pass
- **Committed in:** 04c5f55 (Task 1 commit)

---

**Total deviations:** 2 auto-fixed (1 blocking, 1 bug)
**Impact on plan:** Both auto-fixes necessary for correctness. No scope creep.

## Issues Encountered
- Pre-existing test failures unrelated to this plan: schema-validation integration tests require running gateway, repositories-query-based tests have SQLite issues, sync-engine-metadata tests have @shared/schemas resolution issues. All pre-existing.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- JWT-only auth fully implemented on the sync side
- AuthManager fully removed from production code
- Ready for Phase 22 completion / milestone verification

---
*Phase: 22-simplify-sync-gateway-auth-to-token-based-pairing-only*
*Completed: 2026-03-16*
