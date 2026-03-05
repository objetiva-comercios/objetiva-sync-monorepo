# Phase 19: Setup Wizard Enhancement - Context

**Gathered:** 2026-03-05
**Status:** Ready for planning

<domain>
## Phase Boundary

Operator can configure the entire gateway through a step-gated wizard and download a ready-to-use .env file without editing text files manually. Requirements: WIZ-01, WIZ-02, WIZ-03, WIZ-04, WIZ-05, WIZ-06.

</domain>

<decisions>
## Implementation Decisions

### Wizard UI approach
- **Enhanced inline HTML** — keep the current pattern (HTML string in setup.ts), add step gating with vanilla JS
- **One step visible at a time** with Next/Back navigation buttons; completed steps shown as compact summary
- **Pre-fill from preflight** — on load, call `GET /api/setup/preflight` and pre-fill fields with current values; show all steps in order regardless
- **Server-side validation** on each step before allowing Next — "Next" calls the backend endpoint (test-db, save-jwt, etc.) and only advances on success (satisfies WIZ-01)

### Step flow (5 steps)
1. **Database** (WIZ-02) — Split fields: host, port, user, password, database name. "Test Connection" button required to advance. Table verification shown as info/warning (doesn't block — tables may not exist yet during initial setup)
2. **Domain** (WIZ-03) — Protocol dropdown (http/https) + domain text field. Optional port field (collapsed/advanced, default hidden). Format validation only (no connectivity check — domain may not resolve yet). **Skippable with warning:** "Without a public URL, pairing won't work"
3. **JWT Secret** (WIZ-04) — Text input + "Generate JWT Secret" button producing 64-character hex string client-side. Min 32 chars validation. Saved via existing `/api/setup/save-jwt-secret`
4. **Password** — Admin username fixed (shown as info text), password-only input. Min 6 chars. Saved via existing `/api/setup/set-password`
5. **Download** (WIZ-05, WIZ-06) — Summary of all configured values (masked password), download button for .env file, restart instructions text ("Restart the server to apply all changes")

### .env generation and download
- **Merge with .env.example** — start from `.env.example` template, fill in wizard values, keep other vars with defaults/comments
- **Server-side save is primary** — each step already saves its value via env-writer (happens during Next validation). The .env is complete by the time the user reaches step 5
- **Download is secondary** — "Download a copy of your .env" button generates the file client-side or via a GET endpoint. Downloaded as `.env` (standard filename)
- **Completion screen** — summary with all values, download button, restart hint. No auto-restart

### Claude's Discretion
- Progress indicator visual style (step dots, numbered stepper, etc.)
- Exact layout and spacing of the step UI
- Whether to add a new `GET /api/setup/generate-env` endpoint or assemble client-side
- Startup banner visual formatting
- How to handle the "skip domain" flow in the .env output (omit GATEWAY_PUBLIC_URL or comment it out)

</decisions>

<specifics>
## Specific Ideas

- Current wizard is ~720 lines of inline HTML in `setup.ts` — rewrite with step gating, not a from-scratch rebuild
- "Verify Tables" step is absorbed into the Database step as an informational check
- The collapsed port field in the Domain step supports dev setups (e.g., `:3000`) without cluttering the standard Traefik production flow
- Domain skip warning specifically mentions pairing (Phase 20 dependency)

</specifics>

<code_context>
## Existing Code Insights

### Reusable Assets
- `setup.ts` (920 lines): Current wizard with 4 non-gated steps, inline HTML, 5 API endpoints (`/setup`, `/api/setup/test-db`, `/api/setup/save-jwt-secret`, `/api/setup/verify-tables`, `/api/setup/set-password`, `/api/setup/status`)
- `env-writer.ts`: Centralized .env writer with async mutex — reuse for all writes (Phase 18)
- `preflight.ts`: `GET /api/setup/preflight` returns structured JSON checklist — wizard consumes this on load
- `system-state.ts`: Singleton tracking `dbConnected`, `preflightChecks` — wizard can read state

### Established Patterns
- Fastify route registration via `app.register()` in `app.ts`
- Zod schemas for request validation (TestDbSchema, SetPasswordSchema already exist)
- `writeEnvVar()` for safe .env writes with proper escaping
- Client-side `crypto.getRandomValues` for JWT generation (already in current wizard JS)

### Integration Points
- `app.ts`: `registerSetupRoutes()` already registered — wizard enhancement is in-place
- `preflight.ts`: Wizard calls `GET /api/setup/preflight` on load for pre-fill
- `.env.example`: Template for .env generation — must be kept in sync with wizard fields
- Phase 20 (pairing): Will add a final wizard step showing the pairing code — GATEWAY_PUBLIC_URL must be set by then

</code_context>

<deferred>
## Deferred Ideas

- Hot reload of JWT_SECRET after .env write (currently requires restart for JWT changes) — evaluate in Phase 19 or later
- Setup access token shown in container logs for first-time security — noted from Phase 18 (INT-04)
- QR code for pairing — Future requirement PAIR-F01

</deferred>

---

*Phase: 19-setup-wizard-enhancement*
*Context gathered: 2026-03-05*
