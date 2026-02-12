/**
 * Utilidades para probar conexiones a bases de datos
 */

import { createAdapter } from './index.js';
import { logger } from '../utils/logger.js';
import type { TestResult } from '../types/common.js';
import type { IQueryResult } from './types.js';

/**
 * Timeout por defecto para pruebas de conexión (10 segundos)
 */
const DEFAULT_TEST_TIMEOUT = 10000;

/**
 * Ejecuta una promesa con timeout
 * @param promise Promesa a ejecutar
 * @param timeoutMs Timeout en milisegundos
 * @param errorMessage Mensaje de error si hay timeout
 * @returns Resultado de la promesa o error de timeout
 */
function withTimeout<T>(
  promise: Promise<T>,
  timeoutMs: number,
  errorMessage: string
): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) =>
      setTimeout(() => reject(new Error(errorMessage)), timeoutMs)
    ),
  ]);
}

/**
 * Prueba una conexión a base de datos
 * @param adapterType Tipo de adaptador (sqlserver, postgres, mysql, excel)
 * @param config Configuración de conexión
 * @returns Resultado de la prueba
 */
export async function testDatabaseConnection(
  adapterType: string,
  config: Record<string, unknown>
): Promise<TestResult> {
  let adapter: ReturnType<typeof createAdapter> | null = null;

  try {
    logger.info(`Probando conexión de tipo: ${adapterType}`);

    // Map config fields for postgres (UI uses 'server', adapter expects 'host')
    let adapterConfig: Record<string, unknown> = { ...config };
    if (adapterType === 'postgres') {
      const postgresConfig: Record<string, unknown> = {
        host: config.server || config.host,
        port: config.port || 5432,
        database: config.database,
        user: config.user || config.username,
        password: config.password,
        connectionTimeout: config.connectionTimeout,
      };
      if (config.ssl) {
        postgresConfig.ssl = {
          enabled: true,
          rejectUnauthorized: config.sslRejectUnauthorized !== false,
        };
      }
      adapterConfig = postgresConfig;
    }

    // Extraer timeout de la configuración (si existe)
    const connectionTimeout =
      typeof adapterConfig.connectionTimeout === 'number' && adapterConfig.connectionTimeout > 0
        ? adapterConfig.connectionTimeout
        : DEFAULT_TEST_TIMEOUT;

    const timeoutSeconds = Math.round(connectionTimeout / 1000);

    logger.info(`Usando timeout de conexión: ${connectionTimeout}ms (${timeoutSeconds}s)`);

    // Create adapter instance
    adapter = createAdapter(adapterType);

    // Connect with timeout
    await withTimeout(
      adapter.connect(adapterConfig),
      connectionTimeout,
      `Timeout: La conexión tardó demasiado tiempo (${timeoutSeconds}s)`
    );

    // Test with a simple query
    try {
      // Different test queries for different database types
      let testQuery = 'SELECT 1 AS test';

      if (adapterType === 'sqlserver') {
        testQuery = 'SELECT 1 AS test';
      } else if (adapterType === 'postgres') {
        testQuery = 'SELECT 1 AS test';
      } else if (adapterType === 'mysql') {
        testQuery = 'SELECT 1 AS test';
      }

      const result = await withTimeout(
        adapter.executeQuery(testQuery),
        connectionTimeout,
        `Timeout: La consulta de prueba tardó demasiado tiempo (${timeoutSeconds}s)`
      );

      // Disconnect
      await adapter.disconnect();

      if (result && result.rows && result.rows.length > 0) {
        logger.info(`Conexión exitosa: ${adapterType}`);
        return {
          success: true,
          message: 'Conexión exitosa - Base de datos accesible',
        };
      } else {
        logger.warn(`Conexión establecida pero query de prueba falló: ${adapterType}`);
        return {
          success: false,
          message: 'Conexión establecida pero no se pudo ejecutar query de prueba',
        };
      }
    } catch (queryError) {
      // Disconnect even if query fails
      try {
        await adapter.disconnect();
      } catch {
        // Ignore disconnect errors
      }

      logger.error({ error: queryError }, `Error ejecutando query de prueba: ${adapterType}`);
      return {
        success: false,
        message: `Error ejecutando query de prueba: ${queryError instanceof Error ? queryError.message : String(queryError)}`,
      };
    }
  } catch (error) {
    // Intentar desconectar si hubo error
    if (adapter) {
      try {
        await adapter.disconnect();
      } catch {
        // Ignore disconnect errors
      }
    }

    logger.error({ error }, `Error al probar conexión: ${adapterType}`);

    // Normalize error message to handle encoding issues
    let errorMessage = error instanceof Error ? error.message : String(error);
    errorMessage = errorMessage
      .replace(/autentificaci\uFFFDn/gi, 'autenticación')
      .replace(/contrase\uFFFDa/gi, 'contraseña')
      .replace(/conexi\uFFFDn/gi, 'conexión')
      .replace(/\uFFFD/g, '');

    return {
      success: false,
      message: `Error de conexión: ${errorMessage}`,
    };
  }
}

/**
 * Ejecuta una query SQL en una conexión
 * @param adapterType Tipo de adaptador
 * @param config Configuración de conexión
 * @param sqlQuery Query SQL a ejecutar
 * @returns Resultado de la query
 */
export async function executeQueryOnConnection(
  adapterType: string,
  config: Record<string, unknown>,
  sqlQuery: string
): Promise<IQueryResult> {
  let adapter: ReturnType<typeof createAdapter> | null = null;

  try {
    logger.info(`Ejecutando query en ${adapterType}`);

    // Extraer timeout de la configuración (si existe)
    const connectionTimeout =
      typeof config.connectionTimeout === 'number' && config.connectionTimeout > 0
        ? config.connectionTimeout
        : DEFAULT_TEST_TIMEOUT;

    const timeoutSeconds = Math.round(connectionTimeout / 1000);

    logger.info(`Usando timeout: ${connectionTimeout}ms (${timeoutSeconds}s)`);

    // Create adapter instance
    adapter = createAdapter(adapterType);

    // Connect with timeout
    await withTimeout(
      adapter.connect(config),
      connectionTimeout,
      `Timeout: La conexión tardó demasiado tiempo (${timeoutSeconds}s)`
    );

    // Execute query with timeout
    const result = await withTimeout(
      adapter.executeQuery(sqlQuery),
      connectionTimeout,
      `Timeout: La consulta tardó demasiado tiempo (${timeoutSeconds}s)`
    );

    // Disconnect
    await adapter.disconnect();

    logger.info(`Query ejecutada exitosamente. Filas: ${result.rowCount}`);

    return result;
  } catch (error) {
    // Intentar desconectar si hubo error
    if (adapter) {
      try {
        await adapter.disconnect();
      } catch {
        // Ignore disconnect errors
      }
    }

    logger.error({ error }, `Error al ejecutar query en ${adapterType}`);
    throw error;
  }
}
