/**
 * Pure schema comparison logic for 3-way schema comparison.
 *
 * Compares PostgreSQL live schema, gateway-compiled schema, and
 * sync-reported schema per entity. PostgreSQL is authoritative —
 * comparison iterates PG columns and checks compiled/sync alignment.
 *
 * Locked decisions (from 26-RESEARCH.md):
 * - D-07: Per-field structure { column_name, status, postgresql, compiled, sync }
 * - D-08: status values: "aligned", "mismatched", "missing"
 * - D-09: Comparison attributes: data_type + is_nullable only
 * - D-10: Entity includes summary: { aligned: N, mismatched: N, missing: N }
 */

import type { TableSchemaMetadata } from '@shared/types/schema-metadata.js';
import type { TableSchema } from '../types/schema.js';

// ────────────────────────────────────────────────────────────────
// Exported types
// ────────────────────────────────────────────────────────────────

/** Minimal field data used for alignment comparison (data_type + is_nullable only, per D-09) */
export interface FieldLayerData {
  data_type: string;
  is_nullable: boolean;
}

/** Per-field comparison row showing all 3 layers and their alignment status */
export interface ComparisonFieldRow {
  column_name: string;
  status: 'aligned' | 'mismatched' | 'missing';
  postgresql: FieldLayerData | null;
  compiled: FieldLayerData | null;
  sync: FieldLayerData | null;
}

/** Full comparison result for a single entity */
export interface EntityComparison {
  entity: string;
  /** false = sync has never called POST /api/schemas/report (D-05) */
  sync_reported: boolean;
  summary: {
    aligned: number;
    mismatched: number;
    missing: number;
  };
  fields: ComparisonFieldRow[];
}

// ────────────────────────────────────────────────────────────────
// Main export
// ────────────────────────────────────────────────────────────────

/**
 * Build a 3-way entity comparison result.
 *
 * @param entity         - Entity name (e.g. 'articulos')
 * @param pgSchema       - PostgreSQL live schema from IntrospectionService (null if introspection failed)
 * @param compiledSchema - Gateway compiled schema from shared/schemas/index.ts (null if not found)
 * @param syncSchema     - Sync-reported schema from syncSchemaStore (null if not reported for entity)
 * @param syncReported   - true if sync has called POST /api/schemas/report at least once
 */
export function buildEntityComparison(
  entity: string,
  pgSchema: TableSchema | null,
  compiledSchema: TableSchemaMetadata | null,
  syncSchema: TableSchemaMetadata | null,
  syncReported: boolean,
): EntityComparison {
  // When pgSchema is null (introspection failed), return all fields from compiled
  // with postgresql: null and status: 'missing' (Pitfall 4)
  if (pgSchema === null) {
    const fields: ComparisonFieldRow[] = buildFieldsForNullPg(compiledSchema, syncSchema, syncReported);
    return {
      entity,
      sync_reported: syncReported,
      summary: countSummary(fields),
      fields,
    };
  }

  // Build column lookup maps for compiled and sync layers
  const compiledMap = buildColumnMap(compiledSchema?.columns ?? []);
  const syncMap = syncReported ? buildColumnMap(syncSchema?.columns ?? []) : new Map<string, FieldLayerData>();

  // Iterate PostgreSQL columns as the authoritative source (D-08)
  const fields: ComparisonFieldRow[] = pgSchema.columns.map((pgColumn) => {
    const pg: FieldLayerData = {
      data_type: pgColumn.data_type,
      is_nullable: pgColumn.is_nullable,
    };

    const compiled = compiledMap.get(pgColumn.column_name) ?? null;
    const sync = syncReported ? (syncMap.get(pgColumn.column_name) ?? null) : null;

    return compareField(pgColumn.column_name, pg, compiled, sync, syncReported);
  });

  return {
    entity,
    sync_reported: syncReported,
    summary: countSummary(fields),
    fields,
  };
}

// ────────────────────────────────────────────────────────────────
// Private helpers
// ────────────────────────────────────────────────────────────────

/**
 * Build a FieldLayerData map keyed by column_name from a columns array.
 */
function buildColumnMap(
  columns: Array<{ column_name: string; data_type: string; is_nullable: boolean }>,
): Map<string, FieldLayerData> {
  const map = new Map<string, FieldLayerData>();
  for (const col of columns) {
    map.set(col.column_name, { data_type: col.data_type, is_nullable: col.is_nullable });
  }
  return map;
}

/**
 * Determine the comparison status and build a ComparisonFieldRow for a single column.
 *
 * Logic (per D-08, D-09):
 * - missing: compiled absent OR (syncReported AND sync absent)
 * - aligned: all present layers match data_type + is_nullable
 * - mismatched: present layers differ on data_type or is_nullable
 */
function compareField(
  columnName: string,
  pg: FieldLayerData,
  compiled: FieldLayerData | null,
  sync: FieldLayerData | null,
  syncReported: boolean,
): ComparisonFieldRow {
  const compiledAbsent = compiled === null;
  const syncAbsent = syncReported && sync === null;

  if (compiledAbsent || syncAbsent) {
    return {
      column_name: columnName,
      status: 'missing',
      postgresql: pg,
      compiled,
      sync,
    };
  }

  // All layers present — check alignment on data_type + is_nullable (D-09)
  const compiledMatches =
    compiled!.data_type === pg.data_type && compiled!.is_nullable === pg.is_nullable;
  const syncMatches =
    !syncReported ||
    (sync !== null &&
      sync.data_type === pg.data_type &&
      sync.is_nullable === pg.is_nullable);

  const status: ComparisonFieldRow['status'] = compiledMatches && syncMatches ? 'aligned' : 'mismatched';

  return {
    column_name: columnName,
    status,
    postgresql: pg,
    compiled,
    sync,
  };
}

/**
 * Build field rows when pgSchema is null (introspection failed).
 * All fields from compiled have postgresql: null and status: 'missing'.
 */
function buildFieldsForNullPg(
  compiledSchema: TableSchemaMetadata | null,
  syncSchema: TableSchemaMetadata | null,
  syncReported: boolean,
): ComparisonFieldRow[] {
  const columns = compiledSchema?.columns ?? [];

  if (columns.length === 0) {
    return [];
  }

  const syncMap = syncReported ? buildColumnMap(syncSchema?.columns ?? []) : new Map<string, FieldLayerData>();

  return columns.map((col) => {
    const compiled: FieldLayerData = { data_type: col.data_type, is_nullable: col.is_nullable };
    const sync = syncReported ? (syncMap.get(col.column_name) ?? null) : null;

    return {
      column_name: col.column_name,
      status: 'missing' as const,
      postgresql: null,
      compiled,
      sync,
    };
  });
}

/**
 * Count aligned/mismatched/missing from a fields array.
 */
function countSummary(fields: ComparisonFieldRow[]): EntityComparison['summary'] {
  let aligned = 0;
  let mismatched = 0;
  let missing = 0;

  for (const field of fields) {
    if (field.status === 'aligned') aligned++;
    else if (field.status === 'mismatched') mismatched++;
    else missing++;
  }

  return { aligned, mismatched, missing };
}
