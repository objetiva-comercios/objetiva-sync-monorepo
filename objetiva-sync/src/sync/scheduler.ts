/**
 * Scheduler - Programación automática de sincronizaciones
 * Arquitectura query-based: un job por query programada
 */

import type { SyncEngine } from './sync-engine.js';
import type { SyncOptions } from './sync-engine.js';
import { EntityType, SyncType } from '../types/common.js';
import { logger } from '../utils/logger.js';
import { deleteOldLogs } from '../store/repositories/sync-logs-repo.js';
import { LOG_CONFIG } from '../config/constants.js';
import { getScheduledQueries } from '../store/repositories/queries-repo.js';
import { getSyncQueue } from './sync-queue-instance.js';
import { generateCorrelationId, runWithCorrelationId } from '../lib/correlation.js';

/**
 * Configuración de un job programado (query-based)
 */
export interface ScheduledJob {
  id: string;
  queryId?: number; // NUEVO: ID de la query (para jobs de sync por query)
  queryName?: string; // NUEVO: Nombre de la query (para logs)
  entityType: EntityType | 'all' | 'retries' | 'cleanup';
  intervalSeconds: number; // CAMBIO: de intervalMinutes a intervalSeconds
  enabled: boolean;
  syncOptions?: SyncOptions;
  lastRun?: Date;
  nextRun?: Date;
}

/**
 * Programador de tareas de sincronización
 */
export class Scheduler {
  private syncEngine: SyncEngine;
  private jobs: Map<string, ScheduledJob>;
  private timers: Map<string, NodeJS.Timeout>;
  private isRunning: boolean;

  constructor(syncEngine: SyncEngine) {
    this.syncEngine = syncEngine;
    this.jobs = new Map();
    this.timers = new Map();
    this.isRunning = false;
  }

  /**
   * Inicia el scheduler
   */
  start(): void {
    if (this.isRunning) {
      logger.warn('[Scheduler] Scheduler ya está en ejecución');
      return;
    }

    this.isRunning = true;

    logger.info('[Scheduler] ✅ Scheduler iniciado');

    // Iniciar todos los jobs habilitados
    for (const [jobId, job] of this.jobs.entries()) {
      if (job.enabled) {
        this.startJob(jobId);
      }
    }
  }

  /**
   * Detiene el scheduler
   */
  stop(): void {
    if (!this.isRunning) {
      logger.warn('[Scheduler] Scheduler no está en ejecución');
      return;
    }

    this.isRunning = false;

    logger.info('[Scheduler] Deteniendo scheduler...');

    // Detener todos los jobs
    for (const jobId of this.timers.keys()) {
      this.stopJob(jobId);
    }

    logger.info('[Scheduler] ✅ Scheduler detenido');
  }

  /**
   * Agrega un job al scheduler
   */
  addJob(job: ScheduledJob): void {
    const jobInfo = job.queryId
      ? { jobId: job.id, queryId: job.queryId, queryName: job.queryName, intervalSeconds: job.intervalSeconds }
      : { jobId: job.id, entityType: job.entityType, intervalSeconds: job.intervalSeconds };

    logger.info(jobInfo, '[Scheduler] Agregando job...');

    this.jobs.set(job.id, job);

    // Si el scheduler está corriendo y el job está habilitado, iniciarlo
    if (this.isRunning && job.enabled) {
      this.startJob(job.id);
    }

    logger.info({ jobId: job.id }, '[Scheduler] ✅ Job agregado');
  }

  /**
   * Remueve un job del scheduler
   */
  removeJob(jobId: string): void {
    logger.info({ jobId }, '[Scheduler] Removiendo job...');

    // Detener el job si está corriendo
    this.stopJob(jobId);

    // Remover de la lista
    this.jobs.delete(jobId);

    logger.info({ jobId }, '[Scheduler] ✅ Job removido');
  }

  /**
   * Habilita un job
   */
  enableJob(jobId: string): void {
    const job = this.jobs.get(jobId);

    if (!job) {
      throw new Error(`Job ${jobId} no encontrado`);
    }

    job.enabled = true;

    if (this.isRunning) {
      this.startJob(jobId);
    }

    logger.info({ jobId }, '[Scheduler] ✅ Job habilitado');
  }

  /**
   * Deshabilita un job
   */
  disableJob(jobId: string): void {
    const job = this.jobs.get(jobId);

    if (!job) {
      throw new Error(`Job ${jobId} no encontrado`);
    }

    job.enabled = false;
    this.stopJob(jobId);

    logger.info({ jobId }, '[Scheduler] ✅ Job deshabilitado');
  }

