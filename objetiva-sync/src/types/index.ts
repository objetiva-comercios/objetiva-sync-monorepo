/**
 * Exportaciones centrales de tipos
 * Este archivo re-exporta todos los tipos del sistema para facilitar las importaciones
 *
 * Uso:
 * import { IArticuloPayload, EntityType, Result } from '@/types';
 */

// Common types
export * from './common.js';

// Articulos
export * from './articulos.js';

// Comprobantes (cabecera + detalle)
export * from './comprobantes-cabecera.js';
export * from './comprobantes-detalle.js';

// Pagos
export * from './comprobantes-pagos.js';

/**
 * Re-exportaciones especificas para facilitar auto-complete
 */
export type {
  // Common
  Result,
  APIResponse,
  BatchResult,
  BatchError,
  TestResult,
  Pagination,
  Filters,
  SyncResult,
} from './common.js';

export {
  // Enums
  EntityType,
  SyncStatus,
  SyncType,
  LogStatus,
  RetryStatus,
  TransformType,
  NotificationChannel,
} from './common.js';

export type {
  // Articulos
  IArticuloPayload,
  ArticuloPayload,
} from './articulos.js';

export type {
  // Comprobantes Cabecera
  IComprobanteCabeceraPayload,
  ComprobanteCabeceraPayload,
} from './comprobantes-cabecera.js';

export type {
  // Comprobantes Detalle
  IComprobanteDetallePayload,
  ComprobanteDetallePayload,
} from './comprobantes-detalle.js';

export type {
  // Pagos
  IComprobantePagosPayload,
  ComprobantePagosPayload,
} from './comprobantes-pagos.js';

/**
 * Schemas Zod exportados
 */
export {
  // Common schemas
  resultSchema,
  apiResponseSchema,
  batchResultSchema,
  paginationSchema,
  syncResultSchema,
} from './common.js';

export {
  // Articulos schemas
  articuloPayloadSchema,
  articulosBatchSchema,
  isArticuloPayload,
} from './articulos.js';

export {
  // Comprobantes Cabecera schemas
  comprobanteCabeceraPayloadSchema,
  comprobantesCabeceraBatchSchema,
  comprobantesBatchSchema,
  isComprobanteCabeceraPayload,
} from './comprobantes-cabecera.js';

export {
  // Comprobantes Detalle schemas
  comprobanteDetallePayloadSchema,
  comprobantesDetalleBatchSchema,
  isComprobanteDetallePayload,
} from './comprobantes-detalle.js';

export {
  // Pagos schemas
  comprobantePagoPayloadSchema,
  comprobantesPagosBatchSchema,
  isComprobantePagosPayload,
} from './comprobantes-pagos.js';
