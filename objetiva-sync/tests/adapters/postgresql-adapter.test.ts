/**
 * Unit tests for PostgreSQLAdapter
 */

import { describe, it, expect } from 'vitest';
import { PostgreSQLAdapter } from '../../src/adapters/postgresql/index.js';
import { createAdapter, getAvailableAdapters } from '../../src/adapters/index.js';

describe('PostgreSQLAdapter', () => {
  describe('adapter interface', () => {
    it('has correct type and displayName', () => {
      const adapter = new PostgreSQLAdapter();
      expect(adapter.type).toBe('postgres');
      expect(adapter.displayName).toBe('PostgreSQL');
    });

    it('provides valid config schema', () => {
      const adapter = new PostgreSQLAdapter();
      const schema = adapter.getConfigSchema();
      expect(schema).toBeDefined();

      // Validate schema has required fields
      const result = schema.safeParse({
        host: 'localhost',
        port: 5432,
        database: 'test',
        user: 'user',
        password: 'pass',
      });

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.host).toBe('localhost');
        expect(result.data.port).toBe(5432);
        expect(result.data.database).toBe('test');
        expect(result.data.user).toBe('user');
        expect(result.data.password).toBe('pass');
      }
    });

    it('rejects invalid config - empty host', () => {
      const adapter = new PostgreSQLAdapter();
      const schema = adapter.getConfigSchema();
      const result = schema.safeParse({
        host: '', // Empty host should fail
        database: 'test',
        user: 'user',
        password: 'pass',
      });
      expect(result.success).toBe(false);
    });

    it('rejects invalid config - missing database', () => {
      const adapter = new PostgreSQLAdapter();
      const schema = adapter.getConfigSchema();
      const result = schema.safeParse({
        host: 'localhost',
        user: 'user',
        password: 'pass',
        // database missing
      });
      expect(result.success).toBe(false);
    });

    it('rejects invalid config - missing user', () => {
      const adapter = new PostgreSQLAdapter();
      const schema = adapter.getConfigSchema();
      const result = schema.safeParse({
        host: 'localhost',
        database: 'test',
        password: 'pass',
        // user missing
      });
      expect(result.success).toBe(false);
    });

    it('rejects invalid config - missing password', () => {
      const adapter = new PostgreSQLAdapter();
      const schema = adapter.getConfigSchema();
      const result = schema.safeParse({
        host: 'localhost',
        database: 'test',
        user: 'user',
        // password missing
      });
      expect(result.success).toBe(false);
    });

    it('applies default port 5432', () => {
      const adapter = new PostgreSQLAdapter();
      const schema = adapter.getConfigSchema();
      const result = schema.parse({
        host: 'localhost',
        database: 'test',
        user: 'user',
        password: 'pass',
      });
      expect(result.port).toBe(5432);
    });

    it('accepts custom port', () => {
      const adapter = new PostgreSQLAdapter();
      const schema = adapter.getConfigSchema();
      const result = schema.parse({
        host: 'localhost',
        port: 5433,
        database: 'test',
        user: 'user',
        password: 'pass',
      });
      expect(result.port).toBe(5433);
    });

    it('accepts SSL config', () => {
      const adapter = new PostgreSQLAdapter();
      const schema = adapter.getConfigSchema();
      const result = schema.parse({
        host: 'localhost',
        database: 'test',
        user: 'user',
        password: 'pass',
        ssl: {
          enabled: true,
          rejectUnauthorized: false,
        },
      });
      expect(result.ssl).toBeDefined();
      expect(result.ssl?.enabled).toBe(true);
      expect(result.ssl?.rejectUnauthorized).toBe(false);
    });

    it('applies default SSL settings when enabled', () => {
      const adapter = new PostgreSQLAdapter();
      const schema = adapter.getConfigSchema();
      const result = schema.parse({
        host: 'localhost',
        database: 'test',
        user: 'user',
        password: 'pass',
        ssl: {
          enabled: false,
        },
      });
      expect(result.ssl).toBeDefined();
      expect(result.ssl?.enabled).toBe(false);
      expect(result.ssl?.rejectUnauthorized).toBe(true); // default
    });

    it('applies default connectionTimeout', () => {
      const adapter = new PostgreSQLAdapter();
      const schema = adapter.getConfigSchema();
      const result = schema.parse({
        host: 'localhost',
        database: 'test',
        user: 'user',
        password: 'pass',
      });
      expect(result.connectionTimeout).toBe(30000);
    });

    it('accepts custom connectionTimeout', () => {
      const adapter = new PostgreSQLAdapter();
      const schema = adapter.getConfigSchema();
      const result = schema.parse({
        host: 'localhost',
        database: 'test',
        user: 'user',
        password: 'pass',
        connectionTimeout: 60000,
      });
      expect(result.connectionTimeout).toBe(60000);
    });

    it('rejects invalid port - too low', () => {
      const adapter = new PostgreSQLAdapter();
      const schema = adapter.getConfigSchema();
      const result = schema.safeParse({
        host: 'localhost',
        port: 0,
        database: 'test',
        user: 'user',
        password: 'pass',
      });
      expect(result.success).toBe(false);
    });

    it('rejects invalid port - too high', () => {
      const adapter = new PostgreSQLAdapter();
      const schema = adapter.getConfigSchema();
      const result = schema.safeParse({
        host: 'localhost',
        port: 65536,
        database: 'test',
        user: 'user',
        password: 'pass',
      });
      expect(result.success).toBe(false);
    });

    it('rejects invalid connectionTimeout - too low', () => {
      const adapter = new PostgreSQLAdapter();
      const schema = adapter.getConfigSchema();
      const result = schema.safeParse({
        host: 'localhost',
        database: 'test',
        user: 'user',
        password: 'pass',
        connectionTimeout: 500, // less than 1000
      });
      expect(result.success).toBe(false);
    });
  });

  describe('registry integration', () => {
    it('is registered in ADAPTER_REGISTRY', () => {
      const adapters = getAvailableAdapters();
      expect(adapters).toContain('postgres');
    });

    it('can be created via factory', () => {
      const adapter = createAdapter('postgres');
      expect(adapter).toBeInstanceOf(PostgreSQLAdapter);
    });

    it('factory returns correct type and displayName', () => {
      const adapter = createAdapter('postgres');
      expect(adapter.type).toBe('postgres');
      expect(adapter.displayName).toBe('PostgreSQL');
    });

    it('ADAPTER_REGISTRY contains both sqlserver and postgres', () => {
      const adapters = getAvailableAdapters();
      expect(adapters).toContain('sqlserver');
      expect(adapters).toContain('postgres');
      expect(adapters.length).toBeGreaterThanOrEqual(2);
    });
  });

  describe('adapter lifecycle', () => {
    it('starts in disconnected state', () => {
      const adapter = new PostgreSQLAdapter();
      expect(adapter.isConnected).toBe(false);
    });

    it('has getPoolStats method', () => {
      const adapter = new PostgreSQLAdapter();
      expect(adapter.getPoolStats).toBeDefined();
      expect(typeof adapter.getPoolStats).toBe('function');
    });

    it('getPoolStats returns null when not connected', () => {
      const adapter = new PostgreSQLAdapter();
      const stats = adapter.getPoolStats();
      expect(stats).toBeNull();
    });
  });
});
