/**
 * Gateway mock utilities for integration tests
 * Provides mocked API client that simulates gateway behavior
 */

import { vi } from 'vitest';
import type { APIClient } from '../../src/api-client/index.js';
import type { IArticuloPayload } from '../../src/types/articulos.js';
import type { IComprobanteCabeceraPayload } from '../../src/types/comprobantes-cabecera.js';
import type { IComprobanteDetallePayload } from '../../src/types/comprobantes-detalle.js';
import type { IComprobantePagosPayload } from '../../src/types/comprobantes-pagos.js';

/**
 * Creates a fully mocked API client for testing
 * Tracks all calls and returns successful results by default
 */
export function createMockApiClient(): APIClient {
  // Mock successful batch result
  const createSuccessResult = (count: number) => ({
    success: true,
    inserted: count,
    updated: 0,
    errors: [],
  });

  // Create mock client with all required methods
  const mockClient = {
    articulos: {
      sendBatch: vi.fn().mockImplementation(async (batch: IArticuloPayload[]) => {
        return createSuccessResult(batch.length);
      }),
    },
    comprobantes: {
      sendBatch: vi.fn().mockImplementation(async (batch: IComprobanteCabeceraPayload[]) => {
        return createSuccessResult(batch.length);
      }),
    },
    comprobantesDetalle: {
      sendBatch: vi.fn().mockImplementation(async (batch: IComprobanteDetallePayload[]) => {
        return createSuccessResult(batch.length);
      }),
    },
    comprobantesPagos: {
      sendBatch: vi.fn().mockImplementation(async (batch: IComprobantePagosPayload[]) => {
        return createSuccessResult(batch.length);
      }),
    },
    initialize: vi.fn().mockResolvedValue(undefined),
    testConnection: vi.fn().mockResolvedValue({ success: true, message: 'Connected' }),
    getToken: vi.fn().mockResolvedValue('mock-token'),
    hasValidToken: vi.fn().mockReturnValue(true),
    logout: vi.fn(),
    getInfo: vi.fn().mockReturnValue({
      baseUrl: 'http://mock-gateway',
      hasValidToken: true,
      timeUntilExpiry: 3600000,
    }),
  } as unknown as APIClient;

  return mockClient;
}

/**
 * Creates a mock API client that simulates errors
 */
export function createMockApiClientWithErrors(errorCode: string = 'VALIDATION_ERROR'): APIClient {
  const createErrorResult = (count: number) => ({
    success: false,
    inserted: 0,
    updated: 0,
    errors: Array.from({ length: count }, (_, i) => ({
      index: i,
      identifier: `ITEM-${i}`,
      error: 'Mock validation error',
      code: errorCode,
    })),
  });

  const mockClient = {
    articulos: {
      sendBatch: vi.fn().mockImplementation(async (batch: IArticuloPayload[]) => {
        return createErrorResult(batch.length);
      }),
    },
    comprobantes: {
      sendBatch: vi.fn().mockImplementation(async (batch: IComprobanteCabeceraPayload[]) => {
        return createErrorResult(batch.length);
      }),
    },
    comprobantesDetalle: {
      sendBatch: vi.fn().mockImplementation(async (batch: IComprobanteDetallePayload[]) => {
        return createErrorResult(batch.length);
      }),
    },
    comprobantesPagos: {
      sendBatch: vi.fn().mockImplementation(async (batch: IComprobantePagosPayload[]) => {
        return createErrorResult(batch.length);
      }),
    },
    initialize: vi.fn().mockResolvedValue(undefined),
    testConnection: vi.fn().mockResolvedValue({ success: true, message: 'Connected' }),
    getToken: vi.fn().mockResolvedValue('mock-token'),
    hasValidToken: vi.fn().mockReturnValue(true),
    logout: vi.fn(),
    getInfo: vi.fn().mockReturnValue({
      baseUrl: 'http://mock-gateway',
      hasValidToken: true,
      timeUntilExpiry: 3600000,
    }),
  } as unknown as APIClient;

  return mockClient;
}

/**
 * Creates a mock API client that simulates partial success
 */
export function createMockApiClientWithPartialSuccess(): APIClient {
  const createPartialResult = (count: number) => ({
    success: false,
    inserted: Math.floor(count / 2),
    updated: 0,
    errors: Array.from({ length: Math.ceil(count / 2) }, (_, i) => ({
      index: i * 2 + 1,
      identifier: `ITEM-${i * 2 + 1}`,
      error: 'Mock partial error',
      code: 'VALIDATION_ERROR',
    })),
  });

  const mockClient = {
    articulos: {
      sendBatch: vi.fn().mockImplementation(async (batch: IArticuloPayload[]) => {
        return createPartialResult(batch.length);
      }),
    },
    comprobantes: {
      sendBatch: vi.fn().mockImplementation(async (batch: IComprobanteCabeceraPayload[]) => {
        return createPartialResult(batch.length);
      }),
    },
    comprobantesDetalle: {
      sendBatch: vi.fn().mockImplementation(async (batch: IComprobanteDetallePayload[]) => {
        return createPartialResult(batch.length);
      }),
    },
    comprobantesPagos: {
      sendBatch: vi.fn().mockImplementation(async (batch: IComprobantePagosPayload[]) => {
        return createPartialResult(batch.length);
      }),
    },
    initialize: vi.fn().mockResolvedValue(undefined),
    testConnection: vi.fn().mockResolvedValue({ success: true, message: 'Connected' }),
    getToken: vi.fn().mockResolvedValue('mock-token'),
    hasValidToken: vi.fn().mockReturnValue(true),
    logout: vi.fn(),
    getInfo: vi.fn().mockReturnValue({
      baseUrl: 'http://mock-gateway',
      hasValidToken: true,
      timeUntilExpiry: 3600000,
    }),
  } as unknown as APIClient;

  return mockClient;
}
