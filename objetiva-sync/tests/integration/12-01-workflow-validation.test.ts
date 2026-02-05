/**
 * Integration tests for end-to-end workflow validation (12-01)
 * Tests the complete sync pipeline: validation and data sync
 *
 * ROBU-01: Validates the complete workflow (validation and data sync) works correctly
 *
 * Test Coverage:
 * - Zod schema validation for all 4 entity types (articulos, cabecera, detalle, pagos)
 * - API client mock sends batch successfully (success, error, partial success)
 * - Error classifier completeness (all 11 error types)
 * - Full send-validate-persist flow
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  createMockApiClient,
  createMockApiClientWithErrors,
  createMockApiClientWithPartialSuccess
} from '../helpers/gateway-mock.js';
import {
  createArticulo,
  createArticuloBatch,
  createComprobanteCabecera,
  createComprobanteDetalle,
  createComprobantePago,
  resetCounter
} from '../fixtures/test-data.js';
import { classifyError } from '../../src/utils/error-classifier.js';

// Import Zod schemas
import { articuloPayloadSchema } from '../../src/types/articulos.js';
import { comprobanteCabeceraPayloadSchema } from '../../src/types/comprobantes-cabecera.js';
import { comprobanteDetallePayloadSchema } from '../../src/types/comprobantes-detalle.js';
import { comprobantePagoPayloadSchema } from '../../src/types/comprobantes-pagos.js';

// Mock logger to suppress output
vi.mock('../../src/utils/logger.js');

describe('Workflow Validation - End-to-End Integration Tests', () => {
  beforeEach(() => {
    resetCounter();
  });

  // ============================================
  // GROUP 1: Zod Schema Validation for All Entity Types
  // ============================================
  describe('Zod Schema Validation for All Entity Types', () => {
    it('valid articulo fixture passes Zod validation', () => {
      // Arrange
      const articulo = createArticulo();

      // Act
      const result = articuloPayloadSchema.safeParse(articulo);

      // Assert
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.erp_codigo).toBeDefined();
        expect(result.data.erp_nombre).toBeDefined();
      }
    });

    it('valid cabecera fixture passes Zod validation', () => {
      // Arrange
      const cabecera = createComprobanteCabecera();

      // Act
      const result = comprobanteCabeceraPayloadSchema.safeParse(cabecera);

      // Assert
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.erp_operacion).toBeDefined();
        expect(result.data.erp_formulario).toBeDefined();
        expect(result.data.erp_numero).toBeDefined();
        expect(result.data.operacion).toBeDefined();
        expect(result.data.formulario).toBeDefined();
        expect(result.data.numero).toBeDefined();
      }
    });

    it('valid detalle fixture passes Zod validation', () => {
      // Arrange
      const cabecera = createComprobanteCabecera();
      const detalle = createComprobanteDetalle(cabecera);

      // Act
      const result = comprobanteDetallePayloadSchema.safeParse(detalle);

      // Assert
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.erp_operacion).toBe(cabecera.erp_operacion);
        expect(result.data.comprobante_operacion).toBe(cabecera.operacion);
        expect(result.data.linea_numero).toBeDefined();
        // Verify math coherence
        expect(result.data.importe_neto).toBeCloseTo(
          result.data.importe_bruto - result.data.importe_descuento,
          2
        );
        expect(result.data.importe_total).toBeCloseTo(
          result.data.importe_neto + result.data.importe_iva,
          2
        );
      }
    });

    it('valid pago fixture passes Zod validation', () => {
      // Arrange
      const cabecera = createComprobanteCabecera();
      const pago = createComprobantePago(cabecera);

      // Act
      const result = comprobantePagoPayloadSchema.safeParse(pago);

      // Assert
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.erp_operacion).toBe(cabecera.erp_operacion);
        expect(result.data.comprobante_operacion).toBe(cabecera.operacion);
        expect(result.data.linea_numero).toBeDefined();
        expect(result.data.medio).toBeDefined();
        expect(result.data.monto).toBeGreaterThan(0);
      }
    });

    it('invalid articulo is rejected by Zod', () => {
      // Arrange - missing required fields
      const invalidArticulo = {
        nombre: 'Invalid Product',
        precio: 50000,
        // Missing: erp_codigo, erp_nombre
      };

      // Act
      const result = articuloPayloadSchema.safeParse(invalidArticulo);

      // Assert
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues.length).toBeGreaterThan(0);
        const fieldNames = result.error.issues.map(issue => issue.path.join('.'));
        expect(fieldNames).toContain('erp_codigo');
        expect(fieldNames).toContain('erp_nombre');
      }
    });

    it('invalid cabecera with math errors is rejected by Zod', () => {
      // Arrange - total_venta doesn't match total_neto + total_iva
      const invalidCabecera = {
        erp_operacion: 'VEN',
        erp_formulario: 'FACTURA A',
        erp_numero: '00001-00000001',
        operacion: 'VTA',
        formulario: 'FA',
        numero: '00000001',
        fecha: new Date().toISOString(),
        cantidad_items: 1,
        total_bruto: 100000,
        total_descuentos: 0,
        total_neto: 100000,
        total_iva: 21000,
        total_venta: 999999, // Wrong! Should be 121000
      };

      // Act
      const result = comprobanteCabeceraPayloadSchema.safeParse(invalidCabecera);

      // Assert
      expect(result.success).toBe(false);
      if (!result.success) {
        const errorMessages = result.error.issues.map(issue => issue.message);
        expect(errorMessages.some(msg => msg.includes('total_venta'))).toBe(true);
      }
    });

    it('Zod transforms numeric strings to numbers correctly', () => {
      // Arrange - erp_codigo as number (should be transformed to string)
      const articulo = createArticulo({
        erp_codigo: 12345 as any, // Type assertion for test
      });

      // Act
      const result = articuloPayloadSchema.safeParse(articulo);

      // Assert
      expect(result.success).toBe(true);
      if (result.success) {
        expect(typeof result.data.erp_codigo).toBe('string');
        expect(result.data.erp_codigo).toBe('12345');
      }
    });

    it('batch validation accepts multiple valid articulos', () => {
      // Arrange
      const batch = createArticuloBatch(5);

      // Act
      const results = batch.map(articulo =>
        articuloPayloadSchema.safeParse(articulo)
      );

      // Assert
      expect(results.every(r => r.success)).toBe(true);
      expect(results.length).toBe(5);
    });
  });

  // ============================================
  // GROUP 2: API Client Mock Sends Batch Successfully
  // ============================================
  describe('API Client Mock Sends Batch Successfully', () => {
    it('mock API client sends articulos batch and receives success response', async () => {
      // Arrange
      const mockClient = createMockApiClient();
      const batch = createArticuloBatch(10);

      // Act
      const result = await mockClient.articulos.sendBatch(batch);

      // Assert
      expect(result.success).toBe(true);
      expect(result.inserted).toBe(10);
      expect(result.updated).toBe(0);
      expect(result.errors.length).toBe(0);
      expect(mockClient.articulos.sendBatch).toHaveBeenCalledTimes(1);
    });

    it('mock API client with errors returns error results', async () => {
      // Arrange
      const mockClient = createMockApiClientWithErrors('VALIDATION_ERROR');
      const batch = createArticuloBatch(5);

      // Act
      const result = await mockClient.articulos.sendBatch(batch);

      // Assert
      expect(result.success).toBe(false);
      expect(result.inserted).toBe(0);
      expect(result.updated).toBe(0);
      expect(result.errors.length).toBe(5);
      expect(result.errors[0].code).toBe('VALIDATION_ERROR');
    });

    it('mock API client with partial success returns mixed results', async () => {
      // Arrange
      const mockClient = createMockApiClientWithPartialSuccess();
      const batch = createArticuloBatch(10);

      // Act
      const result = await mockClient.articulos.sendBatch(batch);

      // Assert
      expect(result.success).toBe(false); // Not full success
      expect(result.inserted).toBe(5); // Half succeeded
      expect(result.errors.length).toBe(5); // Half failed
    });

    it('mock API client sends cabecera batch successfully', async () => {
      // Arrange
      const mockClient = createMockApiClient();
      const batch = [
        createComprobanteCabecera(),
        createComprobanteCabecera(),
        createComprobanteCabecera(),
      ];

      // Act
      const result = await mockClient.comprobantes.sendBatch(batch);

      // Assert
      expect(result.success).toBe(true);
      expect(result.inserted).toBe(3);
    });

    it('mock API client sends detalle batch successfully', async () => {
      // Arrange
      const mockClient = createMockApiClient();
      const cabecera = createComprobanteCabecera();
      const batch = [
        createComprobanteDetalle(cabecera, 1),
        createComprobanteDetalle(cabecera, 2),
      ];

      // Act
      const result = await mockClient.comprobantesDetalle.sendBatch(batch);

      // Assert
      expect(result.success).toBe(true);
      expect(result.inserted).toBe(2);
    });

    it('mock API client sends pagos batch successfully', async () => {
      // Arrange
      const mockClient = createMockApiClient();
      const cabecera = createComprobanteCabecera();
      const batch = [
        createComprobantePago(cabecera, 1),
      ];

      // Act
      const result = await mockClient.comprobantesPagos.sendBatch(batch);

      // Assert
      expect(result.success).toBe(true);
      expect(result.inserted).toBe(1);
    });

    it('mock API client handles authentication correctly', () => {
      // Arrange
      const mockClient = createMockApiClient();

      // Act & Assert
      expect(mockClient.hasValidToken()).toBe(true);
      expect(mockClient.getInfo().hasValidToken).toBe(true);
      expect(mockClient.getInfo().baseUrl).toBe('http://mock-gateway');
    });
  });

  // ============================================
  // GROUP 3: Error Classifier Completeness
  // ============================================
  describe('Error Classifier Completeness', () => {
    it('classifies SYNC_CANCELED (user cancellation)', () => {
      // Arrange
      const error = new DOMException('User cancelled', 'AbortError');

      // Act
      const classified = classifyError(error);

      // Assert
      expect(classified.code).toBe('SYNC_CANCELED');
      expect(classified.isRetryable).toBe(false);
      expect(classified.message).toContain('cancelada');
    });

    it('classifies TIMEOUT_GATEWAY_REQUEST (explicit timeout)', () => {
      // Arrange
      const error = new Error('Timeout');
      error.name = 'TimeoutError';

      // Act
      const classified = classifyError(error);

      // Assert
      expect(classified.code).toBe('TIMEOUT_GATEWAY_REQUEST');
      expect(classified.isRetryable).toBe(true);
      expect(classified.message).toContain('2 minutos');
    });

    it('classifies TIMEOUT_GATEWAY_REQUEST (AbortError with timeout in message)', () => {
      // Arrange
      const error = new DOMException('Signal timeout occurred', 'AbortError');

      // Act
      const classified = classifyError(error);

      // Assert
      expect(classified.code).toBe('TIMEOUT_GATEWAY_REQUEST');
      expect(classified.isRetryable).toBe(true);
    });

    it('classifies TIMEOUT_GATEWAY_HEADERS (undici headers timeout)', () => {
      // Arrange
      const error = new Error('UND_ERR_HEADERS_TIMEOUT');
      error.name = 'HeadersTimeoutError';

      // Act
      const classified = classifyError(error);

      // Assert
      expect(classified.code).toBe('TIMEOUT_GATEWAY_HEADERS');
      expect(classified.isRetryable).toBe(true);
      expect(classified.message).toContain('headersTimeout');
    });

    it('classifies TIMEOUT_GATEWAY_BODY (undici body timeout)', () => {
      // Arrange
      const error = new Error('UND_ERR_BODY_TIMEOUT');
      error.name = 'BodyTimeoutError';

      // Act
      const classified = classifyError(error);

      // Assert
      expect(classified.code).toBe('TIMEOUT_GATEWAY_BODY');
      expect(classified.isRetryable).toBe(true);
      expect(classified.rootCause).toContain('batch');
    });

    it('classifies TIMEOUT_ERP_QUERY (SQL Server timeout)', () => {
      // Arrange
      const error = new Error('Request failed to complete in 120000ms');

      // Act
      const classified = classifyError(error);

      // Assert
      expect(classified.code).toBe('TIMEOUT_ERP_QUERY');
      expect(classified.isRetryable).toBe(true);
      expect(classified.rootCause).toContain('ERP');
    });

    it('classifies GATEWAY_UNREACHABLE (ECONNREFUSED)', () => {
      // Arrange
      const cause = new Error('connect ECONNREFUSED 127.0.0.1:3000');
      const error = new TypeError('fetch failed');
      (error as any).cause = cause;

      // Act
      const classified = classifyError(error);

      // Assert
      expect(classified.code).toBe('GATEWAY_UNREACHABLE');
      expect(classified.isRetryable).toBe(true);
      expect(classified.message).toContain('ECONNREFUSED');
    });

    it('classifies GATEWAY_CONNECTION_RESET (ECONNRESET)', () => {
      // Arrange
      const cause = new Error('socket hang up ECONNRESET');
      const error = new TypeError('fetch failed');
      (error as any).cause = cause;

      // Act
      const classified = classifyError(error);

      // Assert
      expect(classified.code).toBe('GATEWAY_CONNECTION_RESET');
      expect(classified.isRetryable).toBe(true);
      expect(classified.message).toContain('interrumpida');
    });

    it('classifies GATEWAY_DNS_ERROR (ENOTFOUND)', () => {
      // Arrange
      const cause = new Error('getaddrinfo ENOTFOUND gateway.example.com');
      const error = new TypeError('fetch failed');
      (error as any).cause = cause;

      // Act
      const classified = classifyError(error);

      // Assert
      expect(classified.code).toBe('GATEWAY_DNS_ERROR');
      expect(classified.isRetryable).toBe(false);
      expect(classified.rootCause).toContain('URL');
    });

    it('classifies GATEWAY_AUTH_ERROR (HTTP 401)', () => {
      // Arrange
      const error = new Error('HTTP 401 Unauthorized');

      // Act
      const classified = classifyError(error);

      // Assert
      expect(classified.code).toBe('GATEWAY_AUTH_ERROR');
      expect(classified.isRetryable).toBe(false);
      expect(classified.rootCause).toContain('credenciales');
    });

    it('classifies GATEWAY_SERVER_ERROR (HTTP 500)', () => {
      // Arrange
      const error = new Error('HTTP 500 Internal Server Error');

      // Act
      const classified = classifyError(error);

      // Assert
      expect(classified.code).toBe('GATEWAY_SERVER_ERROR');
      expect(classified.isRetryable).toBe(true);
      expect(classified.message).toContain('500');
    });

    it('classifies UNKNOWN_ERROR (unrecognized error)', () => {
      // Arrange
      const error = new Error('Some unexpected error');

      // Act
      const classified = classifyError(error);

      // Assert
      expect(classified.code).toBe('UNKNOWN_ERROR');
      expect(classified.isRetryable).toBe(false);
      expect(classified.message).toContain('unexpected');
    });

    it('error classifier handles error chain with .cause', () => {
      // Arrange
      const rootCause = new Error('ECONNREFUSED');
      const middleCause = new Error('Connection failed');
      (middleCause as any).cause = rootCause;
      const topError = new TypeError('fetch failed');
      (topError as any).cause = middleCause;

      // Act
      const classified = classifyError(topError);

      // Assert
      expect(classified.code).toBe('GATEWAY_UNREACHABLE');
      expect(classified.message).toContain('ECONNREFUSED');
    });
  });

  // ============================================
  // GROUP 4: Full Send-Validate-Persist Flow
  // ============================================
  describe('Full Send-Validate-Persist Flow', () => {
    it('complete articulos flow: create fixtures -> validate -> send -> receive confirmation', async () => {
      // Arrange
      const batch = createArticuloBatch(3);
      const mockClient = createMockApiClient();

      // Step 1: Validate fixtures
      const validationResults = batch.map(articulo =>
        articuloPayloadSchema.safeParse(articulo)
      );
      expect(validationResults.every(r => r.success)).toBe(true);

      // Step 2: Extract validated data
      const validatedBatch = validationResults
        .filter(r => r.success)
        .map(r => (r as any).data);

      // Step 3: Send to API client
      const sendResult = await mockClient.articulos.sendBatch(validatedBatch);

      // Step 4: Verify confirmation
      expect(sendResult.success).toBe(true);
      expect(sendResult.inserted).toBe(3);
      expect(sendResult.errors.length).toBe(0);
      expect(mockClient.articulos.sendBatch).toHaveBeenCalledWith(validatedBatch);
    });

    it('batch with mixed valid/invalid data flow', async () => {
      // Arrange
      const validArticulo = createArticulo();
      const invalidArticulo = {
        nombre: 'Invalid',
        // Missing required fields
      };
      const batch = [validArticulo, invalidArticulo, validArticulo];
      const mockClient = createMockApiClient();

      // Step 1: Validate each item
      const validationResults = batch.map(articulo =>
        articuloPayloadSchema.safeParse(articulo)
      );

      // Step 2: Separate valid from invalid
      const validItems = validationResults
        .filter(r => r.success)
        .map(r => (r as any).data);
      const invalidCount = validationResults.filter(r => !r.success).length;

      // Assert validation results
      expect(validItems.length).toBe(2);
      expect(invalidCount).toBe(1);

      // Step 3: Send only valid items
      const sendResult = await mockClient.articulos.sendBatch(validItems);

      // Step 4: Verify only valid items were sent
      expect(sendResult.success).toBe(true);
      expect(sendResult.inserted).toBe(2);
    });

    it('complete comprobantes flow: cabecera -> detalle -> pagos', async () => {
      // Arrange
      const mockClient = createMockApiClient();
      const cabecera = createComprobanteCabecera();
      const detalles = [
        createComprobanteDetalle(cabecera, 1),
        createComprobanteDetalle(cabecera, 2),
      ];
      const pagos = [
        createComprobantePago(cabecera, 1),
      ];

      // Step 1: Validate all entities
      const cabeceraValid = comprobanteCabeceraPayloadSchema.safeParse(cabecera);
      const detallesValid = detalles.map(d =>
        comprobanteDetallePayloadSchema.safeParse(d)
      );
      const pagosValid = pagos.map(p =>
        comprobantePagoPayloadSchema.safeParse(p)
      );

      expect(cabeceraValid.success).toBe(true);
      expect(detallesValid.every(r => r.success)).toBe(true);
      expect(pagosValid.every(r => r.success)).toBe(true);

      // Step 2: Send cabecera first
      const cabeceraResult = await mockClient.comprobantes.sendBatch([cabecera]);
      expect(cabeceraResult.success).toBe(true);

      // Step 3: Send detalles
      const detallesResult = await mockClient.comprobantesDetalle.sendBatch(detalles);
      expect(detallesResult.success).toBe(true);
      expect(detallesResult.inserted).toBe(2);

      // Step 4: Send pagos
      const pagosResult = await mockClient.comprobantesPagos.sendBatch(pagos);
      expect(pagosResult.success).toBe(true);
      expect(pagosResult.inserted).toBe(1);
    });

    it('handles API client errors in full flow', async () => {
      // Arrange
      const batch = createArticuloBatch(5);
      const mockClient = createMockApiClientWithErrors('VALIDATION_ERROR');

      // Step 1: Validate fixtures (all pass client-side validation)
      const validationResults = batch.map(articulo =>
        articuloPayloadSchema.safeParse(articulo)
      );
      expect(validationResults.every(r => r.success)).toBe(true);

      // Step 2: Send to API (gateway returns errors)
      const validatedBatch = validationResults.map(r => (r as any).data);
      const sendResult = await mockClient.articulos.sendBatch(validatedBatch);

      // Step 3: Verify error handling
      expect(sendResult.success).toBe(false);
      expect(sendResult.errors.length).toBe(5);
      expect(sendResult.errors[0].code).toBe('VALIDATION_ERROR');

      // Step 4: Classify errors
      const classified = classifyError(new Error('VALIDATION_ERROR'));
      expect(classified.code).toBe('UNKNOWN_ERROR'); // Not a network error
    });

    it('verifies referential integrity in comprobantes flow', () => {
      // Arrange
      const cabecera1 = createComprobanteCabecera();
      const cabecera2 = createComprobanteCabecera();
      const detalle1 = createComprobanteDetalle(cabecera1, 1);
      const detalle2 = createComprobanteDetalle(cabecera2, 1);

      // Assert: Detalles reference their correct cabecera
      expect(detalle1.erp_operacion).toBe(cabecera1.erp_operacion);
      expect(detalle1.erp_formulario).toBe(cabecera1.erp_formulario);
      expect(detalle1.erp_numero).toBe(cabecera1.erp_numero);

      expect(detalle2.erp_operacion).toBe(cabecera2.erp_operacion);
      expect(detalle2.erp_formulario).toBe(cabecera2.erp_formulario);
      expect(detalle2.erp_numero).toBe(cabecera2.erp_numero);

      // Assert: Different cabeceras have different keys
      expect(detalle1.erp_numero).not.toBe(detalle2.erp_numero);
    });
  });
});
