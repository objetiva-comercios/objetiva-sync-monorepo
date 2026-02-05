/**
 * Sistema de Cola de Sincronización
 * Gestiona la ejecución secuencial de queries para evitar concurrencia
 */

import { v4 as uuidv4 } from 'uuid';
import { logger } from '../utils/logger.js';
import type { EntityType } from '../types/common.js';
import type { SyncEngine, SyncOptions } from './sync-engine.js';
import type { SyncResult } from '../types/common.js';
import { getQuery } from '../store/repositories/queries-repo.js';

/**
 * Estados de un sync en cola
 */
export type QueuedSyncStatus = 'queued' | 'running' | 'completed' | 'failed' | 'canceled';

/**
 * Sync encolado
 */
export interface QueuedSync {
  syncId: string;
  queryId: number;
  queryName: string;
  entityType: EntityType;
  options: SyncOptions;
  enqueuedAt: Date;
  startedAt?: Date;
  completedAt?: Date;
  status: QueuedSyncStatus;
  result?: SyncResult;
  error?: string;
}

/**
 * Estado de la cola
 */
export interface QueueStatus {
  currentSync: QueuedSync | null;
  queue: QueuedSync[];
  totalInQueue: number;
  isProcessing: boolean;
}

/**
 * Gestor de cola de sincronización
 * Asegura que solo una query se ejecute a la vez
 */
export class SyncQueue {
  private queue: QueuedSync[] = [];
  private currentSync: QueuedSync | null = null;
  private isProcessing: boolean = false;
  private syncEngine: SyncEngine;

  constructor(syncEngine: SyncEngine) {
    this.syncEngine = syncEngine;
  }

  /**
   * Agrega una query a la cola y retorna el ID de sync
   */
  async enqueue(queryId: number, options: SyncOptions = {}): Promise<string> {
    try {
      // Obtener información de la query
      const query = await getQuery(queryId);
      if (!query) {
        throw new Error(`Query no encontrada: ${queryId}`);
      }

      if (!query.isActive) {
        throw new Error(`Query no está activa: ${query.name}`);
      }

      // Verificar si la query ya está en cola o ejecutándose
      if (this.isQueryInQueue(queryId)) {
        throw new Error(
          `La query "${query.name}" ya está en cola o ejecutándose. Espera a que finalice.`
        );
      }

      // Crear item de cola
      const queuedSync: QueuedSync = {
        syncId: uuidv4(),
        queryId: query.id,
        queryName: query.name,
        entityType: query.entityType as EntityType,
        options,
        enqueuedAt: new Date(),
        status: 'queued',
      };

      // Agregar a la cola
      this.queue.push(queuedSync);

      logger.info(
        `Query encolada: "${query.name}" (ID: ${query.id}) - Posición en cola: ${this.queue.length}`
      );

      // Iniciar procesamiento si no está en curso
      if (!this.isProcessing) {
        void this.processQueue();
      }

      return queuedSync.syncId;
    } catch (error) {
      logger.error(error, `Error al encolar query ${queryId}`);
      throw error;
    }
  }

  /**
   * Obtiene el estado actual de la cola
   */
  getQueueStatus(): QueueStatus {
    return {
      currentSync: this.currentSync,
      queue: [...this.queue], // Copia para evitar mutaciones
      totalInQueue: this.queue.length,
      isProcessing: this.isProcessing,
    };
  }

  /**
   * Verifica si una query está en cola o ejecutándose
   */
  isQueryInQueue(queryId: number): boolean {
    // Verificar si está ejecutándose
    if (this.currentSync?.queryId === queryId && this.currentSync.status === 'running') {
      return true;
    }

    // Verificar si está en cola
    return this.queue.some((item) => item.queryId === queryId && item.status === 'queued');
  }

  /**
   * Obtiene un sync por su ID
   */
  getSyncById(syncId: string): QueuedSync | null {
    if (this.currentSync?.syncId === syncId) {
      return this.currentSync;
    }

    return this.queue.find((item) => item.syncId === syncId) ?? null;
  }

