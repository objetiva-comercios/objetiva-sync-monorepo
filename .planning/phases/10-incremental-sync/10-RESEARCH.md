# Phase 10: Incremental Sync - Research

**Researched:** 2026-02-04
**Domain:** Incremental data synchronization with timestamp-based tracking
**Confidence:** HIGH

## Summary

Incremental sync is a well-established data integration pattern that loads only new or updated records since the last sync, dramatically reducing processing time and resource usage. The codebase already has partial implementation of incremental sync infrastructure that needs to be completed and tested.

**Existing infrastructure found:**
- SQLite `sync_state` table with `lastSyncValue` per query
- `incrementalField` configuration in queries table
- SyncType enum with INCREMENTAL/FULL values
- Basic incremental query execution logic in SyncEngine
- Dashboard checkbox for full sync override

**Key findings:**
- PostgreSQL schema confirmed: all 4 entity tables have `erp_fecha_sync` field (DateTime, nullable)
- Timestamp-based sync is the standard approach for this use case
- Clock skew protection via lookback window is industry best practice (5-10 minute overlap)
- Failure recovery requires NOT updating timestamp on failure (already implemented correctly)
- Per-entity sync history is critical for observability and debugging

**Primary recommendation:** Audit and complete existing incremental sync implementation rather than building from scratch. Add clock skew protection, enhance dashboard visibility, and add comprehensive tests.

## Standard Stack

### Core (Already in Codebase)
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| Drizzle ORM | Current | SQLite state persistence | Type-safe queries, zero runtime cost |
| Node.js Date/ISO 8601 | Built-in | Timestamp handling | Universal standard, PostgreSQL compatible |
| SQL parameterized queries | Built-in | Incremental filtering | Safe, database-agnostic approach |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| EJS templates | Current | Dashboard UI | Already used for sync page |
| Server-Sent Events | Native | Real-time progress | Already implemented for sync progress |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Timestamp-based | CDC (Change Data Capture) | CDC requires database log access, more complex setup. Timestamp is simpler and sufficient for this use case |
| SQLite state | External state store (Redis) | SQLite is embedded, zero dependencies, survives restarts. Redis adds complexity |
| Date field | Auto-increment ID | Timestamps provide audit trail and human-readable history. IDs lack temporal meaning |

**Installation:**
```bash
# No additional packages needed - all infrastructure exists
```

## Architecture Patterns

### Existing Project Structure (Audit Required)
```
objetiva-sync/src/
├── sync/
│   └── sync-engine.ts          # Has getMaxFieldValue(), incremental logic
├── store/
│   ├── schema.ts               # sync_state table with lastSyncValue
│   └── repositories/
│       ├── sync-state-repo.ts  # State persistence (complete)
│       └── sync-logs-repo.ts   # History tracking (complete)
├── dashboard/
│   └── views/sync/index.ejs    # Has full-sync checkbox (line 87-96)
└── types/common.ts             # SyncType.INCREMENTAL enum
```

### Pattern 1: Timestamp-Based Incremental Filtering
**What:** Query filter using `WHERE erp_fecha_sync > :lastSync OR erp_fecha_sync IS NULL`
**When to use:** All 4 entity types after first successful sync
**Example:**
```sql
-- User's SQL query template (stored in queries table)
SELECT
  codigo AS erp_codigo,
  nombre,
  precio,
  erp_fecha_sync
FROM articulos
WHERE (erp_fecha_sync > :lastSync OR erp_fecha_sync IS NULL)
ORDER BY erp_fecha_sync ASC
```

**How it works:**
1. Sync service replaces `:lastSync` placeholder with stored timestamp
2. Database returns only rows modified since last sync + NULL rows
3. NULL rows are always included (treated as "never synced")

### Pattern 2: Clock Skew Protection with Lookback Window
**What:** Subtract overlap window from stored timestamp to catch edge-case records
**When to use:** Every incremental sync execution
**Example:**
```typescript
// In SyncEngine.syncQuery() around line 393-404
let lastSyncValue: string | null = null;

if (!options.fullSync && syncType === SyncType.INCREMENTAL) {
  const syncState = await SyncStateRepo.getSyncState(queryId);
  const rawTimestamp = syncState?.lastSyncValue ?? null;

  if (rawTimestamp) {
    // CLOCK SKEW PROTECTION: Subtract 5 minutes
    const timestamp = new Date(rawTimestamp);
    timestamp.setMinutes(timestamp.getMinutes() - 5);
    lastSyncValue = timestamp.toISOString();

    logger.debug({
      original: rawTimestamp,
      adjusted: lastSyncValue
    }, 'Applied clock skew protection');
  }
}
```

