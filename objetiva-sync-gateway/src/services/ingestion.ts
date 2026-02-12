import type { PrismaClient } from '@prisma/client'
import {
  type ArticuloInput,
  type ComprobantesCabeceraInput as ComprobanteCabeceraInput,
  type ComprobantesDetalleInput as ComprobanteDetalleInput,
  type ComprobantesPagoInput as ComprobantePagosInput,
  
} from '@objetiva/shared/schemas'
import { logger } from '../lib/logger.js'
import type { BatchMetadata, IngestionLogEntry } from '../types/logging.js'

// Conflict detection window (configurable via environment)
const CONFLICT_WINDOW_MS = parseInt(process.env.CONFLICT_WINDOW_MINUTES ?? '5', 10) * 60 * 1000

interface IngestionResult {
  inserted: number
  updated: number
  errors: Array<{
    index: number
    identifier: string
    error: string
    code: string
  }>
}

/**
 * Convert null values to undefined for Prisma compatibility
 * Prisma expects undefined for optional/nullable fields, not null
 * Uses `as any` for type compatibility with Prisma's complex JSON types
 */
function nullToUndefined<T extends Record<string, any>>(obj: T): any {
  const result = {} as any
  for (const [key, value] of Object.entries(obj)) {
    result[key] = value === null ? undefined : value
  }
  return result
}

/**
 * Check for source conflicts before upsert (MSS-10).
 * Logs warning if another source modified the same record within CONFLICT_WINDOW_MS.
 * This is best-effort and should not block ingestion.
 */
async function checkSourceConflict(
  entityType: string,
  entityKey: string,
  currentSource: string | undefined,
  findExisting: () => Promise<{ origin_source: string | null; origin_synced_at: Date | null } | null>
): Promise<void> {
  if (!currentSource) return  // Skip if no source tracking

  try {
    const existing = await findExisting()

    if (
      existing?.origin_source &&
      existing.origin_source !== currentSource &&
      existing.origin_synced_at
    ) {
      const timeSinceLastWrite = Date.now() - existing.origin_synced_at.getTime()

      if (timeSinceLastWrite < CONFLICT_WINDOW_MS) {
        logger.warn({
          entityType,
          entityKey,
          previousSource: existing.origin_source,
          currentSource,
          timeBetweenWritesMs: timeSinceLastWrite,
          conflictWindowMs: CONFLICT_WINDOW_MS,
        }, 'Source conflict: multiple sources modified same record within overlap window')
      }
    }
  } catch (error) {
    // Conflict detection is best-effort; don't fail ingestion
    logger.debug({ error, entityType, entityKey }, 'Conflict detection check failed')
  }
}

export class IngestionService {
  /**
   * Log ingestion result with human-readable format
   *
   * Produces structured logs for batch ingestion observability:
   * - Successful batches: entity, batch progress, inserted/updated counts, duration
   * - Failed batches: sample errors (max 3) with identifiers and error details
   * - Query metadata: queryId, queryName when available from headers
   */
  static logIngestionResult(logEntry: IngestionLogEntry): void {
    const {
      entity,
      batchNumber,
      totalBatches,
      inserted,
      updated,
      failed,
      durationMs,
      metadata,
      sampleErrors
    } = logEntry

    const batchProgress = `${batchNumber}/${totalBatches}`
    const totalProcessed = inserted + updated

    // Build human-readable message
    let message = `Batch ${batchProgress} - ${entity}: ${totalProcessed} processed`
    if (inserted > 0) message += ` (${inserted} inserted`
    if (updated > 0) message += `${inserted > 0 ? ', ' : ' ('}${updated} updated`
    if (inserted > 0 || updated > 0) message += ')'
    if (failed > 0) message += ` - ${failed} failed`
    message += ` in ${durationMs}ms`

    // Build structured log data
    const logData: Record<string, unknown> = {
      entity,
      batchNumber,
      totalBatches,
      inserted,
      updated,
      failed,
      durationMs
    }

    // Add metadata if available
    if (metadata?.queryId) logData.queryId = metadata.queryId
    if (metadata?.queryName) logData.queryName = metadata.queryName
    if (metadata?.syncId) logData.syncId = metadata.syncId

    // Log based on failure status
    if (failed > 0 && sampleErrors && sampleErrors.length > 0) {
      // Sample first 3 errors for human readability
      const errorSamples = sampleErrors.slice(0, 3).map((err) => ({
        identifier: err.identifier,
        code: err.code,
        message: err.error
      }))

      logData.sampleErrors = errorSamples

      // Build error summary for message
      const errorSummary = errorSamples
        .map((e) => `${e.identifier}: [${e.code}]`)
        .join(', ')

      logger.warn(logData, `${message} | Sample errors: ${errorSummary}`)
    } else {
      logger.info(logData, message)
    }
  }


