import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { articuloSchema } from '@objetiva/shared/schemas'
import { prisma } from '../lib/prisma.js'

// Batch schema wrapper around the single articulo schema
const ArticuloBatchSchema = z.object({
  articulos: z.array(articuloSchema)
})
import { authenticate } from '../middleware/auth.js'
import { IngestionService } from '../services/ingestion.js'
import { logger } from '../lib/logger.js'
import { metrics } from '../lib/metrics.js'
import { jobTracker } from '../lib/job-tracker.js'
import { syncDuration, syncRecordsTotal } from '../lib/prometheus.js'

export async function registerArticulosRoutes(app: FastifyInstance) {
  app.post(
    '/api/articulos/batch',
    { preHandler: authenticate },
    async (request, reply) => {
      const { articulos } = ArticuloBatchSchema.parse(request.body)

      // Get origin source for Prometheus metrics (defaults to 'unknown')
      const sourceId = (request.headers['x-origin-source'] as string) || 'unknown'

      // Start Prometheus timer for sync duration tracking
      const endSyncTimer = syncDuration.startTimer({
        entity_type: 'articulo',
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
        {
          count: articulos.length,
          username: request.user.username,
          syncId,
          queryId,
          queryName,
          batchNumber,
          totalBatches,
          originSource
        },
        'Recibiendo batch de artículos'
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
        const result = await IngestionService.ingestArticulos(
          prisma,
          articulos,
          metadata
        )

        const durationMs = Date.now() - startTime

        // Record Prometheus metrics for sync records
        if (result.inserted > 0) {
          syncRecordsTotal.inc({ entity_type: 'articulo', source_id: sourceId, operation: 'inserted' }, result.inserted)
        }
        if (result.updated > 0) {
          syncRecordsTotal.inc({ entity_type: 'articulo', source_id: sourceId, operation: 'updated' }, result.updated)
        }
        if (result.errors.length > 0) {
          syncRecordsTotal.inc({ entity_type: 'articulo', source_id: sourceId, operation: 'failed' }, result.errors.length)
        }

        // Si tenemos metadata de job, usar jobTracker
        if (syncId && queryId && queryName && batchNumber && totalBatches) {
          const { job, isLastBatch } = jobTracker.trackBatch({
            syncId,
            queryId: parseInt(queryId, 10),
            queryName,
            entityType: 'articulo',
            comercioId: 'system',
            comercioUsername: request.user.username,
            batchNumber: parseInt(batchNumber, 10),
            totalBatches: parseInt(totalBatches, 10),
            result: {
              totalReceived: articulos.length,
              inserted: result.inserted,
              updated: result.updated,
              failed: result.errors.length,
              durationMs
            }
          })

          // Registrar en metrics CADA batch para mostrar progreso en tiempo real
          metrics.recordSync({
            timestamp: new Date(),
            entityType: 'articulo',
            comercioId: job.comercioId,
            comercioUsername: job.comercioUsername,
            totalReceived: articulos.length,
            inserted: result.inserted,
            updated: result.updated,
            failed: result.errors.length,
            durationMs,
            queryId: job.queryId,
            queryName: job.queryName,
            batchProgress: job.receivedBatches + '/' + job.totalBatches,
            status: isLastBatch ? 'completed' : 'in_progress',
            syncId,
            batchNumber: job.receivedBatches,
            totalBatches: job.totalBatches
          })

          if (isLastBatch) {
            logger.info(
              {
                syncId,
                queryName,
                totalBatches: job.totalBatches,
                totalReceived: job.totalReceived,
                inserted: job.inserted,
                updated: job.updated
              },
              'Job de sincronización completado'
            )
          }
        } else {
          // Modo legacy sin metadata - registrar batch individual
          metrics.recordSync({
            timestamp: new Date(),
            entityType: 'articulo',
            comercioId: 'system',
            comercioUsername: request.user.username,
            totalReceived: articulos.length,
            inserted: result.inserted,
            updated: result.updated,
            failed: result.errors.length,
            durationMs
          })
        }

        const hasErrors = result.errors.length > 0

        return reply.status(hasErrors ? 207 : 200).send({
          success: result.errors.length === 0,
          message: 'Procesados ' + (result.inserted + result.updated) + ' artículos',
          result: {
            total_received: articulos.length,
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