**Why:** Records modified during previous sync might have timestamps equal to stored value. Overlap ensures we catch them. Gateway uses upsert, so re-processing is safe (idempotent).

### Pattern 3: Failure Recovery - Keep Original Timestamp
**What:** On sync failure, do NOT update lastSyncValue
**When to use:** Any sync that fails or is canceled
**Current implementation:** Already correct in SyncEngine lines 655-668
```typescript
// 11. Actualizar sync state (usando queryId)
if (result.status === LogStatus.SUCCESS || result.status === LogStatus.PARTIAL) {
  await SyncStateRepo.markSyncAsSuccess(queryId, {
    lastSyncValue: newLastSyncValue ?? new Date().toISOString(),
    recordCount: result.recordsSent,
  });
} else if (result.status === LogStatus.CANCELED) {
  // No actualizar sync state si fue cancelado - mantener el estado anterior
  logger.info('[SyncEngine] Sync cancelado - manteniendo estado anterior');
} else {
  // Don't update lastSyncValue on failure - mark as error
  await SyncStateRepo.markSyncAsError(queryId, errorMessage);
}
```

**Critical:** This ensures next sync re-fetches everything since last SUCCESSFUL sync, preventing data loss.

### Pattern 4: Per-Entity Timestamp Tracking
**What:** Store lastSyncValue per queryId (1:1 with entity type)
**Current schema:** `sync_state` table line 85-106 in schema.ts
```typescript
export const syncState = sqliteTable('sync_state', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  queryId: integer('query_id')
    .notNull()
    .unique()
    .references(() => queries.id, { onDelete: 'cascade' }),
  entityType: text('entity_type').notNull(), // For logs/reporting
  lastSyncValue: text('last_sync_value'),    // ISO timestamp or ID
  lastSyncAt: text('last_sync_at'),          // When last successful sync ran
  lastSyncCount: integer('last_sync_count'), // Records synced
  // ... status, error fields
});
```

**Result:** Each of 4 entity types tracks independently. Failure in one doesn't affect others.

### Pattern 5: Sync History for Observability
**What:** Track every sync run with type (incremental/full), counts, duration
**Current implementation:** `sync_logs` table (schema.ts lines 136-158)
```typescript
export const syncLogs = sqliteTable('sync_logs', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  queryId: integer('query_id'),
  queryName: text('query_name'),
  entityType: text('entity_type').notNull(),
  syncType: text('sync_type').notNull(), // 'incremental' or 'full'
  status: text('status').notNull(),
  recordsFetched: integer('records_fetched').default(0),
  recordsSent: integer('records_sent').default(0),
  recordsFailed: integer('records_failed').default(0),
  durationMs: integer('duration_ms'),
  createdAt: text('created_at').default(sql`CURRENT_TIMESTAMP`),
});
```

**Usage:** Dashboard can show:
- Recent sync runs (incremental vs full)
- Performance trends (records/sec)
- Incremental efficiency (skipped records)

### Anti-Patterns to Avoid

1. **Updating timestamp on partial success:** Don't update to max value of successfully sent batch. Use all-or-nothing approach to prevent gaps. Current implementation is CORRECT (lines 655-668).

2. **Trusting client timestamps:** Always use database server timestamps for `erp_fecha_sync`. Clock skew on client machines can cause records to be skipped.

3. **Using "greater than" without NULL handling:** Query MUST include `OR erp_fecha_sync IS NULL` or records that never set timestamp will be invisible.

4. **Storing timestamps as strings without timezone:** Always use ISO 8601 with timezone (Node.js `.toISOString()` produces this correctly).

5. **No lookback window:** Without clock skew protection, records modified during sync can be missed forever.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Sync state persistence | Custom file storage | Drizzle ORM with SQLite | Already in codebase, survives restarts, queryable, type-safe |
| Timestamp arithmetic | Manual date parsing | Native Date object with setMinutes() | Built-in, timezone-aware, tested |
| Query parameter replacement | String concatenation | Adapter's parameterized queries | SQL injection protection, already implemented |
| Progress tracking | Custom WebSocket | Existing SSE implementation | Already working for batch progress |

**Key insight:** The codebase already has 80% of incremental sync infrastructure. Don't rebuild—audit, fix, and enhance what exists.

## Common Pitfalls

