// Auto-generated from PostgreSQL schema introspection
// DO NOT EDIT - regenerate with: npm run regenerate-schemas
// Generated: 2026-02-02T02:08:33.078Z

import { z } from 'zod';

/**
 * Database-structure schema for comprobantes_pagos
 * Reflects PostgreSQL column types and nullability only.
 * For business validation rules, see shared/schemas/comprobantes_pagos.ts
 */
export const ComprobantesPagosDbSchema = z.object({
  comprobante_id: z.number().int().nullable().optional(),
  comprobante_operacion: z.string(),
  comprobante_formulario: z.string(),
  comprobante_numero: z.string(),
  metodo_pago: z.string(),
  medio: z.string().optional(), // Backward compatibility alias for metodo_pago
  monto: z.number(),
  moneda: z.string().default('ARS'),
  tarjeta_marca: z.string().nullable().optional(),
  tarjeta_cuotas: z.number().int().nullable().optional(),
  tarjeta_recargo: z.number().nullable().optional(),
  cheque_fecha_diferida: z.coerce.date().nullable().optional(),
  fecha_vencimiento: z.coerce.date().nullable().optional(),
  datos_extra: z.record(z.unknown()).nullable().optional(),
  referencia: z.string().nullable().optional(),
  erp_operacion: z.string(),
  erp_formulario: z.string(),
  erp_numero: z.string(),
  observaciones: z.string().nullable().optional(),
  linea_numero: z.number().int(),
});

export type ComprobantesPagosDbInput = z.infer<typeof ComprobantesPagosDbSchema>;
