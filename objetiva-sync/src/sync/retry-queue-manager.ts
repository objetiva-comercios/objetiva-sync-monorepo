/**
 * RetryQueueManager - Gestiona la cola de reintentos para envíos fallidos
 */

import { RetryStatus } from '../types/common.js';
import type { EntityType, SyncType } from '../types/common.js';
import * as RetryQueueRepo from '../store/repositories/retry-queue-repo.js';
import type { RetryQueueItem } from '../store/schema.js';
import { logger } from '../utils/logger.js';

/**
 * Opciones para agregar a la cola de reintentos
 */
export interface AddToRetryQueueOptions {
  entityType: EntityType;
  syncType: SyncType;
  payload: unknown;
  error: string;
  maxAttempts?: number;
}

/**
 * Resultado de procesamiento de reintentos
 */
export interface RetryProcessResult {
  processed: number;
  successful: number;
  failed: number;
  skipped: number;
}

/**
 * Función de procesamiento de reintento
 */
export type RetryProcessorFn = (item: RetryQueueItem) => Promise<{
  success: boolean;
  error?: string;
}>;

/**
 * Clase para gestionar la cola de reintentos
 */
export class RetryQueueManager {
  /**
   * Agrega un item fallido a la cola de reintentos
   */
  async addFailedBatch(options: AddToRetryQueueOptions): Promise<number> {
    try {
      logger.info(
        { entityType: options.entityType, syncType: options.syncType },
        '[RetryQueueManager] Agregando batch fallido a cola de reintentos...'
      );

      const itemId = await RetryQueueRepo.addToQueue({
        entityType: options.entityType,
        payload: options.payload,
        error: options.error,
      });

      logger.info({ itemId }, '[RetryQueueManager] ✅ Item agregado a cola de reintentos');

      return itemId;
    } catch (error) {
      logger.error(
        { error, options },
        '[RetryQueueManager] ❌ Error al agregar a cola de reintentos'
      );
      throw error;
    }
  }

  /**
   * Procesa todos los reintentos pendientes que están listos
   */
  async processRetries(processFn: RetryProcessorFn): Promise<RetryProcessResult> {
    const result: RetryProcessResult = {
      processed: 0,
      successful: 0,
      failed: 0,
      skipped: 0,
    };

    try {
      logger.info('[RetryQueueManager] Buscando reintentos pendientes...');

      // Obtener items pendientes que están listos para reintentar
      const pendingItems = await RetryQueueRepo.getPendingRetries();

      if (pendingItems.length === 0) {
        logger.info('[RetryQueueManager] No hay reintentos pendientes');
        return result;
      }

      logger.info(
        { count: pendingItems.length },
        `[RetryQueueManager] Procesando ${pendingItems.length} reintentos...`
      );

      // Procesar cada item
      for (const item of pendingItems) {
        try {
          // Marcar como en procesamiento
          await RetryQueueRepo.markAsProcessing(item.id);

          // Procesar el reintento
          const processResult = await processFn(item);

          result.processed++;

          if (processResult.success) {
            // Marcar como exitoso
            await RetryQueueRepo.markAsSuccess(item.id);
            result.successful++;

            logger.info(
              { itemId: item.id, entityType: item.entityType },
              '[RetryQueueManager] ✅ Reintento exitoso'
            );
          } else {
            // Incrementar contador de intentos
            await RetryQueueRepo.incrementAttempt(item.id, processResult.error);

            // Verificar si alcanzó el máximo de intentos
            const updatedItem = await RetryQueueRepo.getRetryQueueItem(item.id);

            if (!updatedItem) {
              result.failed++;
              logger.error({ itemId: item.id }, '[RetryQueueManager] ❌ Item no encontrado después de actualizar');
              continue;
            }

            const currentAttempts = updatedItem.attemptCount ?? 0;
            const maxAttempts = updatedItem.maxAttempts ?? 5;

            if (currentAttempts >= maxAttempts) {
              result.failed++;
              logger.error(
                { itemId: item.id, attempts: currentAttempts },
                '[RetryQueueManager] ❌ Reintento falló permanentemente (máximo de intentos alcanzado)'
              );
            } else {
              result.skipped++;
              logger.warn(
                { itemId: item.id, attempts: currentAttempts, maxAttempts },
                '[RetryQueueManager] ⚠️ Reintento falló, se reintentará más tarde'
              );
            }
          }
        } catch (error) {
          result.failed++;

          logger.error(
            { itemId: item.id, error },
            '[RetryQueueManager] ❌ Error al procesar reintento'
          );

          // Intentar incrementar el contador de intentos
          try {
            await RetryQueueRepo.incrementAttempt(
              item.id,
              error instanceof Error ? error.message : String(error)
            );
          } catch (updateError) {
            logger.error(
              { itemId: item.id, updateError },
              '[RetryQueueManager] ❌ Error al actualizar estado de reintento'
            );
          }
        }
      }

      logger.info(
        {
          total: pendingItems.length,
          processed: result.processed,
          successful: result.successful,
          failed: result.failed,
          skipped: result.skipped,
        },
        '[RetryQueueManager] ✅ Procesamiento de reintentos completado'
      );

      return result;
    } catch (error) {
      logger.error(
        { error },
        '[RetryQueueManager] ❌ Error al procesar reintentos'
      );
      throw error;
    }
  }

