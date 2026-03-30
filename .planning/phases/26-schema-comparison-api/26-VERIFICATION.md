---
phase: 26-schema-comparison-api
verified: 2026-03-29T23:52:00Z
status: passed
score: 13/13 must-haves verified
re_verification: false
---

# Phase 26: Schema Comparison API Verification Report

**Phase Goal:** Implement POST /api/schemas/report and GET /api/schemas/compare endpoints in the gateway; create sync-side client that reports compiled schemas on startup.
**Verified:** 2026-03-29T23:52:00Z
**Status:** passed
**Re-verification:** No — initial verification

---

## Goal Achievement

### Observable Truths

#### Plan 00 Truths (Test Scaffolds)

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | Unit tests exist for sync schema store set/get/hasData/reset operations | VERIFIED | `tests/unit/sync-schema-store.test.ts` — 182 lines, 11 `it()` blocks; vitest: 11/11 pass |
| 2 | Unit tests exist for comparison logic: aligned, mismatched, missing, not_reported, summary counts | VERIFIED | `tests/unit/schema-comparison.test.ts` — 305 lines, 13 `it()` blocks; vitest: 13/13 pass |
| 3 | Integration tests exist for POST /api/schemas/report (auth, validation, storage) | VERIFIED | `tests/integration/schema-comparison.integration.test.ts` — 370 lines, 12 `it()` blocks covering both routes |
| 4 | Integration tests exist for GET /api/schemas/compare (all 4 entities, not_reported state) | VERIFIED | Same file — contains tests for 4-entity array response, sync_reported: false/true state transitions |

#### Plan 01 Truths (Gateway Implementation)

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 5 | POST /api/schemas/report stores sync-reported schemas in memory and returns 200 | VERIFIED | Route handler calls `syncSchemaStore.set()` on valid body, returns `{ success: true }` with status 200; integration tests: 12/12 pass |
| 6 | POST /api/schemas/report rejects unauthenticated requests with 401 | VERIFIED | `preHandler: authenticate` on route; integration test confirms 401 without/with-invalid token |
| 7 | POST /api/schemas/report rejects invalid bodies with 400 and VALIDATION_ERROR code | VERIFIED | `reportBodySchema.safeParse` with `.min(1)` on schemas array; returns `{ error, code: 'VALIDATION_ERROR', details }` on failure |
| 8 | GET /api/schemas/compare returns structured 3-way comparison for all 4 entities | VERIFIED | Sequential loop over `getSyncEntities()`, calls `buildEntityComparison` per entity; integration test asserts array length 4 |
| 9 | GET /api/schemas/compare shows sync_reported: false and sync: null when sync has not reported | VERIFIED | `syncSchemaStore.hasData()` check; `buildEntityComparison` propagates `syncReported=false`; integration test asserts this state |
| 10 | Comparison correctly computes aligned, mismatched, and missing statuses | VERIFIED | `buildEntityComparison` + `compareField` private helper; unit tests: 13/13 pass covering all status paths |

#### Plan 02 Truths (Sync Client)

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 11 | Sync reports its compiled schemas to the gateway on startup before the first sync cycle | VERIFIED | `index.ts` step 3.6 calls `reportSchemasToGateway()` after `initializeSchemaCache()` (line 222) and before `initScheduler()` (line 232) |
| 12 | Schema report failure is non-blocking — sync proceeds even if the gateway is unreachable | VERIFIED | try/catch in `index.ts` lines 224-229; catch logs at `warn` level and does not rethrow |
| 13 | getGatewayUrl is exported from gateway-client.ts for reuse | VERIFIED | Line 21: `export async function getGatewayUrl(): Promise<string>` |

**Score:** 13/13 truths verified

---

### Required Artifacts

#### Plan 00 Artifacts

| Artifact | Min Lines | Actual | Status | Details |
|----------|-----------|--------|--------|---------|
| `objetiva-sync-gateway/tests/unit/sync-schema-store.test.ts` | 40 | 182 | VERIFIED | Imports `syncSchemaStore`; 11 `it()` blocks |
| `objetiva-sync-gateway/tests/unit/schema-comparison.test.ts` | 80 | 305 | VERIFIED | Imports `buildEntityComparison`; 13 `it()` blocks |
| `objetiva-sync-gateway/tests/integration/schema-comparison.integration.test.ts` | 80 | 370 | VERIFIED | 12 `it()` blocks; uses `app.inject()` pattern |