  /**
   * Ejecuta un job manualmente (fuera de programación)
   */
  async runJobNow(jobId: string): Promise<void> {
    const job = this.jobs.get(jobId);

    if (!job) {
      throw new Error(`Job ${jobId} no encontrado`);
    }

    logger.info({ jobId, entityType: job.entityType }, '[Scheduler] Ejecutando job manualmente...');

    await this.executeJob(job);

    logger.info({ jobId }, '[Scheduler] ✅ Job ejecutado manualmente');
  }

  /**
   * Obtiene todos los jobs
   */
  getJobs(): ScheduledJob[] {
    return Array.from(this.jobs.values());
  }

  /**
   * Obtiene un job específico
   */
  getJob(jobId: string): ScheduledJob | undefined {
    return this.jobs.get(jobId);
  }

  /**
   * Obtiene el estado del scheduler
   */
  getStatus(): {
    isRunning: boolean;
    totalJobs: number;
    enabledJobs: number;
    runningJobs: number;
  } {
    return {
      isRunning: this.isRunning,
      totalJobs: this.jobs.size,
      enabledJobs: Array.from(this.jobs.values()).filter((j) => j.enabled).length,
      runningJobs: this.timers.size,
    };
  }

  /**
   * Inicia un job específico
   */
  private startJob(jobId: string): void {
    const job = this.jobs.get(jobId);

    if (!job) {
      logger.error({ jobId }, '[Scheduler] Job no encontrado');
      return;
    }

    // Si ya está corriendo, no hacer nada
    if (this.timers.has(jobId)) {
      logger.warn({ jobId }, '[Scheduler] Job ya está corriendo');
      return;
    }

    // Calcular próxima ejecución (intervalSeconds en milisegundos)
    const intervalMs = job.intervalSeconds * 1000;
    job.nextRun = new Date(Date.now() + intervalMs);

    // Crear timer
    const timer = setInterval(async () => {
      await this.executeJob(job);

      // Actualizar próxima ejecución
      job.nextRun = new Date(Date.now() + intervalMs);
    }, intervalMs);

    this.timers.set(jobId, timer);

    const jobInfo = job.queryName
      ? { jobId, queryName: job.queryName, nextRun: job.nextRun }
      : { jobId, entityType: job.entityType, nextRun: job.nextRun };

    logger.info(
      jobInfo,
      `[Scheduler] ✅ Job iniciado (próxima ejecución: ${job.nextRun.toISOString()})`
    );
  }

  /**
   * Detiene un job específico
   */
  private stopJob(jobId: string): void {
    const timer = this.timers.get(jobId);

    if (timer) {
      clearInterval(timer);
      this.timers.delete(jobId);

      logger.info({ jobId }, '[Scheduler] ✅ Job detenido');
    }
  }

  /**
   * Ejecuta un job (usando SyncQueue para jobs de queries)
   */
  private async executeJob(job: ScheduledJob): Promise<void> {
    // Generate correlation ID for this scheduled job
    const correlationId = generateCorrelationId();

    // Run entire job within correlation context
    await runWithCorrelationId(correlationId, async () => {
      const startTime = Date.now();

      try {
        const logInfo = job.queryName
          ? { jobId: job.id, queryId: job.queryId, queryName: job.queryName, correlationId }
          : { jobId: job.id, entityType: job.entityType, correlationId };

        logger.info(logInfo, `[Scheduler] Ejecutando job: ${job.id}...`);

        job.lastRun = new Date();

        // NUEVO: Si es un job de query, usar SyncQueue
        if (job.queryId) {
          const syncQueue = getSyncQueue();
          await syncQueue.enqueue(job.queryId, job.syncOptions ?? {});

          logger.info(
            { jobId: job.id, queryId: job.queryId, queryName: job.queryName, correlationId },
            `[Scheduler] Query encolada para sincronización`
          );
        }
        // Jobs de sistema (no basados en queries)
        else if (job.entityType === 'all') {
          await this.syncEngine.syncAll(job.syncOptions ?? {});
        } else if (job.entityType === 'retries') {
          await this.syncEngine.processRetries();
        } else if (job.entityType === 'cleanup') {
          // Limpieza de logs antiguos
          const deletedCount = await deleteOldLogs(LOG_CONFIG.RETENTION_DAYS);
          logger.info(
            { deletedCount, retentionDays: LOG_CONFIG.RETENTION_DAYS, correlationId },
            `[Scheduler] Limpieza de logs completada: ${deletedCount} logs eliminados`
          );
        }
        // DEPRECADO: Jobs de entidad legacy (mantener para compatibilidad)
        else {
          logger.warn(
            { jobId: job.id, entityType: job.entityType, correlationId },
            `[Scheduler] ⚠️ Usando método legacy de sincronización por entidad. Considera migrar a query-based.`
          );

          switch (job.entityType) {
            case EntityType.ARTICULO:
              await this.syncEngine.syncArticulos(job.syncOptions ?? {});
              break;

            case EntityType.COMPROBANTE_CABECERA:
              await this.syncEngine.syncComprobantesCabecera(job.syncOptions ?? {});
              break;

            case EntityType.COMPROBANTE_DETALLE:
              await this.syncEngine.syncComprobantesDetalle(job.syncOptions ?? {});
              break;

            case EntityType.COMPROBANTE_PAGO:
              await this.syncEngine.syncComprobantesPago(job.syncOptions ?? {});
              break;

            default:
              logger.warn(
                `[Scheduler] Tipo de entidad no soportado: ${String(job.entityType)}`
              );
          }
        }

        const durationMs = Date.now() - startTime;

        logger.info(
          { jobId: job.id, durationMs, correlationId },
          `[Scheduler] ✅ Job completado: ${job.id} (${durationMs}ms)`
        );
      } catch (error) {
        const durationMs = Date.now() - startTime;

        logger.error(
          { jobId: job.id, error, durationMs, correlationId },
          `[Scheduler] ❌ Error en job: ${job.id}`
        );
      }
    });
  }

