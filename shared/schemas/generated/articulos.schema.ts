// Auto-generated from PostgreSQL schema introspection
// DO NOT EDIT - regenerate with: npm run regenerate-schemas
// Generated: 2026-03-17T12:28:22.473Z
// Table: articulos

import { z } from 'zod';
import type { EntityMetadata, TableSchemaMetadata } from '../../types/schema-metadata.js';

/**
 * Zod schema for articulo entity
 * Reflects PostgreSQL structure with business validations from column comments.
 */
export const articuloSchema = z.object({
  sku: z.string().nullable().optional(),
  codigo: z.string().min(1, 'Campo requerido'),
  codigo_barras: z.string().nullable().optional(),
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
  precio: z.coerce.number().nullable().optional(),
  costo: z.coerce.number().nullable().optional(),
  unidades: z.coerce.number().transform(n => Math.trunc(n)).nullable().optional(),
  imagenes_producto: z.array(z.string()).nullable().optional(),
  imagenes_etiqueta: z.array(z.string()).nullable().optional(),
  etiquetas_ocr: z.array(z.string()).nullable().optional(),
  json_articulo: z.record(z.unknown()).nullable().optional(),
  activo: z.boolean().nullable().optional(),
  observaciones: z.string().nullable().optional(),
  creado: z.coerce.date().optional(),
  actualizado: z.coerce.date().optional(),
  erp_id: z.string().nullable().optional(),
  erp_codigo: z.string().nullable().optional(),
  erp_nombre: z.string().nullable().optional(),
  erp_precio: z.coerce.number().nullable().optional(),
  erp_costo: z.coerce.number().nullable().optional(),
  erp_unidades: z.coerce.number().transform(n => Math.trunc(n)).nullable().optional(),
  erp_datos: z.record(z.unknown()).nullable().optional(),
  erp_creado: z.coerce.date().nullable().optional(),
  erp_actualizado: z.coerce.date().nullable().optional(),
  erp_sincronizado: z.boolean().optional(),
  erp_fecha_sync: z.coerce.date().optional(),
  origin_source: z.string().nullable().optional(),
  origin_sync_id: z.string().nullable().optional(),
  origin_synced_at: z.coerce.date().nullable().optional(),
  imagenes_producto_procesadas: z.array(z.string()).nullable().optional(),
});

export type ArticuloInput = z.infer<typeof articuloSchema>;

/**
 * Metadata for articulo entity
 * Used for dynamic field operations in ingestion and validation.
 */
export const articuloMetadata: EntityMetadata<readonly ['codigo']> = {
  entity: 'articulo',
  tableName: 'articulos',
  keyFields: ['codigo'] as const,
  systemFields: ['erp_sincronizado', 'erp_fecha_sync', 'actualizado', 'creado'] as const,
  validations: {},
};

/**
 * Table schema metadata for articulo entity
 * Contains column definitions and constraints from PostgreSQL.
 * Used for query validation and dynamic field detection.
 */
