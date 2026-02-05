---
phase: quick
plan: 003
type: execute
wave: 1
depends_on: []
files_modified:
  - objetiva-sync/src/dashboard/routes/api/schema-info.ts
  - objetiva-sync/src/store/repositories/sync-state-repo.ts
  - objetiva-sync/src/index.ts
  - objetiva-sync/src/dashboard/routes/api/sync.ts
  - objetiva-sync/src/dashboard/views/sync/index.ejs
autonomous: true

must_haves:
  truths:
    - "Schema reference tab shows ALL PostgreSQL columns including server-managed fields like erp_fecha_sync, id, created_at, updated_at"
    - "Schema reference falls back to local Zod schemas when gateway is unreachable"
    - "On startup, all sync_state rows with status='running' are reset to 'idle'"
    - "Dashboard 'Estado por Entidad' panel never shows stale 'running' status after restart"
    - "User can clear sync history from the dashboard with a button"
  artifacts:
    - path: "objetiva-sync/src/dashboard/routes/api/schema-info.ts"
      provides: "Schema info endpoint that fetches from gateway"
    - path: "objetiva-sync/src/store/repositories/sync-state-repo.ts"
      provides: "resetStaleStates() method"
    - path: "objetiva-sync/src/dashboard/routes/api/sync.ts"
      provides: "DELETE /api/sync/history endpoint"
  key_links:
    - from: "schema-info.ts"
      to: "gateway-client.ts fetchSchemaFromGateway()"
      via: "import and call"
    - from: "index.ts startup"
      to: "sync-state-repo.ts resetStaleStates()"
      via: "await call after initDatabase()"
---

<objective>
Fix 3 dashboard issues: (1) Schema field reference to show ALL database columns from gateway instead of partial Zod payload fields, (2) Reset stale 'running' entity states on startup, (3) Add clear sync history button.

Purpose: These are user-facing bugs/missing features in the dashboard that affect usability during query writing and monitoring.
Output: Three targeted fixes across the objetiva-sync module.
</objective>

<context>
@objetiva-sync/src/dashboard/routes/api/schema-info.ts
@objetiva-sync/src/services/gateway-client.ts
@objetiva-sync/src/types/schema.ts
@objetiva-sync/src/services/schema-cache.ts
@objetiva-sync/src/store/repositories/sync-state-repo.ts
@objetiva-sync/src/index.ts
@objetiva-sync/src/dashboard/routes/api/sync.ts
@objetiva-sync/src/dashboard/views/sync/index.ejs
@objetiva-sync/src/store/repositories/sync-logs-repo.ts
</context>

<tasks>

<task type="auto">
  <name>Task 1: Schema reference endpoint to use gateway schemas (HIGH PRIORITY)</name>
  <files>objetiva-sync/src/dashboard/routes/api/schema-info.ts</files>
  <action>
Rewrite the `/api/schema-info/:entityType` endpoint to fetch complete schema metadata from the gateway instead of reading local Zod payload schemas.

**Entity-to-table mapping** (EntityType enum value -> gateway table name):
```
'articulo'             -> 'articulos'
'comprobante_cabecera' -> 'comprobantes_cabecera'
'comprobante_detalle'  -> 'comprobantes_detalle'
'comprobante_pago'     -> 'comprobantes_pagos'
```
This mapping already exists in `sync-engine.ts` (entityTypeToTableName). Duplicate it locally in schema-info.ts as a simple const Record.

**Primary path (gateway available):**
1. Import `schemaCache` from `../../services/schema-cache.js` (already has getSchema() that fetches from gateway with caching and graceful degradation)
2. Map the entityType to the gateway table name using the mapping above
3. Call `schemaCache.getSchema(tableName)` which returns a `SchemaResponse` with `columns: ColumnMetadata[]` (each has `column_name`, `data_type`, `is_nullable`, `column_default`)
4. Transform the `SchemaResponse` into the `SchemaInfo` format the frontend expects:
   - Split columns into `required` (where `is_nullable === 'NO'` AND `column_default === null`) and `optional` (everything else)
   - Map each `ColumnMetadata` to `FieldInfo`: `name = column_name`, `type = data_type`, `required = (is_nullable==='NO' && column_default===null)`, `example = getFieldExample(column_name, data_type)`, `description = getFieldDescription(column_name)`
5. Return `{ success: true, data: schemaInfo, source: 'gateway' }`

**Fallback path (gateway unreachable):**
If `schemaCache.getSchema()` returns `null`, fall back to the existing `extractSchemaInfo()` function (current Zod-based logic). Return `{ success: true, data: schemaInfo, source: 'local' }`. This way the UI always gets data.

