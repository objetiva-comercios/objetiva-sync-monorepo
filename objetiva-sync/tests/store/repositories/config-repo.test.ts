/**
 * Tests for Config Repository
 * CRUD operations for configuration key-value store
 */

import { describe, it, expect, beforeEach, afterAll } from 'vitest';
import { createTestDb, clearTestDb, closeTestDb } from '../../helpers/test-db.js';
import * as ConfigRepo from '../../../src/store/repositories/config-repo.js';
import type { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import type * as schema from '../../../src/store/schema.js';

describe.skip('Config Repository', () => {
  let db: BetterSQLite3Database<typeof schema>;

  beforeEach(() => {
    db = createTestDb();
    ConfigRepo.initConfigRepo(db);
    clearTestDb(db);
  });

  afterAll(() => {
    if (db) {
      closeTestDb(db);
    }
  });

  describe('setConfig / getConfig', () => {
    it('should set and get plain text config', async () => {
      await ConfigRepo.setConfig('test_key', 'test_value', false);

      const config = await ConfigRepo.getConfig('test_key');

      expect(config).toBeTruthy();
      expect(config?.key).toBe('test_key');
      expect(config?.value).toBe('test_value');
      expect(config?.isEncrypted).toBe(false);
    });

    it('should set and get encrypted config', async () => {
      await ConfigRepo.setConfig('secret_key', 'secret_value', true);

      const config = await ConfigRepo.getConfig('secret_key');

      expect(config).toBeTruthy();
      expect(config?.key).toBe('secret_key');
      expect(config?.isEncrypted).toBe(true);
      // Value should be decrypted automatically
      expect(config?.value).toBe('secret_value');
    });

    it('should return null for non-existent key', async () => {
      const config = await ConfigRepo.getConfig('non_existent');
      expect(config).toBeNull();
    });

    it('should update existing config', async () => {
      await ConfigRepo.setConfig('update_key', 'value1', false);
      await ConfigRepo.setConfig('update_key', 'value2', false);

      const config = await ConfigRepo.getConfig('update_key');

      expect(config?.value).toBe('value2');
    });

    it('should handle empty string values', async () => {
      await ConfigRepo.setConfig('empty_key', '', false);

      const config = await ConfigRepo.getConfig('empty_key');

      expect(config?.value).toBe('');
    });
  });

  describe('getAllConfigs', () => {
    it('should get all configs', async () => {
      await ConfigRepo.setConfig('key1', 'value1', false);
      await ConfigRepo.setConfig('key2', 'value2', false);
      await ConfigRepo.setConfig('key3', 'value3', true);

      const configs = await ConfigRepo.getAllConfigs();

      expect(configs).toHaveLength(3);
      expect(configs.map((c) => c.key)).toContain('key1');
      expect(configs.map((c) => c.key)).toContain('key2');
      expect(configs.map((c) => c.key)).toContain('key3');
    });

    it('should return empty array when no configs exist', async () => {
      const configs = await ConfigRepo.getAllConfigs();
      expect(configs).toEqual([]);
    });
  });

  describe('deleteConfig', () => {
    it('should delete config successfully', async () => {
      await ConfigRepo.setConfig('delete_me', 'value', false);

      const deleted = await ConfigRepo.deleteConfig('delete_me');
      expect(deleted).toBe(true);

      const config = await ConfigRepo.getConfig('delete_me');
      expect(config).toBeNull();
    });

    it('should return false when deleting non-existent config', async () => {
      const deleted = await ConfigRepo.deleteConfig('non_existent');
      expect(deleted).toBe(false);
    });
  });

  describe('Encryption handling', () => {
    it('should handle changing encryption status', async () => {
      // Set as plain text
      await ConfigRepo.setConfig('toggle_key', 'value', false);
      let config = await ConfigRepo.getConfig('toggle_key');
      expect(config?.isEncrypted).toBe(false);

      // Update to encrypted
      await ConfigRepo.setConfig('toggle_key', 'value', true);
      config = await ConfigRepo.getConfig('toggle_key');
      expect(config?.isEncrypted).toBe(true);
      expect(config?.value).toBe('value'); // Should still decrypt correctly
    });
  });

  describe('Timestamps', () => {
    it('should set createdAt timestamp', async () => {
      await ConfigRepo.setConfig('timestamp_test', 'value', false);

      const config = await ConfigRepo.getConfig('timestamp_test');

      expect(config?.createdAt).toBeTruthy();
      expect(new Date(config!.createdAt!)).toBeInstanceOf(Date);
    });

    it('should update updatedAt timestamp on update', async () => {
      await ConfigRepo.setConfig('update_time_test', 'value1', false);
      const config1 = await ConfigRepo.getConfig('update_time_test');

      // Wait a bit to ensure timestamp difference
      await new Promise((resolve) => setTimeout(resolve, 10));

      await ConfigRepo.setConfig('update_time_test', 'value2', false);
      const config2 = await ConfigRepo.getConfig('update_time_test');

      expect(config2?.updatedAt).not.toBe(config1?.updatedAt);
    });
  });
});
