/**
 * Shared Schemas
 *
 * Auto-generated Zod schemas from PostgreSQL introspection.
 * These are the SINGLE SOURCE OF TRUTH for data validation.
 *
 * DO NOT create manual schema files - they will diverge from PostgreSQL.
 * To add business validations, use COMMENT ON COLUMN in PostgreSQL.
 *
 * IMPORTANT: Both objetiva-sync and objetiva-sync-gateway import from this location.
 * Run `npm run regenerate-schemas` in objetiva-sync-gateway to update.
 *
 * @see docs/SCHEMA-METADATA.md for PostgreSQL comment syntax
 */

// Re-export all generated schemas, metadata, and table schemas
export * from './generated/articulos.schema.js';
export * from './generated/comprobantes_cabecera.schema.js';
export * from './generated/comprobantes_detalle.schema.js';
export * from './generated/comprobantes_pagos.schema.js';

// Re-export metadata types
export type {
  EntityMetadata,
  ValidationRule,
  ColumnMetadata,
  ConstraintMetadata,
  TableSchemaMetadata,
} from '../types/schema-metadata.js';

/**
 * Map of table names to their TableSchemaMetadata
 * Used for dynamic schema lookup by table name
 */
import { articuloTableSchema } from './generated/articulos.schema.js';
import { comprobantesCabeceraTableSchema } from './generated/comprobantes_cabecera.schema.js';
import { comprobantesDetalleTableSchema } from './generated/comprobantes_detalle.schema.js';
import { comprobantesPagoTableSchema } from './generated/comprobantes_pagos.schema.js';
import type { TableSchemaMetadata } from '../types/schema-metadata.js';

export const tableSchemas: Record<string, TableSchemaMetadata> = {
  articulos: articuloTableSchema,
  comprobantes_cabecera: comprobantesCabeceraTableSchema,
  comprobantes_detalle: comprobantesDetalleTableSchema,
  comprobantes_pagos: comprobantesPagoTableSchema,
};

/**
 * Get table schema by name
 * @param tableName - PostgreSQL table name (e.g., 'articulos')
 * @returns TableSchemaMetadata or null if not found
 */
export function getTableSchema(tableName: string): TableSchemaMetadata | null {
  return tableSchemas[tableName] || null;
}