### Pitfall 1: Missing NULL Handling in User Queries
**What goes wrong:** User writes SQL query as `WHERE erp_fecha_sync > :lastSync` without NULL check. Records with NULL timestamp are never synced.
**Why it happens:** NULL comparisons in SQL are non-intuitive (`NULL > anything` is always false).
**How to avoid:**
- Document query pattern clearly in dashboard UI
- Provide query template/example with NULL handling
- Add validation that rejects queries missing NULL check
**Warning signs:** Initial full sync works, but subsequent incremental syncs show 0 records even though data exists.

### Pitfall 2: Clock Skew at Sync Boundaries
**What goes wrong:** Record modified at `2026-02-04 10:00:00.500` during sync. Sync completes at `10:00:00.600`, stores `10:00:00.600` as lastSync. Next sync uses `WHERE > 10:00:00.600`, misses the record at 10:00:00.500.
**Why it happens:** Concurrent modifications during sync execution.
**How to avoid:** Subtract overlap window (5 minutes recommended) from stored timestamp. Gateway upsert handles duplicates.
**Warning signs:** Random records missing after sync, not reproducible.

### Pitfall 3: Timestamp Precision Mismatch
**What goes wrong:** PostgreSQL stores timestamps with microsecond precision, but comparison uses second precision. Multiple records in same second might be skipped.
**Why it happens:** Different systems have different timestamp granularity.
**How to avoid:**
- Use ISO 8601 full precision in all comparisons
- Use `>=` instead of `>` for timestamp comparisons
- Add lookback window for extra safety
**Warning signs:** Some records in a batch are synced, others aren't, all have similar timestamps.

### Pitfall 4: No Visibility into Incremental vs Full
**What goes wrong:** User can't tell if sync ran incrementally or as full. Can't diagnose why sync processed X records.
**Why it happens:** Dashboard shows only final counts, not sync type.
**How to avoid:**
- Display 'INCREMENTAL' or 'COMPLETA' badge next to each sync run
- Show "modified records processed: X, unchanged records skipped: Y"
- Add sync history table with type column
**Warning signs:** User reports "sync processed 50,000 records but I only changed 10."

### Pitfall 5: Overwriting Timestamp on Failure
**What goes wrong:** Sync fails after processing 3 of 5 batches. Code updates lastSyncValue to max timestamp of batch 3. Batches 4-5 are lost forever.
**Why it happens:** Incrementally updating state during execution instead of atomic success/failure.
**How to avoid:** Only update lastSyncValue on full success (SUCCESS or PARTIAL with errors already in retry queue).
**Warning signs:** Record counts don't add up, gaps in synchronized data after failures.

### Pitfall 6: Forgetting First Run Is Full Sync
**What goes wrong:** User expects incremental sync on first run, gets frustrated by long duration.
**Why it happens:** No stored timestamp = automatic full sync.
**How to avoid:**
- Dashboard shows "First sync will be FULL, subsequent syncs will be INCREMENTAL"
- After first successful sync, show "Incremental mode enabled" confirmation
- Log clearly states "No previous sync found - running full sync"
**Warning signs:** User reports "incremental sync is slow" on first execution.

## Code Examples

### Verified Pattern: Incremental Query Execution (Existing Code)
```typescript
// Source: objetiva-sync/src/sync/sync-engine.ts lines 393-410
// This pattern is ALREADY IMPLEMENTED - audit for correctness

// 4. Obtener lastSync value (para sync incremental) - usando queryId
let lastSyncValue: string | null = null;

if (!options.fullSync && syncType === SyncType.INCREMENTAL) {
  const syncState = await SyncStateRepo.getSyncState(queryId);
  lastSyncValue = syncState?.lastSyncValue ?? null;
}

logger.debug({ lastSyncValue }, '[SyncEngine] Último valor de sincronización');

// 5. Ejecutar query en ERP
const queryParams = lastSyncValue ? { lastSync: lastSyncValue } : undefined;

logger.info(
  { sql: query.sqlQuery.substring(0, 100) + '...', params: queryParams },
  '[SyncEngine] Ejecutando query en ERP...'
);

const queryResult = await this.adapter.executeQuery(query.sqlQuery, queryParams);
```

**NEEDS ENHANCEMENT:** Add clock skew protection by modifying lastSyncValue before use.

