/**
 * Sistema de métricas para monitorear sincronizaciones
 */

interface SyncEvent {
  timestamp: Date
  entityType: 'articulo' | 'comprobante' | 'pago' | 'comprobante_cabecera' | 'comprobante_detalle' | 'comprobante_pago'
  comercioId: string
  comercioUsername?: string
  totalReceived: number
  inserted: number
  updated: number
  failed: number
  durationMs: number
  queryId?: number
  queryName?: string
  batchProgress?: string
  status?: string
  syncId?: string
  batchNumber?: number
  totalBatches?: number
}

interface LoginEvent {
  timestamp: Date
  comercioId: string
  comercioUsername: string
  success: boolean
  ipAddress?: string
}

const JOB_TIMEOUT_MS = 30_000 // 30 segundos sin actividad = timeout

interface EntityStats {
  received: number
  inserted: number
  updated: number
  failed: number
  lastBatchSize: number
  lastBatchDurationMs: number
}

interface TrackedJob {
  syncId: string
  entityType: string
  queryName: string
  comercio: string
  startTime: Date
  lastUpdate: Date
  currentBatch: number
  totalBatches: number
  totalReceived: number
  totalInserted: number
  totalUpdated: number
  totalFailed: number
  totalDurationMs: number
  status: string
}

class MetricsCollector {
  private syncEvents: SyncEvent[] = []
  private loginEvents: LoginEvent[] = []
  private cancelledJobs = new Set<string>() // syncIds cancelados explícitamente
  private maxEvents = 1000 // Mantener últimos 1000 eventos

  // Jobs rastreados incrementalmente (se actualizan UNA vez por evento, no se re-computan)
  private trackedJobs = new Map<string, TrackedJob>()

  // Stats acumuladas por tipo de entidad (se resetean manualmente)
  private entityStats: Record<string, EntityStats> = {
    articulo: { received: 0, inserted: 0, updated: 0, failed: 0, lastBatchSize: 0, lastBatchDurationMs: 0 },
    comprobante_cabecera: { received: 0, inserted: 0, updated: 0, failed: 0, lastBatchSize: 0, lastBatchDurationMs: 0 },
    comprobante_detalle: { received: 0, inserted: 0, updated: 0, failed: 0, lastBatchSize: 0, lastBatchDurationMs: 0 },
    comprobante_pago: { received: 0, inserted: 0, updated: 0, failed: 0, lastBatchSize: 0, lastBatchDurationMs: 0 }
  }

  /**
   * Registrar evento de sincronización
   */
  recordSync(event: SyncEvent) {
    this.syncEvents.unshift(event)
    if (this.syncEvents.length > this.maxEvents) {
      this.syncEvents = this.syncEvents.slice(0, this.maxEvents)
    }

    // Actualizar stats acumuladas por entidad
    const entityType = this.normalizeEntityType(event.entityType)
    if (this.entityStats[entityType]) {
      this.entityStats[entityType].received += event.totalReceived
      this.entityStats[entityType].inserted += event.inserted
      this.entityStats[entityType].updated += event.updated
      this.entityStats[entityType].failed += event.failed
      this.entityStats[entityType].lastBatchSize = event.totalReceived
      this.entityStats[entityType].lastBatchDurationMs = event.durationMs
    }

    // Actualizar tracking incremental de jobs (una sola vez por evento)
    if (event.syncId) {
      const existing = this.trackedJobs.get(event.syncId)
      if (!existing) {
        this.trackedJobs.set(event.syncId, {
          syncId: event.syncId,
          entityType: event.entityType,
          queryName: event.queryName || 'Unknown',
          comercio: event.comercioUsername || event.comercioId.substring(0, 8),
          startTime: event.timestamp,
          lastUpdate: event.timestamp,
          currentBatch: event.batchNumber || 1,
          totalBatches: event.totalBatches || 1,
          totalReceived: event.totalReceived,
          totalInserted: event.inserted,
          totalUpdated: event.updated,
          totalFailed: event.failed,
          totalDurationMs: event.durationMs,
          status: event.status || 'in_progress'
        })
      } else {
        // Acumular resultados del batch
        existing.totalReceived += event.totalReceived
        existing.totalInserted += event.inserted
        existing.totalUpdated += event.updated
        existing.totalFailed += event.failed
        existing.totalDurationMs += event.durationMs
        existing.lastUpdate = event.timestamp
        if (event.batchNumber) existing.currentBatch = event.batchNumber
        if (event.status) existing.status = event.status
      }
    }
  }

