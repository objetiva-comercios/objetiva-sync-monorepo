# Roadmap: Objetiva Sync

## Milestones

- [x] **v1.0 Schema-Driven Control** - Phases 1-7 (shipped 2026-02-03)
- [x] **v1.1-rc Release Candidate** - Phases 8-12 (shipped 2026-02-05)
- [x] **v1.1-rc2 Multi-Source & Hardening** - Phases 13-16 (shipped 2026-02-18)
- [x] **v1.1-rc2 Dashboard (rolled back)** - Phase 17 (rolled back)
- [ ] **v1.2 Setup & Pairing** - Phases 18-24 (in progress)

---

<details>
<summary>v1.0 Schema-Driven Control (Phases 1-7) — SHIPPED 2026-02-03</summary>

Phases 1-7 completed. See `.planning/milestones/v1.0-ROADMAP.md` for details.

</details>

<details>
<summary>v1.1-rc Release Candidate (Phases 8-12) — SHIPPED 2026-02-05</summary>

Phases 8-12 completed. See `.planning/milestones/v1.1-rc-ROADMAP.md` for details.

</details>

<details>
<summary>v1.1-rc2 Multi-Source & Hardening (Phases 13-16) — SHIPPED 2026-02-18</summary>

Phases 13-16 completed. See `.planning/milestones/v1.1-rc2-ROADMAP.md` for details.

Note: Phase 17 (Dashboard Modernization with shadcn/React) was implemented but rolled back. HTMX dashboard remains.

</details>

---

## v1.2 Setup & Pairing

**Milestone Goal:** Simplificar radicalmente la instalacion del gateway y el enlace sync-gateway. Operadores instalan en minutos con un codigo de 6 caracteres en lugar de copiar manualmente un JWT secret de 64 caracteres entre servidores.

## Phases

- [x] **Phase 18: Pre-Flight Validator** - Gateway validates all startup requirements before accepting traffic (completed 2026-03-05)
- [x] **Phase 19: Setup Wizard Enhancement** - Wizard guides operator through complete gateway configuration with .env generation (completed 2026-03-05)
- [x] **Phase 20: Gateway Pairing Routes** - Gateway generates short-lived pairing codes; claim endpoint transfers credentials to sync (completed 2026-03-05)
- [x] **Phase 21: Sync Pairing Client** - Sync dashboard lets operator enter pairing code and link to gateway automatically (completed 2026-03-05)
- [x] **Phase 22: Auth Simplification** - Remove password-based login, keep JWT-only auth via shared secret (in progress) (completed 2026-03-16)
- [x] **Phase 23: Fix Wizard Pairing Auth & Missing Dependency** - Fix critical 403 bug in wizard pairing flow and add missing fast-jwt dependency (completed 2026-03-16)
- [ ] **Phase 24: Phase 21 Verification & Traceability Update** - Verify Phase 21 implementation, update traceability, fix documentation gaps

## Phase Details

### Phase 18: Pre-Flight Validator
**Goal**: Gateway validates all environment and infrastructure requirements at startup and fails fast with actionable errors
**Depends on**: Nothing (gateway-only, additive)
**Requirements**: PF-01, PF-02, PF-03, PF-04, PF-05
**Success Criteria** (what must be TRUE):
  1. Starting gateway with a missing required env var prints a specific error naming that variable and exits with code 1 — no cryptic crash
  2. Starting gateway with wrong PostgreSQL credentials shows a connectivity failure message before accepting any HTTP traffic
  3. Starting gateway against a database missing any of the 4 required tables shows a migration hint message, not a runtime crash on first sync
  4. GET /api/setup/preflight returns a structured JSON checklist with pass/fail status and remediation text for each of the 5 checks
  5. Writing two env vars to .env simultaneously from two concurrent requests produces a valid .env file with both values, not a corrupted file
**Plans:** 2/2 plans complete
Plans:
- [ ] 18-01-PLAN.md — Centralized .env writer with async mutex (TDD)
- [ ] 18-02-PLAN.md — Startup validation, preflight endpoint, and .env write refactor

