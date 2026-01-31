/**
 * Schema testing utilities
 *
 * Provides functions to parse and verify Prisma schema files and Zod schema files.
 * Used in integration tests to validate schema synchronization.
 */

import { readFileSync } from 'fs';
import { join } from 'path';

/**
 * Get the absolute path to the gateway directory
 */
function getGatewayDir(): string {
  // From objetiva-sync/tests/helpers -> ../../objetiva-sync-gateway
  return join(__dirname, '..', '..', '..', 'objetiva-sync-gateway');
}

/**
 * Get the absolute path to the sync directory
 */
function getSyncDir(): string {
  // From objetiva-sync/tests/helpers -> ../..
  return join(__dirname, '..', '..');
}

/**
 * Parse Prisma schema file and extract field names for a specific model
 *
 * @param modelName - Name of the Prisma model (e.g., 'articulo', 'comprobantes_cabecera')
 * @returns Array of field names from the model
 */
export function getPrismaModelFields(modelName: string): string[] {
  const schemaPath = join(getGatewayDir(), 'prisma', 'schema.prisma');

  try {
    const schemaContent = readFileSync(schemaPath, 'utf-8');

    // Find the model block - need to handle nested braces properly
    const modelStart = schemaContent.indexOf(`model ${modelName} {`);
    if (modelStart === -1) {
      throw new Error(`Model '${modelName}' not found in schema.prisma`);
    }

    // Find matching closing brace by counting braces
    let braceCount = 0;
    let modelEnd = -1;
    for (let i = modelStart; i < schemaContent.length; i++) {
      if (schemaContent[i] === '{') braceCount++;
      if (schemaContent[i] === '}') {
        braceCount--;
        if (braceCount === 0) {
          modelEnd = i;
          break;
        }
      }
    }

    if (modelEnd === -1) {
      throw new Error(`Could not find end of model '${modelName}'`);
    }

    const modelContent = schemaContent.substring(
      modelStart + `model ${modelName} {`.length,
      modelEnd
    );

    // Extract field names (lines that start with field name followed by type)
    // Format: fieldName Type [attributes]
    // Skip lines starting with @@ (model attributes like @@index, @@map)
    const lines = modelContent.split('\n');
    const fields: string[] = [];

    for (const line of lines) {
      const trimmed = line.trim();

      // Skip empty lines, comments, and model-level attributes
      if (!trimmed || trimmed.startsWith('//') || trimmed.startsWith('@@')) {
        continue;
      }

      // Match field definition: fieldName Type [modifiers] [attributes]
      // Field names must start with lowercase or be valid identifiers
      const fieldMatch = trimmed.match(/^(\w+)\s+(\w+)/);
      if (fieldMatch) {
        fields.push(fieldMatch[1]);
      }
    }

    return fields;
  } catch (error) {
    if (error instanceof Error && 'code' in error && error.code === 'ENOENT') {
      throw new Error(`Prisma schema file not found at ${schemaPath}`);
    }
    throw error;
  }
}

/**
 * Parse Zod schema TypeScript file and extract field names
 *
 * @param schemaPath - Relative path to Zod schema file from src/types
 * @returns Array of field names from the Zod schema
 */
export function getZodSchemaFields(schemaPath: string): string[] {
  const fullPath = join(getSyncDir(), 'src', 'types', schemaPath);

  try {
    const schemaContent = readFileSync(fullPath, 'utf-8');

    // Find z.object({ ... }) - need to handle nested braces
    const objectStart = schemaContent.indexOf('z.object({');
    if (objectStart === -1) {
      throw new Error(`No Zod object schema found in ${schemaPath}`);
    }

    // Find matching closing braces by counting
    let braceCount = 0;
    let parenCount = 0;
    let objectEnd = -1;
    let insideObject = false;

    for (let i = objectStart; i < schemaContent.length; i++) {
      if (schemaContent[i] === '(') parenCount++;
      if (schemaContent[i] === ')') {
        parenCount--;
        if (parenCount === 0 && insideObject) {
          objectEnd = i;
          break;
        }
      }
      if (schemaContent[i] === '{') {
        braceCount++;
        insideObject = true;
      }
      if (schemaContent[i] === '}') {
        braceCount--;
      }
    }

    if (objectEnd === -1) {
      throw new Error(`Could not find end of z.object in ${schemaPath}`);
    }

    const schemaBlock = schemaContent.substring(objectStart, objectEnd + 1);

    // Extract field names: fieldName: z.something
    const fieldRegex = /(\w+)\s*:\s*z\./g;
    const fields: string[] = [];
    let match;

    while ((match = fieldRegex.exec(schemaBlock)) !== null) {
      fields.push(match[1]);
    }

    return fields;
  } catch (error) {
    if (error instanceof Error && 'code' in error && error.code === 'ENOENT') {
      throw new Error(`Zod schema file not found at ${fullPath}`);
    }
    throw error;
  }
}

/**
 * Get field names from any schema file (auto-detect Prisma or Zod)
 *
 * @param schemaPath - Path to schema file
 * @returns Array of field names
 */
export function getSchemaFields(schemaPath: string): string[] {
  if (schemaPath.endsWith('.prisma')) {
    // For Prisma files, we need to extract model name from path or parameter
    throw new Error('Use getPrismaModelFields() for Prisma schemas');
  } else if (schemaPath.endsWith('.ts')) {
    return getZodSchemaFields(schemaPath);
  } else {
    throw new Error(`Unsupported schema file type: ${schemaPath}`);
  }
}

/**
 * Verify that a schema file contains expected fields
 *
 * @param schemaPath - Path to schema file (Prisma or Zod)
 * @param expectedFields - Array of field names that should be present
 * @param modelName - For Prisma files, the model name to check
 * @returns True if all expected fields are present
 */
export function verifySchemaFile(
  schemaPath: string,
  expectedFields: string[],
  modelName?: string
): boolean {
  let actualFields: string[];

  if (schemaPath.endsWith('.prisma')) {
    if (!modelName) {
      throw new Error('modelName is required for Prisma schema verification');
    }
    actualFields = getPrismaModelFields(modelName);
  } else {
    actualFields = getZodSchemaFields(schemaPath);
  }

  // Check if all expected fields are present
  return expectedFields.every(field => actualFields.includes(field));
}

/**
 * Check if a specific field exists in a schema
 *
 * @param schemaPath - Path to schema file
 * @param fieldName - Field name to check
 * @param modelName - For Prisma files, the model name to check
 * @returns True if field exists
 */
export function hasField(
  schemaPath: string,
  fieldName: string,
  modelName?: string
): boolean {
  return verifySchemaFile(schemaPath, [fieldName], modelName);
}
