/**
 * Tests para verificar que SyncEngine pasa metadata correctamente a los API clients
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { SyncEngine } from '../sync/sync-engine.js';
import { EntityType, SyncType, LogStatus } from '../types/common.js';

// Mock de todos los modulos necesarios
vi.mock('../store/repositories/queries-repo.js');
vi.mock('../store/repositories/sync-state-repo.js');
vi.mock('../store/repositories/sync-logs-repo.js');
vi.mock('../utils/logger.js', () => ({
  logger: {
    info: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
    debug: vi.fn(),
  },
}));

describe('SyncEngine - Metadata Passing', () => {
  let syncEngine: SyncEngine;
  let mockAdapter: any;
  let mockApiClient: any;

  beforeEach(async () => {
    // Mock adapter
    mockAdapter = {
      testConnection: vi.fn().mockResolvedValue({ success: true }),
      executeQuery: vi.fn().mockResolvedValue({
        rows: [
          { sku: 'TEST-001', nombre: 'Test Product', objeto: 'producto' },
        ],
        rowCount: 1,
      }),
    };

    // Mock API client
    mockApiClient = {
      articulos: {
        sendBatch: vi.fn().mockResolvedValue({
          success: true,
          inserted: 1,
          updated: 0,
          errors: [],
        }),
      },
      comprobantes: {
        sendBatch: vi.fn().mockResolvedValue({
          success: true,
          inserted: 1,
          updated: 0,
          errors: [],
        }),
      },
      comprobantesDetalle: {
        sendBatch: vi.fn().mockResolvedValue({
          success: true,
          inserted: 1,
          updated: 0,
          errors: [],
        }),
      },
      comprobantesPagos: {
        sendBatch: vi.fn().mockResolvedValue({
          success: true,
          inserted: 1,
          updated: 0,
          errors: [],
        }),
      },
    };

    // Create SyncEngine instance
    syncEngine = new SyncEngine({
      dataSourceAdapter: mockAdapter,
      apiClient: mockApiClient,
      defaultBatchSize: 100,
    });

    // Mock repository functions
    const QueriesRepo = await import('../store/repositories/queries-repo.js');
    const SyncStateRepo = await import('../store/repositories/sync-state-repo.js');
    const SyncLogsRepo = await import('../store/repositories/sync-logs-repo.js');

    vi.mocked(QueriesRepo.getQuery).mockResolvedValue({
      id: 42,
      name: 'Test Query - Articulos Principal',
      entityType: EntityType.ARTICULO,
      sqlQuery: 'SELECT * FROM articulos',
      isActive: true,
      incrementalField: 'updated_at',
      incrementalType: null,
      joinField: null,
      connectionId: null,
      displayOrder: 1,
      syncInterval: 3600,
      isScheduled: false,
      lastTestStatus: null,
      lastTestAt: null,
      lastTestRowCount: null,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });

    vi.mocked(SyncStateRepo.getSyncState).mockResolvedValue(null);
    vi.mocked(SyncStateRepo.markSyncAsRunning).mockResolvedValue(undefined);
    vi.mocked(SyncStateRepo.markSyncAsSuccess).mockResolvedValue(undefined);

    vi.mocked(SyncLogsRepo.createLog).mockResolvedValue(1);
    vi.mocked(SyncLogsRepo.updateLog).mockResolvedValue(undefined);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('should pass metadata to API client when syncing by queryId', async () => {
    const result = await syncEngine.syncQuery(42, {
      syncType: SyncType.FULL,
    });

    // Verify API client was called with metadata
    expect(mockApiClient.articulos.sendBatch).toHaveBeenCalledTimes(1);
    const callArgs = mockApiClient.articulos.sendBatch.mock.calls[0];

    // First argument is the batch data
    expect(callArgs[0]).toEqual([
      { sku: 'TEST-001', nombre: 'Test Product', objeto: 'producto' },
    ]);

    // Second argument is the metadata
    expect(callArgs[1]).toEqual({
      queryId: 42,
      queryName: 'Test Query - Articulos Principal',
    });

    expect(result.status).toBe(LogStatus.SUCCESS);
  });

  it('should pass metadata through legacy syncArticulos method', async () => {
    const QueriesRepo = await import('../store/repositories/queries-repo.js');

    vi.mocked(QueriesRepo.getActiveQueryByEntity).mockResolvedValue({
      id: 100,
      name: 'Active Query for Articulos',
      entityType: EntityType.ARTICULO,
      sqlQuery: 'SELECT * FROM articulos WHERE active = 1',
      isActive: true,
      incrementalField: 'updated_at',
      incrementalType: null,
      joinField: null,
      connectionId: null,
      displayOrder: 1,
      syncInterval: 3600,
      isScheduled: true,
      lastTestStatus: null,
      lastTestAt: null,
      lastTestRowCount: null,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });

    // Mock getQuery for the specific query
    vi.mocked(QueriesRepo.getQuery).mockResolvedValue({
      id: 100,
      name: 'Active Query for Articulos',
      entityType: EntityType.ARTICULO,
      sqlQuery: 'SELECT * FROM articulos WHERE active = 1',
      isActive: true,
      incrementalField: 'updated_at',
      incrementalType: null,
      joinField: null,
      connectionId: null,
      displayOrder: 1,
      syncInterval: 3600,
      isScheduled: true,
      lastTestStatus: null,
      lastTestAt: null,
      lastTestRowCount: null,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });

    await syncEngine.syncArticulos({ syncType: SyncType.FULL });

    // Verify metadata was passed
    expect(mockApiClient.articulos.sendBatch).toHaveBeenCalledTimes(1);
    const callArgs = mockApiClient.articulos.sendBatch.mock.calls[0];

    expect(callArgs[1]).toEqual({
      queryId: 100,
      queryName: 'Active Query for Articulos',
    });
  });

  it('should pass metadata for different entity types', async () => {
    const QueriesRepo = await import('../store/repositories/queries-repo.js');

    // Test comprobantes
    vi.mocked(QueriesRepo.getQuery).mockResolvedValue({
      id: 200,
      name: 'Comprobantes Factura A',
      entityType: EntityType.COMPROBANTE_CABECERA,
      sqlQuery: 'SELECT * FROM comprobantes',
      isActive: true,
      incrementalField: 'fecha',
      incrementalType: null,
      joinField: null,
      connectionId: null,
      displayOrder: 2,
      syncInterval: 1800,
      isScheduled: true,
      lastTestStatus: null,
      lastTestAt: null,
      lastTestRowCount: null,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });

    mockAdapter.executeQuery.mockResolvedValue({
      rows: [
        {
          erp_operacion: 'FC',
          erp_formulario: 'A',
          erp_numero: '00001',
          operacion: 'FC',
          formulario: 'A',
          numero: '00001',
          fecha: '2025-01-01T00:00:00.000Z',
          cantidad_items: 1,
          total_bruto: 100,
          total_descuentos: 0,
          total_neto: 100,
          total_iva: 21,
          total_venta: 121,
        },
      ],
      rowCount: 1,
    });

    await syncEngine.syncQuery(200);

    expect(mockApiClient.comprobantes.sendBatch).toHaveBeenCalledTimes(1);
    const callArgs = mockApiClient.comprobantes.sendBatch.mock.calls[0];

    expect(callArgs[1]).toEqual({
      queryId: 200,
      queryName: 'Comprobantes Factura A',
    });
  });

  it('should handle metadata with special characters in query name', async () => {
    const QueriesRepo = await import('../store/repositories/queries-repo.js');

    vi.mocked(QueriesRepo.getQuery).mockResolvedValue({
      id: 42,
      name: 'Query "Special" & Characters - Test',
      entityType: EntityType.ARTICULO,
      sqlQuery: 'SELECT * FROM articulos',
      isActive: true,
      incrementalField: 'updated_at',
      incrementalType: null,
      joinField: null,
      connectionId: null,
      displayOrder: 1,
      syncInterval: 3600,
      isScheduled: false,
      lastTestStatus: null,
      lastTestAt: null,
      lastTestRowCount: null,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });

    await syncEngine.syncQuery(42);

    const callArgs = mockApiClient.articulos.sendBatch.mock.calls[0];
    expect(callArgs[1].queryName).toBe('Query "Special" & Characters - Test');
  });

  it('should log query metadata in sync operations', async () => {
    const { logger } = await import('../utils/logger.js');

    await syncEngine.syncQuery(42);

    // Verify logger was called with query information
    expect(logger.info).toHaveBeenCalledWith(
      expect.objectContaining({
        queryId: 42,
        queryName: 'Test Query - Articulos Principal',
      }),
      expect.any(String)
    );
  });
});
