/**
 * SyncEngine - Orquestador principal de sincronización
 * Coordina adaptadores, transformers, API clients y gestión de estado
 */

import type { IDataSourceAdapter } from '../adapters/types.js';
import type { APIClient } from '../api-client/index.js';
import type { IArticuloPayload } from '../types/articulos.js';
import type { IComprobanteCabeceraPayload } from '../types/comprobantes-cabecera.js';
import type { IComprobanteDetallePayload } from '../types/comprobantes-detalle.js';
import type { IComprobantePagosPayload } from '../types/comprobantes-pagos.js';
import { EntityType, SyncType, LogStatus, SyncStatus } from '../types/common.js';
import type { SyncResult } from '../types/common.js';
import * as QueriesRepo from '../store/repositories/queries-repo.js';
import * as SyncStateRepo from '../store/repositories/sync-state-repo.js';
import * as SyncLogsRepo from '../store/repositories/sync-logs-repo.js';
import { validateQueryResult } from './query-validator.js';
import { validateQueryAgainstSchema } from './schema-validator.js';
import { processBatches } from './batch-processor.js';
import type { BatchProcessorOptions } from './batch-processor.js';
import { RetryQueueManager } from './retry-queue-manager.js';
import { syncStateManager } from './sync-state-manager.js';
import { logger } from '../utils/logger.js';
import { SYNC_CONFIG } from '../config/constants.js';

/**
 * Datos de progreso para callbacks
 */
export interface ProgressData {
  entityType: string;
  current: number;
  total: number;
  percentage: number;
  estimatedTimeRemaining: number | null;
  status: string;
  syncType?: string;
  queryId?: number;
}

/**
 * Configuración del motor de sincronización
 */
export interface SyncEngineConfig {
  /**
   * Adaptador de fuente de datos (ERP)
   */
  dataSourceAdapter: IDataSourceAdapter;

  /**
   * Cliente de API remota (optional for scheduler-only initialization)
   */
  apiClient?: APIClient;

  /**
   * Tamaño de batch por defecto
   */
  defaultBatchSize?: number;

  /**
   * Si continuar en caso de error
   */
  continueOnError?: boolean;

  /**
   * Delay entre batches (ms)
   */
  delayBetweenBatches?: number;

  /**
   * Callback para reportar progreso
   */
  onProgress?: (progress: ProgressData) => void;
}

/**
 * Opciones de sincronización
 */
export interface SyncOptions {
  /**
   * Tipo de sincronización
   */
  syncType?: SyncType;

  /**
   * Tamaño de batch (override default)
   */
  batchSize?: number;

  /**
   * Forzar sincronización completa (ignorar lastSync)
   */
  fullSync?: boolean;

  /**
   * Continuar en caso de error
   */
  continueOnError?: boolean;
}

/**
 * Motor de sincronización principal
 */

/**
 * Convert EntityType to PostgreSQL table name (plural form)
 */
function entityTypeToTableName(entityType: string): string {
  const mapping: Record<string, string> = {
    'articulo': 'articulos',
    'comprobante_cabecera': 'comprobantes_cabecera',
    'comprobante_detalle': 'comprobantes_detalle',
    'comprobante_pago': 'comprobantes_pagos',
  };
  return mapping[entityType] || entityType;
}

export class SyncEngine {
  private adapter: IDataSourceAdapter;
  private apiClient!: APIClient;
  private retryQueueManager: RetryQueueManager;
  private config: SyncEngineConfig;

  constructor(config: SyncEngineConfig) {
    this.config = config;
    this.adapter = config.dataSourceAdapter;
    if (config.apiClient) {
      this.apiClient = config.apiClient;
    }
    this.retryQueueManager = new RetryQueueManager();
  }

