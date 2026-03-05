---
phase: 20-gateway-pairing-routes
plan: 02
subsystem: ui
tags: [fastify, wizard, pairing, html, javascript, countdown, clipboard, apply-config]

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
  - "Step 5 transformed from download-only to apply-config: writes .env in-place with .env.bak backup and hot-reload"
affects: [wizard-step-6, pairing-flow, operator-ux, sync-client]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Auto-fetch on step enter: enterPairingStep() called from advanceStep() when next === 5"
    - "Countdown via setInterval + clearInterval, rebased on new expiresAt on each regenerate"
    - "JWT token acquired immediately after password save, stored in state.token for cross-step use"
    - "Domain gating via state.stepData.gatewayUrl && !state.stepData.domainSkipped check"
    - "apply-config step: POST '{}' body (no Content-Type header), spinner feedback, auto-advance on success"
    - "Pairing generate fetch: no body, no Content-Type header — avoids Fastify empty-body parse error"

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
  - "Step 5 apply-config replaces download-only: writes .env in-place with .env.bak backup, hot-reloads process.env without Windows service restart"
  - "POST /api/pairing/generate fetch sends no body and no Content-Type header — Fastify body parser rejects Content-Type: application/json with empty body"

patterns-established:
  - "Step enter side effects via advanceStep(): add if (next === N) { sideEffectFn(); } — same pattern as loadDownloadSummary"
  - "Clipboard copy with transient label change: store original, set 'Copied!', setTimeout restore"
  - "apply-config wizard step: spinner-to-checkmark visual feedback, auto-advance on success — removes manual file placement from operator workflow"

requirements-completed: [PAIR-01, PAIR-02]

# Metrics
duration: 35min
completed: 2026-03-05
---

# Phase 20 Plan 02: Wizard Step 6 — Link Sync Client Summary

**Wizard step 6 'Link Sync Client' with auto-generated 6-char pairing code, countdown timer, copy button, domain gating, JWT token acquisition at password step, and step 5 transformed from download to in-place .env apply with hot-reload**

## Performance

- **Duration:** ~35 min (including post-checkpoint refinements after human verification)
- **Started:** 2026-03-05T15:37:31Z
- **Completed:** 2026-03-05
- **Tasks:** 2 (Task 1 implementation + Task 2 human-verify — approved)
- **Files modified:** 2

## Accomplishments

- Wizard updated from 5 to 6 steps; stepper shows 6 dots with "Link Sync" label on step 6
- Step 6 HTML: code display (2.5rem monospace, user-select:all), Copy Code button, Generate New Code button, countdown timer, domain-gating warning panel
- Step 6 JS: enterPairingStep() (domain gating + auto-generate), fetchPairingCode() (POST /api/pairing/generate with JWT auth), startCountdown() (setInterval), copyPairingCode() (navigator.clipboard), regeneratePairingCode()
- Password step now acquires JWT token via /auth/login and stores in state.token — enables step 6 authenticated API call
- /auth/login added to SETUP_ONLY_ALLOWLIST in app.ts — required for token acquisition during setup-only mode
- Step 5 transformed from download-only to apply-config: writes .env in-place with .env.bak backup, hot-reloads process.env via Object.assign, spinner-to-auto-advance UX
- Human verification (Task 2): operator confirmed wizard step 6 renders correctly, code generates and displays, countdown works, copy works; apply-config writes .env correctly
- All existing tests pass; pre-existing 4 failures unchanged

## Task Commits

Each task was committed atomically:

1. **Task 1: Add wizard step 6 — Link Sync Client** - `9b251c7` (feat)
2. **Post-verification: Transform step 5 to apply configuration** - `9c39e0e` (feat)
3. **Fix: empty body error on apply-config + remove download button** - `0ad4a13` (fix)
4. **Fix: remove Content-Type header from pairing generate fetch** - `8f73239` (fix)

_Commits 2-4 were made after the human-verify checkpoint in response to operator feedback during live browser verification_

## Files Created/Modified

