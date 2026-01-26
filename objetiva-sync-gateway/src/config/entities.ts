/**
 * Configurable list of sync entities to introspect
 *
 * This module defines the default set of PostgreSQL tables that should be
 * introspected for schema metadata and included in the sync pipeline.
 *
 * The entity list can be overridden via the SYNC_ENTITIES environment variable
 * for testing or custom sync configurations.
 */

/**
 * Default list of sync entities (table names)
 *
 * These are the 4 core tables in the PostgreSQL schema that represent
 * the sync pipeline's data model:
 * - articulos: Product/item master data
 * - comprobantes_cabecera: Document headers (invoices, receipts, etc.)
 * - comprobantes_detalle: Document line items
 * - comprobantes_pagos: Payment records linked to documents
 */
export const SYNC_ENTITIES = [
  'articulos',
  'comprobantes_cabecera',
  'comprobantes_detalle',
  'comprobantes_pagos',
] as const;

/**
 * Get the list of sync entities to introspect
 *
 * Checks for SYNC_ENTITIES environment variable override. If set, parses
 * the comma-separated list and returns it. Otherwise returns the default
 * SYNC_ENTITIES array.
 *
 * @returns Array of table names to introspect
 *
 * @example
 * // Use default entities
 * const entities = getSyncEntities();
 * // Returns: ['articulos', 'comprobantes_cabecera', 'comprobantes_detalle', 'comprobantes_pagos']
 *
 * @example
 * // Override via environment variable
 * process.env.SYNC_ENTITIES = 'articulos,comprobantes_cabecera'
 * const entities = getSyncEntities();
 * // Returns: ['articulos', 'comprobantes_cabecera']
 */
export function getSyncEntities(): string[] {
  const envOverride = process.env.SYNC_ENTITIES;

  if (envOverride) {
    // Parse comma-separated list, trim whitespace from each entity
    return envOverride.split(',').map((entity) => entity.trim());
  }

  // Return default entities
  return [...SYNC_ENTITIES];
}