  /**
   * Helper: Get max value of a field from query results (for incremental sync)
   */
  private getMaxFieldValue(rows: Record<string, unknown>[], fieldName: string): string | null {
    if (rows.length === 0) return null;

    const values = rows
      .map(row => row[fieldName])
      .filter(v => v != null)
      .map(v => String(v));

    if (values.length === 0) return null;

    // Try numeric comparison first (for incrementalType=id), fall back to lexicographic (for dates/strings)
    const numericValues = values.map(Number);
    if (numericValues.every(n => !isNaN(n))) {
      return String(Math.max(...numericValues));
    }
    // Lexicographic sort works for ISO date strings
    return values.sort().reverse()[0] ?? null;
  }
  /**
   * Sincroniza artículos (wrapper para compatibilidad)
   * Utiliza syncQuery internamente, pasando automáticamente metadata
   */
  async syncArticulos(options: SyncOptions = {}): Promise<SyncResult> {
    const query = await QueriesRepo.getActiveQueryByEntity(EntityType.ARTICULO);
    if (!query) {
      throw new Error(`No hay query activa para ${EntityType.ARTICULO}`);
    }
    return await this.syncQuery(query.id, options);
  }

  /**
   * Sincroniza cabeceras de comprobantes (wrapper para compatibilidad)
   * Query opcional: Solo sincroniza si hay query activa configurada
   */
  async syncComprobantesCabecera(options: SyncOptions = {}): Promise<SyncResult> {
    const query = await QueriesRepo.getActiveQueryByEntity(EntityType.COMPROBANTE_CABECERA);
    if (!query) {
      // Query opcional - retornar resultado exitoso sin sincronizar
      logger.info('[SyncEngine] No hay query activa para comprobante_cabecera - omitiendo');
      return {
        entityType: EntityType.COMPROBANTE_CABECERA,
        status: LogStatus.SUCCESS,
        recordsFetched: 0,
        recordsSent: 0,
        recordsFailed: 0,
        durationMs: 0,
      };
    }
    return await this.syncQuery(query.id, options);
  }

  /**
   * Sincroniza detalles de comprobantes (wrapper para compatibilidad)
   * Query opcional: No todos los comprobantes tienen detalles de artículos
   */
  async syncComprobantesDetalle(options: SyncOptions = {}): Promise<SyncResult> {
    const query = await QueriesRepo.getActiveQueryByEntity(EntityType.COMPROBANTE_DETALLE);
    if (!query) {
      // Query opcional - retornar resultado exitoso sin sincronizar
      logger.info('[SyncEngine] No hay query activa para comprobante_detalle - omitiendo');
      return {
        entityType: EntityType.COMPROBANTE_DETALLE,
        status: LogStatus.SUCCESS,
        recordsFetched: 0,
        recordsSent: 0,
        recordsFailed: 0,
        durationMs: 0,
      };
    }
    return await this.syncQuery(query.id, options);
  }

  /**
   * Sincroniza pagos de comprobantes (wrapper para compatibilidad)
   * Query opcional: No todos los comprobantes tienen pagos asociados
   */
  async syncComprobantesPago(options: SyncOptions = {}): Promise<SyncResult> {
    const query = await QueriesRepo.getActiveQueryByEntity(EntityType.COMPROBANTE_PAGO);
    if (!query) {
      // Query opcional - retornar resultado exitoso sin sincronizar
      logger.info('[SyncEngine] No hay query activa para comprobante_pago - omitiendo');
      return {
        entityType: EntityType.COMPROBANTE_PAGO,
        status: LogStatus.SUCCESS,
        recordsFetched: 0,
        recordsSent: 0,
        recordsFailed: 0,
        durationMs: 0,
      };
    }
    return await this.syncQuery(query.id, options);
  }

  /**
   * Sincroniza todas las entidades
   */
  async syncAll(options: SyncOptions = {}): Promise<SyncResult[]> {
    logger.info('[SyncEngine] Iniciando sincronización completa de todas las entidades...');

    const results: SyncResult[] = [];

    try {
      // Sincronizar en orden: artículos → comprobantes (cabecera → detalle → pagos)
      const articulosResult = await this.syncArticulos(options);
      results.push(articulosResult);

      // Sincronizar comprobantes atomizados
      const cabeceraResult = await this.syncComprobantesCabecera(options);
      results.push(cabeceraResult);

      const detalleResult = await this.syncComprobantesDetalle(options);
      results.push(detalleResult);

      const pagosResult = await this.syncComprobantesPago(options);
      results.push(pagosResult);

      const totalSuccess = results.filter((r) => r.status === LogStatus.SUCCESS).length;
      const totalFailed = results.filter((r) => r.status === LogStatus.FAILED).length;

      logger.info(
        { totalSuccess, totalFailed },
        `[SyncEngine] ✅ Sincronización completa finalizada: ${totalSuccess} exitosas, ${totalFailed} fallidas`
      );

      return results;
    } catch (error) {
      logger.error({ error }, '[SyncEngine] ❌ Error en sincronización completa');
      throw error;
    }
  }

