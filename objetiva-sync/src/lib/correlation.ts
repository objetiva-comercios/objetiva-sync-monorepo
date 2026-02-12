/**
 * Correlation ID tracking for sync module
 *
 * Uses cls-rtracer for AsyncLocalStorage-based request tracing.
 * This enables correlation IDs to propagate automatically through
 * the async call chain without explicit parameter passing.
 *
 * Unlike the gateway, the sync module acts primarily as an HTTP client.
 * Correlation IDs are generated when starting sync operations and
 * passed to the gateway via X-Correlation-ID header.
 */

import rTracer from 'cls-rtracer'

export { rTracer }

/**
 * Get the current correlation ID from AsyncLocalStorage context
 *
 * Returns undefined when called outside of a correlation context
 * (e.g., during startup, in code not wrapped with runWithId)
 */
export function getCorrelationId(): string | undefined {
  return rTracer.id() as string | undefined
}

/**
 * Generate a new correlation ID for sync operations
 *
 * Format: sync-{timestamp}-{random}
 * Example: sync-1707753600000-a1b2c3d
 */
export function generateCorrelationId(): string {
  return `sync-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`
}

/**
 * Run a function within a correlation context
 *
 * Use this to wrap sync operations so all logs and outgoing
 * requests share the same correlation ID.
 *
 * @param id - The correlation ID to use (or generate one)
 * @param fn - The function to run within the context
 * @returns The result of the function
 */
export function runWithCorrelationId<T>(id: string, fn: () => T): T {
  return rTracer.runWithId(fn, id)
}
