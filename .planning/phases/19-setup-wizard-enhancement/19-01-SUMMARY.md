---
phase: 19-setup-wizard-enhancement
plan: "01"
subsystem: api
tags: [fastify, zod, env-writer, setup-wizard, gateway-url]

requires:
  - phase: 18-pre-flight-validator
    provides: env-writer writeEnvVar utility used by save-domain handler

provides:
  - POST /api/setup/save-domain — assembles and writes GATEWAY_PUBLIC_URL to .env
  - GET /api/setup/generate-env — returns merged .env content as downloadable file
  - GET /api/setup/status extended with gatewayUrl field
  - assembleGatewayUrl exported helper with default-port omission logic

affects:
  - 19-02-setup-wizard-frontend (uses these endpoints)
  - 20-pairing (reads GATEWAY_PUBLIC_URL from .env)

tech-stack:
  added: []
  patterns:
    - "safeParse for 400 responses (not try/catch on ZodError)"
    - "process.chdir in integration tests to isolate .env file reads"
    - "Merge .env.example + .env for generate-env (template keys, current values)"

key-files:
  created:
    - objetiva-sync-gateway/tests/unit/setup-wizard.test.ts
    - objetiva-sync-gateway/tests/integration/setup-wizard.integration.test.ts
  modified:
    - objetiva-sync-gateway/src/routes/setup.ts
    - objetiva-sync-gateway/.env.example

key-decisions:
  - "assembleGatewayUrl omits port when it matches the default for the protocol (443/https, 80/http)"
  - "save-domain uses safeParse (not .parse()) to return 400 instead of 500 on validation errors"
  - "generate-env merges .env.example template with current .env values, falls back to .env alone if no example"
  - "Integration tests use process.chdir(testEnvDir) to isolate .env file operations from real project .env"

patterns-established:
  - "Exported pure helpers from route files (assembleGatewayUrl) for unit testability"
  - "process.chdir pattern in integration tests needing filesystem isolation"

requirements-completed: [WIZ-02, WIZ-03, WIZ-05, WIZ-06]

duration: 5min
completed: 2026-03-05
---

# Phase 19 Plan 01: Setup Wizard Backend Endpoints Summary

**Three new wizard API endpoints: save-domain (writes GATEWAY_PUBLIC_URL), generate-env (downloads merged .env), and extended status (includes gatewayUrl) — all TDD with 16 passing tests**

## Performance

- **Duration:** ~5 min
- **Started:** 2026-03-05T09:11:55Z
- **Completed:** 2026-03-05T09:16:49Z
- **Tasks:** 2 (RED + GREEN TDD cycle)
- **Files modified:** 4

## Accomplishments

- Exported `assembleGatewayUrl` pure helper with correct default-port omission (443 for https, 80 for http)
- `POST /api/setup/save-domain` validates hostname, assembles URL, writes via `writeEnvVar`
- `GET /api/setup/generate-env` returns merged .env content with `Content-Disposition: attachment` header
- `GET /api/setup/status` extended with `gatewayUrl` field
- `.env.example` updated with commented `GATEWAY_PUBLIC_URL` entry
- 16 new tests (6 unit + 10 integration), all passing

## Task Commits

Each task was committed atomically:

1. **Task 1: Write failing tests (RED)** - `7d9beb3` (test)
2. **Task 2: Implement endpoints (GREEN)** - `e90c2f1` (feat)

_TDD tasks have two commits: test (RED) then feat (GREEN)_

## Files Created/Modified

- `objetiva-sync-gateway/src/routes/setup.ts` - Added assembleGatewayUrl export, SaveDomainSchema, 2 new routes, extended status
- `objetiva-sync-gateway/.env.example` - Added GATEWAY_PUBLIC_URL section with comments
- `objetiva-sync-gateway/tests/unit/setup-wizard.test.ts` - 6 unit tests for assembleGatewayUrl
- `objetiva-sync-gateway/tests/integration/setup-wizard.integration.test.ts` - 10 integration tests for all 3 endpoints

## Decisions Made

- `assembleGatewayUrl` uses `safeParse` pattern (explicit validation) for clean 400 responses
- Integration test isolation via `process.chdir(testEnvDir)` — creates a temp directory with test `.env` and `.env.example`, switches cwd, restores after tests
- `generate-env` merges .env.example (template) with current .env values — keeps comments and structure from example, fills in real values

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

Pre-existing test failures in `auth.integration.test.ts` (health check returns 503 — no DB in test env) and `cli-regenerate.integration.test.ts` (CLI output strings changed) were confirmed to be pre-existing before this plan's changes. Not caused by this implementation.

## Next Phase Readiness

- All 3 endpoints are live and tested — Phase 19 Plan 02 (frontend wizard UI) has a stable API contract
- `GATEWAY_PUBLIC_URL` env var is now part of the setup flow, ready for Phase 20 pairing

---
*Phase: 19-setup-wizard-enhancement*
*Completed: 2026-03-05*