  /**
   * Normalizar tipo de entidad (mapear aliases)
   */
  private normalizeEntityType(type: string): string {
    const aliases: Record<string, string> = {
      'articulo': 'articulo',
      'comprobante': 'comprobante_cabecera',
      'comprobante_cabecera': 'comprobante_cabecera',
      'comprobante_detalle': 'comprobante_detalle',
      'pago': 'comprobante_pago',
      'comprobante_pago': 'comprobante_pago'
    }
    return aliases[type] || type
  }

  /**
   * Obtener stats por entidad (para el dashboard)
   */
  getEntityStats(): Record<string, EntityStats> {
    return { ...this.entityStats }
  }

  /**
   * Resetear todas las métricas
   */
  reset() {
    this.syncEvents = []
    this.loginEvents = []
    this.cancelledJobs.clear()
    this.trackedJobs.clear()
    this.entityStats = {
      articulo: { received: 0, inserted: 0, updated: 0, failed: 0, lastBatchSize: 0, lastBatchDurationMs: 0 },
      comprobante_cabecera: { received: 0, inserted: 0, updated: 0, failed: 0, lastBatchSize: 0, lastBatchDurationMs: 0 },
      comprobante_detalle: { received: 0, inserted: 0, updated: 0, failed: 0, lastBatchSize: 0, lastBatchDurationMs: 0 },
      comprobante_pago: { received: 0, inserted: 0, updated: 0, failed: 0, lastBatchSize: 0, lastBatchDurationMs: 0 }
    }
  }

  /**
   * Marcar un job como cancelado
   */
  cancelJob(syncId: string) {
    this.cancelledJobs.add(syncId)
  }

  /**
   * Verificar si un job fue cancelado
   */
  isJobCancelled(syncId: string): boolean {
    return this.cancelledJobs.has(syncId)
  }

  /**
   * Registrar evento de login
   */
  recordLogin(event: LoginEvent) {
    this.loginEvents.unshift(event)
    if (this.loginEvents.length > this.maxEvents) {
      this.loginEvents = this.loginEvents.slice(0, this.maxEvents)
    }
  }

