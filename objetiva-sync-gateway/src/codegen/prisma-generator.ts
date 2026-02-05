/**
 * Prisma schema generator
 *
 * Transforms PostgreSQL schema metadata into complete schema.prisma model definitions.
 * Handles BigInt detection, @db.* annotations, @map column mappings, relation directives,
 * @@map table mappings, @@unique constraints, and @@index directives.
 */

import { readFileSync } from 'fs';
import type { SchemaResponse, PrismaFieldConfig } from './types.js';
import type { ColumnMetadata } from '../types/schema.js';

/**
 * Information extracted from existing schema.prisma file
 */
interface ExistingSchemaInfo {
  /** Header content (generator + datasource blocks) to preserve */
  header: string;

  /** Map of table -> column_name -> prisma_field_name for @map directives */
  fieldMaps: Map<string, Map<string, string>>;

  /** Map of table -> relation field configurations */
  relations: Map<string, RelationInfo[]>;

  /** Map of table -> index configurations */
  indexes: Map<string, string[]>;
}

interface RelationInfo {
  fieldName: string;
  type: string;
  isArray: boolean;
  relationDirective?: string;
}

/**
 * Map entity names to Prisma model names
 */
const MODEL_NAME_MAP: Record<string, string> = {
  articulos: 'Articulo',
  comprobantes_cabecera: 'ComprobanteCabecera',
  comprobantes_detalle: 'ComprobanteDetalle',
  comprobantes_pagos: 'ComprobantePagos',
};

/**
 * Known decimal column precision/scale from existing schema
 */
const COLUMN_PRECISION_MAP: Record<string, { precision: number; scale: number }> = {
  // articulos
  'articulos.precio': { precision: 10, scale: 2 },
  'articulos.costo': { precision: 10, scale: 2 },

  // comprobantes_cabecera
  'comprobantes_cabecera.total_bruto': { precision: 12, scale: 2 },
  'comprobantes_cabecera.total_descuentos': { precision: 12, scale: 2 },
  'comprobantes_cabecera.total_neto': { precision: 12, scale: 2 },
  'comprobantes_cabecera.total_iva': { precision: 12, scale: 2 },
  'comprobantes_cabecera.total_venta': { precision: 12, scale: 2 },
  'comprobantes_cabecera.total_intereses_financieros': { precision: 12, scale: 2 },
  'comprobantes_cabecera.total_cobrado': { precision: 12, scale: 2 },

  // comprobantes_detalle
  'comprobantes_detalle.unidades': { precision: 10, scale: 3 },
  'comprobantes_detalle.precio_unitario': { precision: 12, scale: 4 },
  'comprobantes_detalle.importe_bruto': { precision: 12, scale: 2 },
  'comprobantes_detalle.porc_descuento': { precision: 5, scale: 2 },
  'comprobantes_detalle.importe_descuento': { precision: 12, scale: 2 },
  'comprobantes_detalle.importe_neto': { precision: 12, scale: 2 },
  'comprobantes_detalle.alicuota_iva': { precision: 5, scale: 2 },
  'comprobantes_detalle.importe_iva': { precision: 12, scale: 2 },
  'comprobantes_detalle.importe_total': { precision: 12, scale: 2 },

  // comprobantes_pagos
  'comprobantes_pagos.monto': { precision: 12, scale: 2 },
  'comprobantes_pagos.tarjeta_recargo': { precision: 12, scale: 2 },
};

/**
 * Parse existing schema.prisma to extract current annotations and structure
 */
