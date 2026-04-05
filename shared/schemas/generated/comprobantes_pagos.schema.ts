// Auto-generated from PostgreSQL schema introspection
// DO NOT EDIT - regenerate with: npm run regenerate-schemas
// Generated: 2026-04-05T18:34:15.235Z
// Table: comprobantes_pagos

import { z } from 'zod';
import type { EntityMetadata, TableSchemaMetadata } from '../../types/schema-metadata.js';

/**
 * Zod schema for comprobantes_pago entity
 * Reflects PostgreSQL structure with business validations from column comments.
 */
export const comprobantesPagoSchema = z.object({
  comprobante_operacion: z.string().min(1, 'Campo requerido'),
  comprobante_formulario: z.string().min(1, 'Campo requerido'),
  comprobante_numero: z.string().min(1, 'Campo requerido'),
  linea_numero: z.coerce.number().transform(n => Math.trunc(n)),
  medio: z.string().min(1, 'Campo requerido'),
  monto: z.coerce.number(),
  moneda: z.string().optional(),
  tarjeta_marca: z.string().nullable().optional(),
  tarjeta_cuotas: z.coerce.number().transform(n => Math.trunc(n)).nullable().optional(),
  tarjeta_recargo: z.coerce.number().nullable().optional(),
  cheque_fecha_diferida: z.coerce.date().nullable().optional(),
  fecha_vencimiento: z.coerce.date().nullable().optional(),
  datos_extra: z.record(z.unknown()).nullable().optional(),
  referencia: z.string().nullable().optional(),
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

export type ComprobantesPagoInput = z.infer<typeof comprobantesPagoSchema>;

/**
 * Metadata for comprobantes_pago entity
 * Used for dynamic field operations in ingestion and validation.
 */
export const comprobantesPagoMetadata: EntityMetadata<readonly ['comprobante_operacion', 'comprobante_formulario', 'comprobante_numero', 'linea_numero']> = {
  entity: 'comprobantes_pago',
  tableName: 'comprobantes_pagos',
  keyFields: ['comprobante_operacion', 'comprobante_formulario', 'comprobante_numero', 'linea_numero'] as const,
  systemFields: ['erp_sincronizado', 'erp_fecha_sync', 'actualizado', 'creado'] as const,
  validations: {},
};

/**
 * Table schema metadata for comprobantes_pago entity
 * Contains column definitions and constraints from PostgreSQL.
 * Used for query validation and dynamic field detection.
 */
export const comprobantesPagoTableSchema: TableSchemaMetadata = {
  entity: 'comprobantes_pagos',
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
      "column_name": "medio",
      "data_type": "text",
      "is_nullable": false,
      "default_value": null,
      "ordinal_position": 5,
      "column_comment": null
    },
    {
      "column_name": "monto",
      "data_type": "decimal",
      "is_nullable": false,
      "default_value": null,
      "ordinal_position": 6,
      "column_comment": null
    },
    {
      "column_name": "moneda",
      "data_type": "text",
      "is_nullable": false,
      "default_value": "'ARS'::text",
      "ordinal_position": 7,
      "column_comment": null
    },
    {
      "column_name": "tarjeta_marca",
      "data_type": "text",
      "is_nullable": true,
      "default_value": null,
      "ordinal_position": 8,
      "column_comment": null
    },
    {
      "column_name": "tarjeta_cuotas",
      "data_type": "int",
      "is_nullable": true,
      "default_value": "1",
      "ordinal_position": 9,
      "column_comment": null
    },
    {
      "column_name": "tarjeta_recargo",
      "data_type": "decimal",
      "is_nullable": true,
      "default_value": "0",
      "ordinal_position": 10,
      "column_comment": null
    },
    {
      "column_name": "cheque_fecha_diferida",
      "data_type": "date",
      "is_nullable": true,
      "default_value": null,
      "ordinal_position": 11,
      "column_comment": null
    },
    {
      "column_name": "fecha_vencimiento",
      "data_type": "date",
      "is_nullable": true,
      "default_value": null,
      "ordinal_position": 12,
      "column_comment": null
    },
    {
      "column_name": "datos_extra",
      "data_type": "jsonb",
      "is_nullable": true,
      "default_value": "'{}'::jsonb",
      "ordinal_position": 13,
      "column_comment": null
    },
    {
      "column_name": "referencia",
      "data_type": "text",
      "is_nullable": true,
      "default_value": null,
      "ordinal_position": 14,
      "column_comment": null
    },
    {
      "column_name": "observaciones",
      "data_type": "text",
      "is_nullable": true,
      "default_value": null,
      "ordinal_position": 15,
      "column_comment": null
    },
    {
      "column_name": "creado",
      "data_type": "timestamp",
      "is_nullable": false,
      "default_value": "CURRENT_TIMESTAMP",
      "ordinal_position": 16,
      "column_comment": null
    },
    {
      "column_name": "actualizado",
      "data_type": "timestamp",
      "is_nullable": false,
      "default_value": "CURRENT_TIMESTAMP",
      "ordinal_position": 17,
      "column_comment": null
    },
    {
      "column_name": "erp_operacion",
      "data_type": "text",
      "is_nullable": false,
      "default_value": null,
      "ordinal_position": 18,
      "column_comment": null
    },
    {
      "column_name": "erp_formulario",
      "data_type": "text",
      "is_nullable": false,
      "default_value": null,
      "ordinal_position": 19,
      "column_comment": null
    },
    {
      "column_name": "erp_numero",
      "data_type": "text",
      "is_nullable": false,
      "default_value": null,
      "ordinal_position": 20,
      "column_comment": null
    },
    {
      "column_name": "erp_datos",
      "data_type": "jsonb",
      "is_nullable": true,
      "default_value": "'{}'::jsonb",
      "ordinal_position": 21,
      "column_comment": null
    },
    {
      "column_name": "erp_creado",
      "data_type": "timestamp",
      "is_nullable": true,
      "default_value": null,
      "ordinal_position": 22,
      "column_comment": null
    },
    {
      "column_name": "erp_actualizado",
      "data_type": "timestamp",
      "is_nullable": true,
      "default_value": null,
      "ordinal_position": 23,
      "column_comment": null
    },
    {
      "column_name": "erp_sincronizado",
      "data_type": "boolean",
      "is_nullable": true,
      "default_value": "false",
      "ordinal_position": 24,
      "column_comment": null
    },
    {
      "column_name": "erp_fecha_sync",
      "data_type": "timestamp",
      "is_nullable": true,
      "default_value": null,
      "ordinal_position": 25,
      "column_comment": null
    },
    {
      "column_name": "origin_source",
      "data_type": "text",
      "is_nullable": true,
      "default_value": null,
      "ordinal_position": 26,
      "column_comment": null
    },
    {
      "column_name": "origin_sync_id",
      "data_type": "text",
      "is_nullable": true,
      "default_value": null,
      "ordinal_position": 27,
      "column_comment": null
    },
    {
      "column_name": "origin_synced_at",
      "data_type": "timestamp",
      "is_nullable": true,
      "default_value": null,
      "ordinal_position": 28,
      "column_comment": null
    }
  ],
  constraints: [
    {
      "constraint_name": "18527_35657_16_not_null",
      "constraint_type": "CHECK",
      "columns": []
    },
    {
      "constraint_name": "18527_35657_17_not_null",
      "constraint_type": "CHECK",
      "columns": []
    },
    {
      "constraint_name": "18527_35657_18_not_null",
      "constraint_type": "CHECK",
      "columns": []
    },
    {
      "constraint_name": "18527_35657_19_not_null",
      "constraint_type": "CHECK",
      "columns": []
    },
    {
      "constraint_name": "18527_35657_1_not_null",
      "constraint_type": "CHECK",
      "columns": []
    },
    {
      "constraint_name": "18527_35657_20_not_null",
      "constraint_type": "CHECK",
      "columns": []
    },
    {
      "constraint_name": "18527_35657_2_not_null",
      "constraint_type": "CHECK",
      "columns": []
    },
    {
      "constraint_name": "18527_35657_3_not_null",
      "constraint_type": "CHECK",
      "columns": []
    },
    {
      "constraint_name": "18527_35657_4_not_null",
      "constraint_type": "CHECK",
      "columns": []
    },
    {
      "constraint_name": "18527_35657_5_not_null",
      "constraint_type": "CHECK",
      "columns": []
    },
    {
      "constraint_name": "18527_35657_6_not_null",
      "constraint_type": "CHECK",
      "columns": []
    },
    {
      "constraint_name": "18527_35657_7_not_null",
      "constraint_type": "CHECK",
      "columns": []
    },
    {
      "constraint_name": "comprobantes_pagos_pkey",
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
