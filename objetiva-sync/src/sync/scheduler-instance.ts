/**
 * Instancia global del Scheduler
 * Permite acceso al scheduler desde cualquier parte de la aplicación
 * Arquitectura query-based: carga jobs desde queries programadas
 */

import { Scheduler, createRetryProcessorJob, createDailyCleanupJob } from './scheduler.js';
import { SyncEngine } from './sync-engine.js';
import { createAdapter } from '../adapters/index.js';
import { getActiveConnectionConfig } from '../store/repositories/connection-config-repo.js';
import { logger } from '../utils/logger.js';
import { initSyncQueue } from './sync-queue-instance.js';

let schedulerInstance: Scheduler | null = null;
let syncEngineInstance: SyncEngine | null = null;

/**
 * Inicializa el scheduler global con arquitectura query-based
 */
export async function initScheduler(): Promise<void> {
  try {
    logger.info('[Scheduler] Inicializando scheduler global...');

    // 1. Obtener configuración de conexión activa
    const connection = await getActiveConnectionConfig();

    if (!connection) {
      logger.warn('[Scheduler] No hay adaptador activo configurado. Scheduler no iniciado.');
      return;
    }

    // 2. Crear adaptador con la configuración activa
    const adapter = createAdapter(connection.adapterType);

    // 3. Crear SyncEngine (apiClient is optional for scheduler-only initialization)
    syncEngineInstance = new SyncEngine({ dataSourceAdapter: adapter });

    // 4. Inicializar SyncQueue con el SyncEngine
    initSyncQueue(syncEngineInstance);
    logger.info('[Scheduler] ✅ SyncQueue inicializado');

    // 5. Crear Scheduler
    schedulerInstance = new Scheduler(syncEngineInstance);

    // 6. Cargar jobs desde queries programadas (isScheduled = true)
    await schedulerInstance.initializeFromQueries();

    // 7. Agregar jobs de sistema
    logger.info('[Scheduler] Agregando jobs de sistema...');

    // Job de procesamiento de reintentos (cada 15 minutos = 900 segundos)
    const retryJob = createRetryProcessorJob();
    schedulerInstance.addJob(retryJob);
    logger.info('[Scheduler] Job de reintentos agregado (cada 15 minutos)');

    // Job de limpieza diaria (cada 24 horas = 86400 segundos)
    const cleanupJob = createDailyCleanupJob();
    schedulerInstance.addJob(cleanupJob);
    logger.info('[Scheduler] Job de limpieza agregado (cada 24 horas)');

    // 8. Iniciar scheduler
    schedulerInstance.start();

    logger.info('[Scheduler] ✅ Scheduler iniciado con éxito');
  } catch (error) {
    logger.error({ error }, '[Scheduler] ❌ Error al inicializar scheduler');
  }
}

/**
 * Obtiene la instancia del scheduler
 */
export function getScheduler(): Scheduler | null {
  return schedulerInstance;
}

/**
 * Obtiene la instancia del SyncEngine
 */
export function getSyncEngine(): SyncEngine | null {
  return syncEngineInstance;
}

/**
 * Detiene el scheduler
 */
export function stopScheduler(): void {
  if (schedulerInstance) {
    schedulerInstance.stop();
    logger.info('[Scheduler] ✅ Scheduler detenido');
  }
}

/**
 * Reinicia el scheduler con nueva configuración
 */
export async function restartScheduler(): Promise<void> {
  stopScheduler();
  await initScheduler();
}
