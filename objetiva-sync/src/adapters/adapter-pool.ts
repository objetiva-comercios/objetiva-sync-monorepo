/**
 * Adapter Pool Manager
 * Gestiona un pool de adaptadores conectados por connectionId
 * Permite reusar conexiones existentes y gestiona ciclo de vida
 */

import { createAdapter, type IDataSourceAdapter } from './index.js';
import { getConnectionById, getConnectionConfig } from '../store/repositories/connection-config-repo.js';
import { normalizeAdapterConfig } from './database-adapter.js';
import { logger } from '../utils/logger.js';

/**
 * Entry en el pool de adaptadores
 */
interface PoolEntry {
  adapter: IDataSourceAdapter;
  connectionId: number;
  adapterType: string;
  connectedAt: Date;
  lastUsed: Date;
}

/**
 * Pool de adaptadores conectados
 * Key: connectionId (number as string)
 */
const adapterPool = new Map<string, PoolEntry>();

/**
 * Obtiene un adaptador conectado para un connectionId específico
 * Si ya existe en el pool, lo reutiliza. Si no, lo crea y conecta.
 *
 * @param connectionId ID de la conexión en connection_config
 * @returns Adaptador conectado listo para usar
 */
export async function getAdapter(connectionId: number): Promise<IDataSourceAdapter> {
  const key = String(connectionId);

  // Check if already in pool
  const existing = adapterPool.get(key);
  if (existing) {
    existing.lastUsed = new Date();
    logger.debug(`[AdapterPool] Reusing adapter for connection ${connectionId}`);
    return existing.adapter;
  }

  // Get connection details
  const connection = await getConnectionById(connectionId);
  if (!connection) {
    throw new Error(`Conexión no encontrada: ${connectionId}`);
  }

  // Get decrypted config and normalize for adapter
  const rawConfig = await getConnectionConfig(connectionId);
  const adapterConfig = normalizeAdapterConfig(connection.adapterType, rawConfig);

  // Create and connect adapter
  const adapter = createAdapter(connection.adapterType);

  logger.info(`[AdapterPool] Creating adapter for connection ${connectionId} (${connection.adapterType})`);

  await adapter.connect(adapterConfig);

  // Add to pool
  const entry: PoolEntry = {
    adapter,
    connectionId,
    adapterType: connection.adapterType,
    connectedAt: new Date(),
    lastUsed: new Date(),
  };

  adapterPool.set(key, entry);

  logger.info(`[AdapterPool] Adapter connected and pooled: ${connection.name} (ID: ${connectionId})`);

  return adapter;
}

/**
 * Verifica si hay un adaptador en el pool para un connectionId
 */
export function hasAdapter(connectionId: number): boolean {
  return adapterPool.has(String(connectionId));
}

/**
 * Desconecta y remueve un adaptador específico del pool
 */
export async function removeAdapter(connectionId: number): Promise<void> {
  const key = String(connectionId);
  const entry = adapterPool.get(key);

  if (!entry) {
    return;
  }

  try {
    await entry.adapter.disconnect();
    logger.info(`[AdapterPool] Adapter disconnected: connection ${connectionId}`);
  } catch (error) {
    logger.error({ error }, `[AdapterPool] Error disconnecting adapter ${connectionId}`);
  }

  adapterPool.delete(key);
}

/**
 * Desconecta todos los adaptadores del pool
 * Usar al apagar el servidor
 */
export async function disconnectAll(): Promise<void> {
  logger.info(`[AdapterPool] Disconnecting all adapters (${adapterPool.size} in pool)`);

  const disconnectPromises: Promise<void>[] = [];

  for (const [key, entry] of adapterPool.entries()) {
    disconnectPromises.push(
      entry.adapter.disconnect().catch((error) => {
        logger.error({ error }, `[AdapterPool] Error disconnecting adapter ${key}`);
      })
    );
  }

  await Promise.all(disconnectPromises);
  adapterPool.clear();

  logger.info('[AdapterPool] All adapters disconnected');
}

/**
 * Obtiene estadísticas del pool
 */
export function getPoolStats(): {
  totalConnections: number;
  connections: Array<{
    connectionId: number;
    adapterType: string;
    connectedAt: string;
    lastUsed: string;
  }>;
} {
  const connections = Array.from(adapterPool.values()).map((entry) => ({
    connectionId: entry.connectionId,
    adapterType: entry.adapterType,
    connectedAt: entry.connectedAt.toISOString(),
    lastUsed: entry.lastUsed.toISOString(),
  }));

  return {
    totalConnections: adapterPool.size,
    connections,
  };
}

/**
 * Limpia adaptadores inactivos (no usados en los últimos N minutos)
 * @param maxIdleMinutes Minutos máximos de inactividad (default: 30)
 */
export async function cleanupIdleAdapters(maxIdleMinutes = 30): Promise<number> {
  const now = new Date();
  const maxIdleMs = maxIdleMinutes * 60 * 1000;
  let removed = 0;

  for (const [key, entry] of adapterPool.entries()) {
    const idleMs = now.getTime() - entry.lastUsed.getTime();

    if (idleMs > maxIdleMs) {
      try {
        await entry.adapter.disconnect();
        adapterPool.delete(key);
        removed++;
        logger.info(`[AdapterPool] Cleaned up idle adapter: connection ${entry.connectionId}`);
      } catch (error) {
        logger.error({ error }, `[AdapterPool] Error cleaning up adapter ${key}`);
      }
    }
  }

  if (removed > 0) {
    logger.info(`[AdapterPool] Cleaned up ${removed} idle adapters`);
  }

  return removed;
}
