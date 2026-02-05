/**
 * Test data factories for integration tests
 * Provides factory functions to generate valid test data for all entity types
 */

import type { IArticuloPayload } from '../../src/types/articulos.js';
import type { IComprobanteCabeceraPayload } from '../../src/types/comprobantes-cabecera.js';
import type { IComprobanteDetallePayload } from '../../src/types/comprobantes-detalle.js';
import type { IComprobantePagosPayload } from '../../src/types/comprobantes-pagos.js';

// Counter for generating unique identifiers
let counter = 0;

/**
 * Resets the counter (useful for test isolation)
 */
export function resetCounter(): void {
  counter = 0;
}

/**
 * Generates a unique ID using timestamp + counter
 */
function uniqueId(prefix: string = 'TEST'): string {
  return `${prefix}-${Date.now()}-${++counter}`;
}

/**
 * Creates a valid articulo payload with optional overrides
 */
export function createArticulo(overrides: Partial<IArticuloPayload> = {}): IArticuloPayload {
  const id = uniqueId('ART');

  return {
    erp_codigo: id,
    erp_nombre2: `Articulo ${id}`,
    nombre: `Producto de prueba ${id}`,
    nombre_corto: `Prod ${counter}`,
    sku: `SKU-${id}`,
    codigo: `COD-${id}`,
    codigo_barras: `${7790000000000 + counter}`,
    descripcion: 'Descripción de prueba para testing',
    rubro: 'Informática',
    subrubro: 'Notebooks',
    objeto: 'producto',
    marca: 'Test Brand',
    modelo: 'Model X',
    precio: 100000.00,
    costo: 70000.00,
    unidades: 10,
    activo: true,
    ...overrides,
  };
}

/**
 * Creates a batch of articulos
 */
export function createArticuloBatch(count: number, overrides: Partial<IArticuloPayload> = {}): IArticuloPayload[] {
  const batch: IArticuloPayload[] = [];
  for (let i = 0; i < count; i++) {
    batch.push(createArticulo(overrides));
  }
  return batch;
}

/**
 * Creates a valid comprobante cabecera payload with optional overrides
 */
export function createComprobanteCabecera(
  overrides: Partial<IComprobanteCabeceraPayload> = {}
): IComprobanteCabeceraPayload {
  const num = ++counter;
  const numero = num.toString().padStart(8, '0');

  return {
    // Claves compuestas ERP
    erp_operacion: 'VEN',
    erp_formulario: 'FACTURA A',
    erp_numero: `00001-${numero}`,

    // Claves compuestas normalizadas
    operacion: 'VTA',
    formulario: 'FA',
    numero: numero,

    // Datos del comprobante
    fecha: new Date().toISOString(),

    // Tercero
    tercero_tipo: 'CLIENTE',
    tercero_nombre: 'Cliente de Prueba SA',
    tercero_documento: '20-12345678-9',
    tercero_direccion: 'Av. Corrientes 1234, CABA',

    // Totalizadores de venta
    cantidad_items: 1,
    total_bruto: 100000.00,
    total_descuentos: 10000.00,
    total_neto: 90000.00,
    total_iva: 18900.00,
    total_venta: 108900.00,

    // Totalizadores de cobro
    total_intereses_financieros: 0,
    total_cobrado: 108900.00,

    ...overrides,
  };
}

/**
 * Creates a batch of comprobante cabecera
 */
export function createComprobanteCabeceraBatch(
  count: number,
  overrides: Partial<IComprobanteCabeceraPayload> = {}
): IComprobanteCabeceraPayload[] {
  const batch: IComprobanteCabeceraPayload[] = [];
  for (let i = 0; i < count; i++) {
    batch.push(createComprobanteCabecera(overrides));
  }
  return batch;
}

/**
 * Creates a valid comprobante detalle payload linked to a cabecera
 */
export function createComprobanteDetalle(
  cabecera: Pick<IComprobanteCabeceraPayload, 'erp_operacion' | 'erp_formulario' | 'erp_numero' | 'operacion' | 'formulario' | 'numero'>,
  lineaNumero: number = 1,
  overrides: Partial<IComprobanteDetallePayload> = {}
): IComprobanteDetallePayload {
  const unidades = overrides.unidades ?? 2;
  const precioUnitario = overrides.precio_unitario ?? 50000.00;
  const importeBruto = overrides.importe_bruto ?? (unidades * precioUnitario);
  const importeDescuento = overrides.importe_descuento ?? 0;
  const importeNeto = overrides.importe_neto ?? (importeBruto - importeDescuento);
  const alicuotaIva = overrides.alicuota_iva ?? 21;
  const importeIva = overrides.importe_iva ?? (importeNeto * (alicuotaIva / 100));
  const importeTotal = overrides.importe_total ?? (importeNeto + importeIva);

  return {
    // Claves compuestas ERP
    erp_operacion: cabecera.erp_operacion,
    erp_formulario: cabecera.erp_formulario,
    erp_numero: cabecera.erp_numero,

    // Claves compuestas normalizadas
    comprobante_operacion: cabecera.operacion,
    comprobante_formulario: cabecera.formulario,
    comprobante_numero: cabecera.numero,

    // Línea
    linea_numero: lineaNumero,

    // Artículo
    codigo_articulo: `ART-${++counter}`,
    nombre_articulo: 'Artículo de prueba',

    // Cantidades y precios
    unidades,
    precio_unitario: precioUnitario,
    importe_bruto: importeBruto,

    // Descuentos
    porc_descuento: 0,
    importe_descuento: importeDescuento,

    // IVA
    importe_neto: importeNeto,
    alicuota_iva: alicuotaIva,
    importe_iva: importeIva,
    importe_total: importeTotal,

    ...overrides,
  };
}

/**
 * Creates a valid comprobante pago payload linked to a cabecera
 */
export function createComprobantePago(
  cabecera: Pick<IComprobanteCabeceraPayload, 'erp_operacion' | 'erp_formulario' | 'erp_numero' | 'operacion' | 'formulario' | 'numero'>,
  lineaNumero: number = 1,
  overrides: Partial<IComprobantePagosPayload> = {}
): IComprobantePagosPayload {
  return {
    // Claves compuestas ERP
    erp_operacion: cabecera.erp_operacion,
    erp_formulario: cabecera.erp_formulario,
    erp_numero: cabecera.erp_numero,

    // Claves compuestas normalizadas
    comprobante_operacion: cabecera.operacion,
    comprobante_formulario: cabecera.formulario,
    comprobante_numero: cabecera.numero,

    // Línea
    linea_numero: lineaNumero,

    // Datos del pago
    medio: 'EFECTIVO',
    monto: 108900.00,
    moneda: 'ARS',

    fecha_pago: new Date().toISOString(),
    referencia: `REF-${++counter}`,

    ...overrides,
  };
}
