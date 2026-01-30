/**
 * Schema cache service for sync service
 *
 * In-memory cache for PostgreSQL schema metadata fetched from the gateway.
 * Implements 1-hour TTL with graceful degradation when gateway is unreachable.
 *
 * Features:
 * - Fetch schemas from gateway via HTTP
 * - Cache with 1-hour TTL (matching gateway's cache duration)
 * - Graceful degradation: serve stale cache when gateway is down
 * - Automatic initialization on service startup
 */

import { logger } from '../utils/logger.js';
import {
  fetchSchemaFromGateway,
  fetchAllSchemasFromGateway,
} from './gateway-client.js';
import type { SchemaResponse } from '../types/schema.js';

/**
 * Cache entry with timestamps for TTL management
 */
interface CacheEntry {
  /** Cached schema data */
  schema: SchemaResponse;

  /** Unix timestamp (ms) when this entry was fetched */
  fetchedAt: number;

  /** Unix timestamp (ms) when this entry expires */
  expiresAt: number;
}

/**
 * Cache TTL in milliseconds (1 hour, matching gateway)
 */
const TTL_MS = parseInt(process.env.SCHEMA_CACHE_TTL_MS || '', 10) || 60 * 60 * 1000;

/**
 * Internal cache storage (Map of entity -> CacheEntry)
 */
const cacheStore = new Map<string, CacheEntry>();

/**
 * Sync entities to cache on initialization
 */
const SYNC_ENTITIES = [
  'articulos',
  'comprobantes_cabecera',
  'comprobantes_detalle',
  'comprobantes_pagos',
];

/**
 * Schema cache service
 *
 * Singleton object providing schema fetch and cache management for the sync service.
 */
export const schemaCache = {
  /**
   * Get schema for an entity (from cache or gateway)
   *
   * Attempts to retrieve schema from cache first. If cache is expired or missing,
   * fetches from gateway. If gateway is unreachable, returns stale cache if available.
   *
   * @param entity - Entity name (e.g., 'articulos', 'comprobantes_cabecera')
   * @returns Schema metadata, or null if unavailable
   */
  async getSchema(entity: string): Promise<SchemaResponse | null> {
    const cached = cacheStore.get(entity);
    const now = Date.now();

    // Check if cache is valid (not expired)
    if (cached && now < cached.expiresAt) {
      logger.debug({ entity }, 'Schema cache hit');
      return cached.schema;
    }

    // Cache expired or missing - fetch from gateway
    logger.debug({ entity }, 'Schema cache miss - fetching from gateway');

    try {
      const schema = await fetchSchemaFromGateway(entity);

      // Store in cache
      const expiresAt = now + TTL_MS;
      cacheStore.set(entity, {
        schema,
        fetchedAt: now,
        expiresAt,
      });

      logger.debug(
        {
          entity,
          expiresAt: new Date(expiresAt).toISOString(),
        },
        'Schema cached successfully'
      );

      return schema;
    } catch (error) {
      // Fetch failed - try to use stale cache (graceful degradation)
      if (cached) {
        logger.warn(
          {
            entity,
            error: error instanceof Error ? error.message : String(error),
            cacheAge: Math.floor((now - cached.fetchedAt) / 1000 / 60), // minutes
          },
          'Gateway unreachable - using stale cache'
        );

        return cached.schema;
      }

      // No stale cache available
      logger.error(
        {
          entity,
          error: error instanceof Error ? error.message : String(error),
        },
        'Failed to fetch schema and no stale cache available'
      );

      return null;
    }
  },

  /**
   * Fetch and cache schemas for all sync entities
   *
   * Fetches schemas for all configured entities from the gateway and caches them.
   * Used during service initialization to pre-populate the cache.
   *
   * @returns Array of successfully fetched schemas
   */
  async getAllSchemas(): Promise<SchemaResponse[]> {
    try {
      logger.debug('Fetching all schemas from gateway');

      const schemas = await fetchAllSchemasFromGateway();

      // Cache each schema individually
      const now = Date.now();
      const expiresAt = now + TTL_MS;

      for (const schema of schemas) {
        cacheStore.set(schema.entity, {
          schema,
          fetchedAt: now,
          expiresAt,
        });

        logger.debug(
          {
            entity: schema.entity,
            columns: schema.columns.length,
            constraints: schema.constraints.length,
          },
          'Schema cached'
        );
      }

      logger.info(
        {
          count: schemas.length,
          expiresAt: new Date(expiresAt).toISOString(),
        },
        'All schemas cached successfully'
      );

      return schemas;
    } catch (error) {
      logger.error(
        {
          error: error instanceof Error ? error.message : String(error),
        },
        'Failed to fetch all schemas from gateway'
      );

      throw error;
    }
  },

  /**
   * Invalidate cache entries
   *
   * Clears cache for a specific entity or the entire cache.
   *
   * @param entity - Optional entity name. If provided, clears only that entry.
   *                If omitted, clears entire cache.
   */
  invalidate(entity?: string): void {
    if (entity) {
      cacheStore.delete(entity);
      logger.info({ entity }, 'Schema cache entry invalidated');
    } else {
      cacheStore.clear();
      logger.info('Schema cache cleared');
    }
  },

  /**
   * Get current cache size
   *
   * @returns Number of entries currently in cache
   */
  size(): number {
    return cacheStore.size;
  },
};

/**
 * Initialize schema cache on service startup
 *
 * Loads schemas for all sync entities from the gateway and caches them.
 * This ensures the cache is warm when the service starts handling requests.
 *
 * Does NOT throw on failure - the service should start even if the gateway
 * is temporarily unavailable. Schemas will be fetched on-demand later.
 */
export async function initializeSchemaCache(): Promise<void> {
  logger.info('Initializing schema cache...');

  try {
    // Attempt to fetch all schemas in one request
    await schemaCache.getAllSchemas();

    logger.info(
      {
        entities: SYNC_ENTITIES,
        cacheSize: schemaCache.size(),
      },
      'Schema cache initialized successfully'
    );
  } catch (error) {
    // Log warning but don't throw - service should start even if gateway is down
    logger.warn(
      {
        error: error instanceof Error ? error.message : String(error),
      },
      'Failed to initialize schema cache - schemas will be fetched on-demand'
    );
  }
}