  /**
   * Ingesta de artículos
   * ✅ TODO EN SNAKE_CASE - Sin mapeo manual
   * ✅ BULK OPERATIONS - Batch lookup + createMany + transaction
   * ✅ COMPOSITE KEY SUPPORT - Handles (erp_codigo, erp_nombre) composite PK
   */
  static async ingestArticulos(
    prisma: PrismaClient,
    articulos: ArticuloInput[],
    metadata?: BatchMetadata
  ): Promise<IngestionResult> {
    const startTime = performance.now()
    let inserted = 0
    let updated = 0
    const errors: IngestionResult['errors'] = []

    // Prepare origin metadata if available (for multi-source tracking)
    const originData = metadata?.originSource ? {
      origin_source: metadata.originSource,
      origin_sync_id: metadata.syncId ?? null,
      origin_synced_at: new Date(),
    } : {}

    // Composite key: (erp_codigo, erp_nombre)
    // Prisma uses erp_codigo_erp_nombre for the compound unique identifier

    // Step 1: Batch lookup of existing records using first key field for filtering
    const keyValues = articulos.map(a => a.erp_codigo).filter(Boolean)
    const existingRecords = await prisma.articulo.findMany({
      where: { erp_codigo: { in: keyValues } },
      select: { erp_codigo: true, erp_nombre: true },
    })
    // Build composite key set for efficient lookup
    const existingSet = new Set<string>(
      existingRecords.map((r) => `${r.erp_codigo}|${r.erp_nombre}`)
    )

    // Step 2: Separate into new vs existing records using composite key
    const toCreate: ArticuloInput[] = []
    const toUpdate: Array<{ compositeKey: { erp_codigo: string; erp_nombre: string }; data: ArticuloInput }> = []

    for (const articulo of articulos) {
      const keyString = `${articulo.erp_codigo}|${articulo.erp_nombre}`
      if (existingSet.has(keyString)) {
        toUpdate.push({
          compositeKey: { erp_codigo: articulo.erp_codigo, erp_nombre: articulo.erp_nombre },
          data: articulo
        })
      } else {
        toCreate.push(articulo)
      }
    }

    // Step 3: Bulk create new records using createMany
    if (toCreate.length > 0) {
      try {
        const createResult = await prisma.articulo.createMany({
          data: toCreate.map(a => nullToUndefined({
            ...a,
            ...originData,
            erp_sincronizado: true,
            erp_fecha_sync: new Date(),
          })),
          skipDuplicates: true,
        })
        inserted = createResult.count
        logger.info({ count: inserted }, 'Artículos insertados (bulk)')
      } catch (error) {
        // If createMany fails, fall back to individual creates
        logger.warn({ error }, 'createMany failed, falling back to individual creates')
        for (const [index, articulo] of toCreate.entries()) {
          try {
            await prisma.articulo.create({
              data: nullToUndefined({
                ...articulo,
                ...originData,
                erp_sincronizado: true,
                erp_fecha_sync: new Date(),
              }),
            })
            inserted++
          } catch (createError) {
            errors.push({
              index,
              identifier: `${articulo.erp_codigo}|${articulo.erp_nombre}`,
              error: createError instanceof Error ? createError.message : 'Error desconocido',
              code: 'INGESTION_ERROR',
            })
          }
        }
      }
    }

    // Check for source conflicts before update (best-effort)
    if (metadata?.originSource && toUpdate.length > 0) {
      const samplesToCheck = toUpdate.slice(0, 10)
      for (const { compositeKey } of samplesToCheck) {
        await checkSourceConflict(
          'articulo',
          `${compositeKey.erp_codigo}|${compositeKey.erp_nombre}`,
          metadata.originSource,
          () => prisma.articulo.findUnique({
            where: { erp_codigo_erp_nombre: compositeKey },
            select: { origin_source: true, origin_synced_at: true },
          })
        )
      }
    }

    // Step 4: Update existing records (in transaction) using composite key
    if (toUpdate.length > 0) {
      try {
        await prisma.$transaction(
          toUpdate.map(({ compositeKey, data }) =>
            prisma.articulo.update({
              where: { erp_codigo_erp_nombre: compositeKey },
              data: nullToUndefined({
                ...data,
                ...originData,
                erp_sincronizado: true,
                erp_fecha_sync: new Date(),
                actualizado: new Date(),
              }),
            })
          )
        )
        updated = toUpdate.length
        logger.info({ count: updated }, 'Artículos actualizados (transaction)')
      } catch (error) {
        // If transaction fails, fall back to individual updates
        logger.warn({ error }, 'Transaction failed, falling back to individual updates')
        for (const [index, { compositeKey, data }] of toUpdate.entries()) {
          try {
            await prisma.articulo.update({
              where: { erp_codigo_erp_nombre: compositeKey },
              data: nullToUndefined({
                ...data,
                ...originData,
                erp_sincronizado: true,
                erp_fecha_sync: new Date(),
                actualizado: new Date(),
              }),
            })
            updated++
          } catch (updateError) {
            errors.push({
              index,
              identifier: `${compositeKey.erp_codigo}|${compositeKey.erp_nombre}`,
              error: updateError instanceof Error ? updateError.message : 'Error desconocido',
              code: 'INGESTION_ERROR',
            })
          }
        }
      }
    }

    const durationMs = Math.round(performance.now() - startTime)



    // Log ingestion result


    this.logIngestionResult({


      entity: 'articulo',


      batchNumber: metadata?.batchNumber ?? 1,


      totalBatches: metadata?.totalBatches ?? 1,


      inserted,


      updated,


      failed: errors.length,


      durationMs,


      metadata,


      sampleErrors: errors.length > 0 ? errors : undefined


    })



    return { inserted, updated, errors }
  }

