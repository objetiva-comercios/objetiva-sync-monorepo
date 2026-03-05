# Roadmap: Objetiva Sync

## Milestones

- [x] **v1.0 Schema-Driven Control** - Phases 1-7 (shipped 2026-02-03)
- [x] **v1.1-rc Release Candidate** - Phases 8-12 (shipped 2026-02-05)
- [x] **v1.1-rc2 Multi-Source & Hardening** - Phases 13-16 (shipped 2026-02-18)
- [x] **v1.1-rc2 Dashboard (rolled back)** - Phase 17 (rolled back)
- [ ] **v1.2 Setup & Pairing** - Phases 18-21 (in progress)

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
- [ ] **Phase 21: Sync Pairing Client** - Sync dashboard lets operator enter pairing code and link to gateway automatically

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
**Plans:** 2 plans
Plans:
- [ ] 21-01-PLAN.md — Backend: claim proxy route + gateway-client SQLite-first config update (TDD)
- [ ] 21-02-PLAN.md — Frontend: pairing card UI in api.ejs with claim flow + human verify

## Progress

**Execution Order:**
Phases execute in numeric order: 18 → 19 → 20 → 21

| Phase | Milestone | Plans Complete | Status | Completed |
|-------|-----------|----------------|--------|-----------|
| 1-7. Foundation through Monitoring | v1.0 | 14/14 | Complete | 2026-02-03 |
| 8-12. Reliability & Deployment | v1.1-rc | 15/15 | Complete | 2026-02-05 |
| 13-16. Multi-Source & Hardening | v1.1-rc2 | 14/14 | Complete | 2026-02-18 |
| 18. Pre-Flight Validator | 2/2 | Complete    | 2026-03-05 | - |
| 19. Setup Wizard Enhancement | 2/2 | Complete    | 2026-03-05 | - |
| 20. Gateway Pairing Routes | 2/2 | Complete    | 2026-03-05 | - |
| 21. Sync Pairing Client | v1.2 | 0/2 | Not started | - |

---
*Last updated: 2026-03-05 — Phase 21 planned (2 plans)*