  /**
   * Obtener estadísticas generales
   */
  getStats() {
    const now = new Date()
    const last24h = new Date(now.getTime() - 24 * 60 * 60 * 1000)
    const lastHour = new Date(now.getTime() - 60 * 60 * 1000)

    // Filtrar eventos recientes
    const syncs24h = this.syncEvents.filter(e => e.timestamp >= last24h)
    const syncsHour = this.syncEvents.filter(e => e.timestamp >= lastHour)
    const logins24h = this.loginEvents.filter(e => e.timestamp >= last24h)

    // Última sincronización
    const lastSync = this.syncEvents[0]

    // Total por tipo de entidad
    const byEntityType = {
      articulo: syncs24h.filter(e => e.entityType === 'articulo').length,
      comprobante: syncs24h.filter(e => e.entityType === 'comprobante').length,
      pago: syncs24h.filter(e => e.entityType === 'pago').length,
      comprobante_cabecera: syncs24h.filter(e => e.entityType === 'comprobante_cabecera').length,
      comprobante_detalle: syncs24h.filter(e => e.entityType === 'comprobante_detalle').length,
      comprobante_pago: syncs24h.filter(e => e.entityType === 'comprobante_pago').length
    }

    // Totales de registros
    const totalReceived24h = syncs24h.reduce((sum, e) => sum + e.totalReceived, 0)
    const totalInserted24h = syncs24h.reduce((sum, e) => sum + e.inserted, 0)
    const totalUpdated24h = syncs24h.reduce((sum, e) => sum + e.updated, 0)
    const totalFailed24h = syncs24h.reduce((sum, e) => sum + e.failed, 0)

    // Comercios activos
    const activeStores = new Set(syncs24h.map(e => e.comercioId)).size

    // Duración promedio
    const avgDuration = syncs24h.length > 0
      ? syncs24h.reduce((sum, e) => sum + e.durationMs, 0) / syncs24h.length
      : 0

    // Logins exitosos vs fallidos
    const successfulLogins = logins24h.filter(e => e.success).length
    const failedLogins = logins24h.filter(e => !e.success).length

    return {
      syncEvents: {
        total24h: syncs24h.length,
        lastHour: syncsHour.length,
        byType: byEntityType,
        last: lastSync ? {
          timestamp: lastSync.timestamp,
          entityType: lastSync.entityType,
          comercio: lastSync.comercioUsername || lastSync.comercioId,
          received: lastSync.totalReceived,
          inserted: lastSync.inserted,
          updated: lastSync.updated,
          failed: lastSync.failed,
          durationMs: lastSync.durationMs,
          queryName: lastSync.queryName,
          batchProgress: lastSync.batchProgress,
          status: lastSync.status
        } : null
      },
      records: {
        received24h: totalReceived24h,
        inserted24h: totalInserted24h,
        updated24h: totalUpdated24h,
        failed24h: totalFailed24h
      },
      performance: {
        avgDurationMs: Math.round(avgDuration),
        avgDurationSec: (avgDuration / 1000).toFixed(2)
      },
      stores: {
        active24h: activeStores
      },
      auth: {
        successfulLogins24h: successfulLogins,
        failedLogins24h: failedLogins
      }
    }
  }

  /**
   * Obtener eventos recientes
   */
  getRecentEvents(limit = 20) {
    return {
      syncs: this.syncEvents.slice(0, limit).map(e => ({
        timestamp: e.timestamp,
        type: e.entityType,
        comercio: e.comercioUsername || e.comercioId.substring(0, 8),
        received: e.totalReceived,
        inserted: e.inserted,
        updated: e.updated,
        failed: e.failed,
        duration: `${(e.durationMs / 1000).toFixed(2)}s`,
        durationMs: e.durationMs,
        queryName: e.queryName,
        batchProgress: e.batchProgress,
        status: e.status,
        syncId: e.syncId,
        batchNumber: e.batchNumber,
        totalBatches: e.totalBatches
      })),
      logins: this.loginEvents.slice(0, limit).map(e => ({
        timestamp: e.timestamp,
        comercio: e.comercioUsername,
        success: e.success,
        ip: e.ipAddress
      }))
    }
  }

  /**
   * Obtener jobs de sincronización (lectura del mapa incremental, sin re-agregación)
   */
  getActiveJobs(limit = 5) {
    const now = Date.now()

    // Aplicar estados de cancelación y timeout sobre copias para no mutar el mapa
    const jobs = Array.from(this.trackedJobs.values()).map(job => {
      let status = job.status
      if (status === 'in_progress') {
        if (this.cancelledJobs.has(job.syncId)) {
          status = 'cancelled'
        } else if (now - job.lastUpdate.getTime() > JOB_TIMEOUT_MS) {
          status = 'timeout'
        }
      }
      return { ...job, status }
    })

    // Ordenar por última actualización y limitar
    return jobs
      .sort((a, b) => b.lastUpdate.getTime() - a.lastUpdate.getTime())
      .slice(0, limit)
  }

  /**
   * Limpiar eventos antiguos (llamar periódicamente)
   */
  cleanup() {
    const cutoff = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) // 7 días
    this.syncEvents = this.syncEvents.filter(e => e.timestamp >= cutoff)
    this.loginEvents = this.loginEvents.filter(e => e.timestamp >= cutoff)
    // Limpiar jobs completados antiguos
    for (const [syncId, job] of this.trackedJobs) {
      if (job.lastUpdate < cutoff) {
        this.trackedJobs.delete(syncId)
      }
    }
  }
}

// Singleton
export const metrics = new MetricsCollector()

// Limpiar cada hora
setInterval(() => {
  metrics.cleanup()
}, 60 * 60 * 1000)