export function parseExistingSchema(content: string): ExistingSchemaInfo {
  const lines = content.split('\n');
  const fieldMaps = new Map<string, Map<string, string>>();
  const relations = new Map<string, RelationInfo[]>();
  const indexes = new Map<string, string[]>();

  // Extract header (everything before first "model")
  const firstModelIndex = lines.findIndex((line) => line.trim().startsWith('model '));
  const header = lines.slice(0, firstModelIndex).join('\n');

  // Parse each model block
  let currentTable: string | null = null;
  let currentModel: string | null = null;
  let inModelBlock = false;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();

    // Detect model start
    if (line.startsWith('model ')) {
      inModelBlock = true;
      currentModel = line.split(' ')[1];
      // Find @@map directive for this model to get table name
      for (let j = i; j < lines.length && lines[j].trim() !== '}'; j++) {
        const mapMatch = lines[j].match(/@@map\("([^"]+)"\)/);
        if (mapMatch) {
          currentTable = mapMatch[1];
          break;
        }
      }
      if (!currentTable) {
        currentTable = currentModel.toLowerCase();
      }
      continue;
    }

    if (line === '}') {
      inModelBlock = false;
      currentTable = null;
      currentModel = null;
      continue;
    }

    if (!inModelBlock || !currentTable || !currentModel) continue;

    // Extract @map directives for fields
    const mapMatch = line.match(/^(\w+)\s+.*@map\("([^"]+)"\)/);
    if (mapMatch) {
      const [, prismaField, dbColumn] = mapMatch;
      if (!fieldMaps.has(currentTable)) {
        fieldMaps.set(currentTable, new Map());
      }
      fieldMaps.get(currentTable)!.set(dbColumn, prismaField);
    }

    // Extract relation fields
    const relationMatch = line.match(/^(\w+)\s+(\w+)(\[\])?\s*(@relation.*)?$/);
    if (relationMatch && !line.includes('@map')) {
      const [, fieldName, typeName, isArray, directive] = relationMatch;
      // Check if this is a relation type (capitalized model name, not a scalar type)
      if (typeName[0] === typeName[0].toUpperCase() && typeName !== 'String' && typeName !== 'Int' && typeName !== 'BigInt' && typeName !== 'Boolean' && typeName !== 'DateTime' && typeName !== 'Decimal' && typeName !== 'Json') {
        if (!relations.has(currentTable)) {
          relations.set(currentTable, []);
        }
        relations.get(currentTable)!.push({
          fieldName,
          type: typeName,
          isArray: !!isArray,
          relationDirective: directive?.trim(),
        });
      }
    }

    // Extract @@index directives
    if (line.startsWith('@@index')) {
      if (!indexes.has(currentTable)) {
        indexes.set(currentTable, []);
      }
      indexes.get(currentTable)!.push(line);
    }
  }

  return {
    header,
    fieldMaps,
    relations,
    indexes,
  };
}

/**
 * Detect if a column should be BigInt based on column name pattern
 */
function isBigIntColumn(columnName: string): boolean {
  // id column is autoincrement BigInt
  if (columnName === 'id') return true;

  // FK columns ending with _id are BigInt
  if (columnName.endsWith('_id')) return true;

  return false;
}

/**
 * Map PostgreSQL column to Prisma type with @db annotation
 */
export function mapToPrismaType(col: ColumnMetadata, tableName: string): PrismaFieldConfig {
  const normalizedType = col.data_type.toLowerCase();

  // Handle int/bigint detection
  if (normalizedType === 'int' || normalizedType === 'integer' || normalizedType === 'bigint') {
    if (isBigIntColumn(col.column_name)) {
      return { prismaType: 'BigInt', dbAnnotation: undefined };
    }
    return { prismaType: 'Int', dbAnnotation: undefined };
  }

  // Handle other types
  switch (normalizedType) {
    case 'text':
    case 'varchar':
    case 'char':
      return { prismaType: 'String', dbAnnotation: '@db.Text' };

    case 'decimal':
    case 'numeric': {
      const key = `${tableName}.${col.column_name}`;
      const precision = COLUMN_PRECISION_MAP[key] || { precision: 10, scale: 2 };
      return {
        prismaType: 'Decimal',
        dbAnnotation: `@db.Decimal(${precision.precision}, ${precision.scale})`,
      };
    }

    case 'boolean':
      return { prismaType: 'Boolean', dbAnnotation: undefined };

    case 'timestamp':
    case 'timestamp with time zone':
    case 'timestamp without time zone':
    case 'timestamptz':
      return { prismaType: 'DateTime', dbAnnotation: '@db.Timestamp(6)' };

    case 'date':
      return { prismaType: 'DateTime', dbAnnotation: '@db.Date' };

    case 'jsonb':
      return { prismaType: 'Json', dbAnnotation: '@db.JsonB' };

    case 'uuid':
      return { prismaType: 'String', dbAnnotation: '@db.Uuid' };

    case 'array': {
      // Arrays in existing schema are text arrays
      return { prismaType: 'String[]', dbAnnotation: '@db.Text' };
    }

    default:
      // Fallback to String with Text annotation
      return { prismaType: 'String', dbAnnotation: '@db.Text' };
  }
}

