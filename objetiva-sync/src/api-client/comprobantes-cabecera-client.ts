/**
 * Cliente para el endpoint de comprobantes - Cabeceras
 */

import { fetch } from 'undici';
import type { Dispatcher } from 'undici';
import type { AuthManager } from './auth.js';
import type { IComprobanteCabeceraPayload } from '../types/comprobantes-cabecera.js';
import type { BatchResult } from '../types/common.js';
import { comprobanteCabeceraPayloadSchema } from '../types/comprobantes-cabecera.js';
import { logger } from '../utils/logger.js';
import { chunk } from '../utils/helpers.js';
import { SYNC_CONFIG } from '../config/constants.js';
import { classifyError } from '../utils/error-classifier.js';

const BATCH_REQUEST_TIMEOUT_MS = 120_000; // 2 minutes per batch request

/**
 * Cliente para enviar cabeceras de comprobantes a la API remota
 */
export class ComprobantesCabeceraClient {
  private baseUrl: string;
  private authManager: AuthManager;
  private dispatcher?: Dispatcher;

  constructor(baseUrl: string, authManager: AuthManager, dispatcher?: Dispatcher) {
    this.baseUrl = baseUrl.replace(/\/$/, '');
    this.authManager = authManager;
    this.dispatcher = dispatcher;
  }

