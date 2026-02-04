// Auto-generated from PostgreSQL schema introspection
// DO NOT EDIT - regenerate with: npm run regenerate-schemas
// Generated: 2026-02-02T02:08:33.078Z

import { z } from 'zod';

/**
 * Database-structure schema for comprobantes_detalle
 * Reflects PostgreSQL column types and nullability only.
 * For business validation rules, see shared/schemas/comprobantes_detalle.ts
 */
export const ComprobantesDetalleDbSchema = z.object({
  comprobante_id: z.number().int().nullable().optional(),
  comprobante_operacion: z.string(),
  comprobante_formulario: z.string(),
  comprobante_numero: z.string(),
  linea_numero: z.number().int(),
  articulo_id: z.number().int().nullable().optional(),
  articulo_codigo: z.string().nullable().optional(),
  articulo_nombre: z.string().nullable().optional(),
  unidades: z.number(),
  precio_unitario: z.number(),
  erp_operacion: z.string(),
  erp_formulario: z.string(),
  erp_numero: z.string(),
  erp_datos: z.record(z.unknown()).nullable().optional(),
  observaciones: z.string().nullable().optional(),
  importe_bruto: z.number(),
  porc_descuento: z.number().nullable().optional(),
  importe_descuento: z.number().optional(),
  importe_neto: z.number(),
  alicuota_iva: z.number(),
  importe_iva: z.number(),
  importe_total: z.number(),
});

export type ComprobantesDetalleDbInput = z.infer<typeof ComprobantesDetalleDbSchema>;