export const articuloTableSchema: TableSchemaMetadata = {
  entity: 'articulos',
  columns: [
    {
      "column_name": "sku",
      "data_type": "text",
      "is_nullable": true,
      "default_value": null,
      "ordinal_position": 1,
      "column_comment": null
    },
    {
      "column_name": "codigo",
      "data_type": "text",
      "is_nullable": false,
      "default_value": null,
      "ordinal_position": 2,
      "column_comment": null
    },
    {
      "column_name": "codigo_barras",
      "data_type": "text",
      "is_nullable": true,
      "default_value": null,
      "ordinal_position": 3,
      "column_comment": null
    },
    {
      "column_name": "codigo_equivalencia",
      "data_type": "text",
      "is_nullable": true,
      "default_value": null,
      "ordinal_position": 4,
      "column_comment": null
    },
    {
      "column_name": "nombre",
      "data_type": "text",
      "is_nullable": true,
      "default_value": null,
      "ordinal_position": 5,
      "column_comment": null
    },
    {
      "column_name": "nombre_corto",
      "data_type": "text",
      "is_nullable": true,
      "default_value": null,
      "ordinal_position": 6,
      "column_comment": null
    },
    {
      "column_name": "descripcion",
      "data_type": "text",
      "is_nullable": true,
      "default_value": null,
      "ordinal_position": 7,
      "column_comment": null
    },
    {
      "column_name": "descripcion_web",
      "data_type": "text",
      "is_nullable": true,
      "default_value": null,
      "ordinal_position": 8,
      "column_comment": null
    },
    {
      "column_name": "rubro",
      "data_type": "text",
      "is_nullable": true,
      "default_value": null,
      "ordinal_position": 9,
      "column_comment": null
    },
    {
      "column_name": "subrubro",
      "data_type": "text",
      "is_nullable": true,
      "default_value": null,
      "ordinal_position": 10,
      "column_comment": null
    },
    {
      "column_name": "objeto",
      "data_type": "text",
      "is_nullable": true,
      "default_value": null,
      "ordinal_position": 11,
      "column_comment": null
    },
    {
      "column_name": "adjetivo",
      "data_type": "text",
      "is_nullable": true,
      "default_value": null,
      "ordinal_position": 12,
      "column_comment": null
    },
    {
      "column_name": "marca",
      "data_type": "text",
      "is_nullable": true,
      "default_value": null,
      "ordinal_position": 13,
      "column_comment": null
    },
    {
      "column_name": "modelo",
      "data_type": "text",
      "is_nullable": true,
      "default_value": null,
      "ordinal_position": 14,
      "column_comment": null
    },
    {
      "column_name": "talle",
      "data_type": "text",
      "is_nullable": true,
      "default_value": null,
      "ordinal_position": 15,
      "column_comment": null
    },
    {
      "column_name": "color",
      "data_type": "text",
      "is_nullable": true,
      "default_value": null,
      "ordinal_position": 16,
      "column_comment": null
    },
    {
      "column_name": "material",
      "data_type": "text",
      "is_nullable": true,
      "default_value": null,
      "ordinal_position": 17,
      "column_comment": null
    },
    {
      "column_name": "presentacion",
      "data_type": "text",
      "is_nullable": true,
      "default_value": null,
      "ordinal_position": 18,
      "column_comment": null
    },
    {
      "column_name": "medida",
      "data_type": "text",
      "is_nullable": true,
      "default_value": null,
      "ordinal_position": 19,
      "column_comment": null
    },
    {
      "column_name": "prop_aux_1",
      "data_type": "text",
      "is_nullable": true,
      "default_value": null,
      "ordinal_position": 20,
      "column_comment": null
    },
    {
      "column_name": "prop_aux_2",
      "data_type": "text",
      "is_nullable": true,
      "default_value": null,
      "ordinal_position": 21,
      "column_comment": null
    },
    {
      "column_name": "prop_aux_3",
      "data_type": "text",
      "is_nullable": true,
      "default_value": null,
      "ordinal_position": 22,
      "column_comment": null
    },
    {
      "column_name": "prop_aux_4",
      "data_type": "text",
      "is_nullable": true,
      "default_value": null,
      "ordinal_position": 23,
      "column_comment": null
    },
    {
      "column_name": "prop_aux_5",
      "data_type": "text",
      "is_nullable": true,
      "default_value": null,
      "ordinal_position": 24,
      "column_comment": null
    },
    {
      "column_name": "precio",
      "data_type": "decimal",
      "is_nullable": true,
      "default_value": null,
      "ordinal_position": 25,
      "column_comment": null
    },
    {
      "column_name": "costo",
      "data_type": "decimal",
      "is_nullable": true,
      "default_value": null,
      "ordinal_position": 26,
      "column_comment": null
    },
    {
      "column_name": "unidades",
      "data_type": "int",
      "is_nullable": true,
      "default_value": "0",
      "ordinal_position": 27,
      "column_comment": null
    },
    {
      "column_name": "imagenes_producto",
      "data_type": "array",
      "is_nullable": true,
      "default_value": "ARRAY[]::text[]",
      "ordinal_position": 28,
      "column_comment": null
    },
    {
      "column_name": "imagenes_etiqueta",
      "data_type": "array",
      "is_nullable": true,
      "default_value": "ARRAY[]::text[]",
      "ordinal_position": 29,
      "column_comment": null
    },
    {
      "column_name": "etiquetas_ocr",
      "data_type": "array",
      "is_nullable": true,
      "default_value": "ARRAY[]::text[]",
      "ordinal_position": 30,
      "column_comment": null
    },
    {
      "column_name": "json_articulo",
      "data_type": "jsonb",
      "is_nullable": true,
      "default_value": "'{}'::jsonb",
      "ordinal_position": 31,
      "column_comment": null
    },
    {
      "column_name": "activo",
      "data_type": "boolean",
      "is_nullable": true,
      "default_value": "true",
      "ordinal_position": 32,
      "column_comment": null
    },
    {
      "column_name": "observaciones",
      "data_type": "text",
      "is_nullable": true,
      "default_value": null,
      "ordinal_position": 33,
      "column_comment": null
    },
    {
      "column_name": "creado",
      "data_type": "timestamp",
      "is_nullable": true,
      "default_value": "CURRENT_TIMESTAMP",
      "ordinal_position": 34,
      "column_comment": null
    },
    {
      "column_name": "actualizado",
      "data_type": "timestamp",
      "is_nullable": true,
      "default_value": "CURRENT_TIMESTAMP",
      "ordinal_position": 35,
      "column_comment": null
    },
    {
      "column_name": "erp_id",
      "data_type": "text",
      "is_nullable": true,
      "default_value": null,
      "ordinal_position": 36,
      "column_comment": null
    },
    {
      "column_name": "erp_codigo",
      "data_type": "text",
      "is_nullable": true,
      "default_value": null,
      "ordinal_position": 37,
      "column_comment": null
    },
    {
      "column_name": "erp_nombre",
      "data_type": "text",
      "is_nullable": true,
      "default_value": null,
      "ordinal_position": 38,
      "column_comment": null
    },
    {
      "column_name": "erp_precio",
      "data_type": "decimal",
      "is_nullable": true,
      "default_value": null,
      "ordinal_position": 39,
      "column_comment": null
    },
    {
      "column_name": "erp_costo",
      "data_type": "decimal",
      "is_nullable": true,
      "default_value": null,
      "ordinal_position": 40,
      "column_comment": null
    },
    {
      "column_name": "erp_unidades",
      "data_type": "int",
      "is_nullable": true,
      "default_value": "0",
      "ordinal_position": 41,
      "column_comment": null
    },
    {
      "column_name": "erp_datos",
      "data_type": "jsonb",
      "is_nullable": true,
      "default_value": "'{}'::jsonb",
      "ordinal_position": 42,
      "column_comment": null
    },
    {
      "column_name": "erp_creado",
      "data_type": "timestamp",
      "is_nullable": true,
      "default_value": null,
      "ordinal_position": 43,
      "column_comment": null
    },
    {
      "column_name": "erp_actualizado",
      "data_type": "timestamp",
      "is_nullable": true,
      "default_value": null,
      "ordinal_position": 44,
      "column_comment": null
    },
    {
      "column_name": "erp_sincronizado",
      "data_type": "boolean",
      "is_nullable": true,
      "default_value": "false",
      "ordinal_position": 45,
      "column_comment": null
    },
    {
      "column_name": "erp_fecha_sync",
      "data_type": "timestamp",
      "is_nullable": true,
      "default_value": null,
      "ordinal_position": 46,
      "column_comment": null
    },
    {
      "column_name": "origin_source",
      "data_type": "text",
      "is_nullable": true,
      "default_value": null,
      "ordinal_position": 47,
      "column_comment": null
    },
    {
      "column_name": "origin_sync_id",
      "data_type": "text",
      "is_nullable": true,
      "default_value": null,
      "ordinal_position": 48,
      "column_comment": null
    },
    {
      "column_name": "origin_synced_at",
      "data_type": "timestamp",
      "is_nullable": true,
      "default_value": null,
      "ordinal_position": 49,
      "column_comment": null
    },
    {
      "column_name": "imagenes_producto_procesadas",
      "data_type": "array",
      "is_nullable": true,
      "default_value": "'{}'::text[]",
      "ordinal_position": 50,
      "column_comment": null
    }
  ],
  constraints: [
    {
      "constraint_name": "18527_18975_2_not_null",
      "constraint_type": "CHECK",
      "columns": []
    },
    {
      "constraint_name": "articulos_pkey",
      "constraint_type": "PRIMARY KEY",
      "columns": [
        "codigo"
      ]
    }
  ],
};
