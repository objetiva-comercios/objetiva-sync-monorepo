/**
 * Tests para verificar que los repositorios funcionan con queryId
 */

import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import * as schema from '../store/schema.js';
import * as QueriesRepo from '../store/repositories/queries-repo.js';
import * as SyncStateRepo from '../store/repositories/sync-state-repo.js';
import * as SyncLogsRepo from '../store/repositories/sync-logs-repo.js';
import { EntityType, SyncType, LogStatus } from '../types/common.js';
import { initDatabase, getDatabase } from '../store/index.js';

describe('Repositories - Query-based Operations', () => {
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
  });

  describe('QueriesRepo - Display Order Management', () => {
    it('should create queries with displayOrder', async () => {
      const queryId1 = await QueriesRepo.createQuery({
        name: 'Query 1',
        entityType: EntityType.ARTICULO,
        sqlQuery: 'SELECT * FROM articulos',
        incrementalField: 'updated_at',
        isActive: true,
      });

      const queryId2 = await QueriesRepo.createQuery({
        name: 'Query 2',
        entityType: EntityType.COMPROBANTE_CABECERA,
        sqlQuery: 'SELECT * FROM comprobantes',
        incrementalField: 'fecha',
        isActive: true,
      });

      const queries = await QueriesRepo.getQueriesOrdered();

      expect(queries).toHaveLength(2);
      expect(queries[0]!.id).toBe(queryId1);
      expect(queries[1]!.id).toBe(queryId2);
    });

    it('should reorder queries correctly', async () => {
      const id1 = await QueriesRepo.createQuery({
        name: 'Query 1',
        entityType: EntityType.ARTICULO,
        sqlQuery: 'SELECT 1',
        isActive: true,
      });

      const id2 = await QueriesRepo.createQuery({
        name: 'Query 2',
        entityType: EntityType.COMPROBANTE_CABECERA,
        sqlQuery: 'SELECT 2',
        isActive: true,
      });

      const id3 = await QueriesRepo.createQuery({
        name: 'Query 3',
        entityType: EntityType.COMPROBANTE_DETALLE,
        sqlQuery: 'SELECT 3',
        isActive: true,
      });

      // Reorder: 3, 1, 2
      await QueriesRepo.reorderQueries([id3, id1, id2]);

      const queries = await QueriesRepo.getQueriesOrdered();

      expect(queries[0]!.id).toBe(id3);
      expect(queries[0]!.displayOrder).toBe(0);
      expect(queries[1]!.id).toBe(id1);
      expect(queries[1]!.displayOrder).toBe(1);
      expect(queries[2]!.id).toBe(id2);
      expect(queries[2]!.displayOrder).toBe(2);
    });

    it('should get scheduled queries only', async () => {
      await QueriesRepo.createQuery({
        name: 'Scheduled Query',
        entityType: EntityType.ARTICULO,
        sqlQuery: 'SELECT 1',
        isActive: true,
      });

      // Toggle scheduled after creation
      const scheduledId = (await QueriesRepo.getQueriesOrdered())[0]!.id;
      await QueriesRepo.toggleQueryScheduled(scheduledId, true);

      await QueriesRepo.createQuery({
        name: 'Manual Query',
        entityType: EntityType.COMPROBANTE_CABECERA,
        sqlQuery: 'SELECT 2',
        isActive: true,
      });

      const scheduledQueries = await QueriesRepo.getScheduledQueries();

      expect(scheduledQueries).toHaveLength(1);
      expect(scheduledQueries[0]!.name).toBe('Scheduled Query');
      expect(scheduledQueries[0]!.isScheduled).toBe(true);
    });

    it('should update query scheduling configuration', async () => {
      const queryId = await QueriesRepo.createQuery({
        name: 'Test Query',
        entityType: EntityType.ARTICULO,
        sqlQuery: 'SELECT 1',
        isActive: true,
      });

      // Enable scheduling
      await QueriesRepo.toggleQueryScheduled(queryId, true);
      await QueriesRepo.updateQueryInterval(queryId, 1800);

      const query = await QueriesRepo.getQuery(queryId);

      expect(query?.isScheduled).toBe(true);
      expect(query?.syncInterval).toBe(1800);
    });
  });

  describe('SyncStateRepo - QueryId-based State', () => {
    it('should store sync state by queryId instead of entityType', async () => {
      const queryId = await QueriesRepo.createQuery({
        name: 'Test Query',
        entityType: EntityType.ARTICULO,
        sqlQuery: 'SELECT * FROM articulos',
        isActive: true,
      });

      await SyncStateRepo.markSyncAsRunning(queryId);

      const state = await SyncStateRepo.getSyncState(queryId);

      expect(state).toBeDefined();
      expect(state?.queryId).toBe(queryId);
      expect(state?.status).toBe('running');
    });

    it('should handle multiple queries for same entityType independently', async () => {
      // Create two queries for same entity type
      const query1Id = await QueriesRepo.createQuery({
        name: 'Articulos Query 1',
        entityType: EntityType.ARTICULO,
        sqlQuery: 'SELECT * FROM articulos WHERE category = 1',
        isActive: true,
      });

      const query2Id = await QueriesRepo.createQuery({
        name: 'Articulos Query 2',
        entityType: EntityType.ARTICULO,
        sqlQuery: 'SELECT * FROM articulos WHERE category = 2',
        isActive: true,
      });

      // Mark both as running
      await SyncStateRepo.markSyncAsRunning(query1Id);
      await SyncStateRepo.markSyncAsRunning(query2Id);

      // Update state for query1
      await SyncStateRepo.markSyncAsSuccess(query1Id, {
        lastSyncValue: '2025-01-01',
        recordCount: 10,
      });

      // Verify states are independent
      const state1 = await SyncStateRepo.getSyncState(query1Id);
      const state2 = await SyncStateRepo.getSyncState(query2Id);

      expect(state1?.status).toBe('success');
      expect(state1?.lastSyncValue).toBe('2025-01-01');
      expect(state1?.lastSyncCount).toBe(10);

      expect(state2?.status).toBe('running');
      expect(state2?.lastSyncValue).toBeNull();
    });

    it('should get entityType from queryId', async () => {
      const queryId = await QueriesRepo.createQuery({
        name: 'Comprobantes Query',
        entityType: EntityType.COMPROBANTE_CABECERA,
        sqlQuery: 'SELECT * FROM comprobantes',
        isActive: true,
      });

      await SyncStateRepo.markSyncAsRunning(queryId);

      const entityType = await SyncStateRepo.getEntityTypeFromQuery(queryId);

      expect(entityType).toBe(EntityType.COMPROBANTE_CABECERA);
    });
  });

  describe('SyncLogsRepo - QueryId and QueryName Tracking', () => {
    it('should create logs with queryId and queryName', async () => {
      const queryId = await QueriesRepo.createQuery({
        name: 'Test Sync Query',
        entityType: EntityType.ARTICULO,
        sqlQuery: 'SELECT * FROM articulos',
        isActive: true,
      });

      const logId = await SyncLogsRepo.createLog({
        queryId,
        queryName: 'Test Sync Query',
        entityType: EntityType.ARTICULO,
        syncType: SyncType.INCREMENTAL,
        status: LogStatus.STARTED,
        recordsFetched: 0,
        recordsSent: 0,
        recordsFailed: 0,
      });

      const db = getDatabase();
      const logs = await db
        .select()
        .from(schema.syncLogs);

      const log = logs.find(l => l.id === logId);
      expect(log).toBeDefined();
      expect(log!.queryId).toBe(queryId);
      expect(log!.queryName).toBe('Test Sync Query');
      expect(log!.entityType).toBe(EntityType.ARTICULO);
    });

    it('should allow filtering logs by queryId', async () => {
      const query1Id = await QueriesRepo.createQuery({
        name: 'Query 1',
        entityType: EntityType.ARTICULO,
        sqlQuery: 'SELECT 1',
        isActive: true,
      });

      const query2Id = await QueriesRepo.createQuery({
        name: 'Query 2',
        entityType: EntityType.ARTICULO,
        sqlQuery: 'SELECT 2',
        isActive: true,
      });

      // Create logs for both queries
      await SyncLogsRepo.createLog({
        queryId: query1Id,
        queryName: 'Query 1',
        entityType: EntityType.ARTICULO,
        syncType: SyncType.FULL,
        status: LogStatus.SUCCESS,
        recordsFetched: 10,
        recordsSent: 10,
        recordsFailed: 0,
      });

      await SyncLogsRepo.createLog({
        queryId: query2Id,
        queryName: 'Query 2',
        entityType: EntityType.ARTICULO,
        syncType: SyncType.FULL,
        status: LogStatus.SUCCESS,
        recordsFetched: 20,
        recordsSent: 20,
        recordsFailed: 0,
      });

      const db = getDatabase();
      const allLogs = await db
        .select()
        .from(schema.syncLogs);

      const logsForQuery1 = allLogs.filter(l => l.queryId === query1Id);

      expect(logsForQuery1).toHaveLength(1);
      expect(logsForQuery1[0]!.queryName).toBe('Query 1');
      expect(logsForQuery1[0]!.recordsFetched).toBe(10);
    });

    it('should maintain backward compatibility with entityType filtering', async () => {
      const queryId = await QueriesRepo.createQuery({
        name: 'Articulos Query',
        entityType: EntityType.ARTICULO,
        sqlQuery: 'SELECT * FROM articulos',
        isActive: true,
      });

      await SyncLogsRepo.createLog({
        queryId,
        queryName: 'Articulos Query',
        entityType: EntityType.ARTICULO,
        syncType: SyncType.FULL,
        status: LogStatus.SUCCESS,
        recordsFetched: 100,
        recordsSent: 100,
        recordsFailed: 0,
      });

      const db = getDatabase();
      const allLogs = await db
        .select()
        .from(schema.syncLogs);

      const logsByEntity = allLogs.filter(l => l.entityType === EntityType.ARTICULO);

      expect(logsByEntity).toHaveLength(1);
      expect(logsByEntity[0]!.entityType).toBe(EntityType.ARTICULO);
    });
  });
});
