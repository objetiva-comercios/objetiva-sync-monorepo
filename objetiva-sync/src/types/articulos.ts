import { z } from 'zod';

/**
 * Payload de artículo para enviar al backend remoto
 * IMPORTANTE: Usa snake_case para coincidir con el schema del gateway
 */
export interface IArticuloPayload {
  // Identificadores
  sku?: string;
  codigo?: string;
  codigo_barras?: string;
  erp_codigo: string; // REQUERIDO - NOT NULL en Postgres
  erp_id?: string;
  codigo_equivalencia?: string;

  // Información básica
  nombre?: string; // Opcional
  nombre_corto?: string;
  descripcion?: string;
  descripcion_web?: string;

  // Clasificación
  rubro?: string;
  subrubro?: string;
  objeto?: string; // 'producto' | 'servicio'
  marca?: string;
  modelo?: string;
  adjetivo?: string;
  talle?: string;
  color?: string;
  material?: string;
  presentacion?: string;
  medida?: string;

  // Propiedades auxiliares
  prop_aux_1?: string;
  prop_aux_2?: string;
  prop_aux_3?: string;
  prop_aux_4?: string;
  prop_aux_5?: string;

  // Precios y costos
  precio?: number;
  costo?: number;

  // Inventario
  unidades?: number;

  // Imágenes y OCR
  imagenes_producto?: string[];
  imagenes_etiqueta?: string[];
  etiquetas_ocr?: string[];

  // Metadata
  json_articulo?: Record<string, unknown>;
  erp_nombre: string; // REQUERIDO - NOT NULL en Postgres
  erp_extra?: string;

  // Estado
  activo?: boolean;
  observaciones?: string;
}

/**
 * Schema Zod para validación de IArticuloPayload
 * IMPORTANTE: Usa snake_case para coincidir con el schema del gateway
 */
