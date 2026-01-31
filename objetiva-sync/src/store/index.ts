/**
 * Inicialización de la base de datos SQLite con Drizzle ORM
 */

import Database from 'better-sqlite3';
import { drizzle, BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import { migrate } from 'drizzle-orm/better-sqlite3/migrator';
import { existsSync, mkdirSync } from 'fs';
import { dirname } from 'path';
import { requireEnv } from '../config/index.js';
import { logger } from '../utils/logger.js';
import * as schema from './schema.js';

/**
 * Instancia de la base de datos SQLite
 */
let sqlite: Database.Database | null = null;

/**
 * Instancia de Drizzle ORM
 */
let db: BetterSQLite3Database<typeof schema> | null = null;

/**
 * Inicializa la conexión a la base de datos
 */
export function initDatabase(): BetterSQLite3Database<typeof schema> {
  if (db) {
    return db;
  }

  const env = requireEnv();
  const dbPath = env.DATABASE_PATH;

  try {
    // Asegurar que el directorio de la base de datos existe
    const dbDir = dirname(dbPath);
    if (!existsSync(dbDir)) {
      logger.info(`Creando directorio de base de datos: ${dbDir}`);
      mkdirSync(dbDir, { recursive: true });
    }

    // Verificar si es primera vez (DB no existe)
    const isFirstRun = !existsSync(dbPath);

    // Crear/abrir conexión a SQLite
    logger.info(`Conectando a base de datos: ${dbPath}`);
    sqlite = new Database(dbPath);

    // Habilitar foreign keys (importante para CASCADE)
    sqlite.pragma('foreign_keys = ON');

    // Configuraciones de performance
    sqlite.pragma('journal_mode = WAL'); // Write-Ahead Logging
    sqlite.pragma('synchronous = NORMAL'); // Balance entre seguridad y velocidad

    // Inicializar Drizzle
    db = drizzle(sqlite, { schema });

    if (isFirstRun) {
      logger.info('Primera ejecución detectada, ejecutando migraciones...');
      runMigrations();
      logger.info('✅ Base de datos inicializada correctamente');
    } else {
      logger.info('✅ Conectado a base de datos existente');
    }

    return db;
  } catch (error) {
    logger.error(error, 'Error al inicializar base de datos');
    throw error;
  }
}

/**
 * Ejecuta las migraciones pendientes
 */
export function runMigrations(): void {
  if (!sqlite || !db) {
    throw new Error('Base de datos no inicializada');
  }

  try {
    logger.info('Ejecutando migraciones de base de datos...');
    migrate(db, { migrationsFolder: './src/store/migrations' });
    logger.info('✅ Migraciones ejecutadas correctamente');
  } catch (error) {
    logger.error(error, 'Error al ejecutar migraciones');
    throw error;
  }
}

/**
 * Cierra la conexión a la base de datos
 */
export function closeDatabase(): void {
  if (sqlite) {
    logger.info('Cerrando conexión a base de datos');
    sqlite.close();
    sqlite = null;
    db = null;
  }
}

/**
 * Obtiene la instancia de la base de datos
 * Lanza error si no está inicializada
 */
export function getDatabase(): BetterSQLite3Database<typeof schema> {
  if (!db) {
    throw new Error(
      'Base de datos no inicializada. Ejecutar initDatabase() primero.'
    );
  }
  return db;
}

/**
 * Verifica si la base de datos está inicializada
 */
export function isDatabaseInitialized(): boolean {
  return db !== null;
}

/**
 * Set database instance (for testing purposes only)
 * @internal
 */
export function setDatabaseForTesting(testDb: BetterSQLite3Database<typeof schema>): void {
  db = testDb;
}

/**
 * Ejecuta una función dentro de una transacción SÍNCRONA
 * Better-sqlite3 requiere que las transacciones sean síncronas
 */
export function transaction<T>(
  callback: (tx: BetterSQLite3Database<typeof schema>) => T
): T {
  const database = getDatabase();
  return database.transaction(callback);
}

/**
 * Ejecuta vacuum en la base de datos (compactación)
 * Útil para mantenimiento periódico
 */
export function vacuumDatabase(): void {
  if (!sqlite) {
    throw new Error('Base de datos no inicializada');
  }

  logger.info('Ejecutando VACUUM en base de datos...');
  sqlite.exec('VACUUM');
  logger.info('✅ VACUUM completado');
}

/**
 * Ejecuta ANALYZE en la base de datos (optimización de queries)
 */
export function analyzeDatabase(): void {
  if (!sqlite) {
    throw new Error('Base de datos no inicializada');
  }

  logger.info('Ejecutando ANALYZE en base de datos...');
  sqlite.exec('ANALYZE');
  logger.info('✅ ANALYZE completado');
}

/**
 * Obtiene estadísticas de la base de datos
 */
export function getDatabaseStats(): {
  path: string;
  sizeBytes: number;
  pageCount: number;
  pageSize: number;
  walEnabled: boolean;
} {
  if (!sqlite) {
    throw new Error('Base de datos no inicializada');
  }

  const env = requireEnv();
  const stats = existsSync(env.DATABASE_PATH)
    ? require('fs').statSync(env.DATABASE_PATH)
    : null;

  const pageCount = sqlite.pragma('page_count', { simple: true }) as number;
  const pageSize = sqlite.pragma('page_size', { simple: true }) as number;
  const journalMode = sqlite.pragma('journal_mode', { simple: true }) as string;

  return {
    path: env.DATABASE_PATH,
    sizeBytes: stats ? stats.size : 0,
    pageCount,
    pageSize,
    walEnabled: journalMode === 'wal',
  };
}

// Re-exportar el schema para facilitar importaciones
export * from './schema.js';

// Exportar la instancia de db como default
export { db };
