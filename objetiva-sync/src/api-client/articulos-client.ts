/**
 * Cliente para el endpoint de artículos
 */

import { fetch } from 'undici';
import type { Dispatcher } from 'undici';
import type { IArticuloPayload } from '../types/articulos.js';
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
 * Cliente para enviar artículos a la API remota
 */
export class ArticulosClient {
  private baseUrl: string;
  private dispatcher?: Dispatcher;

  constructor(baseUrl: string, dispatcher?: Dispatcher) {
    this.baseUrl = baseUrl.replace(/\/$/, '');
    this.dispatcher = dispatcher;
  }

  /**
   * Envía un batch de artículos a la API
   */
  async sendBatch(
    articulos: IArticuloPayload[],
    metadata?: {
      queryId: number;
      queryName: string;
      syncId?: string;
      batchNumber?: number;
      totalBatches?: number;
    },
    abortSignal?: AbortSignal
  ): Promise<BatchResult> {
    if (articulos.length === 0) {
      return {
        success: true,
        inserted: 0,
        updated: 0,
        errors: [],
      };
    }

    try {
      const logContext = metadata
        ? `[ArticulosClient] [Query: ${metadata.queryName}] Enviando batch de ${articulos.length} artículos...`
        : `[ArticulosClient] Enviando batch de ${articulos.length} artículos...`;

      logger.info(logContext);

      // Validar y transformar artículos antes de enviar
      const transformResult = this.validateAndTransformBatch(articulos);
      if (transformResult.errors.length > 0) {
        logger.error({ validationErrors: transformResult.errors }, '[ArticulosClient] Errores de validación');
        return {
          success: false,
          inserted: 0,
          updated: 0,
          errors: transformResult.errors,
        };
      }

      // Usar los artículos transformados (con conversiones de tipo aplicadas)
      const transformedArticulos = transformResult.data;

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

      // Enviar request con datos transformados y abort signal
      const response = await fetch(`${this.baseUrl}/api/articulos/batch`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ articulos: transformedArticulos }),
        signal: combinedSignal,
        dispatcher: this.dispatcher,
      });

      // Siempre leer el cuerpo de la respuesta primero
      const data = (await response.json()) as any;

      // Log de la respuesta para debugging
      logger.info({
        status: response.status,
        success: data.success,
        dataKeys: Object.keys(data),
        sampleData: {
          message: data.message,
          error: data.error,
          inserted: data.data?.inserted,
          updated: data.data?.updated,
          errorsCount: data.data?.errors?.length,
        }
      }, '[ArticulosClient] Respuesta de la gateway');

      // ✅ Manejo de 207 Multi-Status (éxito parcial)
      if (response.status === 207) {
        const result = data.data || data.result;

        if (!result) {
          throw new Error('No data in 207 Multi-Status response');
        }

        logger.warn({
          inserted: result.inserted || 0,
          updated: result.updated || 0,
          errors: result.errors?.length || 0,
        }, '[ArticulosClient] ⚠️ Batch con éxito parcial (207 Multi-Status)');

        // Retornar resultado parcial (success=false indica que hubo errores)
        return {
          success: false, // Hay errores, no es 100% exitoso
          inserted: result.inserted || 0,
          updated: result.updated || 0,
          errors: result.errors || [],
        };
      }

      // Si la respuesta no es OK, leer el mensaje de error del cuerpo
      if (!response.ok) {
        const errorMsg = data.error || data.message || response.statusText;
        const details = data.details ? JSON.stringify(data.details, null, 2) : '';
        throw new Error(`HTTP ${response.status}: ${errorMsg}${details ? '\n' + details : ''}`);
      }

      if (!data.success) {
        // La gateway puede devolver error y details en lugar de message
        const errorMsg = data.error || data.message || 'Unknown error';
        const details = data.details ? JSON.stringify(data.details, null, 2) : '';
        const fullData = JSON.stringify(data, null, 2);
        logger.warn({ fullData }, '[ArticulosClient] Gateway retornó success:false');
        throw new Error(`${errorMsg}${details ? '\n' + details : ''}`);
      }

      // La gateway puede devolver los datos en 'data' o en 'result'
      const result = data.data || data.result;

      if (!result) {
        throw new Error('No data in response');
      }

      // Log completo del resultado para debugging
      logger.info({ fullResult: JSON.stringify(result, null, 2) }, '[ArticulosClient] Resultado completo de la gateway');

      // Normalizar resultado del gateway (puede venir como "failed" o "errors")
      const errors = result.errors || [];
      const failedCount = result.failed || 0;

      logger.info({
        inserted: result.inserted || 0,
        updated: result.updated || 0,
        errors: errors.length || failedCount,
      }, '[ArticulosClient] ✅ Batch enviado');

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

      // Log with full error introspection
      const errorDump = deepErrorInfo(error);
      logger.error({
        errorCode: classified.code,
        errorMessage: classified.message,
        rootCause: classified.rootCause,
        isRetryable: classified.isRetryable,
        ...errorDump,
      }, `[ArticulosClient] Error al enviar batch: [${classified.code}] ${classified.message}`);

      // Quick health check - is the gateway still responding?
      try {
        const healthResp = await fetch(`${this.baseUrl}/health`, {
          signal: AbortSignal.timeout(3000),
          dispatcher: this.dispatcher,
        });
        logger.info({ status: healthResp.status }, '[ArticulosClient] Gateway health check after error: REACHABLE');
      } catch (healthErr) {
        logger.error({
          healthError: healthErr instanceof Error ? healthErr.message : String(healthErr),
          healthCause: healthErr instanceof Error ? (healthErr as any).cause?.message : undefined,
        }, '[ArticulosClient] Gateway health check after error: UNREACHABLE');
      }

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
   * Envía múltiples artículos dividiéndolos en batches
   */
  async sendMultiple(
    articulos: IArticuloPayload[],
    batchSize: number = SYNC_CONFIG.BATCH_SIZE_DEFAULT
  ): Promise<BatchResult> {
    if (articulos.length === 0) {
      return {
        success: true,
        inserted: 0,
        updated: 0,
        errors: [],
      };
    }

    logger.info(
      `[ArticulosClient] Enviando ${articulos.length} artículos en batches de ${batchSize}...`
    );

    // Dividir en batches
    const batches = chunk(articulos, batchSize);

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

      logger.info(`[ArticulosClient] Enviando batch ${i + 1}/${batches.length}...`);

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
    }, '[ArticulosClient] ✅ Envío múltiple completado');

    return totalResult;
  }

  /**
   * Transforma un batch de artículos antes de enviar al gateway.
   *
   * NO valida contra un schema Zod local (que puede estar desactualizado).
   * La validación completa la realiza el gateway, que es la fuente de verdad.
   * Solo aplica coerción básica de tipos (number → string para campos de texto).
   */
  private validateAndTransformBatch(articulos: IArticuloPayload[]): {
    data: IArticuloPayload[];
    errors: BatchResult['errors'];
  } {
    const errors: BatchResult['errors'] = [];
    const transformed: IArticuloPayload[] = [];

    for (let i = 0; i < articulos.length; i++) {
      const articulo = articulos[i];
      if (!articulo || typeof articulo !== 'object') {
        errors.push({
          index: i,
          identifier: `ARTICULO_${i}`,
          error: 'Artículo inválido: no es un objeto',
          code: 'VALIDATION_ERROR',
        });
        continue;
      }

      // Coerción básica: convertir valores numéricos a string para campos de texto
      // El gateway validará la estructura completa contra el schema de PostgreSQL
      const coerced = { ...articulo } as any;
      for (const [key, value] of Object.entries(coerced)) {
        if (typeof value === 'number' && !['precio', 'costo', 'unidades'].includes(key)) {
          // Campos no-numéricos que vienen como number se convierten a string
          coerced[key] = String(value);
        }
      }

      transformed.push(coerced);
    }

    return { data: transformed, errors };
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
        dispatcher: this.dispatcher,
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

/**
 * Extract all possible information from an error, including nested causes
 */
function deepErrorInfo(err: unknown): Record<string, unknown> {
  const info: Record<string, unknown> = {};
  if (!(err instanceof Error)) {
    info.rawError = String(err);
    return info;
  }

  info.errorName = err.name;
  info.errorMessage = err.message;
  info.errorStack = err.stack?.split('\n').slice(0, 5).join('\n');

  // Extract all non-standard properties (code, errno, syscall, etc.)
  for (const key of Object.getOwnPropertyNames(err)) {
    if (!['name', 'message', 'stack'].includes(key)) {
      info[`err_${key}`] = (err as any)[key];
    }
  }

  // Traverse cause chain (up to 5 levels deep)
  let cause: unknown = (err as any).cause;
  let depth = 0;
  while (cause && depth < 5) {
    depth++;
    const prefix = `cause${depth}`;
    if (cause instanceof Error) {
      info[`${prefix}_name`] = cause.name;
      info[`${prefix}_message`] = cause.message;
      info[`${prefix}_stack`] = cause.stack?.split('\n').slice(0, 3).join('\n');
      for (const key of Object.getOwnPropertyNames(cause)) {
        if (!['name', 'message', 'stack'].includes(key)) {
          info[`${prefix}_${key}`] = (cause as any)[key];
        }
      }
      cause = (cause as any).cause;
    } else {
      info[`${prefix}_raw`] = String(cause);
      break;
    }
  }

  return info;
}
