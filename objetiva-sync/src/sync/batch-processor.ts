/**
 * BatchProcessor - Procesa datos en batches con manejo de errores
 * ACTUALIZADO con confirmación obligatoria y reintentos automáticos
 */

import { chunk } from '../utils/helpers.js';
import { logger } from '../utils/logger.js';
import { saveBatch } from '../utils/batch-storage.js';
import type { BatchResult } from '../types/common.js';
import { syncStateManager } from './sync-state-manager.js';

/**
 * Función de procesamiento de batch
 */
export type BatchProcessorFn<T> = (
  batch: T[],
  batchInfo: {
    batchNumber: number;
    totalBatches: number;
  }
) => Promise<BatchResult>;

/**
 * Política de confirmación de lotes
 */
export type BatchConfirmationPolicy = 'strict' | 'lenient';

/**
 * Opciones de procesamiento
 */
export interface BatchProcessorOptions {
  /**
   * Tamaño de cada batch
   */
  batchSize: number;

  /**
   * Si true, continúa procesando aunque falle un batch
   */
  continueOnError?: boolean;

  /**
   * Política de confirmación de lotes
   * - 'strict': Lote confirmado solo si 100% de registros OK (default)
   * - 'lenient': Lote confirmado si al menos 1 registro OK
   */
  confirmationPolicy?: BatchConfirmationPolicy;

  /**
   * Habilitar reintentos automáticos con backoff exponencial
   * Default: true
   */
  enableRetries?: boolean;

  /**
   * Número máximo de reintentos por batch (default: 3)
   */
  maxRetries?: number;

  /**
   * Callback para reportar progreso
   */
  onProgress?: (progress: BatchProgress) => void;

  /**
   * Delay en ms entre batches (para rate limiting)
   */
  delayBetweenBatches?: number;

  /**
   * ID del log para guardar los lotes
   */
  logId?: number;

  /**
   * Si true, guarda cada lote en archivo JSON
   */
  saveBatches?: boolean;
}

/**
 * Progreso de procesamiento
 */
export interface BatchProgress {
  currentBatch: number;
  totalBatches: number;
  processedItems: number;
  totalItems: number;
  successfulItems: number;
  failedItems: number;
  percentage: number;
  estimatedTimeRemaining: number | null;
  elapsedTime: number;
}

/**
 * Resultado de procesamiento de múltiples batches
 */
export interface BatchProcessorResult extends BatchResult {
  totalBatches: number;
  successfulBatches: number;
  failedBatches: number;
  partialBatches: number;
}

/**
 * Verifica si un lote fue confirmado según la política
 */
function isBatchConfirmed(batchResult: BatchResult, policy: BatchConfirmationPolicy = 'strict'): boolean {
  switch (policy) {
    case 'strict':
      // 100% de registros procesados sin errores
      return batchResult.success && batchResult.errors.length === 0;

    case 'lenient':
      // Al menos 1 registro procesado exitosamente
      return (batchResult.inserted + batchResult.updated) > 0;

    default:
      return false;
  }
}

/**
 * Procesa items en batches con confirmación obligatoria
 */
