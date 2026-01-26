/**
 * PostgreSQL connection pool for schema introspection
 *
 * This pool is separate from Prisma and used specifically for raw SQL queries
 * that introspect the PostgreSQL information_schema and pg_catalog.
 */

import { Pool } from 'pg';
import { logger } from './logger.js';

// Parse connection string from environment
const connectionString = process.env.DATABASE_URL;

if (!connectionString) {
  throw new Error('DATABASE_URL environment variable is required');
}

/**
 * Pool configuration for introspection queries
 *
 * - statement_timeout: 5000ms (5 seconds) - introspection queries should be fast
 * - max: 5 connections - introspection is infrequent, small pool is sufficient
 * - idleTimeoutMillis: 30000ms - close idle connections after 30 seconds
 * - connectionTimeoutMillis: 10000ms - fail fast if database is unavailable
 */
export const introspectionPool = new Pool({
  connectionString,
  max: 5,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 10000,
  statement_timeout: 5000, // 5 seconds per context decisions
});

// Log pool events
introspectionPool.on('connect', () => {
  logger.debug('PostgreSQL introspection pool: new client connected');
});

introspectionPool.on('error', (err) => {
  logger.error({ err }, 'PostgreSQL introspection pool: unexpected error on idle client');
});

introspectionPool.on('remove', () => {
  logger.debug('PostgreSQL introspection pool: client removed');
});

// Graceful shutdown handler
const gracefulShutdown = async () => {
  logger.info('PostgreSQL introspection pool: shutting down gracefully');
  await introspectionPool.end();
  logger.info('PostgreSQL introspection pool: all connections closed');
};

// Register shutdown handlers
process.on('beforeExit', gracefulShutdown);
process.on('SIGINT', gracefulShutdown);
process.on('SIGTERM', gracefulShutdown);
