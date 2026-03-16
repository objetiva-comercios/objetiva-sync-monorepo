/**
 * Instancia global del Scheduler
 * Permite acceso al scheduler desde cualquier parte de la aplicación
 * Arquitectura query-based: carga jobs desde queries programadas
 */

import { Scheduler, createRetryProcessorJob, createDailyCleanupJob } from './scheduler.js';
import { SyncEngine } from './sync-engine.js';
import { createAdapter } from '../adapters/index.js';
import { normalizeAdapterConfig } from '../adapters/database-adapter.js';
import { APIClient } from '../api-client/index.js';
import { getActiveConnectionConfig } from '../store/repositories/connection-config-repo.js';
import { getConfig } from '../store/repositories/config-repo.js';
import { logger } from '../utils/logger.js';
import { initSyncQueue } from './sync-queue-instance.js';
import { SYNC_CONFIG } from '../config/constants.js';
import type { IDataSourceAdapter } from '../adapters/types.js';

let schedulerInstance: Scheduler | null = null;
let syncEngineInstance: SyncEngine | null = null;
let adapterInstance: IDataSourceAdapter | null = null;

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
    const adapterConfig = normalizeAdapterConfig(connection.adapterType, connection.config);

    // 3. IMPORTANTE: Conectar el adaptador a la base de datos
    await adapter.connect(adapterConfig);
    adapterInstance = adapter;
    logger.info('[Scheduler] ✅ Adaptador conectado a base de datos');

    // 4. Obtener configuración de API remota
    const [apiUrl, jwtSecret] = await Promise.all([
      getConfig('REMOTE_API_URL'),
      getConfig('JWT_SECRET'),
    ]);

    if (!apiUrl || !jwtSecret) {
      logger.warn('[Scheduler] Gateway no enlazado, sync deshabilitado');
    }

    // 5. Crear API client si está configurado (paired)
    let apiClient: APIClient | undefined;
    if (apiUrl && jwtSecret) {
      apiClient = new APIClient({
        baseUrl: apiUrl.value,
      });
      logger.info('[Scheduler] API client creado');
    }

    // 6. Crear SyncEngine con adaptador conectado y API client
    syncEngineInstance = new SyncEngine({
      dataSourceAdapter: adapter,
      apiClient: apiClient,
      delayBetweenBatches: SYNC_CONFIG.DELAY_BETWEEN_BATCHES_MS,
    });

    // 7. Inicializar SyncQueue con el SyncEngine
    initSyncQueue(syncEngineInstance);
    logger.info('[Scheduler] ✅ SyncQueue inicializado');

    // 8. Crear Scheduler
    schedulerInstance = new Scheduler(syncEngineInstance);

    // 9. Cargar jobs desde queries programadas (isScheduled = true)
    await schedulerInstance.initializeFromQueries();

    // 10. Agregar jobs de sistema
    logger.info('[Scheduler] Agregando jobs de sistema...');

    // Job de procesamiento de reintentos (cada 15 minutos = 900 segundos)
    const retryJob = createRetryProcessorJob();
    schedulerInstance.addJob(retryJob);
    logger.info('[Scheduler] Job de reintentos agregado (cada 15 minutos)');

    // Job de limpieza diaria (cada 24 horas = 86400 segundos)
    const cleanupJob = createDailyCleanupJob();
    schedulerInstance.addJob(cleanupJob);
    logger.info('[Scheduler] Job de limpieza agregado (cada 24 horas)');

    // 11. Iniciar scheduler
    schedulerInstance.start();

    logger.info('[Scheduler] ✅ Scheduler iniciado con éxito');
  } catch (error) {
    logger.error({ error }, '[Scheduler] ❌ Error al inicializar scheduler');
    // Si hay error, asegurar que el adaptador se desconecta
    if (adapterInstance) {
      try {
        await adapterInstance.disconnect();
        adapterInstance = null;
      } catch (disconnectError) {
        logger.error({ error: disconnectError }, '[Scheduler] Error al desconectar adaptador');
      }
    }
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
 * Detiene el scheduler y desconecta el adaptador
 */
export async function stopScheduler(): Promise<void> {
  if (schedulerInstance) {
    schedulerInstance.stop();
    logger.info('[Scheduler] ✅ Scheduler detenido');
  }

  // Desconectar adaptador
  if (adapterInstance) {
    try {
      await adapterInstance.disconnect();
      adapterInstance = null;
      logger.info('[Scheduler] ✅ Adaptador desconectado');
    } catch (error) {
      logger.error({ error }, '[Scheduler] Error al desconectar adaptador');
    }
  }

  schedulerInstance = null;
  syncEngineInstance = null;
}

/**
 * Reinicia el scheduler con nueva configuración
 */
export async function restartScheduler(): Promise<void> {
  stopScheduler();
  await initScheduler();
}
