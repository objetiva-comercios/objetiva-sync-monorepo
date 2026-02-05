/**
 * Integration test para verificar el flujo completo de sincronizacion query-based
 */

import { describe, it, expect, vi, beforeEach, beforeAll } from 'vitest';
import { SyncEngine } from '../sync/sync-engine.js';
import { EntityType, SyncType, LogStatus } from '../types/common.js';
import * as QueriesRepo from '../store/repositories/queries-repo.js';
import * as SyncStateRepo from '../store/repositories/sync-state-repo.js';
import { initDatabase, getDatabase } from '../store/index.js';
import * as schema from '../store/schema.js';

// Mock logger
vi.mock('../utils/logger.js', () => ({
  logger: {
    info: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
    debug: vi.fn(),
  },
}));

describe('Integration: Query-based Sync Flow', () => {
  let syncEngine: SyncEngine;
  let mockAdapter: any;
  let mockApiClient: any;
  let capturedMetadata: Array<{ queryId: number; queryName: string }> = [];

  beforeAll(async () => {
    // Initialize test database (uses env config)
    initDatabase();
  });

  beforeEach(async () => {
    const db = getDatabase();

    // Clean tables
    await db.delete(schema.syncLogs);
    await db.delete(schema.syncState);
    await db.delete(schema.queries);

    capturedMetadata = [];

    // Mock adapter
    mockAdapter = {
      testConnection: vi.fn().mockResolvedValue({ success: true }),
      executeQuery: vi.fn().mockImplementation((sqlQuery: string) => {
        // Return different data based on query
        if (sqlQuery.includes('articulos')) {
          return Promise.resolve({
            rows: [
              { sku: 'ART-001', nombre: 'Producto 1', objeto: 'producto' },
              { sku: 'ART-002', nombre: 'Producto 2', objeto: 'servicio' },
            ],
            rowCount: 2,
          });
        } else if (sqlQuery.includes('comprobantes')) {
          return Promise.resolve({
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
        }
        return Promise.resolve({ rows: [], rowCount: 0 });
      }),
    };

    // Mock API client with metadata capture
    mockApiClient = {
      articulos: {
        sendBatch: vi.fn().mockImplementation((batch: any, metadata: any) => {
          if (metadata) {
            capturedMetadata.push({ ...metadata });
          }
          return Promise.resolve({
            success: true,
            inserted: batch.length,
            updated: 0,
            errors: [],
          });
        }),
      },
      comprobantes: {
        sendBatch: vi.fn().mockImplementation((batch: any, metadata: any) => {
          if (metadata) {
            capturedMetadata.push({ ...metadata });
          }
          return Promise.resolve({
            success: true,
            inserted: batch.length,
            updated: 0,
            errors: [],
          });
        }),
      },
      comprobantesDetalle: {
        sendBatch: vi.fn().mockResolvedValue({
          success: true,
          inserted: 0,
          updated: 0,
          errors: [],
        }),
      },
      comprobantesPagos: {
        sendBatch: vi.fn().mockResolvedValue({
          success: true,
          inserted: 0,
          updated: 0,
          errors: [],
        }),
      },
    };

    syncEngine = new SyncEngine({
      dataSourceAdapter: mockAdapter,
      apiClient: mockApiClient,
      defaultBatchSize: 100,
    });
  });

  it('should complete full sync flow with metadata', async () => {
    // 1. Create query
    const queryId = await QueriesRepo.createQuery({
      name: 'Articulos Principal - Full Sync',
      entityType: EntityType.ARTICULO,
      sqlQuery: 'SELECT * FROM articulos',
      incrementalField: 'updated_at',
      isActive: true,
    });

    // 2. Execute sync
    const result = await syncEngine.syncQuery(queryId, {
      syncType: SyncType.FULL,
    });

    // 3. Verify sync result
    expect(result.status).toBe(LogStatus.SUCCESS);
    expect(result.recordsFetched).toBe(2);
    expect(result.recordsSent).toBe(2);
    expect(result.recordsFailed).toBe(0);

    // 4. Verify metadata was passed to API client
    expect(capturedMetadata).toHaveLength(1);
    expect(capturedMetadata[0]!).toEqual({
      queryId,
      queryName: 'Articulos Principal - Full Sync',
    });

    // 5. Verify sync state was updated
    const syncState = await SyncStateRepo.getSyncState(queryId);
    expect(syncState?.status).toBe('success');
    expect(syncState?.lastSyncCount).toBe(2);

    // 6. Verify log was created
    const db = getDatabase();
    const logs = await db
      .select()
      .from(schema.syncLogs);

    const queryLogs = logs.filter(l => l.queryId === queryId);
    expect(queryLogs).toHaveLength(1);
    expect(queryLogs[0]!.queryId).toBe(queryId);
    expect(queryLogs[0]!.queryName).toBe('Articulos Principal - Full Sync');
    expect(queryLogs[0]!.status).toBe(LogStatus.SUCCESS);
    expect(queryLogs[0]!.recordsFetched).toBe(2);
    expect(queryLogs[0]!.recordsSent).toBe(2);
  });

  it('should handle multiple queries for same entity independently', async () => {
    // Create two queries for articulos
    const query1Id = await QueriesRepo.createQuery({
      name: 'Articulos Categoria A',
      entityType: EntityType.ARTICULO,
      sqlQuery: 'SELECT * FROM articulos WHERE categoria = A',
      isActive: true,
    });

    const query2Id = await QueriesRepo.createQuery({
      name: 'Articulos Categoria B',
      entityType: EntityType.ARTICULO,
      sqlQuery: 'SELECT * FROM articulos WHERE categoria = B',
      isActive: true,
    });

    // Execute both syncs
    const result1 = await syncEngine.syncQuery(query1Id);
    const result2 = await syncEngine.syncQuery(query2Id);

    // Verify both succeeded
    expect(result1.status).toBe(LogStatus.SUCCESS);
    expect(result2.status).toBe(LogStatus.SUCCESS);

    // Verify different metadata was passed
    expect(capturedMetadata).toHaveLength(2);
    expect(capturedMetadata[0]!.queryId).toBe(query1Id);
    expect(capturedMetadata[0]!.queryName).toBe('Articulos Categoria A');
    expect(capturedMetadata[1]!.queryId).toBe(query2Id);
    expect(capturedMetadata[1]!.queryName).toBe('Articulos Categoria B');

    // Verify separate sync states
    const state1 = await SyncStateRepo.getSyncState(query1Id);
    const state2 = await SyncStateRepo.getSyncState(query2Id);

    expect(state1?.queryId).toBe(query1Id);
    expect(state2?.queryId).toBe(query2Id);
    expect(state1?.status).toBe('success');
    expect(state2?.status).toBe('success');

    // Verify separate logs
    const db = getDatabase();
    const allLogs = await db
      .select()
      .from(schema.syncLogs);

    const logs1 = allLogs.filter(l => l.queryId === query1Id);
    const logs2 = allLogs.filter(l => l.queryId === query2Id);

    expect(logs1).toHaveLength(1);
    expect(logs2).toHaveLength(1);
    expect(logs1[0]!.queryName).toBe('Articulos Categoria A');
    expect(logs2[0]!.queryName).toBe('Articulos Categoria B');
  });

  it('should sync multiple entity types with correct metadata', async () => {
    // Create queries for different entities
    const articulosQueryId = await QueriesRepo.createQuery({
      name: 'Productos y Servicios',
      entityType: EntityType.ARTICULO,
      sqlQuery: 'SELECT * FROM articulos',
      isActive: true,
    });

    const comprobantesQueryId = await QueriesRepo.createQuery({
      name: 'Facturas Tipo A',
      entityType: EntityType.COMPROBANTE_CABECERA,
      sqlQuery: 'SELECT * FROM comprobantes WHERE tipo = A',
      isActive: true,
    });

    // Execute syncs
    await syncEngine.syncQuery(articulosQueryId);
    await syncEngine.syncQuery(comprobantesQueryId);

    // Verify correct metadata for each entity type
    expect(capturedMetadata).toHaveLength(2);

    // First call: articulos
    expect(capturedMetadata[0]!.queryId).toBe(articulosQueryId);
    expect(capturedMetadata[0]!.queryName).toBe('Productos y Servicios');

    // Second call: comprobantes
    expect(capturedMetadata[1]!.queryId).toBe(comprobantesQueryId);
    expect(capturedMetadata[1]!.queryName).toBe('Facturas Tipo A');

    // Verify correct API clients were called
    expect(mockApiClient.articulos.sendBatch).toHaveBeenCalledTimes(1);
    expect(mockApiClient.comprobantes.sendBatch).toHaveBeenCalledTimes(1);
  });

  it('should use legacy methods with metadata (backward compatibility)', async () => {
    // Create active query for articulos
    const queryId = await QueriesRepo.createQuery({
      name: 'Articulos Legacy Method',
      entityType: EntityType.ARTICULO,
      sqlQuery: 'SELECT * FROM articulos',
      isActive: true,
    });

    // Call legacy method
    const result = await syncEngine.syncArticulos({
      syncType: SyncType.FULL,
    });

    // Verify it worked and passed metadata
    expect(result.status).toBe(LogStatus.SUCCESS);
    expect(capturedMetadata).toHaveLength(1);
    expect(capturedMetadata[0]!.queryId).toBe(queryId);
    expect(capturedMetadata[0]!.queryName).toBe('Articulos Legacy Method');
  });
});
