/**
 * Query Validator
 * Valida que los resultados de una query SQL coincidan con el schema esperado de la entidad
 * Reemplaza el antiguo sistema de field_mappings + transformer
 */

import { EntityType } from '../types/common.js';
import {
  articuloPayloadSchema,
} from '../types/articulos.js';
import {
  comprobanteCabeceraPayloadSchema,
} from '../types/comprobantes-cabecera.js';
import {
  comprobanteDetallePayloadSchema,
} from '../types/comprobantes-detalle.js';
import {
  comprobantePagoPayloadSchema,
} from '../types/comprobantes-pagos.js';

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
 * Schemas y metadata por tipo de entidad
 */
const ENTITY_SCHEMAS = {
  [EntityType.ARTICULO]: {
    schema: articuloPayloadSchema,
    requiredFields: ['erp_codigo', 'erp_nombre2'],
    optionalFields: [
      'sku', 'codigo', 'codigo_barras', 'erp_id', 'codigo_equivalencia',
      'nombre', 'nombre_corto', 'descripcion', 'descripcion_web',
      'rubro', 'subrubro', 'objeto', 'marca', 'modelo', 'adjetivo',
      'talle', 'color', 'material', 'presentacion', 'medida',
      'prop_aux_1', 'prop_aux_2', 'prop_aux_3', 'prop_aux_4', 'prop_aux_5',
      'precio', 'costo', 'unidades',
      'imagenes_producto', 'imagenes_etiqueta', 'etiquetas_ocr',
      'json_articulo', 'erp_extra', 'activo', 'observaciones'
    ]
  },
  [EntityType.COMPROBANTE_CABECERA]: {
    schema: comprobanteCabeceraPayloadSchema,
    requiredFields: [
      'erp_operacion', 'erp_formulario', 'erp_numero',
      'operacion', 'formulario', 'numero',
      'fecha', 'cantidad_items',
      'total_bruto', 'total_descuentos', 'total_neto', 'total_iva', 'total_venta'
    ],
    optionalFields: [
      'tercero_tipo', 'tercero_nombre', 'tercero_documento', 'tercero_direccion', 'tercero_datos',
      'total_intereses_financieros', 'total_cobrado',
      'erp_id', 'erp_datos', 'observaciones'
    ]
  },
  [EntityType.COMPROBANTE_DETALLE]: {
    schema: comprobanteDetallePayloadSchema,
    requiredFields: [
      'erp_operacion', 'erp_formulario', 'erp_numero',
      'comprobante_operacion', 'comprobante_formulario', 'comprobante_numero',
      'linea_numero', 'unidades', 'precio_unitario',
      'importe_bruto', 'importe_neto', 'alicuota_iva', 'importe_iva', 'importe_total'
    ],
    optionalFields: [
      'codigo_articulo', 'nombre_articulo',
      'porc_descuento', 'importe_descuento',
      'erp_datos', 'observaciones'
    ]
  },
  [EntityType.COMPROBANTE_PAGO]: {
    schema: comprobantePagoPayloadSchema,
    requiredFields: ['erp_operacion', 'erp_formulario', 'erp_numero', 'comprobante_operacion', 'comprobante_formulario', 'comprobante_numero', 'linea_numero', 'medio', 'monto'],
    optionalFields: [
      'moneda', 'fecha_pago', 'referencia', 'erp_datos'
    ]
  }
} as const;

/**
 * Valida los resultados de una query contra el schema de la entidad
 */
