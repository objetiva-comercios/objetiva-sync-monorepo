/**
 * Cliente para el endpoint de comprobantes - Cabeceras
 */

import type { IComprobanteCabeceraPayload } from '../types/comprobantes-cabecera.js';
import type { BatchResult } from '../types/common.js';
import { logger } from '../utils/logger.js';
import { chunk } from '../utils/helpers.js';
import { SYNC_CONFIG } from '../config/constants.js';
import { classifyError } from '../utils/error-classifier.js';
import { getSourceId } from './index.js';
import { getCorrelationId } from '../lib/correlation.js';
import { getJwtToken } from '../services/gateway-client.js';

const BATCH_REQUEST_TIMEOUT_MS = 120_000; // 2 minutes per batch request

/**
 * Cliente para enviar cabeceras de comprobantes a la API remota
 */
export class ComprobantesCabeceraClient {
  private baseUrl: string;
  constructor(baseUrl: string, _dispatcher?: unknown) {
    this.baseUrl = baseUrl.replace(/\/$/, '');
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
      const token = await getJwtToken();

      // Preparar headers con metadata de query
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
        'X-Origin-Source': getSourceId(),  // Send source identifier for multi-source tracking
      };

      // Add correlation ID if available (will be set when running within correlation context)
      const correlationId = getCorrelationId();
      if (correlationId) {
        headers['X-Correlation-ID'] = correlationId;
      }

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
        // Node 22 native fetch handles connection pooling internally
      });

      // Siempre leer el cuerpo de la respuesta primero
      const data = (await response.json()) as any;

      // ✅ Manejo de 207 Multi-Status (éxito parcial o total)
      if (response.status === 207) {
        const result = data.data || data;

        if (!result) {
          throw new Error('No data in 207 Multi-Status response');
        }

        const errors = result.errors || [];
        const hasErrors = errors.length > 0;

        if (hasErrors) {
          logger.warn({
            inserted: result.inserted || 0,
            updated: result.updated || 0,
            errors: errors.length,
          }, '[ComprobantesClient] ⚠️ Batch con éxito parcial (207 Multi-Status)');
        } else {
          logger.info({
            inserted: result.inserted || 0,
            updated: result.updated || 0,
          }, '[ComprobantesClient] Batch exitoso, sin errores');
        }

        return {
          success: !hasErrors,
          inserted: result.inserted || 0,
          updated: result.updated || 0,
          errors,
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
   * Valida y transforma un batch de comprobantes antes de enviar al gateway.
   *
   * NO valida contra un schema Zod local (que puede estar desactualizado).
   * La validación completa la realiza el gateway, que es la fuente de verdad.
   * Solo aplica validación básica de estructura y coerción de tipos.
   */
  private validateBatch(comprobantes: IComprobanteCabeceraPayload[]): BatchResult['errors'] {
    const errors: BatchResult['errors'] = [];

    for (let i = 0; i < comprobantes.length; i++) {
      const comprobante = comprobantes[i];
      if (!comprobante || typeof comprobante !== 'object') {
        errors.push({
          index: i,
          identifier: `COMPROBANTE_${i}`,
          error: 'Comprobante inválido: no es un objeto',
          code: 'VALIDATION_ERROR',
        });
      }
    }

    return errors;
  }

  /**
   * Prueba la conexión verificando autenticación con el gateway
   */
  async testConnection(): Promise<{ success: boolean; message: string }> {
    try {
      const token = await getJwtToken();
      const response = await fetch(`${this.baseUrl}/health`, {
        headers: { Authorization: `Bearer ${token}` },
        signal: AbortSignal.timeout(10_000),
        // Node 22 native fetch handles connection pooling internally
      });

      if (response.ok) {
        return { success: true, message: 'Conexion OK. JWT valido.' };
      }
      return { success: false, message: `HTTP ${response.status}: ${response.statusText}` };
    } catch (error) {
      return {
        success: false,
        message: error instanceof Error ? error.message : String(error),
      };
    }
  }
}
