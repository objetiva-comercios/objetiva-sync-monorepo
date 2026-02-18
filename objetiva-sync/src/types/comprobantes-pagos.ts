import { z } from 'zod';

/**
 * Payload de pago de comprobante (ATOMIZADO)
 * Se envía de forma independiente a su propio endpoint
 * Vinculado por erp_operacion + erp_formulario + erp_numero
 */
export interface IComprobantePagosPayload {
  // Claves compuestas - vinculan con cabecera
  erp_operacion: string; // Requerido - parte de clave compuesta
  erp_formulario: string; // Requerido - parte de clave compuesta
  erp_numero: string; // Requerido - parte de clave compuesta

  // Campos normalizados del comprobante (requeridos en gateway)
  comprobante_operacion: string; // Requerido - operación normalizada del comprobante padre
  comprobante_formulario: string; // Requerido - formulario normalizado del comprobante padre
  comprobante_numero: string; // Requerido - número normalizado del comprobante padre

  // Orden - REQUERIDO (parte de clave única en gateway)
  linea_numero: number; // Requerido - orden del pago (1, 2, 3...)

  // Datos del pago
  medio: string; // Requerido - medio de pago (ej: 'EFECTIVO', 'TRANSFERENCIA', etc.)
  monto: number; // Requerido - monto del pago
  moneda?: string; // Moneda (ej: 'ARS', 'USD'), default 'ARS'

  // Datos adicionales del pago
  fecha_pago?: string; // Fecha del pago si difiere de la fecha del comprobante
  referencia?: string; // Número de cheque, transferencia, etc.

  // Metadata
  erp_datos?: Record<string, unknown>;
}

/**
 * Schema Zod para IComprobantePagosPayload
 */
export const comprobantePagoPayloadSchema = z.object({
  // Claves compuestas (requeridas)
  erp_operacion: z.string().min(1, 'erp_operacion es requerido')
    .describe('Operación del comprobante en el ERP origen (valor original sin normalizar) | Ejemplo: "VEN"'),
  erp_formulario: z.string().min(1, 'erp_formulario es requerido')
    .describe('Formulario del comprobante en el ERP origen (valor original sin normalizar) | Ejemplo: "FACT A"'),
  erp_numero: z.string().min(1, 'erp_numero es requerido')
    .describe('Número del comprobante en el ERP origen (valor original sin normalizar) | Ejemplo: "00001-00000123"'),

  // Campos normalizados del comprobante (requeridos)
  comprobante_operacion: z.string().min(1, 'comprobante_operacion es requerido').max(100)
    .describe('Operación del comprobante normalizada (formato estándar) | Ejemplo: "VTA"'),
  comprobante_formulario: z.string().min(1, 'comprobante_formulario es requerido').max(100)
    .describe('Formulario del comprobante normalizado (formato estándar) | Ejemplo: "FA"'),
  comprobante_numero: z.string().min(1, 'comprobante_numero es requerido').max(100)
    .describe('Número del comprobante normalizado (sin guiones ni espacios) | Ejemplo: "00001000123"'),

  // Línea - REQUERIDA (parte de clave única)
  linea_numero: z.number().int().min(1, 'linea_numero es requerido')
    .describe('Número de línea del pago en el comprobante (1, 2, 3...) | Ejemplo: 1'),

  // Datos del pago
  medio: z.string().min(1, 'Medio de pago es requerido').max(100)
    .describe('Método de pago utilizado | Ejemplo: "EFECTIVO"'),
  monto: z.number()
    .describe('Monto del pago en la moneda especificada | Ejemplo: 50000.00'),
  moneda: z.string().max(10).optional()
    .describe('Código de moneda del pago (ISO 4217) | Ejemplo: "ARS"'),

  // Datos adicionales
  fecha_pago: z.string().datetime().optional()
    .describe('Fecha en que se realizó el pago (ISO 8601) | Ejemplo: "2026-01-11T14:30:00.000Z"'),
  referencia: z.string().max(500).optional()
    .describe('Referencia o número de transacción del pago | Ejemplo: "TRX-2024-001234"'),

  // Metadata
  erp_datos: z.record(z.unknown()).optional()
    .describe('Datos adicionales del ERP en formato JSON | Ejemplo: {"campo_extra": "valor"}'),
});

/**
 * Tipo inferido del schema
 */
export type ComprobantePagosPayload = z.infer<typeof comprobantePagoPayloadSchema>;

/**
 * Schema para batch de pagos
 */
export const comprobantesPagosBatchSchema = z.object({
  comprobantes_pagos: z.array(comprobantePagoPayloadSchema).min(1).max(1000),
});

/**
 * Type guard para verificar si un objeto es IComprobantePagosPayload válido
 */
export function isComprobantePagosPayload(obj: unknown): obj is IComprobantePagosPayload {
  const result = comprobantePagoPayloadSchema.safeParse(obj);
  return result.success;
}