/**
 * Generate a Prisma field line from column metadata
 */
function generatePrismaField(
  col: ColumnMetadata,
  tableName: string,
  existingMaps: Map<string, string>
): string {
  const { prismaType, dbAnnotation } = mapToPrismaType(col, tableName);

  // Determine field name (use @map if exists, otherwise use column name)
  const prismaFieldName = existingMaps.get(col.column_name) || col.column_name;
  const needsMap = existingMaps.has(col.column_name);

  // Build field line
  let fieldLine = `  ${prismaFieldName} ${prismaType}`;

  // Add nullability (but not for array types - Prisma doesn't support optional arrays)
  const isArrayType = prismaType.endsWith('[]');
  if (col.is_nullable && !isArrayType) {
    fieldLine += '?';
  }

  // Add @id and @default(autoincrement()) for id column
  if (col.column_name === 'id' && col.default_value?.includes('nextval')) {
    fieldLine += ' @id @default(autoincrement())';
  }
  // Add @default for other columns with defaults
  else if (col.default_value) {
    // Parse default value
    const defaultVal = col.default_value;

    if (defaultVal.includes('now()') || defaultVal.includes('CURRENT_TIMESTAMP')) {
      fieldLine += ' @default(now())';
      // Add @updatedAt for actualizado/updated_at fields
      if (col.column_name === 'actualizado' || col.column_name === 'updated_at') {
        fieldLine += ' @updatedAt';
      }
    } else if (defaultVal === 'true' || defaultVal === 'false') {
      fieldLine += ` @default(${defaultVal})`;
    } else if (defaultVal.match(/^-?\d+$/)) {
      fieldLine += ` @default(${defaultVal})`;
    } else if (defaultVal === "'{}'::jsonb" || defaultVal === '{}') {
      fieldLine += ' @default("{}")';
    } else if (defaultVal === "'[]'::text[]" || defaultVal === "ARRAY[]::text[]") {
      fieldLine += ' @default([])';
    } else if (defaultVal.startsWith("'") && defaultVal.endsWith("'::text")) {
      const value = defaultVal.slice(1, defaultVal.indexOf("'::"));
      fieldLine += ` @default("${value}")`;
    }
  }

  // Add @db annotation
  if (dbAnnotation) {
    fieldLine += ` ${dbAnnotation}`;
  }

  // Add @map if field name differs from column name
  if (needsMap) {
    fieldLine += ` @map("${col.column_name}")`;
  }

  return fieldLine;
}

/**
 * Generate a complete model block for an entity
 */
