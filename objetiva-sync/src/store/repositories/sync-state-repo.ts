/**
 * Repositorio para la tabla `sync_state`
 * Gestión del estado de sincronización por query
 */

import { eq } from 'drizzle-orm';
import { getDatabase } from '../index.js';
import { syncState, type SyncState, type NewSyncState, queries } from '../schema.js';
import { logger } from '../../utils/logger.js';
import { SyncStatus } from '../../types/common.js';
import type { EntityType } from '../../types/common.js';

/**
 * Obtiene el estado de sincronización de una query
 */
export async function getSyncState(queryId: number): Promise<SyncState | null> {
  try {
    const db = getDatabase();
    const result = await db
      .select()
      .from(syncState)
      .where(eq(syncState.queryId, queryId))
      .limit(1);
    return result[0] ?? null;
  } catch (error) {
    logger.error(error, `Error al obtener sync state de query: ${queryId}`);
    throw error;
  }
}

/**
 * Obtiene todos los estados de sincronización
 */
export async function getAllSyncStates(): Promise<SyncState[]> {
  try {
    const db = getDatabase();
    return await db.select().from(syncState);
  } catch (error) {
    logger.error(error, 'Error al obtener todos los sync states');
    throw error;
  }
}

/**
 * Actualiza el estado de sincronización de una query (upsert)
 */
export async function updateSyncState(
  queryId: number,
  data: {
    lastSyncValue?: string | null;
    lastSyncAt?: string | null;
    lastSyncCount?: number | null;
    totalSynced?: number;
    status?: SyncStatus;
    errorMessage?: string | null;
  }
): Promise<void> {
  try {
    const db = getDatabase();

    // Verificar si existe
    const existing = await getSyncState(queryId);

    if (existing) {
      // Actualizar
      const updateData: Partial<NewSyncState> & { updatedAt: string } = {
        updatedAt: new Date().toISOString(),
      };

      if (data.lastSyncValue !== undefined) updateData.lastSyncValue = data.lastSyncValue;
      if (data.lastSyncAt !== undefined) updateData.lastSyncAt = data.lastSyncAt;
      if (data.lastSyncCount !== undefined) updateData.lastSyncCount = data.lastSyncCount;
      if (data.totalSynced !== undefined) updateData.totalSynced = data.totalSynced;
      if (data.status !== undefined) updateData.status = data.status;
      if (data.errorMessage !== undefined) updateData.errorMessage = data.errorMessage;

      await db.update(syncState).set(updateData).where(eq(syncState.queryId, queryId));

      logger.info(`Sync state actualizado para query ID: ${queryId}`);
    } else {
      // Obtener entityType de la query
      const entityType = await getEntityTypeFromQuery(queryId);

      // Insertar
      const newState: NewSyncState = {
        queryId,
        entityType,
        lastSyncValue: data.lastSyncValue ?? null,
        lastSyncAt: data.lastSyncAt ?? null,
        lastSyncCount: data.lastSyncCount ?? null,
        totalSynced: data.totalSynced ?? 0,
        status: data.status ?? 'idle',
        errorMessage: data.errorMessage ?? null,
      };

      await db.insert(syncState).values(newState);
      logger.info(`Sync state creado para query ID: ${queryId}`);
    }
  } catch (error) {
    logger.error(error, `Error al actualizar sync state de query: ${queryId}`);
    throw error;
  }
}

/**
 * Marca una query como sincronizando (status = running)
 */
export async function markSyncAsRunning(queryId: number): Promise<void> {
  await updateSyncState(queryId, {
    status: SyncStatus.RUNNING,
    errorMessage: null,
  });
}

/**
 * Marca una query como sincronizada exitosamente
 */
