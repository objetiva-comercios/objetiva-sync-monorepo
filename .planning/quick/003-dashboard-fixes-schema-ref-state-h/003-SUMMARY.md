---
phase: quick
plan: 003
subsystem: dashboard
tags: [schema-info, sync-state, sync-history, gateway, dashboard, ejs]
dependency-graph:
  requires: [quick-002]
  provides: [gateway-schema-reference, stale-state-reset, clear-history-button]
  affects: []
tech-stack:
  added: []
  patterns: [gateway-first-with-local-fallback, startup-state-cleanup]
key-files:
  created: []
  modified:
    - objetiva-sync/src/dashboard/routes/api/schema-info.ts
    - objetiva-sync/src/store/repositories/sync-state-repo.ts
    - objetiva-sync/src/index.ts
    - objetiva-sync/src/dashboard/routes/api/sync.ts
    - objetiva-sync/src/dashboard/views/sync/index.ejs
decisions:
  - id: Q003-D1
    title: Gateway-first schema fetching with Zod fallback
    rationale: Gateway has complete PostgreSQL metadata including server-managed fields; Zod schemas only cover payload fields
  - id: Q003-D2
    title: Reset stale states at startup step 2.5
    rationale: Must run after initDatabase() but before scheduler to prevent stale running states from confusing sync logic
  - id: Q003-D3
    title: Use existing deleteAllLogs() for history clear
    rationale: Function already exists and handles counting; no need to duplicate logic
metrics:
  duration: ~5 minutes
  completed: 2026-02-05
---

# Quick Task 003: Dashboard Fixes (Schema Ref, State, History) Summary

**One-liner:** Schema reference shows complete PostgreSQL columns from gateway with Zod fallback, stale running states auto-reset on startup, and sync history clearable from dashboard.

## Tasks Completed

### Task 1: Schema reference endpoint uses gateway schemas
**Commit:** `f0f79f2`

Rewrote `/api/schema-info/:entityType` and `/api/schema-info/all` endpoints to fetch complete PostgreSQL column metadata from the gateway via `schemaCache` instead of only showing local Zod payload schema fields.

**Key changes:**
- Added `ENTITY_TO_TABLE` mapping (EntityType enum -> gateway table name)
- Added `mapDataType()` to convert PostgreSQL types (e.g., `character varying` -> `string`, `timestamp with time zone` -> `timestamp`)
- Added `transformGatewaySchema()` to convert `SchemaResponse` columns into `SchemaInfo` format (required/optional field lists with type info)
- Primary path: `schemaCache.getSchema(tableName)` -> transform -> return with `source: 'gateway'`
- Fallback path: if gateway returns null, use existing `extractSchemaInfo()` Zod logic -> return with `source: 'local'`
- Added examples/descriptions for server-managed fields (`id`, `created_at`, `updated_at`, `erp_fecha_sync`)
- All existing Zod helper functions preserved as fallback infrastructure

### Task 2: Reset stale 'running' sync states on startup
**Commit:** `dfe2cb1`

Added `resetStaleStates()` function to `sync-state-repo.ts` and call it during startup in `index.ts`.

**Key changes:**
- `resetStaleStates()`: queries all `sync_state` rows with `status='running'`, sets them to `'idle'` with error message `'Reset on startup (was stuck in running)'`, logs the count and affected query IDs
- Called in `start()` at step 2.5 (after `ensureAdminExists()`, before log cleanup and schema cache init)
- Returns count of reset rows for startup logging

### Task 3: Clear sync history button
**Commit:** `0a08fdf`

Added DELETE endpoint and UI button for clearing sync history.

**Key changes:**
- `DELETE /api/sync/history` endpoint in `sync.ts`: calls existing `SyncLogsRepo.deleteAllLogs()`, returns count
- "Limpiar" button with trash icon added to sync history card header in EJS template
- `clearSyncHistory()` JS function: confirm dialog -> DELETE fetch -> success notification -> auto-refresh table via `loadSyncHistory()`
- Function registered globally via `window.clearSyncHistory = clearSyncHistory;`

## Deviations from Plan

None - plan executed exactly as written.

## Verification

- `npx tsc --noEmit` passes with zero errors in objetiva-sync (verified after each task and at end)
- All three features compile cleanly and integrate with existing code patterns
- EJS template HTML structure verified (proper nesting, no unclosed tags)
