import { z } from 'zod';

// ============================================
// COMPROBANTE DETALLE - Modelo Fiscal Argentino (IVA)
// IMPORTANTE: Compatible con objetiva-sync-gateway
// Modelo contable coherente sin ambigüedades
// ============================================

/**
 * Payload de línea de detalle de comprobante
 * Modelo adaptado a normativa fiscal argentina (IVA únicamente)
 *
 * Reglas de cálculo obligatorias:
 * - importe_bruto = unidades × precio_unitario
 * - importe_neto = importe_bruto - importe_descuento
 * - importe_iva = importe_neto × (alicuota_iva / 100)
 * - importe_total = importe_neto + importe_iva
 */
export interface IComprobanteDetallePayload {
  // ============================
  // CLAVES COMPUESTAS (REQUERIDAS)
  // ============================

  // Clave compuesta ERP - valores originales del ERP
  erp_operacion: string;
  erp_formulario: string;
  erp_numero: string;

  // Clave compuesta normalizada - formato estándar
  comprobante_operacion: string;
  comprobante_formulario: string;
  comprobante_numero: string;

  // ============================
  // LÍNEA (REQUERIDA - parte de clave única)
  // ============================
  linea_numero: number;

  // ============================
  // ARTÍCULO (OPCIONAL)
  // ============================
  codigo_articulo?: string;
  nombre_articulo?: string;

  // ============================
  // CANTIDADES Y PRECIOS BASE (REQUERIDOS)
  // ============================
  unidades: number;
  precio_unitario: number; // Precio SIN IVA
  importe_bruto: number; // unidades × precio_unitario

  // ============================
  // DESCUENTOS (OPCIONALES)
  // ============================
  porc_descuento?: number; // Porcentaje 0-100
  importe_descuento: number; // Monto en pesos (default: 0)

  // ============================
  // BASE IMPONIBLE Y CÁLCULO IVA (REQUERIDOS)
  // ============================
  importe_neto: number; // Base imponible (bruto - descuento)
  alicuota_iva: number; // 0, 10.5, 21, o 27
  importe_iva: number; // IVA calculado
  importe_total: number; // neto + IVA

  // ============================
  // METADATA (OPCIONALES)
  // ============================
  erp_datos?: Record<string, unknown>;
  observaciones?: string;
}

/**
 * Schema Zod para IComprobanteDetallePayload
 */