#### Plan 01 Artifacts

| Artifact | Provides | Status | Details |
|----------|----------|--------|---------|
| `objetiva-sync-gateway/src/services/sync-schema-store.ts` | In-memory Map store | VERIFIED | 72 lines; exports `syncSchemaStore` with all 4 methods + standalone `_resetForTest` |
| `objetiva-sync-gateway/src/services/schema-comparison.ts` | Pure comparison logic | VERIFIED | 219 lines; exports `buildEntityComparison`, `FieldLayerData`, `ComparisonFieldRow`, `EntityComparison` |
| `objetiva-sync-gateway/src/routes/schema-comparison.ts` | Route handlers | VERIFIED | 154 lines; exports `registerSchemaComparisonRoutes`; both routes with `preHandler: authenticate` |
| `objetiva-sync-gateway/src/app.ts` | Route registration | VERIFIED | Contains `import { registerSchemaComparisonRoutes }` and `await registerSchemaComparisonRoutes(app)` at line 162, before `setNotFoundHandler` at line 165 |

#### Plan 02 Artifacts

| Artifact | Provides | Status | Details |
|----------|----------|--------|---------|
| `objetiva-sync/src/api-client/schema-report-client.ts` | HTTP client for schema report | VERIFIED | 47 lines; exports `reportSchemasToGateway`; uses native fetch, AbortSignal.timeout(10_000) |
| `objetiva-sync/src/services/gateway-client.ts` | Exported getGatewayUrl | VERIFIED | Line 21: `export async function getGatewayUrl` — additive change only |
| `objetiva-sync/src/index.ts` | Schema report in startup | VERIFIED | Import at line 29; call at line 226 wrapped in try/catch (step 3.6) |

---

### Key Link Verification

| From | To | Via | Status | Details |
|------|----|-----|--------|---------|
| `routes/schema-comparison.ts` | `services/sync-schema-store.ts` | `import syncSchemaStore` | WIRED | Line 22: `import { syncSchemaStore } from '../services/sync-schema-store.js'` |
| `routes/schema-comparison.ts` | `services/schema-comparison.ts` | `import buildEntityComparison` | WIRED | Line 23: `import { buildEntityComparison } from '../services/schema-comparison.js'` |
| `routes/schema-comparison.ts` | `services/introspection.ts` | `IntrospectionService.introspectTable` | WIRED | Line 139: `pgSchema = await IntrospectionService.introspectTable('public', entity)` |
| `app.ts` | `routes/schema-comparison.ts` | `import and register` | WIRED | Lines 19 + 162: imported and called before `setNotFoundHandler` |
| `schema-report-client.ts` | `shared/schemas/index.ts` | `import tableSchemas` | WIRED | Line 11: `import { tableSchemas } from '@shared/schemas/index.js'` (alias resolves via tsconfig.json paths) |
| `schema-report-client.ts` | `services/gateway-client.ts` | `import getJwtToken, getGatewayUrl` | WIRED | Line 12: both functions imported and called in `reportSchemasToGateway` |
| `index.ts` | `api-client/schema-report-client.ts` | `import and call in startup` | WIRED | Lines 29 + 226: imported and called in step 3.6 |

---

### Data-Flow Trace (Level 4)

| Artifact | Data Variable | Source | Produces Real Data | Status |
|----------|---------------|--------|--------------------|--------|
| `routes/schema-comparison.ts` (GET handler) | `pgSchema` | `IntrospectionService.introspectTable('public', entity)` — live PostgreSQL query | Yes (or null with caught error when DB unavailable) | FLOWING |
| `routes/schema-comparison.ts` (GET handler) | `compiledSchema` | `getTableSchema(entity)` from `@objetiva/shared/schemas` — real compiled definitions | Yes — 4 entity schemas defined in shared package | FLOWING |
| `routes/schema-comparison.ts` (GET handler) | `syncSchema` | `syncSchemaStore.get(entity)` — in-memory store populated by POST | Yes — populated by real POST body, `null` until first report | FLOWING |
| `schema-report-client.ts` | `snapshots` | `Object.values(tableSchemas)` — all 4 compiled entity schemas | Yes — real compiled schemas, not empty | FLOWING |

