/**
 * Repositorio para la tabla `retry_queue`
 * Gestión de la cola de reintentos para envíos fallidos
 */

import { eq, and, lte } from 'drizzle-orm';
import { getDatabase } from '../index.js';
import { retryQueue, type RetryQueueItem, type NewRetryQueueItem } from '../schema.js';
import { logger } from '../../utils/logger.js';
import { calculateNextRetry } from '../../utils/helpers.js';
import { RETRY_CONFIG } from '../../config/constants.js';
import { RetryStatus } from '../../types/common.js';
import type { EntityType } from '../../types/common.js';

/**
 * Obtiene un item de la cola por ID
 */
export async function getRetryQueueItem(id: number): Promise<RetryQueueItem | null> {
  try {
    const db = getDatabase();
    const result = await db
      .select()
      .from(retryQueue)
      .where(eq(retryQueue.id, id))
      .limit(1);
    return result[0] ?? null;
  } catch (error) {
    logger.error(error, `Error al obtener item de retry queue: ${id}`);
    throw error;
  }
}

/**
 * Obtiene todos los items pendientes de reintento
 * (status = 'pending' y next_retry_at <= now)
 */
export async function getPendingRetries(): Promise<RetryQueueItem[]> {
  try {
    const db = getDatabase();
    const now = new Date().toISOString();

    const result = await db
      .select()
      .from(retryQueue)
      .where(
        and(eq(retryQueue.status, 'pending'), lte(retryQueue.nextRetryAt, now))
      );

    return result;
  } catch (error) {
    logger.error(error, 'Error al obtener reintentos pendientes');
    throw error;
  }
}

/**
 * Obtiene todos los items de la cola
 */
export async function getAllRetryItems(): Promise<RetryQueueItem[]> {
  try {
    const db = getDatabase();
    const result = await db.select().from(retryQueue);
    return result;
  } catch (error) {
    logger.error(error, 'Error al obtener todos los items de retry queue');
    throw error;
  }
}

/**
 * Obtiene todos los items por estado
 */
export async function getRetryItemsByStatus(status: RetryStatus): Promise<RetryQueueItem[]> {
  try {
    const db = getDatabase();
    const result = await db.select().from(retryQueue).where(eq(retryQueue.status, status));
    return result;
  } catch (error) {
    logger.error(error, `Error al obtener items con status: ${status}`);
    throw error;
  }
}

/**
 * Obtiene todos los items de una entidad
 */
export async function getRetryItemsByEntity(entityType: EntityType): Promise<RetryQueueItem[]> {
  try {
    const db = getDatabase();
    const result = await db
      .select()
      .from(retryQueue)
      .where(eq(retryQueue.entityType, entityType));
    return result;
  } catch (error) {
    logger.error(error, `Error al obtener retry items de entidad: ${entityType}`);
    throw error;
  }
}

/**
 * Agrega un batch fallido a la cola de reintentos
 */
export async function addToQueue(data: {
  entityType: EntityType;
  payload: unknown;
  error: string;
}): Promise<number> {
  try {
    const db = getDatabase();

    // Calcular próximo reintento (primer intento = índice 0)
    const nextRetry = calculateNextRetry(0, RETRY_CONFIG.BACKOFF_SCHEDULE);

    const newItem: NewRetryQueueItem = {
      entityType: data.entityType,
      payload: JSON.stringify(data.payload),
      attemptCount: 0,
      maxAttempts: RETRY_CONFIG.MAX_ATTEMPTS,
      lastError: data.error,
      nextRetryAt: nextRetry.toISOString(),
      status: 'pending',
    };

    const result = await db.insert(retryQueue).values(newItem).returning();
    const insertedId = result[0]?.id;

    if (!insertedId) {
      throw new Error('No se pudo obtener el ID del item de retry queue');
    }

    logger.info(
      `Item agregado a retry queue: ${data.entityType} (ID: ${insertedId}, próximo retry: ${nextRetry.toISOString()})`
    );
    return insertedId;
  } catch (error) {
    logger.error(error, 'Error al agregar item a retry queue');
    throw error;
  }
}

/**
 * Incrementa el contador de intentos y recalcula next_retry_at
 */