  /**
   * Ingesta de comprobantes cabecera
   * ✅ BULK OPERATIONS - Batch lookup + createMany + transaction
   */
  static async ingestComprobantesCabecera(
    prisma: PrismaClient,
    comprobantes: ComprobanteCabeceraInput[],
    metadata?: BatchMetadata
  ): Promise<IngestionResult> {
    const startTime = performance.now()
    let inserted = 0
    let updated = 0
    const errors: IngestionResult['errors'] = []

    // Prepare origin metadata if available (for multi-source tracking)
    const originData = metadata?.originSource ? {
      origin_source: metadata.originSource,
      origin_sync_id: metadata.syncId ?? null,
      origin_synced_at: new Date(),
    } : {}

    // Step 1: Batch lookup of existing records using composite key
    const keys = comprobantes.map(c => ({
      operacion: c.operacion,
      formulario: c.formulario,
      numero: c.numero,
    }))

    const existingRecords = await prisma.comprobanteCabecera.findMany({
      where: {
        OR: keys.map(k => ({
          operacion: k.operacion,
          formulario: k.formulario,
          numero: k.numero,
        })),
      },
      select: { operacion: true, formulario: true, numero: true },
    })

    // Create lookup set with composite key string
    const existingSet = new Set(
      existingRecords.map(r => `${r.operacion}|${r.formulario}|${r.numero}`)
    )

    // Step 2: Separate into new vs existing records
    const toCreate: ComprobanteCabeceraInput[] = []
    const toUpdate: Array<{ compositeKey: { operacion: string; formulario: string; numero: string }; data: ComprobanteCabeceraInput }> = []

    for (const comp of comprobantes) {
      const keyString = `${comp.operacion}|${comp.formulario}|${comp.numero}`
      if (existingSet.has(keyString)) {
        toUpdate.push({
          compositeKey: { operacion: comp.operacion, formulario: comp.formulario, numero: comp.numero },
          data: comp
        })
      } else {
        toCreate.push(comp)
      }
    }

    // Step 3: Bulk create new records using createMany
    if (toCreate.length > 0) {
      try {
        const createResult = await prisma.comprobanteCabecera.createMany({
          data: toCreate.map(c => nullToUndefined({
            ...c,
            ...originData,
            fecha: c.fecha ? new Date(c.fecha) : undefined,
            erp_fecha_sync: c.erp_fecha_sync ? new Date(c.erp_fecha_sync) : undefined,
          })),
          skipDuplicates: true,
        })
        inserted = createResult.count
        logger.info({ count: inserted }, 'Comprobantes cabecera insertados (bulk)')
      } catch (error) {
        // If createMany fails, fall back to individual creates
        logger.warn({ error }, 'createMany failed, falling back to individual creates')
        for (const [index, comp] of toCreate.entries()) {
          try {
            await prisma.comprobanteCabecera.create({
              data: nullToUndefined({
                ...comp,
                ...originData,
                fecha: comp.fecha ? new Date(comp.fecha) : undefined,
                erp_fecha_sync: comp.erp_fecha_sync ? new Date(comp.erp_fecha_sync) : undefined,
              }),
            })
            inserted++
          } catch (createError) {
            const errorMessage = createError instanceof Error ? createError.message : 'Error desconocido'
            let errorCode = 'INGESTION_ERROR'

            if (errorMessage.includes('Unique constraint failed')) {
              errorCode = 'DUPLICATE_KEY'
            } else if (errorMessage.includes('Foreign key constraint failed')) {
              errorCode = 'FOREIGN_KEY_ERROR'
            } else if (errorMessage.includes('Required') || errorMessage.includes('Expected')) {
              errorCode = 'VALIDATION_ERROR'
            } else if (errorMessage.includes('date') || errorMessage.includes('Date')) {
              errorCode = 'DATE_FORMAT_ERROR'
            }

            const detailedError = `[${errorCode}] ${errorMessage} | Clave: ${comp.erp_operacion}/${comp.erp_formulario}/${comp.erp_numero}`

            errors.push({
              index,
              identifier: `${comp.erp_operacion}/${comp.erp_formulario}/${comp.erp_numero}`,
              error: detailedError,
              code: errorCode,
            })
          }
        }
      }
    }

    // Check for source conflicts before update (best-effort)
    if (metadata?.originSource && toUpdate.length > 0) {
      const samplesToCheck = toUpdate.slice(0, 10)
      for (const { compositeKey } of samplesToCheck) {
        await checkSourceConflict(
          'comprobante_cabecera',
          `${compositeKey.operacion}|${compositeKey.formulario}|${compositeKey.numero}`,
          metadata.originSource,
          () => prisma.comprobanteCabecera.findUnique({
            where: { operacion_formulario_numero: compositeKey },
            select: { origin_source: true, origin_synced_at: true },
          })
        )
      }
    }

    // Step 4: Update existing records (in transaction) using composite natural key
    if (toUpdate.length > 0) {
      try {
        await prisma.$transaction(
          toUpdate.map(({ compositeKey, data }) =>
            prisma.comprobanteCabecera.update({
              where: { operacion_formulario_numero: compositeKey },
              data: nullToUndefined({
                ...data,
                ...originData,
                fecha: data.fecha ? new Date(data.fecha) : undefined,
                erp_fecha_sync: data.erp_fecha_sync ? new Date(data.erp_fecha_sync) : undefined,
                actualizado: new Date(),
              }),
            })
          )
        )
        updated = toUpdate.length
        logger.info({ count: updated }, 'Comprobantes cabecera actualizados (transaction)')
      } catch (error) {
        // If transaction fails, fall back to individual updates
        logger.warn({ error }, 'Transaction failed, falling back to individual updates')
        for (const [index, { compositeKey, data }] of toUpdate.entries()) {
          try {
            await prisma.comprobanteCabecera.update({
              where: { operacion_formulario_numero: compositeKey },
              data: nullToUndefined({
                ...data,
                ...originData,
                fecha: data.fecha ? new Date(data.fecha) : undefined,
                erp_fecha_sync: data.erp_fecha_sync ? new Date(data.erp_fecha_sync) : undefined,
                actualizado: new Date(),
              }),
            })
            updated++
          } catch (updateError) {
            const errorMessage = updateError instanceof Error ? updateError.message : 'Error desconocido'
            let errorCode = 'INGESTION_ERROR'

            if (errorMessage.includes('Unique constraint failed')) {
              errorCode = 'DUPLICATE_KEY'
            } else if (errorMessage.includes('Foreign key constraint failed')) {
              errorCode = 'FOREIGN_KEY_ERROR'
            } else if (errorMessage.includes('Required') || errorMessage.includes('Expected')) {
              errorCode = 'VALIDATION_ERROR'
            } else if (errorMessage.includes('date') || errorMessage.includes('Date')) {
              errorCode = 'DATE_FORMAT_ERROR'
            }

            const detailedError = `[${errorCode}] ${errorMessage} | Clave: ${data.erp_operacion}/${data.erp_formulario}/${data.erp_numero}`

            errors.push({
              index,
              identifier: `${data.erp_operacion}/${data.erp_formulario}/${data.erp_numero}`,
              error: detailedError,
              code: errorCode,
            })
          }
        }
      }
    }

    const durationMs = Math.round(performance.now() - startTime)



    // Log ingestion result


    this.logIngestionResult({


      entity: 'comprobante_cabecera',


      batchNumber: metadata?.batchNumber ?? 1,


      totalBatches: metadata?.totalBatches ?? 1,


      inserted,


      updated,


      failed: errors.length,


      durationMs,


      metadata,


      sampleErrors: errors.length > 0 ? errors : undefined


    })



    return { inserted, updated, errors }
  }