  /**
   * Cancela un sync específico
   * Solo puede cancelar syncs que están en cola (no el que está ejecutándose)
   */
  async cancelSync(syncId: string): Promise<void> {
    try {
      // No se puede cancelar el sync actual que está ejecutándose
      if (this.currentSync?.syncId === syncId && this.currentSync.status === 'running') {
        throw new Error('No se puede cancelar el sync que está ejecutándose actualmente');
      }

      // Buscar en cola
      const index = this.queue.findIndex((item) => item.syncId === syncId);

      if (index === -1) {
        throw new Error(`Sync no encontrado en cola: ${syncId}`);
      }

      const queuedSync = this.queue[index]!;

      if (queuedSync.status !== 'queued') {
        throw new Error(`Solo se pueden cancelar syncs en estado 'queued'`);
      }

      // Marcar como cancelado
      queuedSync.status = 'canceled';
      queuedSync.completedAt = new Date();

      // Remover de la cola
      this.queue.splice(index, 1);

      logger.info(`Sync cancelado: "${queuedSync.queryName}" (${syncId})`);
    } catch (error) {
      logger.error(error, `Error al cancelar sync ${syncId}`);
      throw error;
    }
  }

  /**
   * Cancela el sync que está ejecutándose actualmente
   * Esto marca el sync como cancelado y permite que el SyncEngine lo detecte
   */
  cancelCurrentSync(): void {
    if (this.currentSync && this.currentSync.status === 'running') {
      logger.info(`Cancelando sync en ejecución: "${this.currentSync.queryName}"`);
      this.currentSync.status = 'canceled';
      this.currentSync.completedAt = new Date();
      this.currentSync.error = 'Sincronización cancelada por el usuario';
    }
  }

  /**
   * Verifica si el sync actual fue cancelado
   */
  isCurrentSyncCanceled(): boolean {
    return this.currentSync?.status === 'canceled';
  }

  /**
   * Procesa la cola secuencialmente
   * Solo se ejecuta una query a la vez
   */
  private async processQueue(): Promise<void> {
    // Evitar procesamiento concurrente
    if (this.isProcessing) {
      return;
    }

    this.isProcessing = true;

    try {
      while (this.queue.length > 0) {
        // Obtener siguiente sync de la cola
        const nextSync = this.queue.shift();

        if (!nextSync) {
          break;
        }

        // Verificar si fue cancelado
        if (nextSync.status === 'canceled') {
          continue;
        }

        // Marcar como actual y en ejecución
        this.currentSync = nextSync;
        this.currentSync.status = 'running';
        this.currentSync.startedAt = new Date();

        logger.info(
          `Iniciando sync de query: "${this.currentSync.queryName}" (ID: ${this.currentSync.queryId})`
        );

        try {
          // Ejecutar sincronización usando el método genérico syncQuery del SyncEngine
          // NOTA: Este método será implementado en FASE 4
          const result = await this.executeSyncQuery(
            this.currentSync.queryId,
            this.currentSync.options
          );

          // Marcar como completado
          this.currentSync.status = 'completed';
          this.currentSync.completedAt = new Date();
          this.currentSync.result = result;

          logger.info(
            `Sync completado: "${this.currentSync.queryName}" - ${result.recordsSent} registros enviados`
          );
        } catch (error) {
          // Marcar como fallido
          this.currentSync.status = 'failed';
          this.currentSync.completedAt = new Date();
          this.currentSync.error = error instanceof Error ? error.message : String(error);

          logger.error(
            error,
            `Sync fallido: "${this.currentSync.queryName}" (ID: ${this.currentSync.queryId})`
          );
        }

        // Limpiar sync actual
        this.currentSync = null;
      }
    } finally {
      this.isProcessing = false;
      logger.info('Procesamiento de cola finalizado');
    }
  }

  /**
   * Ejecuta la sincronización de una query usando el método genérico syncQuery
   */
  private async executeSyncQuery(queryId: number, options: SyncOptions): Promise<SyncResult> {
    return await this.syncEngine.syncQuery(queryId, options);
  }

  /**
   * Limpia la cola (solo para testing/debug)
   */
  clearQueue(): void {
    this.queue = [];
    this.currentSync = null;
    this.isProcessing = false;
    logger.info('Cola limpiada');
  }

  /**
   * Obtiene estadísticas de la cola
   */
  getStats(): {
    queued: number;
    running: number;
    total: number;
  } {
    return {
      queued: this.queue.filter((s) => s.status === 'queued').length,
      running: this.currentSync?.status === 'running' ? 1 : 0,
      total: this.queue.length + (this.currentSync ? 1 : 0),
    };
  }
}