export async function markSyncAsSuccess(
  queryId: number,
  data: {
    lastSyncValue: string;
    recordCount: number;
  }
): Promise<void> {
  const now = new Date().toISOString();

  // Obtener estado actual para calcular total
  const currentState = await getSyncState(queryId);
  const currentTotal = currentState?.totalSynced ?? 0;

  await updateSyncState(queryId, {
    status: SyncStatus.IDLE,
    lastSyncValue: data.lastSyncValue,
    lastSyncAt: now,
    lastSyncCount: data.recordCount,
    totalSynced: currentTotal + data.recordCount,
    errorMessage: null,
  });
}

/**
 * Marca una query como fallida en sincronización
 */
export async function markSyncAsError(
  queryId: number,
  errorMessage: string
): Promise<void> {
  await updateSyncState(queryId, {
    status: SyncStatus.ERROR,
    errorMessage,
  });
}

/**
 * Reinicia el estado de sincronización de una query
 */
export async function resetSyncState(queryId: number): Promise<void> {
  try {
    const db = getDatabase();

    await db
      .update(syncState)
      .set({
        lastSyncValue: null,
        lastSyncAt: null,
        lastSyncCount: null,
        totalSynced: 0,
        status: 'idle',
        errorMessage: null,
        updatedAt: new Date().toISOString(),
      })
      .where(eq(syncState.queryId, queryId));

    logger.info(`Sync state reiniciado para query ID: ${queryId}`);
  } catch (error) {
    logger.error(error, `Error al reiniciar sync state de query: ${queryId}`);
    throw error;
  }
}

/**
 * Elimina el estado de sincronización de una query
 * Nota: Esto se ejecuta automáticamente por CASCADE cuando se elimina una query
 */
export async function deleteSyncState(queryId: number): Promise<void> {
  try {
    const db = getDatabase();
    await db.delete(syncState).where(eq(syncState.queryId, queryId));
    logger.info(`Sync state eliminado para query ID: ${queryId}`);
  } catch (error) {
    logger.error(error, `Error al eliminar sync state de query: ${queryId}`);
    throw error;
  }
}

/**
 * Obtiene el último valor sincronizado de una query
 */
export async function getLastSyncValue(queryId: number): Promise<string | null> {
  const state = await getSyncState(queryId);
  return state?.lastSyncValue ?? null;
}

/**
 * Incrementa el contador total de una query
 */
export async function incrementTotalSynced(
  queryId: number,
  count: number
): Promise<void> {
  const currentState = await getSyncState(queryId);
  const currentTotal = currentState?.totalSynced ?? 0;

  await updateSyncState(queryId, {
    totalSynced: currentTotal + count,
  });
}

/**
 * Helper: Obtiene el entityType de una query por su ID
 */
export async function getEntityTypeFromQuery(queryId: number): Promise<EntityType> {
  try {
    const db = getDatabase();
    const result = await db
      .select({ entityType: queries.entityType })
      .from(queries)
      .where(eq(queries.id, queryId))
      .limit(1);

    const query = result[0];
    if (!query) {
      throw new Error(`Query no encontrada: ${queryId}`);
    }

    return query.entityType as EntityType;
  } catch (error) {
    logger.error(error, `Error al obtener entityType de query: ${queryId}`);
    throw error;
  }
}

/**
 * Resetea todos los estados 'running' a 'idle' al iniciar la aplicacion.
 * Previene estados huerfanos de syncs que se interrumpieron.
 */
export async function resetStaleStates(): Promise<number> {
  try {
    const db = getDatabase();

    // Find all rows currently stuck in 'running'
    const staleStates = await db
      .select()
      .from(syncState)
      .where(eq(syncState.status, 'running'));

    if (staleStates.length === 0) {
      return 0;
    }

    // Reset them to idle
    await db
      .update(syncState)
      .set({
        status: 'idle',
        errorMessage: 'Reset on startup (was stuck in running)',
        updatedAt: new Date().toISOString(),
      })
      .where(eq(syncState.status, 'running'));

    logger.info(
      { count: staleStates.length, queryIds: staleStates.map(s => s.queryId) },
      'Stale running states reset to idle on startup'
    );

    return staleStates.length;
  } catch (error) {
    logger.error(error, 'Error resetting stale sync states');
    throw error;
  }
}
