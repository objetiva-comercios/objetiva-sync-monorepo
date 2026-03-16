---
phase: 22-simplify-sync-gateway-auth-to-token-based-pairing-only
plan: 01
subsystem: auth
tags: [jwt, fastify, fast-jwt, gateway, setup-wizard, pairing, codegen]

# Dependency graph
requires:
  - phase: 20-gateway-pairing-routes
    provides: "Pairing code generate/claim endpoints, setup wizard step 6"
provides:
  - "Gateway with JWT-only authentication (no password-based auth)"
  - "5-step setup wizard (no password step)"
  - "POST /api/setup/token endpoint for setup-only mode JWT issuance"
  - "Codegen local JWT signing via fast-jwt (no /auth/login dependency)"
affects: [objetiva-sync, gateway-dashboard]

# Tech tracking
tech-stack:
  added: [fast-jwt]
  patterns: [local-jwt-signing-for-scripts, setup-only-token-endpoint]

key-files:
  created: []
  modified:
    - objetiva-sync-gateway/src/app.ts
    - objetiva-sync-gateway/src/routes/setup.ts
    - objetiva-sync-gateway/src/routes/pairing.ts
    - objetiva-sync-gateway/src/routes/preflight.ts
    - objetiva-sync-gateway/src/codegen/index.ts
    - objetiva-sync-gateway/scripts/regenerate-schemas.ts

key-decisions:
  - "POST /api/setup/token replaces /auth/login for setup wizard JWT acquisition"
  - "Codegen uses fast-jwt createSigner for local JWT signing instead of HTTP /auth/login call"
  - "SYNC_PASSWORD and SYNC_USERNAME completely removed from gateway (env, routes, preflight, pairing response)"
  - "Setup wizard reduced from 6 steps to 5 (password step removed entirely)"
  - "apply-config no longer checks for SYNC_PASSWORD in required env vars"

patterns-established:
  - "Local JWT signing: Scripts needing auth sign tokens locally with JWT_SECRET instead of calling /auth/login"
  - "Setup-only token: POST /api/setup/token provides JWT during setup-only mode, returns 403 in normal mode"

requirements-completed: [AUTH-RM-01, AUTH-RM-02, AUTH-RM-03, AUTH-RM-04, AUTH-RM-05]

# Metrics
duration: 11min
completed: 2026-03-16
---

# Phase 22 Plan 01: Remove Password Auth Summary

**Gateway stripped to JWT-only auth: deleted auth routes, 5-step wizard with /api/setup/token endpoint, codegen uses fast-jwt local signing**

## Performance

- **Duration:** 11 min
- **Started:** 2026-03-16T16:28:17Z
- **Completed:** 2026-03-16T16:39:42Z
- **Tasks:** 2
- **Files modified:** 15

## Accomplishments
- Deleted src/routes/auth.ts entirely (login, refresh, diagnostics, change-password) and its integration tests
- Removed syncPassword from pairing claim response (now returns only gatewayUrl + jwtSecret)
- Added POST /api/setup/token endpoint: issues JWT in setup-only mode, 403 otherwise
- Renumbered setup wizard from 6 steps to 5 (removed password step completely)
- Codegen script now uses fast-jwt createSigner for local JWT signing (no network call needed)
- Cleaned all SYNC_PASSWORD/SYNC_USERNAME references from env files, preflight, and apply-config

## Task Commits

Each task was committed atomically:

1. **Task 1: Delete auth routes and clean gateway app wiring** - `339dd8f` (feat)
2. **Task 2: Renumber wizard to 5 steps, add setup token endpoint, update codegen auth** - `c624ef9` (feat)

