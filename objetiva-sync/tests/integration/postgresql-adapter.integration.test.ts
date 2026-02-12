/**
 * Integration tests for PostgreSQL adapter
 *
 * These tests require a running PostgreSQL instance.
 * Skip in CI if POSTGRES_TEST_* env vars not set.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { PostgreSQLAdapter } from '../../src/adapters/postgresql/index.js';
import { createAdapter } from '../../src/adapters/index.js';

// Test config from environment or defaults
const testConfig = {
  host: process.env.POSTGRES_TEST_HOST || 'localhost',
  port: parseInt(process.env.POSTGRES_TEST_PORT || '5432', 10),
  database: process.env.POSTGRES_TEST_DATABASE || 'postgres',
  user: process.env.POSTGRES_TEST_USER || 'postgres',
  password: process.env.POSTGRES_TEST_PASSWORD || 'postgres',
};

// Skip all tests if no PostgreSQL available (only run when explicitly configured)
const hasPostgres = Boolean(process.env.POSTGRES_TEST_HOST);

describe.skipIf(!hasPostgres)('PostgreSQLAdapter Integration', () => {
  let adapter: PostgreSQLAdapter;

  beforeAll(async () => {
    adapter = createAdapter('postgres') as PostgreSQLAdapter;
  });

  afterAll(async () => {
    if (adapter?.isConnected) {
      await adapter.disconnect();
    }
  });

  describe('connection', () => {
    it('can test connection without connecting', async () => {
      const result = await adapter.testConnection(testConfig);
      expect(result.success).toBe(true);
      expect(result.message).toContain('PostgreSQL');
    });

    it('reports failure for invalid credentials', async () => {
      const result = await adapter.testConnection({
        ...testConfig,
        password: 'wrong_password_12345',
      });
      expect(result.success).toBe(false);
      expect(result.message).toContain('Error');
    });

    it('can connect and disconnect', async () => {
      await adapter.connect(testConfig);
      expect(adapter.isConnected).toBe(true);

      await adapter.disconnect();
      expect(adapter.isConnected).toBe(false);
    });
  });

  describe('queries', () => {
    beforeAll(async () => {
      await adapter.connect(testConfig);
    });

    afterAll(async () => {
      await adapter.disconnect();
    });

    it('can execute simple query', async () => {
      const result = await adapter.executeQuery('SELECT 1 as num');
      expect(result.rows).toHaveLength(1);
      expect((result.rows[0] as any).num).toBe(1);
      expect(result.executionTimeMs).toBeGreaterThanOrEqual(0);
    });

    it('can execute query with parameters', async () => {
      const result = await adapter.executeQuery(
        'SELECT $1::text as greeting, $2::int as num',
        { greeting: 'Hello', num: 42 }
      );
      expect(result.rows).toHaveLength(1);
      expect((result.rows[0] as any).greeting).toBe('Hello');
      expect((result.rows[0] as any).num).toBe(42);
    });

    it('handles @param style placeholders', async () => {
      // Sync queries use @lastSync format - adapter should convert
      const result = await adapter.executeQuery(
        'SELECT @value::int as val',
        { value: 100 }
      );
      expect(result.rows).toHaveLength(1);
      expect((result.rows[0] as any).val).toBe(100);
    });
  });

  describe('introspection', () => {
    beforeAll(async () => {
      if (!adapter.isConnected) {
        await adapter.connect(testConfig);
      }
    });

    afterAll(async () => {
      await adapter.disconnect();
    });

    it('can get tables', async () => {
      const tables = await adapter.getTables();
      expect(Array.isArray(tables)).toBe(true);
      // postgres always has pg_catalog tables excluded
    });

    it('can get columns for pg_tables (system view)', async () => {
      // pg_catalog.pg_tables exists in all postgres instances
      const columns = await adapter.getColumns('information_schema.tables');
      expect(columns.length).toBeGreaterThan(0);
      expect(columns.some(c => c.name === 'table_name')).toBe(true);
    });

    it('can get sample data', async () => {
      const result = await adapter.getSampleData('information_schema.tables', 5);
      expect(result.rows.length).toBeLessThanOrEqual(5);
      expect(result.rowCount).toBeLessThanOrEqual(5);
    });
  });
});