### Recommended Pattern: Clock Skew Protection (NEW)
```typescript
// Add this BEFORE using lastSyncValue in query execution
// Insert around line 398 in sync-engine.ts

if (lastSyncValue) {
  // Apply clock skew protection: subtract 5-minute overlap
  const timestamp = new Date(lastSyncValue);
  const OVERLAP_MINUTES = 5;
  timestamp.setMinutes(timestamp.getMinutes() - OVERLAP_MINUTES);
  lastSyncValue = timestamp.toISOString();

  logger.debug({
    stored: syncState?.lastSyncValue,
    adjusted: lastSyncValue,
    overlapMinutes: OVERLAP_MINUTES
  }, 'Applied clock skew protection to incremental sync');
}
```

### Verified Pattern: User Query Template (DOCUMENTATION)
```sql
-- Example query for articulos with proper incremental support
-- User configures this in dashboard → queries → SQL Query field
-- The :lastSync parameter is replaced by sync service

SELECT
  art_codigo AS erp_codigo,
  art_nombre AS nombre,
  art_precio AS precio,
  art_fecha_mod AS erp_fecha_sync  -- CRITICAL: Map to erp_fecha_sync
FROM articulos
WHERE
  (:lastSync IS NULL OR art_fecha_mod > :lastSync OR art_fecha_mod IS NULL)
  AND art_activo = 1
ORDER BY art_fecha_mod ASC
```

**Key points:**
- `:lastSync` placeholder is replaced by service
- Three-way OR condition handles NULL lastSync (first run), NULL timestamps, and modified records
- ORDER BY incremental field ensures consistent processing order
- Map source timestamp field to `erp_fecha_sync` alias

### Dashboard UI Pattern: Sync Type Visibility (ENHANCEMENT NEEDED)
```html
<!-- Add to objetiva-sync/src/dashboard/views/sync/index.ejs -->
<!-- Insert in sync results section around line 125 -->

<div class="alert alert-info mb-4">
  <i data-lucide="info" class="w-4 h-4"></i>
  <div>
    <div class="font-semibold">Modo de sincronización</div>
    <div id="sync-mode-indicator" class="text-sm">
      <!-- Populated by JavaScript -->
      <span class="badge badge-primary" id="sync-type-badge">INCREMENTAL</span>
      <span id="sync-description" class="ml-2">
        Solo registros modificados desde última sincronización
      </span>
    </div>
  </div>
</div>
```

### Dashboard JavaScript: Update Sync Mode Indicator
```javascript
// Add to objetiva-sync/src/dashboard/views/sync/index.ejs script section

function updateSyncModeIndicator() {
  const isFullSync = document.getElementById('full-sync-checkbox').checked;
  const badge = document.getElementById('sync-type-badge');
  const description = document.getElementById('sync-description');

  if (isFullSync) {
    badge.textContent = 'COMPLETA';
    badge.className = 'badge badge-warning';
    description.textContent = 'Todos los registros serán sincronizados desde el principio';
  } else {
    badge.textContent = 'INCREMENTAL';
    badge.className = 'badge badge-primary';
    description.textContent = 'Solo registros modificados desde última sincronización';
  }
}

// Call on page load and checkbox change
document.getElementById('full-sync-checkbox')?.addEventListener('change', updateSyncModeIndicator);
updateSyncModeIndicator(); // Initial state
```

