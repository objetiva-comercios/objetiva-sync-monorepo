import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import {
  comprobantesCabeceraSchema,
  comprobantesDetalleSchema,
  comprobantesPagoSchema
} from '@objetiva/shared/schemas'
import { prisma } from '../lib/prisma.js'

// Batch schema wrappers (property names match existing route expectations)
const ComprobanteCabeceraBatchSchema = z.object({
  comprobantes_cabecera: z.array(comprobantesCabeceraSchema)
})
const ComprobanteDetalleBatchSchema = z.object({
  comprobantes_detalle: z.array(comprobantesDetalleSchema)
})
const ComprobantePagosBatchSchema = z.object({
  comprobantes_pagos: z.array(comprobantesPagoSchema)
})
import { authenticate } from '../middleware/auth.js'
import { IngestionService } from '../services/ingestion.js'
import { logger } from '../lib/logger.js'
import { metrics } from '../lib/metrics.js'
import { jobTracker } from '../lib/job-tracker.js'
import { syncDuration, syncRecordsTotal } from '../lib/prometheus.js'

export async function registerComprobantesRoutes(app: FastifyInstance) {
  /**
   * Endpoint para comprobantes cabecera
   */
  app.post(
    '/api/comprobantes/cabecera/batch',
    { preHandler: authenticate },
    async (request, reply) => {
      const { comprobantes_cabecera } = ComprobanteCabeceraBatchSchema.parse(request.body)

      // Get origin source for Prometheus metrics (defaults to 'unknown')
      const sourceId = (request.headers['x-origin-source'] as string) || 'unknown'

      // Start Prometheus timer for sync duration tracking
      const endSyncTimer = syncDuration.startTimer({
        entity_type: 'comprobante_cabecera',
        source_id: sourceId,
        sync_type: 'batch'
      })

      const startTime = Date.now()

      // Leer headers de metadata
      const syncId = request.headers['x-sync-id'] as string | undefined
      const queryId = request.headers['x-query-id'] as string | undefined
      const queryName = request.headers['x-query-name'] as string | undefined
      const batchNumber = request.headers['x-batch-number'] as string | undefined
      const totalBatches = request.headers['x-total-batches'] as string | undefined
      const originSource = request.headers['x-origin-source'] as string | undefined

      logger.info(
        { count: comprobantes_cabecera.length, username: request.user.username, syncId, queryId, queryName, batchNumber, totalBatches, originSource },
        'Recibiendo batch de comprobantes cabecera'
      )

      // Build metadata for logging and origin tracking
      const metadata = syncId && queryId && batchNumber && totalBatches ? {
        syncId,
        queryId: parseInt(queryId, 10),
        queryName,
        batchNumber: parseInt(batchNumber, 10),
        totalBatches: parseInt(totalBatches, 10),
        originSource
      } : (originSource ? { originSource } : undefined)

      try {
        const result = await IngestionService.ingestComprobantesCabecera(
          prisma,
          comprobantes_cabecera,
          metadata
        )

        const durationMs = Date.now() - startTime

        // Record Prometheus metrics for sync records
        if (result.inserted > 0) {
          syncRecordsTotal.inc({ entity_type: 'comprobante_cabecera', source_id: sourceId, operation: 'inserted' }, result.inserted)
        }
        if (result.updated > 0) {
          syncRecordsTotal.inc({ entity_type: 'comprobante_cabecera', source_id: sourceId, operation: 'updated' }, result.updated)
        }
        if (result.errors.length > 0) {
          syncRecordsTotal.inc({ entity_type: 'comprobante_cabecera', source_id: sourceId, operation: 'failed' }, result.errors.length)
        }

        // Si tenemos metadata de job, usar jobTracker
        if (syncId && queryId && queryName && batchNumber && totalBatches) {
          const { job, isLastBatch } = jobTracker.trackBatch({
            syncId,
            queryId: parseInt(queryId, 10),
            queryName,
            entityType: 'comprobante_cabecera',
            comercioId: 'system',
            comercioUsername: request.user.username,
            batchNumber: parseInt(batchNumber, 10),
            totalBatches: parseInt(totalBatches, 10),
            result: {
              totalReceived: comprobantes_cabecera.length,
              inserted: result.inserted,
              updated: result.updated,
              failed: result.errors.length,
              durationMs
            }
          })

          // Registrar en metrics solo si hay datos reales
          if (comprobantes_cabecera?.length > 0) metrics.recordSync({
            timestamp: new Date(),
            entityType: 'comprobante_cabecera',
            comercioId: job.comercioId,
            comercioUsername: job.comercioUsername,
            totalReceived: comprobantes_cabecera.length,
            inserted: result.inserted,
            updated: result.updated,
            failed: result.errors.length,
            durationMs,
            queryId: job.queryId,
            queryName: job.queryName,
            batchProgress: `${job.receivedBatches}/${job.totalBatches}`,
            status: isLastBatch ? 'completed' : 'in_progress',
            syncId,
            batchNumber: job.receivedBatches,
            totalBatches: job.totalBatches
          })

          if (isLastBatch) {
            logger.info({ syncId, queryName, totalBatches: job.totalBatches, totalReceived: job.totalReceived, inserted: job.inserted, updated: job.updated }, 'Job de sincronización completado')
          }
        } else if (comprobantes_cabecera.length > 0) {
          // Modo legacy sin metadata
          metrics.recordSync({
            timestamp: new Date(),
            entityType: 'comprobante_cabecera',
            comercioId: 'system',
            comercioUsername: request.user.username,
            totalReceived: comprobantes_cabecera.length,
            inserted: result.inserted,
            updated: result.updated,
            failed: result.errors.length,
            durationMs
          })
        }

        const hasErrors = result.errors.length > 0

        return reply.status(hasErrors ? 207 : 200).send({
          success: result.errors.length === 0,
          message: `Procesados ${result.inserted + result.updated} comprobantes cabecera`,
          result: {
            total_received: comprobantes_cabecera.length,
            inserted: result.inserted,
            updated: result.updated,
            failed: result.errors.length
          },
          errors: result.errors.length > 0 ? result.errors : undefined
        })
      } finally {
        // Always record sync duration (even on error)
        endSyncTimer()
      }
    }
  )

  /**
   * Endpoint para comprobantes detalle
   */
  app.post(
    '/api/comprobantes/detalle/batch',
    { preHandler: authenticate },
    async (request, reply) => {
      const { comprobantes_detalle } = ComprobanteDetalleBatchSchema.parse(request.body)

      // Get origin source for Prometheus metrics (defaults to 'unknown')
      const sourceId = (request.headers['x-origin-source'] as string) || 'unknown'

      // Start Prometheus timer for sync duration tracking
      const endSyncTimer = syncDuration.startTimer({
        entity_type: 'comprobante_detalle',
        source_id: sourceId,
        sync_type: 'batch'
      })

      const startTime = Date.now()

      // Leer headers de metadata
      const syncId = request.headers['x-sync-id'] as string | undefined
      const queryId = request.headers['x-query-id'] as string | undefined
      const queryName = request.headers['x-query-name'] as string | undefined
      const batchNumber = request.headers['x-batch-number'] as string | undefined
      const totalBatches = request.headers['x-total-batches'] as string | undefined
      const originSource = request.headers['x-origin-source'] as string | undefined

      logger.info(
        { count: comprobantes_detalle.length, username: request.user.username, syncId, queryId, queryName, batchNumber, totalBatches, originSource },
        'Recibiendo batch de comprobantes detalle'
      )

      // Build metadata for logging and origin tracking
      const metadata = syncId && queryId && batchNumber && totalBatches ? {
        syncId,
        queryId: parseInt(queryId, 10),
        queryName,
        batchNumber: parseInt(batchNumber, 10),
        totalBatches: parseInt(totalBatches, 10),
        originSource
      } : (originSource ? { originSource } : undefined)

      try {
        const result = await IngestionService.ingestComprobantesDetalle(
          prisma,
          comprobantes_detalle,
          metadata
        )

        const durationMs = Date.now() - startTime

        // Record Prometheus metrics for sync records
        if (result.inserted > 0) {
          syncRecordsTotal.inc({ entity_type: 'comprobante_detalle', source_id: sourceId, operation: 'inserted' }, result.inserted)
        }
        if (result.updated > 0) {
          syncRecordsTotal.inc({ entity_type: 'comprobante_detalle', source_id: sourceId, operation: 'updated' }, result.updated)
        }
        if (result.errors.length > 0) {
          syncRecordsTotal.inc({ entity_type: 'comprobante_detalle', source_id: sourceId, operation: 'failed' }, result.errors.length)
        }

        // Si tenemos metadata de job, usar jobTracker
        if (syncId && queryId && queryName && batchNumber && totalBatches) {
          const { job, isLastBatch } = jobTracker.trackBatch({
            syncId,
            queryId: parseInt(queryId, 10),
            queryName,
            entityType: 'comprobante_detalle',
            comercioId: 'system',
            comercioUsername: request.user.username,
            batchNumber: parseInt(batchNumber, 10),
            totalBatches: parseInt(totalBatches, 10),
            result: {
              totalReceived: comprobantes_detalle.length,
              inserted: result.inserted,
              updated: result.updated,
              failed: result.errors.length,
              durationMs
            }
          })

          // Registrar en metrics solo si hay datos reales
          if (comprobantes_detalle?.length > 0) metrics.recordSync({
            timestamp: new Date(),
            entityType: 'comprobante_detalle',
            comercioId: job.comercioId,
            comercioUsername: job.comercioUsername,
            totalReceived: comprobantes_detalle.length,
            inserted: result.inserted,
            updated: result.updated,
            failed: result.errors.length,
            durationMs,
            queryId: job.queryId,
            queryName: job.queryName,
            batchProgress: `${job.receivedBatches}/${job.totalBatches}`,
            status: isLastBatch ? 'completed' : 'in_progress',
            syncId,
            batchNumber: job.receivedBatches,
            totalBatches: job.totalBatches
          })

          if (isLastBatch) {
            logger.info({ syncId, queryName, totalBatches: job.totalBatches, totalReceived: job.totalReceived, inserted: job.inserted, updated: job.updated }, 'Job de sincronización completado')
          }
        } else if (comprobantes_detalle.length > 0) {
          // Modo legacy sin metadata
          metrics.recordSync({
            timestamp: new Date(),
            entityType: 'comprobante_detalle',
            comercioId: 'system',
            comercioUsername: request.user.username,
            totalReceived: comprobantes_detalle.length,
            inserted: result.inserted,
            updated: result.updated,
            failed: result.errors.length,
            durationMs
          })
        }

        const hasErrors = result.errors.length > 0

        return reply.status(hasErrors ? 207 : 200).send({
          success: result.errors.length === 0,
          message: `Procesados ${result.inserted + result.updated} comprobantes detalle`,
          result: {
            total_received: comprobantes_detalle.length,
            inserted: result.inserted,
            updated: result.updated,
            failed: result.errors.length
          },
          errors: result.errors.length > 0 ? result.errors : undefined
        })
      } finally {
        // Always record sync duration (even on error)
        endSyncTimer()
      }
    }
  )

  /**
   * Endpoint para comprobantes pagos
   */
  app.post(
    '/api/comprobantes/pagos/batch',
    { preHandler: authenticate },
    async (request, reply) => {
      const { comprobantes_pagos } = ComprobantePagosBatchSchema.parse(request.body)

      // Get origin source for Prometheus metrics (defaults to 'unknown')
      const sourceId = (request.headers['x-origin-source'] as string) || 'unknown'

      // Start Prometheus timer for sync duration tracking
      const endSyncTimer = syncDuration.startTimer({
        entity_type: 'comprobante_pago',
        source_id: sourceId,
        sync_type: 'batch'
      })

      const startTime = Date.now()

      // Leer headers de metadata
      const syncId = request.headers['x-sync-id'] as string | undefined
      const queryId = request.headers['x-query-id'] as string | undefined
      const queryName = request.headers['x-query-name'] as string | undefined
      const batchNumber = request.headers['x-batch-number'] as string | undefined
      const totalBatches = request.headers['x-total-batches'] as string | undefined
      const originSource = request.headers['x-origin-source'] as string | undefined

      logger.info(
        { count: comprobantes_pagos.length, username: request.user.username, syncId, queryId, queryName, batchNumber, totalBatches, originSource },
        'Recibiendo batch de comprobantes pagos'
      )

      // Build metadata for logging and origin tracking
      const metadata = syncId && queryId && batchNumber && totalBatches ? {
        syncId,
        queryId: parseInt(queryId, 10),
        queryName,
        batchNumber: parseInt(batchNumber, 10),
        totalBatches: parseInt(totalBatches, 10),
        originSource
      } : (originSource ? { originSource } : undefined)

      try {
        const result = await IngestionService.ingestComprobantesPagos(
          prisma,
          comprobantes_pagos,
          metadata
        )

        const durationMs = Date.now() - startTime

        // Record Prometheus metrics for sync records
        if (result.inserted > 0) {
          syncRecordsTotal.inc({ entity_type: 'comprobante_pago', source_id: sourceId, operation: 'inserted' }, result.inserted)
        }
        if (result.updated > 0) {
          syncRecordsTotal.inc({ entity_type: 'comprobante_pago', source_id: sourceId, operation: 'updated' }, result.updated)
        }
        if (result.errors.length > 0) {
          syncRecordsTotal.inc({ entity_type: 'comprobante_pago', source_id: sourceId, operation: 'failed' }, result.errors.length)
        }

        // Si tenemos metadata de job, usar jobTracker
        if (syncId && queryId && queryName && batchNumber && totalBatches) {
          const { job, isLastBatch } = jobTracker.trackBatch({
            syncId,
            queryId: parseInt(queryId, 10),
            queryName,
            entityType: 'comprobante_pago',
            comercioId: 'system',
            comercioUsername: request.user.username,
            batchNumber: parseInt(batchNumber, 10),
            totalBatches: parseInt(totalBatches, 10),
            result: {
              totalReceived: comprobantes_pagos.length,
              inserted: result.inserted,
              updated: result.updated,
              failed: result.errors.length,
              durationMs
            }
          })

          // Registrar en metrics solo si hay datos reales
          if (comprobantes_pagos?.length > 0) metrics.recordSync({
            timestamp: new Date(),
            entityType: 'comprobante_pago',
            comercioId: job.comercioId,
            comercioUsername: job.comercioUsername,
            totalReceived: comprobantes_pagos.length,
            inserted: result.inserted,
            updated: result.updated,
            failed: result.errors.length,
            durationMs,
            queryId: job.queryId,
            queryName: job.queryName,
            batchProgress: `${job.receivedBatches}/${job.totalBatches}`,
            status: isLastBatch ? 'completed' : 'in_progress',
            syncId,
            batchNumber: job.receivedBatches,
            totalBatches: job.totalBatches
          })

          if (isLastBatch) {
            logger.info({ syncId, queryName, totalBatches: job.totalBatches, totalReceived: job.totalReceived, inserted: job.inserted, updated: job.updated }, 'Job de sincronización completado')
          }
        } else if (comprobantes_pagos.length > 0) {
          // Modo legacy sin metadata
          metrics.recordSync({
            timestamp: new Date(),
            entityType: 'comprobante_pago',
            comercioId: 'system',
            comercioUsername: request.user.username,
            totalReceived: comprobantes_pagos.length,
            inserted: result.inserted,
            updated: result.updated,
            failed: result.errors.length,
            durationMs
          })
        }

        const hasErrors = result.errors.length > 0

        return reply.status(hasErrors ? 207 : 200).send({
          success: result.errors.length === 0,
          message: `Procesados ${result.inserted + result.updated} comprobantes pagos`,
          result: {
            total_received: comprobantes_pagos.length,
            inserted: result.inserted,
            updated: result.updated,
            failed: result.errors.length
          },
          errors: result.errors.length > 0 ? result.errors : undefined
        })
      } finally {
        // Always record sync duration (even on error)
        endSyncTimer()
      }
    }
  )
}