export const articuloPayloadSchema = z.object({
  // Identificadores (acepta string o number, convierte a string)
  sku: z.union([z.string(), z.number()]).transform(val => String(val)).pipe(z.string().max(500)).optional()
    .describe('SKU (Stock Keeping Unit) del artículo | Ejemplo: "SKU-12345"'),
  codigo: z.union([z.string(), z.number()]).transform(val => String(val)).pipe(z.string().max(500)).optional()
    .describe('Código alternativo del artículo | Ejemplo: "ALT-001"'),
  codigo_barras: z.union([z.string(), z.number()]).transform(val => String(val)).pipe(z.string().max(500)).optional()
    .describe('Código de barras del producto (EAN, UPC, etc.) | Ejemplo: "7791234567890"'),
  erp_codigo: z.union([z.string(), z.number()]).transform(val => String(val)).pipe(z.string().min(1).max(500))
    .describe('Código del artículo en el ERP origen (identificador único) | Ejemplo: "ART001"'),
  erp_id: z.union([z.string(), z.number()]).transform(val => String(val)).pipe(z.string().max(500)).optional()
    .describe('Identificador interno único del artículo en el ERP | Ejemplo: "ART-2024-001234"'),
  codigo_equivalencia: z.union([z.string(), z.number()]).transform(val => String(val)).pipe(z.string().max(500)).optional()
    .describe('Código de equivalencia con otros sistemas | Ejemplo: "EQ-001"'),

  // Información básica
  nombre: z.string().max(500).optional()
    .describe('Nombre descriptivo del artículo | Ejemplo: "Notebook Lenovo ThinkPad E14 Gen 4"'),
  nombre_corto: z.string().max(200).optional()
    .describe('Nombre corto o abreviado del artículo | Ejemplo: "Lenovo E14"'),
  descripcion: z.string().optional()
    .describe('Descripción detallada del artículo | Ejemplo: "Notebook empresarial con procesador Intel i5, 8GB RAM, 256GB SSD"'),
  descripcion_web: z.string().optional()
    .describe('Descripción optimizada para web/e-commerce | Ejemplo: "Ideal para uso profesional..."'),

  // Clasificación
  rubro: z.string().max(200).optional()
    .describe('Categoría o rubro principal del artículo | Ejemplo: "Computación"'),
  subrubro: z.string().max(200).optional()
    .describe('Subcategoría dentro del rubro | Ejemplo: "Notebooks"'),
  objeto: z.enum(['producto', 'servicio']).optional()
    .describe('Tipo de artículo: producto físico o servicio | Ejemplo: "producto"'),
  marca: z.string().max(200).optional()
    .describe('Marca del producto | Ejemplo: "Lenovo"'),
  modelo: z.string().max(200).optional()
    .describe('Modelo específico del producto | Ejemplo: "ThinkPad E14 Gen 4"'),
  adjetivo: z.string().max(200).optional()
    .describe('Adjetivo o característica distintiva | Ejemplo: "Profesional"'),
  talle: z.string().max(100).optional()
    .describe('Talle o tamaño del producto (ropa, calzado) | Ejemplo: "M"'),
  color: z.string().max(100).optional()
    .describe('Color del producto | Ejemplo: "Negro"'),
  material: z.string().max(200).optional()
    .describe('Material principal del producto | Ejemplo: "Aluminio"'),
  presentacion: z.string().max(200).optional()
    .describe('Presentación o empaque del producto | Ejemplo: "Caja sellada"'),
  medida: z.string().max(100).optional()
    .describe('Medidas del producto | Ejemplo: "35.5 x 24 x 1.8 cm"'),

  // Propiedades auxiliares
  prop_aux_1: z.string().max(200).optional()
    .describe('Propiedad auxiliar 1 (uso flexible según necesidad) | Ejemplo: "Garantía 12 meses"'),
  prop_aux_2: z.string().max(200).optional()
    .describe('Propiedad auxiliar 2 (uso flexible según necesidad) | Ejemplo: "Origen: China"'),
  prop_aux_3: z.string().max(200).optional()
    .describe('Propiedad auxiliar 3 (uso flexible según necesidad) | Ejemplo: "Certificado ISO"'),
  prop_aux_4: z.string().max(200).optional()
    .describe('Propiedad auxiliar 4 (uso flexible según necesidad) | Ejemplo: "Stock mínimo: 5"'),
  prop_aux_5: z.string().max(200).optional()
    .describe('Propiedad auxiliar 5 (uso flexible según necesidad) | Ejemplo: "Proveedor: ACME SA"'),

  // Precios y costos
  precio: z.number().nonnegative().optional()
    .describe('Precio de venta del artículo | Ejemplo: 450000.00'),
  costo: z.number().nonnegative().optional()
    .describe('Costo de compra o producción del artículo | Ejemplo: 320000.00'),

  // Inventario
  unidades: z.number().int().nonnegative().default(0)
    .describe('Cantidad de unidades disponibles en stock | Ejemplo: 15'),

  // Imágenes y OCR
  imagenes_producto: z.array(z.string()).optional()
    .describe('URLs de imágenes del producto | Ejemplo: ["https://ejemplo.com/img1.jpg", "https://ejemplo.com/img2.jpg"]'),
  imagenes_etiqueta: z.array(z.string()).optional()
    .describe('URLs de imágenes de etiquetas del producto | Ejemplo: ["https://ejemplo.com/etiqueta.jpg"]'),
  etiquetas_ocr: z.array(z.string()).optional()
    .describe('Texto extraído por OCR de las etiquetas | Ejemplo: ["Hecho en Argentina", "100% Algodón"]'),

  // Metadata
  json_articulo: z.record(z.unknown()).optional()
    .describe('Datos adicionales del artículo en formato JSON | Ejemplo: {"peso_kg": 2.5, "garantia_meses": 12}'),
  erp_nombre: z.string().min(1).max(200)
    .describe('Nombre del artículo en el ERP origen | Ejemplo: "Notebook Lenovo ThinkPad"'),
  erp_extra: z.string().optional()
    .describe('Información adicional del ERP en formato texto | Ejemplo: "Observaciones del sistema origen"'),

  // Estado
  activo: z.boolean().default(true)
    .describe('Indica si el artículo está activo y disponible para venta | Ejemplo: true'),
  observaciones: z.string().optional()
    .describe('Notas o comentarios adicionales sobre el artículo | Ejemplo: "Producto en promoción hasta fin de mes"'),
});

/**
 * Tipo inferido del schema (para type safety)
 */
export type ArticuloPayload = z.infer<typeof articuloPayloadSchema>;

/**
 * Schema para array de artículos (batch)
 */
export const articulosBatchSchema = z.object({
  articulos: z.array(articuloPayloadSchema).min(1).max(1000),
});

/**
 * Type guard para verificar si un objeto es IArticuloPayload válido
 */
export function isArticuloPayload(obj: unknown): obj is IArticuloPayload {
  const result = articuloPayloadSchema.safeParse(obj);
  return result.success;
}
