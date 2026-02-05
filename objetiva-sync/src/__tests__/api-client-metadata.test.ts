/**
 * Tests para verificar que los API clients envian metadata correctamente
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ArticulosClient } from '../api-client/articulos-client.js';
import { ComprobantesCabeceraClient } from '../api-client/comprobantes-cabecera-client.js';
import { ComprobantesDetalleClient } from '../api-client/comprobantes-detalle-client.js';
import { ComprobantesPagosClient } from '../api-client/comprobantes-pagos-client.js';
import type { AuthManager } from '../api-client/auth.js';
import type { IArticuloPayload } from '../types/articulos.js';
import type { IComprobanteCabeceraPayload } from '../types/comprobantes-cabecera.js';
import type { IComprobanteDetallePayload } from '../types/comprobantes-detalle.js';
import type { IComprobantePagosPayload } from '../types/comprobantes-pagos.js';

// Mock de undici fetch
vi.mock('undici', () => ({
  fetch: vi.fn(),
}));

// Mock de logger
vi.mock('../utils/logger.js', () => ({
  logger: {
    info: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
    debug: vi.fn(),
  },
}));

describe('API Clients - Metadata Transmission', () => {
  const mockAuthManager: AuthManager = {
    getToken: vi.fn().mockResolvedValue('test-token-123'),
    login: vi.fn(),
    logout: vi.fn(),
    isAuthenticated: vi.fn(),
  } as any;

  const baseUrl = 'https://api.example.com';
  const mockMetadata = {
    queryId: 42,
    queryName: 'Test Query - Factura A',
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('ArticulosClient', () => {
    it('should send metadata in HTTP headers when metadata is provided', async () => {
      const { fetch } = await import('undici');
      const mockFetch = fetch as any;

      // Mock successful response
      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => ({
          success: true,
          data: { inserted: 1, updated: 0, errors: [] },
        }),
      });

      const client = new ArticulosClient(baseUrl, mockAuthManager);
      const testArticulos: IArticuloPayload[] = [
        { sku: 'TEST-001', erp_codigo: 'TEST-001', erp_nombre2: 'Test Article', nombre: 'Test Article', objeto: 'producto' },
      ];

      await client.sendBatch(testArticulos, mockMetadata);

      // Verificar que fetch fue llamado con los headers correctos
      expect(mockFetch).toHaveBeenCalledTimes(1);
      const callArgs = mockFetch.mock.calls[0];
      const headers = callArgs[1].headers;

      expect(headers['X-Query-Id']).toBe('42');
      expect(headers['X-Query-Name']).toBe('Test Query - Factura A');
      expect(headers['Authorization']).toBe('Bearer test-token-123');
      expect(headers['Content-Type']).toBe('application/json');
    });

    it('should work without metadata (backward compatibility)', async () => {
      const { fetch } = await import('undici');
      const mockFetch = fetch as any;

      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => ({
          success: true,
          data: { inserted: 1, updated: 0, errors: [] },
        }),
      });

      const client = new ArticulosClient(baseUrl, mockAuthManager);
      const testArticulos: IArticuloPayload[] = [
        { sku: 'TEST-002', erp_codigo: 'TEST-002', erp_nombre2: 'Test Article 2', nombre: 'Test Article 2', objeto: 'producto' },
      ];

      // Call without metadata
      await client.sendBatch(testArticulos);

      expect(mockFetch).toHaveBeenCalledTimes(1);
      const callArgs = mockFetch.mock.calls[0];
      const headers = callArgs[1].headers;

      // Should not have X-Query-* headers
      expect(headers['X-Query-Id']).toBeUndefined();
      expect(headers['X-Query-Name']).toBeUndefined();
      expect(headers['Authorization']).toBe('Bearer test-token-123');
    });
  });

  describe('ComprobantesCabeceraClient', () => {
    it('should send metadata in HTTP headers', async () => {
      const { fetch } = await import('undici');
      const mockFetch = fetch as any;

      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => ({
          success: true,
          data: { inserted: 1, updated: 0, errors: [] },
        }),
      });

      const client = new ComprobantesCabeceraClient(baseUrl, mockAuthManager);
      const testComprobantes: IComprobanteCabeceraPayload[] = [
        {
          erp_operacion: 'FC',
          erp_formulario: 'A',
          erp_numero: '00001',
          operacion: 'FC',
          formulario: 'A',
          numero: '00001',
          fecha: new Date().toISOString(),
          cantidad_items: 1,
          total_bruto: 100.0,
          total_descuentos: 0,
          total_neto: 100.0,
          total_iva: 21.0,
          total_venta: 121.0,
        },
      ];

      await client.sendBatch(testComprobantes, mockMetadata);

      const callArgs = mockFetch.mock.calls[0];
      const headers = callArgs[1].headers;

      expect(headers['X-Query-Id']).toBe('42');
      expect(headers['X-Query-Name']).toBe('Test Query - Factura A');
    });
  });

  describe('ComprobantesDetalleClient', () => {
    it('should send metadata in HTTP headers', async () => {
      const { fetch } = await import('undici');
      const mockFetch = fetch as any;

      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => ({
          success: true,
          data: { inserted: 1, updated: 0, errors: [] },
        }),
      });

      const client = new ComprobantesDetalleClient(baseUrl, mockAuthManager);
      const testDetalles: IComprobanteDetallePayload[] = [
        {
          erp_operacion: 'FC',
          erp_formulario: 'A',
          erp_numero: '00001',
          comprobante_operacion: 'FC',
          comprobante_formulario: 'A',
          comprobante_numero: '00001',
          linea_numero: 1,
          unidades: 1,
          precio_unitario: 100.0,
          importe_bruto: 100.0,
          importe_descuento: 0,
          importe_neto: 100.0,
          alicuota_iva: 21,
          importe_iva: 21.0,
          importe_total: 121.0,
        },
      ];

      await client.sendBatch(testDetalles, mockMetadata);

      const callArgs = mockFetch.mock.calls[0];
      const headers = callArgs[1].headers;

      expect(headers['X-Query-Id']).toBe('42');
      expect(headers['X-Query-Name']).toBe('Test Query - Factura A');
    });
  });

  describe('ComprobantesPagosClient', () => {
    it('should send metadata in HTTP headers', async () => {
      const { fetch } = await import('undici');
      const mockFetch = fetch as any;

      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => ({
          success: true,
          data: { inserted: 1, updated: 0, errors: [] },
        }),
      });

      const client = new ComprobantesPagosClient(baseUrl, mockAuthManager);
      const testPagos: IComprobantePagosPayload[] = [
        {
          erp_operacion: 'FC',
          erp_formulario: 'A',
          erp_numero: '00001',
          comprobante_operacion: 'FC',
          comprobante_formulario: 'A',
          comprobante_numero: '00001',
          linea_numero: 1,
          medio: 'efectivo',
          monto: 100.0,
        },
      ];

      await client.sendBatch(testPagos, mockMetadata);

      const callArgs = mockFetch.mock.calls[0];
      const headers = callArgs[1].headers;

      expect(headers['X-Query-Id']).toBe('42');
      expect(headers['X-Query-Name']).toBe('Test Query - Factura A');
    });
  });

  describe('Metadata format validation', () => {
    it('should convert queryId to string in header', async () => {
      const { fetch } = await import('undici');
      const mockFetch = fetch as any;

      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => ({
          success: true,
          data: { inserted: 0, updated: 0, errors: [] },
        }),
      });

      const client = new ArticulosClient(baseUrl, mockAuthManager);

      await client.sendBatch([], {
        queryId: 999,
        queryName: 'Query with numeric ID',
      });

      const callArgs = mockFetch.mock.calls[0];
      const headers = callArgs[1].headers;

      // Header value should be string
      expect(typeof headers['X-Query-Id']).toBe('string');
      expect(headers['X-Query-Id']).toBe('999');
    });

    it('should handle special characters in query name', async () => {
      const { fetch } = await import('undici');
      const mockFetch = fetch as any;

      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => ({
          success: true,
          data: { inserted: 0, updated: 0, errors: [] },
        }),
      });

      const client = new ArticulosClient(baseUrl, mockAuthManager);

      await client.sendBatch([], {
        queryId: 1,
        queryName: 'Query with "quotes" & special-chars',
      });

      const callArgs = mockFetch.mock.calls[0];
      const headers = callArgs[1].headers;

      expect(headers['X-Query-Name']).toBe('Query with "quotes" & special-chars');
    });
  });
});