export async function processBatches<T>(
  items: T[],
  processFn: BatchProcessorFn<T>,
  options: BatchProcessorOptions
): Promise<BatchProcessorResult> {
  const startTime = Date.now();

  // Configuración por defecto
  const confirmationPolicy = options.confirmationPolicy || 'strict';
  const enableRetries = options.enableRetries !== false; // Default: true
  const maxRetries = options.maxRetries || 3;

  logger.info(
    {
      itemCount: items.length,
      batchSize: options.batchSize,
      confirmationPolicy,
      enableRetries,
      maxRetries: enableRetries ? maxRetries : 0
    },
    '[BatchProcessor] Iniciando procesamiento en batches...'
  );

  // Dividir en batches
  const batches = chunk(items, options.batchSize);
  const totalBatches = batches.length;

  // Resultado acumulado
  const result: BatchProcessorResult = {
    success: true,
    inserted: 0,
    updated: 0,
    errors: [],
    totalBatches,
    successfulBatches: 0,
    failedBatches: 0,
    partialBatches: 0,
  };

  // Procesar cada batch
  for (let i = 0; i < batches.length; i++) {
    const batch = batches[i];
    if (!batch) continue;

    // ✅ CHECKPOINT 1: Verificar cancelación ANTES de procesar lote
    const currentSync = syncStateManager.getCurrentSync();
    const isCanceled = currentSync && currentSync.status === 'canceled';

    if (isCanceled) {
      logger.warn('[BatchProcessor] ⚠️ SYNC CANCELADO - Deteniendo procesamiento de lotes');
      result.success = false;
      result.errors.push({
        index: i,
        identifier: 'sync-cancelation',
        error: 'Sincronización cancelada por el usuario',
        code: 'SYNC_CANCELED'
      });
      break;
    }

    const batchNumber = i + 1;

    try {
      logger.debug(
        { batchNumber, totalBatches, batchSize: batch.length },
        `[BatchProcessor] Procesando batch ${batchNumber}/${totalBatches}...`
      );

      // Procesar batch (con o sin retry según configuración)
      let batchResult: BatchResult;

      if (enableRetries) {
        // ✅ CORRECCIÓN: Usar retry con backoff exponencial
        batchResult = await processBatchWithRetry(
          batch,
          processFn,
          {
            batchNumber,
            totalBatches
          },
          maxRetries
        );
      } else {
        // Sin retry
        batchResult = await processFn(batch, {
          batchNumber,
          totalBatches,
        });
      }

      // ✅ CHECKPOINT 2: Verificar si el batch fue cancelado
      const hasCancelError = batchResult.errors.some(e => e.code === 'SYNC_CANCELED');
      if (hasCancelError) {
        logger.warn('[BatchProcessor] Batch cancelado - deteniendo procesamiento inmediatamente');
        result.failedBatches++;
        result.success = false;
        result.errors.push(...batchResult.errors);
        break; // ABORTAR INMEDIATAMENTE - No importa continueOnError
      }

      // ✅ CHECKPOINT 3: Verificar confirmación de lote
      const isConfirmed = isBatchConfirmed(batchResult, confirmationPolicy);

      if (!isConfirmed) {
        // Lote NO confirmado
        logger.error(
          {
            batchNumber,
            totalBatches,
            policy: confirmationPolicy,
            inserted: batchResult.inserted,
            updated: batchResult.updated,
            errors: batchResult.errors.length
          },
          `[BatchProcessor] ❌ Lote ${batchNumber} NO confirmado según política '${confirmationPolicy}'`
        );

        // Marcar como fallido
        result.failedBatches++;
        result.success = false;

        // Acumular errores
        result.errors.push(...batchResult.errors);

        // DECISIÓN: ¿Abortar o continuar?
        if (!options.continueOnError) {
          logger.warn(
            { batchNumber, totalBatches },
            '[BatchProcessor] ⚠️ Abortando sincronización - lote no confirmado y continueOnError=false'
          );
          break; // ABORTAR
        } else {
          logger.warn(
            { batchNumber, totalBatches },
            '[BatchProcessor] ⚠️ Continuando con siguiente lote - continueOnError=true'
          );
          continue; // CONTINUAR con siguiente lote
        }
      }

      // ✅ Lote confirmado - Acumular resultados
      result.inserted += batchResult.inserted;
      result.updated += batchResult.updated;
      result.errors.push(...batchResult.errors);

      // Guardar lote en archivo si está habilitado
      if (options.saveBatches && options.logId) {
        try {
          await saveBatch(options.logId, batchNumber, batch);
        } catch (error) {
          logger.error(
            { logId: options.logId, batchNumber, error },
            '[BatchProcessor] Error al guardar lote en archivo'
          );
        }
      }

      // Clasificar resultado del batch
      if (batchResult.errors.length === 0) {
        result.successfulBatches++;
        logger.info(
          { batchNumber, totalBatches, inserted: batchResult.inserted, updated: batchResult.updated },
          `[BatchProcessor] ✅ Lote ${batchNumber}/${totalBatches} confirmado (100% exitoso)`
        );
      } else if (batchResult.errors.length < batch.length) {
        result.partialBatches++;
        logger.warn(
          { batchNumber, totalBatches, inserted: batchResult.inserted, updated: batchResult.updated, failed: batchResult.errors.length },
          `[BatchProcessor] ⚠️ Lote ${batchNumber}/${totalBatches} confirmado (parcial)`
        );
      }

      // Reportar progreso
      if (options.onProgress) {
        const elapsedTime = (Date.now() - startTime) / 1000; // en segundos
        const processedItems = Math.min((i + 1) * options.batchSize, items.length);
        const percentage = (processedItems / items.length) * 100;

        // Calcular tiempo estimado restante
        let estimatedTimeRemaining: number | null = null;
        if (processedItems > 0 && processedItems < items.length) {
          const avgTimePerItem = elapsedTime / processedItems;
          const remainingItems = items.length - processedItems;
          estimatedTimeRemaining = Math.ceil(avgTimePerItem * remainingItems);
        }

        const progress: BatchProgress = {
          currentBatch: batchNumber,
          totalBatches,
          processedItems,
          totalItems: items.length,
          successfulItems: result.inserted + result.updated,
          failedItems: result.errors.length,
          percentage,
          estimatedTimeRemaining,
          elapsedTime,
        };
        options.onProgress(progress);
      }

      // ✅ CHECKPOINT 4: Verificar cancelación DESPUÉS de procesar el lote
      // Esto evita que se envíe el siguiente lote si se canceló durante el procesamiento
      const currentSync3 = syncStateManager.getCurrentSync();
      const isCanceled3 = currentSync3 && currentSync3.status === 'canceled';

      if (isCanceled3) {
        logger.warn('[BatchProcessor] ⚠️ SYNC CANCELADO - Deteniendo antes del siguiente lote');
        result.success = false;
        result.errors.push({
          index: i,
          identifier: 'sync-cancelation-post',
          error: 'Sincronización cancelada por el usuario',
          code: 'SYNC_CANCELED'
        });
        break;
      }

      // Delay entre batches si está configurado
      if (options.delayBetweenBatches && i < batches.length - 1) {
        await sleep(options.delayBetweenBatches);
      }

    } catch (error) {
      logger.error(
        { batchNumber, error },
        `[BatchProcessor] ❌ Error al procesar batch ${batchNumber}`
      );

      result.failedBatches++;
      result.success = false;

      // Agregar error genérico del batch
      result.errors.push({
        index: i * options.batchSize,
        identifier: `BATCH_${batchNumber}`,
        error: error instanceof Error ? error.message : String(error),
        code: 'BATCH_PROCESSING_ERROR',
      });

      // Si no continuar en error, detener
      if (!options.continueOnError) {
        logger.warn(
          { batchNumber },
          '[BatchProcessor] ⚠️ Deteniendo procesamiento por error crítico'
        );
        break;
      }
    }
  }

  const durationMs = Date.now() - startTime;

  logger.info(
    {
      totalBatches: result.totalBatches,
      successful: result.successfulBatches,
      failed: result.failedBatches,
      partial: result.partialBatches,
      inserted: result.inserted,
      updated: result.updated,
      errors: result.errors.length,
      durationMs,
    },
    `[BatchProcessor] ${result.success ? '✅' : '⚠️'} Procesamiento completado`
  );

  return result;
}

