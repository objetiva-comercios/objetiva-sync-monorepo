/**
 * Test database utilities
 * Creates in-memory SQLite databases for testing
 */

import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import type { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import * as schema from '../../src/store/schema.js';

/**
 * Creates an in-memory test database
 */
export function createTestDb(): BetterSQLite3Database<typeof schema> {
  const sqlite = new Database(':memory:');
  const db = drizzle(sqlite, { schema });

  // Run migrations (create tables)
  initTestSchema(sqlite);

  return db;
}

/**
 * Initialize test database schema
 * Matches production schema from src/store/schema.ts
 */
function initTestSchema(sqlite: Database.Database): void {
  // Config table
  sqlite.exec(`
    CREATE TABLE IF NOT EXISTS config (
      key TEXT PRIMARY KEY NOT NULL,
      value TEXT NOT NULL,
      encrypted INTEGER DEFAULT 0 NOT NULL,
      updated_at TEXT DEFAULT (datetime('now')) NOT NULL
    );
  `);

  // Queries table
  sqlite.exec(`
    CREATE TABLE IF NOT EXISTS queries (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      entity_type TEXT NOT NULL,
      sql_query TEXT NOT NULL,
      incremental_field TEXT,
      incremental_type TEXT,
      join_field TEXT,
      is_active INTEGER DEFAULT 1 NOT NULL,
      display_order INTEGER DEFAULT 0,
      sync_interval INTEGER DEFAULT 1800,
      is_scheduled INTEGER DEFAULT 0,
      last_test_status TEXT,
      last_test_at TEXT,
      last_test_row_count INTEGER,
      created_at TEXT DEFAULT (datetime('now')) NOT NULL,
      updated_at TEXT DEFAULT (datetime('now')) NOT NULL
    );
  `);

  // Sync state table
  sqlite.exec(`
    CREATE TABLE IF NOT EXISTS sync_state (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      query_id INTEGER NOT NULL UNIQUE,
      entity_type TEXT NOT NULL,
      last_sync_value TEXT,
      last_sync_at TEXT,
      last_sync_count INTEGER,
      total_synced INTEGER DEFAULT 0,
      status TEXT DEFAULT 'idle' NOT NULL,
      error_message TEXT,
      created_at TEXT DEFAULT (datetime('now')) NOT NULL,
      updated_at TEXT DEFAULT (datetime('now')) NOT NULL,
      FOREIGN KEY (query_id) REFERENCES queries(id) ON DELETE CASCADE
    );
  `);

  // Sync logs table
  sqlite.exec(`
    CREATE TABLE IF NOT EXISTS sync_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      query_id INTEGER,
      query_name TEXT,
      entity_type TEXT NOT NULL,
      sync_type TEXT NOT NULL,
      status TEXT NOT NULL,
      records_fetched INTEGER DEFAULT 0,
      records_sent INTEGER DEFAULT 0,
      records_failed INTEGER DEFAULT 0,
      duration_ms INTEGER,
      error_message TEXT,
      details TEXT,
      created_at TEXT DEFAULT (datetime('now')) NOT NULL
    );
  `);

  // Retry queue table
  sqlite.exec(`
    CREATE TABLE IF NOT EXISTS retry_queue (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      entity_type TEXT NOT NULL,
      payload TEXT NOT NULL,
      attempt_count INTEGER DEFAULT 0,
      max_attempts INTEGER DEFAULT 5,
      last_error TEXT,
      next_retry_at TEXT,
      status TEXT DEFAULT 'pending' NOT NULL,
      created_at TEXT DEFAULT (datetime('now')) NOT NULL,
      updated_at TEXT DEFAULT (datetime('now')) NOT NULL
    );
  `);

  // Connection config table
  sqlite.exec(`
    CREATE TABLE IF NOT EXISTS connection_config (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      adapter_type TEXT NOT NULL,
      name TEXT NOT NULL,
      config_json TEXT NOT NULL,
      is_active INTEGER DEFAULT 0 NOT NULL,
      test_status TEXT,
      test_message TEXT,
      tested_at TEXT,
      created_at TEXT DEFAULT (datetime('now')) NOT NULL,
      updated_at TEXT DEFAULT (datetime('now')) NOT NULL
    );
  `);

  // Gateway config table
  sqlite.exec(`
    CREATE TABLE IF NOT EXISTS gateway_config (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT UNIQUE NOT NULL,
      base_url TEXT NOT NULL,
      username TEXT NOT NULL,
      password TEXT NOT NULL,
      is_active INTEGER DEFAULT 0 NOT NULL,
      created_at TEXT DEFAULT (datetime('now')) NOT NULL,
      updated_at TEXT DEFAULT (datetime('now')) NOT NULL
    );
  `);
}

/**
 * Clears all data from test database
 */
export function clearTestDb(db: BetterSQLite3Database<typeof schema>): void {
  const sqlite = db.$client as Database.Database;

  sqlite.exec(`DELETE FROM gateway_config`);
  sqlite.exec(`DELETE FROM connection_config`);
  sqlite.exec(`DELETE FROM retry_queue`);
  sqlite.exec(`DELETE FROM sync_logs`);
  sqlite.exec(`DELETE FROM sync_state`);
  sqlite.exec(`DELETE FROM queries`);
  sqlite.exec(`DELETE FROM config`);
}

/**
 * Closes test database connection
 */
export function closeTestDb(db: BetterSQLite3Database<typeof schema>): void {
  const sqlite = db.$client as Database.Database;
  sqlite.close();
}