  /**
   * Procesa reintentos pendientes
   */
  async processRetries(): Promise<void> {
    logger.info('[SyncEngine] Procesando reintentos pendientes...');

    try {
      const result = await this.retryQueueManager.processRetries(async (item) => {
        try {
          // Parse payload from JSON string
          const payload = JSON.parse(item.payload);

          // Determinar qué tipo de entidad es para usar el cliente correcto
          let batchResult;

          switch (item.entityType) {
            case EntityType.ARTICULO:
              batchResult = await this.apiClient.articulos.sendBatch(
                payload as IArticuloPayload[]
              );
              break;

            case EntityType.COMPROBANTE_CABECERA:
              batchResult = await this.apiClient.comprobantes.sendBatch(
                payload as IComprobanteCabeceraPayload[]
              );
              break;

            case EntityType.COMPROBANTE_DETALLE:
              batchResult = await this.apiClient.comprobantesDetalle.sendBatch(
                payload as IComprobanteDetallePayload[]
              );
              break;

            case EntityType.COMPROBANTE_PAGO:
              batchResult = await this.apiClient.comprobantesPagos.sendBatch(
                payload as IComprobantePagosPayload[]
              );
              break;

            default:
              throw new Error(`Tipo de entidad desconocido: ${item.entityType}`);
          }

          return {
            success: batchResult.success,
            error: batchResult.errors.length > 0 ? batchResult.errors[0]?.error : undefined,
          };
        } catch (error) {
          return {
            success: false,
            error: error instanceof Error ? error.message : String(error),
          };
        }
      });

      logger.info(
        result,
        `[SyncEngine] ✅ Reintentos procesados: ${result.successful} exitosos, ${result.failed} fallidos`
      );
    } catch (error) {
      logger.error({ error }, '[SyncEngine] ❌ Error al procesar reintentos');
      throw error;
    }
  }

  /**
   * Obtiene estadísticas de la cola de reintentos
   */
  async getRetryQueueStats() {
    return await this.retryQueueManager.getStats();
  }

