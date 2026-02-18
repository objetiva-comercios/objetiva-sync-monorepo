// Auto-generated from PostgreSQL schema introspection
// DO NOT EDIT - regenerate with: npm run regenerate-schemas
// Generated: 2026-02-12T21:08:00.607Z
// Table: comprobantes_cabecera

import { z } from 'zod';
import type { EntityMetadata, TableSchemaMetadata } from '../../types/schema-metadata.js';

/**
 * Zod schema for comprobantes_cabecera entity
 * Reflects PostgreSQL structure with business validations from column comments.
 */
export const comprobantesCabeceraSchema = z.object({
  operacion: z.string().min(1, 'Campo requerido'),
  formulario: z.string().min(1, 'Campo requerido'),
  numero: z.string().min(1, 'Campo requerido'),
  fecha: z.coerce.date().nullable().optional(),
  tercero_tipo: z.string().nullable().optional(),
  tercero_nombre: z.string().nullable().optional(),
  tercero_documento: z.string().nullable().optional(),
  tercero_direccion: z.string().nullable().optional(),
  tercero_datos: z.record(z.unknown()).nullable().optional(),
  cantidad_items: z.coerce.number().transform(n => Math.trunc(n)).nullable().optional(),
  total_bruto: z.coerce.number(),
  total_descuentos: z.coerce.number().optional(),
  total_neto: z.coerce.number(),
  total_iva: z.coerce.number(),
  total_venta: z.coerce.number().optional(),
  total_intereses_financieros: z.coerce.number().nullable().optional(),
  total_cobrado: z.coerce.number().nullable().optional(),
  activo: z.boolean().optional(),
  observaciones: z.string().nullable().optional(),
  creado: z.coerce.date().optional(),
  actualizado: z.coerce.date().optional(),
  erp_id: z.string().nullable().optional(),
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

export type ComprobantesCabeceraInput = z.infer<typeof comprobantesCabeceraSchema>;

/**
 * Metadata for comprobantes_cabecera entity
 * Used for dynamic field operations in ingestion and validation.
 */
export const comprobantesCabeceraMetadata: EntityMetadata<readonly ['operacion', 'formulario', 'numero']> = {
  entity: 'comprobantes_cabecera',
  tableName: 'comprobantes_cabecera',
  keyFields: ['operacion', 'formulario', 'numero'] as const,
  systemFields: ['erp_sincronizado', 'erp_fecha_sync', 'actualizado', 'creado'] as const,
  validations: {},
};

/**
 * Table schema metadata for comprobantes_cabecera entity
 * Contains column definitions and constraints from PostgreSQL.
 * Used for query validation and dynamic field detection.
 */
export const comprobantesCabeceraTableSchema: TableSchemaMetadata = {
  entity: 'comprobantes_cabecera',
  columns: [
    {
      "column_name": "operacion",
      "data_type": "text",
      "is_nullable": false,
      "default_value": null,
      "ordinal_position": 1,
      "column_comment": null
    },
    {
      "column_name": "formulario",
      "data_type": "text",
      "is_nullable": false,
      "default_value": null,
      "ordinal_position": 2,
      "column_comment": null
    },
    {
      "column_name": "numero",
      "data_type": "text",
      "is_nullable": false,
      "default_value": null,
      "ordinal_position": 3,
      "column_comment": null
    },
    {
      "column_name": "fecha",
      "data_type": "timestamp",
      "is_nullable": true,
      "default_value": null,
      "ordinal_position": 4,
      "column_comment": null
    },
    {
      "column_name": "tercero_tipo",
      "data_type": "text",
      "is_nullable": true,
      "default_value": null,
      "ordinal_position": 5,
      "column_comment": null
    },
    {
      "column_name": "tercero_nombre",
      "data_type": "text",
      "is_nullable": true,
      "default_value": null,
      "ordinal_position": 6,
      "column_comment": null
    },
    {
      "column_name": "tercero_documento",
      "data_type": "text",
      "is_nullable": true,
      "default_value": null,
      "ordinal_position": 7,
      "column_comment": null
    },
    {
      "column_name": "tercero_direccion",
      "data_type": "text",
      "is_nullable": true,
      "default_value": null,
      "ordinal_position": 8,
      "column_comment": null
    },
    {
      "column_name": "tercero_datos",
      "data_type": "jsonb",
      "is_nullable": true,
      "default_value": "'{}'::jsonb",
      "ordinal_position": 9,
      "column_comment": null
    },
    {
      "column_name": "cantidad_items",
      "data_type": "int",
      "is_nullable": true,
      "default_value": "0",
      "ordinal_position": 10,
      "column_comment": null
    },
    {
      "column_name": "total_bruto",
      "data_type": "decimal",
      "is_nullable": false,
      "default_value": null,
      "ordinal_position": 11,
      "column_comment": null
    },
    {
      "column_name": "total_descuentos",
      "data_type": "decimal",
      "is_nullable": false,
      "default_value": "0",
      "ordinal_position": 12,
      "column_comment": null
    },
    {
      "column_name": "total_neto",
      "data_type": "decimal",
      "is_nullable": false,
      "default_value": null,
      "ordinal_position": 13,
      "column_comment": null
    },
    {
      "column_name": "total_iva",
      "data_type": "decimal",
      "is_nullable": false,
      "default_value": null,
      "ordinal_position": 14,
      "column_comment": null
    },
    {
      "column_name": "total_venta",
      "data_type": "decimal",
      "is_nullable": false,
      "default_value": "0",
      "ordinal_position": 15,
      "column_comment": null
    },
    {
      "column_name": "total_intereses_financieros",
      "data_type": "decimal",
      "is_nullable": true,
      "default_value": "0",
      "ordinal_position": 16,
      "column_comment": null
    },
    {
      "column_name": "total_cobrado",
      "data_type": "decimal",
      "is_nullable": true,
      "default_value": null,
      "ordinal_position": 17,
      "column_comment": null
    },
    {
      "column_name": "activo",
      "data_type": "boolean",
      "is_nullable": false,
      "default_value": "true",
      "ordinal_position": 18,
      "column_comment": null
    },
    {
      "column_name": "observaciones",
      "data_type": "text",
      "is_nullable": true,
      "default_value": null,
      "ordinal_position": 19,
      "column_comment": null
    },
    {
      "column_name": "creado",
      "data_type": "timestamp",
      "is_nullable": false,
      "default_value": "CURRENT_TIMESTAMP",
      "ordinal_position": 20,
      "column_comment": null
    },
    {
      "column_name": "actualizado",
      "data_type": "timestamp",
      "is_nullable": false,
      "default_value": "CURRENT_TIMESTAMP",
      "ordinal_position": 21,
      "column_comment": null
    },
    {
      "column_name": "erp_id",
      "data_type": "text",
      "is_nullable": true,
      "default_value": null,
      "ordinal_position": 22,
      "column_comment": null
    },
    {
      "column_name": "erp_operacion",
      "data_type": "text",
      "is_nullable": false,
      "default_value": null,
      "ordinal_position": 23,
      "column_comment": null
    },
    {
      "column_name": "erp_formulario",
      "data_type": "text",
      "is_nullable": false,
      "default_value": null,
      "ordinal_position": 24,
      "column_comment": null
    },
    {
      "column_name": "erp_numero",
      "data_type": "text",
      "is_nullable": false,
      "default_value": null,
      "ordinal_position": 25,
      "column_comment": null
    },
    {
      "column_name": "erp_datos",
      "data_type": "jsonb",
      "is_nullable": true,
      "default_value": "'{}'::jsonb",
      "ordinal_position": 26,
      "column_comment": null
    },
    {
      "column_name": "erp_creado",
      "data_type": "timestamp",
      "is_nullable": true,
      "default_value": null,
      "ordinal_position": 27,
      "column_comment": null
    },
    {
      "column_name": "erp_actualizado",
      "data_type": "timestamp",
      "is_nullable": true,
      "default_value": null,
      "ordinal_position": 28,
      "column_comment": null
    },
    {
      "column_name": "erp_sincronizado",
      "data_type": "boolean",
      "is_nullable": true,
      "default_value": "false",
      "ordinal_position": 29,
      "column_comment": null
    },
    {
      "column_name": "erp_fecha_sync",
      "data_type": "timestamp",
      "is_nullable": true,
      "default_value": null,
      "ordinal_position": 30,
      "column_comment": null
    },
    {
      "column_name": "origin_source",
      "data_type": "text",
      "is_nullable": true,
      "default_value": null,
      "ordinal_position": 31,
      "column_comment": null
    },
    {
      "column_name": "origin_sync_id",
      "data_type": "text",
      "is_nullable": true,
      "default_value": null,
      "ordinal_position": 32,
      "column_comment": null
    },
    {
      "column_name": "origin_synced_at",
      "data_type": "timestamp",
      "is_nullable": true,
      "default_value": null,
      "ordinal_position": 33,
      "column_comment": null
    }
  ],
  constraints: [
    {
      "constraint_name": "2200_33176_11_not_null",
      "constraint_type": "CHECK",
      "columns": []
    },
    {
      "constraint_name": "2200_33176_12_not_null",
      "constraint_type": "CHECK",
      "columns": []
    },
    {
      "constraint_name": "2200_33176_13_not_null",
      "constraint_type": "CHECK",
      "columns": []
    },
    {
      "constraint_name": "2200_33176_14_not_null",
      "constraint_type": "CHECK",
      "columns": []
    },
    {
      "constraint_name": "2200_33176_15_not_null",
      "constraint_type": "CHECK",
      "columns": []
    },
    {
      "constraint_name": "2200_33176_18_not_null",
      "constraint_type": "CHECK",
      "columns": []
    },
    {
      "constraint_name": "2200_33176_1_not_null",
      "constraint_type": "CHECK",
      "columns": []
    },
    {
      "constraint_name": "2200_33176_20_not_null",
      "constraint_type": "CHECK",
      "columns": []
    },
    {
      "constraint_name": "2200_33176_21_not_null",
      "constraint_type": "CHECK",
      "columns": []
    },
    {
      "constraint_name": "2200_33176_23_not_null",
      "constraint_type": "CHECK",
      "columns": []
    },
    {
      "constraint_name": "2200_33176_24_not_null",
      "constraint_type": "CHECK",
      "columns": []
    },
    {
      "constraint_name": "2200_33176_25_not_null",
      "constraint_type": "CHECK",
      "columns": []
    },
    {
      "constraint_name": "2200_33176_2_not_null",
      "constraint_type": "CHECK",
      "columns": []
    },
    {
      "constraint_name": "2200_33176_3_not_null",
      "constraint_type": "CHECK",
      "columns": []
    },
    {
      "constraint_name": "comprobantes_cabecera_pkey",
      "constraint_type": "PRIMARY KEY",
      "columns": [
        "operacion",
        "formulario",
        "numero"
      ]
    }
  ],
};
