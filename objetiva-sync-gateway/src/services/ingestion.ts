import type { PrismaClient } from '@prisma/client'
import type {
  ArticuloInput,
  ComprobanteCabeceraInput,
  ComprobanteDetalleInput,
  ComprobantePagosInput
} from '../../shared/schemas/index.js'
import { logger } from '../lib/logger.js'
import type { BatchMetadata, IngestionLogEntry } from '../types/logging.js'

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

    // Step 1: Batch lookup of existing records
    const erpCodigos = articulos.map(a => a.erp_codigo).filter(Boolean)
    const existingRecords = await prisma.articulo.findMany({
      where: { erp_codigo: { in: erpCodigos } },
      select: { id: true, erp_codigo: true },
    })
    const existingMap = new Map(existingRecords.map(r => [r.erp_codigo, r.id]))

    // Step 2: Separate into new vs existing records
    const toCreate: ArticuloInput[] = []
    const toUpdate: Array<{ id: number; data: ArticuloInput }> = []

    for (const articulo of articulos) {
      const existingId = existingMap.get(articulo.erp_codigo)
      if (existingId) {
        toUpdate.push({ id: existingId, data: articulo })
      } else {
        toCreate.push(articulo)
      }
    }

    // Step 3: Bulk create new records using createMany
    if (toCreate.length > 0) {
      try {
        const createResult = await prisma.articulo.createMany({
          data: toCreate.map(a => ({
            ...a,
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
              data: {
                ...articulo,
                erp_sincronizado: true,
                erp_fecha_sync: new Date(),
              },
            })
            inserted++
          } catch (createError) {
            errors.push({
              index,
              identifier: articulo.sku || articulo.codigo || `item-${index}`,
              error: createError instanceof Error ? createError.message : 'Error desconocido',
              code: 'INGESTION_ERROR',
            })
          }
        }
      }
    }

    // Step 4: Update existing records (in transaction)
    if (toUpdate.length > 0) {
      try {
        await prisma.$transaction(
          toUpdate.map(({ id, data }) =>
            prisma.articulo.update({
              where: { id },
              data: {
                ...data,
                erp_sincronizado: true,
                erp_fecha_sync: new Date(),
                actualizado: new Date(),
              },
            })
          )
        )
        updated = toUpdate.length
        logger.info({ count: updated }, 'Artículos actualizados (transaction)')
      } catch (error) {
        // If transaction fails, fall back to individual updates
        logger.warn({ error }, 'Transaction failed, falling back to individual updates')
        for (const [index, { id, data }] of toUpdate.entries()) {
          try {
            await prisma.articulo.update({
              where: { id },
              data: {
                ...data,
                erp_sincronizado: true,
                erp_fecha_sync: new Date(),
                actualizado: new Date(),
              },
            })
            updated++
          } catch (updateError) {
            errors.push({
              index,
              identifier: data.sku || data.codigo || `item-${index}`,
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
      select: { id: true, operacion: true, formulario: true, numero: true },
    })

    // Create lookup map with composite key string
    const existingMap = new Map(
      existingRecords.map(r => [`${r.operacion}|${r.formulario}|${r.numero}`, r.id])
    )

    // Step 2: Separate into new vs existing records
    const toCreate: ComprobanteCabeceraInput[] = []
    const toUpdate: Array<{ id: number; data: ComprobanteCabeceraInput }> = []

    for (const comp of comprobantes) {
      const compositeKey = `${comp.operacion}|${comp.formulario}|${comp.numero}`
      const existingId = existingMap.get(compositeKey)
      if (existingId) {
        toUpdate.push({ id: existingId, data: comp })
      } else {
        toCreate.push(comp)
      }
    }

    // Step 3: Bulk create new records using createMany
    if (toCreate.length > 0) {
      try {
        const createResult = await prisma.comprobanteCabecera.createMany({
          data: toCreate.map(c => ({
            ...c,
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
              data: {
                ...comp,
                fecha: comp.fecha ? new Date(comp.fecha) : undefined,
                erp_fecha_sync: comp.erp_fecha_sync ? new Date(comp.erp_fecha_sync) : undefined,
              },
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

    // Step 4: Update existing records (in transaction)
    if (toUpdate.length > 0) {
      try {
        await prisma.$transaction(
          toUpdate.map(({ id, data }) =>
            prisma.comprobanteCabecera.update({
              where: { id },
              data: {
                ...data,
                fecha: data.fecha ? new Date(data.fecha) : undefined,
                erp_fecha_sync: data.erp_fecha_sync ? new Date(data.erp_fecha_sync) : undefined,
                actualizado: new Date(),
              },
            })
          )
        )
        updated = toUpdate.length
        logger.info({ count: updated }, 'Comprobantes cabecera actualizados (transaction)')
      } catch (error) {
        // If transaction fails, fall back to individual updates
        logger.warn({ error }, 'Transaction failed, falling back to individual updates')
        for (const [index, { id, data }] of toUpdate.entries()) {
          try {
            await prisma.comprobanteCabecera.update({
              where: { id },
              data: {
                ...data,
                fecha: data.fecha ? new Date(data.fecha) : undefined,
                erp_fecha_sync: data.erp_fecha_sync ? new Date(data.erp_fecha_sync) : undefined,
                actualizado: new Date(),
              },
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

    // Step 1a: Batch lookup of parent cabeceras
    const cabeceraKeys = Array.from(
      new Set(
        detalles.map(d => `${d.comprobante_operacion}|${d.comprobante_formulario}|${d.comprobante_numero}`)
      )
    )

    const cabeceras = await prisma.comprobanteCabecera.findMany({
      where: {
        OR: cabeceraKeys.map(key => {
          const [operacion, formulario, numero] = key.split('|')
          return { operacion, formulario, numero }
        }),
      },
      select: { id: true, operacion: true, formulario: true, numero: true },
    })

    const cabeceraMap = new Map(
      cabeceras.map(c => [`${c.operacion}|${c.formulario}|${c.numero}`, c.id])
    )

    // Step 1b: Batch lookup of existing detalles
    const detalleKeys = detalles.map(d => ({
      operacion: d.comprobante_operacion,
      formulario: d.comprobante_formulario,
      numero: d.comprobante_numero,
      linea_numero: d.linea_numero,
    }))

    const existingDetalles = await prisma.comprobanteDetalle.findMany({
      where: {
        OR: detalleKeys.map(k => ({
          operacion: k.operacion,
          formulario: k.formulario,
          numero: k.numero,
          linea_numero: k.linea_numero,
        })),
      },
      select: { id: true, operacion: true, formulario: true, numero: true, linea_numero: true },
    })

    const existingMap = new Map(
      existingDetalles.map(d => [`${d.operacion}|${d.formulario}|${d.numero}|${d.linea_numero}`, d.id])
    )

    // Step 2: Separate into new vs existing records
    const toCreate: Array<{ data: ComprobanteDetalleInput; comprobante_id?: number }> = []
    const toUpdate: Array<{ id: number; data: ComprobanteDetalleInput; comprobante_id?: number }> = []

    for (const det of detalles) {
      const cabeceraKey = `${det.comprobante_operacion}|${det.comprobante_formulario}|${det.comprobante_numero}`
      const detalleKey = `${det.comprobante_operacion}|${det.comprobante_formulario}|${det.comprobante_numero}|${det.linea_numero}`

      const comprobante_id = cabeceraMap.get(cabeceraKey)
      const existingId = existingMap.get(detalleKey)

      if (existingId) {
        toUpdate.push({ id: existingId, data: det, comprobante_id })
      } else {
        toCreate.push({ data: det, comprobante_id })
      }
    }

    // Step 3: Bulk create new records using createMany
    if (toCreate.length > 0) {
      try {
        // Mapear campos normalizados de comprobante (del JSON al modelo Prisma)
        const createResult = await prisma.comprobanteDetalle.createMany({
          data: toCreate.map(({ data: det, comprobante_id }) => {
            const { comprobante_operacion, comprobante_formulario, comprobante_numero, ...detRest } = det
            return {
              ...detRest,
              operacion: comprobante_operacion,
              formulario: comprobante_formulario,
              numero: comprobante_numero,
              comprobante_id,
            }
          }),
          skipDuplicates: true,
        })
        inserted = createResult.count
        logger.info({ count: inserted }, 'Comprobantes detalle insertados (bulk)')
      } catch (error) {
        // If createMany fails, fall back to individual creates
        logger.warn({ error }, 'createMany failed, falling back to individual creates')
        for (const [index, { data: det, comprobante_id }] of toCreate.entries()) {
          try {
            const { comprobante_operacion, comprobante_formulario, comprobante_numero, ...detRest } = det
            await prisma.comprobanteDetalle.create({
              data: {
                ...detRest,
                operacion: comprobante_operacion,
                formulario: comprobante_formulario,
                numero: comprobante_numero,
                comprobante_id,
              },
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

    // Step 4: Update existing records (in transaction)
    if (toUpdate.length > 0) {
      try {
        await prisma.$transaction(
          toUpdate.map(({ id, data: det, comprobante_id }) => {
            const { comprobante_operacion, comprobante_formulario, comprobante_numero, ...detRest } = det
            return prisma.comprobanteDetalle.update({
              where: { id },
              data: {
                ...detRest,
                operacion: comprobante_operacion,
                formulario: comprobante_formulario,
                numero: comprobante_numero,
                comprobante_id,
                actualizado: new Date(),
              },
            })
          })
        )
        updated = toUpdate.length
        logger.info({ count: updated }, 'Comprobantes detalle actualizados (transaction)')
      } catch (error) {
        // If transaction fails, fall back to individual updates
        logger.warn({ error }, 'Transaction failed, falling back to individual updates')
        for (const [index, { id, data: det, comprobante_id }] of toUpdate.entries()) {
          try {
            const { comprobante_operacion, comprobante_formulario, comprobante_numero, ...detRest } = det
            await prisma.comprobanteDetalle.update({
              where: { id },
              data: {
                ...detRest,
                operacion: comprobante_operacion,
                formulario: comprobante_formulario,
                numero: comprobante_numero,
                comprobante_id,
                actualizado: new Date(),
              },
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

    // Step 1a: Batch lookup of parent cabeceras
    const cabeceraKeys = Array.from(
      new Set(
        pagos.map(p => `${p.comprobante_operacion}|${p.comprobante_formulario}|${p.comprobante_numero}`)
      )
    )

    const cabeceras = await prisma.comprobanteCabecera.findMany({
      where: {
        OR: cabeceraKeys.map(key => {
          const [operacion, formulario, numero] = key.split('|')
          return { operacion, formulario, numero }
        }),
      },
      select: { id: true, operacion: true, formulario: true, numero: true },
    })

    const cabeceraMap = new Map(
      cabeceras.map(c => [`${c.operacion}|${c.formulario}|${c.numero}`, c.id])
    )

    // Step 1b: Batch lookup of existing pagos
    const pagoKeys = pagos.map(p => ({
      operacion: p.comprobante_operacion,
      formulario: p.comprobante_formulario,
      numero: p.comprobante_numero,
      linea_numero: p.linea_numero,
    }))

    const existingPagos = await prisma.comprobantePagos.findMany({
      where: {
        OR: pagoKeys.map(k => ({
          operacion: k.operacion,
          formulario: k.formulario,
          numero: k.numero,
          linea_numero: k.linea_numero,
        })),
      },
      select: { id: true, operacion: true, formulario: true, numero: true, linea_numero: true },
    })

    const existingMap = new Map(
      existingPagos.map(p => [`${p.operacion}|${p.formulario}|${p.numero}|${p.linea_numero}`, p.id])
    )

    // Step 2: Separate into new vs existing records
    const toCreate: Array<{ data: ComprobantePagosInput; comprobante_id?: number }> = []
    const toUpdate: Array<{ id: number; data: ComprobantePagosInput; comprobante_id?: number }> = []

    for (const pago of pagos) {
      const cabeceraKey = `${pago.comprobante_operacion}|${pago.comprobante_formulario}|${pago.comprobante_numero}`
      const pagoKey = `${pago.comprobante_operacion}|${pago.comprobante_formulario}|${pago.comprobante_numero}|${pago.linea_numero}`

      const comprobante_id = cabeceraMap.get(cabeceraKey)
      const existingId = existingMap.get(pagoKey)

      if (existingId) {
        toUpdate.push({ id: existingId, data: pago, comprobante_id })
      } else {
        toCreate.push({ data: pago, comprobante_id })
      }
    }

    // Step 3: Bulk create new records using createMany
    if (toCreate.length > 0) {
      try {
        // Mapear campos normalizados de comprobante (del JSON al modelo Prisma)
        const createResult = await prisma.comprobantePagos.createMany({
          data: toCreate.map(({ data: pago, comprobante_id }) => {
            const { comprobante_operacion, comprobante_formulario, comprobante_numero, ...pagoRest } = pago
            const metodo_pago_normalizado = pago.metodo_pago || pago.medio || 'EFECTIVO'
            return {
              ...pagoRest,
              operacion: comprobante_operacion,
              formulario: comprobante_formulario,
              numero: comprobante_numero,
              metodo_pago: metodo_pago_normalizado,
              comprobante_id,
              cheque_fecha_diferida: pagoRest.cheque_fecha_diferida ? new Date(pagoRest.cheque_fecha_diferida) : null,
              fecha_vencimiento: pagoRest.fecha_vencimiento ? new Date(pagoRest.fecha_vencimiento) : null,
              fecha_pago: pagoRest.fecha_pago ? new Date(pagoRest.fecha_pago) : null,
            }
          }),
          skipDuplicates: true,
        })
        inserted = createResult.count
        logger.info({ count: inserted }, 'Comprobantes pagos insertados (bulk)')
      } catch (error) {
        // If createMany fails, fall back to individual creates
        logger.warn({ error }, 'createMany failed, falling back to individual creates')
        for (const [index, { data: pago, comprobante_id }] of toCreate.entries()) {
          try {
            const { comprobante_operacion, comprobante_formulario, comprobante_numero, ...pagoRest } = pago
            const metodo_pago_normalizado = pago.metodo_pago || pago.medio || 'EFECTIVO'
            await prisma.comprobantePagos.create({
              data: {
                ...pagoRest,
                operacion: comprobante_operacion,
                formulario: comprobante_formulario,
                numero: comprobante_numero,
                metodo_pago: metodo_pago_normalizado,
                comprobante_id,
                cheque_fecha_diferida: pagoRest.cheque_fecha_diferida ? new Date(pagoRest.cheque_fecha_diferida) : null,
                fecha_vencimiento: pagoRest.fecha_vencimiento ? new Date(pagoRest.fecha_vencimiento) : null,
                fecha_pago: pagoRest.fecha_pago ? new Date(pagoRest.fecha_pago) : null,
              },
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

            const detailedError = `[${errorCode}] ${errorMessage} | Pago: ${pago.erp_operacion}/${pago.erp_formulario}/${pago.erp_numero} L${pago.linea_numero} - ${pago.medio || pago.metodo_pago}`

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

    // Step 4: Update existing records (in transaction)
    if (toUpdate.length > 0) {
      try {
        await prisma.$transaction(
          toUpdate.map(({ id, data: pago, comprobante_id }) => {
            const { comprobante_operacion, comprobante_formulario, comprobante_numero, ...pagoRest } = pago
            const metodo_pago_normalizado = pago.metodo_pago || pago.medio || 'EFECTIVO'
            return prisma.comprobantePagos.update({
              where: { id },
              data: {
                ...pagoRest,
                operacion: comprobante_operacion,
                formulario: comprobante_formulario,
                numero: comprobante_numero,
                metodo_pago: metodo_pago_normalizado,
                comprobante_id,
                cheque_fecha_diferida: pagoRest.cheque_fecha_diferida ? new Date(pagoRest.cheque_fecha_diferida) : null,
                fecha_vencimiento: pagoRest.fecha_vencimiento ? new Date(pagoRest.fecha_vencimiento) : null,
                fecha_pago: pagoRest.fecha_pago ? new Date(pagoRest.fecha_pago) : null,
                actualizado: new Date(),
              },
            })
          })
        )
        updated = toUpdate.length
        logger.info({ count: updated }, 'Comprobantes pagos actualizados (transaction)')
      } catch (error) {
        // If transaction fails, fall back to individual updates
        logger.warn({ error }, 'Transaction failed, falling back to individual updates')
        for (const [index, { id, data: pago, comprobante_id }] of toUpdate.entries()) {
          try {
            const { comprobante_operacion, comprobante_formulario, comprobante_numero, ...pagoRest } = pago
            const metodo_pago_normalizado = pago.metodo_pago || pago.medio || 'EFECTIVO'
            await prisma.comprobantePagos.update({
              where: { id },
              data: {
                ...pagoRest,
                operacion: comprobante_operacion,
                formulario: comprobante_formulario,
                numero: comprobante_numero,
                metodo_pago: metodo_pago_normalizado,
                comprobante_id,
                cheque_fecha_diferida: pagoRest.cheque_fecha_diferida ? new Date(pagoRest.cheque_fecha_diferida) : null,
                fecha_vencimiento: pagoRest.fecha_vencimiento ? new Date(pagoRest.fecha_vencimiento) : null,
                fecha_pago: pagoRest.fecha_pago ? new Date(pagoRest.fecha_pago) : null,
                actualizado: new Date(),
              },
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

            const detailedError = `[${errorCode}] ${errorMessage} | Pago: ${pago.erp_operacion}/${pago.erp_formulario}/${pago.erp_numero} L${pago.linea_numero} - ${pago.medio || pago.metodo_pago}`

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
