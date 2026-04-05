// Auto-generated from PostgreSQL schema introspection
// DO NOT EDIT - regenerate with: npm run regenerate-schemas
// Generated: 2026-04-05T18:34:15.235Z
// Table: comprobantes_detalle

import { z } from 'zod';
import type { EntityMetadata, TableSchemaMetadata } from '../../types/schema-metadata.js';

/**
 * Zod schema for comprobantes_detalle entity
 * Reflects PostgreSQL structure with business validations from column comments.
 */
export const comprobantesDetalleSchema = z.object({
  comprobante_operacion: z.string().min(1, 'Campo requerido'),
  comprobante_formulario: z.string().min(1, 'Campo requerido'),
  comprobante_numero: z.string().min(1, 'Campo requerido'),
  linea_numero: z.coerce.number().transform(n => Math.trunc(n)),
  articulo_codigo: z.string().nullable().optional(),
  articulo_nombre: z.string().nullable().optional(),
  unidades: z.coerce.number(),
  precio_unitario: z.coerce.number(),
  importe_bruto: z.coerce.number(),
  porc_descuento: z.coerce.number().nullable().optional(),
  importe_descuento: z.coerce.number().optional(),
  importe_neto: z.coerce.number(),
  alicuota_iva: z.coerce.number(),
  importe_iva: z.coerce.number(),
  importe_total: z.coerce.number(),
  observaciones: z.string().nullable().optional(),
  creado: z.coerce.date().optional(),
  actualizado: z.coerce.date().optional(),
  erp_operacion: z.string().min(1, 'Campo requerido'),
  erp_formulario: z.string().min(1, 'Campo requerido'),
  erp_numero: z.string().min(1, 'Campo requerido'),
  erp_datos: z.record(z.unknown()).nullable().optional(),
  erp_creado: z.coerce.date().nullable().optional(),
  erp_actualizado: z.coerce.date().nullable().optional(),
  erp_sincronizado: z.boolean().optional(),
  erp_fecha_sync: z.coerce.date().optional(),
  origin_source: z.string().nullable().optional(),
  origin_sync_id: z.string().nullable().optional(),
  origin_synced_at: z.coerce.date().nullable().optional(),
});

export type ComprobantesDetalleInput = z.infer<typeof comprobantesDetalleSchema>;

/**
 * Metadata for comprobantes_detalle entity
 * Used for dynamic field operations in ingestion and validation.
 */
export const comprobantesDetalleMetadata: EntityMetadata<readonly ['comprobante_operacion', 'comprobante_formulario', 'comprobante_numero', 'linea_numero']> = {
  entity: 'comprobantes_detalle',
  tableName: 'comprobantes_detalle',
  keyFields: ['comprobante_operacion', 'comprobante_formulario', 'comprobante_numero', 'linea_numero'] as const,
  systemFields: ['erp_sincronizado', 'erp_fecha_sync', 'actualizado', 'creado'] as const,
  validations: {},
};

/**
 * Table schema metadata for comprobantes_detalle entity
 * Contains column definitions and constraints from PostgreSQL.
 * Used for query validation and dynamic field detection.
 */
