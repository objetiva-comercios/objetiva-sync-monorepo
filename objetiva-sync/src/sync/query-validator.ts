/**
 * Query Validator
 * Valida que los resultados de una query SQL coincidan con el schema esperado de la entidad.
 *
 * FUENTE DE VERDAD: PostgreSQL via gateway schema API (schemaCache).
 * Los campos requeridos/opcionales se derivan dinámicamente del schema de la base de datos,
 * NO de listas hardcodeadas. Esto garantiza que cualquier cambio en PostgreSQL
 * (ej: ALTER TABLE, renombrar columnas) se refleje automáticamente en la validación.
 */

import { EntityType } from '../types/common.js';
import { schemaCache, type SchemaResponse } from '../services/schema-cache.js';
import { logger } from '../utils/logger.js';

/**
 * Mapeo de EntityType a nombre de tabla en PostgreSQL/gateway
 */
const ENTITY_TABLE_MAP: Record<EntityType, string> = {
  [EntityType.ARTICULO]: 'articulos',
  [EntityType.COMPROBANTE_CABECERA]: 'comprobantes_cabecera',
  [EntityType.COMPROBANTE_DETALLE]: 'comprobantes_detalle',
  [EntityType.COMPROBANTE_PAGO]: 'comprobantes_pagos',
};

/**
 * Estado de validación de un campo
 */
export type FieldStatus = 'OK' | 'MISSING' | 'TYPE_ERROR' | 'VALIDATION_ERROR';

/**
 * Información de validación de un campo
 */
export interface FieldValidation {
  status: FieldStatus;
  value?: unknown;
  error?: string;
  expectedType?: string;
  actualType?: string;
}

/**
 * Resultado de validación de una query
 */
export interface ValidationResult {
  isValid: boolean;
  rowCount: number;
  sampleData: unknown[];

  // Estado de campos requeridos
  requiredFields: Record<string, FieldValidation>;

  // Estado de campos opcionales encontrados
  optionalFields: Record<string, FieldValidation>;

  // Errores de validación por fila
  validationErrors: Array<{
    rowIndex: number;
    fieldPath: string[];
    error: string;
    value?: unknown;
  }>;

  // Recomendaciones
  recommendations: string[];
}

/**
 * Normaliza un tipo de PostgreSQL a tipo JavaScript esperado
 */
function normalizePostgresType(dataType: string): string {
  const lowerType = dataType.toLowerCase();

  // String types
  if (lowerType.includes('char') || lowerType.includes('text')) {
    return 'string';
  }

  // Numeric types
  if (
    lowerType.includes('int') ||
    lowerType.includes('serial') ||
    lowerType.includes('decimal') ||
    lowerType.includes('numeric') ||
    lowerType.includes('real') ||
    lowerType.includes('double') ||
    lowerType === 'smallint' ||
    lowerType === 'bigint' ||
    lowerType === 'money'
  ) {
    return 'number';
  }

  // Boolean
  if (lowerType === 'boolean' || lowerType === 'bool') {
    return 'boolean';
  }

  // Date/time types (represented as ISO strings in JavaScript)
  if (
    lowerType.includes('timestamp') ||
    lowerType.includes('date') ||
    lowerType === 'time'
  ) {
    return 'string (ISO 8601)';
  }

  // JSON types
  if (lowerType === 'json' || lowerType === 'jsonb') {
    return 'object';
  }

  // Array types
  if (lowerType === 'array' || lowerType.includes('[]')) {
    return 'array';
  }

  // Default to string (most flexible)
  return 'string';
}

/**
 * Detecta el tipo JavaScript de un valor
 */
function detectJsType(value: unknown): string {
  if (value === null || value === undefined) {
    return 'null';
  }

  if (Array.isArray(value)) {
    return 'array';
  }

  return typeof value;
}

/**
 * Comprueba si un tipo JavaScript es compatible con un tipo PostgreSQL
 * Usa reglas lenientes ya que los datos pueden estar stringificados o coercionados
 */
function isTypeCompatible(jsType: string, pgType: string): boolean {
  // Null is compatible with everything (nullable fields)
  if (jsType === 'null') {
    return true;
  }

  // Normalize pgType for comparison (remove " (ISO 8601)" suffix)
  const normalizedPgType = pgType.replace(' (ISO 8601)', '');

  // Exact match
  if (jsType === normalizedPgType) {
    return true;
  }

  // String is compatible with number (could be stringified)
  if (jsType === 'string' && normalizedPgType === 'number') {
    return true;
  }

  // Number is compatible with string (auto-coercion)
  if (jsType === 'number' && normalizedPgType === 'string') {
    return true;
  }

  // Object is compatible with jsonb
  if (jsType === 'object' && normalizedPgType === 'object') {
    return true;
  }

  return false;
}

