import { z } from 'zod';

// ============================================
// COMPROBANTE CABECERA - Modelo Fiscal Argentino (IVA)
// IMPORTANTE: Compatible con objetiva-sync-gateway
// RESUMEN de detalles - No calcula valores propios
// Separa claramente: TOTALES DE VENTA (fiscales) vs TOTALES DE COBRO (financieros)
// ============================================

/**
 * Payload de cabecera de comprobante
 * Modelo adaptado a normativa fiscal argentina (IVA únicamente)
 *
 * TOTALES DE VENTA (fiscales - resumen de detalles):
 * - total_bruto = SUM(detalle.importe_bruto)
 * - total_descuentos = SUM(detalle.importe_descuento)
 * - total_neto = SUM(detalle.importe_neto) = total_bruto - total_descuentos
 * - total_iva = SUM(detalle.importe_iva)
 * - total_venta = SUM(detalle.importe_total) = total_neto + total_iva
 * - cantidad_items = COUNT(detalle)
 *
 * TOTALES DE COBRO (financieros - resumen de pagos):
 * - total_intereses_financieros = SUM(pagos.interes_financiero)
 * - total_cobrado = total_venta + total_intereses_financieros
 */
export interface IComprobanteCabeceraPayload {
  // ============================
  // CLAVES COMPUESTAS (REQUERIDAS)
  // ============================

  // Clave compuesta ERP - valores originales del ERP
  erp_operacion: string;
  erp_formulario: string;
  erp_numero: string;

  // Clave compuesta normalizada - formato estándar
  operacion: string;
  formulario: string;
  numero: string;

  // ============================
  // DATOS DEL COMPROBANTE (REQUERIDOS)
  // ============================
  fecha: string; // ISO date

  // ============================
  // TERCERO (OPCIONAL)
  // ============================
  tercero_tipo?: string; // 'CLIENTE', 'PROVEEDOR'
  tercero_nombre?: string;
  tercero_documento?: string; // CUIT/DNI
  tercero_direccion?: string;
  tercero_datos?: Record<string, unknown>; // Datos extra del tercero

  // ============================
  // TOTALIZADORES DE VENTA - FISCALES (REQUERIDOS)
  // ============================
  cantidad_items: number; // COUNT(detalle)
  total_bruto: number; // SUM(detalle.importe_bruto)
  total_descuentos: number; // SUM(detalle.importe_descuento)
  total_neto: number; // SUM(detalle.importe_neto) = total_bruto - total_descuentos
  total_iva: number; // SUM(detalle.importe_iva)
  total_venta: number; // SUM(detalle.importe_total) = total_neto + total_iva

  // ============================
  // TOTALIZADORES DE COBRO - FINANCIEROS (OPCIONALES)
  // ============================
  total_intereses_financieros?: number; // SUM(pagos.interes_financiero)
  total_cobrado?: number; // total_venta + total_intereses_financieros

  // ============================
  // METADATA (OPCIONALES)
  // ============================
  erp_id?: string; // ID interno del ERP
  erp_datos?: Record<string, unknown>;
  observaciones?: string;
}

/**
 * Schema Zod para IComprobanteCabeceraPayload
 */
