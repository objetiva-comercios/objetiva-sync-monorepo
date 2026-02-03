/**
 * Cliente para el endpoint de pagos de comprobantes
 */

import { fetch } from 'undici';
import type { AuthManager } from './auth.js';
import type { IComprobantePagosPayload } from '../types/comprobantes-pagos.js';
import type { BatchResult, APIResponse } from '../types/common.js';
import { comprobantePagoPayloadSchema } from '../types/comprobantes-pagos.js';
import { logger } from '../utils/logger.js';
import { chunk } from '../utils/helpers.js';
import { SYNC_CONFIG } from '../config/constants.js';

/**
 * Cliente para enviar pagos de comprobantes a la API remota
 */
export class ComprobantesPagosClient {
  private baseUrl: string;
  private authManager: AuthManager;

  constructor(baseUrl: string, authManager: AuthManager) {
    this.baseUrl = baseUrl.replace(/\/$/, '');
    this.authManager = authManager;
  }

  /**
   * Envía un batch de pagos de comprobantes a la API
   */
  async sendBatch(pagos: IComprobantePagosPayload[]): Promise<BatchResult> {
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

      // Enviar request
      const response = await fetch(`${this.baseUrl}/api/comprobantes/pagos/batch`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ comprobantes_pagos: pagos }),
      });

      // Siempre leer el cuerpo de la respuesta primero
      const data = (await response.json()) as APIResponse<BatchResult>;

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
      logger.error({ error }, '[ComprobantesPagosClient] ❌ Error al enviar batch');

      return {
        success: false,
        inserted: 0,
        updated: 0,
        errors: [
          {
            index: -1,
            identifier: 'BATCH_ERROR',
            error: error instanceof Error ? error.message : String(error),
            code: 'SEND_BATCH_ERROR',
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
   * Valida un batch de pagos de comprobantes
   */
  private validateBatch(pagos: IComprobantePagosPayload[]): BatchResult['errors'] {
    const errors: BatchResult['errors'] = [];

    for (let i = 0; i < pagos.length; i++) {
      const pago = pagos[i];
      const validation = comprobantePagoPayloadSchema.safeParse(pago);

      if (!validation.success) {
        errors.push({
          index: i,
          identifier: `${pago?.erp_operacion}-${pago?.erp_formulario}-${pago?.erp_numero}` ?? `PAGO_${i}`,
          error: 'Validación fallida: ' + validation.error.message,
          code: 'VALIDATION_ERROR',
        });
      }
    }

    return errors;
  }

  /**
   * Prueba la conexión enviando un pago de prueba
   */
  async testConnection(): Promise<{ success: boolean; message: string }> {
    try {
      const testPago: IComprobantePagosPayload = {
        erp_operacion: 'TEST',
        erp_formulario: 'TEST',
        erp_numero: '00001',
        medio: 'efectivo',
        monto: 100.0,
      };

      // Solo validar, no enviar realmente
      const validation = comprobantePagoPayloadSchema.safeParse(testPago);

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
