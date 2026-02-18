/**
 * Schema cache service for sync service
 *
 * Provides access to PostgreSQL schema metadata from the shared schemas.
 * This is the SINGLE SOURCE OF TRUTH for schema information.
 *
 * IMPORTANT: Schemas are loaded from shared/schemas/ which are auto-generated
 * by running `npm run regenerate-schemas` in objetiva-sync-gateway.
 *
 * Migration from HTTP-based schema fetching:
 * - Previously, this module fetched schemas from the gateway via HTTP
 * - Now, schemas are read directly from the shared/ folder in the monorepo
 * - Both objetiva-sync and objetiva-sync-gateway use the same schema files
 */

import { logger } from '../utils/logger.js';
import {
  getTableSchema,
  tableSchemas,
  type TableSchemaMetadata,
} from '@shared/schemas/index.js';

// Re-export the types for backwards compatibility
export type { TableSchemaMetadata as SchemaResponse } from '@shared/schemas/index.js';

/**
 * Schema cache service
 *
 * Provides schema access via the shared schema files.
 * No HTTP calls are made - schemas are loaded synchronously from disk.
 */
export const schemaCache = {
  /**
   * Get schema for an entity
   *
   * Returns a Promise for backwards compatibility with async callers.
   * Internally loads from static files (no actual async I/O).
   *
   * @param entity - Entity name (e.g., 'articulos', 'comprobantes_cabecera')
   * @returns Schema metadata, or null if not found
   */
  async getSchema(entity: string): Promise<TableSchemaMetadata | null> {
    const schema = getTableSchema(entity);

    if (!schema) {
      logger.warn({ entity }, 'Schema not found in shared schemas');
      return null;
    }

    logger.debug({ entity }, 'Schema loaded from shared schemas');
    return schema;
  },

  /**
   * Get all available schemas
   *
   * @returns Array of all schema metadata
   */
  getAllSchemas(): TableSchemaMetadata[] {
    return Object.values(tableSchemas);
  },

  /**
   * Get list of available entity names
   *
   * @returns Array of entity names (table names)
   */
  getEntityNames(): string[] {
    return Object.keys(tableSchemas);
  },

  /**
   * Check if a schema exists
   *
   * @param entity - Entity name
   * @returns true if schema exists
   */
  hasSchema(entity: string): boolean {
    return entity in tableSchemas;
  },

  /**
   * Get cache size (for backwards compatibility)
   *
   * @returns Number of schemas available
   */
  size(): number {
    return Object.keys(tableSchemas).length;
  },

  /**
   * Invalidate is a no-op since schemas are static files
   * Kept for backwards compatibility
   */
  invalidate(_entity?: string): void {
    logger.debug('Schema invalidate called - no-op since schemas are loaded from files');
  },
};

/**
 * Initialize schema cache
 *
 * This is now a no-op since schemas are loaded synchronously from disk.
 * Kept for backwards compatibility with existing code that calls it.
 */
export async function initializeSchemaCache(): Promise<void> {
  const entities = schemaCache.getEntityNames();

  logger.info(
    {
      entities,
      cacheSize: schemaCache.size(),
    },
    'Schema cache initialized from shared schemas (no HTTP calls)'
  );
}
