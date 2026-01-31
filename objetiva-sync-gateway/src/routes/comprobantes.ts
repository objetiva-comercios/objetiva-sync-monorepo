import type { FastifyInstance } from 'fastify'
import {
  ComprobanteCabeceraBatchSchema,
  ComprobanteDetalleBatchSchema,
  ComprobantePagosBatchSchema
} from '../../shared/schemas/index.js'
import { prisma } from '../lib/prisma.js'
import { authenticate } from '../middleware/auth.js'
import { IngestionService } from '../services/ingestion.js'
import { logger } from '../lib/logger.js'
import { metrics } from '../lib/metrics.js'
import { jobTracker } from '../lib/job-tracker.js'

export async function registerComprobantesRoutes(app: FastifyInstance) {
  /**
   * Endpoint para comprobantes cabecera
   */
  app.post(
    '/api/comprobantes/cabecera/batch',
    { preHandler: authenticate },
    async (request, reply) => {
      const startTime = Date.now()
      const { comprobantes_cabecera } = ComprobanteCabeceraBatchSchema.parse(request.body)

      // Leer headers de metadata
      const syncId = request.headers['x-sync-id'] as string | undefined
      const queryId = request.headers['x-query-id'] as string | undefined
      const queryName = request.headers['x-query-name'] as string | undefined
      const batchNumber = request.headers['x-batch-number'] as string | undefined
      const totalBatches = request.headers['x-total-batches'] as string | undefined

      logger.info(
        { count: comprobantes_cabecera.length, username: request.user.username, syncId, queryId, queryName, batchNumber, totalBatches },
        'Recibiendo batch de comprobantes cabecera'
      )

      // Build metadata for logging
      const metadata = syncId && queryId && batchNumber && totalBatches ? {
        syncId,
        queryId: parseInt(queryId, 10),
        queryName,
        batchNumber: parseInt(batchNumber, 10),
        totalBatches: parseInt(totalBatches, 10)
      } : undefined

      const result = await IngestionService.ingestComprobantesCabecera(
        prisma,
        comprobantes_cabecera,
        metadata
      )

      const durationMs = Date.now() - startTime

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

        if (isLastBatch) {
          metrics.recordSync({
            timestamp: new Date(),
            entityType: 'comprobante_cabecera',
            comercioId: job.comercioId,
            comercioUsername: job.comercioUsername,
            totalReceived: job.totalReceived,
            inserted: job.inserted,
            updated: job.updated,
            failed: job.failed,
            durationMs: job.totalDurationMs,
            queryId: job.queryId,
            queryName: job.queryName,
            batchProgress: `${job.receivedBatches}/${job.totalBatches}`,
            status: 'completed'
          })

          logger.info({ syncId, queryName, totalBatches: job.totalBatches, totalReceived: job.totalReceived, inserted: job.inserted, updated: job.updated }, 'Job de sincronización completado')
        }
      } else {
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
    }
  )

  /**
   * Endpoint para comprobantes detalle
   */
  app.post(
    '/api/comprobantes/detalle/batch',
    { preHandler: authenticate },
    async (request, reply) => {
      const startTime = Date.now()
      const { comprobantes_detalle } = ComprobanteDetalleBatchSchema.parse(request.body)

      // Leer headers de metadata
      const syncId = request.headers['x-sync-id'] as string | undefined
      const queryId = request.headers['x-query-id'] as string | undefined
      const queryName = request.headers['x-query-name'] as string | undefined
      const batchNumber = request.headers['x-batch-number'] as string | undefined
      const totalBatches = request.headers['x-total-batches'] as string | undefined

      logger.info(
        { count: comprobantes_detalle.length, username: request.user.username, syncId, queryId, queryName, batchNumber, totalBatches },
        'Recibiendo batch de comprobantes detalle'
      )

      // Build metadata for logging
      const metadata = syncId && queryId && batchNumber && totalBatches ? {
        syncId,
        queryId: parseInt(queryId, 10),
        queryName,
        batchNumber: parseInt(batchNumber, 10),
        totalBatches: parseInt(totalBatches, 10)
      } : undefined

      const result = await IngestionService.ingestComprobantesDetalle(
        prisma,
        comprobantes_detalle,
        metadata
      )

      const durationMs = Date.now() - startTime

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

        if (isLastBatch) {
          metrics.recordSync({
            timestamp: new Date(),
            entityType: 'comprobante_detalle',
            comercioId: job.comercioId,
            comercioUsername: job.comercioUsername,
            totalReceived: job.totalReceived,
            inserted: job.inserted,
            updated: job.updated,
            failed: job.failed,
            durationMs: job.totalDurationMs,
            queryId: job.queryId,
            queryName: job.queryName,
            batchProgress: `${job.receivedBatches}/${job.totalBatches}`,
            status: 'completed'
          })

          logger.info({ syncId, queryName, totalBatches: job.totalBatches, totalReceived: job.totalReceived, inserted: job.inserted, updated: job.updated }, 'Job de sincronización completado')
        }
      } else {
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
    }
  )

  /**
   * Endpoint para comprobantes pagos
   */
  app.post(
    '/api/comprobantes/pagos/batch',
    { preHandler: authenticate },
    async (request, reply) => {
      const startTime = Date.now()
      const { comprobantes_pagos } = ComprobantePagosBatchSchema.parse(request.body)

      // Leer headers de metadata
      const syncId = request.headers['x-sync-id'] as string | undefined
      const queryId = request.headers['x-query-id'] as string | undefined
      const queryName = request.headers['x-query-name'] as string | undefined
      const batchNumber = request.headers['x-batch-number'] as string | undefined
      const totalBatches = request.headers['x-total-batches'] as string | undefined

      logger.info(
        { count: comprobantes_pagos.length, username: request.user.username, syncId, queryId, queryName, batchNumber, totalBatches },
        'Recibiendo batch de comprobantes pagos'
      )

      // Build metadata for logging
      const metadata = syncId && queryId && batchNumber && totalBatches ? {
        syncId,
        queryId: parseInt(queryId, 10),
        queryName,
        batchNumber: parseInt(batchNumber, 10),
        totalBatches: parseInt(totalBatches, 10)
      } : undefined

      const result = await IngestionService.ingestComprobantesPagos(
        prisma,
        comprobantes_pagos,
        metadata
      )

      const durationMs = Date.now() - startTime

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

        if (isLastBatch) {
          metrics.recordSync({
            timestamp: new Date(),
            entityType: 'comprobante_pago',
            comercioId: job.comercioId,
            comercioUsername: job.comercioUsername,
            totalReceived: job.totalReceived,
            inserted: job.inserted,
            updated: job.updated,
            failed: job.failed,
            durationMs: job.totalDurationMs,
            queryId: job.queryId,
            queryName: job.queryName,
            batchProgress: `${job.receivedBatches}/${job.totalBatches}`,
            status: 'completed'
          })

          logger.info({ syncId, queryName, totalBatches: job.totalBatches, totalReceived: job.totalReceived, inserted: job.inserted, updated: job.updated }, 'Job de sincronización completado')
        }
      } else {
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
    }
  )
}
