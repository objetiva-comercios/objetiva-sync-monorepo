/**
 * Database injector for tests
 * Uses the built-in setDatabaseForTesting() function from store module
 */

import type { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import type * as schema from '../../src/store/schema.js';
import { setDatabaseForTesting } from '../../src/store/index.js';

/**
 * Injects a test database into the store module
 * This replaces the singleton database used by repositories
 */
export function injectTestDatabase(db: BetterSQLite3Database<typeof schema>): void {
  setDatabaseForTesting(db);
}

/**
 * Gets the test database
 * Not needed with setDatabaseForTesting approach
 */
export function getTestDatabase(): BetterSQLite3Database<typeof schema> {
  throw new Error('getTestDatabase() not needed - use setDatabaseForTesting() instead');
}

/**
 * Clears the test database reference
 * Not supported by setDatabaseForTesting - create new test db instead
 */
export function clearTestDatabase(): void {
  // Not supported - just create a new test database in next test
}
