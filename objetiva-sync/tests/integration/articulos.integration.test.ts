/**
 * Integration tests for Articulos sync flow (TEST-01)
 * Tests the complete pipeline: fetch -> transform -> send to gateway
 */

import { describe, it, expect, beforeAll, beforeEach, afterEach, vi } from 'vitest';
import { loadEnv } from '../../src/config/env.js';
import { SyncEngine } from '../../src/sync/sync-engine.js';
import { initSyncQueue } from '../../src/sync/sync-queue-instance.js';
import { createMockApiClient } from '../helpers/gateway-mock.js';
import { createArticulo, createArticuloBatch, resetCounter } from '../fixtures/test-data.js';
import { EntityType } from '../../src/types/common.js';
import type { IDataSourceAdapter, IQueryResult } from '../../src/adapters/types.js';
import type { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import * as schema from '../../src/store/schema.js';
import { createTestDb, clearTestDb, closeTestDb } from '../helpers/test-db.js';
import { injectTestDatabase } from '../helpers/db-injector.js';
import * as QueriesRepo from '../../src/store/repositories/queries-repo.js';

describe('Articulos Integration Tests', () => {
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

  it('should sync a single articulo successfully', async () => {
    // Arrange: Create test articulo
    const testArticulo = createArticulo({
      nombre: 'Test Product Single',
      precio: 50000,
    });

    // Mock adapter to return our test data
    const mockQueryResult: IQueryResult = {
      rows: [testArticulo],
      rowCount: 1,
      executionTimeMs: 10,
    };

    vi.spyOn(mockAdapter, 'executeQuery').mockResolvedValue(mockQueryResult);

    // Create query in database
    const queryId = await QueriesRepo.createQuery({
      entityType: EntityType.ARTICULO,
      name: 'Test Single Articulo Query',
      sqlQuery: 'SELECT * FROM articulos WHERE id = 1',
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
    expect(mockApiClient.articulos.sendBatch).toHaveBeenCalledTimes(1);
    expect(mockApiClient.articulos.sendBatch).toHaveBeenCalledWith(
      [testArticulo],
      expect.objectContaining({
        queryId,
        queryName: 'Test Single Articulo Query',
      }),
      undefined
    );
  });

  it('should sync a batch of 50 articulos successfully', async () => {
    // Arrange: Create batch of 50 articulos
    const testBatch = createArticuloBatch(50, {
      rubro: 'Informática',
      subrubro: 'Notebooks',
    });

    const mockQueryResult: IQueryResult = {
      rows: testBatch,
      rowCount: 50,
      executionTimeMs: 100,
    };

    vi.spyOn(mockAdapter, 'executeQuery').mockResolvedValue(mockQueryResult);

    // Create query in database
    const queryId = await QueriesRepo.createQuery({
      entityType: EntityType.ARTICULO,
      name: 'Test Batch Articulos Query',
      sqlQuery: 'SELECT * FROM articulos WHERE rubro = \'Informática\'',
      isActive: true,
    });

    // Act: Execute sync
    const result = await syncEngine.syncQuery(queryId);

    // Assert: Verify result
    expect(result.status).toBe('success');
    expect(result.recordsFetched).toBe(50);
    expect(result.recordsSent).toBe(50);
    expect(result.recordsFailed).toBe(0);

    // Verify API client was called
    expect(mockApiClient.articulos.sendBatch).toHaveBeenCalled();

    // Verify batch contains all records
    const allCalls = mockApiClient.articulos.sendBatch.mock.calls;
    const totalSent = allCalls.reduce((sum, call) => sum + call[0].length, 0);
    expect(totalSent).toBe(50);
  });

  it('should update existing articulo (incremental sync)', async () => {
    // Arrange: Create updated articulo
    const updatedArticulo = createArticulo({
      erp_codigo: 'ART-EXISTING-001',
      nombre: 'Updated Product',
      precio: 75000, // price updated
    });

    const mockQueryResult: IQueryResult = {
      rows: [updatedArticulo],
      rowCount: 1,
      executionTimeMs: 10,
    };

    vi.spyOn(mockAdapter, 'executeQuery').mockResolvedValue(mockQueryResult);

    // Create query with incremental field
    const queryId = await QueriesRepo.createQuery({
      entityType: EntityType.ARTICULO,
      name: 'Test Incremental Articulos Query',
      sqlQuery: 'SELECT * FROM articulos WHERE updated_at > @lastSync',
      incrementalField: 'updated_at',
      isActive: true,
    });

    // Simulate API client recognizing it as an update
    const mockUpdateResult = {
      success: true,
      inserted: 0,
      updated: 1,
      errors: [],
    };

    vi.spyOn(mockApiClient.articulos, 'sendBatch').mockResolvedValue(mockUpdateResult);

    // Act: Execute sync
    const result = await syncEngine.syncQuery(queryId);

    // Assert: Verify result
    expect(result.status).toBe('success');
    expect(result.recordsFetched).toBe(1);
    expect(result.recordsSent).toBe(1); // inserted + updated
    expect(result.recordsFailed).toBe(0);
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
      entityType: EntityType.ARTICULO,
      name: 'Test Empty Result Query',
      sqlQuery: 'SELECT * FROM articulos WHERE 1 = 0',
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
    expect(mockApiClient.articulos.sendBatch).not.toHaveBeenCalled();
  });

  it('should validate data against schema before sending', async () => {
    // Arrange: Create invalid articulo (missing required fields)
    const invalidArticulo = {
      nombre: 'Invalid Product',
      precio: 50000,
      // Missing required: erp_codigo, erp_nombre
    };

    const mockQueryResult: IQueryResult = {
      rows: [invalidArticulo],
      rowCount: 1,
      executionTimeMs: 10,
    };

    vi.spyOn(mockAdapter, 'executeQuery').mockResolvedValue(mockQueryResult);

    // Create query
    const queryId = await QueriesRepo.createQuery({
      entityType: EntityType.ARTICULO,
      name: 'Test Validation Query',
      sqlQuery: 'SELECT * FROM articulos WHERE id = 1',
      isActive: true,
    });

    // Act: Execute sync
    const result = await syncEngine.syncQuery(queryId);

    // Assert: Should fail validation
    expect(result.status).toBe('failed');
    expect(result.recordsFailed).toBeGreaterThan(0);

    // API client should not be called for invalid data
    expect(mockApiClient.articulos.sendBatch).not.toHaveBeenCalled();
  });
});
