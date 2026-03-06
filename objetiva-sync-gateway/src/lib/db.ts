/**
 * PostgreSQL connection pool for schema introspection
 *
 * This pool is separate from Prisma and used specifically for raw SQL queries
 * that introspect the PostgreSQL information_schema and pg_catalog.
 *
 * Lazy-initialized: the pool is only created when first accessed, allowing the
 * server to boot in setup-only mode without DATABASE_URL.
 */

import { Pool } from 'pg';
import { logger } from './logger.js';

let _pool: Pool | null = null;

/**
 * Get the introspection pool (lazy-initialized).
 * Throws a descriptive error if DATABASE_URL is not set.
 */
function getPool(): Pool {
  if (_pool) return _pool;

  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error(
      'Database is not configured (DATABASE_URL not set). Complete the setup wizard at /setup first.'
    );
  }

  _pool = new Pool({
    connectionString,
    max: 5,
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 10000,
    statement_timeout: 5000,
  });

  // Log pool events
  _pool.on('connect', () => {
    logger.debug('PostgreSQL introspection pool: new client connected');
  });

  _pool.on('error', (err) => {
    logger.error({ err }, 'PostgreSQL introspection pool: unexpected error on idle client');
  });

  _pool.on('remove', () => {
    logger.debug('PostgreSQL introspection pool: client removed');
  });

  return _pool;
}

/**
 * Proxy that lazily creates the Pool on first property access.
 * Importing this module no longer throws if DATABASE_URL is missing.
 */
export const introspectionPool = new Proxy({} as Pool, {
  get(_target, prop, receiver) {
    const pool = getPool();
    const value = Reflect.get(pool, prop, receiver);
    return typeof value === 'function' ? value.bind(pool) : value;
  }
});

// Graceful shutdown handler
const gracefulShutdown = async () => {
  if (_pool) {
    logger.info('PostgreSQL introspection pool: shutting down gracefully');
    await _pool.end();
    logger.info('PostgreSQL introspection pool: all connections closed');
    _pool = null;
  }
};

process.on('beforeExit', gracefulShutdown);
process.on('SIGINT', gracefulShutdown);
process.on('SIGTERM', gracefulShutdown);
