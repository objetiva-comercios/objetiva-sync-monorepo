# Phase 22: Simplify sync-gateway auth to token-based pairing-only - Context

**Gathered:** 2026-03-16
**Status:** Ready for planning

<domain>
## Phase Boundary

Eliminate the password-based login flow between sync and gateway. After pairing, sync signs JWTs locally with the shared JWT_SECRET — no username/password exchange needed. Remove /auth/login, /auth/refresh, SYNC_PASSWORD, SYNC_USERNAME. Simplify the setup wizard from 6 steps to 5 by removing the password step.

</domain>

<decisions>
## Implementation Decisions

### Removal scope — Gateway
- **Delete routes:** /auth/login, /auth/refresh, /api/auth/diagnostics, /api/auth/change-password
- **Delete env vars:** SYNC_PASSWORD, SYNC_USERNAME — remove from .env.example, generate-env endpoint, and preflight checks
- **JWT_SECRET remains** as the sole authentication credential between sync and gateway
- **Pairing claim response** returns only `gatewayUrl` + `jwtSecret` — drop `syncPassword` field entirely
- Remove all references to SYNC_PASSWORD_HASH, LoginSchema, password comparison logic

### AuthManager replacement — Sync
- **Delete AuthManager** (`api-client/auth.ts`) entirely
- Batch clients (ArticulosClient, ComprobantesCabeceraClient, etc.) **import `getJwtToken()` directly** from `gateway-client.ts`
- Remove AuthManager creation from `api-client/index.ts` — simplify to export client classes + shared config (baseUrl from SQLite)
- `getJwtToken()` already handles: read JWT_SECRET from SQLite (encrypted) → sign with fast-jwt → 5-min expiry
- No constructor dependency injection for tokens — direct import, stateless

### Dashboard changes — Sync
- **Replace token status display** with pairing status: paired/not-paired, gateway URL, last connection test result
- Tokens are now ephemeral (5-min, signed on demand) — showing token expiry is meaningless
- **Manual config form:** remove password and username fields, keep gateway URL + "Test Connection" button
- **Dashboard banner** when JWT_SECRET not configured: "Gateway no enlazado — ingresá el código de pairing en Configuración API"
- Sync engine skips scheduled syncs until paired (no JWT_SECRET = can't authenticate)

### Migration path
- **Clean break** — no backward compatibility, no deprecation period
- Existing paired deployments keep working (they have jwtSecret in SQLite from Phase 21)
- Un-paired deployments must run the pairing flow
- SYNC_PASSWORD in .env is ignored if present (no error, just unused)

### Wizard flow changes — Gateway
- **Remove step 3** (Set Password) entirely
- **New 5-step flow:** 1-Database → 2-Domain → 3-JWT Secret → 4-Apply Config → 5-Link Sync
- **New endpoint: POST /api/setup/token** — returns a signed JWT during setup-only mode, 403 after setup completes
- Wizard step 5 (pairing) calls `/api/setup/token` to get JWT, then calls `/api/pairing/generate` — replaces the old flow of login with password
- JWT_SECRET never exposed to browser JS — signing happens server-side only
- Step numbering and gating logic must be renumbered throughout setup.ts

### Claude's Discretion
- Exact refactoring of batch client constructors (remove authManager parameter)
- How to handle the pairing store's password sourcing removal (generateCode no longer needs to cache SYNC_PASSWORD)
- Exact dashboard banner styling and placement for "not paired" state
- Whether to add a "re-pair" button visible when already paired
- .env.example comments and documentation updates

</decisions>

<specifics>
## Specific Ideas

- POST /api/setup/token is setup-only mode only — returns 403 after setup completes. Clients sign their own JWTs with the shared secret for ongoing use.
- The pairing claim endpoint is the only way to transfer the JWT_SECRET from gateway to sync — no manual "paste the secret" flow.
- This is a security simplification: one credential (JWT_SECRET) instead of two (JWT_SECRET + SYNC_PASSWORD). Fewer things to manage, fewer attack vectors.

</specifics>

<code_context>
## Existing Code Insights

### Reusable Assets
- `gateway-client.ts` (`getJwtToken()`): Already signs JWTs locally with fast-jwt, reads secret from SQLite with env fallback — this becomes THE auth mechanism
- `pairing-store.ts`: In-memory Map + setTimeout TTL — no changes needed for core pairing, just remove password from claim payload
- `env-writer.ts`: Still needed for JWT_SECRET and other .env writes during wizard
- `system-state.ts`: Tracks startup mode (setup-only, degraded, normal) — POST /api/setup/token uses this to enforce setup-only restriction

### Established Patterns
- Setup-only mode allowlist in `app.ts` (SETUP_ONLY_ALLOWLIST) — add `/api/setup/token` to it
- Wizard step gating with `validateStep()` and `canProceedTo()` — renumber from 6 to 5 steps
- SQLite config storage via `setConfig(key, value, encrypted)` — pairing results already use this pattern
- `fast-jwt` `createSigner()` for local JWT signing — no new dependencies needed

### Integration Points
- `app.ts`: Remove `registerAuthRoutes()`, add `/api/setup/token` route (or add to setup routes)
- `setup.ts`: Remove step 3 (password), renumber steps 4-6 → 3-5, update step 5 (pairing) to use `/api/setup/token`
- `pairing.ts`: Remove `syncPassword` from claim response payload
- `api-client/index.ts` (sync): Remove AuthManager creation, update client instantiation
- All batch clients (sync): Remove `authManager` constructor param, import `getJwtToken()` directly
- `api.ejs` (sync): Remove password/username fields from manual config form, add pairing status display
- `.env.example` (gateway): Remove SYNC_PASSWORD, SYNC_USERNAME entries

</code_context>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope

</deferred>

---

*Phase: 22-simplify-sync-gateway-auth-to-token-based-pairing-only*
*Context gathered: 2026-03-16*
