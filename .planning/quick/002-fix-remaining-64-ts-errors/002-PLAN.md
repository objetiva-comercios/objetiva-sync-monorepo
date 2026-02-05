---
phase: quick
plan: 002
type: execute
wave: 1
depends_on: []
files_modified:
  - objetiva-sync/src/dashboard/routes/api/config.ts
  - objetiva-sync/src/dashboard/routes/api/log-stream.ts
  - objetiva-sync/src/dashboard/routes/api/logs.ts
  - objetiva-sync/src/dashboard/routes/api/queries.ts
  - objetiva-sync/src/dashboard/routes/api/scheduler.ts
  - objetiva-sync/src/dashboard/routes/api/sync.ts
  - objetiva-sync/src/sync/sync-engine.ts
  - objetiva-sync/src/sync/scheduler.ts
  - objetiva-sync/src/sync/sync-queue.ts
  - objetiva-sync/src/sync/scheduler-instance.ts
  - objetiva-sync/src/sync/query-validator.ts
  - objetiva-sync/src/sync/schema-validator.ts
  - objetiva-sync/src/store/schema.ts
autonomous: true

must_haves:
  truths:
    - "npx tsc --noEmit exits with 0 errors"
    - "No runtime behavior changes - all fixes are type-level only"
  artifacts:
    - path: "objetiva-sync/src/**/*.ts"
      provides: "All 13 files modified with type fixes"
  key_links: []
---

<objective>
Fix all remaining 64 TypeScript errors across dashboard routes, sync engine, and store/schema files.

Purpose: Achieve zero TypeScript errors for code quality and future type safety.
Output: Clean `npx tsc --noEmit` with 0 errors.
</objective>

<execution_context>
@C:\Users\sistemas\.claude/get-shit-done/workflows/execute-plan.md
@C:\Users\sistemas\.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@objetiva-sync/src/types/common.ts (EntityType enum, LogStatus enum, SyncResult interface)
@objetiva-sync/src/sync/sync-engine.ts (SyncEngineConfig, SyncOptions, SyncResult re-export)
@objetiva-sync/src/sync/scheduler.ts (ScheduledJob interface - intervalSeconds not intervalMinutes)
@objetiva-sync/src/store/repositories/sync-state-repo.ts (updateSyncState signature)
@objetiva-sync/src/store/repositories/sync-logs-repo.ts (updateLog signature)
@objetiva-sync/src/adapters/index.ts (createAdapter takes 1 arg: type string)
@objetiva-sync/src/store/repositories/connection-config-repo.ts (getActiveConnectionConfig returns config object)
</context>

<tasks>