  /**
   * Obtiene todos los items pendientes (incluyendo los no listos)
   */
  async getAllPendingItems(): Promise<RetryQueueItem[]> {
    return await RetryQueueRepo.getRetryItemsByStatus(RetryStatus.PENDING);
  }

  /**
   * Obtiene todos los items fallidos permanentemente
   */
  async getFailedItems(): Promise<RetryQueueItem[]> {
    return await RetryQueueRepo.getRetryItemsByStatus(RetryStatus.FAILED);
  }

  /**
   * Obtiene items por tipo de entidad
   */
  async getItemsByEntity(entityType: EntityType): Promise<RetryQueueItem[]> {
    return await RetryQueueRepo.getRetryItemsByEntity(entityType);
  }

  /**
   * Reintenta manualmente un item específico
   */
  async retryItem(itemId: number, processFn: RetryProcessorFn): Promise<boolean> {
    try {
      const item = await RetryQueueRepo.getRetryQueueItem(itemId);

      if (!item) {
        throw new Error(`Item no encontrado: ${itemId}`);
      }

      logger.info(
        { itemId, entityType: item.entityType },
        '[RetryQueueManager] Reintentando item manualmente...'
      );

      // Marcar como en procesamiento
      await RetryQueueRepo.markAsProcessing(itemId);

      // Procesar
      const result = await processFn(item);

      if (result.success) {
        await RetryQueueRepo.markAsSuccess(itemId);
        logger.info({ itemId }, '[RetryQueueManager] ✅ Reintento manual exitoso');
        return true;
      } else {
        await RetryQueueRepo.incrementAttempt(itemId, result.error);
        logger.warn(
          { itemId, error: result.error },
          '[RetryQueueManager] ⚠️ Reintento manual falló'
        );
        return false;
      }
    } catch (error) {
      logger.error(
        { itemId, error },
        '[RetryQueueManager] ❌ Error al reintentar item manualmente'
      );

      try {
        await RetryQueueRepo.incrementAttempt(
          itemId,
          error instanceof Error ? error.message : String(error)
        );
      } catch (updateError) {
        // Ignorar error al actualizar
      }

      return false;
    }
  }

  /**
   * Reinicia un item fallido (resetea contador de intentos)
   */
  async resetItem(itemId: number): Promise<void> {
    try {
      logger.info({ itemId }, '[RetryQueueManager] Reseteando item...');

      await RetryQueueRepo.resetRetryItem(itemId);

      logger.info({ itemId }, '[RetryQueueManager] ✅ Item reseteado');
    } catch (error) {
      logger.error(
        { itemId, error },
        '[RetryQueueManager] ❌ Error al resetear item'
      );
      throw error;
    }
  }

  /**
   * Elimina un item de la cola
   */
  async deleteItem(itemId: number): Promise<void> {
    try {
      logger.info({ itemId }, '[RetryQueueManager] Eliminando item...');

      await RetryQueueRepo.deleteRetryItem(itemId);

      logger.info({ itemId }, '[RetryQueueManager] ✅ Item eliminado');
    } catch (error) {
      logger.error(
        { itemId, error },
        '[RetryQueueManager] ❌ Error al eliminar item'
      );
      throw error;
    }
  }

  /**
   * Limpia items exitosos antiguos
   */
  async cleanupSuccessfulItems(olderThanDays: number = 7): Promise<number> {
    try {
      logger.info(
        { olderThanDays },
        '[RetryQueueManager] Limpiando items exitosos antiguos...'
      );

      const successfulItems = await RetryQueueRepo.getRetryItemsByStatus(RetryStatus.SUCCESS);

      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - olderThanDays);

      let deletedCount = 0;

      for (const item of successfulItems) {
        if (!item.updatedAt) continue;

        const updatedAt = new Date(item.updatedAt);
        if (updatedAt < cutoffDate) {
          await RetryQueueRepo.deleteRetryItem(item.id);
          deletedCount++;
        }
      }

      logger.info(
        { deletedCount },
        `[RetryQueueManager] ✅ ${deletedCount} items exitosos eliminados`
      );

      return deletedCount;
    } catch (error) {
      logger.error(
        { error },
        '[RetryQueueManager] ❌ Error al limpiar items exitosos'
      );
      throw error;
    }
  }

  /**
   * Obtiene estadísticas de la cola de reintentos
   */
  async getStats(): Promise<{
    pending: number;
    processing: number;
    failed: number;
    success: number;
    total: number;
  }> {
    try {
      const [pending, processing, failed, success] = await Promise.all([
        RetryQueueRepo.getRetryItemsByStatus(RetryStatus.PENDING),
        RetryQueueRepo.getRetryItemsByStatus(RetryStatus.PROCESSING),
        RetryQueueRepo.getRetryItemsByStatus(RetryStatus.FAILED),
        RetryQueueRepo.getRetryItemsByStatus(RetryStatus.SUCCESS),
      ]);

      return {
        pending: pending.length,
        processing: processing.length,
        failed: failed.length,
        success: success.length,
        total: pending.length + processing.length + failed.length + success.length,
      };
    } catch (error) {
      logger.error(
        { error },
        '[RetryQueueManager] ❌ Error al obtener estadísticas'
      );
      throw error;
    }
  }
}