- `objetiva-sync-gateway/src/routes/setup.ts` — Added stepper dot 6, wizard-step-5 HTML, TOTAL_STEPS=6, advanceStep step 5 case, login call in savePasswordAndNext, pairing JS functions (enterPairingStep, fetchPairingCode, startCountdown, copyPairingCode, regeneratePairingCode); step 5 transformed to apply-config with spinner/auto-advance; Content-Type removed from generate fetch
- `objetiva-sync-gateway/src/app.ts` — Added '/auth/login' to SETUP_ONLY_ALLOWLIST

## Decisions Made

- JWT token acquired in `savePasswordAndNext()` right after password save succeeds — password is still in memory at that point, no need for separate storage or step
- `/auth/login` added to SETUP_ONLY_ALLOWLIST: allows setup wizard to get a token without leaving setup-only mode; safe since password was just configured
- Token fetch is best-effort (try/catch suppressed) — if login fails, step 6 shows an API error message; user can click "Generate New Code" after restarting in normal mode
- Domain gating uses `state.stepData.gatewayUrl && !state.stepData.domainSkipped` — consistent with how Download step detects the skip-warning condition
- Step 5 apply-config replaces download-only: downloading a .env file and manually placing it is error-prone; in-place write with .env.bak rollback and hot-reload eliminates the manual step
- No Content-Type header on generate fetch: Fastify's JSON body parser rejects requests with Content-Type: application/json and an empty body; removing the header avoids the parse error entirely

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

**3. [Rule 2 - Missing Critical] Transformed step 5 from download to apply-config**
- **Found during:** Task 2 (human-verify — operator feedback)
- **Issue:** Download-only step required manual file placement; operator had to download .env, find the correct directory, and replace the file. Error-prone and defeats wizard UX goal of zero-manual-steps.
- **Fix:** Step 5 now POSTs to /api/setup/apply-config which writes .env in-place with .env.bak backup, hot-reloads process.env via Object.assign; spinner feedback + auto-advance on success
- **Files modified:** objetiva-sync-gateway/src/routes/setup.ts
- **Verification:** Operator confirmed .env applied correctly; gateway picks up new values without restart
- **Committed in:** 9c39e0e, 0ad4a13

**4. [Rule 1 - Bug] Fixed empty body parse error on /api/pairing/generate fetch**
- **Found during:** Task 2 (human-verify — browser testing)
- **Issue:** fetch() sent `Content-Type: application/json` with no body; Fastify's body parser rejected it with 400 "Bad Request"
- **Fix:** Removed Content-Type header from the generate fetch call (endpoint requires no body)
- **Files modified:** objetiva-sync-gateway/src/routes/setup.ts
- **Verification:** Code generates successfully in browser after fix
- **Committed in:** 8f73239

---

**Total deviations:** 4 auto-fixed (1 blocking, 2 missing critical, 1 bug)
**Impact on plan:** All fixes required for step 6 to function correctly end-to-end. Step 5 transformation is the most significant scope extension but directly serves the wizard's zero-manual-steps goal.

## Issues Encountered

- Fastify body parser rejection on Content-Type + empty body: resolved by removing the header from the fetch call (endpoint needs no body)
- apply-config endpoint returned 400 when called with no body: fixed by sending `'{}'` as the request body

## User Setup Required

None — no external service configuration required.

## Next Phase Readiness

- Pairing flow is complete end-to-end: backend routes (Plan 01) + wizard UI (Plan 02) — both human-verified
- Operator can complete the setup wizard, apply configuration, and receive a pairing code to enter in the Objetiva Sync dashboard
- No blockers. Phase 20 is complete.

## Self-Check: PASSED

- FOUND: objetiva-sync-gateway/src/routes/setup.ts (modified)
- FOUND: objetiva-sync-gateway/src/app.ts (modified)
- FOUND: commit 9b251c7 (feat: wizard step 6)
- FOUND: commit 9c39e0e (feat: apply-config transformation)
- FOUND: commit 0ad4a13 (fix: empty body + remove download button)
- FOUND: commit 8f73239 (fix: remove Content-Type header)

---
*Phase: 20-gateway-pairing-routes*
*Completed: 2026-03-05*
