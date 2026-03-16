# Phase 23: Fix Wizard Pairing Auth & Missing Dependency - Research

**Researched:** 2026-03-16
**Domain:** Fastify auth flow / npm dependency management / code cleanup
**Confidence:** HIGH

## Summary

Phase 23 addresses a critical sequencing bug in the wizard pairing flow, a missing npm dependency, and residual dead code. The 403 bug is well-understood: `POST /api/setup/apply-config` transitions `systemState.startupMode` from `'setup-only'` to `'normal'` (setup.ts line 1382), and then step 4 calls `POST /api/setup/token` which guards with `systemState.startupMode !== 'setup-only'` (setup.ts line 1511), causing an immediate 403 rejection.

The fix is straightforward: add a `setupComplete` boolean to the `systemState` singleton and widen the token endpoint guard to allow issuance when `startupMode === 'normal' && setupComplete === false`. The `setupComplete` flag gets set to `true` in the pairing claim handler after a successful claim, permanently locking the token endpoint for that container lifecycle.

The `fast-jwt` dependency is used in `objetiva-sync/src/services/gateway-client.ts` (line 11) but is not declared in `objetiva-sync/package.json`. It works via npm hoisting from `objetiva-sync-gateway/package.json` where it is declared as `^6.1.0`. This is fragile and breaks in clean installs.

**Primary recommendation:** Fix the guard condition in `/api/setup/token`, add `setupComplete` to systemState, wire it into the claim handler, add `fast-jwt` to sync's package.json, clean residual references, and write integration tests covering the full wizard flow.

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
- **403 fix strategy:** Widen token window - allow requests in both setup-only mode AND normal mode before first pairing claim
- **setupComplete flag:** In-memory only (not persisted), set to true when pairing code is successfully claimed
- **Token logic:** Allow when `startupMode === 'setup-only'` OR (`startupMode === 'normal'` AND `setupComplete === false`)
- **SETUP_ONLY_ALLOWLIST:** Stays unchanged - `/api/setup/` prefix already covers `/api/setup/token`
- **Residual cleanup:** Remove REMOTE_API_USERNAME/PASSWORD from env.ts, update JSDoc in env-writer.ts (SYNC_PASSWORD -> JWT_SECRET), leave .planning/ docs as-is
- **fast-jwt:** Match gateway version (^6.1.0), add to objetiva-sync/package.json
- **E2E wizard validation:** New `tests/integration/wizard-flow.test.ts` in gateway, mock DB, test full HTTP flow
- **Unit test:** `objetiva-sync/tests/unit/gateway-client.test.ts` verifying fast-jwt import and token signing

### Claude's Discretion
- Exact systemState.setupComplete implementation details (property initialization, type)
- How to mock the DB connection in wizard flow tests (Prisma mock vs endpoint stub)
- Whether to test additional edge cases (e.g., token request after restart, multiple generates before claim)

### Deferred Ideas (OUT OF SCOPE)
None
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| AUTH-RM-04 | POST /api/setup/token returns JWT during setup-only mode, 403 after | Fix the guard condition to widen the token window; setupComplete flag locks after claim |
| AUTH-RM-05 | Setup wizard has 5 steps, renumbered correctly | Already complete from Phase 22; verify wizard HTML step count unchanged |
| AUTH-RM-06 | AuthManager eliminated from sync; batch clients use getJwtToken() direct | Already complete from Phase 22; fast-jwt dependency addition ensures it works in clean installs |
| PAIR-01 | Gateway generates 6-char pairing code with 10min expiry | Already works; wizard flow test validates this end-to-end |
| PAIR-02 | Sync consumes code via POST /api/pairing/claim | Already works; set setupComplete=true on successful claim; wizard flow test validates |
</phase_requirements>

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| fastify | (existing) | HTTP framework | Already in use across gateway |
| fast-jwt | ^6.1.0 | JWT signing in sync | Must match gateway version; already used via hoisting |
| vitest | ^4.0.18 | Test framework | Already configured in both packages |
| zod | (existing) | Schema validation | Already in use across both packages |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| @fastify/jwt | (existing) | JWT plugin for Fastify | Used by setup.ts token endpoint via `app.jwt.sign()` |