/**
 * Deriva los campos requeridos y opcionales del schema del gateway.
 *
 * - Requeridos: NOT NULL y sin valor por defecto
 * - Opcionales: nullable o con valor por defecto
 *
 * Campos internos autogenerados (id, timestamps de sync) se excluyen de requeridos.
 */
function deriveFieldLists(schema: SchemaResponse): {
  requiredFields: string[];
  optionalFields: string[];
} {
  // Campos internos autogenerados que no deben ser requeridos en la query del usuario
  const INTERNAL_FIELDS = new Set([
    'id',
    'created_at', 'updated_at', 'deleted_at',
    'erp_sincronizado', 'erp_fecha_sync',
  ]);

  const required: string[] = [];
  const optional: string[] = [];

  for (const col of schema.columns) {
    // Skip internal/auto-generated fields
    if (INTERNAL_FIELDS.has(col.column_name)) {
      optional.push(col.column_name);
      continue;
    }

    // Field is required if: NOT NULL and no default value
    if (!col.is_nullable && col.default_value === null) {
      required.push(col.column_name);
    } else {
      optional.push(col.column_name);
    }
  }

  return { requiredFields: required, optionalFields: optional };
}

/**
 * Valida los resultados de una query contra el schema LIVE de PostgreSQL (via gateway).
 *
 * FUENTE DE VERDAD: El schema se obtiene del gateway, que lo lee directamente
 * de PostgreSQL. Cualquier cambio en la base de datos (ALTER TABLE, renombrar columnas, etc.)
 * se refleja automáticamente después de ejecutar `regenerate-schemas` y reiniciar.
 */
export async function validateQueryResult(
  rows: Record<string, unknown>[],
  entityType: EntityType
): Promise<ValidationResult> {
  const tableName = ENTITY_TABLE_MAP[entityType];

  if (!tableName) {
    throw new Error(`Tipo de entidad no soportado: ${entityType}`);
  }

  // Fetch schema from gateway (PostgreSQL source of truth)
  const schema = await schemaCache.getSchema(tableName);

  if (!schema) {
    logger.warn({ entityType, tableName }, 'Schema no disponible del gateway para validación');
    return {
      isValid: false,
      rowCount: rows.length,
      sampleData: rows.slice(0, 10),
      requiredFields: {},
      optionalFields: {},
      validationErrors: [{
        rowIndex: -1,
        fieldPath: [],
        error: 'No se pudo obtener el schema del gateway. Verificar que el servicio gateway esté ejecutándose.',
      }],
      recommendations: [
        'Schema no disponible del gateway. Verificar que el servicio gateway esté ejecutándose.',
        'El gateway debe estar corriendo para que la validación funcione correctamente.',
      ],
    };
  }

  // Derive required/optional fields dynamically from live schema
  const { requiredFields, optionalFields } = deriveFieldLists(schema);

  // Inicializar resultado
  const result: ValidationResult = {
    isValid: true,
    rowCount: rows.length,
    sampleData: rows.slice(0, 10),
    requiredFields: {},
    optionalFields: {},
    validationErrors: [],
    recommendations: [],
  };

  // Si no hay filas, no podemos validar campos
  if (rows.length === 0) {
    result.isValid = false;
    result.recommendations.push('La query no retornó datos. Verifica los filtros y la conexión a la base de datos.');

    // Marcar todos los campos requeridos como faltantes
    for (const field of requiredFields) {
      result.requiredFields[field] = {
        status: 'MISSING',
        error: 'No hay datos para validar',
      };
    }

    return result;
  }

  // Tomar la primera fila como referencia para detectar campos
  const firstRow = rows[0]!;

  // Validar campos requeridos
  for (const fieldName of requiredFields) {
    if (!(fieldName in firstRow)) {
      result.requiredFields[fieldName] = {
        status: 'MISSING',
        error: `Campo requerido '${fieldName}' no encontrado en la query`,
      };
      result.isValid = false;
    } else {
      result.requiredFields[fieldName] = {
        status: 'OK',
        value: firstRow[fieldName],
      };
    }
  }

  // Detectar campos opcionales presentes
  for (const fieldName of optionalFields) {
    if (fieldName in firstRow) {
      result.optionalFields[fieldName] = {
        status: 'OK',
        value: firstRow[fieldName],
      };
    }
  }

  // Validar tipos de datos usando el schema del gateway
  for (let i = 0; i < Math.min(rows.length, 10); i++) {
    const row = rows[i]!;

    for (const [fieldName, value] of Object.entries(row)) {
      // Find the column in the schema
      const column = schema.columns.find(c => c.column_name === fieldName);

      if (!column) {
        // Field not in schema - only flag as validation error on first row
        if (i === 0) {
          result.validationErrors.push({
            rowIndex: i,
            fieldPath: [fieldName],
            error: `Campo '${fieldName}' no existe en el schema de '${tableName}'`,
            value,
          });
        }
        continue;
      }

      // Skip null values
      if (value === null || value === undefined) {
        continue;
      }

      const jsType = detectJsType(value);
      const expectedType = normalizePostgresType(column.data_type);

      if (!isTypeCompatible(jsType, expectedType)) {
        result.isValid = false;

        result.validationErrors.push({
          rowIndex: i,
          fieldPath: [fieldName],
          error: `Tipo incorrecto para '${fieldName}': esperado ${expectedType}, recibido ${jsType}`,
          value,
        });

        // Actualizar estado del campo si es la primera fila
        if (i === 0) {
          if (requiredFields.includes(fieldName)) {
            result.requiredFields[fieldName] = {
              status: 'TYPE_ERROR',
              value,
              error: `Tipo esperado: ${expectedType}, recibido: ${jsType}`,
              expectedType,
              actualType: jsType,
            };
          } else if (optionalFields.includes(fieldName)) {
            result.optionalFields[fieldName] = {
              status: 'TYPE_ERROR',
              value,
              error: `Tipo esperado: ${expectedType}, recibido: ${jsType}`,
              expectedType,
              actualType: jsType,
            };
          }
        }
      }
    }
  }

  // Truncate validation errors report
  if (rows.length > 10) {
    result.recommendations.push(
      `Se validaron las primeras 10 filas de ${rows.length} totales.`
    );
  }

  // Generar recomendaciones
  if (result.isValid && result.validationErrors.length === 0) {
    result.recommendations.push('✅ Query válida! Todos los campos requeridos presentes y los datos pasan validación.');
  }

  return result;
}

