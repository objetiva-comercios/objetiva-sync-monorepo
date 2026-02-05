/**
 * API endpoint para obtener información de schemas dinámicamente
 * Primary: Fetches complete PostgreSQL column metadata from the gateway
 * Fallback: Uses local Zod payload schemas when gateway is unreachable
 */

import type { FastifyInstance } from 'fastify';
import { requireNoPasswordChange } from '../../middleware/auth.js';
import { EntityType } from '../../../types/common.js';
import {
  articuloPayloadSchema,
} from '../../../types/articulos.js';
import {
  comprobanteCabeceraPayloadSchema,
} from '../../../types/comprobantes-cabecera.js';
import {
  comprobanteDetallePayloadSchema,
} from '../../../types/comprobantes-detalle.js';
import {
  comprobantePagoPayloadSchema,
} from '../../../types/comprobantes-pagos.js';
import { z } from 'zod';
import type { SchemaResponse as GatewaySchemaResponse } from '../../../types/schema.js';
import { schemaCache } from '../../../services/schema-cache.js';

// Mapa de schemas por entity type (fallback)
const ENTITY_SCHEMAS = {
  [EntityType.ARTICULO]: articuloPayloadSchema,
  [EntityType.COMPROBANTE_CABECERA]: comprobanteCabeceraPayloadSchema,
  [EntityType.COMPROBANTE_DETALLE]: comprobanteDetallePayloadSchema,
  [EntityType.COMPROBANTE_PAGO]: comprobantePagoPayloadSchema,
} as const;

/**
 * Mapping from EntityType enum values to gateway table names
 */
const ENTITY_TO_TABLE: Record<string, string> = {
  [EntityType.ARTICULO]: 'articulos',
  [EntityType.COMPROBANTE_CABECERA]: 'comprobantes_cabecera',
  [EntityType.COMPROBANTE_DETALLE]: 'comprobantes_detalle',
  [EntityType.COMPROBANTE_PAGO]: 'comprobantes_pagos',
};

interface FieldInfo {
  name: string;
  type: string;
  required: boolean;
  example: string;
  description: string;
}

interface SchemaInfo {
  entityType: string;
  required: FieldInfo[];
  optional: FieldInfo[];
}

/**
 * Mapea tipos de PostgreSQL a tipos de display simplificados
 */
function mapDataType(pgType: string): string {
  switch (pgType) {
    case 'text':
    case 'character varying':
      return 'string';
    case 'integer':
    case 'bigint':
    case 'smallint':
      return 'number';
    case 'numeric':
    case 'double precision':
    case 'real':
      return 'number';
    case 'boolean':
      return 'boolean';
    case 'timestamp with time zone':
    case 'timestamp without time zone':
      return 'timestamp';
    case 'date':
      return 'date';
    case 'jsonb':
    case 'json':
      return 'json';
    default:
      return pgType;
  }
}

/**
 * Transforma una GatewaySchemaResponse en SchemaInfo para el frontend
 */
function transformGatewaySchema(entityType: string, gatewaySchema: GatewaySchemaResponse): SchemaInfo {
  const required: FieldInfo[] = [];
  const optional: FieldInfo[] = [];

  for (const col of gatewaySchema.columns) {
    const isRequired = col.is_nullable === 'NO' && col.column_default === null;
    const displayType = mapDataType(col.data_type);

    const fieldInfo: FieldInfo = {
      name: col.column_name,
      type: displayType,
      required: isRequired,
      example: getFieldExample(col.column_name, displayType),
      description: getFieldDescription(col.column_name),
    };

    if (isRequired) {
      required.push(fieldInfo);
    } else {
      optional.push(fieldInfo);
    }
  }

  return {
    entityType,
    required,
    optional,
  };
}

/**
 * Obtiene el tipo TypeScript de un schema Zod
 */
function getZodType(zodSchema: z.ZodTypeAny): string {
  if (zodSchema instanceof z.ZodString) return 'string';
  if (zodSchema instanceof z.ZodNumber) return 'number';
  if (zodSchema instanceof z.ZodBoolean) return 'boolean';
  if (zodSchema instanceof z.ZodDate) return 'Date';
  if (zodSchema instanceof z.ZodArray) {
    const elementType = getZodType((zodSchema as any)._def.type);
    return `${elementType}[]`;
  }
  if (zodSchema instanceof z.ZodObject) return 'object';
  if (zodSchema instanceof z.ZodRecord) return 'Record<string, unknown>';
  if (zodSchema instanceof z.ZodOptional) {
    return getZodType((zodSchema as any)._def.innerType);
  }
  if (zodSchema instanceof z.ZodDefault) {
    return getZodType((zodSchema as any)._def.innerType);
  }
  return 'unknown';
}

