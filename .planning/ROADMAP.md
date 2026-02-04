# Roadmap: Objetiva Sync - Schema-Driven Synchronization Control

## Milestones

- **v1.0 Schema-Driven Control** - Phases 1-7 (shipped 2026-02-03)
- **v1.1-rc Release Candidate** - Phases 8-12 (in progress)

## Phases

<details>
<summary>v1.0 Schema-Driven Control (Phases 1-7) - SHIPPED 2026-02-03</summary>

- [x] **Phase 1: Schema Introspection Foundation** - Gateway reads and normalizes PostgreSQL metadata
- [x] **Phase 2: Schema Distribution Endpoint** - Gateway exposes authenticated schema API
- [x] **Phase 3: CLI Code Regeneration** - Automated Prisma/Zod schema generation from PostgreSQL
- [x] **Phase 4: Enhanced Query Validation** - Sync validates queries against live gateway schemas
- [x] **Phase 5: Integration Testing & Hardening** - End-to-end validation and production reliability
- [x] **Phase 6: CLI E2E Verification** - Verify regenerate-schemas command executes successfully end-to-end
- [x] **Phase 7: Dashboard Monitoring Verification** - Verify dashboard functionality and fix visualization issues

| Phase | Plans Complete | Status | Completed |
|-------|----------------|--------|-----------|
| 1. Schema Introspection Foundation | 2/2 | Complete | 2026-01-27 |
| 2. Schema Distribution Endpoint | 1/1 | Complete | 2026-01-27 |
| 3. CLI Code Regeneration | 3/3 | Complete | 2026-01-30 |
| 4. Enhanced Query Validation | 2/2 | Complete | 2026-01-30 |
| 5. Integration Testing & Hardening | 5/5 | Complete | 2026-01-31 |
| 6. CLI E2E Verification | 1/1 | Complete | 2026-02-03 |
| 7. Dashboard Monitoring Verification | 0/0 | Complete | 2026-02-03 |

</details>

### v1.1-rc Release Candidate (Phases 8-12)

**Milestone Goal:** Make the sync system production-ready -- fix the sync timeout bug, implement reliable incremental sync, resolve all tech debt, configure deployment, and validate end-to-end robustness.

**Phase Numbering:**
- Integer phases (8, 9, 10...): Planned milestone work
- Decimal phases (8.1, 8.2): Urgent insertions (marked with INSERTED)

Decimal phases appear between their surrounding integers in numeric order.

- [x] **Phase 8: Sync Reliability** - Fix timeout bug and ensure full dataset sync completes without failure *(completed 2026-02-04)*
- [x] **Phase 9: Tech Debt Cleanup** - Resolve TypeScript errors, switch to generated schemas, remove development garbage *(completed 2026-02-04)*
- [ ] **Phase 10: Incremental Sync** - Implement timestamp-based delta sync for all entity types
- [ ] **Phase 11: Deployment Configuration** - Production deployment scripts and environment templates
- [ ] **Phase 12: End-to-End Robustness** - Validate complete workflow and error recovery across the pipeline

## Phase Details

### Phase 8: Sync Reliability
**Goal**: Sync service can reliably process full datasets (100K+ records) across all batch sizes without timing out or crashing
**Depends on**: Phase 7 (v1.0 complete)
**Requirements**: SYNC-01, SYNC-02, SYNC-03, SYNC-04
**Success Criteria** (what must be TRUE):
  1. Manual sync of 100K+ records runs to completion without timeout or crash
  2. Sync with batch sizes 200 and 500 completes without degradation compared to batch size 100
  3. When sync fails, the error message shows the specific root cause (timeout location, HTTP status, connection error) instead of generic "Error al ejecutar"
  4. The ~60s time-based failure no longer occurs -- sync duration scales with record count, not a fixed wall-clock limit
**Plans**: 3 plans

Plans:
- [x] 08-01-PLAN.md -- SSE heartbeat, SQL Server timeout increase, batch delay reduction, nginx config
- [x] 08-02-PLAN.md -- Error classification utility and fetch timeout (AbortSignal.timeout) for all API clients
- [x] 08-03-PLAN.md -- Gateway ingestion bulk optimization (replace N+1 with createMany + $transaction)

