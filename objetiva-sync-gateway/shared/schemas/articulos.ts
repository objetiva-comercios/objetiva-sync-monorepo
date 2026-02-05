import { z } from 'zod'

// Schema para artículo individual (snake_case para coincidir con objetiva-sync)
export const ArticuloSchema = z.object({
  // Campos REQUERIDOS (NOT NULL en Postgres)
  erp_codigo: z.string()
    .min(1, 'ERP código es requerido')
    .describe('Código del artículo en el ERP origen (identificador único) | Ejemplo: "ART001"'),

  erp_nombre: z.string()
    .min(1, 'ERP nombre es requerido')
    .describe('Nombre del artículo en el ERP origen | Ejemplo: "Notebook Lenovo ThinkPad"'),

  // Identificadores opcionales
  sku: z.string()
    .optional()
    .describe('SKU (Stock Keeping Unit) del artículo | Ejemplo: "SKU-12345"'),

  codigo: z.string()
    .optional()
    .describe('Código alternativo del artículo | Ejemplo: "ALT-001"'),

  codigo_barras: z.string()
    .optional()
    .describe('Código de barras del producto (EAN, UPC, etc.) | Ejemplo: "7791234567890"'),

  erp_id: z.string()
    .optional()
    .describe('Identificador interno único del artículo en el ERP | Ejemplo: "ART-2024-001234"'),

  codigo_equivalencia: z.string()
    .optional()
    .describe('Código de equivalencia con otros sistemas | Ejemplo: "EQ-001"'),

  // Información básica
  nombre: z.string()
    .optional()
    .describe('Nombre descriptivo del artículo | Ejemplo: "Notebook Lenovo ThinkPad E14 Gen 4"'),

  nombre_corto: z.string()
    .optional()
    .describe('Nombre corto o abreviado del artículo | Ejemplo: "Lenovo E14"'),

  descripcion: z.string()
    .optional()
    .describe('Descripción detallada del artículo | Ejemplo: "Notebook empresarial con procesador Intel i5, 8GB RAM, 256GB SSD"'),

  descripcion_web: z.string()
    .optional()
    .describe('Descripción optimizada para web/e-commerce | Ejemplo: "Ideal para uso profesional..."'),

  // Clasificación
  rubro: z.string()
    .optional()
    .describe('Categoría o rubro principal del artículo | Ejemplo: "Computación"'),

  subrubro: z.string()
    .optional()
    .describe('Subcategoría dentro del rubro | Ejemplo: "Notebooks"'),

  objeto: z.enum(['producto', 'servicio'])
    .optional()
    .describe('Tipo de artículo: producto físico o servicio | Ejemplo: "producto"'),

  // Propiedades del producto
  marca: z.string()
    .optional()
    .describe('Marca del producto | Ejemplo: "Lenovo"'),

  modelo: z.string()
    .optional()
    .describe('Modelo específico del producto | Ejemplo: "ThinkPad E14 Gen 4"'),

  adjetivo: z.string()
    .optional()
    .describe('Adjetivo o característica distintiva | Ejemplo: "Profesional"'),

  talle: z.string()
    .optional()
    .describe('Talle o tamaño del producto (ropa, calzado) | Ejemplo: "M"'),

  color: z.string()
    .optional()
    .describe('Color del producto | Ejemplo: "Negro"'),

  material: z.string()
    .optional()
    .describe('Material principal del producto | Ejemplo: "Aluminio"'),

  presentacion: z.string()
    .optional()
    .describe('Presentación o empaque del producto | Ejemplo: "Caja sellada"'),

  medida: z.string()
    .optional()
    .describe('Medidas del producto | Ejemplo: "35.5 x 24 x 1.8 cm"'),

  // Propiedades auxiliares
  prop_aux_1: z.string()
    .optional()
    .describe('Propiedad auxiliar 1 (uso flexible según necesidad) | Ejemplo: "Garantía 12 meses"'),

  prop_aux_2: z.string()
    .optional()
    .describe('Propiedad auxiliar 2 (uso flexible según necesidad) | Ejemplo: "Origen: China"'),

  prop_aux_3: z.string()
    .optional()
    .describe('Propiedad auxiliar 3 (uso flexible según necesidad) | Ejemplo: "Certificado ISO"'),

  prop_aux_4: z.string()
    .optional()
    .describe('Propiedad auxiliar 4 (uso flexible según necesidad) | Ejemplo: "Stock mínimo: 5"'),

  prop_aux_5: z.string()
    .optional()
    .describe('Propiedad auxiliar 5 (uso flexible según necesidad) | Ejemplo: "Proveedor: ACME SA"'),

  // Precios e inventario
  precio: z.number()
    .positive()
    .optional()
    .describe('Precio de venta del artículo | Ejemplo: 450000.00'),

  costo: z.number()
    .positive()
    .optional()
    .describe('Costo de compra o producción del artículo | Ejemplo: 320000.00'),

  unidades: z.number()
    .int()
    .default(0)
    .describe('Cantidad de unidades disponibles en stock | Ejemplo: 15'),

  // Imágenes y OCR
  imagenes_producto: z.array(z.string())
    .optional()
    .describe('URLs de imágenes del producto | Ejemplo: ["https://ejemplo.com/img1.jpg", "https://ejemplo.com/img2.jpg"]'),

  imagenes_etiqueta: z.array(z.string())
    .optional()
    .describe('URLs de imágenes de etiquetas del producto | Ejemplo: ["https://ejemplo.com/etiqueta.jpg"]'),

  etiquetas_ocr: z.array(z.string())
    .optional()
    .describe('Texto extraído por OCR de las etiquetas | Ejemplo: ["Hecho en Argentina", "100% Algodón"]'),

  // JSON flexible para datos adicionales
  json_articulo: z.record(z.any())
    .optional()
    .describe('Datos adicionales del artículo en formato JSON | Ejemplo: {"peso_kg": 2.5, "garantia_meses": 12}'),

  // Metadata del ERP
  erp_extra: z.string()
    .optional()
    .describe('Información adicional del ERP en formato texto | Ejemplo: "Observaciones del sistema origen"'),

  // Estado
  activo: z.boolean()
    .default(true)
    .describe('Indica si el artículo está activo y disponible para venta | Ejemplo: true'),

  observaciones: z.string()
    .optional()
    .describe('Notas o comentarios adicionales sobre el artículo | Ejemplo: "Producto en promoción hasta fin de mes"')
})

// Schema para batch de artículos
export const ArticuloBatchSchema = z.object({
  articulos: z.array(ArticuloSchema).min(1, 'Debe enviar al menos un artículo')
})

export type ArticuloInput = z.infer<typeof ArticuloSchema>
export type ArticuloBatch = z.infer<typeof ArticuloBatchSchema>
