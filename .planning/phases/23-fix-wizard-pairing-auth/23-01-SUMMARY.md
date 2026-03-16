---
phase: 23-fix-wizard-pairing-auth
plan: 01
subsystem: auth
tags: [jwt, fastify, systemState, pairing, setup-wizard]

requires:
  - phase: 22-simplify-sync-gateway-auth
    provides: "POST /api/setup/token endpoint, JWT-only auth"
  - phase: 20-gateway-pairing-routes
    provides: "Pairing generate/claim routes, pairing-store"
provides:
  - "setupComplete flag on systemState singleton"
  - "Widened /api/setup/token guard surviving mode transitions"
  - "Token lockout after successful pairing claim"
  - "Wizard flow end-to-end integration test"
affects: [setup-wizard, pairing, gateway-auth]

tech-stack:
  added: []
  patterns: ["systemState flag for cross-module lifecycle tracking"]

key-files:
  created:
    - "objetiva-sync-gateway/tests/integration/wizard-flow.test.ts"
  modified:
    - "objetiva-sync-gateway/src/lib/system-state.ts"
    - "objetiva-sync-gateway/src/routes/setup.ts"
    - "objetiva-sync-gateway/src/routes/pairing.ts"
    - "objetiva-sync-gateway/src/utils/env-writer.ts"
    - "objetiva-sync-gateway/tests/integration/setup-wizard.integration.test.ts"

key-decisions:
  - "Widened token guard with OR condition: setup-only mode OR (normal mode AND !setupComplete)"
  - "setupComplete set in claim handler, not apply-config -- locks after actual pairing, not just config application"
  - "Mocked child_process.execSync in wizard-flow test to avoid Prisma migration dependency"

patterns-established:
  - "systemState lifecycle flags: use boolean flags for cross-module state like setupComplete"

requirements-completed: [AUTH-RM-04, AUTH-RM-05, PAIR-01, PAIR-02]

duration: 6min
completed: 2026-03-16
---

# Phase 23 Plan 01: Fix Wizard Pairing Auth Summary

**Fixed 403 bug in /api/setup/token by widening guard to allow normal mode before first claim, with setupComplete lockout after pairing**

## Performance

- **Duration:** 6 min
- **Started:** 2026-03-16T21:28:46Z
- **Completed:** 2026-03-16T21:34:42Z
- **Tasks:** 2
- **Files modified:** 6

## Accomplishments
- Fixed critical 403 bug: POST /api/setup/token now works after apply-config transitions mode to normal
- Added setupComplete flag to systemState singleton for lifecycle tracking
- Token endpoint locks permanently after successful pairing claim (security)
- Full wizard flow integration test validates save-domain -> save-jwt-secret -> apply-config -> token -> pairing/generate
- Cleaned SYNC_PASSWORD reference from env-writer.ts JSDoc

## Task Commits

Each task was committed atomically:

1. **Task 1 RED: Add failing tests** - `cc29bff` (test)
2. **Task 1 GREEN: Fix token guard, add setupComplete, wire claim** - `3bc4c5c` (feat)
3. **Task 2: Wizard flow end-to-end integration test** - `b925022` (test)

_TDD flow: RED commit has failing test, GREEN commit implements the fix_

## Files Created/Modified
- `objetiva-sync-gateway/src/lib/system-state.ts` - Added setupComplete boolean property
- `objetiva-sync-gateway/src/routes/setup.ts` - Widened /api/setup/token guard with canIssueToken logic
- `objetiva-sync-gateway/src/routes/pairing.ts` - Set systemState.setupComplete=true on successful claim
- `objetiva-sync-gateway/src/utils/env-writer.ts` - Fixed JSDoc example: SYNC_PASSWORD -> JWT_SECRET
- `objetiva-sync-gateway/tests/integration/setup-wizard.integration.test.ts` - Updated 403 test to include setupComplete, added normal+!setupComplete test
- `objetiva-sync-gateway/tests/integration/wizard-flow.test.ts` - New end-to-end wizard flow test (3 test cases)

## Decisions Made
- Widened token guard with OR condition rather than reordering wizard steps -- less risky
- setupComplete set in claim handler (not apply-config) so token remains available between apply-config and first claim
- Mocked child_process.execSync in wizard-flow test to avoid needing a real PostgreSQL for Prisma migrations

## Deviations from Plan

None - plan executed exactly as written.

## Pre-existing Test Failures (Out of Scope)

4 tests in `setup-wizard.integration.test.ts` fail on save-domain: tests send `{protocol, domain, port}` but endpoint expects `{url}`. This is a schema mismatch from a prior refactor, not caused by this plan's changes.

1 test in `cli-regenerate.integration.test.ts` fails with fetch error (external dependency). Also pre-existing.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness
- Token endpoint guard is fixed and tested
- setupComplete flag wired end-to-end
- Ready for plan 23-02 (fast-jwt dependency + cleanup) -- already completed

---
*Phase: 23-fix-wizard-pairing-auth*
*Completed: 2026-03-16*
