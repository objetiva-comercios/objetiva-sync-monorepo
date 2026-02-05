import { z } from 'zod'

// ============================================
// COMPROBANTE PAGO (Atomizado)
// IMPORTANTE: Compatible con objetiva-sync
// ============================================

export const ComprobantePagosSchema = z.object({
  // Clave compuesta ERP - REQUERIDA (lo que sync envía)
  erp_operacion: z.string().min(1, 'erp_operacion es requerido')
    .describe('Operación del comprobante en el ERP origen (valor original sin normalizar) | Ejemplo: "VEN"'),
  erp_formulario: z.string().min(1, 'erp_formulario es requerido')
    .describe('Formulario del comprobante en el ERP origen (valor original sin normalizar) | Ejemplo: "FACT A"'),
  erp_numero: z.string().min(1, 'erp_numero es requerido')
    .describe('Número del comprobante en el ERP origen (valor original sin normalizar) | Ejemplo: "00001-00000123"'),

  // Clave compuesta normalizada - REQUERIDA (debe ser enviada por sync)
  comprobante_operacion: z.string().min(1, 'comprobante_operacion es requerido')
    .describe('Operación del comprobante normalizada (formato estándar) | Ejemplo: "VTA"'),
  comprobante_formulario: z.string().min(1, 'comprobante_formulario es requerido')
    .describe('Formulario del comprobante normalizado (formato estándar) | Ejemplo: "FA"'),
  comprobante_numero: z.string().min(1, 'comprobante_numero es requerido')
    .describe('Número del comprobante normalizado (sin guiones ni espacios) | Ejemplo: "00001000123"'),

  // Orden - REQUERIDO (parte de clave única)
  linea_numero: z.number().int().min(1, 'linea_numero es requerido')
    .describe('Número de línea del pago en el comprobante (1, 2, 3...) | Ejemplo: 1'),

  // Datos del pago - 'medio' es el campo en PostgreSQL
  medio: z.string().min(1, 'medio es requerido')
    .describe('Método de pago utilizado | Ejemplo: "EFECTIVO"'),
  monto: z.number().nonnegative('Monto debe ser mayor o igual a 0')
    .describe('Monto del pago en la moneda especificada | Ejemplo: 50000.00'),
  moneda: z.string().default('ARS')
    .describe('Código de moneda del pago (ISO 4217) | Ejemplo: "ARS"'),

  // Datos de tarjeta (si aplica)
  tarjeta_marca: z.string().optional()
    .describe('Marca de la tarjeta si el pago es con tarjeta | Ejemplo: "VISA"'),
  tarjeta_cuotas: z.number().int().optional()
    .describe('Cantidad de cuotas si el pago es en cuotas | Ejemplo: 6'),
  tarjeta_recargo: z.number().optional()
    .describe('Recargo adicional por pago con tarjeta | Ejemplo: 2500.00'),

  // Datos de cheque (si aplica)
  cheque_fecha_diferida: z.string().datetime().optional()
    .describe('Fecha de cobro del cheque si es diferido (ISO 8601) | Ejemplo: "2026-02-15T00:00:00.000Z"'),

  // Otros datos
  fecha_pago: z.string().datetime().optional()
    .describe('Fecha en que se realizó el pago (ISO 8601) | Ejemplo: "2026-01-11T14:30:00.000Z"'),
  fecha_vencimiento: z.string().datetime().optional()
    .describe('Fecha de vencimiento del pago si aplica (ISO 8601) | Ejemplo: "2026-03-01T00:00:00.000Z"'),
  datos_extra: z.record(z.any()).optional()
    .describe('Datos adicionales específicos del medio de pago | Ejemplo: {"numero_autorizacion": "123456"}'),
  referencia: z.string().optional()
    .describe('Referencia o número de transacción del pago | Ejemplo: "TRX-2024-001234"'),

  // Metadata
  observaciones: z.string().optional()
    .describe('Notas o comentarios adicionales sobre el pago | Ejemplo: "Pago parcial"'),
})

export const ComprobantePagosBatchSchema = z.object({
  comprobantes_pagos: z.array(ComprobantePagosSchema).min(1)
})

export type ComprobantePagosInput = z.infer<typeof ComprobantePagosSchema>
export type ComprobantePagosBatch = z.infer<typeof ComprobantePagosBatchSchema>
