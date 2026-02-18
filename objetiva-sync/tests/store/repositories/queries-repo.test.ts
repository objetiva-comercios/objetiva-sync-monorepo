/**
 * Tests for Queries Repository
 * CRUD operations for SQL queries configuration
 */

import { describe, it, expect, beforeEach, afterAll } from 'vitest';
import { createTestDb, clearTestDb, closeTestDb } from '../../helpers/test-db.js';
import * as QueriesRepo from '../../../src/store/repositories/queries-repo.js';
import type { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import type * as schema from '../../../src/store/schema.js';
import { EntityType } from '../../../src/types/common.js';

describe.skip('Queries Repository', () => {
  let db: BetterSQLite3Database<typeof schema>;

  beforeEach(() => {
    db = createTestDb();
    QueriesRepo.initQueriesRepo(db);
    clearTestDb(db);
  });

  afterAll(() => {
    if (db) {
      closeTestDb(db);
    }
  });

  describe('createQuery', () => {
    it('should create a new query', async () => {
      const query = await QueriesRepo.createQuery({
        name: 'Test Query',
        entityType: EntityType.ARTICULO,
        sqlQuery: 'SELECT * FROM articulos',
        incrementalField: 'updated_at',
        isActive: true,
      });

      expect(query).toBeTruthy();
      expect(query.id).toBeDefined();
      expect(query.name).toBe('Test Query');
      expect(query.entityType).toBe(EntityType.ARTICULO);
      expect(query.sqlQuery).toBe('SELECT * FROM articulos');
      expect(query.incrementalField).toBe('updated_at');
      expect(query.isActive).toBe(true);
    });

    it('should create query without incremental field', async () => {
      const query = await QueriesRepo.createQuery({
        name: 'Full Sync Query',
        entityType: EntityType.COMPROBANTE,
        sqlQuery: 'SELECT * FROM comprobantes',
        isActive: true,
      });

      expect(query.incrementalField).toBeNull();
    });

    it('should set timestamps on creation', async () => {
      const query = await QueriesRepo.createQuery({
        name: 'Timestamp Test',
        entityType: EntityType.PAGO,
        sqlQuery: 'SELECT * FROM pagos',
        isActive: true,
      });

      expect(query.createdAt).toBeTruthy();
      expect(query.updatedAt).toBeTruthy();
    });
  });

  describe('getQuery', () => {
    it('should get query by ID', async () => {
      const created = await QueriesRepo.createQuery({
        name: 'Get Test',
        entityType: EntityType.ARTICULO,
        sqlQuery: 'SELECT * FROM test',
        isActive: true,
      });

      const query = await QueriesRepo.getQuery(created.id);

      expect(query).toBeTruthy();
      expect(query?.id).toBe(created.id);
      expect(query?.name).toBe('Get Test');
    });

    it('should return null for non-existent ID', async () => {
      const query = await QueriesRepo.getQuery(99999);
      expect(query).toBeNull();
    });
  });

  describe('getActiveQuery', () => {
    it('should get active query for entity type', async () => {
      await QueriesRepo.createQuery({
        name: 'Inactive Query',
        entityType: EntityType.ARTICULO,
        sqlQuery: 'SELECT 1',
        isActive: false,
      });

      await QueriesRepo.createQuery({
        name: 'Active Query',
        entityType: EntityType.ARTICULO,
        sqlQuery: 'SELECT 2',
        isActive: true,
      });

      const query = await QueriesRepo.getActiveQuery(EntityType.ARTICULO);

      expect(query).toBeTruthy();
      expect(query?.name).toBe('Active Query');
      expect(query?.isActive).toBe(true);
    });

    it('should return null when no active query exists', async () => {
      const query = await QueriesRepo.getActiveQuery(EntityType.COMPROBANTE);
      expect(query).toBeNull();
    });

    it('should return first active query when multiple exist', async () => {
      await QueriesRepo.createQuery({
        name: 'Active 1',
        entityType: EntityType.PAGO,
        sqlQuery: 'SELECT 1',
        isActive: true,
      });

      await QueriesRepo.createQuery({
        name: 'Active 2',
        entityType: EntityType.PAGO,
        sqlQuery: 'SELECT 2',
        isActive: true,
      });

      const query = await QueriesRepo.getActiveQuery(EntityType.PAGO);

      expect(query).toBeTruthy();
      expect(query?.entityType).toBe(EntityType.PAGO);
    });
  });

  describe('getAllQueries', () => {
    it('should get all queries', async () => {
      await QueriesRepo.createQuery({
        name: 'Query 1',
        entityType: EntityType.ARTICULO,
        sqlQuery: 'SELECT 1',
        isActive: true,
      });

      await QueriesRepo.createQuery({
        name: 'Query 2',
        entityType: EntityType.COMPROBANTE,
        sqlQuery: 'SELECT 2',
        isActive: false,
      });

      const queries = await QueriesRepo.getAllQueries();

      expect(queries).toHaveLength(2);
    });

    it('should return empty array when no queries exist', async () => {
      const queries = await QueriesRepo.getAllQueries();
      expect(queries).toEqual([]);
    });
  });

  describe('getQueriesByEntity', () => {
    it('should filter queries by entity type', async () => {
      await QueriesRepo.createQuery({
        name: 'Articulo Query',
        entityType: EntityType.ARTICULO,
        sqlQuery: 'SELECT 1',
        isActive: true,
      });

      await QueriesRepo.createQuery({
        name: 'Comprobante Query',
        entityType: EntityType.COMPROBANTE,
        sqlQuery: 'SELECT 2',
        isActive: true,
      });

      const queries = await QueriesRepo.getQueriesByEntity(EntityType.ARTICULO);

      expect(queries).toHaveLength(1);
      expect(queries[0].name).toBe('Articulo Query');
    });
  });

  describe('updateQuery', () => {
    it('should update query fields', async () => {
      const query = await QueriesRepo.createQuery({
        name: 'Original Name',
        entityType: EntityType.ARTICULO,
        sqlQuery: 'SELECT 1',
        isActive: true,
      });

      await QueriesRepo.updateQuery(query.id, {
        name: 'Updated Name',
        sqlQuery: 'SELECT 2',
        isActive: false,
      });

      const updated = await QueriesRepo.getQuery(query.id);

      expect(updated?.name).toBe('Updated Name');
      expect(updated?.sqlQuery).toBe('SELECT 2');
      expect(updated?.isActive).toBe(false);
      expect(updated?.entityType).toBe(EntityType.ARTICULO); // Unchanged
    });

    it('should update updatedAt timestamp', async () => {
      const query = await QueriesRepo.createQuery({
        name: 'Update Test',
        entityType: EntityType.PAGO,
        sqlQuery: 'SELECT 1',
        isActive: true,
      });

      const originalUpdatedAt = query.updatedAt;

      await new Promise((resolve) => setTimeout(resolve, 10));

      await QueriesRepo.updateQuery(query.id, { name: 'New Name' });

      const updated = await QueriesRepo.getQuery(query.id);

      expect(updated?.updatedAt).not.toBe(originalUpdatedAt);
    });
  });

  describe('deleteQuery', () => {
    it('should delete query successfully', async () => {
      const query = await QueriesRepo.createQuery({
        name: 'Delete Me',
        entityType: EntityType.ARTICULO,
        sqlQuery: 'SELECT 1',
        isActive: true,
      });

      const deleted = await QueriesRepo.deleteQuery(query.id);
      expect(deleted).toBe(true);

      const found = await QueriesRepo.getQuery(query.id);
      expect(found).toBeNull();
    });

    it('should return false for non-existent ID', async () => {
      const deleted = await QueriesRepo.deleteQuery(99999);
      expect(deleted).toBe(false);
    });
  });

  describe('activateQuery / deactivateQuery', () => {
    it('should activate query', async () => {
      const query = await QueriesRepo.createQuery({
        name: 'Inactive',
        entityType: EntityType.ARTICULO,
        sqlQuery: 'SELECT 1',
        isActive: false,
      });

      await QueriesRepo.activateQuery(query.id);

      const updated = await QueriesRepo.getQuery(query.id);
      expect(updated?.isActive).toBe(true);
    });

    it('should deactivate query', async () => {
      const query = await QueriesRepo.createQuery({
        name: 'Active',
        entityType: EntityType.ARTICULO,
        sqlQuery: 'SELECT 1',
        isActive: true,
      });

      await QueriesRepo.deactivateQuery(query.id);

      const updated = await QueriesRepo.getQuery(query.id);
      expect(updated?.isActive).toBe(false);
    });
  });
});
