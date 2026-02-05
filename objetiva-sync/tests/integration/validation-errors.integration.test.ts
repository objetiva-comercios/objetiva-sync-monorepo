/**
 * Integration tests for Validation Error Reporting (TEST-06)
 *
 * Tests that SchemaValidator produces properly formatted errors with:
 * - Field-level detail
 * - Error types (missing, extra, type mismatch)
 * - "Did you mean?" suggestions for typos
 * - Dashboard-compatible error format
 */

import { describe, it, expect, beforeAll, beforeEach, vi } from 'vitest';
import { loadEnv } from '../../src/config/env.js';
import { validateQueryAgainstSchema } from '../../src/sync/schema-validator.js';
import type { SchemaResponse, ColumnMetadata } from '../../src/types/schema.js';

// Mock the schema cache module
vi.mock('../../src/services/schema-cache.js', () => ({
  schemaCache: {
    getSchema: vi.fn(),
    invalidate: vi.fn(),
  },
}));

// Mock schema for testing (simplified articulos schema)
const mockSchema: SchemaResponse = {
  entity: 'articulos',
  columns: [
    {
      column_name: 'id',
      data_type: 'bigint',
      is_nullable: false,
      default_value: "nextval('articulos_id_seq'::regclass)",
    },
    {
      column_name: 'erp_codigo',
      data_type: 'character varying',
      is_nullable: false,
      default_value: null,
    },
    {
      column_name: 'erp_nombre',
      data_type: 'character varying',
      is_nullable: false,
      default_value: null,
    },
    {
      column_name: 'nombre',
      data_type: 'text',
      is_nullable: true,
      default_value: null,
    },
    {
      column_name: 'precio',
      data_type: 'numeric',
      is_nullable: true,
      default_value: null,
    },
    {
      column_name: 'sku',
      data_type: 'character varying',
      is_nullable: true,
      default_value: null,
    },
  ] as ColumnMetadata[],
  constraints: [],
};

describe('Validation Error Reporting Tests', () => {
  beforeAll(() => {
    // Load environment configuration
    loadEnv();
  });

  beforeEach(async () => {
    // Import the mocked schema cache and configure mock for each test
    const { schemaCache } = await import('../../src/services/schema-cache.js');
    vi.mocked(schemaCache.getSchema).mockResolvedValue(mockSchema);
  });

  it('should report missing required fields', async () => {
    // Arrange: Create query result missing required field 'erp_codigo'
    const queryResult = [
      {
        id: 1,
        erp_nombre: 'TEST-PRODUCT',
        nombre: 'Test Product',
      },
    ];

    // Act: Validate against schema
    const result = await validateQueryAgainstSchema(queryResult, 'articulos');

    // Assert: Should fail validation with detailed error
    expect(result.isValid).toBe(false);
    expect(result.errors).toHaveLength(1);

    const error = result.errors[0];
    expect(error.field).toBe('erp_codigo');
    expect(error.type).toBe('MISSING_REQUIRED');
    expect(error.message).toContain('erp_codigo');
    expect(error.message).toContain('missing');
    expect(error.message).toMatch(/required/i);
  });

  it('should report unexpected extra fields', async () => {
    // Arrange: Create query result with field not in schema
    const queryResult = [
      {
        id: 1,
        erp_codigo: 'ART-001',
        erp_nombre: 'TEST-PRODUCT',
        unexpected_column: 'This field does not exist in schema',
      },
    ];

    // Act: Validate against schema
    const result = await validateQueryAgainstSchema(queryResult, 'articulos');

    // Assert: Should fail validation
    expect(result.isValid).toBe(false);
    expect(result.errors.length).toBeGreaterThan(0);

    const unexpectedError = result.errors.find(err => err.field === 'unexpected_column');
    expect(unexpectedError).toBeDefined();
    expect(unexpectedError?.type).toBe('UNEXPECTED_FIELD');
    expect(unexpectedError?.message).toContain('unexpected_column');
    expect(unexpectedError?.message).toContain('not in the schema');
  });

  it('should suggest similar field names for typos', async () => {
    // Arrange: Create query with typo - 'erp_codi' instead of 'erp_codigo'
    const queryResult = [
      {
        id: 1,
        erp_codi: 'ART-001', // Typo: missing 'go' at end
        erp_nombre: 'TEST-PRODUCT',
      },
    ];

    // Act: Validate against schema
    const result = await validateQueryAgainstSchema(queryResult, 'articulos');

    // Assert: Should detect error and suggest correction
    expect(result.isValid).toBe(false);

    const typoError = result.errors.find(err => err.field === 'erp_codi');
    expect(typoError).toBeDefined();
    expect(typoError?.type).toBe('UNEXPECTED_FIELD');

    // Should suggest 'erp_codigo' (Levenshtein distance = 2)
    expect(typoError?.suggestion).toBeDefined();
    expect(typoError?.suggestion).toContain('erp_codigo');
  });

  it('should report type mismatches', async () => {
    // Arrange: Create query with wrong type - precio as string instead of number
    const queryResult = [
      {
        id: 1,
        erp_codigo: 'ART-001',
        erp_nombre: 'TEST-PRODUCT',
        precio: { invalid: 'object' }, // Should be number, got object
      },
    ];

    // Act: Validate against schema
    const result = await validateQueryAgainstSchema(queryResult, 'articulos');

    // Assert: Should detect type mismatch
    expect(result.isValid).toBe(false);

    const typeMismatchError = result.errors.find(err => err.field === 'precio');
    expect(typeMismatchError).toBeDefined();
    expect(typeMismatchError?.type).toBe('TYPE_MISMATCH');
    expect(typeMismatchError?.expectedType).toBe('number');
    expect(typeMismatchError?.actualType).toBe('object');
    expect(typeMismatchError?.message).toContain('precio');
    expect(typeMismatchError?.message).toContain('number');
  });

  it('should format errors for dashboard display', async () => {
    // Arrange: Create multiple validation errors
    const queryResult = [
      {
        id: 1,
        // Missing: erp_codigo (required)
        erp_nombre: 'TEST-PRODUCT',
        extra_field: 'Not in schema',
        precio: 'should-be-number', // Type mismatch (string instead of number, but compatible)
      },
    ];

    // Act: Validate against schema
    const result = await validateQueryAgainstSchema(queryResult, 'articulos');

    // Assert: Should have multiple errors in correct format
    expect(result.isValid).toBe(false);
    expect(result.errors.length).toBeGreaterThan(0);

    // Verify each error has dashboard-compatible structure
    result.errors.forEach(error => {
      expect(error).toHaveProperty('field');
      expect(error).toHaveProperty('type');
      expect(error).toHaveProperty('message');

      expect(typeof error.field).toBe('string');
      expect(error.field.length).toBeGreaterThan(0);

      expect(['MISSING_REQUIRED', 'UNEXPECTED_FIELD', 'TYPE_MISMATCH']).toContain(error.type);

      expect(typeof error.message).toBe('string');
      expect(error.message.length).toBeGreaterThan(0);

      // Optional fields
      if (error.suggestion) {
        expect(typeof error.suggestion).toBe('string');
      }
      if (error.expectedType) {
        expect(typeof error.expectedType).toBe('string');
      }
      if (error.actualType) {
        expect(typeof error.actualType).toBe('string');
      }
    });

    // Verify specific errors are present
    const missingError = result.errors.find(e => e.type === 'MISSING_REQUIRED');
    expect(missingError).toBeDefined();

    const unexpectedError = result.errors.find(e => e.type === 'UNEXPECTED_FIELD');
    expect(unexpectedError).toBeDefined();
  });
});
