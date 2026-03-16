# Phase 23: Fix Wizard Pairing Auth & Missing Dependency - Context

**Gathered:** 2026-03-16
**Status:** Ready for planning

<domain>
## Phase Boundary

Fix the critical 403 bug in the wizard pairing flow where POST /api/setup/token fails after apply-config transitions startupMode to 'normal'. Add missing fast-jwt dependency to objetiva-sync/package.json. Clean residual password references from production code.

</domain>

<decisions>
## Implementation Decisions

### 403 fix strategy — Widen token window
- Change `/api/setup/token` to allow requests in **both** setup-only mode AND normal mode before first pairing claim
- Add `setupComplete` flag to `systemState` (in-memory only, not persisted)
- `setupComplete` set to `true` when a pairing code is successfully **claimed** (in the claim handler)
- Token endpoint returns 403 when `startupMode !== 'setup-only' && setupComplete === true`
- After container restart: if env+DB are OK, startupMode='normal' and setupComplete=false — but token endpoint still returns 403 because startupMode !== 'setup-only' (already configured gateway doesn't need setup tokens)
- **Simplified logic:** allow token issuance when `startupMode === 'setup-only'` OR (`startupMode === 'normal'` AND `setupComplete === false`)
- SETUP_ONLY_ALLOWLIST in app.ts stays unchanged — `/api/setup/` prefix already covers `/api/setup/token`

### Residual references cleanup — Production code + comments
- **Remove** `REMOTE_API_USERNAME` and `REMOTE_API_PASSWORD` optional fields from `objetiva-sync/src/config/env.ts` (lines 32-33) — verify no usages first
- **Update** JSDoc example in `objetiva-sync-gateway/src/utils/env-writer.ts` — change `SYNC_PASSWORD` to `JWT_SECRET`
- Leave `.planning/` documentation as-is (historical records)

### fast-jwt dependency — Match gateway version
- Check `fast-jwt` version in `objetiva-sync-gateway/package.json`
- Add the **same version** to `objetiva-sync/package.json` as explicit dependency
- Run `npm install` to update lockfile

### E2E wizard validation — Integration test
- Create **new** `tests/integration/wizard-flow.test.ts` in gateway
- Test full wizard flow: preflight → test-db → save-domain → generate-jwt → apply-config → setup/token → pairing/generate
- Verify token **works** after apply-config (the bug fix)
- Verify token returns **403 after** successful pairing claim (security lockout)
- **Mock DB connection** — focus on HTTP flow and mode transitions, not database connectivity
- Add **separate unit test** in `objetiva-sync/tests/unit/gateway-client.test.ts` verifying fast-jwt import and token signing works

### Claude's Discretion
- Exact systemState.setupComplete implementation details (property initialization, type)
- How to mock the DB connection in wizard flow tests (Prisma mock vs endpoint stub)
- Whether to test additional edge cases (e.g., token request after restart, multiple generates before claim)

</decisions>

<specifics>
## Specific Ideas

- The 403 bug is a sequencing issue from Phase 22: apply-config transitions to 'normal' mode, then step 4 calls /api/setup/token which requires 'setup-only' mode
- The fix widens the window rather than reordering steps — less risky, preserves existing apply-config behavior
- After first claim, token endpoint locks permanently (until container restart into setup-only mode)

</specifics>

<code_context>
## Existing Code Insights

### Reusable Assets
- `system-state.ts`: Singleton tracking startupMode — add `setupComplete: boolean` property
- `pairing.ts` claim handler: Where to set `setupComplete = true` after successful claim
- `env-writer.ts`: writeEnvVar utility — JSDoc example update only
- Existing `gateway-client.test.ts` in sync: Already has test structure for gateway-client

### Established Patterns
- `systemState` singleton for cross-module state (startupMode, dbConnected) — add setupComplete following same pattern
- Fastify inject tests with `buildApp()` per describe block for isolation (Phase 20 pattern)
- Setup-only allowlist prefix matching in `app.ts`

### Integration Points
- `setup.ts` line 1510: `/api/setup/token` route — modify guard condition
- `pairing.ts`: claim handler — set `systemState.setupComplete = true` on successful claim
- `system-state.ts`: Add `setupComplete` property
- `env.ts` (sync): Remove dead REMOTE_API_USERNAME/PASSWORD fields
- `env-writer.ts` (gateway): Update JSDoc example

</code_context>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope

</deferred>

---

*Phase: 23-fix-wizard-pairing-auth*
*Context gathered: 2026-03-16*