**Also update** the `/api/schema-info/all` endpoint similarly: try gateway first via `schemaCache.getAllSchemas()`, transform all results, fall back to Zod schemas if gateway fails.

**Keep all existing helper functions** (`getZodType`, `getFieldExample`, `getFieldDescription`, `extractSchemaInfo`) -- they are the fallback. Do NOT delete the Zod imports or ENTITY_SCHEMAS map.

**Add a `mapDataType` helper** to convert PostgreSQL types to simpler display types for the UI:
```
'text' | 'character varying' -> 'string'
'integer' | 'bigint' | 'smallint' -> 'number'
'numeric' | 'double precision' | 'real' -> 'number'
'boolean' -> 'boolean'
'timestamp with time zone' | 'timestamp without time zone' -> 'timestamp'
'date' -> 'date'
'jsonb' | 'json' -> 'json'
default -> the raw data_type
```

**Import types needed:**
```typescript
import type { SchemaResponse as GatewaySchemaResponse } from '../../../types/schema.js';
import { schemaCache } from '../../../services/schema-cache.js';
```
  </action>
  <verify>
1. `cd objetiva-sync && npx tsc --noEmit` -- zero errors
2. Start both gateway and sync service. Navigate to dashboard > Configuracion > Queries > open query modal > click "Referencia de Campos" tab. Verify it shows ALL columns including `id`, `created_at`, `updated_at`, `erp_fecha_sync` (server-managed fields not in Zod schemas)
3. Stop the gateway. Refresh the schema reference. Verify it falls back to Zod schemas (fewer fields, but still works)
  </verify>
  <done>
Schema reference tab shows complete PostgreSQL column metadata from gateway. Falls back gracefully to Zod schemas when gateway is unavailable. Response includes `source: 'gateway'` or `source: 'local'` to distinguish.
  </done>
</task>

<task type="auto">
  <name>Task 2: Reset stale 'running' sync states on startup</name>
  <files>
    objetiva-sync/src/store/repositories/sync-state-repo.ts
    objetiva-sync/src/index.ts
  </files>
  <action>
**In `sync-state-repo.ts`**, add a new exported function `resetStaleStates()`:

```typescript
/**
 * Resetea todos los estados 'running' a 'idle' al iniciar la aplicacion.
 * Previene estados huerfanos de syncs que se interrumpieron.
 */
export async function resetStaleStates(): Promise<number> {
  try {
    const db = getDatabase();

    // Find all rows currently stuck in 'running'
    const staleStates = await db
      .select()
      .from(syncState)
      .where(eq(syncState.status, 'running'));

    if (staleStates.length === 0) {
      return 0;
    }

    // Reset them to idle
    await db
      .update(syncState)
      .set({
        status: 'idle',
        errorMessage: 'Reset on startup (was stuck in running)',
        updatedAt: new Date().toISOString(),
      })
      .where(eq(syncState.status, 'running'));

    logger.info(
      { count: staleStates.length, queryIds: staleStates.map(s => s.queryId) },
      'Stale running states reset to idle on startup'
    );

    return staleStates.length;
  } catch (error) {
    logger.error(error, 'Error resetting stale sync states');
    throw error;
  }
}
```

**In `index.ts`**, add the cleanup call in the `start()` function, right after `await initDatabase()` and `await ensureAdminExists()` (before schema cache init and scheduler).

Add import:
```typescript
import { resetStaleStates } from './store/repositories/sync-state-repo.js';
```

Add after the `ensureAdminExists()` block (around line 192-193), before the log cleanup:
```typescript
// 2.5. Reset stale sync states (running -> idle)
logger.info('Resetting stale sync states...');
const staleCount = await resetStaleStates();
if (staleCount > 0) {
  logger.info(`Reset ${staleCount} stale 'running' state(s) to 'idle'`);
}
```
  </action>
  <verify>
1. `cd objetiva-sync && npx tsc --noEmit` -- zero errors
2. Manually set a sync_state row to status='running' in SQLite: `sqlite3 objetiva-sync/sync.db "UPDATE sync_state SET status='running' WHERE id=1;"`
3. Start the service. Check logs for "Stale running states reset to idle on startup" message
4. Check dashboard "Estado por Entidad" -- previously-stuck row now shows 'idle'
  </verify>
  <done>
On startup, all sync_state rows with status='running' are reset to 'idle'. The "Estado por Entidad" panel never shows stale 'running' status after a restart.
  </done>
</task>