## Files Created/Modified
- `objetiva-sync-gateway/src/routes/auth.ts` - DELETED (login, refresh, diagnostics, change-password)
- `objetiva-sync-gateway/src/app.ts` - Removed auth import/registration, updated SETUP_ONLY_ALLOWLIST
- `objetiva-sync-gateway/src/routes/pairing.ts` - Removed syncPassword from claim response
- `objetiva-sync-gateway/src/routes/preflight.ts` - Removed SYNC_PASSWORD from env vars check
- `objetiva-sync-gateway/src/routes/setup.ts` - 5-step wizard, POST /api/setup/token, removed password step/route
- `objetiva-sync-gateway/src/codegen/index.ts` - Local JWT signing with fast-jwt createSigner
- `objetiva-sync-gateway/scripts/regenerate-schemas.ts` - Require JWT_SECRET instead of SYNC_USERNAME/SYNC_PASSWORD
- `objetiva-sync-gateway/.env.example` - Removed SYNC_PASSWORD/SYNC_USERNAME sections
- `objetiva-sync-gateway/.env.test` - Removed SYNC_USERNAME/SYNC_PASSWORD entries
- `objetiva-sync-gateway/tests/integration/auth.integration.test.ts` - DELETED
- `objetiva-sync-gateway/tests/integration/pairing.integration.test.ts` - Updated claim assertions
- `objetiva-sync-gateway/tests/integration/setup-wizard.integration.test.ts` - Added POST /api/setup/token tests
- `objetiva-sync-gateway/tests/integration/cli-regenerate.integration.test.ts` - Updated auth expectations
- `objetiva-sync-gateway/package.json` - Added fast-jwt dependency
- `package-lock.json` - Updated lockfile

## Decisions Made
- POST /api/setup/token replaces /auth/login for setup wizard JWT acquisition -- simplest approach since the wizard runs in setup-only mode where no credentials exist yet
- Codegen uses fast-jwt createSigner for local JWT signing -- eliminates network dependency on running gateway for auth, only needs JWT_SECRET env var
- fast-jwt added as explicit dependency even though it was transitively available via @fastify/jwt -- ensures codegen script works regardless of @fastify/jwt internals
- Setup wizard auth field in /api/setup/status now returns null (no password info to show)

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - Missing Critical] Removed SetPasswordSchema and set-password route handler**
- **Found during:** Task 2 (setup wizard renumbering)
- **Issue:** SetPasswordSchema and POST /api/setup/set-password route handler referenced SYNC_PASSWORD/SYNC_USERNAME -- orphaned code after removing password step
- **Fix:** Deleted both the schema definition and the route handler
- **Files modified:** objetiva-sync-gateway/src/routes/setup.ts
- **Verification:** TypeScript compilation succeeds, no references to SetPasswordSchema remain
- **Committed in:** c624ef9 (Task 2 commit)

**2. [Rule 2 - Missing Critical] Cleaned /api/setup/status SYNC_PASSWORD references**
- **Found during:** Task 2 (setup wizard renumbering)
- **Issue:** The status endpoint exposed SYNC_PASSWORD and SYNC_USERNAME info for pre-fill -- no longer needed
- **Fix:** Removed SYNC_USERNAME/SYNC_PASSWORD variables and auth info construction, return auth: null
- **Files modified:** objetiva-sync-gateway/src/routes/setup.ts
- **Verification:** GET /api/setup/status test passes with gatewayUrl field present
- **Committed in:** c624ef9 (Task 2 commit)

---

**Total deviations:** 2 auto-fixed (2 missing critical)
**Impact on plan:** Both auto-fixes necessary for completeness -- orphaned password code would reference removed functionality. No scope creep.

## Issues Encountered
- Pre-existing test failures in setup-wizard.integration.test.ts (4 save-domain tests use old { protocol, domain } payload format instead of { url }) -- these failures exist on main branch before this plan's changes, logged as deferred item

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Gateway runs without SYNC_PASSWORD or SYNC_USERNAME env vars
- POST /auth/login returns 404 (route removed)
- All gateway integration tests that were passing before still pass
- Ready for objetiva-sync client-side auth cleanup (plan 22-02)

---
*Phase: 22-simplify-sync-gateway-auth-to-token-based-pairing-only*
*Completed: 2026-03-16*