/**
 * Procesa un solo batch con retry y backoff exponencial
 * ✅ MEJORADO: Ahora acepta batchInfo y usa backoff exponencial correcto
 */
export async function processBatchWithRetry<T>(
  batch: T[],
  processFn: BatchProcessorFn<T>,
  batchInfo: {
    batchNumber: number;
    totalBatches: number;
  },
  maxRetries: number = 3
): Promise<BatchResult> {
  let lastError: Error | null = null;

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    // ✅ CHECKPOINT CRÍTICO: Verificar cancelación al INICIO de cada intento
    const currentSync = syncStateManager.getCurrentSync();
    const isCanceled = currentSync && currentSync.status === 'canceled';

    if (isCanceled) {
      logger.warn(
        { attempt, batchNumber: batchInfo.batchNumber },
        `[BatchProcessor] ⚠️ SYNC CANCELADO - Abortando intento ${attempt}/${maxRetries}`
      );
      return {
        success: false,
        inserted: 0,
        updated: 0,
        errors: [{
          index: -1,
          identifier: 'BATCH_RETRY_CANCELED',
          error: 'Sincronización cancelada durante reintentos',
          code: 'SYNC_CANCELED'
        }]
      };
    }

    try {
      logger.debug(
        { attempt, maxRetries, batchNumber: batchInfo.batchNumber },
        `[BatchProcessor] Intento ${attempt}/${maxRetries} para batch ${batchInfo.batchNumber}...`
      );

      const result = await processFn(batch, batchInfo);

      // ✅ Success (200 OK, todos los registros procesados)
      if (result.success && result.errors.length === 0) {
        if (attempt > 1) {
          logger.info(
            { attempt, batchNumber: batchInfo.batchNumber },
            `[BatchProcessor] ✅ Batch exitoso después de ${attempt} intentos`
          );
        }
        return result;
      }

      // ⚠️ Partial success (algunos registros procesados)
      if (result.inserted + result.updated > 0) {
        logger.warn(
          { attempt, batchNumber: batchInfo.batchNumber, inserted: result.inserted, updated: result.updated, failed: result.errors.length },
          `[BatchProcessor] ⚠️ Batch parcial en intento ${attempt}`
        );
        // Retornar resultado parcial (no reintentar)
        return result;
      }

      // ❌ Error total - todos los registros fallaron
      lastError = new Error(`Batch falló: ${result.errors.length} errores`);

      // Si es el último intento, retornar el resultado con errores
      if (attempt === maxRetries) {
        logger.warn(
          { attempt, batchNumber: batchInfo.batchNumber },
          `[BatchProcessor] ❌ Todos los intentos fallaron para batch ${batchInfo.batchNumber}`
        );
        return result;
      }

      // ✅ CHECKPOINT CRÍTICO: Verificar cancelación ANTES de reintentar
      const currentSync2 = syncStateManager.getCurrentSync();
      const isCanceled2 = currentSync2 && currentSync2.status === 'canceled';

      if (isCanceled2) {
        logger.warn(
          { attempt, batchNumber: batchInfo.batchNumber },
          '[BatchProcessor] ⚠️ SYNC CANCELADO - Abortando reintentos'
        );
        return {
          success: false,
          inserted: 0,
          updated: 0,
          errors: [{
            index: -1,
            identifier: 'BATCH_RETRY_CANCELED',
            error: 'Sincronización cancelada durante reintentos',
            code: 'SYNC_CANCELED'
          }]
        };
      }

    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));

      logger.warn(
        { attempt, maxRetries, batchNumber: batchInfo.batchNumber, error: lastError.message },
        `[BatchProcessor] ⚠️ Intento ${attempt} falló`
      );

      // ❌ No reintentar errores 4xx (client errors)
      if (lastError.message.includes('HTTP 4')) {
        logger.error(
          { batchNumber: batchInfo.batchNumber, error: lastError.message },
          '[BatchProcessor] ❌ Error 4xx detectado - no se reintentará'
        );
        throw lastError;
      }

      // Si no es el último intento, esperar antes de reintentar
      if (attempt < maxRetries) {
        // ✅ Backoff exponencial: 2s, 4s, 8s
        const delayMs = Math.pow(2, attempt) * 1000;
        logger.info(
          { attempt, delayMs, batchNumber: batchInfo.batchNumber },
          `[BatchProcessor] Esperando ${delayMs}ms antes de reintentar...`
        );
        await sleep(delayMs);
        continue;
      }
    }
  }

  // Si llegamos aquí, todos los intentos fallaron
  return {
    success: false,
    inserted: 0,
    updated: 0,
    errors: [
      {
        index: -1,
        identifier: 'BATCH_RETRY_FAILED',
        error: lastError?.message ?? 'Todos los intentos fallaron',
        code: 'MAX_RETRIES_EXCEEDED',
      },
    ],
  };
}

