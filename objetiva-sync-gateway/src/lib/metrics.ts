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
}

interface LoginEvent {
  timestamp: Date
  comercioId: string
  comercioUsername: string
  success: boolean
  ipAddress?: string
}

class MetricsCollector {
  private syncEvents: SyncEvent[] = []
  private loginEvents: LoginEvent[] = []
  private maxEvents = 1000 // Mantener últimos 1000 eventos

  /**
   * Registrar evento de sincronización
   */
  recordSync(event: SyncEvent) {
    this.syncEvents.unshift(event)
    if (this.syncEvents.length > this.maxEvents) {
      this.syncEvents = this.syncEvents.slice(0, this.maxEvents)
    }
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
        queryName: e.queryName,
        batchProgress: e.batchProgress,
        status: e.status
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
   * Limpiar eventos antiguos (llamar periódicamente)
   */
  cleanup() {
    const cutoff = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) // 7 días
    this.syncEvents = this.syncEvents.filter(e => e.timestamp >= cutoff)
    this.loginEvents = this.loginEvents.filter(e => e.timestamp >= cutoff)
  }
}

// Singleton
export const metrics = new MetricsCollector()

// Limpiar cada hora
setInterval(() => {
  metrics.cleanup()
}, 60 * 60 * 1000)