  /**
   * Envía un batch de comprobantes a la API
   */
  async sendBatch(
    comprobantes: IComprobanteCabeceraPayload[],
    metadata?: {
      queryId: number;
      queryName: string;
      syncId?: string;
      batchNumber?: number;
      totalBatches?: number;
    },
    abortSignal?: AbortSignal
  ): Promise<BatchResult> {
    if (comprobantes.length === 0) {
      return {
        success: true,
        inserted: 0,
        updated: 0,
        errors: [],
      };
    }

    try {
      const logContext = metadata
        ? `[ComprobantesClient] [Query: ${metadata.queryName}] Enviando batch de ${comprobantes.length} comprobantes...`
        : `[ComprobantesClient] Enviando batch de ${comprobantes.length} comprobantes...`;

      logger.info(logContext);

      // Validar comprobantes antes de enviar
      const validationErrors = this.validateBatch(comprobantes);
      if (validationErrors.length > 0) {
        logger.error({ validationErrors }, '[ComprobantesClient] Errores de validación');
        return {
          success: false,
          inserted: 0,
          updated: 0,
          errors: validationErrors,
        };
      }

      // Obtener token
      const token = await this.authManager.getToken();

      // Preparar headers con metadata de query
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      };

      // Agregar headers de query metadata si están disponibles
      if (metadata) {
        headers['X-Query-Id'] = metadata.queryId.toString();
        headers['X-Query-Name'] = metadata.queryName;

        if (metadata.syncId) {
          headers['X-Sync-Id'] = metadata.syncId;
        }
        if (metadata.batchNumber !== undefined && metadata.totalBatches !== undefined) {
          headers['X-Batch-Number'] = metadata.batchNumber.toString();
          headers['X-Total-Batches'] = metadata.totalBatches.toString();
        }
      }

      // Combine cancellation signal with timeout signal
      const timeoutSignal = AbortSignal.timeout(BATCH_REQUEST_TIMEOUT_MS);
      const combinedSignal = abortSignal
        ? AbortSignal.any([abortSignal, timeoutSignal])
        : timeoutSignal;

      // Enviar request con abort signal
      const response = await fetch(`${this.baseUrl}/api/comprobantes/batch`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ comprobantes }),
        signal: combinedSignal,
        dispatcher: this.dispatcher,
      });

      // Siempre leer el cuerpo de la respuesta primero
      const data = (await response.json()) as any;

      // ✅ Manejo de 207 Multi-Status (éxito parcial)
      if (response.status === 207) {
        const result = data.data || data;

        if (!result) {
          throw new Error('No data in 207 Multi-Status response');
        }

        logger.warn({
          inserted: result.inserted || 0,
          updated: result.updated || 0,
          errors: result.errors?.length || 0,
        }, '[ComprobantesClient] ⚠️ Batch con éxito parcial (207 Multi-Status)');

        // Retornar resultado parcial (success=false indica que hubo errores)
        return {
          success: false, // Hay errores, no es 100% exitoso
          inserted: result.inserted || 0,
          updated: result.updated || 0,
          errors: result.errors || [],
        };
      }

      if (!response.ok) {
        const errorMsg = data.error || data.message || response.statusText;
        throw new Error(`HTTP ${response.status}: ${errorMsg}`);
      }

      if (!data.success) {
        throw new Error(data.message ?? 'Unknown error');
      }

      // El gateway puede enviar "data" o "result"
      const result = data.result || data.data;

      if (!result) {
        throw new Error('No result data in response');
      }

      // Normalizar resultado del gateway (puede venir como "failed" o "errors")
      const errors = result.errors || [];
      const failedCount = result.failed || 0;

      logger.info({
        inserted: result.inserted || 0,
        updated: result.updated || 0,
        errors: errors.length || failedCount,
      }, '[ComprobantesClient] ✅ Batch enviado');

      // success=true solo si NO hay errores (100% exitoso)
      const hasErrors = errors.length > 0 || failedCount > 0;
      return {
        success: !hasErrors,
        inserted: result.inserted || 0,
        updated: result.updated || 0,
        errors: errors,
      };
    } catch (error) {
      const classified = classifyError(error);

      // Log with classification
      logger.error({
        errorCode: classified.code,
        errorMessage: classified.message,
        rootCause: classified.rootCause,
        isRetryable: classified.isRetryable,
        errorType: error?.constructor?.name,
      }, `[ComprobantesCabeceraClient] Error al enviar batch: [${classified.code}] ${classified.message}`);

      return {
        success: false,
        inserted: 0,
        updated: 0,
        errors: [
          {
            index: -1,
            identifier: classified.code,
            error: `${classified.message} | Causa: ${classified.rootCause}`,
            code: classified.code,
          },
        ],
      };
    }
  }

  /**
   * Envía múltiples comprobantes dividiéndolos en batches
   */
  async sendMultiple(
    comprobantes: IComprobanteCabeceraPayload[],
    batchSize: number = SYNC_CONFIG.BATCH_SIZE_DEFAULT
  ): Promise<BatchResult> {
    if (comprobantes.length === 0) {
      return {
        success: true,
        inserted: 0,
        updated: 0,
        errors: [],
      };
    }

    logger.info(
      `[ComprobantesClient] Enviando ${comprobantes.length} comprobantes en batches de ${batchSize}...`
    );

    // Dividir en batches
    const batches = chunk(comprobantes, batchSize);

    // Resultado acumulado
    const totalResult: BatchResult = {
      success: true,
      inserted: 0,
      updated: 0,
      errors: [],
    };

    // Enviar cada batch
    for (let i = 0; i < batches.length; i++) {
      const batch = batches[i];
      if (!batch) continue;

      logger.info(`[ComprobantesClient] Enviando batch ${i + 1}/${batches.length}...`);

      const result = await this.sendBatch(batch);

      // Acumular resultados
      totalResult.inserted += result.inserted;
      totalResult.updated += result.updated;
      totalResult.errors.push(...result.errors);

      if (!result.success) {
        totalResult.success = false;
      }
    }

    logger.info({
      batches: batches.length,
      inserted: totalResult.inserted,
      updated: totalResult.updated,
      errors: totalResult.errors.length,
    }, '[ComprobantesClient] ✅ Envío múltiple completado');

    return totalResult;
  }

  /**
   * Valida un batch de comprobantes
   */
  private validateBatch(comprobantes: IComprobanteCabeceraPayload[]): BatchResult['errors'] {
    const errors: BatchResult['errors'] = [];

    for (let i = 0; i < comprobantes.length; i++) {
      const comprobante = comprobantes[i];
      const validation = comprobanteCabeceraPayloadSchema.safeParse(comprobante);

      if (!validation.success) {
        errors.push({
          index: i,
          identifier: comprobante
            ? `${comprobante.erp_operacion}-${comprobante.erp_formulario}-${comprobante.erp_numero}`
            : `COMPROBANTE_${i}`,
          error: 'Validación fallida: ' + validation.error.message,
          code: 'VALIDATION_ERROR',
        });
      }
    }

    return errors;
  }

  /**
   * Prueba la conexión enviando un comprobante de prueba
   */
  async testConnection(): Promise<{ success: boolean; message: string }> {
    try {
      const testComprobante: IComprobanteCabeceraPayload = {
        erp_operacion: 'TEST',
        erp_formulario: 'TEST',
        erp_numero: '00001',
        operacion: 'TEST',
        formulario: 'TEST',
        numero: '00001',
        fecha: new Date().toISOString(),
        cantidad_items: 1,
        total_bruto: 100.0,
        total_descuentos: 0,
        total_neto: 100.0,
        total_iva: 21.0,
        total_venta: 121.0,
      };

      // Solo validar, no enviar realmente
      const validation = comprobanteCabeceraPayloadSchema.safeParse(testComprobante);

      if (!validation.success) {
        return {
          success: false,
          message: 'Validación fallida: ' + validation.error.message,
        };
      }

      // Verificar que tenemos token
      await this.authManager.getToken();

      return {
        success: true,
        message: 'Conexión OK. Token válido.',
      };
    } catch (error) {
      return {
        success: false,
        message: error instanceof Error ? error.message : String(error),
      };
    }
  }
}