/**
 * Divide un batch grande en sub-batches más pequeños
 */
export function createSubBatches<T>(
  items: T[],
  minBatchSize: number,
  maxBatchSize: number
): T[][] {
  if (items.length <= maxBatchSize) {
    return [items];
  }

  // Calcular tamaño óptimo de batch
  const optimalSize = Math.ceil(items.length / Math.ceil(items.length / maxBatchSize));
  const batchSize = Math.max(minBatchSize, Math.min(optimalSize, maxBatchSize));

  return chunk(items, batchSize);
}

/**
 * Calcula estadísticas de un BatchResult
 */
export function calculateBatchStats(result: BatchResult): {
  successRate: number;
  failureRate: number;
  totalProcessed: number;
} {
  const totalProcessed = result.inserted + result.updated + result.errors.length;
  const successful = result.inserted + result.updated;

  return {
    successRate: totalProcessed > 0 ? (successful / totalProcessed) * 100 : 0,
    failureRate: totalProcessed > 0 ? (result.errors.length / totalProcessed) * 100 : 0,
    totalProcessed,
  };
}

/**
 * Combina múltiples BatchResults en uno solo
 */
export function mergeBatchResults(results: BatchResult[]): BatchResult {
  const merged: BatchResult = {
    success: true,
    inserted: 0,
    updated: 0,
    errors: [],
  };

  for (const result of results) {
    merged.inserted += result.inserted;
    merged.updated += result.updated;
    merged.errors.push(...result.errors);

    if (!result.success) {
      merged.success = false;
    }
  }

  return merged;
}

/**
 * Función auxiliar de sleep
 */
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
