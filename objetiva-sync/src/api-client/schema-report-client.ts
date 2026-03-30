/**
 * Schema Report Client
 *
 * Reports the sync service's compiled TableSchemaMetadata to the gateway
 * on startup. This enables the gateway's 3-way schema comparison API
 * (POST /api/schemas/report, consumed by GET /api/schemas/compare).
 *
 * Non-blocking: if the report fails, sync proceeds normally.
 */

import { tableSchemas } from '@shared/schemas/index.js';
import { getJwtToken, getGatewayUrl } from '../services/gateway-client.js';
import { logger } from '../utils/logger.js';

/**
 * Report all compiled schemas to the gateway.
 *
 * Sends the 4 entity schemas (articulos, comprobantes_cabecera,
 * comprobantes_detalle, comprobantes_pagos) in a single POST request.
 *
 * @throws on network error or non-200 response (caller should catch)
 */
export async function reportSchemasToGateway(): Promise<void> {
  const snapshots = Object.values(tableSchemas);
  const gatewayUrl = await getGatewayUrl();
  const token = await getJwtToken();

  const response = await fetch(`${gatewayUrl}/api/schemas/report`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ schemas: snapshots }),
    signal: AbortSignal.timeout(10_000),
  });

  if (!response.ok) {
    throw new Error(`Schema report failed with status ${response.status}`);
  }

  logger.info(
    { entities: snapshots.map(s => s.entity), gateway: gatewayUrl },
    'Schemas reported to gateway'
  );
}
