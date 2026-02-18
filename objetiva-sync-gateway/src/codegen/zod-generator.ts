/**
 * Zod schema generator with metadata
 *
 * Generates per-entity Zod validation schemas with EntityMetadata that enables
 * dynamic field operations. Metadata includes keyFields, systemFields, and validations.
 *
 * Generated schemas go to shared/schemas/generated/{entity}.schema.ts
 *
 * PostgreSQL comment format for business rules:
 * COMMENT ON COLUMN table.field IS 'Description | {"validation": "positive", "example": "123"}';
 */

import type { SchemaResponse } from './types.js';
import type { ColumnMetadata, ConstraintMetadata } from '../types/schema.js';

/**
 * Validation rule parsed from PostgreSQL column comment
 */
interface ParsedValidation {
  description?: string;
  validation?: 'positive' | 'nonnegative' | 'int' | 'email' | 'url';
  example?: string;
  minLength?: number;
  maxLength?: number;
}

/**
 * Parse PostgreSQL column comment to extract description and validation rules
 * Format: "Description text | {\"validation\": \"positive\"}"
 */
function parseColumnComment(comment: string | null): ParsedValidation {
  if (!comment) return {};

  const pipeIndex = comment.indexOf('|');
  if (pipeIndex === -1) {
    // No JSON part, just description
    return { description: comment.trim() };
  }

  const description = comment.substring(0, pipeIndex).trim();
  const jsonPart = comment.substring(pipeIndex + 1).trim();

  try {
    const parsed = JSON.parse(jsonPart);
    return {
      description: description || undefined,
      validation: parsed.validation,
      example: parsed.example,
      minLength: parsed.minLength,
      maxLength: parsed.maxLength,
    };
  } catch {
    // Invalid JSON, treat whole thing as description
    return { description: comment.trim() };
  }
}

/**
 * Map PostgreSQL normalized type to Zod validator string
 */
function mapToZodType(col: ColumnMetadata): string {
  const normalizedType = col.data_type.toLowerCase();

  switch (normalizedType) {
    case 'text':
    case 'varchar':
    case 'char':
      return 'z.string()';

    case 'int':
    case 'integer':
    case 'bigint':
      // Use transform to truncate floats from SQL Server to integers
      return 'z.coerce.number().transform(n => Math.trunc(n))';

    case 'float':
    case 'real':
    case 'double precision':
      return 'z.coerce.number()';

    case 'decimal':
    case 'numeric':
      return 'z.coerce.number()';

    case 'boolean':
      return 'z.boolean()';

    case 'timestamp':
    case 'timestamp with time zone':
    case 'timestamp without time zone':
    case 'timestamptz':
    case 'date':
    case 'time':
      return 'z.coerce.date()';

    case 'jsonb':
    case 'json':
      return 'z.record(z.unknown())';

    case 'uuid':
      return 'z.string().uuid()';

    case 'array':
      return 'z.array(z.string())';

    default:
      return 'z.string()';
  }
}

/**
 * System-managed columns (immutable names)
 * These are automatically set by the gateway
 */
const SYSTEM_FIELDS = ['erp_sincronizado', 'erp_fecha_sync', 'actualizado', 'creado'] as const;

/**
 * Auto-managed columns to skip entirely in payload schema
 */
const SKIP_COLUMNS = ['id', 'created_at', 'updated_at'];

/**
 * Check if a column should be skipped in the generated schema
 */
function shouldSkipColumn(col: ColumnMetadata): boolean {
  return SKIP_COLUMNS.includes(col.column_name);
}

/**
 * Check if a column is a system-managed field
 */
function isSystemField(columnName: string): boolean {
  return (SYSTEM_FIELDS as readonly string[]).includes(columnName);
}

/**
 * Convert snake_case to PascalCase
 */
function toPascalCase(snakeCase: string): string {
  return snakeCase
    .split(/[_-]/)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join('');
}

/**
 * Convert snake_case to camelCase
 */
function toCamelCase(snakeCase: string): string {
  const pascal = toPascalCase(snakeCase);
  return pascal.charAt(0).toLowerCase() + pascal.slice(1);
}

/**
 * Get primary key columns from constraints
 */
function getPrimaryKeyColumns(constraints: ConstraintMetadata[]): Set<string> {
  const pkColumns = new Set<string>();

  for (const constraint of constraints) {
    if (constraint.constraint_type === 'PRIMARY KEY') {
      for (const col of constraint.columns) {
        pkColumns.add(col);
      }
    }
  }

  return pkColumns;
}

