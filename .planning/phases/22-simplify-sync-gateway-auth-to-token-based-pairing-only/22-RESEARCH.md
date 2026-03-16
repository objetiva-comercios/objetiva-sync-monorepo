# Phase 22: Simplify sync-gateway auth to token-based pairing-only - Research

**Researched:** 2026-03-16
**Domain:** Authentication simplification — remove password-based login, keep JWT-only auth
**Confidence:** HIGH

## Summary

This phase removes the password-based authentication layer between sync and gateway, replacing it with direct JWT signing using the shared JWT_SECRET. The codebase currently has a dual-credential system: JWT_SECRET (for token signing) and SYNC_PASSWORD/SYNC_USERNAME (for login flow). After pairing, sync already has JWT_SECRET stored in SQLite (Phase 21), so the login/refresh flow is redundant overhead.

The changes span both packages (gateway and sync) and touch routes, middleware, configuration, dashboard templates, the setup wizard, and the codegen CLI script. The key risk areas are: (1) the setup wizard is a single 1500+ line HTML-in-TypeScript file with step numbering hardcoded throughout, (2) four batch clients in sync all use AuthManager via constructor injection, and (3) the connection test flow in sync dashboard currently depends on /auth/login.

**Primary recommendation:** Execute as two plans: Plan 1 handles gateway-side removal (auth routes, wizard step removal/renumbering, pairing claim cleanup, preflight, .env.example, POST /api/setup/token endpoint). Plan 2 handles sync-side removal (AuthManager deletion, batch client refactor, APIClient/scheduler simplification, dashboard template updates, connection test rewrite).

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
- **Delete routes:** /auth/login, /auth/refresh, /api/auth/diagnostics, /api/auth/change-password
- **Delete env vars:** SYNC_PASSWORD, SYNC_USERNAME -- remove from .env.example, generate-env endpoint, and preflight checks
- **JWT_SECRET remains** as the sole authentication credential between sync and gateway
- **Pairing claim response** returns only `gatewayUrl` + `jwtSecret` -- drop `syncPassword` field entirely
- Remove all references to SYNC_PASSWORD_HASH, LoginSchema, password comparison logic
- **Delete AuthManager** (`api-client/auth.ts`) entirely
- Batch clients (ArticulosClient, ComprobantesCabeceraClient, etc.) **import `getJwtToken()` directly** from `gateway-client.ts`
- Remove AuthManager creation from `api-client/index.ts` -- simplify to export client classes + shared config (baseUrl from SQLite)
- `getJwtToken()` already handles: read JWT_SECRET from SQLite (encrypted) -> sign with fast-jwt -> 5-min expiry
- No constructor dependency injection for tokens -- direct import, stateless
- **Replace token status display** with pairing status: paired/not-paired, gateway URL, last connection test result
- Tokens are now ephemeral (5-min, signed on demand) -- showing token expiry is meaningless
- **Manual config form:** remove password and username fields, keep gateway URL + "Test Connection" button
- **Dashboard banner** when JWT_SECRET not configured: "Gateway no enlazado -- ingresa el codigo de pairing en Configuracion API"
- Sync engine skips scheduled syncs until paired (no JWT_SECRET = can't authenticate)
- **Clean break** -- no backward compatibility, no deprecation period
- Existing paired deployments keep working (they have jwtSecret in SQLite from Phase 21)
- Un-paired deployments must run the pairing flow
- SYNC_PASSWORD in .env is ignored if present (no error, just unused)
- **Remove step 3** (Set Password) entirely from wizard
- **New 5-step flow:** 1-Database -> 2-Domain -> 3-JWT Secret -> 4-Apply Config -> 5-Link Sync
- **New endpoint: POST /api/setup/token** -- returns a signed JWT during setup-only mode, 403 after setup completes
- Wizard step 5 (pairing) calls `/api/setup/token` to get JWT, then calls `/api/pairing/generate` -- replaces the old flow of login with password
- JWT_SECRET never exposed to browser JS -- signing happens server-side only
- Step numbering and gating logic must be renumbered throughout setup.ts

### Claude's Discretion
- Exact refactoring of batch client constructors (remove authManager parameter)
- How to handle the pairing store's password sourcing removal (generateCode no longer needs to cache SYNC_PASSWORD)
- Exact dashboard banner styling and placement for "not paired" state
- Whether to add a "re-pair" button visible when already paired
- .env.example comments and documentation updates

### Deferred Ideas (OUT OF SCOPE)
None -- discussion stayed within phase scope
</user_constraints>

## Standard Stack

### Core (No New Dependencies)
| Library | Version | Purpose | Notes |
|---------|---------|---------|-------|
| fast-jwt | existing | JWT signing on sync side | Already used in gateway-client.ts |
| @fastify/jwt | existing | JWT verification on gateway side | Already registered in app.ts |
| zod | existing | Schema validation | Already used throughout |

### No Additions Needed
This phase is purely removal/simplification. No new npm dependencies. The `fast-jwt` library already handles local JWT signing in `gateway-client.ts`, and `@fastify/jwt` handles verification on the gateway. The password-related code simply gets deleted.

## Architecture Patterns

### Current Architecture (Being Removed)
```
Sync -> /auth/login (username+password) -> Gateway returns JWT -> Sync caches JWT
Sync -> AuthManager.getToken() refreshes via /auth/refresh when near expiry
```

### Target Architecture
```
Sync -> getJwtToken() signs JWT locally with shared JWT_SECRET -> sends Bearer token
Gateway -> @fastify/jwt verifies signature (same JWT_SECRET) -> accepts request
```

### Pattern: Direct Import Token Acquisition
**What:** Batch clients import `getJwtToken()` directly instead of receiving AuthManager via constructor.
**When to use:** Every batch request (sendBatch, testConnection).
**Example:**
```typescript
// In each batch client (articulos-client.ts, etc.)
import { getJwtToken } from '../services/gateway-client.js';

export class ArticulosClient {
  private baseUrl: string;
  private dispatcher?: Dispatcher;

  constructor(baseUrl: string, dispatcher?: Dispatcher) {
    this.baseUrl = baseUrl.replace(/\/$/, '');
    this.dispatcher = dispatcher;
  }

  async sendBatch(...) {
    const token = await getJwtToken();  // Direct import, no authManager
    // ... rest unchanged
  }
}
```

### Pattern: Setup-Only Token Endpoint
**What:** POST /api/setup/token returns a signed JWT for use during wizard only.
**When:** Setup-only mode, before the system is fully configured.
**Example:**
```typescript
// In setup.ts routes
app.post('/api/setup/token', async (request, reply) => {
  if (systemState.startupMode !== 'setup-only') {
    return reply.code(403).send({ error: 'Only available during setup' });
  }
  const token = app.jwt.sign({ source: 'setup-wizard', authenticated: true });
  return reply.send({ success: true, token });
});
```

### Pattern: JWT-Authenticated Connection Test
**What:** Replace /auth/login-based test with /health + JWT-signed request.
**When:** Sync dashboard "Test Connection" button.
**Example:**
```typescript
// In sync config.ts - POST /api/config/api/test
async function testConnection(baseUrl: string): Promise<{ success: boolean; message: string }> {
  const token = await getJwtToken();
  const response = await fetch(`${baseUrl}/health`, {
    headers: { Authorization: `Bearer ${token}` }
  });
  // ... validate response
}
```

### Anti-Patterns to Avoid
- **Partial removal:** Do not leave any SYNC_PASSWORD references in working code paths. Grep thoroughly after changes.
- **Breaking the codegen script silently:** The `regenerate-schemas.ts` CLI also uses SYNC_USERNAME/SYNC_PASSWORD for authentication. This must be updated to use JWT signing instead.
- **Forgetting the allowlist:** After removing /auth/login, remove it from SETUP_ONLY_ALLOWLIST in app.ts and add /api/setup/token instead.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| JWT signing on sync side | Custom token generation | `getJwtToken()` from gateway-client.ts | Already exists, reads from SQLite, handles encryption |
| JWT verification on gateway | Custom verification middleware | `@fastify/jwt` + `authenticate` middleware | Already registered and working |
| Connection test | Login-based test flow | Direct health/status check with JWT | Simpler, no password needed |

## Common Pitfalls

### Pitfall 1: Setup Wizard Step Renumbering
**What goes wrong:** The wizard in setup.ts is a 1500+ line file with step numbers hardcoded in HTML ids (`wizard-step-3`), CSS selectors, stepper indicators (`step-indicator-3`), navigation buttons (`nav-step-3`), step titles ("Step 3 of 6"), and JavaScript navigation logic (`goToStep(3)`). The total step count is in `TOTAL_STEPS = 6`.
**Why it happens:** Steps are identified by numeric index, not semantic names. Removing step 4 (password) means renumbering steps 5 and 6 down to 4 and 5.
**How to avoid:** Systematic find-and-replace: (1) Delete the password step HTML block entirely, (2) Renumber remaining steps 5->4, 6->5 in HTML ids, indicators, labels, nav buttons, and JS functions, (3) Update TOTAL_STEPS from 6 to 5, (4) Update `savePasswordAndNext()` -- delete entirely, (5) Update the apply-config step to no longer check for SYNC_PASSWORD.
**Warning signs:** Wizard shows blank step, step navigation jumps, stepper dots misaligned.

### Pitfall 2: Circular Import Between Batch Clients and gateway-client
**What goes wrong:** Batch clients importing `getJwtToken()` from `services/gateway-client.ts` could create a module dependency that conflicts with existing imports.
**Why it happens:** `gateway-client.ts` is in `src/services/` while batch clients are in `src/api-client/`. The import path crosses package boundaries.
**How to avoid:** Use relative imports (`../services/gateway-client.js`). Verify no circular dependencies by checking that gateway-client.ts does not import from api-client/.
**Warning signs:** Runtime "cannot access before initialization" errors.

### Pitfall 3: APIClient.testConnection() Still Uses Login
**What goes wrong:** The sync dashboard's "Test Connection" button calls `POST /api/config/api/test` which calls `/auth/login` on the gateway. After removing /auth/login, this breaks.
**Why it happens:** The test flow was designed around password authentication.
**How to avoid:** Rewrite test to use `getJwtToken()` + call a protected endpoint (e.g., `/health` or `/api/status`) instead of `/auth/login`. The test validates that: (1) gateway is reachable, (2) JWT_SECRET matches (token is accepted).
**Warning signs:** "Test Connection" button always fails with 404.

### Pitfall 4: Codegen Script Authentication
**What goes wrong:** `scripts/regenerate-schemas.ts` and `codegen/index.ts` authenticate via /auth/login with SYNC_USERNAME/SYNC_PASSWORD. After removal, schema regeneration CLI breaks.
**Why it happens:** The CLI was built before the JWT-only approach.
**How to avoid:** Update the codegen authentication to use `fast-jwt` local signing with JWT_SECRET from environment. The script runs on the developer machine which has access to .env with JWT_SECRET.
**Warning signs:** `npm run regenerate-schemas` fails with 404.

### Pitfall 5: Scheduler Creates APIClient with Password
**What goes wrong:** `scheduler-instance.ts` reads REMOTE_API_PASSWORD from SQLite, decrypts it, and passes it to `new APIClient({ password })`. After AuthManager removal, this constructor signature changes.
**Why it happens:** The scheduler was built around the password-based auth flow.
**How to avoid:** Simplify scheduler to only need baseUrl (read from SQLite), no username/password. The batch clients get tokens via `getJwtToken()` directly.
**Warning signs:** Scheduler crashes on startup after refactor.

### Pitfall 6: Sync Dashboard Still Saves REMOTE_API_PASSWORD
**What goes wrong:** The pairing claim handler in `config.ts` saves `REMOTE_API_PASSWORD` to SQLite. After removing password from the claim response, this code tries to save null.
**Why it happens:** The claim handler expects `syncPassword` in the response.
**How to avoid:** Remove the password save from the claim handler. Only save REMOTE_API_URL and JWT_SECRET. Also remove the null check on syncPassword (line 345).
**Warning signs:** Pairing succeeds but sync saves null password to SQLite.

## Code Examples

### Gateway: Files to Delete
```
src/routes/auth.ts          -- entire file (login, refresh, diagnostics, change-password)
```

### Gateway: Files to Modify
```
src/app.ts                  -- remove registerAuthRoutes import/call, update SETUP_ONLY_ALLOWLIST
src/routes/setup.ts         -- remove password step, renumber, add POST /api/setup/token
src/routes/pairing.ts       -- remove syncPassword from claim response
src/routes/preflight.ts     -- remove SYNC_PASSWORD from required env vars check
src/codegen/index.ts        -- change auth from login to JWT signing
scripts/regenerate-schemas.ts -- remove SYNC_PASSWORD from REQUIRED_ENV_VARS
.env.example                -- remove SYNC_PASSWORD, SYNC_USERNAME entries
.env.test                   -- remove SYNC_PASSWORD, SYNC_USERNAME
```

### Sync: Files to Delete
```
src/api-client/auth.ts      -- entire file (AuthManager class)
```

### Sync: Files to Modify
```
src/api-client/index.ts     -- remove AuthManager, simplify APIClient (no password)
src/api-client/articulos-client.ts       -- remove authManager param, import getJwtToken
src/api-client/comprobantes-cabecera-client.ts  -- same
src/api-client/comprobantes-detalle-client.ts   -- same
src/api-client/comprobantes-pagos-client.ts     -- same
src/sync/scheduler-instance.ts  -- remove password from APIClient creation
src/sync/sync-engine.ts     -- type updates for APIClient without password
src/dashboard/routes/api/config.ts  -- remove syncPassword handling, update test flow
src/dashboard/views/config/api.ejs  -- remove username/password fields from manual form
src/__tests__/api-client-metadata.test.ts  -- update mock (no authManager)
```

### Gateway Tests to Update/Delete
```
tests/integration/auth.integration.test.ts     -- DELETE entire file
tests/integration/pairing.integration.test.ts  -- remove SYNC_PASSWORD from env setup
tests/integration/cli-regenerate.integration.test.ts -- update auth expectations
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Password login + JWT refresh cycle | Shared secret, local JWT signing | This phase | Eliminates network round-trip for auth, removes credential management complexity |
| Two credentials (JWT_SECRET + SYNC_PASSWORD) | One credential (JWT_SECRET) | This phase | Smaller attack surface, simpler config |
| 6-step setup wizard | 5-step setup wizard | This phase | Faster onboarding, one fewer security credential to manage |

## Open Questions

1. **Codegen script: local JWT signing vs. environment variable**
   - What we know: The codegen script currently authenticates via /auth/login. It needs to switch to JWT signing.
   - What's unclear: Should it import `fast-jwt` directly or use a shared utility?
   - Recommendation: Use `fast-jwt` directly with `process.env.JWT_SECRET` -- the script is a standalone CLI tool, simple inline signing is appropriate. No need for a shared utility.

2. **REMOTE_API_USERNAME and REMOTE_API_PASSWORD in SQLite (sync)**
   - What we know: Pairing currently saves these keys. The manual config form also saves them.
   - What's unclear: Should existing keys be cleaned up from SQLite, or just stop writing new ones?
   - Recommendation: Stop writing new values, ignore existing ones. No migration needed -- they become dead data. The batch clients will use getJwtToken() regardless of what's in SQLite.

## Sources

### Primary (HIGH confidence)
- Direct codebase analysis: `objetiva-sync-gateway/src/routes/auth.ts` (282 lines, full auth route implementation)
- Direct codebase analysis: `objetiva-sync-gateway/src/routes/setup.ts` (1500+ lines, wizard with step numbering)
- Direct codebase analysis: `objetiva-sync-gateway/src/routes/pairing.ts` (155 lines, claim response with syncPassword)
- Direct codebase analysis: `objetiva-sync/src/api-client/auth.ts` (AuthManager, 281 lines)
- Direct codebase analysis: `objetiva-sync/src/api-client/index.ts` (APIClient with AuthManager dependency)
- Direct codebase analysis: `objetiva-sync/src/services/gateway-client.ts` (getJwtToken implementation)
- Direct codebase analysis: `objetiva-sync/src/dashboard/routes/api/config.ts` (pairing claim handler, test connection)
- Direct codebase analysis: `objetiva-sync/src/dashboard/views/config/api.ejs` (manual config form with password field)
- Direct codebase analysis: `objetiva-sync/src/sync/scheduler-instance.ts` (APIClient creation with password)

### Secondary (MEDIUM confidence)
- Phase 22 CONTEXT.md decisions (user-locked implementation approach)
- Phase 20-21 accumulated context in STATE.md (pairing flow details)

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH - No new dependencies, all existing code verified by reading source
- Architecture: HIGH - Target pattern (getJwtToken) already exists and works in gateway-client.ts
- Pitfalls: HIGH - All identified from direct code reading, specific line numbers and file paths verified

**Research date:** 2026-03-16
**Valid until:** 2026-04-16 (stable codebase, no external dependencies changing)
