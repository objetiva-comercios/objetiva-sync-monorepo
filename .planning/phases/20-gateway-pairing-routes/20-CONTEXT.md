# Phase 20: Gateway Pairing Routes - Context

**Gathered:** 2026-03-05
**Status:** Ready for planning

<domain>
## Phase Boundary

Gateway issues short-lived pairing codes that sync can claim to receive all connection credentials in one automated exchange. Requirements: PAIR-01, PAIR-02, PAIR-03, PAIR-04, PAIR-05.

</domain>

<decisions>
## Implementation Decisions

### Credential payload
- Claim response returns 3 fields: `gatewayUrl` (GATEWAY_PUBLIC_URL), `jwtSecret` (JWT_SECRET), `syncPassword` (SYNC_PASSWORD raw plaintext)
- Sync username is implicit (fixed as 'sync') — not included in payload
- No extra metadata (no gateway version, no database URL)
- Password is raw plaintext — sync uses it to authenticate via POST /auth/login as it does today

### Password sourcing
- **Claude's Discretion** — Claude decides how to make the raw SYNC_PASSWORD available for the claim response (in-memory cache at set-password time, or require operator input at generate time, or another approach)

### Wizard integration
- **New step 6 ("Link Sync Client")** added after the Download step in the setup wizard
- Step 6 is gated behind GATEWAY_PUBLIC_URL — if domain was skipped in step 2, step 6 shows a message directing the operator to set it first
- Code auto-generates when operator reaches step 6 (no manual click required to get the first code)
- "Generate New Code" button available for getting a fresh code
- Wizard-only for now — no separate dashboard section for re-pairing (PAIR-F02 is a future enhancement)

### Code generation rules
- 6-character uppercase alphanumeric code
- **Exclude ambiguous characters**: no 0, O, I, 1 — charset is A-Z (minus O, I) + 2-9 = 32 chars
- Claim endpoint accepts case-insensitive input (normalizes to uppercase before matching)
- **10-minute TTL** (matches PAIR-01 requirement)
- **One active code at a time** — generating a new code invalidates any previous active code
- In-memory Map + setTimeout for TTL store (decided in STATE.md — no Redis, container restart invalidates codes which is acceptable)

### Security boundaries
- Claim endpoint works over HTTP — Tailscale provides encrypted tunnel, requiring HTTPS would break dev/Tailscale setups
- If GATEWAY_PUBLIC_URL is not set: claim returns credentials with gatewayUrl as null — sync can store credentials and configure URL manually (consistent with "domain is optional" from Phase 19). Note: wizard step 6 gating means this edge case only happens via direct API call
- Generate endpoint (POST /api/pairing/generate) requires JWT auth — no additional rate limiting needed beyond auth barrier
- Claim endpoint (POST /api/pairing/claim) is unauthenticated with rate limit of 5 per minute per IP (from success criteria SC-4)
- @fastify/rate-limit already registered in app.ts with per-route opt-in — reuse for claim endpoint
- Log claim events at info level: code claimed, source IP, timestamp — for audit/troubleshooting

### Claude's Discretion
- Exact implementation of password sourcing for claim response
- Pairing store module structure and cleanup logic
- Expiration countdown UI implementation in wizard step 6
- Error response format for expired/invalid/consumed codes
- Whether to add a visual indicator in the wizard showing "Code claimed!" when sync successfully pairs

</decisions>

<specifics>
## Specific Ideas

- Wizard step 6 should show the code prominently (large font, monospaced) with a copy button and expiration countdown
- Codes expire in the success criteria specify 410 Gone for consumed codes — distinct from 404 for invalid/expired
- The in-memory Map approach means all active codes are lost on container restart — this is acceptable and documented in SC-5

</specifics>

<code_context>
## Existing Code Insights

### Reusable Assets
- `env-writer.ts`: writeEnvVar/writeEnvVars with async mutex — if password needs .env storage
- `authenticate` middleware (`middleware/auth.ts`): JWT verification with specific error codes — used for generate endpoint
- `@fastify/rate-limit`: Already registered globally in app.ts with `global: false` — per-route opt-in for claim endpoint
- `system-state.ts`: Singleton state — could track active pairing code count or last-paired timestamp
- `setup.ts` (920+ lines): Wizard HTML with 5 steps — step 6 appended here following existing pattern

### Established Patterns
- Fastify route registration via `app.register()` in `app.ts` — new `registerPairingRoutes()` follows same pattern
- Zod schemas for request validation — PairingClaimSchema for code input validation
- JSON response format: `{ success: boolean, error?: string, data?: object }` — consistent with auth.ts pattern
- Inline HTML in route files for wizard UI — step 6 follows same pattern as steps 1-5

### Integration Points
- `app.ts`: Register new pairing routes (`registerPairingRoutes()`)
- `setup.ts`: Add step 6 HTML and JS to wizard, call POST /api/pairing/generate on step enter
- `process.env.GATEWAY_PUBLIC_URL`: Read at claim time for gatewayUrl in response
- `process.env.JWT_SECRET`: Read at claim time for jwtSecret in response
- `process.env.SYNC_PASSWORD`: Need raw value — currently only bcrypt hash in .env

</code_context>

<deferred>
## Deferred Ideas

- QR code display alongside text code — Future requirement PAIR-F02
- Re-pairing flow outside wizard (revoke + regenerate) — Future requirement PAIR-F02
- Multi-client pairing (multiple sync instances) — Future requirement PAIR-F03
- Dashboard section for generating codes without re-running wizard — Future enhancement

</deferred>

---

*Phase: 20-gateway-pairing-routes*
*Context gathered: 2026-03-05*
