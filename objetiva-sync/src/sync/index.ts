/**
 * Motor de Sincronización - Exports
 * Agrupa todos los componentes del motor de sincronización
 */

// SyncEngine - Orquestador principal
export { SyncEngine } from './sync-engine.js';
export type { SyncEngineConfig, SyncOptions } from './sync-engine.js';

// Transformer - ELIMINADO EN FASE 5
// Ya no se usa - reemplazado por query-validator.ts
// export {
//   applyMappings,
//   validateRequiredFields,
//   extractFieldValues,
//   getMaxFieldValue,
// } from './transformer.js';
// export type {
//   FieldMapping,
//   TransformResult,
//   TransformError,
// } from './transformer.js';

// BatchProcessor - Procesamiento en batches
export {
  processBatches,
  processBatchWithRetry,
  createSubBatches,
  calculateBatchStats,
  mergeBatchResults,
} from './batch-processor.js';
export type {
  BatchProcessorFn,
  BatchProcessorOptions,
  BatchProgress,
  BatchProcessorResult,
} from './batch-processor.js';

// RetryQueueManager - Gestión de reintentos
export { RetryQueueManager } from './retry-queue-manager.js';
export type {
  AddToRetryQueueOptions,
  RetryProcessResult,
  RetryProcessorFn,
} from './retry-queue-manager.js';

// Scheduler - Programación de tareas
export {
  Scheduler,
  createSyncJob,
  createRetryJob,
  createHourlySyncJobs,
  createRetryProcessorJob,
  createCleanupJob,
  createDailyCleanupJob,
} from './scheduler.js';
export type { ScheduledJob } from './scheduler.js';

// SyncQueue - Cola de sincronización secuencial
export { SyncQueue } from './sync-queue.js';
export type { QueuedSync, QueueStatus, QueuedSyncStatus } from './sync-queue.js';
export {
  getSyncQueue,
  initSyncQueue,
  resetSyncQueue,
  isSyncQueueInitialized,
} from './sync-queue-instance.js';