  /**
   * Método genérico de sincronización por queryId (NUEVO)
   * Este es el método principal que usa la arquitectura query-based
   */
  async syncQuery(queryId: number, options: SyncOptions = {}, syncId?: string): Promise<SyncResult> {
    const startTime = Date.now();
    const syncType = options.syncType ?? SyncType.INCREMENTAL;

    logger.info(
      { queryId, syncType },
      `[SyncEngine] Iniciando sincronización de query ID ${queryId}...`
    );

    // Obtener query por ID
    const query = await QueriesRepo.getQuery(queryId);

    if (!query) {
      throw new Error(`Query no encontrada: ${queryId}`);
    }

    if (!query.isActive) {
      throw new Error(`Query no está activa: "${query.name}" (ID: ${queryId})`);
    }

    const entityType = query.entityType as EntityType;

    logger.info(
      { queryId: query.id, queryName: query.name, entityType },
      `[SyncEngine] ✅ Query encontrada: "${query.name}"`
    );

    // Resultado inicial
    const result: SyncResult = {
      entityType,
      status: LogStatus.STARTED,
      recordsFetched: 0,
      recordsSent: 0,
      recordsFailed: 0,
      durationMs: 0,
    };

    let logId: number | null = null;

    try {
      // 1. Marcar sync como running (usando queryId)
      await SyncStateRepo.markSyncAsRunning(queryId);

      // 2. Crear log inicial (con queryId y queryName)
      logId = await SyncLogsRepo.createLog({
        queryId: query.id,
        queryName: query.name,
        entityType,
        syncType,
        status: LogStatus.STARTED,
        recordsFetched: 0,
        recordsSent: 0,
        recordsFailed: 0,
      });

      // 3. [REMOVED] Field mappings ya no son necesarios - la query debe tener aliases exactos

      // 4. Obtener lastSync value (para sync incremental) - usando queryId
      let lastSyncValue: string | null = null;

      if (!options.fullSync && syncType === SyncType.INCREMENTAL) {
        const syncState = await SyncStateRepo.getSyncState(queryId);
        lastSyncValue = syncState?.lastSyncValue ?? null;

        // Add clock skew protection
        if (lastSyncValue) {
          const OVERLAP_MINUTES = 5;
          const timestamp = new Date(lastSyncValue);
          timestamp.setMinutes(timestamp.getMinutes() - OVERLAP_MINUTES);
          const adjustedValue = timestamp.toISOString();

          logger.debug({
            stored: syncState?.lastSyncValue,
            adjusted: adjustedValue,
            overlapMinutes: OVERLAP_MINUTES,
          }, '[SyncEngine] Proteccion contra clock skew aplicada');

          lastSyncValue = adjustedValue;
        }
      }

      logger.debug({ lastSyncValue }, '[SyncEngine] Último valor de sincronización');

      // 5. Ejecutar query en ERP
      const queryParams = lastSyncValue ? { lastSync: lastSyncValue } : undefined;

      logger.info(
        { sql: query.sqlQuery.substring(0, 100) + '...', params: queryParams },
        '[SyncEngine] Ejecutando query en ERP...'
      );

      const queryResult = await this.adapter.executeQuery(query.sqlQuery, queryParams);

      result.recordsFetched = queryResult.rowCount;

      logger.info(
        { recordsFetched: result.recordsFetched },
        `[SyncEngine] ✅ Query ejecutada: ${result.recordsFetched} registros obtenidos`
      );

      // Si no hay registros, terminar exitosamente
      if (queryResult.rowCount === 0) {
        result.status = LogStatus.SUCCESS;
        result.durationMs = Date.now() - startTime;
        result.logId = logId ?? undefined;

        await SyncStateRepo.markSyncAsSuccess(queryId, {
          lastSyncValue: lastSyncValue ?? new Date().toISOString(),
          recordCount: 0,
        });

        if (logId) {
          await SyncLogsRepo.updateLog(logId, {
            status: LogStatus.SUCCESS,
            recordsFetched: 0,
            recordsSent: 0,
            recordsFailed: 0,
            metadata: { message: 'No hay registros nuevos para sincronizar' },
          });
        }

        logger.info('[SyncEngine] ✅ No hay registros nuevos para sincronizar');

        return result;
      }

      // 6. Validar resultados de query contra schema Zod
      logger.info('[SyncEngine] Validando resultados contra schema...');

      // Determinar el tipo de datos según entityType
      type PayloadType = IArticuloPayload | IComprobanteCabeceraPayload | IComprobanteDetallePayload | IComprobantePagosPayload;

      const validation = validateQueryResult(queryResult.rows as Record<string, unknown>[], entityType);

      // Validate against live PostgreSQL schema from gateway
      logger.info('[SyncEngine] Validando contra schema de PostgreSQL en gateway...');
      const schemaValidation = await validateQueryAgainstSchema(
        queryResult.rows as Record<string, unknown>[],
        entityTypeToTableName(entityType)
      );

      if (!schemaValidation.isValid) {
        // Schema mismatch detected - fail early
        let errorMsg = `❌ Incompatibilidad de schema detectada con el gateway.\n\n`;

        errorMsg += `⚠️ Los datos de tu query SQL no coinciden con el schema actual de PostgreSQL.\n`;
        errorMsg += `Esto puede ocurrir cuando se regeneran los schemas del gateway.\n\n`;

        if (schemaValidation.errors.length > 0) {
          errorMsg += `📋 Errores encontrados:\n`;
          for (const error of schemaValidation.errors) {
            errorMsg += `   - ${error.field}: ${error.message}\n`;
            if (error.suggestion) {
              errorMsg += `     💡 ${error.suggestion}\n`;
            }
          }
        }

        errorMsg += `\n💡 Solución:\n`;
        errorMsg += `   1. Actualiza tu query SQL para que los aliases coincidan con los campos actuales\n`;
        errorMsg += `   2. O regenera los schemas de objetiva-sync ejecutando el script de regeneración\n`;

        logger.error(errorMsg);

        // Update log and state
        await SyncLogsRepo.updateLog(logId, {
          status: LogStatus.FAILED,
          errorMessage: errorMsg,
        });

        await SyncStateRepo.updateSyncState(query.id, {
          lastSyncAt: new Date().toISOString(),
          lastSyncCount: 0,
        });

        result.status = LogStatus.FAILED;
        result.error = errorMsg;
        result.recordsFetched = queryResult.rowCount;
        result.recordsSent = 0;
        result.recordsFailed = queryResult.rowCount;

        return result;
      }

      logger.info('[SyncEngine] ✅ Schema validation passed');

      if (!validation.isValid) {
        // Construir mensaje de error detallado
        let errorMsg = `❌ La query "${query.name}" retornó datos que no cumplen con el schema esperado.\n\n`;

        // Campos requeridos faltantes
        const missingRequired = Object.entries(validation.requiredFields)
          .filter(([_, v]) => v.status === 'MISSING')
          .map(([field]) => field);

        if (missingRequired.length > 0) {
          errorMsg += `📋 Campos requeridos faltantes:\n`;
          for (const field of missingRequired) {
            errorMsg += `   - ${field}\n`;
          }
          errorMsg += `\n`;
        }

        // Errores de tipo
        const typeErrors = Object.entries(validation.requiredFields)
          .filter(([_, v]) => v.status === 'TYPE_ERROR')
          .concat(Object.entries(validation.optionalFields).filter(([_, v]) => v.status === 'TYPE_ERROR'));

        if (typeErrors.length > 0) {
          errorMsg += `⚠️ Errores de tipo de datos:\n`;
          for (const [field, info] of typeErrors) {
            errorMsg += `   - ${field}: esperado ${info.expectedType}, recibido ${info.actualType}\n`;
          }
          errorMsg += `\n`;
        }

        // Primeros errores de validación
        if (validation.validationErrors.length > 0) {
          errorMsg += `❌ Errores de validación (primeros 5):\n`;
          for (const error of validation.validationErrors.slice(0, 5)) {
            errorMsg += `   - Fila ${error.rowIndex + 1}, campo ${error.fieldPath.join('.')}: ${error.error}\n`;
          }
          if (validation.validationErrors.length > 5) {
            errorMsg += `   ... y ${validation.validationErrors.length - 5} errores más\n`;
          }
          errorMsg += `\n`;
        }

        errorMsg += `💡 Acción: Edita la query SQL para que los aliases coincidan exactamente con los campos del schema.\n`;
        errorMsg += `   Puedes probar la query en Configuración → Queries → Probar Query.\n`;

        logger.error(`[SyncEngine] ${errorMsg}`);

        if (logId) {
          await SyncLogsRepo.updateLog(logId, {
            status: LogStatus.FAILED,
            recordsSent: 0,
            recordsFailed: queryResult.rows.length,
            errorMessage: errorMsg,
          });
        }

        await SyncStateRepo.markSyncAsError(queryId, errorMsg);

        return {
          entityType,
          status: LogStatus.FAILED,
          recordsFetched: queryResult.rows.length,
          recordsSent: 0,
          recordsFailed: queryResult.rows.length,
          durationMs: Date.now() - startTime,
          error: errorMsg,
        };
      }

      // Validación exitosa - usar datos directamente
      const transformedData = queryResult.rows as PayloadType[];

      logger.info(
        { recordCount: transformedData.length },
        `[SyncEngine] ✅ Validación exitosa: ${transformedData.length} registros válidos`
      );

      // 7. Preparar metadata para envío
      const metadata = {
        queryId: query.id,
        queryName: query.name,
        syncId,
      };

      // 8. Determinar función de envío según entityType (con metadata)
      const sendBatchFn = this.getSendBatchFunction(entityType, metadata);

      // 8. Enviar en batches
      const batchSize = options.batchSize ?? this.config.defaultBatchSize ?? SYNC_CONFIG.BATCH_SIZE_DEFAULT;

      const batchOptions: BatchProcessorOptions = {
        batchSize,
        continueOnError: options.continueOnError ?? this.config.continueOnError ?? true,
        delayBetweenBatches: this.config.delayBetweenBatches,
        logId,
        saveBatches: true,
        onProgress: this.config.onProgress ? (batchProgress) => {
          const progressData: ProgressData = {
            entityType,
            current: batchProgress.processedItems,
            total: batchProgress.totalItems,
            percentage: batchProgress.percentage,
            estimatedTimeRemaining: batchProgress.estimatedTimeRemaining,
            status: `Procesando batch ${batchProgress.currentBatch} de ${batchProgress.totalBatches}`,
            syncType: syncType,
            queryId: query.id,
          };
          this.config.onProgress!(progressData);
        } : undefined,
      };

      logger.info(
        { batchSize, totalRecords: transformedData.length },
        '[SyncEngine] Enviando datos en batches...'
      );

      const batchResult = await processBatches(transformedData as any[], sendBatchFn, batchOptions);

      result.recordsSent = batchResult.inserted + batchResult.updated;
      result.recordsFailed = batchResult.errors.length;

      logger.info(
        `✅ Enviados: ${result.recordsSent}, ❌ Fallidos: ${result.recordsFailed}`
      );

      // 9. Determinar estado final
      // Primero verificar si fue cancelado
      const wasCanceled = batchResult.errors.some(err => err.code === 'SYNC_CANCELED');

      if (wasCanceled) {
        result.status = LogStatus.CANCELED;
        logger.info('[SyncEngine] Sincronización cancelada por el usuario');
      } else if (batchResult.errors.length === 0) {
        result.status = LogStatus.SUCCESS;
      } else if (result.recordsSent > 0) {
        result.status = LogStatus.PARTIAL;
      } else {
        result.status = LogStatus.FAILED;
      }

      // 10. Obtener nuevo lastSyncValue
      let newLastSyncValue = lastSyncValue;

      if (result.recordsSent > 0 && query.incrementalField) {
        newLastSyncValue = this.getMaxFieldValue(
          queryResult.rows as Record<string, unknown>[],
          query.incrementalField
        );
      }

      // 11. Actualizar sync state (usando queryId)
      if (result.status === LogStatus.SUCCESS || result.status === LogStatus.PARTIAL) {
        await SyncStateRepo.markSyncAsSuccess(queryId, {
          lastSyncValue: newLastSyncValue ?? new Date().toISOString(),
          recordCount: result.recordsSent,
        });
      } else if (result.status === LogStatus.CANCELED) {
        await SyncStateRepo.updateSyncState(queryId, {
          status: SyncStatus.IDLE,
          errorMessage: null
        });
        logger.info('[SyncEngine] Sync cancelado - status restablecido a IDLE');
      } else {
        await SyncStateRepo.markSyncAsError(
          queryId,
          `${result.recordsFailed} registros fallidos`
        );
      }

      // 12. Actualizar log
      result.durationMs = Date.now() - startTime;

      if (logId) {
        await SyncLogsRepo.updateLog(logId, {
          status: result.status,
          recordsFetched: result.recordsFetched,
          recordsSent: result.recordsSent,
          recordsFailed: result.recordsFailed,
          metadata: {
            batchSize,
            totalBatches: batchResult.totalBatches,
            successfulBatches: batchResult.successfulBatches,
            failedBatches: batchResult.failedBatches,
            partialBatches: batchResult.partialBatches,
            totalRecords: transformedData.length,
            batchesStoredInFiles: true,
            errors: batchResult.errors.slice(0, 10),
          },
        });
      }

      logger.info(
        {
          queryId: query.id,
          queryName: query.name,
          entityType,
          status: result.status,
          fetched: result.recordsFetched,
          sent: result.recordsSent,
          failed: result.recordsFailed,
          durationMs: result.durationMs,
        },
        `[SyncEngine] ${result.status === LogStatus.SUCCESS ? '✅' : '⚠️'} Sincronización de query "${query.name}" completada`
      );

      result.logId = logId ?? undefined;
      return result;
    } catch (error) {
      result.status = LogStatus.FAILED;
      result.error = error instanceof Error ? error.message : String(error);
      result.durationMs = Date.now() - startTime;
      result.logId = logId ?? undefined;

      logger.error(
        {
          queryId,
          error: error instanceof Error ? error.message : String(error),
          errorStack: error instanceof Error ? error.stack : undefined,
          errorType: error?.constructor?.name,
        },
        `[SyncEngine] ❌ Error en sincronización de query ${queryId}`
      );

      // Marcar sync state como error (usando queryId)
      await SyncStateRepo.markSyncAsError(
        queryId,
        error instanceof Error ? error.message : String(error)
      );

      // Actualizar log
      if (logId) {
        await SyncLogsRepo.updateLog(logId, {
          status: LogStatus.FAILED,
          recordsFetched: result.recordsFetched,
          recordsSent: result.recordsSent,
          recordsFailed: result.recordsFailed,
          errorMessage: result.error,
        });
      }

      throw error;
    }
  }