<task type="auto">
  <name>Task 1: Fix dashboard route TypeScript errors (24 errors)</name>
  <files>
    objetiva-sync/src/dashboard/routes/api/config.ts
    objetiva-sync/src/dashboard/routes/api/log-stream.ts
    objetiva-sync/src/dashboard/routes/api/logs.ts
    objetiva-sync/src/dashboard/routes/api/queries.ts
    objetiva-sync/src/dashboard/routes/api/scheduler.ts
    objetiva-sync/src/dashboard/routes/api/sync.ts
  </files>
  <action>
    Fix each file with these specific changes:

    **config.ts** (5 errors - all TS18046 "unknown" type):
    - Line 321: Add type assertion after `response.json()`. Cast `data` as `Record<string, any>`:
      `const data = (await response.json()) as Record<string, any>;`
    - Line 353: Same pattern for `errorData`:
      `const errorData = (await response.json()) as Record<string, any>;`

    **log-stream.ts** (1 error - TS2345 handler type mismatch):
    - Line 21-23: The route handler gets a type mismatch because the generic is not passed to `app.get`. Change the route registration to use Fastify's generic parameter approach:
      ```typescript
      app.get<{ Querystring: StreamQuery }>('/api/logs/stream', {
        preHandler: requireNoPasswordChange
      }, async (request, reply) => {
      ```
      Remove the explicit type annotations from the handler parameters `request` and `reply` since they are now inferred from the generic.

    **logs.ts** (3 errors - TS6133 unused):
    - Line 12: Remove `getLogDetails` from the import (keep `getLogs`, `getRecentStats`, `getLogById`, `deleteAllLogs`)
    - Line 15: Remove `getBatchesMetadata` from the import (keep `readBatch`, `countBatches`)
    - Line 465: Rename `key` to `_key` in the destructuring `([_key, value])` to mark unused

    **queries.ts** (1 error - TS6133 unused):
    - Line 9: Remove `getAllQueries` from the import (keep `getQuery`, `createQuery`, `updateQuery`, `deleteQuery`, `reorderQueries`, `updateQueryInterval`)

    **scheduler.ts** (1 error - TS2339 property does not exist):
    - Line 130: Change `job.intervalMinutes` to `job.intervalSeconds` (the ScheduledJob interface was renamed from intervalMinutes to intervalSeconds). If the dashboard display needs minutes, compute it: `Math.round(job.intervalSeconds / 60)`

    **sync.ts** (13 errors):
    - Line 149 (TS2532 possibly undefined): The `activeConnection` from `getActiveConnectionConfig()` returns an object with `.config` property. Add null check or non-null assertion where it's used without check. Check context - likely needs `activeConnection!` or guard above.
    - Lines 244, 561 (TS2554 wrong arg count): `createAdapter` takes 1 argument (type string), not 2. The config is passed separately via `adapter.connect()`. Change:
      `createAdapter(activeConnection.adapterType, activeConnection.config)` to
      `createAdapter(activeConnection.adapterType)`
      The `.connect(activeConnection.config)` call on the next line already handles the config.
    - Lines 304, 635, 689 (TS2783 entityType specified twice): The result spread `{ entityType, ...result }` conflicts because `result` (SyncResult) already contains `entityType`. Remove the leading `entityType,` from the spread - just use `{ ...result }`. Or remove it from the spread: `results.push(result)` directly if result already has everything needed. The catch blocks that manually construct `{ entityType, status: 'failed', error: ... }` are fine - those don't spread.
    - Lines 320, 321, 708, 709 (TS2339 `recordsProcessed`/`recordsSent` not on type): The `results` array contains a union of SyncResult (which has `recordsFetched`/`recordsSent`) and error objects `{ entityType, status, error }` (which don't). Fix by:
      - Change `r.recordsProcessed` to `r.recordsFetched` (the correct field name per SyncResult interface) and use `|| 0` fallback: `(r.recordsFetched || 0)` -- but the union type still won't have it. Use: `('recordsFetched' in r ? r.recordsFetched : 0)` or cast with `(r as any).recordsFetched || 0`.
      - For `r.recordsSent`, same pattern: `('recordsSent' in r ? r.recordsSent : 0)` or `(r as any).recordsSent || 0`.
  </action>
  <verify>
    Run: `cd objetiva-sync && npx tsc --noEmit 2>&1 | grep -E "dashboard/routes/api" | wc -l`
    Expected: 0 errors in dashboard routes
  </verify>
  <done>All 24 dashboard route TypeScript errors resolved. No dashboard/routes/api errors remain.</done>
</task>

<task type="auto">
  <name>Task 2: Fix sync engine and store TypeScript errors (40 errors)</name>
  <files>
    objetiva-sync/src/sync/sync-engine.ts
    objetiva-sync/src/sync/scheduler.ts
    objetiva-sync/src/sync/sync-queue.ts
    objetiva-sync/src/sync/scheduler-instance.ts
    objetiva-sync/src/sync/query-validator.ts
    objetiva-sync/src/sync/schema-validator.ts
    objetiva-sync/src/store/schema.ts
  </files>
  <action>
    Fix each file with these specific changes:

    **sync-engine.ts** (9 errors):
    - Lines 370, 388, 587 (TS2322 string to EntityType): `query.entityType` is `string` from DB. Cast it:
      `const entityType = query.entityType as EntityType;` (line 370 area already does this assignment, just add `as EntityType`)
    - Line 473 (TS2345 string to EntityType): Same issue in function call. Cast: `entityTypeToTableName(entityType as EntityType)` -- but entityType should already be typed after the fix above. Check if entityTypeToTableName accepts string (it does - its param is `string`), so this error might be elsewhere. Actually line 473 passes entityType (already string from DB) - this should resolve with the cast at line 370.
    - Line 507 (TS2322 `"failed"` to `LogStatus | undefined`): Change `status: 'failed'` to `status: LogStatus.FAILED`
    - Line 513 (TS2561 `lastSync` does not exist): Change `lastSync: new Date()` to `lastSyncAt: new Date().toISOString()` (the updateSyncState interface expects `lastSyncAt?: string | null`). Also change `lastRecordsSynced: 0` to `lastSyncCount: 0` if that field name is also wrong. Check against the actual `updateSyncState` signature: it expects `{ lastSyncValue?, lastSyncAt?, lastSyncCount?, totalSynced?, status?, errorMessage? }`.
    - Line 517 (TS2322 `"failed"` to LogStatus): Change `result.status = 'failed'` to `result.status = LogStatus.FAILED`
    - Line 613 (TS2345 string to EntityType): Cast `entityType` at the call site. But if entityType was already cast at line ~370, this is the same variable and should be fine. Double check - this might be in a different function. Add `as EntityType` where needed.

    **scheduler.ts** (3 errors):
    - Line 326 (TS2769 overload mismatch): The pino logger `.warn({ entityType: job.entityType }, "message")` fails because `entityType` field clashes with pino's type. Rename the field: `logger.warn({ entity: job.entityType }, ...)` or use a different key like `jobEntityType`.
    - Line 367 (TS2322 string to union type): `job.entityType` is typed as `EntityType | 'all' | 'retries' | 'cleanup'` but the assignment source is `string` (from DB query result `query.entityType`). In the `initializeFromQueries` method around line 367, cast: `entityType: query.entityType as EntityType,`
    - Line 368 (TS2322 `number | null` to `number`): `query.syncInterval` might be null. Use nullish coalescing: `intervalSeconds: query.syncInterval ?? 300,` (default 5 min)

    **sync-queue.ts** (5 errors):
    - Line 8 (TS6196 unused): Remove `SyncType` from the import. Keep `EntityType`.
    - Line 9 (TS2459 SyncResult not exported): `SyncResult` is NOT exported from `sync-engine.ts` - it's defined and exported from `types/common.ts`. Change import:
      Remove `SyncResult` from the `./sync-engine.js` import.
      Add: `import type { EntityType, SyncResult } from '../types/common.js';`
      Update line 8 to just: `import type { EntityType } from '../types/common.js';` -- wait, EntityType is already there. So merge: `import type { EntityType, SyncResult } from '../types/common.js';` and remove SyncType if unused.
    - Line 85 (TS2322 string to EntityType): `query.entityType` from DB is string. Cast: `entityType: query.entityType as EntityType,`
    - Lines 166, 171, 172, 177 (TS18048 possibly undefined): `queuedSync` from `this.queue[index]` can be undefined. Add a guard after line 164: `if (!queuedSync) { throw new Error('Sync not found'); }` -- but wait, there's already a check at line 160-162 for index === -1. The issue is that TypeScript doesn't narrow array access. Add non-null assertion: `const queuedSync = this.queue[index]!;`

    **scheduler-instance.ts** (3 errors):
    - Line 33 (TS2554 wrong arg count + TS2339 `.config` not on type): `createAdapter` takes 1 arg. And `ConnectionConfig` from schema doesn't have a `.config` property - it has `configJson` (encrypted JSON string). The code should use `getActiveConnectionConfig()` (which decrypts and returns `{ config }`) instead of `ConnectionConfigRepo.getActiveConnection()` (which returns raw `ConnectionConfig`).
      Fix: Import `getActiveConnectionConfig` from connection-config-repo and use it:
      ```typescript
      const connectionData = await getActiveConnectionConfig();
      if (!connectionData) { ... return; }
      const adapter = createAdapter(connectionData.adapterType);
      await adapter.connect(connectionData.config);
      ```
      This fixes both the arg count and the `.config` property issues.
    - Line 36 (TS2345 missing `apiClient`): `SyncEngineConfig` requires `apiClient`. But the scheduler-instance creates SyncEngine without an API client because it delegates sync execution to the SyncQueue which creates its own engine. The simplest fix: make `apiClient` optional in `SyncEngineConfig` by changing the interface in sync-engine.ts:
      ```typescript
      apiClient?: APIClient;  // Optional - not needed for queue-based sync
      ```
      This is safe because the scheduler's SyncEngine is used via SyncQueue which creates full engines. Alternatively, leave the interface required and provide a dummy/null - but making it optional is cleaner.

    **query-validator.ts** (10 errors):
    - Line 7 (TS6133 unused): Remove `import { z } from 'zod';` -- it's not used in this file.
    - Lines 11, 15, 19, 23 (TS6133 unused types): Remove the type imports that are unused:
      Remove `type IArticuloPayload` from line 11
      Remove `type IComprobanteCabeceraPayload` from line 15
      Remove `type IComprobanteDetallePayload` from line 19
      Remove `type IComprobantePagosPayload` from line 23
      Keep the schema imports (`articuloPayloadSchema`, etc.) as those ARE used.
    - Lines 217, 225 (TS2345 string to `never`): `requiredFields.includes(fieldName)` fails because `requiredFields` is a readonly string tuple (from `as const`). The `.includes()` method on readonly tuples expects `never` for the argument. Fix: cast the array: `(requiredFields as readonly string[]).includes(fieldName)`
    - Line 421 (TS2345 same issue): Same fix: `(requiredFields as readonly string[]).includes(fieldName)`
    - Lines 275, 334 (TS6133 unused params): The functions `getFieldType` and `getFieldExample` have unused `entityType` parameter. Prefix with underscore: `_entityType: EntityType`

    **schema-validator.ts** (1 error):
    - Line 12 (TS6196 unused): Remove `ColumnMetadata` from the type import. Keep `SchemaResponse`:
      `import type { SchemaResponse } from '../types/schema.js';`

    **store/schema.ts** (2 errors):
    - Lines 198-199 (TS2304 `fieldMappings` not found): The `fieldMappings` table was removed but the type exports remain. Remove these two lines:
      ```typescript
      export type FieldMapping = typeof fieldMappings.$inferSelect;
      export type NewFieldMapping = typeof fieldMappings.$inferInsert;
      ```
      Check if `FieldMapping` or `NewFieldMapping` are imported anywhere else first. If they are, those imports also need cleanup. Search for usages before deleting.
  </action>
  <verify>
    Run: `cd objetiva-sync && npx tsc --noEmit 2>&1`
    Expected: 0 errors total (exit code 0)
  </verify>
  <done>All 64 TypeScript errors resolved. `npx tsc --noEmit` exits cleanly with 0 errors. No runtime behavior changes.</done>
</task>

</tasks>

<verification>
Run full TypeScript check:
```bash
cd objetiva-sync && npx tsc --noEmit
```
Expected: Exit code 0, no errors.

Sanity check that nothing broke:
```bash
cd objetiva-sync && npm run build
```
Expected: Build succeeds (uses transpileOnly but confirms no import issues).
</verification>

<success_criteria>
- `npx tsc --noEmit` reports 0 errors (down from 64)
- No runtime behavior changes - all fixes are type annotations, casts, unused import removal, and interface property renames
- Build still succeeds
</success_criteria>

<output>
After completion, create `.planning/quick/002-fix-remaining-64-ts-errors/002-SUMMARY.md`
</output>
