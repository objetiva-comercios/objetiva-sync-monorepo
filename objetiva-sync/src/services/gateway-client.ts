/**
 * Gateway HTTP client
 *
 * Handles authenticated HTTP requests to the gateway API.
 * Uses JWT authentication matching the gateway's expected format.
 *
 * NOTE: Schema fetching has been migrated to local files in shared/schemas/.
 * This module now only handles non-schema operations (cancellation notifications, etc.)
 */

import { createSigner } from 'fast-jwt';
import { logger } from '../utils/logger.js';
import { getCorrelationId } from '../lib/correlation.js';
import { getConfig } from '../store/repositories/config-repo.js';
import { decrypt } from '../utils/crypto.js';

/**
 * Gateway configuration: SQLite-first, falls back to environment variables.
 * Read lazily to ensure dotenv has loaded.
 */
async function getGatewayUrl(): Promise<string> {
  const record = await getConfig('REMOTE_API_URL');
  if (record?.value) {
    return record.value;
  }
  return process.env.GATEWAY_URL || 'http://localhost:3335';
}

async function getGatewayJwtSecret(): Promise<string | undefined> {
  const record = await getConfig('JWT_SECRET');
  if (record) {
    return record.encrypted ? decrypt(record.value) : record.value;
  }
  return process.env.JWT_SECRET;
}

/**
 * Generate a JWT token for gateway authentication
 *
 * Creates a short-lived JWT token signed with the gateway's secret.
 * Token expires in 5 minutes.
 *
 * @returns JWT token string
 * @throws Error if JWT_SECRET is not configured
 */
export async function getJwtToken(): Promise<string> {
  const secret = await getGatewayJwtSecret();
  if (!secret) {
    throw new Error(
      'JWT_SECRET environment variable is required for gateway authentication'
    );
  }

  try {
    // Create JWT signer with 5-minute expiry
    const signer = createSigner({
      key: secret,
      expiresIn: '5m',
    });

    // Sign token with minimal payload
    const token = signer({ source: 'sync-service', authenticated: true });

    return token;
  } catch (error) {
    logger.error({ error }, 'Failed to generate JWT token');
    throw new Error('Failed to generate JWT token for gateway authentication');
  }
}

/**
 * Notify gateway that a sync job was cancelled
 *
 * Sends a POST to the gateway's cancel endpoint so the dashboard
 * can update the job status immediately instead of waiting for timeout.
 *
 * @param syncId - The sync job ID to cancel
 */
export async function notifyGatewayCancellation(syncId: string): Promise<void> {
  const gatewayUrl = await getGatewayUrl();
  const url = `${gatewayUrl}/api/sync/${syncId}/cancel`;
  const correlationId = getCorrelationId();

  // Build headers with correlation ID for end-to-end tracing
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };
  if (correlationId) {
    headers['X-Correlation-ID'] = correlationId;
  }

  logger.debug({ correlationId, url, method: 'POST' }, 'Gateway request');

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers,
      body: JSON.stringify({}),
    });

    if (response.ok) {
      logger.info({ syncId, correlationId }, 'Gateway notified of sync cancellation');
    } else {
      logger.warn({ syncId, correlationId, status: response.status }, 'Gateway cancel notification failed');
    }
  } catch (error) {
    // Non-critical: gateway might be unreachable, timeout will handle it
    logger.warn({ syncId, correlationId, error }, 'Could not notify gateway of cancellation');
  }
}

// =============================================================================
// DEPRECATED: Schema fetching functions have been removed.
// Schemas are now loaded from shared/schemas/ files.
// Run `npm run regenerate-schemas` in objetiva-sync-gateway to update schemas.
// =============================================================================
