/**
 * Gestor de estado global de sincronizaciones
 * Mantiene el estado de sincronizaciones en progreso para permitir reconexión
 */

import { EntityType, SyncType } from '../types/common.js';
import { logger } from '../utils/logger.js';

/**
 * Estado de una sincronización en progreso
 */
export interface SyncProgress {
  syncId: string;
  entityType: EntityType;
  syncType: SyncType;
  queryId: number;
  status: 'running' | 'completed' | 'failed' | 'canceled';
  startedAt: Date;
  completedAt?: Date;

  // Progreso
  totalRecords?: number;
  processedRecords: number;
  successRecords: number;
  failedRecords: number;

  // Batch progress
  currentBatch: number;
  totalBatches?: number;

  // Error info
  error?: string;

  // Log ID asociado
  logId?: number;

  // AbortController para cancelar requests
  abortController?: AbortController;
}

/**
 * Gestor singleton de estado de sincronizaciones
 */
class SyncStateManager {
  private currentSync: SyncProgress | null = null;
  private syncHistory: SyncProgress[] = [];
  private readonly MAX_HISTORY = 10;

  /**
   * Inicia una nueva sincronización
   */
  startSync(params: {
    syncId: string;
    entityType: EntityType;
    syncType: SyncType;
    queryId: number;
    logId?: number;
  }): void {
    this.currentSync = {
      ...params,
      status: 'running',
      startedAt: new Date(),
      processedRecords: 0,
      successRecords: 0,
      failedRecords: 0,
      currentBatch: 0,
      abortController: new AbortController(),
    };
  }

  /**
   * Actualiza el progreso del sync actual
   */
  updateProgress(update: Partial<SyncProgress>): void {
    if (!this.currentSync) {
      logger.debug('[SyncStateManager] updateProgress: No hay currentSync');
      return;
    }

    // ✅ CRÍTICO: No actualizar un sync ya cancelado
    // Si el sync fue cancelado, ignorar actualizaciones de progreso
    if (this.currentSync.status === 'canceled') {
      logger.info(
        { syncId: this.currentSync.syncId, status: this.currentSync.status },
        '[SyncStateManager] updateProgress: Ignorando actualización porque sync está CANCELADO'
      );
      return;
    }

    logger.debug(
      { syncId: this.currentSync.syncId, status: this.currentSync.status, update },
      '[SyncStateManager] updateProgress: Actualizando progreso'
    );

    this.currentSync = {
      ...this.currentSync,
      ...update,
    };
  }

  /**
   * Finaliza la sincronización actual
   */
  completeSync(status: 'completed' | 'failed' | 'canceled', error?: string): void {
    if (!this.currentSync) {
      logger.debug('[SyncStateManager] completeSync: No hay currentSync');
      return;
    }

    logger.info(
      { syncId: this.currentSync.syncId, currentStatus: this.currentSync.status, newStatus: status },
      '[SyncStateManager] completeSync: Intentando completar sync'
    );

    // ✅ CRÍTICO: No sobrescribir un sync ya cancelado
    // Si el sync ya fue cancelado, mantener ese status
    if (this.currentSync.status === 'canceled' && status !== 'canceled') {
      logger.info(
        { syncId: this.currentSync.syncId, currentStatus: this.currentSync.status, newStatus: status },
        '[SyncStateManager] completeSync: NO sobrescribiendo sync CANCELADO'
      );
      // Sync ya cancelado, no cambiar el status
      return;
    }

    this.currentSync.status = status;
    this.currentSync.completedAt = new Date();
    if (error) {
      this.currentSync.error = error;
    }

    // Mover a historial
    this.syncHistory.unshift(this.currentSync);
    if (this.syncHistory.length > this.MAX_HISTORY) {
      this.syncHistory.pop();
    }

    logger.info(
      { syncId: this.currentSync.syncId, status: this.currentSync.status },
      '[SyncStateManager] completeSync: Sync completado, limpiando currentSync en 5s'
    );

    // Limpiar estado actual después de un delay
    // Esto permite que los clientes vean el resultado final
    setTimeout(() => {
      logger.debug('[SyncStateManager] Limpiando currentSync después del delay');
      this.currentSync = null;
    }, 5000); // 5 segundos
  }

  /**
   * Obtiene el sync actual en progreso
   */
  getCurrentSync(): SyncProgress | null {
    return this.currentSync;
  }

  /**
   * Obtiene el historial de syncs recientes
   */
  getHistory(): SyncProgress[] {
    return [...this.syncHistory];
  }

  /**
   * Verifica si hay un sync en progreso
   */
  isSyncing(): boolean {
    return this.currentSync !== null && this.currentSync.status === 'running';
  }

  /**
   * Cancela el sync actual
   */
  cancelSync(): void {
    if (!this.currentSync) {
      logger.info('[SyncStateManager] cancelSync: No hay currentSync para cancelar');
      return;
    }

    logger.info(
      { syncId: this.currentSync.syncId, statusAntes: this.currentSync.status },
      '[SyncStateManager] cancelSync: Cancelando sync'
    );

    // ✅ CRÍTICO: Abortar ANTES de cambiar el status
    // Esto asegura que las peticiones HTTP en progreso se cancelen
    if (this.currentSync.abortController) {
      logger.info('[SyncStateManager] cancelSync: ✅ Abortando AbortController');
      this.currentSync.abortController.abort();
    }

    // ✅ CRÍTICO: Marcar como cancelado pero NO limpiar currentSync todavía
    // Esto permite que:
    // 1. El checkpoint en batch-processor detecte la cancelación
    // 2. Las peticiones HTTP en progreso puedan usar el abortSignal
    // 3. No se envíen nuevos lotes
    this.currentSync.status = 'canceled';
    this.currentSync.completedAt = new Date();
    this.currentSync.error = 'Sincronización cancelada por el usuario';

    // Guardar en historial
    this.syncHistory.unshift({ ...this.currentSync });
    if (this.syncHistory.length > this.MAX_HISTORY) {
      this.syncHistory.pop();
    }

    logger.info(
      { syncId: this.currentSync.syncId, status: this.currentSync.status },
      '[SyncStateManager] cancelSync: ✅ Sync marcado como CANCELADO (no limpiado todavía)'
    );

    // ✅ Limpiar después de un delay para permitir que el procesamiento se detenga
    setTimeout(() => {
      logger.info('[SyncStateManager] cancelSync: Limpiando currentSync después del delay');
      this.currentSync = null;
    }, 5000); // 5 segundos
  }

  /**
   * Limpia todo el estado (útil para testing)
   */
  reset(): void {
    this.currentSync = null;
    this.syncHistory = [];
  }
}

// Exportar instancia singleton
export const syncStateManager = new SyncStateManager();
