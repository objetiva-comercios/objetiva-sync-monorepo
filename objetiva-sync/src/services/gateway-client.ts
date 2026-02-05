/**
 * Gateway HTTP client
 *
 * Handles authenticated HTTP requests to the gateway API for fetching
 * PostgreSQL schema metadata. Uses JWT authentication matching the gateway's
 * expected format.
 */

import { createSigner } from 'fast-jwt';
import { logger } from '../utils/logger.js';
import type { SchemaResponse } from '../types/schema.js';

/**
 * Gateway configuration from environment variables
 * Read lazily to ensure dotenv has loaded
 */
function getGatewayUrl(): string {
  return process.env.GATEWAY_URL || 'http://localhost:3335';
}

function getGatewayJwtSecret(): string | undefined {
  return process.env.JWT_SECRET;
}

/**
 * Generate a JWT token for gateway authentication
 *
 * Creates a short-lived JWT token signed with the gateway's secret.
 * Token expires in 5 minutes (sufficient for schema requests).
 *
 * @returns JWT token string
 * @throws Error if JWT_SECRET is not configured
 */
function getJwtToken(): string {
  const secret = getGatewayJwtSecret();
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
 * Fetch schema metadata for a single entity from gateway
 *
 * Retrieves complete schema information (columns, constraints) for one
 * sync entity from the gateway's /api/schemas/:entity endpoint.
 *
 * @param entity - Entity name (e.g., 'articulos', 'comprobantes_cabecera')
 * @returns Schema metadata for the entity
 * @throws Error on authentication failure, entity not found, or network error
 */
export async function fetchSchemaFromGateway(
  entity: string
): Promise<SchemaResponse> {
  const gatewayUrl = getGatewayUrl();
  const url = `${gatewayUrl}/api/schemas/${entity}`;

  try {
    const token = getJwtToken();

    logger.debug({ entity, url }, 'Fetching schema from gateway');

    const response = await fetch(url, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
    });

    // Handle specific error responses
    if (!response.ok) {
      if (response.status === 401) {
        throw new Error(
          'Gateway authentication failed - check JWT_SECRET environment variable'
        );
      }

      if (response.status === 404) {
        throw new Error(`Entity schema not found: ${entity}`);
      }

      // Try to get error details from response body
      let errorDetails = response.statusText;
      try {
        const errorBody = (await response.json()) as Record<string, any>;
        errorDetails =
          errorBody.error || errorBody.message || JSON.stringify(errorBody);
      } catch {
        // Ignore JSON parse errors, use statusText
      }

      throw new Error(
        `Gateway request failed (${response.status}): ${errorDetails}`
      );
    }

    const schema = (await response.json()) as SchemaResponse;

    logger.debug(
      {
        entity,
        columns: schema.columns.length,
        constraints: schema.constraints.length,
      },
      'Schema fetched successfully'
    );

    return schema;
  } catch (error) {
    // Network errors (gateway unreachable)
    if (error instanceof TypeError && error.message.includes('fetch')) {
      throw new Error(
        `Gateway unreachable at ${gatewayUrl} - is the gateway service running?`
      );
    }

    // Re-throw with context
    const errorMessage =
      error instanceof Error ? error.message : String(error);
    logger.error({ entity, url, error: errorMessage }, 'Failed to fetch schema');

    throw error;
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
  const gatewayUrl = getGatewayUrl();
  const url = `${gatewayUrl}/api/sync/${syncId}/cancel`;

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    });

    if (response.ok) {
      logger.info({ syncId }, 'Gateway notified of sync cancellation');
    } else {
      logger.warn({ syncId, status: response.status }, 'Gateway cancel notification failed');
    }
  } catch (error) {
    // Non-critical: gateway might be unreachable, timeout will handle it
    logger.warn({ syncId, error }, 'Could not notify gateway of cancellation');
  }
}

/**
 * Fetch schema metadata for all entities from gateway
 *
 * Retrieves schema information for all sync entities from the gateway's
 * /api/schemas endpoint.
 *
 * @returns Array of schema metadata for all entities
 * @throws Error on authentication failure or network error
 */
export async function fetchAllSchemasFromGateway(): Promise<SchemaResponse[]> {
  const gatewayUrl = getGatewayUrl();
  const url = `${gatewayUrl}/api/schemas`;

  try {
    const token = getJwtToken();

    logger.debug({ url }, 'Fetching all schemas from gateway');

    const response = await fetch(url, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
    });

    // Handle specific error responses
    if (!response.ok) {
      if (response.status === 401) {
        throw new Error(
          'Gateway authentication failed - check JWT_SECRET environment variable'
        );
      }

      // Try to get error details from response body
      let errorDetails = response.statusText;
      try {
        const errorBody = (await response.json()) as Record<string, any>;
        errorDetails =
          errorBody.error || errorBody.message || JSON.stringify(errorBody);
      } catch {
        // Ignore JSON parse errors, use statusText
      }

      throw new Error(
        `Gateway request failed (${response.status}): ${errorDetails}`
      );
    }

    const schemas = (await response.json()) as SchemaResponse[];

    logger.debug({ count: schemas.length }, 'All schemas fetched successfully');

    return schemas;
  } catch (error) {
    // Network errors (gateway unreachable)
    if (error instanceof TypeError && error.message.includes('fetch')) {
      throw new Error(
        `Gateway unreachable at ${gatewayUrl} - is the gateway service running?`
      );
    }

    // Re-throw with context
    const errorMessage =
      error instanceof Error ? error.message : String(error);
    logger.error({ url, error: errorMessage }, 'Failed to fetch schemas');

    throw error;
  }
}