export function validateQueryResult(
  rows: Record<string, unknown>[],
  entityType: EntityType
): ValidationResult {
  const entityConfig = ENTITY_SCHEMAS[entityType];

  if (!entityConfig) {
    throw new Error(`Tipo de entidad no soportado: ${entityType}`);
  }

  const { schema, requiredFields, optionalFields } = entityConfig;

  // Inicializar resultado
  const result: ValidationResult = {
    isValid: true,
    rowCount: rows.length,
    sampleData: rows.slice(0, 10), // Primeros 10 registros
    requiredFields: {},
    optionalFields: {},
    validationErrors: [],
    recommendations: []
  };

  // Si no hay filas, no podemos validar campos
  if (rows.length === 0) {
    result.isValid = false;
    result.recommendations.push('La query no retornó datos. Verifica los filtros y la conexión a la base de datos.');

    // Marcar todos los campos requeridos como faltantes
    for (const field of requiredFields) {
      result.requiredFields[field] = {
        status: 'MISSING',
        error: 'No hay datos para validar'
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
        error: `Campo requerido '${fieldName}' no encontrado en la query`
      };
      result.isValid = false;
    } else {
      result.requiredFields[fieldName] = {
        status: 'OK',
        value: firstRow[fieldName]
      };
    }
  }

  // Detectar campos opcionales presentes
  for (const fieldName of optionalFields) {
    if (fieldName in firstRow) {
      result.optionalFields[fieldName] = {
        status: 'OK',
        value: firstRow[fieldName]
      };
    }
  }

  // Validar todas las filas contra el schema Zod
  for (let i = 0; i < rows.length; i++) {
    const row = rows[i]!;
    const validation = schema.safeParse(row);

    if (!validation.success) {
      result.isValid = false;

      // Extraer errores de Zod
      for (const issue of validation.error.issues) {
        const fieldPath = issue.path.map(p => String(p));
        const fieldName = fieldPath[0] || 'unknown';

        // Agregar error de validación
        result.validationErrors.push({
          rowIndex: i,
          fieldPath,
          error: issue.message,
          value: row[fieldName]
        });

        // Actualizar estado del campo si es la primera fila
        if (i === 0) {
          if ((requiredFields as readonly string[]).includes(fieldName)) {
            result.requiredFields[fieldName] = {
              status: issue.code === 'invalid_type' ? 'TYPE_ERROR' : 'VALIDATION_ERROR',
              value: row[fieldName],
              error: issue.message,
              expectedType: 'expected' in issue ? String(issue.expected) : undefined,
              actualType: 'received' in issue ? String(issue.received) : undefined
            };
          } else if ((optionalFields as readonly string[]).includes(fieldName)) {
            result.optionalFields[fieldName] = {
              status: issue.code === 'invalid_type' ? 'TYPE_ERROR' : 'VALIDATION_ERROR',
              value: row[fieldName],
              error: issue.message,
              expectedType: 'expected' in issue ? String(issue.expected) : undefined,
              actualType: 'received' in issue ? String(issue.received) : undefined
            };
          }
        }
      }

      // Solo validar las primeras 10 filas para no saturar
      if (i >= 10) {
        if (rows.length > 10) {
          result.recommendations.push(
            `Se encontraron errores en las primeras 10 filas. Hay ${rows.length - 10} filas adicionales que no fueron validadas en detalle.`
          );
        }
        break;
      }
    }
  }

  // Generar recomendaciones
  const missingOptional = optionalFields.filter(f => !(f in firstRow));
  if (missingOptional.length > 0) {
    const importantOptional = missingOptional.filter(f =>
      ['porc_descuento', 'importe_descuento', 'codigo_articulo', 'nombre_articulo',
       'tercero_nombre', 'tercero_documento', 'tercero_tipo'].includes(f)
    );

    if (importantOptional.length > 0) {
      result.recommendations.push(
        `Campos opcionales recomendados no encontrados: ${importantOptional.join(', ')}`
      );
    }
  }

  // Si todos los campos requeridos están presentes y no hay errores de validación
  if (result.isValid && result.validationErrors.length === 0) {
    result.recommendations.push('✅ Query válida! Todos los campos requeridos presentes y los datos pasan validación.');
  }

  return result;
}

/**
 * Obtiene el tipo esperado de un campo según el schema
 */
export function getFieldType(_entityType: EntityType, fieldName: string): string {
  // Tipos conocidos por campo
  const fieldTypes: Record<string, string> = {
    // Strings
    'erp_codigo': 'string',
    'erp_nombre': 'string',
    'erp_operacion': 'string',
    'erp_formulario': 'string',
    'erp_numero': 'string',
    'operacion': 'string',
    'formulario': 'string',
    'numero': 'string',
    'comprobante_operacion': 'string',
    'comprobante_formulario': 'string',
    'comprobante_numero': 'string',
    'tipo': 'string',
    'comprobante': 'string',
    'fecha': 'string (ISO 8601)',
    'nombre': 'string',
    'codigo': 'string',
    'medio': 'string',

    // Numbers
    'total_venta': 'number',
    'total_intereses_financieros': 'number',
    'total_cobrado': 'number',
    'subtotal': 'number',
    'monto': 'number',
    'unidades': 'number',
    'precio': 'number',
    'costo': 'number',
    'precio_unitario': 'number',
    'linea_numero': 'number',
    'importe_bruto': 'number',
    'importe_neto': 'number',
    'importe_iva': 'number',
    'importe_total': 'number',
    'importe_descuento': 'number',
    'porc_descuento': 'number',
    'alicuota_iva': 'number',
    'total_bruto': 'number',
    'total_neto': 'number',
    'total_iva': 'number',

    // Booleans
    'activo': 'boolean',

    // Arrays
    'imagenes_producto': 'string[]',
    'imagenes_etiqueta': 'string[]',
    'etiquetas_ocr': 'string[]',
  };

  return fieldTypes[fieldName] || 'unknown';
}