  /**
   * Ingesta de comprobantes detalle
   * ✅ BULK OPERATIONS - Batch lookup + createMany + transaction
   */
  static async ingestComprobantesDetalle(
    prisma: PrismaClient,
    detalles: ComprobanteDetalleInput[],
    metadata?: BatchMetadata
  ): Promise<IngestionResult> {
    const startTime = performance.now()
    let inserted = 0
    let updated = 0
    const errors: IngestionResult['errors'] = []

    // Prepare origin metadata if available (for multi-source tracking)
    const originData = metadata?.originSource ? {
      origin_source: metadata.originSource,
      origin_sync_id: metadata.syncId ?? null,
      origin_synced_at: new Date(),
    } : {}

    // Step 1: Batch lookup of existing detalles (no need for cabecera lookup - using natural keys)
    const detalleKeys = detalles.map(d => ({
      operacion: d.comprobante_operacion,
      formulario: d.comprobante_formulario,
      numero: d.comprobante_numero,
      linea_numero: d.linea_numero,
    }))

    const existingDetalles = await prisma.comprobanteDetalle.findMany({
      where: {
        OR: detalleKeys.map(k => ({
          comprobante_operacion: k.operacion,
          comprobante_formulario: k.formulario,
          comprobante_numero: k.numero,
          linea_numero: k.linea_numero,
        })),
      },
      select: { comprobante_operacion: true, comprobante_formulario: true, comprobante_numero: true, linea_numero: true },
    })

    // Store existing composite keys for lookup
    const existingSet = new Set(
      existingDetalles.map(d => `${d.comprobante_operacion}|${d.comprobante_formulario}|${d.comprobante_numero}|${d.linea_numero}`)
    )

    // Step 2: Separate into new vs existing records (using natural composite keys)
    const toCreate: ComprobanteDetalleInput[] = []
    const toUpdate: Array<{ compositeKey: { comprobante_operacion: string; comprobante_formulario: string; comprobante_numero: string; linea_numero: number }; data: ComprobanteDetalleInput }> = []

    for (const det of detalles) {
      const detalleKey = `${det.comprobante_operacion}|${det.comprobante_formulario}|${det.comprobante_numero}|${det.linea_numero}`

      if (existingSet.has(detalleKey)) {
        toUpdate.push({
          compositeKey: {
            comprobante_operacion: det.comprobante_operacion,
            comprobante_formulario: det.comprobante_formulario,
            comprobante_numero: det.comprobante_numero,
            linea_numero: det.linea_numero,
          },
          data: det,
        })
      } else {
        toCreate.push(det)
      }
    }

    // Step 3: Bulk create new records using createMany
    if (toCreate.length > 0) {
      try {
        const createResult = await prisma.comprobanteDetalle.createMany({
          data: toCreate.map(det => nullToUndefined({ ...det, ...originData })),
          skipDuplicates: true,
        })
        inserted = createResult.count
        logger.info({ count: inserted }, 'Comprobantes detalle insertados (bulk)')
      } catch (error) {
        // If createMany fails, fall back to individual creates
        logger.warn({ error }, 'createMany failed, falling back to individual creates')
        for (const [index, det] of toCreate.entries()) {
          try {
            await prisma.comprobanteDetalle.create({
              data: nullToUndefined({ ...det, ...originData }),
            })
            inserted++
          } catch (createError) {
            const errorMessage = createError instanceof Error ? createError.message : 'Error desconocido'
            let errorCode = 'INGESTION_ERROR'

            if (errorMessage.includes('Unique constraint failed')) {
              errorCode = 'DUPLICATE_KEY'
            } else if (errorMessage.includes('Foreign key constraint failed')) {
              errorCode = 'FOREIGN_KEY_ERROR'
            } else if (errorMessage.includes('Required') || errorMessage.includes('Expected')) {
              errorCode = 'VALIDATION_ERROR'
            } else if (errorMessage.includes('date') || errorMessage.includes('Date')) {
              errorCode = 'DATE_FORMAT_ERROR'
            }

            const detailedError = `[${errorCode}] ${errorMessage} | Detalle: ${det.erp_operacion}/${det.erp_formulario}/${det.erp_numero} L${det.linea_numero}`

            errors.push({
              index,
              identifier: `${det.erp_operacion}/${det.erp_formulario}/${det.erp_numero} L${det.linea_numero}`,
              error: detailedError,
              code: errorCode,
            })
          }
        }
      }
    }

    // Check for source conflicts before update (best-effort)
    if (metadata?.originSource && toUpdate.length > 0) {
      const samplesToCheck = toUpdate.slice(0, 10)
      for (const { compositeKey } of samplesToCheck) {
        await checkSourceConflict(
          'comprobante_detalle',
          `${compositeKey.comprobante_operacion}|${compositeKey.comprobante_formulario}|${compositeKey.comprobante_numero}|L${compositeKey.linea_numero}`,
          metadata.originSource,
          () => prisma.comprobanteDetalle.findUnique({
            where: { comprobante_operacion_comprobante_formulario_comprobante_numero_linea_numero: compositeKey },
            select: { origin_source: true, origin_synced_at: true },
          })
        )
      }
    }

    // Step 4: Update existing records (in transaction) using composite natural key
    if (toUpdate.length > 0) {
      try {
        await prisma.$transaction(
          toUpdate.map(({ compositeKey, data: det }) => {
            return prisma.comprobanteDetalle.update({
              where: { comprobante_operacion_comprobante_formulario_comprobante_numero_linea_numero: compositeKey },
              data: nullToUndefined({
                ...det,
                ...originData,
                actualizado: new Date(),
              }),
            })
          })
        )
        updated = toUpdate.length
        logger.info({ count: updated }, 'Comprobantes detalle actualizados (transaction)')
      } catch (error) {
        // If transaction fails, fall back to individual updates
        logger.warn({ error }, 'Transaction failed, falling back to individual updates')
        for (const [index, { compositeKey, data: det }] of toUpdate.entries()) {
          try {
            await prisma.comprobanteDetalle.update({
              where: { comprobante_operacion_comprobante_formulario_comprobante_numero_linea_numero: compositeKey },
              data: nullToUndefined({
                ...det,
                ...originData,
                actualizado: new Date(),
              }),
            })
            updated++
          } catch (updateError) {
            const errorMessage = updateError instanceof Error ? updateError.message : 'Error desconocido'
            let errorCode = 'INGESTION_ERROR'

            if (errorMessage.includes('Unique constraint failed')) {
              errorCode = 'DUPLICATE_KEY'
            } else if (errorMessage.includes('Foreign key constraint failed')) {
              errorCode = 'FOREIGN_KEY_ERROR'
            } else if (errorMessage.includes('Required') || errorMessage.includes('Expected')) {
              errorCode = 'VALIDATION_ERROR'
            } else if (errorMessage.includes('date') || errorMessage.includes('Date')) {
              errorCode = 'DATE_FORMAT_ERROR'
            }

            const detailedError = `[${errorCode}] ${errorMessage} | Detalle: ${det.erp_operacion}/${det.erp_formulario}/${det.erp_numero} L${det.linea_numero}`

            errors.push({
              index,
              identifier: `${det.erp_operacion}/${det.erp_formulario}/${det.erp_numero} L${det.linea_numero}`,
              error: detailedError,
              code: errorCode,
            })
          }
        }
      }
    }

    const durationMs = Math.round(performance.now() - startTime)



    // Log ingestion result


    this.logIngestionResult({


      entity: 'comprobante_detalle',


      batchNumber: metadata?.batchNumber ?? 1,


      totalBatches: metadata?.totalBatches ?? 1,


      inserted,


      updated,


      failed: errors.length,


      durationMs,


      metadata,


      sampleErrors: errors.length > 0 ? errors : undefined


    })



    return { inserted, updated, errors }
  }

