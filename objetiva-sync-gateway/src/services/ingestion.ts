import type { PrismaClient } from '@prisma/client'
import type {
  ArticuloInput,
  ComprobanteCabeceraInput,
  ComprobanteDetalleInput,
  ComprobantePagosInput
} from '../../shared/schemas/index.js'
import { logger } from '../lib/logger.js'

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
   * Ingesta de artículos
   * ✅ TODO EN SNAKE_CASE - Sin mapeo manual
   */
  static async ingestArticulos(
    prisma: PrismaClient,
    articulos: ArticuloInput[]
  ): Promise<IngestionResult> {
    let inserted = 0
    let updated = 0
    const errors: IngestionResult['errors'] = []

    for (const [index, articulo] of articulos.entries()) {
      try {
        // Buscar existente por erp_codigo
        const existing = await prisma.articulo.findFirst({
          where: {
            erp_codigo: articulo.erp_codigo,
          }
        })

        if (existing) {
          // UPDATE - Los nombres coinciden exactamente
          await prisma.articulo.update({
            where: { id: existing.id },
            data: {
              ...articulo,  // ✅ Spread directo - nombres coinciden
              actualizado: new Date()
            }
          })
          updated++
          logger.debug({ erp_codigo: articulo.erp_codigo }, 'Artículo actualizado')
        } else {
          // INSERT - Los nombres coinciden exactamente
          await prisma.articulo.create({
            data: articulo  // ✅ Directo - sin mapeo
          })
          inserted++
          logger.debug({ erp_codigo: articulo.erp_codigo }, 'Artículo insertado')
        }

      } catch (error) {
        logger.error({ error, articulo }, 'Error al procesar artículo')
        errors.push({
          index,
          identifier: articulo.sku || articulo.codigo || `item-${index}`,
          error: error instanceof Error ? error.message : 'Error desconocido',
          code: 'INGESTION_ERROR'
        })
      }
    }

    logger.info({ inserted, updated, errors: errors.length }, 'Artículos procesados')
    return { inserted, updated, errors }
  }

  /**
   * Ingesta de comprobantes cabecera
   */
  static async ingestComprobantesCabecera(
    prisma: PrismaClient,
    comprobantes: ComprobanteCabeceraInput[]
  ): Promise<IngestionResult> {
    let inserted = 0
    let updated = 0
    const errors: IngestionResult['errors'] = []

    for (const [index, comp] of comprobantes.entries()) {
      try {
        const existing = await prisma.comprobanteCabecera.findUnique({
          where: {
            idx_comprobante_erp_unique: {
              operacion: comp.operacion,
              formulario: comp.formulario,
              numero: comp.numero
            }
          }
        })

        // Convertir fechas string a Date
        const dataPayload = {
          ...comp,
          fecha: comp.fecha ? new Date(comp.fecha) : undefined,
          erp_fecha_sync: comp.erp_fecha_sync ? new Date(comp.erp_fecha_sync) : undefined,
        }

        if (existing) {
          await prisma.comprobanteCabecera.update({
            where: { id: existing.id },
            data: {
              ...dataPayload,
              actualizado: new Date()
            }
          })
          updated++
          logger.debug({ key: `${comp.operacion}/${comp.formulario}/${comp.numero}` }, 'Comprobante cabecera actualizado')
        } else {
          await prisma.comprobanteCabecera.create({
            data: dataPayload
          })
          inserted++
          logger.debug({ key: `${comp.operacion}/${comp.formulario}/${comp.numero}` }, 'Comprobante cabecera insertado')
        }

      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Error desconocido'
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

        logger.error({
          error: errorMessage,
          errorCode,
          key: `${comp.erp_operacion}/${comp.erp_formulario}/${comp.erp_numero}`
        }, 'Error al procesar comprobante cabecera')

        errors.push({
          index,
          identifier: `${comp.erp_operacion}/${comp.erp_formulario}/${comp.erp_numero}`,
          error: detailedError,
          code: errorCode
        })
      }
    }

    logger.info({ inserted, updated, errors: errors.length }, 'Comprobantes cabecera procesados')
    return { inserted, updated, errors }
  }

  /**
   * Ingesta de comprobantes detalle
   */
  static async ingestComprobantesDetalle(
    prisma: PrismaClient,
    detalles: ComprobanteDetalleInput[]
  ): Promise<IngestionResult> {
    let inserted = 0
    let updated = 0
    const errors: IngestionResult['errors'] = []

    for (const [index, det] of detalles.entries()) {
      try {
        // Buscar cabecera (opcional)
        const cabecera = await prisma.comprobanteCabecera.findUnique({
          where: {
            idx_comprobante_erp_unique: {
              operacion: det.comprobante_operacion,
              formulario: det.comprobante_formulario,
              numero: det.comprobante_numero
            }
          }
        })

        // Buscar detalle existente
        const existing = await prisma.comprobanteDetalle.findFirst({
          where: {
            operacion: det.comprobante_operacion,
            formulario: det.comprobante_formulario,
            numero: det.comprobante_numero,
            linea_numero: det.linea_numero
          }
        })

        // Mapear campos normalizados de comprobante (del JSON al modelo Prisma)
        const { comprobante_operacion, comprobante_formulario, comprobante_numero, ...detRest } = det

        const dataPayload = {
          ...detRest,
          operacion: comprobante_operacion,   // Mapear a nombre Prisma
          formulario: comprobante_formulario, // Mapear a nombre Prisma
          numero: comprobante_numero,         // Mapear a nombre Prisma
          comprobante_id: cabecera?.id || undefined
        }

        if (existing) {
          await prisma.comprobanteDetalle.update({
            where: { id: existing.id },
            data: {
              ...dataPayload,
              actualizado: new Date()
            }
          })
          updated++
          logger.debug(
            { erp_numero: det.erp_numero, linea_numero: det.linea_numero },
            'Comprobante detalle actualizado'
          )
        } else {
          await prisma.comprobanteDetalle.create({
            data: dataPayload
          })
          inserted++
          logger.debug(
            { erp_numero: det.erp_numero, linea_numero: det.linea_numero },
            'Comprobante detalle insertado'
          )
        }

      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Error desconocido'
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

        logger.error({
          error: errorMessage,
          errorCode,
          erpKey: `${det.erp_operacion}/${det.erp_formulario}/${det.erp_numero}`,
          linea_numero: det.linea_numero
        }, 'Error al procesar comprobante detalle')

        errors.push({
          index,
          identifier: `${det.erp_operacion}/${det.erp_formulario}/${det.erp_numero} L${det.linea_numero}`,
          error: detailedError,
          code: errorCode
        })
      }
    }

    logger.info({ inserted, updated, errors: errors.length }, 'Comprobantes detalle procesados')
    return { inserted, updated, errors }
  }

  /**
   * Ingesta de comprobantes pagos
   */
  static async ingestComprobantesPagos(
    prisma: PrismaClient,
    pagos: ComprobantePagosInput[]
  ): Promise<IngestionResult> {
    let inserted = 0
    let updated = 0
    const errors: IngestionResult['errors'] = []

    for (const [index, pago] of pagos.entries()) {
      try {
        // Normalizar medio/metodo_pago
        const metodo_pago_normalizado = pago.metodo_pago || pago.medio || 'EFECTIVO'

        // Buscar cabecera (opcional)
        const cabecera = await prisma.comprobanteCabecera.findUnique({
          where: {
            idx_comprobante_erp_unique: {
              operacion: pago.comprobante_operacion,
              formulario: pago.comprobante_formulario,
              numero: pago.comprobante_numero
            }
          }
        })

        // Buscar pago existente
        const existing = await prisma.comprobantePagos.findFirst({
          where: {
            operacion: pago.comprobante_operacion,
            formulario: pago.comprobante_formulario,
            numero: pago.comprobante_numero,
            linea_numero: pago.linea_numero
          }
        })

        // Mapear campos normalizados de comprobante (del JSON al modelo Prisma)
        const { comprobante_operacion, comprobante_formulario, comprobante_numero, ...pagoRest } = pago

        // Convertir fechas
        const dataPayload = {
          ...pagoRest,
          operacion: comprobante_operacion,   // Mapear a nombre Prisma
          formulario: comprobante_formulario, // Mapear a nombre Prisma
          numero: comprobante_numero,         // Mapear a nombre Prisma
          metodo_pago: metodo_pago_normalizado,
          comprobante_id: cabecera?.id || undefined,
          cheque_fecha_diferida: pagoRest.cheque_fecha_diferida ? new Date(pagoRest.cheque_fecha_diferida) : null,
          fecha_vencimiento: pagoRest.fecha_vencimiento ? new Date(pagoRest.fecha_vencimiento) : null,
          fecha_pago: pagoRest.fecha_pago ? new Date(pagoRest.fecha_pago) : null,
        }

        if (existing) {
          await prisma.comprobantePagos.update({
            where: { id: existing.id },
            data: {
              ...dataPayload,
              actualizado: new Date()
            }
          })
          updated++
          logger.debug(
            { erp_numero: pago.erp_numero, linea_numero: pago.linea_numero, metodo_pago: metodo_pago_normalizado },
            'Comprobante pago actualizado'
          )
        } else {
          await prisma.comprobantePagos.create({
            data: dataPayload
          })
          inserted++
          logger.debug(
            { erp_numero: pago.erp_numero, linea_numero: pago.linea_numero, metodo_pago: metodo_pago_normalizado },
            'Comprobante pago insertado'
          )
        }

      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Error desconocido'
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

        logger.error({
          error: errorMessage,
          errorCode,
          erpKey: `${pago.erp_operacion}/${pago.erp_formulario}/${pago.erp_numero}`,
          linea_numero: pago.linea_numero,
          metodo_pago: pago.medio || pago.metodo_pago
        }, 'Error al procesar comprobante pago')

        errors.push({
          index,
          identifier: `${pago.erp_operacion}/${pago.erp_formulario}/${pago.erp_numero} L${pago.linea_numero}`,
          error: detailedError,
          code: errorCode
        })
      }
    }

    logger.info({ inserted, updated, errors: errors.length }, 'Comprobantes pagos procesados')
    return { inserted, updated, errors }
  }
}
