// Auto-generated from PostgreSQL schema introspection
// DO NOT EDIT - regenerate with: npm run regenerate-schemas
// Generated: 2026-02-05T18:34:04.967Z

import { z } from 'zod';

/**
 * Database-structure schema for articulos
 * Reflects PostgreSQL column types and nullability only.
 * For business validation rules, see shared/schemas/articulos.ts
 */
export const ArticulosDbSchema = z.object({
  sku: z.string().nullable().optional(),
  codigo: z.string().nullable().optional(),
  codigo_barras: z.string().nullable().optional(),
  erp_codigo: z.string(),
  erp_id: z.string().nullable().optional(),
  codigo_equivalencia: z.string().nullable().optional(),
  nombre: z.string().nullable().optional(),
  nombre_corto: z.string().nullable().optional(),
  descripcion: z.string().nullable().optional(),
  descripcion_web: z.string().nullable().optional(),
  rubro: z.string().nullable().optional(),
  subrubro: z.string().nullable().optional(),
  objeto: z.string().nullable().optional(),
  adjetivo: z.string().nullable().optional(),
  marca: z.string().nullable().optional(),
  modelo: z.string().nullable().optional(),
  talle: z.string().nullable().optional(),
  color: z.string().nullable().optional(),
  material: z.string().nullable().optional(),
  presentacion: z.string().nullable().optional(),
  medida: z.string().nullable().optional(),
  prop_aux_1: z.string().nullable().optional(),
  prop_aux_2: z.string().nullable().optional(),
  prop_aux_3: z.string().nullable().optional(),
  prop_aux_4: z.string().nullable().optional(),
  prop_aux_5: z.string().nullable().optional(),
  precio: z.number().nullable().optional(),
  costo: z.number().nullable().optional(),
  unidades: z.number().int().nullable().optional(),
  imagenes_producto: z.array(z.string()).nullable().optional(),
  imagenes_etiqueta: z.array(z.string()).nullable().optional(),
  etiquetas_ocr: z.array(z.string()).nullable().optional(),
  json_articulo1: z.record(z.unknown()).nullable().optional(),
  erp_nombre2: z.string(),
  erp_extra3: z.string().nullable().optional(),
  erp_sincronizado: z.boolean().nullable().optional(),
  erp_fecha_sync: z.coerce.date().nullable().optional(),
  activo: z.boolean().nullable().optional(),
  observaciones: z.string().nullable().optional(),
});

export type ArticulosDbInput = z.infer<typeof ArticulosDbSchema>;