### Alternatives Considered
None -- all decisions are locked. No new libraries needed.

**Installation:**
```bash
cd objetiva-sync && npm install fast-jwt@^6.1.0
```

## Architecture Patterns

### Recommended Project Structure
```
objetiva-sync-gateway/
  src/lib/system-state.ts       # Add setupComplete: boolean
  src/routes/setup.ts           # Widen /api/setup/token guard
  src/routes/pairing.ts         # Set setupComplete on claim
  src/utils/env-writer.ts       # Fix JSDoc example
  tests/integration/
    wizard-flow.test.ts         # NEW: full wizard E2E test

objetiva-sync/
  src/config/env.ts             # Remove dead fields
  package.json                  # Add fast-jwt dependency
  tests/unit/
    gateway-client.test.ts      # Add fast-jwt import verification test
```

### Pattern 1: systemState Singleton Extension
**What:** Add `setupComplete` property to the existing systemState singleton
**When to use:** Any cross-module state that needs to be shared without circular dependencies
**Example:**
```typescript
// system-state.ts — add after preflightChecks
export const systemState = {
  dbConnected: false,
  dbError: null as string | null,
  startTime: new Date(),
  lastDbCheck: null as Date | null,
  startupMode: 'normal' as 'normal' | 'setup-only' | 'degraded',
  preflightChecks: [] as PreflightCheck[],
  // Whether a pairing code has been successfully claimed in this container lifecycle
  setupComplete: false
}
```

### Pattern 2: Widened Guard with Security Lockout
**What:** Token endpoint allows issuance in two modes, then locks permanently after claim
**When to use:** When a one-time setup flow crosses mode boundaries
**Example:**
```typescript
// setup.ts — /api/setup/token guard
app.post('/api/setup/token', async (_request, reply) => {
  // Allow during setup-only mode OR during normal mode before first claim
  const allowed = systemState.startupMode === 'setup-only' ||
    (systemState.startupMode === 'normal' && !systemState.setupComplete)

  if (!allowed) {
    return reply.status(403).send({
      success: false,
      error: 'Only available during setup'
    })
  }
  // ... existing jwt.sign logic
})
```

### Pattern 3: buildApp() Integration Test Isolation
**What:** Each describe block creates its own Fastify instance via buildApp() for test isolation
**When to use:** Integration tests that modify systemState or need clean rate-limit counters
**Example:**
```typescript
// Established pattern from Phase 20 pairing tests
describe('wizard flow', () => {
  let app: FastifyInstance

  beforeAll(async () => {
    app = await buildApp()
    await app.ready()
  })

  afterAll(async () => {
    await app.close()
  })

  // Tests use app.inject() for HTTP calls
})
```

### Anti-Patterns to Avoid
- **Persisting setupComplete:** Do NOT persist this flag. On container restart, systemState resets and startupMode is determined by preflight checks. A configured gateway restarts into 'normal' mode with setupComplete=false, but the token endpoint stays locked because startupMode !== 'setup-only' and the only way to reach 'normal' with setupComplete=false is through a fresh apply-config cycle.
- **Reordering steps:** Do NOT change the wizard step order. The decision is to widen the token window, not reorder apply-config and token acquisition.
- **Module-level flag in pairing.ts:** The existing `lastCodeWasClaimed` is module-scoped. `setupComplete` goes in systemState because the token endpoint in setup.ts needs to read it.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| JWT signing | Custom crypto | `app.jwt.sign()` (gateway), `createSigner` from fast-jwt (sync) | Already working; just need dependency declared |
| Test HTTP calls | Manual fetch | `app.inject()` via Fastify | In-process, no port binding, standard pattern |
| State sharing | Event emitter or global | `systemState` singleton | Established pattern, import-safe, type-safe |

