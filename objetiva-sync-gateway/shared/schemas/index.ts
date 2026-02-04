// Re-export from generated schemas (source of truth from PostgreSQL introspection)
// Manual schemas in ./*.ts are deprecated - use generated schemas
// Backward-compatible aliases ensure existing consumers don't break
import { z } from 'zod'

// === Import generated schemas ===
import { ArticulosDbSchema } from './generated/articulos.generated.js'
import { ComprobantesCabeceraDbSchema } from './generated/comprobantes_cabecera.generated.js'
import { ComprobantesDetalleDbSchema } from './generated/comprobantes_detalle.generated.js'
import { ComprobantesPagosDbSchema } from './generated/comprobantes_pagos.generated.js'
import type { ArticulosDbInput } from './generated/articulos.generated.js'
import type { ComprobantesCabeceraDbInput } from './generated/comprobantes_cabecera.generated.js'
import type { ComprobantesDetalleDbInput } from './generated/comprobantes_detalle.generated.js'
import type { ComprobantesPagosDbInput } from './generated/comprobantes_pagos.generated.js'

// === Re-export generated schemas (canonical names) ===
export { ArticulosDbSchema, ComprobantesCabeceraDbSchema, ComprobantesDetalleDbSchema, ComprobantesPagosDbSchema }
export type { ArticulosDbInput, ComprobantesCabeceraDbInput, ComprobantesDetalleDbInput, ComprobantesPagosDbInput }

// === Backward-compatible type aliases ===
// Used by: src/services/ingestion.ts
export type ArticuloInput = ArticulosDbInput
export type ComprobanteCabeceraInput = ComprobantesCabeceraDbInput
export type ComprobanteDetalleInput = ComprobantesDetalleDbInput
export type ComprobantePagosInput = ComprobantesPagosDbInput

// === Batch schemas (used by routes) ===
// Used by: src/routes/articulos.ts, src/routes/comprobantes.ts
export const ArticuloBatchSchema = z.object({
  articulos: z.array(ArticulosDbSchema).min(1, 'Debe enviar al menos un articulo')
})

export const ComprobanteCabeceraBatchSchema = z.object({
  comprobantes_cabecera: z.array(ComprobantesCabeceraDbSchema).min(1, 'Debe enviar al menos un comprobante cabecera')
})

export const ComprobanteDetalleBatchSchema = z.object({
  comprobantes_detalle: z.array(ComprobantesDetalleDbSchema).min(1, 'Debe enviar al menos un comprobante detalle')
})

export const ComprobantePagosBatchSchema = z.object({
  comprobantes_pagos: z.array(ComprobantesPagosDbSchema).min(1, 'Debe enviar al menos un comprobante pago')
})

export type ArticuloBatch = z.infer<typeof ArticuloBatchSchema>
export type ComprobanteCabeceraBatch = z.infer<typeof ComprobanteCabeceraBatchSchema>
export type ComprobanteDetalleBatch = z.infer<typeof ComprobanteDetalleBatchSchema>
export type ComprobantePagosBatch = z.infer<typeof ComprobantePagosBatchSchema>
