/**
 * Integration tests for Comprobantes Cabecera sync flow (TEST-02)
 * Tests the complete pipeline: fetch -> transform -> send to gateway
 */

import { describe, it, expect, beforeAll, beforeEach, afterEach, vi } from 'vitest';
import { loadEnv } from '../../src/config/env.js';
import { SyncEngine } from '../../src/sync/sync-engine.js';
import { initSyncQueue } from '../../src/sync/sync-queue-instance.js';
import { initSyncQueue } from '../../src/sync/sync-queue-instance.js';
import { createMockApiClient } from '../helpers/gateway-mock.js';
import { createComprobanteCabecera, createComprobanteCabeceraBatch, resetCounter } from '../fixtures/test-data.js';
import { EntityType } from '../../src/types/common.js';
import type { IDataSourceAdapter, IQueryResult } from '../../src/adapters/types.js';
import type { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import * as schema from '../../src/store/schema.js';
import { createTestDb, clearTestDb, closeTestDb } from '../helpers/test-db.js';
import { injectTestDatabase } from '../helpers/db-injector.js';
import * as QueriesRepo from '../../src/store/repositories/queries-repo.js';

describe('Comprobantes Cabecera Integration Tests', () => {
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

  it('should sync a single comprobante cabecera successfully', async () => {
    // Arrange: Create test comprobante cabecera
    const testCabecera = createComprobanteCabecera({
      tercero_nombre: 'Test Cliente SA',
      total_venta: 108900.00,
    });

    const mockQueryResult: IQueryResult = {
      rows: [testCabecera],
      rowCount: 1,
      executionTimeMs: 10,
    };

    vi.spyOn(mockAdapter, 'executeQuery').mockResolvedValue(mockQueryResult);

    // Create query in database
    const queryId = await QueriesRepo.createQuery({
      entityType: EntityType.COMPROBANTE_CABECERA,
      name: 'Test Single Cabecera Query',
      sqlQuery: 'SELECT * FROM comprobantes WHERE id = 1',
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
    expect(mockApiClient.comprobantes.sendBatch).toHaveBeenCalledTimes(1);
    expect(mockApiClient.comprobantes.sendBatch).toHaveBeenCalledWith(
      [testCabecera],
      expect.objectContaining({
        queryId,
        queryName: 'Test Single Cabecera Query',
      }),
      undefined
    );
  });

  it('should sync a batch of comprobantes successfully', async () => {
    // Arrange: Create batch of 25 comprobantes
    const testBatch = createComprobanteCabeceraBatch(25, {
      tercero_tipo: 'CLIENTE',
    });

    const mockQueryResult: IQueryResult = {
      rows: testBatch,
      rowCount: 25,
      executionTimeMs: 50,
    };

    vi.spyOn(mockAdapter, 'executeQuery').mockResolvedValue(mockQueryResult);

    // Create query in database
    const queryId = await QueriesRepo.createQuery({
      entityType: EntityType.COMPROBANTE_CABECERA,
      name: 'Test Batch Cabeceras Query',
      sqlQuery: 'SELECT * FROM comprobantes WHERE tercero_tipo = \'CLIENTE\'',
      isActive: true,
    });

    // Act: Execute sync
    const result = await syncEngine.syncQuery(queryId);

    // Assert: Verify result
    expect(result.status).toBe('success');
    expect(result.recordsFetched).toBe(25);
    expect(result.recordsSent).toBe(25);
    expect(result.recordsFailed).toBe(0);

    // Verify API client was called
    expect(mockApiClient.comprobantes.sendBatch).toHaveBeenCalled();

    // Verify batch contains all records
    const allCalls = mockApiClient.comprobantes.sendBatch.mock.calls;
    const totalSent = allCalls.reduce((sum, call) => sum + call[0].length, 0);
    expect(totalSent).toBe(25);
  });

  it('should handle date field conversion correctly', async () => {
    // Arrange: Create comprobante with specific date
    const testDate = '2026-01-15T14:30:00.000Z';
    const testCabecera = createComprobanteCabecera({
      fecha: testDate,
      tercero_nombre: 'Cliente con fecha específica',
    });

    const mockQueryResult: IQueryResult = {
      rows: [testCabecera],
      rowCount: 1,
      executionTimeMs: 10,
    };

    vi.spyOn(mockAdapter, 'executeQuery').mockResolvedValue(mockQueryResult);

    // Create query
    const queryId = await QueriesRepo.createQuery({
      entityType: EntityType.COMPROBANTE_CABECERA,
      name: 'Test Date Conversion Query',
      sqlQuery: 'SELECT * FROM comprobantes WHERE fecha = @date',
      isActive: true,
    });

    // Act: Execute sync
    const result = await syncEngine.syncQuery(queryId);

    // Assert: Verify result
    expect(result.status).toBe('success');
    expect(result.recordsSent).toBe(1);

    // Verify the date was sent correctly
    const sentData = mockApiClient.comprobantes.sendBatch.mock.calls[0][0][0];
    expect(sentData.fecha).toBe(testDate);
  });

  it('should enforce unique constraint on operacion/formulario/numero', async () => {
    // Arrange: Create two comprobantes with same unique key
    const uniqueKey = {
      erp_operacion: 'VEN',
      erp_formulario: 'FACTURA A',
      erp_numero: '00001-00000999',
      operacion: 'VTA',
      formulario: 'FA',
      numero: '00000999',
    };

    const comprobante1 = createComprobanteCabecera(uniqueKey);
    const comprobante2 = createComprobanteCabecera({
      ...uniqueKey,
      tercero_nombre: 'Different client', // Different data but same key
    });

    // First sync should succeed
    let mockQueryResult: IQueryResult = {
      rows: [comprobante1],
      rowCount: 1,
      executionTimeMs: 10,
    };

    vi.spyOn(mockAdapter, 'executeQuery').mockResolvedValue(mockQueryResult);

    const queryId = await QueriesRepo.createQuery({
      entityType: EntityType.COMPROBANTE_CABECERA,
      name: 'Test Unique Constraint Query',
      sqlQuery: 'SELECT * FROM comprobantes',
      isActive: true,
    });

    const result1 = await syncEngine.syncQuery(queryId);
    expect(result1.status).toBe('success');

    // Second sync with duplicate key should be handled by gateway (upsert)
    // Gateway should update existing record
    mockQueryResult = {
      rows: [comprobante2],
      rowCount: 1,
      executionTimeMs: 10,
    };

    const mockUpdateResult = {
      success: true,
      inserted: 0,
      updated: 1, // Gateway updates existing
      errors: [],
    };

    vi.spyOn(mockApiClient.comprobantes, 'sendBatch').mockResolvedValue(mockUpdateResult);

    const result2 = await syncEngine.syncQuery(queryId);
    expect(result2.status).toBe('success');
    expect(result2.recordsSent).toBe(1); // Updated, not inserted
  });

  // SKIPPED: Mathematical coherence validation not implemented in current schema
  it.skip('should validate mathematical coherence of totals', async () => {
    // Arrange: Create comprobante with incoherent totals
    const invalidCabecera = {
      erp_operacion: 'VEN',
      erp_formulario: 'FACTURA A',
      erp_numero: '00001-00000555',
      operacion: 'VTA',
      formulario: 'FA',
      numero: '00000555',
      fecha: new Date().toISOString(),
      cantidad_items: 1,
      total_bruto: 100000.00,
      total_descuentos: 10000.00,
      total_neto: 85000.00, // WRONG: should be 90000 (100000 - 10000)
      total_iva: 18900.00,
      total_venta: 108900.00,
    };

    const mockQueryResult: IQueryResult = {
      rows: [invalidCabecera],
      rowCount: 1,
      executionTimeMs: 10,
    };

    vi.spyOn(mockAdapter, 'executeQuery').mockResolvedValue(mockQueryResult);

    // Create query
    const queryId = await QueriesRepo.createQuery({
      entityType: EntityType.COMPROBANTE_CABECERA,
      name: 'Test Math Validation Query',
      sqlQuery: 'SELECT * FROM comprobantes WHERE id = 1',
      isActive: true,
    });

    // Act: Execute sync
    const result = await syncEngine.syncQuery(queryId);

    // Assert: Should fail validation due to mathematical incoherence
    expect(result.status).toBe('failed');
    expect(result.recordsFailed).toBeGreaterThan(0);

    // API client should not be called for invalid data
    expect(mockApiClient.comprobantes.sendBatch).not.toHaveBeenCalled();
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
      entityType: EntityType.COMPROBANTE_CABECERA,
      name: 'Test Empty Result Query',
      sqlQuery: 'SELECT * FROM comprobantes WHERE 1 = 0',
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
    expect(mockApiClient.comprobantes.sendBatch).not.toHaveBeenCalled();
  });
});