export async function incrementAttempt(id: number, error?: string): Promise<void> {
  try {
    const db = getDatabase();

    // Obtener item actual
    const item = await getRetryQueueItem(id);
    if (!item) {
      throw new Error(`Retry queue item no encontrado: ${id}`);
    }

    const currentAttemptCount = item.attemptCount ?? 0;
    const maxAttempts = item.maxAttempts ?? RETRY_CONFIG.MAX_ATTEMPTS;
    const newAttemptCount = currentAttemptCount + 1;

    // Verificar si se alcanzó el máximo
    if (newAttemptCount >= maxAttempts) {
      // Marcar como failed permanentemente
      await db
        .update(retryQueue)
        .set({
          attemptCount: newAttemptCount,
          status: RetryStatus.FAILED,
          lastError: error ?? item.lastError,
          updatedAt: new Date().toISOString(),
        })
        .where(eq(retryQueue.id, id));

      logger.warn(
        `Retry queue item marcado como fallido después de ${newAttemptCount} intentos: ID ${id}`
      );
    } else {
      // Calcular próximo reintento
      const nextRetry = calculateNextRetry(newAttemptCount, RETRY_CONFIG.BACKOFF_SCHEDULE);

      await db
        .update(retryQueue)
        .set({
          attemptCount: newAttemptCount,
          status: RetryStatus.PENDING,
          lastError: error ?? item.lastError,
          nextRetryAt: nextRetry.toISOString(),
          updatedAt: new Date().toISOString(),
        })
        .where(eq(retryQueue.id, id));

      logger.info(
        `Retry incrementado: ID ${id}, intento ${newAttemptCount}/${maxAttempts}, próximo retry: ${nextRetry.toISOString()}`
      );
    }
  } catch (error) {
    logger.error(error, `Error al incrementar attempt de retry queue: ${id}`);
    throw error;
  }
}

/**
 * Actualiza el estado de un item
 */
export async function updateRetryStatus(
  id: number,
  status: RetryStatus,
  error?: string
): Promise<void> {
  try {
    const db = getDatabase();

    const updateData: Partial<NewRetryQueueItem> & { updatedAt: string } = {
      status,
      updatedAt: new Date().toISOString(),
    };

    if (error !== undefined) {
      updateData.lastError = error;
    }

    await db.update(retryQueue).set(updateData).where(eq(retryQueue.id, id));

    logger.info(`Retry status actualizado: ID ${id} → ${status}`);
  } catch (error) {
    logger.error(error, `Error al actualizar status de retry queue: ${id}`);
    throw error;
  }
}

/**
 * Marca un item como en procesamiento
 */
export async function markAsProcessing(id: number): Promise<void> {
  await updateRetryStatus(id, RetryStatus.PROCESSING);
}

/**
 * Marca un item como exitoso y lo elimina
 */
export async function markAsSuccess(id: number): Promise<void> {
  try {
    const db = getDatabase();
    await db.delete(retryQueue).where(eq(retryQueue.id, id));
    logger.info(`Retry exitoso, item eliminado: ID ${id}`);
  } catch (error) {
    logger.error(error, `Error al marcar retry como exitoso: ${id}`);
    throw error;
  }
}

/**
 * Elimina un item de la cola
 */
export async function deleteRetryItem(id: number): Promise<void> {
  try {
    const db = getDatabase();
    await db.delete(retryQueue).where(eq(retryQueue.id, id));
    logger.info(`Retry item eliminado: ID ${id}`);
  } catch (error) {
    logger.error(error, `Error al eliminar retry item: ${id}`);
    throw error;
  }
}

/**
 * Elimina todos los items fallidos permanentemente
 */
export async function deleteFailedItems(): Promise<number> {
  try {
    const db = getDatabase();
    const items = await getRetryItemsByStatus(RetryStatus.FAILED);
    const count = items.length;

    await db.delete(retryQueue).where(eq(retryQueue.status, RetryStatus.FAILED));

    logger.info(`Items fallidos eliminados: ${count}`);
    return count;
  } catch (error) {
    logger.error(error, 'Error al eliminar items fallidos');
    throw error;
  }
}

/**
 * Reinicia un item fallido (volver a pending con attempt_count = 0)
 */
export async function resetRetryItem(id: number): Promise<void> {
  try {
    const db = getDatabase();

    const nextRetry = calculateNextRetry(0, RETRY_CONFIG.BACKOFF_SCHEDULE);

    await db
      .update(retryQueue)
      .set({
        attemptCount: 0,
        status: RetryStatus.PENDING,
        nextRetryAt: nextRetry.toISOString(),
        lastError: null,
        updatedAt: new Date().toISOString(),
      })
      .where(eq(retryQueue.id, id));

    logger.info(`Retry item reiniciado: ID ${id}`);
  } catch (error) {
    logger.error(error, `Error al reiniciar retry item: ${id}`);
    throw error;
  }
}

/**
 * Obtiene el payload desserializado de un item
 */
export async function getRetryPayload<T = unknown>(id: number): Promise<T> {
  const item = await getRetryQueueItem(id);

  if (!item) {
    throw new Error(`Retry queue item no encontrado: ${id}`);
  }

  return JSON.parse(item.payload) as T;
}

/**
 * Cuenta items por estado
 */
export async function countByStatus(status: RetryStatus): Promise<number> {
  const items = await getRetryItemsByStatus(status);
  return items.length;
}
