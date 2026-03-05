---
phase: 20-gateway-pairing-routes
plan: 02
subsystem: ui
tags: [fastify, wizard, pairing, html, javascript, countdown, clipboard]

# Dependency graph
requires:
  - phase: 20-gateway-pairing-routes
    provides: "Plan 01 — POST /api/pairing/generate and POST /api/pairing/claim endpoints"
  - phase: 19-setup-wizard-enhancement
    provides: "5-step setup wizard pattern and state.stepData conventions"
provides:
  - "Wizard step 6 'Link Sync Client' HTML/JS in setup.ts"
  - "Auto-generate pairing code on step 6 enter via POST /api/pairing/generate"
  - "Countdown timer, copy button, Generate New Code button in step 6"
  - "Domain gating: warning shown if GATEWAY_PUBLIC_URL not configured"
  - "JWT token acquired at password step and stored in state.token for step 6"
  - "/auth/login added to SETUP_ONLY_ALLOWLIST for token acquisition during setup-only mode"
affects: [wizard-step-6, pairing-flow, operator-ux]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Auto-fetch on step enter: enterPairingStep() called from advanceStep() when next === 5"
    - "Countdown via setInterval + clearInterval, rebased on new expiresAt on each regenerate"
    - "JWT token acquired immediately after password save, stored in state.token for cross-step use"
    - "Domain gating via state.stepData.gatewayUrl && !state.stepData.domainSkipped check"

key-files:
  created: []
  modified:
    - "objetiva-sync-gateway/src/routes/setup.ts"
    - "objetiva-sync-gateway/src/app.ts"

key-decisions:
  - "Acquire JWT token in savePasswordAndNext() via /auth/login immediately after password is saved — password is still in memory, avoids needing a separate step"
  - "Add /auth/login to SETUP_ONLY_ALLOWLIST so token acquisition works in setup-only mode — small targeted allowance since credentials are already saved at that point"
  - "advanceStep() calls enterPairingStep() via if (next === 5) pattern — mirrors existing if (next === 4) pattern for loadDownloadSummary()"
  - "Token fetch is best-effort (try/catch) — step 6 will show an API error if token is missing, recoverable via Generate New Code"

patterns-established:
  - "Step enter side effects via advanceStep(): add if (next === N) { sideEffectFn(); } — same pattern as loadDownloadSummary"
  - "Clipboard copy with transient label change: store original, set 'Copied!', setTimeout restore"

requirements-completed: [PAIR-01, PAIR-02]

# Metrics
duration: 8min
completed: 2026-03-05
---

# Phase 20 Plan 02: Wizard Step 6 — Link Sync Client Summary

**Wizard step 6 'Link Sync Client' with auto-generated 6-char pairing code, countdown timer, copy button, domain gating, and JWT token acquisition at the password step**

## Performance

- **Duration:** 8 min
- **Started:** 2026-03-05T15:37:31Z
- **Completed:** 2026-03-05T15:45:45Z
- **Tasks:** 1 of 2 (Task 2 is human-verify checkpoint)
- **Files modified:** 2

## Accomplishments

- Wizard updated from 5 to 6 steps; stepper shows 6 dots with "Link Sync" label on step 6
- Step 6 HTML: code display (2.5rem monospace, user-select:all), Copy Code button, Generate New Code button, countdown timer, domain-gating warning panel
- Step 6 JS: enterPairingStep() (domain gating + auto-generate), fetchPairingCode() (POST /api/pairing/generate with JWT auth), startCountdown() (setInterval), copyPairingCode() (navigator.clipboard), regeneratePairingCode()
- Password step now acquires JWT token via /auth/login and stores in state.token — enables step 6 authenticated API call
- /auth/login added to SETUP_ONLY_ALLOWLIST in app.ts — required for token acquisition during setup-only mode
- "Next ->" button added to Download step to advance to step 6
- All existing tests pass; pre-existing 4 failures unchanged

## Task Commits

Each task was committed atomically:

1. **Task 1: Add wizard step 6 — Link Sync Client** - `9b251c7` (feat)

_Task 2 is checkpoint:human-verify — pending operator verification_

## Files Created/Modified

- `objetiva-sync-gateway/src/routes/setup.ts` — Added stepper dot 6, wizard-step-5 HTML, TOTAL_STEPS=6, advanceStep step 5 case, login call in savePasswordAndNext, pairing JS functions (enterPairingStep, fetchPairingCode, startCountdown, copyPairingCode, regeneratePairingCode)
- `objetiva-sync-gateway/src/app.ts` — Added '/auth/login' to SETUP_ONLY_ALLOWLIST

## Decisions Made

- JWT token acquired in `savePasswordAndNext()` right after password save succeeds — password is still in memory at that point, no need for separate storage or step
- `/auth/login` added to SETUP_ONLY_ALLOWLIST: allows setup wizard to get a token without leaving setup-only mode; safe since password was just configured
- Token fetch is best-effort (try/catch suppressed) — if login fails, step 6 shows an API error message; user can click "Generate New Code" after restarting in normal mode
- Domain gating uses `state.stepData.gatewayUrl && !state.stepData.domainSkipped` — consistent with how Download step detects the skip-warning condition

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Added /auth/login to SETUP_ONLY_ALLOWLIST**
- **Found during:** Task 1 (wizard step 6 implementation)
- **Issue:** POST /api/pairing/generate requires JWT auth. The wizard needs to call /auth/login to get a token. But in setup-only mode, /auth/login is blocked by the 503 guard. Without this, step 6 can never obtain a token and generate would always return 401.
- **Fix:** Added '/auth/login' to SETUP_ONLY_ALLOWLIST in app.ts with explanatory comment
- **Files modified:** objetiva-sync-gateway/src/app.ts
- **Verification:** App builds correctly; existing auth integration tests still pass
- **Committed in:** 9b251c7 (Task 1 commit)

**2. [Rule 2 - Missing] Added state.token acquisition in savePasswordAndNext()**
- **Found during:** Task 1 (wizard step 6 implementation)
- **Issue:** Plan states "state.token is set during the password step" but the existing `savePasswordAndNext()` function did not set any token. Step 6 needs `state.token` to call `POST /api/pairing/generate`. Without it, the Authorization header would be undefined.
- **Fix:** After `set-password` succeeds, call `/auth/login` with username 'admin' and the password (still in scope), store result in `state.token`. Password is then cleared from DOM.
- **Files modified:** objetiva-sync-gateway/src/routes/setup.ts
- **Verification:** Token stored in state.token; used in fetchPairingCode Authorization header
- **Committed in:** 9b251c7 (Task 1 commit)

---

**Total deviations:** 2 auto-fixed (1 blocking, 1 missing critical functionality)
**Impact on plan:** Both fixes are required for step 6 to function. No scope creep — the plan itself described state.token being available by step 6 without specifying how, so these are implementation details that complete the plan's intent.

## Issues Encountered

None beyond the auto-fixed deviations above.

## User Setup Required

None — Task 2 is a human-verify checkpoint. The operator needs to:
1. Start the gateway (`cd objetiva-sync-gateway && npm run dev`)
2. Navigate to /setup and complete steps 1-5
3. Verify step 6 renders correctly with code, countdown, and copy button
4. Test claim via curl

## Next Phase Readiness

- Wizard step 6 complete and committed
- Pairing flow is fully implemented end-to-end: backend routes (Plan 01) + wizard UI (Plan 02)
- Pending operator verification (Task 2 checkpoint)

## Self-Check: PASSED

- FOUND: objetiva-sync-gateway/src/routes/setup.ts (modified)
- FOUND: objetiva-sync-gateway/src/app.ts (modified)
- FOUND: commit 9b251c7 (feat: wizard step 6)

---
*Phase: 20-gateway-pairing-routes*
*Completed: 2026-03-05*
