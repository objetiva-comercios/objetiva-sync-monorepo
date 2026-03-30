/**
 * In-memory store for sync-reported schema snapshots
 *
 * Holds the TableSchemaMetadata snapshots reported by the sync service
 * via POST /api/schemas/report. Overwritten on each POST — no TTL, no
 * expiration. Data is lost on gateway restart and repopulated when sync
 * reconnects (D-04).
 */

import type { TableSchemaMetadata } from '@objetiva/shared/types';

/**
 * Internal Map storage — not exported directly.
 * Keyed by entity name (e.g. 'articulos', 'comprobantes_cabecera').
 */
const store = new Map<string, TableSchemaMetadata>();

/**
 * Sync schema store singleton.
 *
 * Provides set/get/hasData operations plus a test-only reset helper.
 */
export const syncSchemaStore = {
  /**
   * Replace all stored schemas with the provided snapshot array.
   * Clears all previous data before storing (full overwrite).
   *
   * @param snapshots - Array of TableSchemaMetadata to store
   */
  set(snapshots: TableSchemaMetadata[]): void {
    store.clear();
    for (const schema of snapshots) {
      store.set(schema.entity, schema);
    }
  },

  /**
   * Retrieve stored schema for a given entity.
   *
   * @param entity - Entity name (e.g. 'articulos')
   * @returns Stored TableSchemaMetadata or null if not present
   */
  get(entity: string): TableSchemaMetadata | null {
    return store.get(entity) ?? null;
  },

  /**
   * Check whether any schemas have been stored.
   *
   * @returns true if at least one schema is stored, false if empty
   */
  hasData(): boolean {
    return store.size > 0;
  },

  /**
   * Clear all stored schemas.
   * FOR TESTING ONLY — not for production use.
   */
  _resetForTest(): void {
    store.clear();
  },
};

/**
 * Standalone named export for _resetForTest.
 * Required by integration tests that import it as a named export.
 */
export function _resetForTest(): void {
  syncSchemaStore._resetForTest();
}