### Phase 9: Tech Debt Cleanup
**Goal**: Codebase compiles cleanly, uses generated schemas consistently, and contains no development garbage
**Depends on**: Nothing (independent of Phase 8, can run in parallel if needed)
**Requirements**: DEBT-01, DEBT-02, DEBT-03, DEBT-04
**Success Criteria** (what must be TRUE):
  1. `npx tsc --noEmit` in objetiva-sync-gateway completes with zero errors
  2. Gateway ingestion service imports Zod schemas from generated files (not manual/hardcoded schemas)
  3. No temporary scripts (.mjs test files), isolated .md files, or debug artifacts remain in either module root
  4. No .backup files, .bak files, or development-only artifacts remain in the repository
**Plans**: 3 plans

Plans:
- [x] 09-01-PLAN.md -- Fix all 46 gateway TypeScript errors (Prisma models, Fastify types, bigint) and switch ingestion to generated schemas
- [x] 09-02-PLAN.md -- Remove temporary scripts, backup files, and development garbage across both modules
- [x] 09-03-PLAN.md -- Gap closure: rewrite schema index to source from generated schemas, delete schema.prisma.broken

### Phase 10: Incremental Sync
**Goal**: Sync service fetches only records modified since last successful sync, dramatically reducing sync time for routine updates
**Depends on**: Phase 8 (sync must work reliably before adding incremental logic)
**Requirements**: INCR-01, INCR-02, INCR-03, INCR-04
**Success Criteria** (what must be TRUE):
  1. After a full sync completes, the last successful sync timestamp is persisted per entity type (articulos, comprobantes_cabecera, comprobantes_detalle, comprobantes_pagos)
  2. A subsequent sync fetches only records with modification timestamp newer than the stored value, processing far fewer records than a full sync
  3. Incremental sync works correctly for all 4 entity types without missing or duplicating records
  4. User can trigger a full sync manually (override) even when incremental timestamps exist
  5. Dashboard or logs clearly indicate whether a sync run was incremental or full
**Plans**: TBD

Plans:
- [ ] 10-01-PLAN.md - Timestamp tracking infrastructure and incremental query filtering
- [ ] 10-02-PLAN.md - Per-entity incremental sync implementation and full sync override

### Phase 11: Deployment Configuration
**Goal**: Both modules can be deployed to production servers with documented scripts and environment configuration
**Depends on**: Phase 9 (codebase must compile cleanly before deployment)
**Requirements**: DEPL-01, DEPL-02
**Success Criteria** (what must be TRUE):
  1. Deployment script for objetiva-sync-gateway builds, migrates database, and starts the service
  2. Deployment script for objetiva-sync builds and starts the service with correct gateway connection
  3. `.env.example` files in both modules list every required environment variable with descriptions and example values
  4. A fresh deployment using only the scripts and .env.example files succeeds without undocumented manual steps
**Plans**: TBD

Plans:
- [ ] 11-01-PLAN.md - Deployment scripts and environment configuration for both modules

### Phase 12: End-to-End Robustness
**Goal**: Complete sync pipeline validated from schema change through regeneration, validation, and sync with reliable error recovery
**Depends on**: Phase 8, Phase 9, Phase 10, Phase 11 (validates everything built in this milestone)
**Requirements**: ROBU-01, ROBU-02
**Success Criteria** (what must be TRUE):
  1. Full workflow executes successfully: PostgreSQL schema change -> regenerate-schemas CLI -> Zod/Prisma update -> sync validates -> data syncs correctly
  2. When gateway is temporarily unreachable, sync retries with backoff and recovers when connection restores
  3. When a batch fails mid-sync, the sync engine retries failed batches and continues processing remaining data
  4. Error recovery does not produce duplicate records or corrupt data
**Plans**: TBD

Plans:
- [ ] 12-01-PLAN.md - End-to-end workflow validation (schema change through sync)
- [ ] 12-02-PLAN.md - Error recovery and graceful degradation testing

## Progress

**Execution Order:**
Phases execute in numeric order: 8 -> 9 -> 10 -> 11 -> 12
(Phase 9 is logically independent of Phase 8 and could run in parallel)

| Phase | Milestone | Plans Complete | Status | Completed |
|-------|-----------|----------------|--------|-----------|
| 8. Sync Reliability | v1.1-rc | 3/3 | Complete | 2026-02-04 |
| 9. Tech Debt Cleanup | v1.1-rc | 3/3 | Complete | 2026-02-04 |
| 10. Incremental Sync | v1.1-rc | 0/2 | Not started | - |
| 11. Deployment Configuration | v1.1-rc | 0/1 | Not started | - |
| 12. End-to-End Robustness | v1.1-rc | 0/2 | Not started | - |
