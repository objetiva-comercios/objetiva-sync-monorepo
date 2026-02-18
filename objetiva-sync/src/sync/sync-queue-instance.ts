/**
 * Instancia singleton de SyncQueue
 * Garantiza una única cola de sincronización en toda la aplicación
 */

import { SyncQueue } from './sync-queue.js';
import type { SyncEngine } from './sync-engine.js';
import { logger } from '../utils/logger.js';

let queueInstance: SyncQueue | null = null;

/**
 * Obtiene la instancia singleton de SyncQueue
 * @throws Error si no se ha inicializado con initSyncQueue primero
 */
export function getSyncQueue(): SyncQueue {
  if (!queueInstance) {
    throw new Error(
      'SyncQueue no inicializado. Llama a initSyncQueue(syncEngine) primero.'
    );
  }
  return queueInstance;
}

/**
 * Inicializa la instancia singleton de SyncQueue
 * Debe llamarse al inicio de la aplicación, después de crear el SyncEngine
 */
export function initSyncQueue(syncEngine: SyncEngine): SyncQueue {
  if (queueInstance) {
    logger.warn('SyncQueue ya estaba inicializado, recreando instancia');
  }

  queueInstance = new SyncQueue(syncEngine);
  logger.info('SyncQueue inicializado correctamente');

  return queueInstance;
}

/**
 * Reinicia la instancia de SyncQueue (útil para testing)
 */
export function resetSyncQueue(): void {
  if (queueInstance) {
    queueInstance.clearQueue();
  }
  queueInstance = null;
  logger.info('SyncQueue reiniciado');
}

/**
 * Verifica si SyncQueue está inicializado
 */
export function isSyncQueueInitialized(): boolean {
  return queueInstance !== null;
}