/**
 * Obtiene un ejemplo de valor para un tipo de campo
 */
function getFieldExample(fieldName: string, type: string): string {
  // Ejemplos específicos por nombre de campo
  const specificExamples: Record<string, string> = {
    'erp_codigo': '"ART001"',
    'erp_nombre': '"Producto de ejemplo"',
    'erp_operacion': '"VENTA"',
    'erp_formulario': '"A"',
    'erp_numero': '"00001-00000123"',
    'operacion': '"VTA"',
    'formulario': '"FA"',
    'numero': '"00001234"',
    'tipo': '"FACTURA"',
    'comprobante': '"A-0001-00001234"',
    'fecha': '"2026-01-11T00:00:00.000Z"',
    'medio': '"EFECTIVO"',
    'codigo_articulo': '"ART001"',
    'nombre_articulo': '"Producto X"',
    'tercero_tipo': '"CLIENTE"',
    'tercero_nombre': '"Juan Pérez"',
    'tercero_documento': '"20-12345678-9"',
    'tercero_direccion': '"Av. Corrientes 1234, CABA"',
    'periodo': '"2026-01"',
    'monto': '1500.00',
    'unidades': '5',
    'precio': '100.50',
    'costo': '75.00',
    'precio_unitario': '100.50',
    'linea_numero': '1',
    'activo': 'true',
    // Campos modelo IVA - Cabecera (fiscales)
    'cantidad_items': '5',
    'total_bruto': '1000000.00',
    'total_descuentos': '100000.00',
    'total_neto': '900000.00',
    'total_iva': '189000.00',
    'total_venta': '1089000.00',
    // Campos modelo IVA - Cabecera (financieros)
    'total_intereses_financieros': '50000.00',
    'total_cobrado': '1139000.00',
    // Campos modelo IVA - Detalle
    'importe_bruto': '500.00',
    'porc_descuento': '10',
    'importe_descuento': '50.00',
    'importe_neto': '450.00',
    'alicuota_iva': '21',
    'importe_iva': '94.50',
    'importe_total': '544.50',
    // Server-managed fields
    'id': '1',
    'created_at': '"2026-01-15T10:30:00.000Z"',
    'updated_at': '"2026-01-15T10:30:00.000Z"',
    'creado': '"2026-01-15T10:30:00.000Z"',
    'actualizado': '"2026-01-15T10:30:00.000Z"',
    'erp_fecha_sync': '"2026-01-15T10:30:00.000Z"',
  };

  if (specificExamples[fieldName]) {
    return specificExamples[fieldName];
  }

  // Ejemplos genéricos por tipo
  switch (type) {
    case 'string':
      return '"ejemplo"';
    case 'number':
      return '100';
    case 'boolean':
      return 'true';
    case 'timestamp':
      return '"2026-01-15T10:30:00.000Z"';
    case 'date':
      return '"2026-01-15"';
    case 'json':
      return '{"key": "value"}';
    case 'string[]':
      return '["item1", "item2"]';
    case 'object':
      return '{"key": "value"}';
    case 'Record<string, unknown>':
      return '{"key": "value"}';
    default:
      return '...';
  }
}

/**
 * Obtiene descripción de un campo
 */