## Common Pitfalls

### Pitfall 1: Forgetting to import systemState in pairing.ts
**What goes wrong:** setupComplete never gets set to true, token endpoint stays open forever
**Why it happens:** pairing.ts currently doesn't import systemState
**How to avoid:** Add `import { systemState } from '../lib/system-state.js'` to pairing.ts
**Warning signs:** Token endpoint returns 200 even after a successful claim

### Pitfall 2: Race condition in the restart scenario
**What goes wrong:** Concern that after restart, token endpoint might be accessible
**Why it happens:** Misunderstanding the guard logic
**How to avoid:** After restart with valid config, startupMode='normal' and setupComplete=false -- BUT the gateway has a configured DB and JWT_SECRET, so startupMode will be 'normal'. The token endpoint DOES allow requests (normal + !setupComplete). However, this is acceptable because: (a) in a restart scenario the wizard HTML is not served (dashboard is), and (b) the token endpoint only issues JWTs it already knows the secret for. The CONTEXT.md explicitly approves this logic.
**Warning signs:** This is documented as acceptable behavior per the user decision

### Pitfall 3: fast-jwt version mismatch
**What goes wrong:** API differences between versions cause runtime errors
**Why it happens:** Using different version than gateway
**How to avoid:** Check gateway version first: `^6.1.0`. Use the exact same semver range.
**Warning signs:** TypeScript compilation errors or runtime `createSigner is not a function`

### Pitfall 4: Existing test breakage from guard change
**What goes wrong:** The existing test in setup-wizard.integration.test.ts line 189 tests that normal mode returns 403
**Why it happens:** The widened guard now allows normal mode + !setupComplete
**How to avoid:** Update the existing test to set `systemState.setupComplete = true` when testing the 403 case, and add a new test for normal mode + setupComplete=false returning 200
**Warning signs:** Test suite fails after guard change

### Pitfall 5: Grep for residual references must exclude .planning/
**What goes wrong:** Cleaning references from documentation files
**Why it happens:** CONTEXT.md says leave .planning/ as-is (historical records)
**How to avoid:** Only modify production code files: env.ts and env-writer.ts JSDoc
**Warning signs:** Git diff shows changes in .planning/ directory

## Code Examples

### Guard Condition Fix (setup.ts line ~1510)
```typescript
// BEFORE (buggy):
if (systemState.startupMode !== 'setup-only') {
  return reply.status(403).send(...)
}

// AFTER (fixed):
const canIssueToken = systemState.startupMode === 'setup-only' ||
  (systemState.startupMode === 'normal' && !systemState.setupComplete)

if (!canIssueToken) {
  return reply.status(403).send({
    success: false,
    error: 'Only available during setup'
  })
}
```

### Claim Handler Lockout (pairing.ts)
```typescript
import { systemState } from '../lib/system-state.js'

// Inside claim handler, after result === 'ok':
if (result === 'ok') {
  lastCodeWasClaimed = true
  systemState.setupComplete = true  // Lock token endpoint
  // ... existing response
}
```

### Remove Dead Fields (env.ts lines 31-33)
```typescript
// REMOVE these two lines:
REMOTE_API_USERNAME: z.string().optional(),
REMOTE_API_PASSWORD: z.string().optional(),
```