---

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
|----------|---------|--------|--------|
| Unit tests pass (sync-schema-store) | `vitest run tests/unit/sync-schema-store.test.ts` | 11/11 pass | PASS |
| Unit tests pass (schema-comparison) | `vitest run tests/unit/schema-comparison.test.ts` | 13/13 pass | PASS |
| Integration tests pass (both routes) | `vitest run tests/integration/schema-comparison.integration.test.ts` | 12/12 pass | PASS |
| TypeScript compiles (gateway) | `cd objetiva-sync-gateway && npx tsc --noEmit` | Exit 0, no output | PASS |
| TypeScript compiles (sync) | `cd objetiva-sync && npx tsc --noEmit` | Exit 0, no output | PASS |

---

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|-------------|------------|-------------|--------|----------|
| SCHEMA-02 | 26-00, 26-01 | Schema Status compares 3 levels: PostgreSQL live vs schemas compilados en gateway vs schemas reportados por sync | SATISFIED | `buildEntityComparison` implements 3-way comparison; `GET /api/schemas/compare` returns per-field `postgresql`, `compiled`, `sync` layers with `aligned`/`mismatched`/`missing` statuses; 24 unit tests + 12 integration tests pass |
| SCHEMA-04 | 26-00, 26-01, 26-02 | Sync reporta su version de schemas al gateway via endpoint dedicado | SATISFIED | `POST /api/schemas/report` endpoint in gateway accepts `TableSchemaMetadata[]` with JWT auth; `reportSchemasToGateway()` in objetiva-sync POSTs all 4 compiled schemas on startup; startup sequence hooked between cache init and scheduler; non-blocking on failure |

No orphaned requirements — SCHEMA-02 and SCHEMA-04 are the only requirements mapped to Phase 26 in the traceability table.

---

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| `src/services/schema-comparison.ts` | 184 | `return []` | INFO | Legitimate guard — returns empty fields array when `compiledSchema` has no columns and `pgSchema` is null. Correct behavior, not a stub. |

No blockers or warnings found. The `return []` at line 184 is inside `buildFieldsForNullPg()` when `columns.length === 0` — it is conditional on empty input, not a default empty return replacing real logic.

---

### Human Verification Required

#### 1. Live 3-Way Comparison with Real PostgreSQL

**Test:** Start the gateway with a connected PostgreSQL instance. Call GET /api/schemas/compare with a valid JWT. Confirm the response shows actual column data (data_type, is_nullable) for `articulos` and other entities, not all-missing fields.
**Expected:** Array of 4 EntityComparison objects with `postgresql` fields populated from live DB introspection, matching the compiled schemas in most fields.
**Why human:** Integration tests run against a dev DB where the tables don't exist (42P01 errors logged but handled). The `pgSchema = null` fallback is exercised, not the live-data path.

#### 2. End-to-End Schema Report Flow

**Test:** Start the objetiva-sync service in a running environment. Watch the logs at startup. Confirm `"Schemas reported to gateway"` log appears at info level with 4 entity names listed between the schema cache init and scheduler init log lines.
**Expected:** Log line: `"Schemas reported to gateway"` with `entities: ["articulos", "comprobantes_cabecera", "comprobantes_detalle", "comprobantes_pagos"]`
**Why human:** Requires both sync and gateway services running simultaneously with a live network connection between them.

---

### Gaps Summary

No gaps. All 13 must-have truths are verified, all 10 production artifacts exist and are substantive, all 7 key links are wired, data flows through all dynamic paths, both requirements are satisfied, TypeScript compiles cleanly in both packages, and all 36 tests pass (24 unit + 12 integration).

The two human verification items are operational checks that require live services — they cannot be verified programmatically and do not block the phase.

---

_Verified: 2026-03-29T23:52:00Z_
_Verifier: Claude (gsd-verifier)_