<task type="auto">
  <name>Task 3: Clear sync history button</name>
  <files>
    objetiva-sync/src/dashboard/routes/api/sync.ts
    objetiva-sync/src/dashboard/views/sync/index.ejs
  </files>
  <action>
**In `sync.ts` (API routes)**, add a DELETE endpoint at the end of `registerSyncApiRoutes`, before the closing brace. Place it after the existing `POST /api/sync/cancel` handler:

```typescript
/**
 * DELETE /api/sync/history - Limpiar historial de sincronizaciones
 */
app.delete(
  '/api/sync/history',
  { preHandler: requireNoPasswordChange },
  async (_request, reply) => {
    try {
      const deletedCount = await SyncLogsRepo.deleteAllLogs();
      logger.info({ deletedCount }, 'Sync history cleared by user');
      return reply.send({
        success: true,
        message: `${deletedCount} registros eliminados`,
        deletedCount,
      });
    } catch (error) {
      logger.error({ error }, 'Error al limpiar historial de sync');
      return reply.status(500).send({
        success: false,
        error: 'Error al limpiar historial',
      });
    }
  }
);
```

Note: `SyncLogsRepo` is already imported at the top of the file (`import * as SyncLogsRepo from '../../../store/repositories/sync-logs-repo.js'`). The `deleteAllLogs()` function already exists in that repo.

**In `sync/index.ejs`**, add a "Limpiar Historial" button in the sync history card header. Find the `Historial de Sincronizaciones` heading (around line 163-166) and modify the card-title to include a flex layout with the button:

Replace:
```html
<h3 class="card-title text-lg">
  <i data-lucide="history" class="w-5 h-5"></i>
  Historial de Sincronizaciones
</h3>
```

With:
```html
<div class="flex items-center justify-between w-full">
  <h3 class="card-title text-lg">
    <i data-lucide="history" class="w-5 h-5"></i>
    Historial de Sincronizaciones
  </h3>
  <button
    id="clear-history-btn"
    onclick="clearSyncHistory()"
    class="btn btn-ghost btn-sm text-red-500 hover:bg-red-50 gap-1"
    title="Limpiar historial de sincronizaciones"
  >
    <i data-lucide="trash-2" class="w-4 h-4"></i>
    Limpiar
  </button>
</div>
```

Then add the `clearSyncHistory()` JavaScript function in the existing `<script>` block, right before the `// Initialize on page load` comment (around line 1138):

```javascript
/**
 * Limpiar historial de sincronizaciones
 */
async function clearSyncHistory() {
  if (!confirm('Estas seguro de que deseas eliminar todo el historial de sincronizaciones?')) {
    return;
  }

  try {
    const response = await fetch('/api/sync/history', { method: 'DELETE' });
    const result = await response.json();

    if (result.success) {
      showNotification(`Historial limpiado: ${result.deletedCount} registros eliminados`, 'success');
      loadSyncHistory(); // Refresh the table
    } else {
      showNotification(result.error || 'Error al limpiar historial', 'error');
    }
  } catch (error) {
    console.error('Error clearing sync history:', error);
    showNotification('Error al limpiar historial', 'error');
  }
}
```

Also add `window.clearSyncHistory = clearSyncHistory;` next to the other global function assignments (around line 1114, after `window.closeLogDetails = closeLogDetails;`).
  </action>
  <verify>
1. `cd objetiva-sync && npx tsc --noEmit` -- zero errors
2. Start the service. Navigate to dashboard > Sincronizacion Manual
3. Verify the "Limpiar" button appears next to the "Historial de Sincronizaciones" heading
4. Click the button, confirm the dialog. Verify the history table clears and a success notification appears
5. Refresh the page -- history remains empty
  </verify>
  <done>
A "Limpiar" button appears in the sync history card. Clicking it prompts confirmation, then calls DELETE /api/sync/history to clear all sync logs. The history table refreshes automatically after clearing.
  </done>
</task>

</tasks>

<verification>
1. `cd objetiva-sync && npx tsc --noEmit` passes with zero errors
2. Schema reference shows gateway columns (with source indicator)
3. Stale states are cleaned up on startup
4. Clear history button works end-to-end
</verification>

<success_criteria>
- Schema reference tab displays ALL PostgreSQL columns including server-managed fields
- Schema reference degrades gracefully when gateway is offline
- No stale 'running' states survive a service restart
- Sync history can be cleared from the dashboard
- TypeScript compilation passes with zero errors in both modules
</success_criteria>

<output>
After completion, create `.planning/quick/003-dashboard-fixes-schema-ref-state-h/003-SUMMARY.md`
</output>