/**
 * Obtiene el tipo esperado de un campo desde el schema del gateway
 */
export async function getFieldType(entityType: EntityType, fieldName: string): Promise<string> {
  const tableName = ENTITY_TABLE_MAP[entityType];
  if (!tableName) return 'unknown';

  const schema = await schemaCache.getSchema(tableName);
  if (!schema) return 'unknown';

  const column = schema.columns.find(c => c.column_name === fieldName);
  if (!column) return 'unknown';

  return normalizePostgresType(column.data_type);
}

/**
 * Obtiene un ejemplo de valor para un campo basado en su tipo PostgreSQL
 */
export function getFieldExample(fieldName: string, pgType?: string): string {
  const type = pgType ? pgType.toLowerCase() : '';

  // Type-based examples
  if (type.includes('char') || type.includes('text')) {
    return `"valor_${fieldName}"`;
  }
  if (type.includes('int') || type.includes('serial')) {
    return '1';
  }
  if (type.includes('numeric') || type.includes('decimal') || type.includes('real') || type.includes('double') || type === 'money') {
    return '100.50';
  }
  if (type === 'boolean' || type === 'bool') {
    return 'true';
  }
  if (type.includes('timestamp') || type.includes('date')) {
    return '"2024-01-09T13:30:00.000Z"';
  }
  if (type === 'json' || type === 'jsonb') {
    return '{"key": "value"}';
  }
  if (type.includes('[]') || type === 'array') {
    return '["value1", "value2"]';
  }

  return '"..."';
}

/**
 * Metadata de un campo extraída dinámicamente desde el schema del gateway
 */
export interface FieldMetadata {
  description: string;
  example: string;
  type: string;
  required: boolean;
}

/**
 * Obtiene metadata de un campo dinámicamente desde el schema del gateway
 */
export async function getFieldMetadata(entityType: EntityType, fieldName: string): Promise<FieldMetadata> {
  const tableName = ENTITY_TABLE_MAP[entityType];
  if (!tableName) {
    return {
      description: `Campo ${fieldName}`,
      example: '',
      type: 'unknown',
      required: false,
    };
  }

  const schema = await schemaCache.getSchema(tableName);
  if (!schema) {
    return {
      description: `Campo ${fieldName}`,
      example: '',
      type: 'unknown',
      required: false,
    };
  }

  const column = schema.columns.find(c => c.column_name === fieldName);
  if (!column) {
    return {
      description: `Campo ${fieldName} (no encontrado en schema)`,
      example: '',
      type: 'unknown',
      required: false,
    };
  }

  const isRequired = !column.is_nullable && column.default_value === null;
  const type = normalizePostgresType(column.data_type);
  const description = column.column_comment || `Campo ${fieldName} (${column.data_type})`;
  const example = getFieldExample(fieldName, column.data_type);

  return {
    description,
    example,
    type,
    required: isRequired,
  };
}