export const comprobanteDetallePayloadSchema = z.object({
  // ============================
  // CLAVES COMPUESTAS (REQUERIDAS)
  // ============================

  // Clave compuesta ERP - valores originales del ERP
  erp_operacion: z.string().min(1, 'erp_operacion es requerido')
    .describe('Operación del comprobante en el ERP origen (valor original) | Ejemplo: "VEN"'),
  erp_formulario: z.string().min(1, 'erp_formulario es requerido')
    .describe('Formulario del comprobante en el ERP origen (valor original) | Ejemplo: "FACT A"'),
  erp_numero: z.string().min(1, 'erp_numero es requerido')
    .describe('Número del comprobante en el ERP origen (valor original) | Ejemplo: "00001-00000123"'),

  // Clave compuesta normalizada - formato estándar
  comprobante_operacion: z.string().min(1, 'comprobante_operacion es requerido').max(100)
    .describe('Operación del comprobante normalizada (formato estándar) | Ejemplo: "VTA"'),
  comprobante_formulario: z.string().min(1, 'comprobante_formulario es requerido').max(100)
    .describe('Formulario del comprobante normalizado (formato estándar) | Ejemplo: "FA"'),
  comprobante_numero: z.string().min(1, 'comprobante_numero es requerido').max(100)
    .describe('Número del comprobante normalizado (sin guiones) | Ejemplo: "00001000123"'),

  // ============================
  // LÍNEA (REQUERIDA - parte de clave única)
  // ============================
  linea_numero: z.number().int().min(1, 'linea_numero debe ser mayor a 0')
    .describe('Número de línea del detalle en el comprobante | Ejemplo: 1'),

  // ============================
  // ARTÍCULO (OPCIONAL)
  // ============================
  codigo_articulo: z.string().max(500).optional()
    .describe('Código o SKU del artículo | Ejemplo: "ART001"'),
  nombre_articulo: z.string().max(500).optional()
    .describe('Descripción del artículo en el comprobante | Ejemplo: "Notebook Lenovo"'),

  // ============================
  // CANTIDADES Y PRECIOS BASE (REQUERIDOS)
  // ============================
  unidades: z.number()
    .describe('Cantidad de unidades del artículo | Ejemplo: 2.5'),

  precio_unitario: z.number().nonnegative('precio_unitario no puede ser negativo')
    .describe('Precio unitario SIN IVA | Ejemplo: 100000.00'),

  importe_bruto: z.number().nonnegative('importe_bruto no puede ser negativo')
    .describe('Importe bruto (unidades × precio_unitario) | Ejemplo: 250000.00'),

  // ============================
  // DESCUENTOS (OPCIONALES)
  // ============================
  porc_descuento: z.number().min(0).max(100).optional()
    .describe('Porcentaje de descuento aplicado | Ejemplo: 10.00'),

  importe_descuento: z.number().nonnegative('importe_descuento no puede ser negativo').default(0)
    .describe('Monto del descuento en pesos | Ejemplo: 25000.00'),

  // ============================
  // BASE IMPONIBLE Y CÁLCULO IVA (REQUERIDOS)
  // ============================
  importe_neto: z.number().nonnegative('importe_neto no puede ser negativo')
    .describe('Base imponible de IVA (importe_bruto - importe_descuento) | Ejemplo: 225000.00'),

  alicuota_iva: z.number()
    .refine((val) => [0, 10.5, 21, 27].includes(val), {
      message: 'alicuota_iva debe ser 0, 10.5, 21 o 27'
    })
    .describe('Alícuota de IVA aplicable según normativa argentina | Ejemplo: 21'),

  importe_iva: z.number().nonnegative('importe_iva no puede ser negativo')
    .describe('IVA calculado sobre el neto (importe_neto × alicuota_iva / 100) | Ejemplo: 47250.00'),

  importe_total: z.number().nonnegative('importe_total no puede ser negativo')
    .describe('Total del ítem (importe_neto + importe_iva) | Ejemplo: 272250.00'),

  // ============================
  // METADATA (OPCIONALES)
  // ============================
  erp_datos: z.record(z.unknown()).optional()
    .describe('Datos adicionales del ERP en formato JSON | Ejemplo: {"campo_extra": "valor"}'),
  observaciones: z.string().optional()
    .describe('Notas o comentarios sobre la línea | Ejemplo: "Artículo en promoción"')
})
// Validación de coherencia matemática
.refine(
  (data) => {
    const calculado = Number((data.unidades * data.precio_unitario).toFixed(2))
    const recibido = Number(data.importe_bruto.toFixed(2))
    return Math.abs(calculado - recibido) < 0.01
  },
  {
    message: 'importe_bruto debe ser igual a unidades × precio_unitario',
    path: ['importe_bruto']
  }
)
.refine(
  (data) => {
    const calculado = Number((data.importe_bruto - data.importe_descuento).toFixed(2))
    const recibido = Number(data.importe_neto.toFixed(2))
    return Math.abs(calculado - recibido) < 0.01
  },
  {
    message: 'importe_neto debe ser igual a importe_bruto - importe_descuento',
    path: ['importe_neto']
  }
)
.refine(
  (data) => {
    const calculado = Number((data.importe_neto * (data.alicuota_iva / 100)).toFixed(2))
    const recibido = Number(data.importe_iva.toFixed(2))
    return Math.abs(calculado - recibido) < 0.01
  },
  {
    message: 'importe_iva debe ser igual a importe_neto × (alicuota_iva / 100)',
    path: ['importe_iva']
  }
)
.refine(
  (data) => {
    const calculado = Number((data.importe_neto + data.importe_iva).toFixed(2))
    const recibido = Number(data.importe_total.toFixed(2))
    return Math.abs(calculado - recibido) < 0.01
  },
  {
    message: 'importe_total debe ser igual a importe_neto + importe_iva',
    path: ['importe_total']
  }
)
.refine(
  (data) => data.importe_total >= data.importe_neto,
  {
    message: 'importe_total debe ser mayor o igual a importe_neto',
    path: ['importe_total']
  }
)
.refine(
  (data) => data.importe_descuento <= data.importe_bruto,
  {
    message: 'importe_descuento no puede ser mayor que importe_bruto',
    path: ['importe_descuento']
  }
);

/**
 * Tipo inferido del schema
 */
export type ComprobanteDetallePayload = z.infer<typeof comprobanteDetallePayloadSchema>;

/**
 * Schema para batch de detalles
 */
export const comprobantesDetalleBatchSchema = z.object({
  comprobantes_detalle: z.array(comprobanteDetallePayloadSchema).min(1).max(1000),
});

/**
 * Type guard para verificar si un objeto es IComprobanteDetallePayload válido
 */
export function isComprobanteDetallePayload(obj: unknown): obj is IComprobanteDetallePayload {
  const result = comprobanteDetallePayloadSchema.safeParse(obj);
  return result.success;
}
