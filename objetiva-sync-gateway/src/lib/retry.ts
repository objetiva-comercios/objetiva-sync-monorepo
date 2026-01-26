/**
 * Retry wrapper with exponential backoff for database operations
 *
 * Only retries on transient connection errors (ECONNREFUSED, ETIMEDOUT, etc.).
 * Does NOT retry on SQL errors, permission errors, or query timeouts.
 */

import { backOff } from 'exponential-backoff';
import { logger } from './logger.js';

/**
 * Connection error codes that should trigger a retry
 */
const RETRYABLE_ERROR_CODES = new Set([
  'ECONNREFUSED',  // Connection refused
  'ETIMEDOUT',     // Connection timeout
  'ENOTFOUND',     // DNS lookup failed
  'ECONNRESET',    // Connection reset by peer
]);

/**
 * Check if an error is a retryable connection error
 */
function isRetryableError(error: unknown): boolean {
  if (error && typeof error === 'object' && 'code' in error) {
    const code = (error as { code: string }).code;
    return RETRYABLE_ERROR_CODES.has(code);
  }
  return false;
}

/**
 * Wrapper that retries an operation with exponential backoff
 *
 * @param operation - Async function to retry
 * @param operationName - Name of the operation for logging
 * @returns Result of the operation
 * @throws Error if all retry attempts fail
 */
export async function withRetry<T>(
  operation: () => Promise<T>,
  operationName: string
): Promise<T> {
  return backOff(operation, {
    // Retry configuration
    numOfAttempts: 3,
    startingDelay: 1000, // 1 second
    timeMultiple: 2,     // Exponential: 1s, 2s, 4s
    jitter: 'full',      // Add random jitter to prevent thundering herd

    // Only retry on connection errors
    retry: (error: unknown, attemptNumber: number) => {
      const shouldRetry = isRetryableError(error);

      if (shouldRetry) {
        logger.warn(
          { error, attemptNumber, operationName },
          `Retrying ${operationName} (attempt ${attemptNumber})`
        );
      } else {
        logger.error(
          { error, operationName },
          `${operationName} failed with non-retryable error`
        );
      }

      return shouldRetry;
    },
  });
}
