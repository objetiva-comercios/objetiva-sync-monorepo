/**
 * Schema-driven query validator
 *
 * Validates query results against live PostgreSQL schemas from the gateway.
 * Provides detailed field-level validation with "Did you mean?" suggestions.
 *
 * This complements (not replaces) the existing query-validator.ts which uses
 * static Zod schemas for business validation.
 */

import { closest, distance } from 'fastest-levenshtein';
import type { SchemaResponse } from '../types/schema.js';
import { schemaCache } from '../services/schema-cache.js';
import { logger } from '../utils/logger.js';

/**
 * Validation error types
 */
export type ValidationErrorType = 'MISSING_REQUIRED' | 'UNEXPECTED_FIELD' | 'TYPE_MISMATCH';

/**
 * Field-level validation error with optional suggestion
 */
export interface ValidationError {
  /** Field name that failed validation */
  field: string;

  /** Type of validation error */
  type: ValidationErrorType;

  /** Human-readable error message */
  message: string;

  /** Optional "Did you mean?" suggestion for typos */
  suggestion?: string;

  /** Expected PostgreSQL type (for TYPE_MISMATCH) */
  expectedType?: string;

  /** Actual JavaScript type received (for TYPE_MISMATCH) */
  actualType?: string;
}

/**
 * Overall validation result
 */
export interface ValidationResult {
  /** Whether validation passed (no errors) */
  isValid: boolean;

  /** List of validation errors (empty if valid) */
  errors: ValidationError[];

  /** Non-blocking warnings (e.g., empty rows, schema unavailable) */
  warnings: string[];

  /** True if schema was unavailable from gateway */
  schemaUnavailable: boolean;
}

/**
 * Get required fields from schema
 *
 * Returns columns that are NOT NULL and have no default value.
 * These are truly required fields that must be present in query results.
 *
 * @param schema - Schema metadata from gateway
 * @returns Array of required field names
 */
function getRequiredFields(schema: SchemaResponse): string[] {
  return schema.columns
    .filter(col => !col.is_nullable && col.default_value === null)
    .map(col => col.column_name);
}

/**
 * Normalize PostgreSQL data type to JavaScript type
 *
 * Maps PostgreSQL types to expected JavaScript runtime types for validation.
 *
 * @param dataType - PostgreSQL data type (e.g., 'character varying', 'integer')
 * @returns Normalized JavaScript type
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
    return 'string';
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
 * Detect JavaScript type of a value
 *
 * @param value - Value to check
 * @returns JavaScript type as string
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
 * Check if JavaScript type is compatible with PostgreSQL type
 *
 * Uses lenient compatibility rules since data may be stringified
 * or coerced during query execution.
 *
 * @param jsType - JavaScript type from detectJsType
 * @param pgType - PostgreSQL type from normalizePostgresType
 * @returns True if types are compatible
 */
function isTypeCompatible(jsType: string, pgType: string): boolean {
  // Null is compatible with everything (nullable fields)
  if (jsType === 'null') {
    return true;
  }

  // Exact match
  if (jsType === pgType) {
    return true;
  }

  // String is compatible with number (could be stringified)
  if (jsType === 'string' && pgType === 'number') {
    return true;
  }

  // Number is compatible with string (auto-coercion)
  if (jsType === 'number' && pgType === 'string') {
    return true;
  }

  // Object is compatible with jsonb
  if (jsType === 'object' && pgType === 'object') {
    return true;
  }

  return false;
}

/**
 * Find suggested field name for a typo
 *
 * Uses Levenshtein distance to find closest matching valid field name.
 * Only suggests if the distance is small enough to likely be a typo.
 *
 * @param fieldName - Field name with potential typo
 * @param validFields - List of valid field names from schema
 * @returns Suggested field name, or undefined if no good match
 */