/**
 * Get unique constraint columns from constraints
 */
function getUniqueColumns(constraints: ConstraintMetadata[]): Set<string> {
  const uniqueColumns = new Set<string>();

  for (const constraint of constraints) {
    if (constraint.constraint_type === 'UNIQUE') {
      // Only consider single-column unique constraints as potential key fields
      if (constraint.columns.length === 1) {
        uniqueColumns.add(constraint.columns[0]);
      }
    }
  }

  return uniqueColumns;
}

/**
 * Identify key fields from schema
 * Key fields are: PRIMARY KEY columns (excluding 'id') OR UNIQUE columns
 * that identify a unique record for upsert operations.
 *
 * Priority:
 * 1. PRIMARY KEY columns (excluding 'id')
 * 2. If no PK columns, use UNIQUE columns
 * 3. If no UNIQUE columns, use first NOT NULL text field starting with 'erp_' prefix
 */
function identifyKeyFields(schema: SchemaResponse): string[] {
  const pkColumns = getPrimaryKeyColumns(schema.constraints);
  const uniqueColumns = getUniqueColumns(schema.constraints);
  const keyFields: string[] = [];

  // First pass: look for PRIMARY KEY columns (excluding id)
  for (const col of schema.columns) {
    if (col.column_name === 'id' || isSystemField(col.column_name)) {
      continue;
    }
    if (pkColumns.has(col.column_name)) {
      keyFields.push(col.column_name);
    }
  }

  // If we found PK columns, return them
  if (keyFields.length > 0) {
    return keyFields;
  }

  // Second pass: look for UNIQUE columns
  for (const col of schema.columns) {
    if (col.column_name === 'id' || isSystemField(col.column_name)) {
      continue;
    }
    if (uniqueColumns.has(col.column_name)) {
      keyFields.push(col.column_name);
    }
  }

  // If we found UNIQUE columns, return them
  if (keyFields.length > 0) {
    return keyFields;
  }

  // Fallback: look for first NOT NULL text field with erp_ prefix
  for (const col of schema.columns) {
    if (col.column_name === 'id' || isSystemField(col.column_name)) {
      continue;
    }
    const isTextField = ['text', 'varchar', 'char'].includes(col.data_type.toLowerCase());
    const isRequired = !col.is_nullable && !col.default_value;
    const isErpField = col.column_name.startsWith('erp_');

    if (isTextField && isRequired && isErpField) {
      keyFields.push(col.column_name);
      break; // Only take the first one
    }
  }

  return keyFields;
}

/**
 * Generate a Zod field line with type, nullability, and business validations
 */
function generateZodField(col: ColumnMetadata): { line: string; validation: ParsedValidation | null } {
  const zodType = mapToZodType(col);
  const parsed = parseColumnComment(col.column_comment || null);
  let fieldLine = `  ${col.column_name}: ${zodType}`;

  // Add business validations from column comment
  if (parsed.validation) {
    switch (parsed.validation) {
      case 'positive':
        fieldLine += '.positive()';
        break;
      case 'nonnegative':
        fieldLine += '.nonnegative()';
        break;
      case 'int':
        // Already added in mapToZodType for integer types, but add for decimals
        if (!zodType.includes('.int()')) {
          fieldLine += '.int()';
        }
        break;
      case 'email':
        fieldLine += '.email()';
        break;
      case 'url':
        fieldLine += '.url()';
        break;
    }
  }

  // Add length constraints
  if (parsed.minLength !== undefined) {
    fieldLine += `.min(${parsed.minLength})`;
  }
  if (parsed.maxLength !== undefined) {
    fieldLine += `.max(${parsed.maxLength})`;
  }

  // Handle nullability and defaults
  if (isSystemField(col.column_name)) {
    // System fields are optional in input (set by gateway)
    fieldLine += '.optional()';
  } else if (col.is_nullable) {
    fieldLine += '.nullable().optional()';
  } else if (col.default_value) {
    fieldLine += '.optional()';
  } else {
    // Required NOT NULL string fields get .min(1) to prevent empty strings
    const normalizedType = col.data_type.toLowerCase();
    if (['text', 'varchar', 'char'].includes(normalizedType) && !parsed.minLength) {
      fieldLine += ".min(1, 'Campo requerido')";
    }
  }

  // Add description if present
  if (parsed.description) {
    fieldLine += `.describe('${parsed.description.replace(/'/g, "\\'")}')`;
  }

  const hasValidation = parsed.validation || parsed.minLength !== undefined || parsed.maxLength !== undefined || parsed.example;

  return {
    line: fieldLine + ',',
    validation: hasValidation ? parsed : null,
  };
}