### Phase 19: Setup Wizard Enhancement
**Goal**: Operator can configure the entire gateway through a step-gated wizard and download a ready-to-use .env file without editing text files manually
**Depends on**: Phase 18
**Requirements**: WIZ-01, WIZ-02, WIZ-03, WIZ-04, WIZ-05, WIZ-06
**Success Criteria** (what must be TRUE):
  1. Clicking "Next" on an incomplete wizard step does not advance — the current step remains active with validation feedback visible
  2. The DATABASE_URL step shows separate input fields for host, port, user, password, and database name, not a single text field for the full connection string
  3. The domain step has an input for subdomain/FQDN that becomes the GATEWAY_PUBLIC_URL value in the generated .env
  4. Clicking "Generate JWT Secret" fills the JWT_SECRET field with a 64-character hex string without requiring the operator to leave the page
  5. Completing all wizard steps produces a downloadable .env file containing all required variables with correct values and properly escaped special characters
**Plans:** 2/2 plans complete
Plans:
- [ ] 19-01-PLAN.md — Backend endpoints: save-domain, generate-env, status extension (TDD)
- [ ] 19-02-PLAN.md — Frontend wizard rewrite: 5-step gated flow with split DB fields and .env download

### Phase 20: Gateway Pairing Routes
**Goal**: Gateway issues short-lived pairing codes that sync can claim to receive all connection credentials in one automated exchange
**Depends on**: Phase 19
**Requirements**: PAIR-01, PAIR-02, PAIR-03, PAIR-04, PAIR-05
**Success Criteria** (what must be TRUE):
  1. POST /api/pairing/generate (authenticated) returns a 6-character alphanumeric code and an expiration timestamp; the code appears in the wizard as the final step
  2. POST /api/pairing/claim with a valid code returns the gateway URL, JWT secret, and sync credentials in the response body
  3. POST /api/pairing/claim with the same code a second time returns 410 Gone — the code is consumed on first use
  4. POST /api/pairing/claim from the same IP more than 5 times per minute returns 429 Too Many Requests
  5. A pairing code generated before a container restart is no longer valid after the restart (code not persisted incorrectly across restarts)
**Plans:** 2/2 plans complete
Plans:
- [ ] 20-01-PLAN.md — Pairing store module + routes with TDD (generate, claim, rate limit)
- [ ] 20-02-PLAN.md — Wizard step 6: Link Sync Client (code display, countdown, copy)

### Phase 21: Sync Pairing Client
**Goal**: Operator enters the 6-character pairing code in the sync dashboard and the sync-to-gateway connection configures itself automatically
**Depends on**: Phase 20
**Requirements**: SPC-01, SPC-02, SPC-03
**Success Criteria** (what must be TRUE):
  1. The API configuration section of the sync dashboard contains a "Link via code" input field and a "Connect" button
  2. Entering a valid pairing code and clicking "Connect" shows a success message and the sync's SQLite config is updated with the received gateway URL and credentials — without restarting the sync service
  3. After a successful pairing, the sync automatically runs a connection test and shows the result (connected / failed) in the same UI section
**Plans:** 2/2 plans complete
Plans:
- [ ] 21-01-PLAN.md — Backend: claim proxy route + gateway-client SQLite-first config update (TDD)
- [ ] 21-02-PLAN.md — Frontend: pairing card UI in api.ejs with claim flow + human verify

### Phase 22: Simplify sync-gateway auth to token-based pairing-only
**Goal**: Remove password-based login flow entirely; sync signs JWTs locally with shared JWT_SECRET, gateway verifies signatures. One credential instead of two, 5-step wizard instead of 6.
**Depends on**: Phase 21
**Requirements**: AUTH-RM-01, AUTH-RM-02, AUTH-RM-03, AUTH-RM-04, AUTH-RM-05, AUTH-RM-06, AUTH-RM-07, AUTH-RM-08
**Success Criteria** (what must be TRUE):
  1. Gateway has no /auth/login or /auth/refresh routes — POST to either returns 404
  2. Gateway starts and runs without SYNC_PASSWORD or SYNC_USERNAME env vars
  3. Setup wizard has 5 steps with no password step; step 5 uses POST /api/setup/token for JWT
  4. Pairing claim returns only gatewayUrl + jwtSecret (no syncPassword)
  5. Sync batch clients authenticate via direct getJwtToken() import, no AuthManager class exists
  6. Sync dashboard shows pairing status instead of token expiry, no password fields in config form
  7. Codegen script authenticates via local JWT signing, not /auth/login