  /**
   * Ingesta de comprobantes pagos
   * ✅ BULK OPERATIONS - Batch lookup + createMany + transaction
   */
  static async ingestComprobantesPagos(
    prisma: PrismaClient,
    pagos: ComprobantePagosInput[],
    metadata?: BatchMetadata
  ): Promise<IngestionResult> {
    const startTime = performance.now()
    let inserted = 0
    let updated = 0
    const errors: IngestionResult['errors'] = []

    // Prepare origin metadata if available (for multi-source tracking)
    const originData = metadata?.originSource ? {
      origin_source: metadata.originSource,
      origin_sync_id: metadata.syncId ?? null,
      origin_synced_at: new Date(),
    } : {}

    // Step 1: Batch lookup of existing pagos (no need for cabecera lookup - using natural keys)
    const pagoKeys = pagos.map(p => ({
      operacion: p.comprobante_operacion,
      formulario: p.comprobante_formulario,
      numero: p.comprobante_numero,
      linea_numero: p.linea_numero,
    }))

    const existingPagos = await prisma.comprobantePagos.findMany({
      where: {
        OR: pagoKeys.map(k => ({
          comprobante_operacion: k.operacion,
          comprobante_formulario: k.formulario,
          comprobante_numero: k.numero,
          linea_numero: k.linea_numero,
        })),
      },
      select: { comprobante_operacion: true, comprobante_formulario: true, comprobante_numero: true, linea_numero: true },
    })

    const existingSet = new Set(
      existingPagos.map(p => `${p.comprobante_operacion}|${p.comprobante_formulario}|${p.comprobante_numero}|${p.linea_numero}`)
    )

    // Step 2: Separate into new vs existing records (using natural composite keys)
    const toCreate: ComprobantePagosInput[] = []
    const toUpdate: Array<{ compositeKey: { comprobante_operacion: string; comprobante_formulario: string; comprobante_numero: string; linea_numero: number }; data: ComprobantePagosInput }> = []

    for (const pago of pagos) {
      const pagoKey = `${pago.comprobante_operacion}|${pago.comprobante_formulario}|${pago.comprobante_numero}|${pago.linea_numero}`

      if (existingSet.has(pagoKey)) {
        toUpdate.push({
          compositeKey: {
            comprobante_operacion: pago.comprobante_operacion,
            comprobante_formulario: pago.comprobante_formulario,
            comprobante_numero: pago.comprobante_numero,
            linea_numero: pago.linea_numero,
          },
          data: pago,
        })
      } else {
        toCreate.push(pago)
      }
    }

    // Step 3: Bulk create new records using createMany
    if (toCreate.length > 0) {
      try {
        const createResult = await prisma.comprobantePagos.createMany({
          data: toCreate.map(pago => {
            const medio_normalizado = pago.medio || 'EFECTIVO'
            return nullToUndefined({
              ...pago,
              ...originData,
              medio: medio_normalizado,
              cheque_fecha_diferida: pago.cheque_fecha_diferida ? new Date(pago.cheque_fecha_diferida) : null,
              fecha_vencimiento: pago.fecha_vencimiento ? new Date(pago.fecha_vencimiento) : null,
            })
          }),
          skipDuplicates: true,
        })
        inserted = createResult.count
        logger.info({ count: inserted }, 'Comprobantes pagos insertados (bulk)')
      } catch (error) {
        // If createMany fails, fall back to individual creates
        logger.warn({ error }, 'createMany failed, falling back to individual creates')
        for (const [index, pago] of toCreate.entries()) {
          try {
            const medio_normalizado = pago.medio || 'EFECTIVO'
            await prisma.comprobantePagos.create({
              data: nullToUndefined({
                ...pago,
                ...originData,
                medio: medio_normalizado,
                cheque_fecha_diferida: pago.cheque_fecha_diferida ? new Date(pago.cheque_fecha_diferida) : null,
                fecha_vencimiento: pago.fecha_vencimiento ? new Date(pago.fecha_vencimiento) : null,
              }),
            })
            inserted++
          } catch (createError) {
            const errorMessage = createError instanceof Error ? createError.message : 'Error desconocido'
            let errorCode = 'INGESTION_ERROR'

            if (errorMessage.includes('Unique constraint failed')) {
              errorCode = 'DUPLICATE_KEY'
            } else if (errorMessage.includes('Foreign key constraint failed')) {
              errorCode = 'FOREIGN_KEY_ERROR'
            } else if (errorMessage.includes('Required') || errorMessage.includes('Expected')) {
              errorCode = 'VALIDATION_ERROR'
            } else if (errorMessage.includes('date') || errorMessage.includes('Date')) {
              errorCode = 'DATE_FORMAT_ERROR'
            }

            const detailedError = `[${errorCode}] ${errorMessage} | Pago: ${pago.erp_operacion}/${pago.erp_formulario}/${pago.erp_numero} L${pago.linea_numero} - ${pago.medio}`

            errors.push({
              index,
              identifier: `${pago.erp_operacion}/${pago.erp_formulario}/${pago.erp_numero} L${pago.linea_numero}`,
              error: detailedError,
              code: errorCode,
            })
          }
        }
      }
    }

    // Check for source conflicts before update (best-effort)
    if (metadata?.originSource && toUpdate.length > 0) {
      const samplesToCheck = toUpdate.slice(0, 10)
      for (const { compositeKey } of samplesToCheck) {
        await checkSourceConflict(
          'comprobante_pago',
          `${compositeKey.comprobante_operacion}|${compositeKey.comprobante_formulario}|${compositeKey.comprobante_numero}|L${compositeKey.linea_numero}`,
          metadata.originSource,
          () => prisma.comprobantePagos.findUnique({
            where: { comprobante_operacion_comprobante_formulario_comprobante_numero_linea_numero: compositeKey },
            select: { origin_source: true, origin_synced_at: true },
          })
        )
      }
    }

    // Step 4: Update existing records (in transaction) using composite natural key
    if (toUpdate.length > 0) {
      try {
        await prisma.$transaction(
          toUpdate.map(({ compositeKey, data: pago }) => {
            const medio_normalizado = pago.medio || 'EFECTIVO'
            return prisma.comprobantePagos.update({
              where: { comprobante_operacion_comprobante_formulario_comprobante_numero_linea_numero: compositeKey },
              data: nullToUndefined({
                ...pago,
                ...originData,
                medio: medio_normalizado,
                cheque_fecha_diferida: pago.cheque_fecha_diferida ? new Date(pago.cheque_fecha_diferida) : null,
                fecha_vencimiento: pago.fecha_vencimiento ? new Date(pago.fecha_vencimiento) : null,
                actualizado: new Date(),
              }),
            })
          })
        )
        updated = toUpdate.length
        logger.info({ count: updated }, 'Comprobantes pagos actualizados (transaction)')
      } catch (error) {
        // If transaction fails, fall back to individual updates
        logger.warn({ error }, 'Transaction failed, falling back to individual updates')
        for (const [index, { compositeKey, data: pago }] of toUpdate.entries()) {
          try {
            const medio_normalizado = pago.medio || 'EFECTIVO'
            await prisma.comprobantePagos.update({
              where: { comprobante_operacion_comprobante_formulario_comprobante_numero_linea_numero: compositeKey },
              data: nullToUndefined({
                ...pago,
                ...originData,
                medio: medio_normalizado,
                cheque_fecha_diferida: pago.cheque_fecha_diferida ? new Date(pago.cheque_fecha_diferida) : null,
                fecha_vencimiento: pago.fecha_vencimiento ? new Date(pago.fecha_vencimiento) : null,
                actualizado: new Date(),
              }),
            })
            updated++
          } catch (updateError) {
            const errorMessage = updateError instanceof Error ? updateError.message : 'Error desconocido'
            let errorCode = 'INGESTION_ERROR'

            if (errorMessage.includes('Unique constraint failed')) {
              errorCode = 'DUPLICATE_KEY'
            } else if (errorMessage.includes('Foreign key constraint failed')) {
              errorCode = 'FOREIGN_KEY_ERROR'
            } else if (errorMessage.includes('Required') || errorMessage.includes('Expected')) {
              errorCode = 'VALIDATION_ERROR'
            } else if (errorMessage.includes('date') || errorMessage.includes('Date')) {
              errorCode = 'DATE_FORMAT_ERROR'
            }

            const detailedError = `[${errorCode}] ${errorMessage} | Pago: ${pago.erp_operacion}/${pago.erp_formulario}/${pago.erp_numero} L${pago.linea_numero} - ${pago.medio}`

            errors.push({
              index,
              identifier: `${pago.erp_operacion}/${pago.erp_formulario}/${pago.erp_numero} L${pago.linea_numero}`,
              error: detailedError,
              code: errorCode,
            })
          }
        }
      }
    }

    const durationMs = Math.round(performance.now() - startTime)



    // Log ingestion result


    this.logIngestionResult({


      entity: 'comprobante_pago',


      batchNumber: metadata?.batchNumber ?? 1,


      totalBatches: metadata?.totalBatches ?? 1,


      inserted,


      updated,


      failed: errors.length,


      durationMs,


      metadata,


      sampleErrors: errors.length > 0 ? errors : undefined


    })



    return { inserted, updated, errors }
  }
}
