/**
 * Zod schema generator
 *
 * Generates per-entity Zod validation schemas that reflect DATABASE structure only
 * (types + nullability). Does NOT include business logic (.min(), .positive(), etc.).
 * Generated schemas go to shared/schemas/generated/{entity}.generated.ts
 */

import type { SchemaResponse } from './types.js';
import type { ColumnMetadata } from '../types/schema.js';

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
      // Both Int and BigInt map to number().int() in Zod (JS numbers)
      return 'z.number().int()';

    case 'float':
    case 'real':
    case 'double precision':
      return 'z.number()';

    case 'decimal':
    case 'numeric':
      // Zod doesn't have Decimal type, use number
      return 'z.number()';

    case 'boolean':
      return 'z.boolean()';

    case 'timestamp':
    case 'timestamp with time zone':
    case 'timestamp without time zone':
    case 'timestamptz':
    case 'date':
    case 'time':
      // Use coerce.date() to handle string/Date input
      return 'z.coerce.date()';

    case 'jsonb':
    case 'json':
      // Use record(unknown) for type safety (not any)
      return 'z.record(z.unknown())';

    case 'uuid':
      return 'z.string().uuid()';

    case 'array':
      // All current arrays are text arrays
      return 'z.array(z.string())';

    default:
      // Default fallback to string
      return 'z.string()';
  }
}

/**
 * Check if a column should be skipped in the generated schema
 * Skip auto-managed columns: id, creado, actualizado, created_at, updated_at
 */
function shouldSkipColumn(col: ColumnMetadata): boolean {
  const skipColumns = ['id', 'creado', 'actualizado', 'created_at', 'updated_at'];
  return skipColumns.includes(col.column_name);
}

/**
 * Convert snake_case to PascalCase
 */
function toPascalCase(snakeCase: string): string {
  return snakeCase
    .split('_')
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join('');
}

/**
 * Generate a Zod field line with type and nullability
 */
function generateZodField(col: ColumnMetadata): string {
  const zodType = mapToZodType(col);
  let fieldLine = `  ${col.column_name}: ${zodType}`;

  // Handle nullability and defaults
  if (col.is_nullable) {
    // Nullable fields can be null or undefined
    fieldLine += '.nullable().optional()';
  } else if (col.default_value) {
    // Fields with defaults don't need to be provided in input
    fieldLine += '.optional()';
  }
  // else: required field (no modifier)

  return fieldLine + ',';
}

/**
 * Generate complete Zod schema file content for a single entity
 *
 * @param schema - Schema response for the entity
 * @returns Complete TypeScript file content with Zod schema
 */
export function generateZodSchema(schema: SchemaResponse): string {
  const entityName = schema.entity;
  const schemaName = toPascalCase(entityName);
  const timestamp = new Date().toISOString();

  // Start building file content
  let content = '';

  // Add header comment
  content += '// Auto-generated from PostgreSQL schema introspection\n';
  content += '// DO NOT EDIT - regenerate with: npm run regenerate-schemas\n';
  content += `// Generated: ${timestamp}\n\n`;

  // Add imports
  content += "import { z } from 'zod';\n\n";

  // Add schema documentation
  content += '/**\n';
  content += ` * Database-structure schema for ${entityName}\n`;
  content += ' * Reflects PostgreSQL column types and nullability only.\n';
  content += ` * For business validation rules, see shared/schemas/${entityName}.ts\n`;
  content += ' */\n';

  // Start schema definition
  content += `export const ${schemaName}DbSchema = z.object({\n`;

  // Add fields
  const fields = schema.columns
    .filter((col) => !shouldSkipColumn(col))
    .map((col) => generateZodField(col));

  content += fields.join('\n');
  content += '\n});\n\n';

  // Export inferred type
  content += `export type ${schemaName}DbInput = z.infer<typeof ${schemaName}DbSchema>;\n`;

  return content;
}