  /**
   * Helper: Obtiene la función de envío de batch según el entityType
   * @param metadata Metadata opcional con queryId, queryName y syncId para logging en gateway
   */
  private getSendBatchFunction(
    entityType: EntityType,
    metadata?: { queryId: number; queryName: string; syncId?: string }
  ): (batch: any[], batchInfo: { batchNumber: number; totalBatches: number }) => Promise<{
    success: boolean;
    inserted: number;
    updated: number;
    errors: Array<{ index: number; identifier: string; error: string; code: string }>;
  }> {
    switch (entityType) {
      case EntityType.ARTICULO:
        return async (batch, batchInfo) => {
          const currentSync = syncStateManager.getCurrentSync();
          const abortSignal = currentSync?.abortController?.signal;

          return await this.apiClient.articulos.sendBatch(batch, {
            ...metadata,
            queryId: metadata!.queryId,
            queryName: metadata!.queryName,
            syncId: metadata?.syncId,
            batchNumber: batchInfo.batchNumber,
            totalBatches: batchInfo.totalBatches,
          }, abortSignal);
        };
      case EntityType.COMPROBANTE_CABECERA:
        return async (batch, batchInfo) => {
          const currentSync = syncStateManager.getCurrentSync();
          const abortSignal = currentSync?.abortController?.signal;

          return await this.apiClient.comprobantes.sendBatch(batch, {
            ...metadata,
            queryId: metadata!.queryId,
            queryName: metadata!.queryName,
            syncId: metadata?.syncId,
            batchNumber: batchInfo.batchNumber,
            totalBatches: batchInfo.totalBatches,
          }, abortSignal);
        };
      case EntityType.COMPROBANTE_DETALLE:
        return async (batch, batchInfo) => {
          const currentSync = syncStateManager.getCurrentSync();
          const abortSignal = currentSync?.abortController?.signal;

          return await this.apiClient.comprobantesDetalle.sendBatch(batch, {
            ...metadata,
            queryId: metadata!.queryId,
            queryName: metadata!.queryName,
            syncId: metadata?.syncId,
            batchNumber: batchInfo.batchNumber,
            totalBatches: batchInfo.totalBatches,
          }, abortSignal);
        };
      case EntityType.COMPROBANTE_PAGO:
        return async (batch, batchInfo) => {
          const currentSync = syncStateManager.getCurrentSync();
          const abortSignal = currentSync?.abortController?.signal;

          return await this.apiClient.comprobantesPagos.sendBatch(batch, {
            ...metadata,
            queryId: metadata!.queryId,
            queryName: metadata!.queryName,
            syncId: metadata?.syncId,
            batchNumber: batchInfo.batchNumber,
            totalBatches: batchInfo.totalBatches,
          }, abortSignal);
        };
      default:
        throw new Error(`EntityType no soportado: ${entityType}`);
    }
  }


}
