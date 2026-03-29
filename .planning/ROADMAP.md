# Roadmap: Objetiva Sync

## Milestones

- [x] **v1.0 Schema-Driven Control** - Phases 1-7 (shipped 2026-02-03)
- [x] **v1.1-rc Release Candidate** - Phases 8-12 (shipped 2026-02-05)
- [x] **v1.1-rc2 Multi-Source & Hardening** - Phases 13-16 (shipped 2026-02-18)
- [x] **v1.1-rc2 Dashboard (rolled back)** - Phase 17 (rolled back)
- [x] **v1.2 Setup & Pairing** - Phases 18-24 (completed 2026-03-16)
- [ ] **v1.3 Distributed Schema Regeneration** - Phases 25-28 (in progress)

---

<details>
<summary>v1.0 Schema-Driven Control (Phases 1-7) -- SHIPPED 2026-02-03</summary>

Phases 1-7 completed. See `.planning/milestones/v1.0-ROADMAP.md` for details.

</details>

<details>
<summary>v1.1-rc Release Candidate (Phases 8-12) -- SHIPPED 2026-02-05</summary>

Phases 8-12 completed. See `.planning/milestones/v1.1-rc-ROADMAP.md` for details.

</details>

<details>
<summary>v1.1-rc2 Multi-Source & Hardening (Phases 13-16) -- SHIPPED 2026-02-18</summary>

Phases 13-16 completed. See `.planning/milestones/v1.1-rc2-ROADMAP.md` for details.

Note: Phase 17 (Dashboard Modernization with shadcn/React) was implemented but rolled back. HTMX dashboard remains.

</details>

<details>
<summary>v1.2 Setup & Pairing (Phases 18-24) -- COMPLETED 2026-03-16</summary>

Phases 18-24 completed. See `.planning/milestones/v1.2-ROADMAP.md` for details.

</details>

---

## v1.3 Distributed Schema Regeneration

**Milestone Goal:** Adaptar el pipeline de regeneracion de schemas para arquitectura distribuida (sync en Windows, gateway dockerizado en VPS Linux), con Schema Status page en el gateway dashboard y fix del bug 207.

## Phases

- [ ] **Phase 25: Script Adaptation & 207 Fix** - Adapt regeneration script for distributed architecture and fix 207 multi-status bug
- [ ] **Phase 26: Schema Comparison API** - Gateway endpoints for 3-way schema comparison and sync schema reporting
- [ ] **Phase 27: Schema Status Page** - React dashboard page showing schema alignment across all layers
- [ ] **Phase 28: Deploy Flow Documentation** - Document the complete regenerate-commit-rebuild-push deploy cycle

## Phase Details

### Phase 25: Script Adaptation & 207 Fix
**Goal**: Operator can run the regeneration script from Windows and get updated Zod/Prisma schemas from the remote gateway without any process-killing or DLL dependencies; batches with 207/0-errors count as successful
**Depends on**: Nothing (first phase of v1.3)
**Requirements**: REGEN-01, REGEN-02, REGEN-03, REGEN-04, FIX-01
**Success Criteria** (what must be TRUE):
  1. Running `npm run regenerate-schemas` from the Windows dev machine connects to the remote gateway via HTTP, fetches all 4 entity schemas, and generates updated files in `shared/schemas/generated/` and `prisma/schema.prisma` without errors
  2. Running `npm run regenerate-schemas:dry-run` shows a colored diff of detected changes (added/removed/modified fields) without writing any files to disk
  3. The script completes its full cycle without calling `taskkill`, loading Windows DLLs, or requiring filesystem access to the Docker container
  4. After a sync batch receives HTTP 207 with `{ errors: 0 }`, the sync client logs and counts it as a successful batch (not a failure)
**Plans:** 2/3 plans executed
Plans:
- [x] 25-00-PLAN.md — Wave 0: Test scaffolds for 207 fix (Nyquist compliance)
- [ ] 25-01-PLAN.md — New regeneration script at monorepo root + delete old gateway script
- [x] 25-02-PLAN.md — Fix 207 Multi-Status bug in all 4 sync API clients

### Phase 26: Schema Comparison API
**Goal**: Gateway can compare PostgreSQL live schema against its own compiled schemas and against schemas reported by sync, exposing structured comparison data via API
**Depends on**: Phase 25
**Requirements**: SCHEMA-02, SCHEMA-04
**Success Criteria** (what must be TRUE):
  1. Sync reports its current schema version to the gateway via a dedicated endpoint (POST or PUT), and the gateway stores this per-entity schema snapshot in memory
  2. GET endpoint on the gateway returns a structured 3-way comparison for each entity: PostgreSQL live columns vs gateway compiled TableSchemaMetadata vs sync-reported schema, with per-field alignment status (aligned/mismatched/missing)
  3. The comparison API returns data for all 4 entities (articulos, comprobantes_cabecera, comprobantes_detalle, comprobantes_pagos) in a single request
**Plans**: TBD

### Phase 27: Schema Status Page
**Goal**: Operator can view a Schema Status page in the gateway React dashboard showing full column details and visual alignment indicators across all 3 schema layers
**Depends on**: Phase 26
**Requirements**: SCHEMA-01, SCHEMA-03
**Success Criteria** (what must be TRUE):
  1. The gateway React dashboard has a "Schema Status" page accessible from the navigation that displays all columns, types, nullable, defaults, and comments for each entity
  2. Each field row shows a color-coded alignment indicator: green for aligned across all 3 layers, red for mismatched between layers, yellow for fields present in PostgreSQL but not yet propagated to gateway or sync schemas
  3. The page loads schema comparison data from the Phase 26 API and renders it without requiring manual refresh or page reload
  4. The page uses Lucide icons and Inter font, following the project design system
**Plans**: TBD
**UI hint**: yes

### Phase 28: Deploy Flow Documentation
**Goal**: Operator has a clear, documented procedure for the complete schema regeneration deploy cycle
**Depends on**: Phase 27
**Requirements**: FIX-02
**Success Criteria** (what must be TRUE):
  1. A deploy flow document exists that describes the complete cycle: regenerate schemas locally, review diffs, commit, push, rebuild Docker image, and verify prisma db push runs automatically on container start
  2. The document covers the common scenarios: new column added, column type changed, column removed, new table added
**Plans**: TBD

## Progress

**Execution Order:**
Phases execute in numeric order: 25 -> 26 -> 27 -> 28

| Phase | Milestone | Plans Complete | Status | Completed |
|-------|-----------|----------------|--------|-----------|
| 1-7. Foundation through Monitoring | v1.0 | 14/14 | Complete | 2026-02-03 |
| 8-12. Reliability & Deployment | v1.1-rc | 15/15 | Complete | 2026-02-05 |
| 13-16. Multi-Source & Hardening | v1.1-rc2 | 14/14 | Complete | 2026-02-18 |
| 18-24. Setup & Pairing | v1.2 | 13/13 | Complete | 2026-03-16 |
| 25. Script Adaptation & 207 Fix | v1.3 | 2/3 | In Progress|  |
| 26. Schema Comparison API | v1.3 | 0/? | Not started | - |
| 27. Schema Status Page | v1.3 | 0/? | Not started | - |
| 28. Deploy Flow Documentation | v1.3 | 0/? | Not started | - |

---
*Last updated: 2026-03-29 -- Phase 25 plans revised (added Wave 0)*