/**
 * Obtiene un ejemplo de valor para un campo
 */
export function getFieldExample(_entityType: EntityType, fieldName: string): string {
  const examples: Record<string, string> = {
    // Strings
    'erp_codigo': '"ART001"',
    'erp_nombre': '"Producto de ejemplo"',
    'erp_operacion': '"VENTA"',
    'erp_formulario': '"FACTURA A"',
    'erp_numero': '"00001-00000123"',
    'operacion': '"VTA"',
    'formulario': '"FA"',
    'numero': '"00001234"',
    'comprobante_operacion': '"VTA"',
    'comprobante_formulario': '"FA"',
    'comprobante_numero': '"00001234"',
    'fecha': '"2024-01-09T13:30:00.000Z"',
    'nombre': '"Artículo ejemplo"',
    'codigo': '"ART001"',
    'medio': '"EFECTIVO"',
    'codigo_articulo': '"ART001"',
    'nombre_articulo': '"Producto X"',
    'tercero_nombre': '"Juan Pérez"',
    'tercero_documento': '"20-12345678-9"',

    // Numbers
    'total_venta': '1089000.00',
    'total_intereses_financieros': '50000.00',
    'total_cobrado': '1139000.00',
    'subtotal': '826.45',
    'monto': '1000.00',
    'unidades': '5',
    'precio': '100.50',
    'costo': '75.00',
    'precio_unitario': '100.50',
    'linea_numero': '1',
    'total_impuestos': '174.05',
    'cantidad_items': '5',
    'importe_bruto': '500.00',
    'importe_descuento': '50.00',
    'importe_neto': '450.00',
    'alicuota_iva': '21',
    'importe_iva': '94.50',
    'importe_total': '544.50',
    'porc_descuento': '10',
    'total_bruto': '10000.00',
    'total_descuentos': '1000.00',
    'total_neto': '9000.00',
    'total_iva': '1890.00',

    // Booleans
    'activo': 'true',

    // Arrays
    'imagenes_producto': '["https://example.com/img1.jpg"]',
    'imagenes_etiqueta': '["https://example.com/label1.jpg"]',
    'etiquetas_ocr': '["texto extraído"]',
  };

  return examples[fieldName] || '...';
}

/**
 * Metadata de un campo extraída dinámicamente desde el schema Zod
 */
export interface FieldMetadata {
  description: string;
  example: string;
  type: string;
  required: boolean;
}

/**
 * Obtiene metadata de un campo dinámicamente desde el schema Zod usando .describe()
 * Formato esperado: "Descripción del campo | Ejemplo: valor_ejemplo"
 */
export function getFieldMetadata(entityType: EntityType, fieldName: string): FieldMetadata {
  const entityConfig = ENTITY_SCHEMAS[entityType];

  if (!entityConfig) {
    return {
      description: `Campo ${fieldName}`,
      example: '',
      type: 'unknown',
      required: false
    };
  }

  const { schema, requiredFields } = entityConfig;
  const isRequired = (requiredFields as readonly string[]).includes(fieldName);

  try {
    // Acceder al schema del campo específico
    const fieldSchema = (schema as any).shape?.[fieldName];

    if (!fieldSchema) {
      // Si no existe en el schema, usar función legacy
      return {
        description: `Campo ${fieldName}`,
        example: getFieldExample(entityType, fieldName),
        type: getFieldType(entityType, fieldName),
        required: isRequired
      };
    }

    // Extraer descripción del campo
    let description = fieldSchema.description || '';
    let example = '';

    // Parsear formato "Descripción | Ejemplo: valor"
    if (description.includes(' | Ejemplo: ')) {
      const parts = description.split(' | Ejemplo: ');
      description = parts[0] || '';
      example = parts[1] || '';
    }

    // Inferir tipo desde el schema Zod
    const zodType = fieldSchema._def?.typeName || 'ZodUnknown';
    let type = 'unknown';

    if (zodType.includes('String')) type = 'string';
    else if (zodType.includes('Number')) type = 'number';
    else if (zodType.includes('Boolean')) type = 'boolean';
    else if (zodType.includes('Date')) type = 'string (ISO 8601)';
    else if (zodType.includes('Array')) type = 'array';
    else if (zodType.includes('Object') || zodType.includes('Record')) type = 'object';

    return {
      description,
      example,
      type,
      required: isRequired
    };
  } catch (error) {
    // Fallback a función legacy si hay error
    return {
      description: `Campo ${fieldName}`,
      example: getFieldExample(entityType, fieldName),
      type: getFieldType(entityType, fieldName),
      required: isRequired
    };
  }
}
