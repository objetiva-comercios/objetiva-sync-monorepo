---
phase: 26-schema-comparison-api
plan: "01"
subsystem: gateway
tags: [api, schema-comparison, fastify, in-memory-store, tdd]
dependency_graph:
  requires: [26-00]
  provides: [schema-comparison-api]
  affects: [gateway-routes, gateway-services]
tech_stack:
  added: []
  patterns:
    - In-memory Map store with singleton object pattern
    - Pure function comparison logic (no class)
    - Zod safeParse for request validation
    - Sequential introspection loop (pool exhaustion prevention)
    - Named export alias for test compatibility
key_files:
  created:
    - objetiva-sync-gateway/src/services/sync-schema-store.ts
    - objetiva-sync-gateway/src/services/schema-comparison.ts
    - objetiva-sync-gateway/src/routes/schema-comparison.ts
  modified:
    - objetiva-sync-gateway/src/app.ts
decisions:
  - "@objetiva/shared is the correct workspace package path — not @shared/schemas/index.js as documented in plan interfaces"
  - "default_value in Zod schema uses .default(null) not .optional() for TableSchemaMetadata type compatibility"
  - "_resetForTest exported as both method on syncSchemaStore and standalone named export for integration test compatibility"
metrics:
  duration_seconds: 624
  completed_date: "2026-03-30"
  tasks_completed: 2
  tasks_total: 2
  files_created: 3
  files_modified: 1
---

# Phase 26 Plan 01: Schema Comparison API — Implementation Summary

Gateway-side 3-way schema comparison API with in-memory sync store, pure comparison logic, and two authenticated Fastify route handlers (POST /api/schemas/report, GET /api/schemas/compare).

## Tasks Completed

| Task | Name | Commit | Key Files |
|------|------|--------|-----------|
| 1 | Create sync schema store and comparison service | 850769c | sync-schema-store.ts, schema-comparison.ts |
| 2 | Create route handlers and register in app.ts | 9db9bb1 | routes/schema-comparison.ts, app.ts |

## What Was Built

**sync-schema-store.ts** — Module-level `Map<string, TableSchemaMetadata>` wrapped in a singleton object. `set()` does a full overwrite (store.clear() + loop). `hasData()` checks `store.size > 0`. `_resetForTest()` is both a method on the object and a named export for test compatibility.

**schema-comparison.ts** — Pure functions: `buildEntityComparison(entity, pgSchema, compiledSchema, syncSchema, syncReported)` iterates PostgreSQL columns as authoritative source. Builds column lookup maps for compiled and sync layers, calls `compareField()` for each column. Returns `EntityComparison` with `sync_reported`, `fields[]`, and `summary {aligned, mismatched, missing}`. When `pgSchema === null`, falls back to iterating compiled columns with `postgresql: null` and `status: 'missing'`.

**routes/schema-comparison.ts** — Registers `POST /api/schemas/report` (validates with Zod `reportBodySchema`, calls `syncSchemaStore.set()`, returns 200) and `GET /api/schemas/compare` (sequential introspection loop with try/catch per entity, returns `EntityComparison[]`). Both use `preHandler: authenticate`.

**app.ts** — `registerSchemaComparisonRoutes` imported and called before `setNotFoundHandler`.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Wrong package path for shared types**

- **Found during:** Task 1 (integration test run)
- **Issue:** Plan interfaces documented `@shared/schemas/index.js` and `@shared/types/schema-metadata.js` but these path aliases don't resolve in Vitest or production — only TypeScript tsconfig path aliases exist, not Node.js module resolution
- **Fix:** Changed all `@shared/*` imports to `@objetiva/shared/schemas` and `@objetiva/shared/types` — the actual npm workspace package registered in monorepo node_modules
- **Files modified:** sync-schema-store.ts, schema-comparison.ts, routes/schema-comparison.ts
- **Commit:** 9db9bb1 (included in Task 2 commit)

**2. [Rule 1 - Bug] Zod `default_value` type incompatibility with `TableSchemaMetadata`**

- **Found during:** Task 2 (TypeScript compilation)
- **Issue:** `z.string().nullable().optional()` produces `string | null | undefined` but `ColumnMetadata.default_value` is `string | null` (not optional) — caused TS2345 on `syncSchemaStore.set()`
- **Fix:** Changed to `z.string().nullable().default(null)` which produces `string | null`
- **Files modified:** routes/schema-comparison.ts
- **Commit:** 9db9bb1

**3. [Rule 2 - Missing] `_resetForTest` needs dual export for integration tests**

- **Found during:** Task 2 (reading integration test file)
- **Issue:** Integration test imports `_resetForTest` as a named export `import { _resetForTest } from '../../src/services/sync-schema-store.js'` — plan only specified it as a method on `syncSchemaStore`
- **Fix:** Added a standalone function export `export function _resetForTest()` that delegates to `syncSchemaStore._resetForTest()`
- **Files modified:** sync-schema-store.ts
- **Commit:** 850769c

## Test Results

- Unit tests: 24/24 passing (`sync-schema-store.test.ts` + `schema-comparison.test.ts`)
- Integration tests: 12/12 passing (`schema-comparison.integration.test.ts`)
- TypeScript: `npx tsc --noEmit` exits 0 (no errors)
- Pre-existing failures (not caused by this plan): 6 tests in cli-regenerate + setup-wizard + wizard-flow test files — verified as pre-existing by stash check

## Known Stubs

None. All data flows are wired: the comparison route reads from IntrospectionService (live PostgreSQL), `getTableSchema()` (compiled schemas), and `syncSchemaStore` (sync-reported schemas). The `sync_reported: false` state is intentional and documented behavior (D-05).

## Self-Check: PASSED

Files created:
- `objetiva-sync-gateway/src/services/sync-schema-store.ts` — FOUND
- `objetiva-sync-gateway/src/services/schema-comparison.ts` — FOUND
- `objetiva-sync-gateway/src/routes/schema-comparison.ts` — FOUND

Commits:
- `850769c` feat(26-01): create sync schema store and comparison service — FOUND
- `9db9bb1` feat(26-01): create schema comparison routes and register in app.ts — FOUND