/**
 * Generate complete Zod schema file content for a single entity
 * Includes EntityMetadata export for dynamic field operations
 *
 * @param schema - Schema response for the entity
 * @returns Complete TypeScript file content with Zod schema and metadata
 */
export function generateZodSchema(schema: SchemaResponse): string {
  const tableName = schema.entity; // e.g., 'articulos'
  const entityName = tableName.replace(/s$/, ''); // e.g., 'articulo' (singular)
  const schemaName = toPascalCase(entityName);
  const timestamp = new Date().toISOString();

  // Identify key fields
  const keyFields = identifyKeyFields(schema);

  // Collect validations
  const validations: Record<string, ParsedValidation> = {};

  // Start building file content
  let content = '';

  // Add header comment
  content += '// Auto-generated from PostgreSQL schema introspection\n';
  content += '// DO NOT EDIT - regenerate with: npm run regenerate-schemas\n';
  content += `// Generated: ${timestamp}\n`;
  content += `// Table: ${tableName}\n\n`;

  // Add imports
  content += "import { z } from 'zod';\n";
  content += "import type { EntityMetadata, TableSchemaMetadata } from '../../types/schema-metadata.js';\n\n";

  // Add schema documentation
  content += '/**\n';
  content += ` * Zod schema for ${entityName} entity\n`;
  content += ` * Reflects PostgreSQL structure with business validations from column comments.\n`;
  content += ' */\n';

  // Start schema definition
  content += `export const ${toCamelCase(entityName)}Schema = z.object({\n`;

  // Add fields
  const fieldLines: string[] = [];
  for (const col of schema.columns) {
    if (shouldSkipColumn(col)) continue;

    const { line, validation } = generateZodField(col);
    fieldLines.push(line);

    if (validation) {
      validations[col.column_name] = validation;
    }
  }

  content += fieldLines.join('\n');
  content += '\n});\n\n';

  // Export inferred type
  content += `export type ${schemaName}Input = z.infer<typeof ${toCamelCase(entityName)}Schema>;\n\n`;

  // Generate metadata export
  content += '/**\n';
  content += ` * Metadata for ${entityName} entity\n`;
  content += ' * Used for dynamic field operations in ingestion and validation.\n';
  content += ' */\n';

  const keyFieldsArray = keyFields.map((f) => `'${f}'`).join(', ');
  const validationsJson = JSON.stringify(validations, null, 2)
    .split('\n')
    .map((line, i) => (i === 0 ? line : '  ' + line))
    .join('\n');

  content += `export const ${toCamelCase(entityName)}Metadata: EntityMetadata<readonly [${keyFieldsArray}]> = {\n`;
  content += `  entity: '${entityName}',\n`;
  content += `  tableName: '${tableName}',\n`;
  content += `  keyFields: [${keyFieldsArray}] as const,\n`;
  content += `  systemFields: ['erp_sincronizado', 'erp_fecha_sync', 'actualizado', 'creado'] as const,\n`;
  content += `  validations: ${validationsJson},\n`;
  content += '};\n\n';

  // Generate table schema metadata (columns + constraints)
  // This is used by query-validator to validate SQL query results
  content += '/**\n';
  content += ` * Table schema metadata for ${entityName} entity\n`;
  content += ' * Contains column definitions and constraints from PostgreSQL.\n';
  content += ' * Used for query validation and dynamic field detection.\n';
  content += ' */\n';

  const columnsJson = JSON.stringify(schema.columns, null, 2)
    .split('\n')
    .map((line, i) => (i === 0 ? line : '  ' + line))
    .join('\n');

  const constraintsJson = JSON.stringify(schema.constraints, null, 2)
    .split('\n')
    .map((line, i) => (i === 0 ? line : '  ' + line))
    .join('\n');

  content += `export const ${toCamelCase(entityName)}TableSchema: TableSchemaMetadata = {\n`;
  content += `  entity: '${tableName}',\n`;
  content += `  columns: ${columnsJson},\n`;
  content += `  constraints: ${constraintsJson},\n`;
  content += '};\n';

  return content;
}
