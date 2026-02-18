import { z } from 'zod';

/**
 * Tipos de entidades del sistema
 */
export enum EntityType {
  ARTICULO = 'articulo',
  COMPROBANTE_CABECERA = 'comprobante_cabecera',
  COMPROBANTE_DETALLE = 'comprobante_detalle',
  COMPROBANTE_PAGO = 'comprobante_pago',
}

/**
 * Estados de sincronización
 */
export enum SyncStatus {
  IDLE = 'idle',
  RUNNING = 'running',
  ERROR = 'error',
}

/**
 * Tipos de sincronización
 */
export enum SyncType {
  INCREMENTAL = 'incremental',
  FULL = 'full',
  MANUAL = 'manual',
  RETRY = 'retry',
}

/**
 * Estados de logs
 */
export enum LogStatus {
  STARTED = 'started',
  SUCCESS = 'success',
  PARTIAL = 'partial',
  FAILED = 'failed',
  CANCELED = 'canceled',
}

/**
 * Estados de retry queue
 */
export enum RetryStatus {
  PENDING = 'pending',
  PROCESSING = 'processing',
  FAILED = 'failed',
  SUCCESS = 'success',
}

/**
 * Tipos de transformación de campos
 */
export enum TransformType {
  UPPERCASE = 'uppercase',
  LOWERCASE = 'lowercase',
  TRIM = 'trim',
  NUMBER = 'number',
  DATE = 'date',
  REPLACE = 'replace',
  CONSTANT = 'constant', // Establece un valor constante, reemplazando todo el campo
}

/**
 * Tipos de canales de notificación
 */
export enum NotificationChannel {
  SLACK = 'slack',
  TELEGRAM = 'telegram',
  PUSHOVER = 'pushover',
  WEBHOOK = 'webhook',
}

/**
 * Tipo de resultado genérico
 */
export interface Result<T = unknown, E = Error> {
  success: boolean;
  data?: T;
  error?: E;
}

/**
 * Schema Zod para Result
 */
export const resultSchema = <T extends z.ZodType>(dataSchema: T) =>
  z.object({
    success: z.boolean(),
    data: dataSchema.optional(),
    error: z.unknown().optional(),
  });

/**
 * Respuesta estándar de API
 */
export interface APIResponse<T = unknown> {
  success: boolean;
  data?: T;
  message?: string;
  error?: {
    code: string;
    message: string;
    details?: unknown;
  };
}

/**
 * Schema Zod para APIResponse
 */
export const apiResponseSchema = <T extends z.ZodType>(dataSchema: T) =>
  z.object({
    success: z.boolean(),
    data: dataSchema.optional(),
    message: z.string().optional(),
    error: z
      .object({
        code: z.string(),
        message: z.string(),
        details: z.unknown().optional(),
      })
      .optional(),
  });

/**
 * Resultado de envío en batch
 */
export interface BatchResult {
  success: boolean;
  inserted: number;
  updated: number;
  errors: BatchError[];
}

/**
 * Error individual en un batch
 */
export interface BatchError {
  index: number;
  identifier: string;
  error: string;
  code: string;
}

/**
 * Schema Zod para BatchResult
 */
export const batchResultSchema = z.object({
  success: z.boolean(),
  inserted: z.number(),
  updated: z.number(),
  errors: z.array(
    z.object({
      index: z.number(),
      identifier: z.string(),
      error: z.string(),
      code: z.string(),
    })
  ),
});

/**
 * Resultado de test de conexión
 */
export interface TestResult {
  success: boolean;
  message: string;
  details?: unknown;
}

/**
 * Paginación
 */
export interface Pagination {
  limit: number;
  offset: number;
  total?: number;
}

/**
 * Schema Zod para Pagination
 */
export const paginationSchema = z.object({
  limit: z.number().min(1).max(1000).default(50),
  offset: z.number().min(0).default(0),
  total: z.number().optional(),
});

/**
 * Filtros genéricos
 */
export interface Filters {
  [key: string]: string | number | boolean | undefined;
}

/**
 * Resultado de sincronización
 */
export interface SyncResult {
  entityType: EntityType;
  status: LogStatus;
  recordsFetched: number;
  recordsSent: number;
  recordsFailed: number;
  durationMs: number;
  error?: string;
  logId?: number;
}

/**
 * Schema Zod para SyncResult
 */
export const syncResultSchema = z.object({
  entityType: z.nativeEnum(EntityType),
  status: z.nativeEnum(LogStatus),
  recordsFetched: z.number(),
  recordsSent: z.number(),
  recordsFailed: z.number(),
  durationMs: z.number(),
  error: z.string().optional(),
});