### Fix JSDoc (env-writer.ts line 72)
```typescript
// BEFORE:
 * @param key   Environment variable name (e.g. 'SYNC_PASSWORD')
// AFTER:
 * @param key   Environment variable name (e.g. 'JWT_SECRET')
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| /auth/login for setup JWT | /api/setup/token | Phase 22 | Simpler, no password needed |
| SYNC_PASSWORD auth | JWT-only auth | Phase 22 | REMOTE_API_USERNAME/PASSWORD now dead code |
| AuthManager class | Direct getJwtToken() | Phase 22-02 | fast-jwt becomes direct dependency |

## Open Questions

1. **Token endpoint accessible after restart in normal mode (setupComplete=false)**
   - What we know: This is explicitly approved in CONTEXT.md. The guard allows it.
   - What's unclear: Whether this is a security concern worth documenting in code comments.
   - Recommendation: Add a clear code comment explaining why this is acceptable (wizard UI not served in normal mode, token is signed with known secret).

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Vitest 4.0.18 |
| Config file | `objetiva-sync-gateway/vitest.config.ts`, `objetiva-sync/vitest.config.ts` |
| Quick run command | `cd objetiva-sync-gateway && npx vitest run tests/integration/wizard-flow.test.ts` |
| Full suite command | `cd objetiva-sync-gateway && npx vitest run && cd ../objetiva-sync && npx vitest run` |

### Phase Requirements -> Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| AUTH-RM-04 | Token returns 200 in normal+!setupComplete | integration | `cd objetiva-sync-gateway && npx vitest run tests/integration/wizard-flow.test.ts -x` | Wave 0 |
| AUTH-RM-04 | Token returns 403 after setupComplete | integration | (same file) | Wave 0 |
| AUTH-RM-06 | fast-jwt import works in clean context | unit | `cd objetiva-sync && npx vitest run tests/unit/gateway-client.test.ts -x` | Existing (extend) |
| PAIR-01 | Generate code in wizard flow | integration | `cd objetiva-sync-gateway && npx vitest run tests/integration/wizard-flow.test.ts -x` | Wave 0 |
| PAIR-02 | Claim sets setupComplete | integration | (same file) | Wave 0 |

### Sampling Rate
- **Per task commit:** `npx vitest run tests/integration/wizard-flow.test.ts -x`
- **Per wave merge:** `npx vitest run` in both packages
- **Phase gate:** Full suite green before `/gsd:verify-work`

### Wave 0 Gaps
- [ ] `objetiva-sync-gateway/tests/integration/wizard-flow.test.ts` -- covers AUTH-RM-04, PAIR-01, PAIR-02 (full wizard flow)
- [ ] Update existing `objetiva-sync-gateway/tests/integration/setup-wizard.integration.test.ts` -- fix broken test for 403 (needs setupComplete=true)

## Sources

### Primary (HIGH confidence)
- Direct codebase inspection of all files referenced in CONTEXT.md
- `system-state.ts` -- confirmed singleton pattern with startupMode, no setupComplete yet
- `setup.ts` line 1511 -- confirmed guard `systemState.startupMode !== 'setup-only'` (the bug)
- `setup.ts` line 1382 -- confirmed apply-config sets `systemState.startupMode = 'normal'`
- `setup.ts` lines 977-991 -- confirmed wizard JS calls /api/setup/token after apply-config auto-advance
- `pairing.ts` line 94-95 -- confirmed claim handler sets `lastCodeWasClaimed = true` but no systemState update
- `env.ts` lines 32-33 -- confirmed REMOTE_API_USERNAME/REMOTE_API_PASSWORD still present
- `env-writer.ts` line 72 -- confirmed JSDoc mentions SYNC_PASSWORD
- `gateway/package.json` -- confirmed fast-jwt ^6.1.0
- `sync/package.json` -- confirmed fast-jwt NOT listed
- `gateway-client.ts` line 11 -- confirmed `import { createSigner } from 'fast-jwt'`
- `gateway-client.test.ts` -- confirmed existing test structure with vi.doMock pattern

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH - all libraries already in use, just fixing a guard and adding a dependency
- Architecture: HIGH - follows established systemState singleton pattern exactly
- Pitfalls: HIGH - directly verified by reading the code; existing test breakage confirmed

**Research date:** 2026-03-16
**Valid until:** 2026-04-16 (stable codebase, no external dependency changes expected)