function findSuggestion(fieldName: string, validFields: string[]): string | undefined {
  if (validFields.length === 0) {
    return undefined;
  }

  const closestMatch = closest(fieldName, validFields);
  const editDistance = distance(fieldName, closestMatch);

  // Only suggest if distance is reasonable (catches typos, not unrelated words)
  if (editDistance > 3) {
    return undefined;
  }

  // Check length ratio to avoid suggesting unrelated short/long words
  const lengthRatio = fieldName.length / closestMatch.length;
  if (lengthRatio < 0.5 || lengthRatio > 2.0) {
    return undefined;
  }

  return closestMatch;
}

/**
 * Validate query results against PostgreSQL schema
 *
 * Checks that query results match the expected schema structure:
 * - Required fields are present
 * - No unexpected fields
 * - Field types match expectations
 *
 * Returns validation results with detailed errors and suggestions.
 *
 * **Special cases:**
 * - Empty rows: Returns valid with warning (filtered queries may return 0 rows)
 * - Schema unavailable: Returns valid with warning (graceful degradation)
 *
 * @param rows - Query result rows to validate
 * @param entity - Entity name (e.g., 'articulos', 'comprobantes_cabecera')
 * @returns Validation result with errors, warnings, and suggestions
 */
export async function validateQueryAgainstSchema(
  rows: Record<string, unknown>[],
  entity: string
): Promise<ValidationResult> {
  // Try to get schema from cache
  const schema = await schemaCache.getSchema(entity);

  // Schema unavailable - graceful degradation
  if (!schema) {
    logger.warn({ entity }, 'Schema unavailable for validation - skipping');
    return {
      isValid: true,
      errors: [],
      warnings: ['Schema unavailable, validation skipped'],
      schemaUnavailable: true,
    };
  }

  // Empty rows - warning, not error (filtered queries may legitimately return 0 rows)
  if (rows.length === 0) {
    logger.debug({ entity }, 'Query returned no rows - validation skipped');
    return {
      isValid: true,
      errors: [],
      warnings: [
        'Query returned no rows - validation skipped. This may be expected for filtered queries.',
      ],
      schemaUnavailable: false,
    };
  }

  // Use first row as sample for validation
  const firstRow = rows[0]!;
  const errors: ValidationError[] = [];
  const validFields = schema.columns.map(col => col.column_name);
  const requiredFields = getRequiredFields(schema);

  // 1. Check for missing required fields
  for (const requiredField of requiredFields) {
    if (!(requiredField in firstRow)) {
      const suggestion = findSuggestion(requiredField, Object.keys(firstRow));
      errors.push({
        field: requiredField,
        type: 'MISSING_REQUIRED',
        message: `Required field '${requiredField}' is missing from query results`,
        suggestion: suggestion ? `Did you mean '${suggestion}'?` : undefined,
      });
    }
  }

  // 2. Check for unexpected fields
  for (const fieldName of Object.keys(firstRow)) {
    if (!validFields.includes(fieldName)) {
      const suggestion = findSuggestion(fieldName, validFields);
      errors.push({
        field: fieldName,
        type: 'UNEXPECTED_FIELD',
        message: `Field '${fieldName}' is not in the schema for entity '${entity}'`,
        suggestion: suggestion ? `Did you mean '${suggestion}'?` : undefined,
      });
    }
  }

  // 3. Check for type mismatches
  for (const fieldName of Object.keys(firstRow)) {
    const column = schema.columns.find(col => col.column_name === fieldName);

    if (column) {
      const value = firstRow[fieldName];
      const actualType = detectJsType(value);
      const expectedType = normalizePostgresType(column.data_type);

      // Skip null values (they're handled by nullable check)
      if (actualType !== 'null' && !isTypeCompatible(actualType, expectedType)) {
        errors.push({
          field: fieldName,
          type: 'TYPE_MISMATCH',
          message: `Field '${fieldName}' has type '${actualType}' but schema expects '${expectedType}'`,
          expectedType: expectedType,
          actualType: actualType,
        });
      }
    }
  }

  // Log validation result
  if (errors.length > 0) {
    logger.warn({ entity, errorCount: errors.length }, 'Schema validation found errors');
  } else {
    logger.debug({ entity }, 'Schema validation passed');
  }

  return {
    isValid: errors.length === 0,
    errors,
    warnings: [],
    schemaUnavailable: false,
  };
}