function getFieldDescription(fieldName: string): string {
  const descriptions: Record<string, string> = {
    'erp_codigo': 'Código único del artículo en el ERP',
    'erp_nombre': 'Nombre del artículo',
    'erp_operacion': 'Operación del comprobante en el ERP (valor original)',
    'erp_formulario': 'Formulario del comprobante en el ERP (valor original)',
    'erp_numero': 'Número del comprobante en el ERP (valor original)',
    'operacion': 'Operación del comprobante normalizada (parte de clave única)',
    'formulario': 'Formulario del comprobante normalizado (parte de clave única)',
    'numero': 'Número del comprobante normalizado (parte de clave única)',
    'comprobante_operacion': 'Operación del comprobante (vinculación con cabecera)',
    'comprobante_formulario': 'Formulario del comprobante (vinculación con cabecera)',
    'comprobante_numero': 'Número del comprobante (vinculación con cabecera)',
    'tipo': 'Tipo de comprobante',
    'comprobante': 'Descripción del comprobante',
    'fecha': 'Fecha en formato ISO 8601 (UTC)',
    'total_venta': 'Total de venta con IVA (SUM(detalle.importe_total) = total_neto + total_iva)',
    'total_intereses_financieros': 'Total de intereses financieros cobrados (SUM(pagos.interes_financiero))',
    'total_cobrado': 'Total cobrado incluyendo intereses (total_venta + total_intereses_financieros)',
    'medio': 'Medio de pago utilizado',
    'metodo_pago': 'Medio de pago (campo renombrado a "medio" en PostgreSQL)',
    'monto': 'Monto del pago',
    'unidades': 'Cantidad de unidades',
    'codigo_articulo': 'Código del artículo',
    'nombre_articulo': 'Nombre del artículo',
    'linea_numero': 'Número de línea (parte de clave única)',
    'precio_unitario': 'Precio por unidad SIN IVA',
    'subtotal': 'Subtotal de la línea',
    'tercero_tipo': 'Tipo de tercero (CLIENTE o PROVEEDOR)',
    'tercero_nombre': 'Nombre del tercero (cliente/proveedor)',
    'tercero_documento': 'Documento del tercero (CUIT/DNI)',
    'tercero_direccion': 'Dirección fiscal o comercial del tercero',
    'tercero_datos': 'Datos adicionales del tercero en formato JSON',
    'periodo': 'Período contable (YYYYMM)',
    'activo': 'Si el registro está activo',
    'descuento': 'Monto de descuento aplicado',
    'moneda': 'Código de moneda',
    'referencia': 'Referencia del pago',
    'erp_datos': 'Metadata adicional del ERP',
    'erp_id': 'Identificador interno único en el ERP origen',
    'observaciones': 'Observaciones generales',
    // Campos modelo IVA - Cabecera
    'cantidad_items': 'Cantidad total de líneas del comprobante (COUNT(detalle))',
    'total_bruto': 'Suma de importes brutos (SUM(detalle.importe_bruto))',
    'total_descuentos': 'Suma de descuentos (SUM(detalle.importe_descuento))',
    'total_neto': 'Base imponible total (total_bruto - total_descuentos)',
    'total_iva': 'Total de IVA del comprobante (SUM(detalle.importe_iva))',
    // Campos modelo IVA - Detalle
    'importe_bruto': 'Importe bruto (unidades x precio_unitario)',
    'importe_descuento': 'Monto de descuento en pesos',
    'importe_neto': 'Base imponible (importe_bruto - importe_descuento)',
    'alicuota_iva': 'Alícuota de IVA (0, 10.5, 21 o 27)',
    'importe_iva': 'IVA calculado (importe_neto x alicuota_iva / 100)',
    'importe_total': 'Total de la línea (importe_neto + importe_iva)',
    'porc_descuento': 'Porcentaje de descuento (0-100)',
    // Server-managed fields
    'id': 'Identificador único auto-generado (servidor)',
    'created_at': 'Fecha de creación (campo renombrado a "creado" en PostgreSQL)',
    'updated_at': 'Fecha de actualización (campo renombrado a "actualizado" en PostgreSQL)',
    'creado': 'Fecha de creación del registro (servidor)',
    'actualizado': 'Fecha de última actualización (servidor)',
    'erp_fecha_sync': 'Fecha de última sincronización desde el ERP (servidor)',
  };

  return descriptions[fieldName] || `Campo ${fieldName}`;
}

/**
 * Extrae información de un schema Zod (fallback cuando gateway no disponible)
 */