export const comprobantesDetalleTableSchema: TableSchemaMetadata = {
  entity: 'comprobantes_detalle',
  columns: [
    {
      "column_name": "comprobante_operacion",
      "data_type": "text",
      "is_nullable": false,
      "default_value": null,
      "ordinal_position": 1,
      "column_comment": null
    },
    {
      "column_name": "comprobante_formulario",
      "data_type": "text",
      "is_nullable": false,
      "default_value": null,
      "ordinal_position": 2,
      "column_comment": null
    },
    {
      "column_name": "comprobante_numero",
      "data_type": "text",
      "is_nullable": false,
      "default_value": null,
      "ordinal_position": 3,
      "column_comment": null
    },
    {
      "column_name": "linea_numero",
      "data_type": "int",
      "is_nullable": false,
      "default_value": null,
      "ordinal_position": 4,
      "column_comment": null
    },
    {
      "column_name": "articulo_codigo",
      "data_type": "text",
      "is_nullable": true,
      "default_value": null,
      "ordinal_position": 5,
      "column_comment": null
    },
    {
      "column_name": "articulo_nombre",
      "data_type": "text",
      "is_nullable": true,
      "default_value": null,
      "ordinal_position": 6,
      "column_comment": null
    },
    {
      "column_name": "unidades",
      "data_type": "decimal",
      "is_nullable": false,
      "default_value": null,
      "ordinal_position": 7,
      "column_comment": null
    },
    {
      "column_name": "precio_unitario",
      "data_type": "decimal",
      "is_nullable": false,
      "default_value": null,
      "ordinal_position": 8,
      "column_comment": null
    },
    {
      "column_name": "importe_bruto",
      "data_type": "decimal",
      "is_nullable": false,
      "default_value": null,
      "ordinal_position": 9,
      "column_comment": null
    },
    {
      "column_name": "porc_descuento",
      "data_type": "decimal",
      "is_nullable": true,
      "default_value": null,
      "ordinal_position": 10,
      "column_comment": null
    },
    {
      "column_name": "importe_descuento",
      "data_type": "decimal",
      "is_nullable": false,
      "default_value": "0",
      "ordinal_position": 11,
      "column_comment": null
    },
    {
      "column_name": "importe_neto",
      "data_type": "decimal",
      "is_nullable": false,
      "default_value": null,
      "ordinal_position": 12,
      "column_comment": null
    },
    {
      "column_name": "alicuota_iva",
      "data_type": "decimal",
      "is_nullable": false,
      "default_value": null,
      "ordinal_position": 13,
      "column_comment": null
    },
    {
      "column_name": "importe_iva",
      "data_type": "decimal",
      "is_nullable": false,
      "default_value": null,
      "ordinal_position": 14,
      "column_comment": null
    },
    {
      "column_name": "importe_total",
      "data_type": "decimal",
      "is_nullable": false,
      "default_value": null,
      "ordinal_position": 15,
      "column_comment": null
    },
    {
      "column_name": "observaciones",
      "data_type": "text",
      "is_nullable": true,
      "default_value": null,
      "ordinal_position": 16,
      "column_comment": null
    },
    {
      "column_name": "creado",
      "data_type": "timestamp",
      "is_nullable": false,
      "default_value": "CURRENT_TIMESTAMP",
      "ordinal_position": 17,
      "column_comment": null
    },
    {
      "column_name": "actualizado",
      "data_type": "timestamp",
      "is_nullable": false,
      "default_value": "CURRENT_TIMESTAMP",
      "ordinal_position": 18,
      "column_comment": null
    },
    {
      "column_name": "erp_operacion",
      "data_type": "text",
      "is_nullable": false,
      "default_value": null,
      "ordinal_position": 19,
      "column_comment": null
    },
    {
      "column_name": "erp_formulario",
      "data_type": "text",
      "is_nullable": false,
      "default_value": null,
      "ordinal_position": 20,
      "column_comment": null
    },
    {
      "column_name": "erp_numero",
      "data_type": "text",
      "is_nullable": false,
      "default_value": null,
      "ordinal_position": 21,
      "column_comment": null
    },
    {
      "column_name": "erp_datos",
      "data_type": "jsonb",
      "is_nullable": true,
      "default_value": "'{}'::jsonb",
      "ordinal_position": 22,
      "column_comment": null
    },
    {
      "column_name": "erp_creado",
      "data_type": "timestamp",
      "is_nullable": true,
      "default_value": null,
      "ordinal_position": 23,
      "column_comment": null
    },
    {
      "column_name": "erp_actualizado",
      "data_type": "timestamp",
      "is_nullable": true,
      "default_value": null,
      "ordinal_position": 24,
      "column_comment": null
    },
    {
      "column_name": "erp_sincronizado",
      "data_type": "boolean",
      "is_nullable": true,
      "default_value": "false",
      "ordinal_position": 25,
      "column_comment": null
    },
    {
      "column_name": "erp_fecha_sync",
      "data_type": "timestamp",
      "is_nullable": true,
      "default_value": null,
      "ordinal_position": 26,
      "column_comment": null
    },
    {
      "column_name": "origin_source",
      "data_type": "text",
      "is_nullable": true,
      "default_value": null,
      "ordinal_position": 27,
      "column_comment": null
    },
    {
      "column_name": "origin_sync_id",
      "data_type": "text",
      "is_nullable": true,
      "default_value": null,
      "ordinal_position": 28,
      "column_comment": null
    },
    {
      "column_name": "origin_synced_at",
      "data_type": "timestamp",
      "is_nullable": true,
      "default_value": null,
      "ordinal_position": 29,
      "column_comment": null
    }
  ],
  constraints: [
    {
      "constraint_name": "18527_35645_11_not_null",
      "constraint_type": "CHECK",
      "columns": []
    },
    {
      "constraint_name": "18527_35645_12_not_null",
      "constraint_type": "CHECK",
      "columns": []
    },
    {
      "constraint_name": "18527_35645_13_not_null",
      "constraint_type": "CHECK",
      "columns": []
    },
    {
      "constraint_name": "18527_35645_14_not_null",
      "constraint_type": "CHECK",
      "columns": []
    },
    {
      "constraint_name": "18527_35645_15_not_null",
      "constraint_type": "CHECK",
      "columns": []
    },
    {
      "constraint_name": "18527_35645_17_not_null",
      "constraint_type": "CHECK",
      "columns": []
    },
    {
      "constraint_name": "18527_35645_18_not_null",
      "constraint_type": "CHECK",
      "columns": []
    },
    {
      "constraint_name": "18527_35645_19_not_null",
      "constraint_type": "CHECK",
      "columns": []
    },
    {
      "constraint_name": "18527_35645_1_not_null",
      "constraint_type": "CHECK",
      "columns": []
    },
    {
      "constraint_name": "18527_35645_20_not_null",
      "constraint_type": "CHECK",
      "columns": []
    },
    {
      "constraint_name": "18527_35645_21_not_null",
      "constraint_type": "CHECK",
      "columns": []
    },
    {
      "constraint_name": "18527_35645_2_not_null",
      "constraint_type": "CHECK",
      "columns": []
    },
    {
      "constraint_name": "18527_35645_3_not_null",
      "constraint_type": "CHECK",
      "columns": []
    },
    {
      "constraint_name": "18527_35645_4_not_null",
      "constraint_type": "CHECK",
      "columns": []
    },
    {
      "constraint_name": "18527_35645_7_not_null",
      "constraint_type": "CHECK",
      "columns": []
    },
    {
      "constraint_name": "18527_35645_8_not_null",
      "constraint_type": "CHECK",
      "columns": []
    },
    {
      "constraint_name": "18527_35645_9_not_null",
      "constraint_type": "CHECK",
      "columns": []
    },
    {
      "constraint_name": "comprobantes_detalle_pkey",
      "constraint_type": "PRIMARY KEY",
      "columns": [
        "comprobante_operacion",
        "comprobante_formulario",
        "comprobante_numero",
        "linea_numero"
      ]
    }
  ],
};