  /**
   * Inicializa jobs desde queries programadas (isScheduled = true)
   * NUEVO: Método principal para cargar jobs desde la base de datos
   */
  async initializeFromQueries(): Promise<void> {
    try {
      logger.info('[Scheduler] Cargando jobs desde queries programadas...');

      const scheduledQueries = await getScheduledQueries();

      logger.info(
        { count: scheduledQueries.length },
        `[Scheduler] ${scheduledQueries.length} queries programadas encontradas`
      );

      for (const query of scheduledQueries) {
        const job: ScheduledJob = {
          id: `query-${query.id}-${Date.now()}`,
          queryId: query.id,
          queryName: query.name,
          entityType: query.entityType as EntityType,
          intervalSeconds: query.syncInterval ?? 1800,
          enabled: true,
          syncOptions: { syncType: SyncType.INCREMENTAL, trigger: 'scheduled' },
        };

        this.addJob(job);

        logger.info(
          { queryId: query.id, queryName: query.name, intervalSeconds: query.syncInterval },
          `[Scheduler] Job creado para query: "${query.name}"`
        );
      }

      logger.info(
        { totalJobs: scheduledQueries.length },
        `[Scheduler] ✅ ${scheduledQueries.length} jobs de queries cargados`
      );
    } catch (error) {
      logger.error(error, '[Scheduler] ❌ Error al inicializar jobs desde queries');
      throw error;
    }
  }
}

/**
 * Crea un job de sincronización periódica (LEGACY - usa intervalMinutes)
 * @deprecated Usa scheduler.initializeFromQueries() para jobs basados en queries
 */
export function createSyncJob(
  entityType: EntityType | 'all',
  intervalMinutes: number,
  syncOptions?: SyncOptions
): ScheduledJob {
  return {
    id: `sync-${entityType}-${Date.now()}`,
    entityType,
    intervalSeconds: intervalMinutes * 60, // Convertir minutos a segundos
    enabled: true,
    syncOptions,
  };
}

/**
 * Crea un job de procesamiento de reintentos
 */
export function createRetryJob(intervalSeconds: number): ScheduledJob {
  return {
    id: `retry-processor-${Date.now()}`,
    entityType: 'retries',
    intervalSeconds,
    enabled: true,
  };
}

/**
 * Configuración predefinida: Sincronización incremental cada hora
 * @deprecated Usa scheduler.initializeFromQueries() para cargar jobs desde queries programadas
 */
export function createHourlySyncJobs(): ScheduledJob[] {
  return [
    createSyncJob(EntityType.ARTICULO, 60, { syncType: SyncType.INCREMENTAL }),
    createSyncJob(EntityType.COMPROBANTE_CABECERA, 60, { syncType: SyncType.INCREMENTAL }),
    createSyncJob(EntityType.COMPROBANTE_DETALLE, 60, { syncType: SyncType.INCREMENTAL }),
    createSyncJob(EntityType.COMPROBANTE_PAGO, 60, { syncType: SyncType.INCREMENTAL }),
  ];
}

/**
 * Configuración predefinida: Procesamiento de reintentos cada 15 minutos
 */
export function createRetryProcessorJob(): ScheduledJob {
  return createRetryJob(900); // 15 minutos = 900 segundos
}

/**
 * Crea un job de limpieza de logs antiguos
 */
export function createCleanupJob(intervalSeconds: number = 86400): ScheduledJob {
  return {
    id: `cleanup-logs-${Date.now()}`,
    entityType: 'cleanup',
    intervalSeconds,
    enabled: true,
  };
}

/**
 * Configuración predefinida: Limpieza de logs diaria (cada 24 horas)
 */
export function createDailyCleanupJob(): ScheduledJob {
  return createCleanupJob(86400); // 24 horas = 86400 segundos
}