function generateModelBlock(schema: SchemaResponse, existing: ExistingSchemaInfo): string {
  const modelName = MODEL_NAME_MAP[schema.entity] || schema.entity;
  const tableName = schema.entity;

  const existingMaps = existing.fieldMaps.get(tableName) || new Map();
  const existingRelations = existing.relations.get(tableName) || [];
  const existingIndexes = existing.indexes.get(tableName) || [];

  let modelText = `model ${modelName} {\n`;

  // Generate scalar fields
  for (const col of schema.columns) {
    modelText += generatePrismaField(col, tableName, existingMaps) + '\n';
  }

  // Add relation fields from existing schema
  if (existingRelations.length > 0) {
    modelText += '\n  // Relaciones\n';
    for (const rel of existingRelations) {
      const arrayMarker = rel.isArray ? '[]' : '';
      let relLine = `  ${rel.fieldName} ${rel.type}${arrayMarker}`;
      if (rel.relationDirective) {
        relLine += ` ${rel.relationDirective}`;
      }
      modelText += relLine + '\n';
    }
  }

  // Add @@unique constraints from metadata (map column names to Prisma field names)
  const uniqueConstraints = schema.constraints.filter(c => c.constraint_type === 'UNIQUE');
  if (uniqueConstraints.length > 0) {
    // Build column-to-prisma-name mapping
    const colToPrismaName = new Map<string, string>();
    for (const col of schema.columns) {
      colToPrismaName.set(col.column_name, existingMaps.get(col.column_name) || col.column_name);
    }

    modelText += '\n';
    for (const constraint of uniqueConstraints) {
      // Validate all columns exist and map to Prisma field names
      const allColumnsExist = constraint.columns.every(c => colToPrismaName.has(c));
      if (!allColumnsExist) {
        const missing = constraint.columns.filter(c => !colToPrismaName.has(c));
        console.warn(`  ⚠ Skipping stale unique constraint for ${tableName}: ${constraint.constraint_name} (missing columns: ${missing.join(', ')})`);
        continue;
      }
      const fields = constraint.columns.map(c => colToPrismaName.get(c)!).join(', ');
      const name = constraint.constraint_name;
      modelText += `  @@unique([${fields}], name: "${name}")\n`;
    }
  }

  // Add @@index directives from existing schema (validate fields still exist)
  if (existingIndexes.length > 0) {
    // Build set of valid Prisma field names in this model
    const validFieldNames = new Set<string>();
    for (const col of schema.columns) {
      const prismaName = existingMaps.get(col.column_name) || col.column_name;
      validFieldNames.add(prismaName);
    }

    for (const indexLine of existingIndexes) {
      // Parse @@index([field1, field2], ...) to extract field names
      const fieldMatch = indexLine.match(/@@index\(\[([^\]]+)\]/);
      if (fieldMatch) {
        const fields = fieldMatch[1].split(',').map(f => f.trim());
        const allFieldsExist = fields.every(f => validFieldNames.has(f));
        if (!allFieldsExist) {
          const missing = fields.filter(f => !validFieldNames.has(f));
          console.warn(`  ⚠ Skipping stale index for ${tableName}: ${indexLine} (missing fields: ${missing.join(', ')})`);
          continue;
        }
      }
      modelText += `  ${indexLine}\n`;
    }
  }

  // Add @@map directive
  modelText += `  @@map("${tableName}")\n`;

  modelText += '}\n';

  return modelText;
}

/**
 * Generate complete schema.prisma content from schema metadata
 *
 * @param schemas - Array of schema responses from introspection
 * @param existingSchemaPath - Path to existing schema.prisma file
 * @returns Complete schema.prisma file content
 */
export function generatePrismaSchema(
  schemas: SchemaResponse[],
  existingSchemaPath = 'prisma/schema.prisma'
): string {
  // Read existing schema to extract structure
  const existingContent = readFileSync(existingSchemaPath, 'utf-8');
  const existing = parseExistingSchema(existingContent);

  // Start with preserved header
  let schemaContent = existing.header;

  // Ensure header ends with proper spacing
  if (!schemaContent.endsWith('\n\n')) {
    if (!schemaContent.endsWith('\n')) {
      schemaContent += '\n';
    }
    schemaContent += '\n';
  }

  // Generate model blocks
  for (const schema of schemas) {
    schemaContent += generateModelBlock(schema, existing) + '\n';
  }

  return schemaContent;
}