**Plans:** 2/2 plans complete

Plans:
- [ ] 22-01-PLAN.md — Gateway: delete auth routes, clean pairing/preflight/env, renumber wizard, add setup token endpoint
- [ ] 22-02-PLAN.md — Sync: delete AuthManager, refactor batch clients, update dashboard config/pairing

### Phase 23: Fix Wizard Pairing Auth & Missing Dependency
**Goal**: Fix critical 403 bug in wizard pairing flow where POST /api/setup/token fails after apply-config mode transition, and add missing fast-jwt dependency to sync package
**Depends on**: Phase 22
**Requirements**: AUTH-RM-04, AUTH-RM-05, AUTH-RM-06, PAIR-01, PAIR-02
**Gap Closure:** Closes integration gaps (setup token 403, fast-jwt dependency) and flow gap (Fresh Install Wizard) from v1.2 audit
**Success Criteria** (what must be TRUE):
  1. POST /api/setup/token returns a valid JWT during wizard step 4, even after apply-config has transitioned startupMode to 'normal'
  2. Fresh Install Wizard completes end-to-end from step 1 through pairing code generation without 403 errors
  3. `fast-jwt` is listed as an explicit dependency in objetiva-sync/package.json and `npm install` in a clean environment resolves it
  4. No residual references to REMOTE_API_USERNAME, REMOTE_API_PASSWORD, or SYNC_PASSWORD exist in production code (env.ts, env-writer.ts)
**Plans:** 2/2 plans complete
Plans:
- [ ] 23-01-PLAN.md — Gateway: fix 403 bug (setupComplete flag + token guard + claim wiring) + wizard flow integration test
- [ ] 23-02-PLAN.md — Sync: add fast-jwt dependency, remove dead env fields, add import verification test

### Phase 24: Phase 21 Verification & Traceability Update
**Goal**: Verify Phase 21 implementation (SPC-01/02/03), update REQUIREMENTS.md traceability for AUTH-RM-01..08, and fix documentation gaps across phases
**Depends on**: Phase 23
**Requirements**: SPC-01, SPC-02, SPC-03
**Gap Closure:** Closes verification gap (Phase 21 unverified), traceability gap (AUTH-RM status), and documentation gaps from v1.2 audit
**Success Criteria** (what must be TRUE):
  1. Phase 21 has a VERIFICATION.md with explicit pass/fail evidence for SPC-01, SPC-02, SPC-03
  2. REQUIREMENTS.md traceability table shows AUTH-RM-01..08 as "Complete" (not "Planned")
  3. All v1.2 requirement checkboxes accurately reflect implementation status
  4. PAIR-03 scoping boundary documented (gateway in Phase 20, sync storage in Phase 21)

## Progress

**Execution Order:**
Phases execute in numeric order: 18 → 19 → 20 → 21 → 22 → 23 → 24

| Phase | Milestone | Plans Complete | Status | Completed |
|-------|-----------|----------------|--------|-----------|
| 1-7. Foundation through Monitoring | v1.0 | 14/14 | Complete | 2026-02-03 |
| 8-12. Reliability & Deployment | v1.1-rc | 15/15 | Complete | 2026-02-05 |
| 13-16. Multi-Source & Hardening | v1.1-rc2 | 14/14 | Complete | 2026-02-18 |
| 18. Pre-Flight Validator | 2/2 | Complete    | 2026-03-05 | - |
| 19. Setup Wizard Enhancement | 2/2 | Complete    | 2026-03-05 | - |
| 20. Gateway Pairing Routes | 2/2 | Complete    | 2026-03-05 | - |
| 21. Sync Pairing Client | 2/2 | Complete   | 2026-03-05 | - |
| 22. Auth Simplification | 2/2 | Complete    | 2026-03-16 | - |
| 23. Fix Wizard Pairing Auth & Missing Dependency | 2/2 | Complete    | 2026-03-16 | - |
| 24. Phase 21 Verification & Traceability Update | 0/0 | Pending | - | - |

---
*Last updated: 2026-03-16 — Phase 23 plans created (2 plans, wave 1 parallel)*