export const comprobanteCabeceraPayloadSchema = z.object({
  // ============================
  // CLAVES COMPUESTAS (REQUERIDAS)
  // ============================

  // Clave compuesta ERP - valores originales del ERP
  erp_operacion: z.string()
    .min(1, 'erp_operacion es requerido')
    .describe('Operación del comprobante en el ERP origen (valor original sin normalizar) | Ejemplo: "VEN"'),

  erp_formulario: z.string()
    .min(1, 'erp_formulario es requerido')
    .describe('Formulario del comprobante en el ERP origen (valor original sin normalizar) | Ejemplo: "FACTURA A"'),

  erp_numero: z.string()
    .min(1, 'erp_numero es requerido')
    .describe('Número del comprobante en el ERP origen (valor original sin normalizar) | Ejemplo: "00001-00000123"'),

  // Clave compuesta normalizada - formato estándar
  operacion: z.string()
    .min(1, 'operacion es requerido')
    .max(100)
    .describe('Operación del comprobante normalizada para búsquedas (parte de clave única) | Ejemplo: "VTA"'),

  formulario: z.string()
    .min(1, 'formulario es requerido')
    .max(100)
    .describe('Formulario del comprobante normalizado para búsquedas (parte de clave única) | Ejemplo: "FA"'),

  numero: z.string()
    .min(1, 'numero es requerido')
    .max(100)
    .describe('Número del comprobante normalizado para búsquedas (parte de clave única) | Ejemplo: "00001234"'),

  // ============================
  // DATOS DEL COMPROBANTE (REQUERIDOS)
  // ============================
  fecha: z.string()
    .datetime('Fecha debe ser ISO 8601')
    .describe('Fecha del comprobante en formato ISO 8601 (UTC) | Ejemplo: "2026-01-11T00:00:00.000Z"'),

  // ============================
  // TERCERO (OPCIONAL)
  // ============================
  tercero_tipo: z.string()
    .max(100)
    .optional()
    .describe('Tipo de tercero (cliente o proveedor) | Ejemplo: "CLIENTE"'),

  tercero_nombre: z.string()
    .max(500)
    .optional()
    .describe('Nombre completo del cliente o proveedor | Ejemplo: "Juan Pérez S.A."'),

  tercero_documento: z.string()
    .max(100)
    .optional()
    .describe('CUIT, DNI o documento fiscal del tercero | Ejemplo: "20-12345678-9"'),

  tercero_direccion: z.string()
    .max(500)
    .optional()
    .describe('Dirección fiscal o comercial del tercero | Ejemplo: "Av. Corrientes 1234, CABA"'),

  tercero_datos: z.record(z.unknown())
    .optional()
    .describe('Datos adicionales del tercero en formato JSON | Ejemplo: {"email": "cliente@example.com", "telefono": "+54 11 1234-5678"}'),

  // ============================
  // TOTALIZADORES DE VENTA - FISCALES (REQUERIDOS)
  // ============================
  cantidad_items: z.number()
    .int()
    .nonnegative()
    .describe('Cantidad total de líneas del comprobante (COUNT(detalle)) | Ejemplo: 5'),

  total_bruto: z.number()
    .nonnegative('total_bruto no puede ser negativo')
    .describe('Suma de importes brutos de todos los ítems (SUM(detalle.importe_bruto)) | Ejemplo: 1000000.00'),

  total_descuentos: z.number()
    .nonnegative('total_descuentos no puede ser negativo')
    .default(0)
    .describe('Suma de descuentos de todos los ítems (SUM(detalle.importe_descuento)) | Ejemplo: 100000.00'),

  total_neto: z.number()
    .nonnegative('total_neto no puede ser negativo')
    .describe('Base imponible total (SUM(detalle.importe_neto) = total_bruto - total_descuentos) | Ejemplo: 900000.00'),

  total_iva: z.number()
    .nonnegative('total_iva no puede ser negativo')
    .describe('Total de IVA del comprobante (SUM(detalle.importe_iva)) | Ejemplo: 189000.00'),

  total_venta: z.number()
    .nonnegative('total_venta no puede ser negativo')
    .describe('Total de venta con IVA (SUM(detalle.importe_total) = total_neto + total_iva) | Ejemplo: 1089000.00'),

  // ============================
  // TOTALIZADORES DE COBRO - FINANCIEROS (OPCIONALES)
  // ============================
  total_intereses_financieros: z.number()
    .nonnegative('total_intereses_financieros no puede ser negativo')
    .default(0)
    .optional()
    .describe('Total de intereses financieros cobrados (SUM(pagos.interes_financiero)) | Ejemplo: 50000.00'),

  total_cobrado: z.number()
    .nonnegative('total_cobrado no puede ser negativo')
    .optional()
    .describe('Total cobrado incluyendo intereses (total_venta + total_intereses_financieros) | Ejemplo: 1139000.00'),

  // ============================
  // METADATA (OPCIONALES)
  // ============================
  erp_id: z.string()
    .max(500)
    .optional()
    .describe('Identificador interno único del comprobante en el ERP origen | Ejemplo: "COMP-2024-0001234"'),

  erp_datos: z.record(z.unknown())
    .optional()
    .describe('Datos adicionales del ERP en formato JSON | Ejemplo: {"sucursal": "001", "vendedor": "JPerez"}'),

  observaciones: z.string()
    .optional()
    .describe('Notas o comentarios adicionales sobre el comprobante | Ejemplo: "Factura con descuento especial"'),
})
// Validación de coherencia matemática
.refine(
  (data) => {
    const calculado = Number((data.total_bruto - data.total_descuentos).toFixed(2))
    const recibido = Number(data.total_neto.toFixed(2))
    return Math.abs(calculado - recibido) < 0.01
  },
  {
    message: 'total_neto debe ser igual a total_bruto - total_descuentos',
    path: ['total_neto']
  }
)
.refine(
  (data) => {
    const calculado = Number((data.total_neto + data.total_iva).toFixed(2))
    const recibido = Number(data.total_venta.toFixed(2))
    return Math.abs(calculado - recibido) < 0.01
  },
  {
    message: 'total_venta debe ser igual a total_neto + total_iva',
    path: ['total_venta']
  }
)
.refine(
  (data) => data.total_descuentos <= data.total_bruto,
  {
    message: 'total_descuentos no puede ser mayor que total_bruto',
    path: ['total_descuentos']
  }
)
.refine(
  (data) => {
    // Solo validar si total_cobrado está presente
    if (data.total_cobrado === undefined || data.total_cobrado === null) {
      return true;
    }
    const intereses = data.total_intereses_financieros || 0;
    const calculado = Number((data.total_venta + intereses).toFixed(2))
    const recibido = Number(data.total_cobrado.toFixed(2))
    return Math.abs(calculado - recibido) < 0.01
  },
  {
    message: 'total_cobrado debe ser igual a total_venta + total_intereses_financieros',
    path: ['total_cobrado']
  }
);

/**
 * Tipo inferido del schema
 */
export type ComprobanteCabeceraPayload = z.infer<typeof comprobanteCabeceraPayloadSchema>;

/**
 * Schema para batch de cabeceras
 */
export const comprobantesCabeceraBatchSchema = z.object({
  comprobantes_cabecera: z.array(comprobanteCabeceraPayloadSchema).min(1).max(1000),
});

/**
 * Schema legacy para compatibilidad (deprecated)
 * @deprecated Use comprobantesCabeceraBatchSchema instead
 */
export const comprobantesBatchSchema = z.object({
  comprobantes: z.array(comprobanteCabeceraPayloadSchema).min(1).max(1000),
});

/**
 * Type guard para verificar si un objeto es IComprobanteCabeceraPayload válido
 */
export function isComprobanteCabeceraPayload(obj: unknown): obj is IComprobanteCabeceraPayload {
  const result = comprobanteCabeceraPayloadSchema.safeParse(obj);
  return result.success;
}
