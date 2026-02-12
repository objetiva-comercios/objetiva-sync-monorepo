/**
 * Correlation ID tracking for gateway
 *
 * Uses cls-rtracer for AsyncLocalStorage-based request tracing.
 * This enables correlation IDs to propagate automatically through
 * the async call chain without explicit parameter passing.
 */

import rTracer from 'cls-rtracer'

export { rTracer }

/**
 * Get the current correlation ID from AsyncLocalStorage context
 *
 * Returns undefined when called outside of a request context
 * (e.g., during startup, in background jobs without runWithId)
 */
export function getCorrelationId(): string | undefined {
  return rTracer.id() as string | undefined
}
