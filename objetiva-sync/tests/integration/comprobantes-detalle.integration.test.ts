/**
 * Integration tests for Comprobantes Detalle sync flow (TEST-03)
 * Tests the complete pipeline: fetch -> transform -> send to gateway
 */

import { describe, it, expect, beforeAll, beforeEach, afterEach, vi } from 'vitest';
import { loadEnv } from '../../src/config/env.js';
import { SyncEngine } from '../../src/sync/sync-engine.js';
import { initSyncQueue } from '../../src/sync/sync-queue-instance.js';
import { initSyncQueue } from '../../src/sync/sync-queue-instance.js';
import { createMockApiClient } from '../helpers/gateway-mock.js';
import { createComprobanteCabecera, createComprobanteDetalle, resetCounter } from '../fixtures/test-data.js';
import { EntityType } from '../../src/types/common.js';
import type { IDataSourceAdapter, IQueryResult } from '../../src/adapters/types.js';
import type { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import { injectTestDatabase } from '../helpers/db-injector.js';
import * as schema from '../../src/store/schema.js';
import { createTestDb, clearTestDb, closeTestDb } from '../helpers/test-db.js';
import * as QueriesRepo from '../../src/store/repositories/queries-repo.js';

describe('Comprobantes Detalle Integration Tests', () => {
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

  it('should sync detalle linked to existing cabecera', async () => {
    // Arrange: Create cabecera and detalle
    const cabecera = createComprobanteCabecera();
    const detalle = createComprobanteDetalle(cabecera, 1, {
      nombre_articulo: 'Test Product Line 1',
      unidades: 3,
      precio_unitario: 50000.00,
    });

    const mockQueryResult: IQueryResult = {
      rows: [detalle],
      rowCount: 1,
      executionTimeMs: 10,
    };

    vi.spyOn(mockAdapter, 'executeQuery').mockResolvedValue(mockQueryResult);

    // Create query in database
    const queryId = await QueriesRepo.createQuery({
      entityType: EntityType.COMPROBANTE_DETALLE,
      name: 'Test Single Detalle Query',
      sqlQuery: 'SELECT * FROM comprobantes_detalle WHERE id = 1',
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
    expect(mockApiClient.comprobantesDetalle.sendBatch).toHaveBeenCalledTimes(1);

    // Verify detalle is linked to correct cabecera
    const sentData = mockApiClient.comprobantesDetalle.sendBatch.mock.calls[0][0][0];
    expect(sentData.comprobante_operacion).toBe(cabecera.operacion);
    expect(sentData.comprobante_formulario).toBe(cabecera.formulario);
    expect(sentData.comprobante_numero).toBe(cabecera.numero);
  });

  it('should sync batch with multiple cabeceras', async () => {
    // Arrange: Create 3 cabeceras with 2 detalles each (6 total)
    const cabecera1 = createComprobanteCabecera();
    const cabecera2 = createComprobanteCabecera();
    const cabecera3 = createComprobanteCabecera();

    const detalles = [
      createComprobanteDetalle(cabecera1, 1),
      createComprobanteDetalle(cabecera1, 2),
      createComprobanteDetalle(cabecera2, 1),
      createComprobanteDetalle(cabecera2, 2),
      createComprobanteDetalle(cabecera3, 1),
      createComprobanteDetalle(cabecera3, 2),
    ];

    const mockQueryResult: IQueryResult = {
      rows: detalles,
      rowCount: 6,
      executionTimeMs: 20,
    };

    vi.spyOn(mockAdapter, 'executeQuery').mockResolvedValue(mockQueryResult);

    // Create query in database
    const queryId = await QueriesRepo.createQuery({
      entityType: EntityType.COMPROBANTE_DETALLE,
      name: 'Test Batch Detalles Query',
      sqlQuery: 'SELECT * FROM comprobantes_detalle',
      isActive: true,
    });

    // Act: Execute sync
    const result = await syncEngine.syncQuery(queryId);

    // Assert: Verify result
    expect(result.status).toBe('success');
    expect(result.recordsFetched).toBe(6);
    expect(result.recordsSent).toBe(6);
    expect(result.recordsFailed).toBe(0);

    // Verify all detalles were sent
    const allCalls = mockApiClient.comprobantesDetalle.sendBatch.mock.calls;
    const totalSent = allCalls.reduce((sum, call) => sum + call[0].length, 0);
    expect(totalSent).toBe(6);
  });

  it('should handle decimal precision correctly', async () => {
    // Arrange: Create detalle with precise decimal values
    const cabecera = createComprobanteCabecera();
    const detalle = createComprobanteDetalle(cabecera, 1, {
      unidades: 2.5,
      precio_unitario: 12345.67,
      importe_bruto: 30864.175, // 2.5 × 12345.67
      importe_descuento: 0,
      importe_neto: 30864.175,
      alicuota_iva: 21,
      importe_iva: 6481.48, // 30864.175 × 0.21
      importe_total: 37345.65, // 30864.175 + 6481.48 (rounded)
    });

    const mockQueryResult: IQueryResult = {
      rows: [detalle],
      rowCount: 1,
      executionTimeMs: 10,
    };

    vi.spyOn(mockAdapter, 'executeQuery').mockResolvedValue(mockQueryResult);

    // Create query
    const queryId = await QueriesRepo.createQuery({
      entityType: EntityType.COMPROBANTE_DETALLE,
      name: 'Test Decimal Precision Query',
      sqlQuery: 'SELECT * FROM comprobantes_detalle WHERE id = 1',
      isActive: true,
    });

    // Act: Execute sync
    const result = await syncEngine.syncQuery(queryId);

    // Assert: Verify result
    expect(result.status).toBe('success');
    expect(result.recordsSent).toBe(1);

    // Verify decimal precision preserved
    const sentData = mockApiClient.comprobantesDetalle.sendBatch.mock.calls[0][0][0];
    expect(sentData.unidades).toBe(2.5);
    expect(sentData.precio_unitario).toBe(12345.67);
    expect(sentData.importe_total).toBeCloseTo(37345.65, 2);
  });

  it('should validate mathematical coherence of line totals', async () => {
    // Arrange: Create detalle with incoherent calculations
    const cabecera = createComprobanteCabecera();
    const invalidDetalle = {
      erp_operacion: cabecera.erp_operacion,
      erp_formulario: cabecera.erp_formulario,
      erp_numero: cabecera.erp_numero,
      comprobante_operacion: cabecera.operacion,
      comprobante_formulario: cabecera.formulario,
      comprobante_numero: cabecera.numero,
      linea_numero: 1,
      codigo_articulo: 'ART-001',
      nombre_articulo: 'Test Product',
      unidades: 2,
      precio_unitario: 50000.00,
      importe_bruto: 99999.00, // WRONG: should be 100000 (2 × 50000)
      importe_descuento: 0,
      importe_neto: 100000.00,
      alicuota_iva: 21,
      importe_iva: 21000.00,
      importe_total: 121000.00,
    };

    const mockQueryResult: IQueryResult = {
      rows: [invalidDetalle],
      rowCount: 1,
      executionTimeMs: 10,
    };

    vi.spyOn(mockAdapter, 'executeQuery').mockResolvedValue(mockQueryResult);

    // Create query
    const queryId = await QueriesRepo.createQuery({
      entityType: EntityType.COMPROBANTE_DETALLE,
      name: 'Test Math Validation Query',
      sqlQuery: 'SELECT * FROM comprobantes_detalle WHERE id = 1',
      isActive: true,
    });

    // Act: Execute sync
    const result = await syncEngine.syncQuery(queryId);

    // Assert: Should fail validation due to mathematical incoherence
    expect(result.status).toBe('failed');
    expect(result.recordsFailed).toBeGreaterThan(0);

    // API client should not be called for invalid data
    expect(mockApiClient.comprobantesDetalle.sendBatch).not.toHaveBeenCalled();
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
      entityType: EntityType.COMPROBANTE_DETALLE,
      name: 'Test Empty Result Query',
      sqlQuery: 'SELECT * FROM comprobantes_detalle WHERE 1 = 0',
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
    expect(mockApiClient.comprobantesDetalle.sendBatch).not.toHaveBeenCalled();
  });
});
