/**
 * Integration tests for Comprobantes Pagos sync flow (TEST-04)
 * Tests the complete pipeline: fetch -> transform -> send to gateway
 */

import { describe, it, expect, beforeAll, beforeEach, afterEach, vi } from 'vitest';
import { loadEnv } from '../../src/config/env.js';
import { SyncEngine } from '../../src/sync/sync-engine.js';
import { initSyncQueue } from '../../src/sync/sync-queue-instance.js';
import { initSyncQueue } from '../../src/sync/sync-queue-instance.js';
import { createMockApiClient } from '../helpers/gateway-mock.js';
import { createComprobanteCabecera, createComprobantePago, resetCounter } from '../fixtures/test-data.js';
import { EntityType } from '../../src/types/common.js';
import type { IDataSourceAdapter, IQueryResult } from '../../src/adapters/types.js';
import type { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import { injectTestDatabase } from '../helpers/db-injector.js';
import * as schema from '../../src/store/schema.js';
import { createTestDb, clearTestDb, closeTestDb } from '../helpers/test-db.js';
import * as QueriesRepo from '../../src/store/repositories/queries-repo.js';

describe('Comprobantes Pagos Integration Tests', () => {
  let db: BetterSQLite3Database<typeof schema>;
  let mockAdapter: IDataSourceAdapter;
  let mockApiClient: ReturnType<typeof createMockApiClient>;
  let syncEngine: SyncEngine;

  beforeAll(() => {
    loadEnv();
  });

  beforeEach(async () => {
    // Reset test data counter
    resetCounter();

    // Create test database
    db = createTestDb();
    clearTestDb(db);
    // Inject test database into store module
    injectTestDatabase(db);

    // Create mock API client
    mockApiClient = createMockApiClient();

    // Create mock adapter
    mockAdapter = {
      type: 'mock',
      displayName: 'Mock Adapter',
      isConnected: true,
      getConfigSchema: vi.fn(),
      connect: vi.fn(),
      disconnect: vi.fn(),
      testConnection: vi.fn(),
      executeQuery: vi.fn(),
      getTables: vi.fn(),
      getColumns: vi.fn(),
      getSampleData: vi.fn(),
    } as IDataSourceAdapter;

    // Initialize SyncEngine
    syncEngine = new SyncEngine({
      dataSourceAdapter: mockAdapter,
      apiClient: mockApiClient,
      defaultBatchSize: 100,
    });

    // Initialize SyncQueue
    initSyncQueue(syncEngine);
  });

  afterEach(() => {
    closeTestDb(db);
  });

  it('should sync pago linked to existing cabecera', async () => {
    // Arrange: Create cabecera and pago
    const cabecera = createComprobanteCabecera();
    const pago = createComprobantePago(cabecera, 1, {
      medio: 'EFECTIVO',
      monto: 108900.00,
    });

    const mockQueryResult: IQueryResult = {
      rows: [pago],
      rowCount: 1,
      executionTimeMs: 10,
    };

    vi.spyOn(mockAdapter, 'executeQuery').mockResolvedValue(mockQueryResult);

    // Create query in database
    const queryId = await QueriesRepo.createQuery({
      entityType: EntityType.COMPROBANTE_PAGO,
      name: 'Test Single Pago Query',
      sqlQuery: 'SELECT * FROM comprobantes_pagos WHERE id = 1',
      isActive: true,
    });

    // Act: Execute sync
    const result = await syncEngine.syncQuery(queryId);

    // Assert: Verify result
    expect(result.status).toBe('success');
    expect(result.recordsFetched).toBe(1);
    expect(result.recordsSent).toBe(1);
    expect(result.recordsFailed).toBe(0);

    // Verify API client was called
    expect(mockApiClient.comprobantesPagos.sendBatch).toHaveBeenCalledTimes(1);

    // Verify pago is linked to correct cabecera
    const sentData = mockApiClient.comprobantesPagos.sendBatch.mock.calls[0][0][0];
    expect(sentData.comprobante_operacion).toBe(cabecera.operacion);
    expect(sentData.comprobante_formulario).toBe(cabecera.formulario);
    expect(sentData.comprobante_numero).toBe(cabecera.numero);
  });

  it('should handle multiple payment types', async () => {
    // Arrange: Create cabecera with multiple payment methods
    const cabecera = createComprobanteCabecera({
      total_venta: 108900.00,
    });

    const pagos = [
      createComprobantePago(cabecera, 1, {
        medio: 'EFECTIVO',
        monto: 50000.00,
      }),
      createComprobantePago(cabecera, 2, {
        medio: 'TRANSFERENCIA',
        monto: 58900.00,
        referencia: 'TRX-123456',
      }),
    ];

    const mockQueryResult: IQueryResult = {
      rows: pagos,
      rowCount: 2,
      executionTimeMs: 10,
    };

    vi.spyOn(mockAdapter, 'executeQuery').mockResolvedValue(mockQueryResult);

    // Create query in database
    const queryId = await QueriesRepo.createQuery({
      entityType: EntityType.COMPROBANTE_PAGO,
      name: 'Test Multiple Payment Types Query',
      sqlQuery: 'SELECT * FROM comprobantes_pagos',
      isActive: true,
    });

    // Act: Execute sync
    const result = await syncEngine.syncQuery(queryId);

    // Assert: Verify result
    expect(result.status).toBe('success');
    expect(result.recordsFetched).toBe(2);
    expect(result.recordsSent).toBe(2);
    expect(result.recordsFailed).toBe(0);

    // Verify both payment types were sent
    const allCalls = mockApiClient.comprobantesPagos.sendBatch.mock.calls;
    const allPagos = allCalls.flatMap(call => call[0]);

    expect(allPagos).toHaveLength(2);
    expect(allPagos.some(p => p.medio === 'EFECTIVO')).toBe(true);
    expect(allPagos.some(p => p.medio === 'TRANSFERENCIA')).toBe(true);
  });

  it('should calculate total payment amounts correctly', async () => {
    // Arrange: Create cabecera with partial payments
    const cabecera = createComprobanteCabecera({
      total_venta: 100000.00,
    });

    const pagos = [
      createComprobantePago(cabecera, 1, {
        medio: 'EFECTIVO',
        monto: 30000.00,
      }),
      createComprobantePago(cabecera, 2, {
        medio: 'TARJETA',
        monto: 40000.00,
      }),
      createComprobantePago(cabecera, 3, {
        medio: 'TRANSFERENCIA',
        monto: 30000.00,
      }),
    ];

    const mockQueryResult: IQueryResult = {
      rows: pagos,
      rowCount: 3,
      executionTimeMs: 15,
    };

    vi.spyOn(mockAdapter, 'executeQuery').mockResolvedValue(mockQueryResult);

    // Create query
    const queryId = await QueriesRepo.createQuery({
      entityType: EntityType.COMPROBANTE_PAGO,
      name: 'Test Amount Calculation Query',
      sqlQuery: 'SELECT * FROM comprobantes_pagos',
      isActive: true,
    });

    // Act: Execute sync
    const result = await syncEngine.syncQuery(queryId);

    // Assert: Verify result
    expect(result.status).toBe('success');
    expect(result.recordsSent).toBe(3);

    // Verify total amounts
    const allCalls = mockApiClient.comprobantesPagos.sendBatch.mock.calls;
    const allPagos = allCalls.flatMap(call => call[0]);
    const totalPagado = allPagos.reduce((sum, p) => sum + p.monto, 0);

    expect(totalPagado).toBe(100000.00);
  });

  it('should sync batch with multiple cabeceras', async () => {
    // Arrange: Create 3 cabeceras with 2 pagos each (6 total)
    const cabecera1 = createComprobanteCabecera();
    const cabecera2 = createComprobanteCabecera();
    const cabecera3 = createComprobanteCabecera();

    const pagos = [
      createComprobantePago(cabecera1, 1),
      createComprobantePago(cabecera1, 2),
      createComprobantePago(cabecera2, 1),
      createComprobantePago(cabecera2, 2),
      createComprobantePago(cabecera3, 1),
      createComprobantePago(cabecera3, 2),
    ];

    const mockQueryResult: IQueryResult = {
      rows: pagos,
      rowCount: 6,
      executionTimeMs: 20,
    };

    vi.spyOn(mockAdapter, 'executeQuery').mockResolvedValue(mockQueryResult);

    // Create query in database
    const queryId = await QueriesRepo.createQuery({
      entityType: EntityType.COMPROBANTE_PAGO,
      name: 'Test Batch Pagos Query',
      sqlQuery: 'SELECT * FROM comprobantes_pagos',
      isActive: true,
    });

    // Act: Execute sync
    const result = await syncEngine.syncQuery(queryId);

    // Assert: Verify result
    expect(result.status).toBe('success');
    expect(result.recordsFetched).toBe(6);
    expect(result.recordsSent).toBe(6);
    expect(result.recordsFailed).toBe(0);

    // Verify all pagos were sent
    const allCalls = mockApiClient.comprobantesPagos.sendBatch.mock.calls;
    const totalSent = allCalls.reduce((sum, call) => sum + call[0].length, 0);
    expect(totalSent).toBe(6);
  });

  it('should handle empty result set gracefully', async () => {
    // Arrange: No data returned
    const mockQueryResult: IQueryResult = {
      rows: [],
      rowCount: 0,
      executionTimeMs: 5,
    };

    vi.spyOn(mockAdapter, 'executeQuery').mockResolvedValue(mockQueryResult);

    // Create query
    const queryId = await QueriesRepo.createQuery({
      entityType: EntityType.COMPROBANTE_PAGO,
      name: 'Test Empty Result Query',
      sqlQuery: 'SELECT * FROM comprobantes_pagos WHERE 1 = 0',
      isActive: true,
    });

    // Act: Execute sync
    const result = await syncEngine.syncQuery(queryId);

    // Assert: Should succeed with 0 records
    expect(result.status).toBe('success');
    expect(result.recordsFetched).toBe(0);
    expect(result.recordsSent).toBe(0);
    expect(result.recordsFailed).toBe(0);

    // API client should not be called for empty results
    expect(mockApiClient.comprobantesPagos.sendBatch).not.toHaveBeenCalled();
  });
});