### Sync History Query Pattern
```typescript
// Source: Existing getLogs() in sync-logs-repo.ts lines 157-218
// ALREADY IMPLEMENTED - can be used for history view

const logs = await SyncLogsRepo.getLogs(
  {
    entityType: EntityType.ARTICULO,
    // Filter by syncType to show incremental vs full
  },
  { limit: 20, offset: 0 }
);

// Process logs to show:
// - Sync type (incremental/full)
// - Records processed
// - Duration
// - Timestamp
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Full sync every time | Timestamp-based incremental sync | Industry standard since ~2015 | 10-1000x faster for routine syncs |
| Manual full refresh | Automatic incremental with override | 2020+ best practice | Better UX, prevents user confusion |
| Single timestamp for all entities | Per-entity (per-query) timestamps | Architecture changed Phase 3 | Independent entity sync, isolated failures |
| No lookback window | Clock skew protection with overlap | 2024+ distributed systems | Prevents edge-case data loss |
| In-memory state | Persistent SQLite state | Required for production | Survives restarts, enables failure recovery |

**Deprecated/outdated:**
- **Global lastSync value:** Replaced by per-query tracking in Phase 3 migration to query-based architecture
- **No NULL handling:** Modern systems require explicit NULL checks in incremental queries
- **Timestamp as primary key:** Timestamps are for filtering, not identification (use unique IDs)

## Open Questions

1. **Overlap window duration**
   - What we know: Industry uses 5-10 minutes for typical systems
   - What's unclear: Optimal value for this specific ERP (depends on sync duration and record modification rate)
   - Recommendation: Start with 5 minutes, make configurable per-query if needed. Monitor for duplicate processing.

2. **Sync history retention**
   - What we know: `deleteOldLogs()` function exists in sync-logs-repo.ts
   - What's unclear: How many days of history to keep by default
   - Recommendation: Keep 30 days of sync logs. Implement automatic cleanup in scheduler. Make configurable.

3. **Incremental field validation**
   - What we know: Queries table has `incrementalField` column
   - What's unclear: Is this field actually used? Does validation check it exists in query results?
   - Recommendation: Audit SyncEngine.getMaxFieldValue() usage (line 131). Verify incrementalField is validated during query testing.

4. **NULL timestamp handling strategy**
   - What we know: Records with NULL `erp_fecha_sync` must be included in every incremental sync
   - What's unclear: Should we SET erp_fecha_sync after successful sync to prevent re-processing?
   - Recommendation: Leave NULL as-is. Gateway doesn't update source timestamps. Re-processing is safe (upsert). Changing source data is anti-pattern.

5. **Dashboard sync history UX**
   - What we know: All data exists in sync_logs table with syncType
   - What's unclear: Best UX for showing incremental efficiency (e.g., "processed 50 modified, skipped 10,000 unchanged")
   - Recommendation: Add table below manual sync form showing last 10 runs with: timestamp, type (badge), query name, records fetched, records sent, duration.

## Sources

### Primary (HIGH confidence)
- Codebase audit: `objetiva-sync/src/sync/sync-engine.ts`, `store/schema.ts`, `store/repositories/sync-state-repo.ts`
- PostgreSQL schema: `objetiva-sync-gateway/prisma/schema.prisma` (lines 56, 113 - erp_fecha_sync confirmed)
- Phase 10 CONTEXT.md: User decisions on timestamp field, behavior, recovery

### Secondary (MEDIUM confidence)
- [Incremental Load Strategy for Data Warehouses (2025 Guide)](https://blog.skyvia.com/incremental-load-strategy-for-data-warehouses/)
- [Incremental Load in ETL: How It Works and Why It Matters | Airbyte](https://airbyte.com/data-engineering-resources/etl-incremental-loading)
- [How to Configure dbt Incremental Models](https://oneuptime.com/blog/post/2026-01-27-dbt-incremental-models/view)

### Tertiary (LOW confidence - general patterns, not product-specific)
- WebSearch results on clock skew protection, failure recovery patterns
- IEEE paper references on clock synchronization (hardware-focused, not directly applicable)

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH - All components already in codebase, verified by reading source code
- Architecture: HIGH - Existing implementation audited, patterns match industry best practices
- Pitfalls: HIGH - Common issues well-documented in literature and addressable with existing infrastructure
- Code examples: HIGH - Extracted from actual codebase files with line numbers
- Dashboard integration: MEDIUM - EJS templates exist but specific UI changes are recommendations
- Overlap window duration: MEDIUM - Industry standard is 5-10 minutes, but optimal value depends on system characteristics

**Research date:** 2026-02-04
**Valid until:** 2026-03-04 (30 days - stable domain)

## Implementation Priority

Based on audit of existing code:

**Already Working (Don't Touch):**
1. ✅ Per-query timestamp storage (sync_state table)
2. ✅ Failure recovery (doesn't update timestamp on error)
3. ✅ Sync type enum and logging
4. ✅ Dashboard full-sync checkbox

**Needs Completion (High Priority):**
1. 🔧 Clock skew protection (add 5-minute overlap)
2. 🔧 Dashboard sync type visibility (INCREMENTAL/COMPLETA badge)
3. 🔧 Per-entity last sync timestamp display
4. 🔧 Sync history table on dashboard

**Needs Testing (Critical):**
1. ⚠️ Verify incrementalField is actually used
2. ⚠️ Test NULL timestamp handling in real ERP queries
3. ⚠️ Verify full sync override works correctly
4. ⚠️ Test clock skew protection doesn't cause excessive duplicate processing

**Documentation (Important):**
1. 📝 User guide: How to write incremental queries
2. 📝 Example queries with NULL handling
3. 📝 Troubleshooting: "Why did my incremental sync process X records?"
