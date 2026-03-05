---
phase: 20-gateway-pairing-routes
plan: 01
subsystem: api
tags: [fastify, pairing, rate-limit, crypto, in-memory, tdd]

# Dependency graph
requires:
  - phase: 18-preflight-validator
    provides: "env-writer utility and system-state singleton used by app.ts"
  - phase: 19-setup-wizard-enhancement
    provides: "authenticate middleware and @fastify/rate-limit registration in app.ts"
provides:
  - "In-memory pairing code store (pairing-store.ts) with generateCode/claimCode/getActiveCode/_resetForTest"
  - "POST /api/pairing/generate endpoint (JWT-authenticated, issues 6-char codes)"
  - "POST /api/pairing/claim endpoint (unauthenticated, rate-limited 5/min/IP)"
  - "/api/pairing/ added to SETUP_ONLY_ALLOWLIST"
affects: [20-gateway-pairing-routes, wizard-step-6]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "In-memory singleton with module-level let + Set for TTL-managed short-lived codes"
    - "claimCode returns discriminated union ('ok'|'consumed'|'invalid') for distinct HTTP status codes (200/410/404)"
    - "Each integration test describe group uses own buildApp() instance to avoid rate limit state leakage"
    - "crypto.randomBytes with modulo-bias-free charset selection (CHARSET.length=32, 256%32===0)"

key-files:
  created:
    - "objetiva-sync-gateway/src/lib/pairing-store.ts"
    - "objetiva-sync-gateway/src/routes/pairing.ts"
    - "objetiva-sync-gateway/tests/unit/pairing-store.test.ts"
    - "objetiva-sync-gateway/tests/integration/pairing.integration.test.ts"
  modified:
    - "objetiva-sync-gateway/src/app.ts"

key-decisions:
  - "Test isolation for rate-limited claim endpoint: each describe block uses its own buildApp() instance to prevent rate limit counter accumulation across tests"
  - "claimCode discriminated union: 'ok'/'consumed'/'invalid' enables clean 200/410/404 mapping without additional state queries"
  - "TTL enforced by Date.now() comparison in claimCode (not just setTimeout cleanup) — prevents race where setTimeout fires slightly late"
  - "Consumed codes Set bounded by TTL+5s cleanup via secondary setTimeout with .unref()"

patterns-established:
  - "Rate-limited Fastify routes use config.rateLimit: { max, timeWindow } with @fastify/rate-limit registered globally in app.ts"
  - "In-memory stores for test isolation: export _resetForTest() that clears all module-level state + pending timers"
  - "Response format: { success: true, ...data } or { success: false, error: 'CODE_CONSTANT', message: '...' }"

requirements-completed: [PAIR-01, PAIR-02, PAIR-03, PAIR-04, PAIR-05]

# Metrics
duration: 7min
completed: 2026-03-05
---

# Phase 20 Plan 01: Pairing Code Backend Summary

**In-memory pairing code store (crypto-random 6-char codes, 10min TTL) with authenticated generate and rate-limited claim endpoints, delivering gateway credentials (gatewayUrl, jwtSecret, syncPassword) in one API call**

## Performance

- **Duration:** 7 min
- **Started:** 2026-03-05T15:29:06Z
- **Completed:** 2026-03-05T15:36:03Z
- **Tasks:** 2
- **Files modified:** 5

## Accomplishments

- pairing-store.ts module: generateCode (32-char unambiguous charset, .unref() timers), claimCode (case-insensitive, 'ok'/'consumed'/'invalid' discrimination), getActiveCode, _resetForTest — 20 unit tests all passing
- POST /api/pairing/generate: requires JWT auth via authenticate middleware, invalidates previous active code, returns { success, code, expiresAt }
- POST /api/pairing/claim: unauthenticated, rate-limited to 5/min/IP via @fastify/rate-limit, maps store result to 200/404/410/400/429 — 15 integration tests all passing
- /api/pairing/ added to SETUP_ONLY_ALLOWLIST so both endpoints work during setup wizard
- 35 total new tests (20 unit + 15 integration), no pre-existing tests broken

## Task Commits

Each task was committed atomically:

1. **Task 1: Pairing store module with TDD** - `71b99c0` (feat)
2. **Task 2: Pairing routes + app.ts registration with integration tests** - `10d1ebb` (feat)

_Note: TDD tasks had single commits each (combined test+implementation per task for GREEN phase)_

## Files Created/Modified

- `objetiva-sync-gateway/src/lib/pairing-store.ts` — In-memory store: generateCode, claimCode, getActiveCode, _resetForTest
- `objetiva-sync-gateway/src/routes/pairing.ts` — registerPairingRoutes: /api/pairing/generate (authenticated) + /api/pairing/claim (rate-limited)
- `objetiva-sync-gateway/src/app.ts` — Added import + registerPairingRoutes(app) call + '/api/pairing/' to SETUP_ONLY_ALLOWLIST
- `objetiva-sync-gateway/tests/unit/pairing-store.test.ts` — 20 unit tests using vi.useFakeTimers() for TTL expiry coverage
- `objetiva-sync-gateway/tests/integration/pairing.integration.test.ts` — 15 integration tests across 6 describe blocks (separate app instances)

## Decisions Made

- Each integration test describe block uses its own `buildApp()` instance: the claim endpoint has a 5/min rate limit per IP; a single shared app would exhaust the counter across tests, causing 429 failures in unrelated assertions. Separate instances give each test group a clean rate limit counter.
- `claimCode` returns a discriminated union string ('ok'/'consumed'/'invalid') rather than throwing or returning complex objects. This keeps the store logic pure and lets the route handler map cleanly to HTTP status codes (200/410/404) with no additional state queries.
- TTL validation via `Date.now() >= entry.expiresAt.getTime()` in claimCode (not relying solely on setTimeout cleanup). This prevents a race condition where the timeout fires slightly late but the code is still considered valid.

## Deviations from Plan

None — plan executed exactly as written.

## Issues Encountered

- Rate limit test isolation: initial test design used a single app instance for all tests. Rate limit counter persisted across test cases within the suite, causing 429 responses in tests expecting 404/400. Fixed by splitting each logical test group into its own describe block with its own app instance (deviation Rule 3 — blocking issue auto-fixed during Task 2).

## User Setup Required

None — no external service configuration required.

## Next Phase Readiness

- Pairing backend is complete: generate + claim endpoints operational with full test coverage
- Ready for Phase 20-02 (if it exists): wizard step 6 UI implementation can call POST /api/pairing/generate on enter and display the code with countdown
- No blockers. The PC-02 blocker from STATE.md (pairing token persistence strategy) was resolved: SYNC_PASSWORD is read directly from process.env at claim time — no separate persistence needed since set-password stores it in .env as plaintext (confirmed in plan context)

## Self-Check: PASSED

- FOUND: objetiva-sync-gateway/src/lib/pairing-store.ts
- FOUND: objetiva-sync-gateway/src/routes/pairing.ts
- FOUND: objetiva-sync-gateway/tests/unit/pairing-store.test.ts
- FOUND: objetiva-sync-gateway/tests/integration/pairing.integration.test.ts
- FOUND: .planning/phases/20-gateway-pairing-routes/20-01-SUMMARY.md
- FOUND: commit 71b99c0 (pairing-store module)
- FOUND: commit 10d1ebb (pairing routes + app.ts registration)

---
*Phase: 20-gateway-pairing-routes*
*Completed: 2026-03-05*
