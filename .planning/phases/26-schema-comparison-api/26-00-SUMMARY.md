---
phase: 26-schema-comparison-api
plan: "00"
subsystem: objetiva-sync-gateway/tests
tags: [testing, tdd, wave-0, schema-comparison, red-phase]
dependency_graph:
  requires: []
  provides: [test-scaffolds-schema-store, test-scaffolds-schema-comparison, test-scaffolds-integration]
  affects: [26-01-production-code, 26-02-sync-client]
tech_stack:
  added: []
  patterns: [vitest-unit-test, vitest-integration-test, red-phase-tdd]
key_files:
  created:
    - objetiva-sync-gateway/tests/unit/sync-schema-store.test.ts
    - objetiva-sync-gateway/tests/unit/schema-comparison.test.ts
    - objetiva-sync-gateway/tests/integration/schema-comparison.integration.test.ts
  modified: []
decisions:
  - "Test scaffolds import non-existent modules intentionally — fail at import time (RED phase)"
  - "Integration test imports _resetForTest from sync-schema-store for isolation (mirrors pairing pattern)"
  - "buildEntityComparison takes (entity, pgSchema|null, compiledSchema, syncSchema|null, syncReported) signature"
  - "null pgSchema returns all fields with status 'missing' and postgresql: null"
  - "syncReported=false uses 2-way comparison (pg vs compiled), sync: null per field"
metrics:
  duration: "4m"
  completed: "2026-03-30T02:31:20Z"
  tasks_completed: 2
  tasks_total: 2
  files_created: 3
  files_modified: 0
---

# Phase 26 Plan 00: Test Scaffolds for Schema Comparison API Summary

Wave 0 test scaffolds for the 3-way schema comparison API. Three test files define the expected behavior for `syncSchemaStore` (in-memory store), `buildEntityComparison` (comparison logic), and both HTTP routes (`POST /api/schemas/report`, `GET /api/schemas/compare`). All tests fail at import time because production modules do not exist — this is intentional RED phase behavior.

## Tasks Completed

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | Create unit test scaffolds for sync schema store and comparison logic | a212334 | tests/unit/sync-schema-store.test.ts, tests/unit/schema-comparison.test.ts |
| 2 | Create integration test scaffold for schema comparison routes | 7ec9bb9 | tests/integration/schema-comparison.integration.test.ts |

## What Was Built

### Task 1: Unit Tests (2 files)

**`tests/unit/sync-schema-store.test.ts`** (12 `it()` blocks)
- `set()` and `get()`: stores schemas, retrieves by entity name, clears previous data on overwrite, returns null for unknown entities, handles multiple entities
- `hasData()`: returns false initially, true after `set()`, false after `_resetForTest()`
- `_resetForTest()`: clears all data, idempotent, allows re-population after reset

**`tests/unit/schema-comparison.test.ts`** (13 `it()` blocks)
- aligned status: all 3 layers match on `data_type` + `is_nullable`
- mismatched status: compiled `data_type` differs, compiled `is_nullable` differs, sync `data_type` differs
- missing status: field absent from compiled, field absent from sync (when `syncReported=true`)
- not_reported state (`syncReported=false`): 2-way alignment (pg vs compiled), `sync: null` per field, `sync_reported: false` on entity
- summary counts: 1 aligned + 1 mismatched + 1 missing, all aligned
- null pgSchema (introspection failed): all fields have `postgresql: null` and `status: 'missing'`, entity result is never null

### Task 2: Integration Tests (1 file)

**`tests/integration/schema-comparison.integration.test.ts`** (12 `it()` blocks, 5 describe groups)
- `POST /api/schemas/report — authentication`: 401 without token, 401 with invalid token
- `POST /api/schemas/report — validation`: 400 + VALIDATION_ERROR for non-array schemas, empty array, missing entity field
- `POST /api/schemas/report — happy path`: 200 + `{ success: true }` for valid 1-entity and 4-entity payloads
- `GET /api/schemas/compare — authentication`: 401 without token
- `GET /api/schemas/compare — response structure`: 200 array with 4 entities, each entity has required shape, `sync_reported: false` before any POST, `sync_reported: true` after POST

## Test Failure Mode (Expected RED Phase)

All 3 files fail at import time:
- `sync-schema-store.test.ts`: `Failed to load src/services/sync-schema-store.js — Does the file exist?`
- `schema-comparison.test.ts`: `Failed to load src/services/schema-comparison.js — Does the file exist?`
- `schema-comparison.integration.test.ts`: Fails cascading through `buildApp()` → `prisma.ts` → `@prisma/client` (not generated in worktree) and also through missing route registration

This is correct behavior. Tests will pass once Plans 01 and 02 deliver the production implementation.

## Deviations from Plan

None — plan executed exactly as written.

## Known Stubs

None. All tests are concrete assertions against specific types and behaviors. No placeholder text or mock data that would prevent the tests from serving as a behavioral specification.

## Self-Check: PASSED

Files created:
- FOUND: objetiva-sync-gateway/tests/unit/sync-schema-store.test.ts
- FOUND: objetiva-sync-gateway/tests/unit/schema-comparison.test.ts
- FOUND: objetiva-sync-gateway/tests/integration/schema-comparison.integration.test.ts

Commits:
- FOUND: a212334 (test(26-00): add unit test scaffolds)
- FOUND: 7ec9bb9 (test(26-00): add integration test scaffold)
