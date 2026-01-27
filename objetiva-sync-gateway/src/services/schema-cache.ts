/**
 * In-memory cache for schema metadata with TTL expiration
 *
 * Simple Map-based cache with 1-hour TTL for schema introspection results.
 * Reduces database load by caching frequently accessed schema metadata.
 *
 * Features:
 * - 1-hour TTL (SCHEMA-04)
 * - Automatic expiration cleanup on get
 * - Selective or full cache invalidation
 * - Debug logging for cache operations
 */

import { logger } from '../lib/logger.js';

/**
 * Cache entry with expiration timestamp
 */
interface CacheEntry<T> {
  /** Cached data payload */
  data: T;

  /** Unix timestamp (ms) when this entry expires */
  expiresAt: number;
}

/**
 * Cache TTL in milliseconds (1 hour)
 */
const TTL_MS = 60 * 60 * 1000;

/**
 * Internal cache storage (Map of key -> CacheEntry)
 */
const cacheStore = new Map<string, CacheEntry<unknown>>();

/**
 * Schema cache service
 *
 * Singleton object providing get/set/invalidate operations for schema metadata.
 */
export const schemaCache = {
  /**
   * Get cached data if it exists and hasn't expired
   *
   * @param key - Cache key (typically entity name)
   * @returns Cached data if found and valid, null otherwise
   */
  get<T>(key: string): T | null {
    const entry = cacheStore.get(key) as CacheEntry<T> | undefined;

    if (!entry) {
      return null;
    }

    // Check if entry has expired
    if (Date.now() > entry.expiresAt) {
      logger.debug({ key }, 'Cache entry expired');
      cacheStore.delete(key);
      return null;
    }

    logger.debug({ key }, 'Cache hit');
    return entry.data;
  },

  /**
   * Store data in cache with 1-hour TTL
   *
   * @param key - Cache key (typically entity name)
   * @param data - Data to cache
   */
  set<T>(key: string, data: T): void {
    const expiresAt = Date.now() + TTL_MS;

    cacheStore.set(key, {
      data,
      expiresAt,
    });

    logger.debug({ key, expiresAt: new Date(expiresAt).toISOString() }, 'Cache entry set');
  },

  /**
   * Invalidate cache entries
   *
   * @param key - Optional cache key. If provided, invalidates only that entry.
   *              If omitted, clears entire cache.
   */
  invalidate(key?: string): void {
    if (key) {
      cacheStore.delete(key);
      logger.info({ key }, 'Cache entry invalidated');
    } else {
      cacheStore.clear();
      logger.info('Cache cleared');
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