function extractSchemaInfo(entityType: EntityType): SchemaInfo {
  let schema: z.ZodTypeAny = ENTITY_SCHEMAS[entityType];

  if (!schema) {
    throw new Error(`Schema no encontrado para entidad: ${entityType}`);
  }

  // Si el schema tiene .refine() aplicado, es un ZodEffects
  // Necesitamos extraer el schema interno
  let currentSchema: any = schema;

  // Desenvolver ZodEffects (puede estar anidado múltiples veces)
  while (currentSchema._def && currentSchema._def.typeName === 'ZodEffects') {
    currentSchema = currentSchema._def.schema;
  }

  // Usar el schema desenvuelto
  schema = currentSchema;

  // Verificar que sea un ZodObject
  if (!(schema instanceof z.ZodObject)) {
    throw new Error(`Schema no es un ZodObject para entidad: ${entityType}. TypeName: ${(schema as any)._def?.typeName}`);
  }

  const shape = schema.shape;
  const required: FieldInfo[] = [];
  const optional: FieldInfo[] = [];

  for (const [fieldName, fieldSchema] of Object.entries(shape)) {
    const zodField = fieldSchema as z.ZodTypeAny;

    // Determinar si es opcional
    const isOptional = zodField instanceof z.ZodOptional || zodField instanceof z.ZodDefault;

    // Obtener el tipo
    const type = getZodType(zodField);

    // Crear FieldInfo
    const fieldInfo: FieldInfo = {
      name: fieldName,
      type,
      required: !isOptional,
      example: getFieldExample(fieldName, type),
      description: getFieldDescription(fieldName),
    };

    if (isOptional) {
      optional.push(fieldInfo);
    } else {
      required.push(fieldInfo);
    }
  }

  return {
    entityType,
    required,
    optional,
  };
}

/**
 * Registra las rutas de API de schema info
 */
export async function registerSchemaInfoRoutes(app: FastifyInstance) {
  /**
   * GET /api/schema-info/:entityType - Obtener información de schema
   * Primary: gateway PostgreSQL metadata. Fallback: local Zod schemas.
   */
  app.get(
    '/api/schema-info/:entityType',
    { preHandler: requireNoPasswordChange },
    async (request, reply) => {
      const { entityType } = request.params as { entityType: string };

      // Validar entity type
      if (!Object.values(EntityType).includes(entityType as EntityType)) {
        return reply.status(400).send({
          success: false,
          error: `Tipo de entidad inválido: ${entityType}`,
        });
      }

      try {
        // Primary path: fetch from gateway via schema cache
        const tableName = ENTITY_TO_TABLE[entityType];
        if (tableName) {
          const gatewaySchema = await schemaCache.getSchema(tableName);

          if (gatewaySchema) {
            const schemaInfo = transformGatewaySchema(entityType, gatewaySchema);
            return reply.send({
              success: true,
              data: schemaInfo,
              source: 'gateway',
            });
          }
        }

        // Fallback path: use local Zod schemas
        const schemaInfo = extractSchemaInfo(entityType as EntityType);
        return reply.send({
          success: true,
          data: schemaInfo,
          source: 'local',
        });
      } catch (error) {
        // Log detallado del error para debugging
        console.error('Error en schema-info:', error);
        console.error('EntityType:', entityType);
        console.error('Error stack:', error instanceof Error ? error.stack : 'No stack');

        return reply.status(500).send({
          success: false,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }
  );

  /**
   * GET /api/schema-info/all - Obtener información de todos los schemas
   * Primary: gateway PostgreSQL metadata. Fallback: local Zod schemas.
   */
  app.get(
    '/api/schema-info/all',
    { preHandler: requireNoPasswordChange },
    async (_request, reply) => {
      try {
        const allSchemas: Record<string, SchemaInfo> = {};
        let source: 'gateway' | 'local' = 'local';

        // Try gateway first
        try {
          const gatewaySchemas = await schemaCache.getAllSchemas();

          if (gatewaySchemas && gatewaySchemas.length > 0) {
            source = 'gateway';

            for (const gs of gatewaySchemas) {
              // Find the entityType that maps to this table name
              const entityType = Object.entries(ENTITY_TO_TABLE)
                .find(([_, table]) => table === gs.entity)?.[0];

              if (entityType) {
                allSchemas[entityType] = transformGatewaySchema(entityType, gs);
              }
            }

            // If we got schemas from gateway, return them
            if (Object.keys(allSchemas).length > 0) {
              return reply.send({
                success: true,
                data: allSchemas,
                source,
              });
            }
          }
        } catch {
          // Gateway failed, fall through to Zod fallback
        }

        // Fallback: use local Zod schemas
        for (const entityType of Object.values(EntityType)) {
          allSchemas[entityType] = extractSchemaInfo(entityType);
        }

        return reply.send({
          success: true,
          data: allSchemas,
          source: 'local',
        });
      } catch (error) {
        return reply.status(500).send({
          success: false,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }
  );
}
