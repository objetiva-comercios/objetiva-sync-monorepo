/**
 * Cliente para el endpoint de pagos de comprobantes
 */

import { fetch } from 'undici';
import type { Dispatcher } from 'undici';
import type { AuthManager } from './auth.js';
import type { IComprobantePagosPayload } from '../types/comprobantes-pagos.js';
import type { BatchResult } from '../types/common.js';
import { logger } from '../utils/logger.js';
import { chunk } from '../utils/helpers.js';
import { SYNC_CONFIG } from '../config/constants.js';
import { classifyError } from '../utils/error-classifier.js';
import { getSourceId } from './index.js';

const BATCH_REQUEST_TIMEOUT_MS = 120_000; // 2 minutes per batch request

/**
 * Cliente para enviar pagos de comprobantes a la API remota
 */
export class ComprobantesPagosClient {
  private baseUrl: string;
  private authManager: AuthManager;
  private dispatcher?: Dispatcher;

  constructor(baseUrl: string, authManager: AuthManager, dispatcher?: Dispatcher) {
    this.baseUrl = baseUrl.replace(/\/$/, '');
    this.authManager = authManager;
    this.dispatcher = dispatcher;
  }

  /**
   * Envía un batch de pagos de comprobantes a la API
   */
  async sendBatch(
    pagos: IComprobantePagosPayload[],
    metadata?: {
      queryId: number;
      queryName: string;
      syncId?: string;
      batchNumber?: number;
      totalBatches?: number;
    },
    abortSignal?: AbortSignal
  ): Promise<BatchResult> {
    if (pagos.length === 0) {
      return {
        success: true,
        inserted: 0,
        updated: 0,
        errors: [],
      };
    }

    try {
      logger.info(
        `[ComprobantesPagosClient] Enviando batch de ${pagos.length} pagos de comprobantes...`
      );

      // Validar pagos antes de enviar
      const validationErrors = this.validateBatch(pagos);
      if (validationErrors.length > 0) {
        logger.error({ validationErrors }, '[ComprobantesPagosClient] Errores de validación');
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
        'X-Origin-Source': getSourceId(),  // Send source identifier for multi-source tracking
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

      // Enviar request con metadata headers
      const response = await fetch(`${this.baseUrl}/api/comprobantes/pagos/batch`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ comprobantes_pagos: pagos }),
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
        }, '[ComprobantesPagosClient] ⚠️ Batch con éxito parcial (207 Multi-Status)');

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
      }, '[ComprobantesPagosClient] ✅ Batch enviado');

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
      }, `[ComprobantesPagosClient] Error al enviar batch: [${classified.code}] ${classified.message}`);

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
   * Envía múltiples pagos dividiéndolos en batches
   */
  async sendMultiple(
    pagos: IComprobantePagosPayload[],
    batchSize: number = SYNC_CONFIG.BATCH_SIZE_DEFAULT
  ): Promise<BatchResult> {
    if (pagos.length === 0) {
      return {
        success: true,
        inserted: 0,
        updated: 0,
        errors: [],
      };
    }

    logger.info(
      `[ComprobantesPagosClient] Enviando ${pagos.length} pagos en batches de ${batchSize}...`
    );

    // Dividir en batches
    const batches = chunk(pagos, batchSize);

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

      logger.info(`[ComprobantesPagosClient] Enviando batch ${i + 1}/${batches.length}...`);

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
    }, '[ComprobantesPagosClient] ✅ Envío múltiple completado');

    return totalResult;
  }

  /**
   * Valida y transforma un batch de pagos antes de enviar al gateway.
   *
   * NO valida contra un schema Zod local (que puede estar desactualizado).
   * La validación completa la realiza el gateway, que es la fuente de verdad.
   * Solo aplica validación básica de estructura y coerción de tipos.
   */
  private validateBatch(pagos: IComprobantePagosPayload[]): BatchResult['errors'] {
    const errors: BatchResult['errors'] = [];

    for (let i = 0; i < pagos.length; i++) {
      const pago = pagos[i];
      if (!pago || typeof pago !== 'object') {
        errors.push({
          index: i,
          identifier: `PAGO_${i}`,
          error: 'Pago inválido: no es un objeto',
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
      // Verificar que tenemos token válido
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
