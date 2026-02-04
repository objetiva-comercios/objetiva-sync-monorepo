// Auto-generated from PostgreSQL schema introspection
// DO NOT EDIT - regenerate with: npm run regenerate-schemas
// Generated: 2026-02-02T02:08:33.078Z

import { z } from 'zod';

/**
 * Database-structure schema for comprobantes_cabecera
 * Reflects PostgreSQL column types and nullability only.
 * For business validation rules, see shared/schemas/comprobantes_cabecera.ts
 */
export const ComprobantesCabeceraDbSchema = z.object({
  operacion: z.string(),
  formulario: z.string(),
  numero: z.string(),
  fecha: z.coerce.date().nullable().optional(),
  tercero_tipo: z.string().nullable().optional(),
  tercero_nombre: z.string().nullable().optional(),
  tercero_documento: z.string().nullable().optional(),
  tercero_direccion: z.string().nullable().optional(),
  tercero_datos: z.record(z.unknown()).nullable().optional(),
  cantidad_items: z.number().int().nullable().optional(),
  total_descuentos: z.number().optional(),
  total_venta: z.number().optional(),
  erp_id: z.string().nullable().optional(),
  erp_operacion: z.string(),
  erp_formulario: z.string(),
  erp_numero: z.string(),
  erp_datos: z.record(z.unknown()).nullable().optional(),
  erp_sincronizado: z.boolean().nullable().optional(),
  erp_fecha_sync: z.coerce.date().nullable().optional(),
  observaciones: z.string().nullable().optional(),
  activo: z.boolean().optional(),
  total_bruto: z.number(),
  total_neto: z.number(),
  total_iva: z.number(),
  total_intereses_financieros: z.number().nullable().optional(),
  total_cobrado: z.number().nullable().optional(),
});

export type ComprobantesCabeceraDbInput = z.infer<typeof ComprobantesCabeceraDbSchema>;
