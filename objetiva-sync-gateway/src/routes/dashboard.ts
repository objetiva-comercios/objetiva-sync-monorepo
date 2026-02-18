import type { FastifyInstance } from 'fastify'
import { systemState } from '../server.js'
import { metrics } from '../lib/metrics.js'
import os from 'os'

/**
 * Rutas para el dashboard React
 */
export async function registerDashboardRoutes(app: FastifyInstance) {
  /**
   * GET /api/stats - Estadísticas de ingesta en tiempo real
   */
  app.get('/api/stats', async (_request, reply) => {
    const stats = metrics.getStats()
    const recentEvents = metrics.getRecentEvents(20)

    // Stats reales por entidad (no más porcentajes hardcodeados)
    const realEntityStats = metrics.getEntityStats()
    const entityStats = [
      {
        entity: 'articulos',
        total: realEntityStats.articulo.received,
        processed: realEntityStats.articulo.inserted + realEntityStats.articulo.updated,
        failed: realEntityStats.articulo.failed,
        syncs: stats.syncEvents.byType.articulo,
        lastBatchSize: realEntityStats.articulo.lastBatchSize,
        lastBatchDurationMs: realEntityStats.articulo.lastBatchDurationMs
      },
      {
        entity: 'comprobantes_cabecera',
        total: realEntityStats.comprobante_cabecera.received,
        processed: realEntityStats.comprobante_cabecera.inserted + realEntityStats.comprobante_cabecera.updated,
        failed: realEntityStats.comprobante_cabecera.failed,
        syncs: stats.syncEvents.byType.comprobante_cabecera,
        lastBatchSize: realEntityStats.comprobante_cabecera.lastBatchSize,
        lastBatchDurationMs: realEntityStats.comprobante_cabecera.lastBatchDurationMs
      },
      {
        entity: 'comprobantes_detalle',
        total: realEntityStats.comprobante_detalle.received,
        processed: realEntityStats.comprobante_detalle.inserted + realEntityStats.comprobante_detalle.updated,
        failed: realEntityStats.comprobante_detalle.failed,
        syncs: stats.syncEvents.byType.comprobante_detalle,
        lastBatchSize: realEntityStats.comprobante_detalle.lastBatchSize,
        lastBatchDurationMs: realEntityStats.comprobante_detalle.lastBatchDurationMs
      },
      {
        entity: 'comprobantes_pagos',
        total: realEntityStats.comprobante_pago.received,
        processed: realEntityStats.comprobante_pago.inserted + realEntityStats.comprobante_pago.updated,
        failed: realEntityStats.comprobante_pago.failed,
        syncs: stats.syncEvents.byType.comprobante_pago,
        lastBatchSize: realEntityStats.comprobante_pago.lastBatchSize,
        lastBatchDurationMs: realEntityStats.comprobante_pago.lastBatchDurationMs
      }
    ]

    // Actividad reciente - formato compatible con ActivityFeed
    const activity = recentEvents.syncs.slice(0, 10).map((s, i) => ({
      id: `activity_${s.timestamp.getTime()}_${i}`,
      type: s.failed > 0 ? 'error' : 'ingestion' as 'ingestion' | 'error' | 'warning' | 'info',
      timestamp: s.timestamp.toISOString(),
      entity: s.type,
      message: `${s.received} recibidos: ${s.inserted} insertados, ${s.updated} actualizados` + (s.failed > 0 ? `, ${s.failed} fallidos` : '')
    }))

    // Jobs de sincronización agrupados (operaciones completas, no batches individuales)
    const activeJobs = metrics.getActiveJobs(5)
    const batches = activeJobs.map(job => {
      // Mapear status del API al formato esperado por el frontend
      let status: 'success' | 'failed' | 'partial' | 'cancelled' | 'timeout' = 'success'
      if (job.status === 'cancelled') {
        status = 'cancelled'
      } else if (job.status === 'timeout') {
        status = 'timeout'
      } else if (job.status === 'in_progress') {
        status = 'partial' // Mostrar como parcial mientras está en progreso
      } else if (job.totalFailed > 0 && job.totalFailed === job.totalReceived) {
        status = 'failed'
      } else if (job.totalFailed > 0) {
        status = 'partial'
      }

      // Calcular tiempo restante estimado
      const remainingBatches = job.totalBatches - job.currentBatch
      const avgTimePerBatch = job.currentBatch > 0 ? job.totalDurationMs / job.currentBatch : 0
      const estimatedRemainingMs = remainingBatches > 0 ? Math.round(avgTimePerBatch * remainingBatches) : 0

      return {
        id: job.syncId,
        entity: job.entityType,
        queryName: job.queryName,
        timestamp: job.startTime.toISOString(),
        size: job.totalReceived,
        processed: job.totalInserted + job.totalUpdated,
        failed: job.totalFailed,
        status,
        duration: job.totalDurationMs,
        estimatedRemainingMs, // Tiempo restante estimado en ms
        // Progreso del job
        currentBatch: job.currentBatch,
        totalBatches: job.totalBatches,
        isComplete: job.status === 'completed'
      }
    })

    // Calcular tasa de registros por segundo (últimos 5 minutos)
    const last5min = new Date(Date.now() - 5 * 60 * 1000)
    const recentSyncs = recentEvents.syncs.filter(s => new Date(s.timestamp) >= last5min)
    const recentRecords = recentSyncs.reduce((sum, s) => sum + s.received, 0)
    const ratePerSecond = recentRecords > 0 ? (recentRecords / (5 * 60)).toFixed(1) : '0.0'

    return reply.send({
      stats: {
        total: stats.records.received24h,
        processed: stats.records.inserted24h + stats.records.updated24h,
        failed: stats.records.failed24h,
        ratePerSecond: parseFloat(ratePerSecond)
      },
      entities: entityStats,
      activity,
      batches
    })
  })

  /**
   * POST /api/sync/:syncId/cancel - Marcar un job como cancelado
   */
  app.post('/api/sync/:syncId/cancel', async (request, reply) => {
    const { syncId } = request.params as { syncId: string }
    metrics.cancelJob(syncId)
    return reply.send({ success: true, syncId, status: 'cancelled' })
  })

  /**
   * POST /api/metrics/reset - Resetear todas las métricas
   */
  app.post('/api/metrics/reset', async (_request, reply) => {
    metrics.reset()
    return reply.send({ success: true, message: 'Todas las métricas han sido reseteadas' })
  })

  /**
   * GET /api/status - Estado del sistema
   */
  app.get('/api/status', async (_request, reply) => {
    // Uptime
    const uptimeMs = Date.now() - systemState.startTime.getTime()

    // Uso de CPU (aproximado - mock por ahora)
    const cpuUsage = Math.min(100, Math.round(Math.random() * 30 + 15))

    // Uso de memoria
    const totalMem = os.totalmem()
    const freeMem = os.freemem()
    const memoryUsage = Math.round(((totalMem - freeMem) / totalMem) * 100)

    // Conexiones activas (mock - Fastify no expone esto fácilmente)
    const activeConnections = Math.floor(Math.random() * 10) + 1

    // Estado general
    let status: 'healthy' | 'degraded' | 'down' = 'healthy'
    if (!systemState.dbConnected) {
      status = 'down'
    } else if (cpuUsage > 80 || memoryUsage > 90) {
      status = 'degraded'
    }

    return reply.send({
      status,
      uptime: Math.floor(uptimeMs / 1000), // en segundos
      cpuUsage,
      memoryUsage,
      activeConnections,
      dbConnected: systemState.dbConnected
    })
  })
}
