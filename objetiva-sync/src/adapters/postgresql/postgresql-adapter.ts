/**
 * Adaptador para PostgreSQL
 * Utiliza el paquete pg para conexión con pool
 */

import pg from 'pg';
import { z } from 'zod';
import { AbstractAdapter } from '../base-adapter.js';
import type {
  IConnectionConfig,
  IQueryResult,
  IQueryParams,
  IColumnInfo,
} from '../types.js';
import type { TestResult } from '../../types/common.js';
import { logger } from '../../utils/logger.js';

const { Pool } = pg;

/**
 * Schema Zod para configuración de PostgreSQL
 */
const postgresConfigSchema = z.object({
  host: z.string().min(1, 'El host es requerido'),
  port: z.number().int().min(1).max(65535).default(5432),
  database: z.string().min(1, 'La base de datos es requerida'),
  user: z.string().min(1, 'El usuario es requerido'),
  password: z.string().min(1, 'La contraseña es requerida'),
  ssl: z
    .object({
      enabled: z.boolean().default(false),
      rejectUnauthorized: z.boolean().default(true),
    })
    .optional(),
  connectionTimeout: z.number().int().min(1000).default(30000),
});

/**
 * Tipo inferido de la configuración
 */
export type PostgreSQLConfig = z.infer<typeof postgresConfigSchema>;

/**
 * Adaptador para conectar a PostgreSQL
 */
export class PostgreSQLAdapter extends AbstractAdapter {
  readonly type = 'postgres';
  readonly displayName = 'PostgreSQL';

  private pool: pg.Pool | null = null;

  /**
   * Obtiene el schema Zod para validación
   */
  getConfigSchema(): z.ZodTypeAny {
    return postgresConfigSchema;
  }

  /**
   * Conecta a PostgreSQL y crea el pool de conexiones
   */
  protected async doConnect(config: IConnectionConfig): Promise<void> {
    const pgConfig = config as PostgreSQLConfig;

    // Configuración del pool
    const poolConfig: pg.PoolConfig = {
      host: pgConfig.host,
      port: pgConfig.port,
      database: pgConfig.database,
      user: pgConfig.user,
      password: pgConfig.password,
      connectionTimeoutMillis: pgConfig.connectionTimeout,
      idleTimeoutMillis: 30000,
      max: 10,
      min: 1,
    };

    // Configurar SSL si está habilitado
    if (pgConfig.ssl?.enabled) {
      poolConfig.ssl = {
        rejectUnauthorized: pgConfig.ssl.rejectUnauthorized ?? true,
      };
      logger.info(`[${this.type}] SSL habilitado (rejectUnauthorized: ${poolConfig.ssl.rejectUnauthorized})`);
    }

    // Crear pool
    this.pool = new Pool(poolConfig);

    // Manejar errores del pool en clientes inactivos
    this.pool.on('error', (err) => {
      logger.error(err, '[PostgreSQL] Pool error on idle client');
    });

    // Probar conexión
    const client = await this.pool.connect();
    try {
      await client.query('SELECT 1');
    } finally {
      client.release();
    }

    logger.info(
      `[${this.type}] Pool de conexiones creado: ${pgConfig.host}:${pgConfig.port}/${pgConfig.database}`
    );
  }

  /**
   * Desconecta y cierra el pool
   */
  protected async doDisconnect(): Promise<void> {
    if (this.pool) {
      await this.pool.end();
      this.pool = null;
      logger.info(`[${this.type}] Pool de conexiones cerrado`);
    }
  }

  /**
   * Prueba la conexión sin guardar estado
   */
  protected async doTestConnection(config: IConnectionConfig): Promise<TestResult> {
    const pgConfig = config as PostgreSQLConfig;

    let testPool: pg.Pool | null = null;

    try {
      // Configuración del pool de prueba
      const poolConfig: pg.PoolConfig = {
        host: pgConfig.host,
        port: pgConfig.port,
        database: pgConfig.database,
        user: pgConfig.user,
        password: pgConfig.password,
        connectionTimeoutMillis: pgConfig.connectionTimeout,
      };

      // Configurar SSL si está habilitado
      if (pgConfig.ssl?.enabled) {
        poolConfig.ssl = {
          rejectUnauthorized: pgConfig.ssl.rejectUnauthorized ?? true,
        };
      }

      testPool = new Pool(poolConfig);

      // Obtener versión de PostgreSQL
      const result = await testPool.query('SELECT version() as version');
      const version = result.rows[0]?.version ?? 'Desconocida';
      const shortVersion = version.split(',')[0] ?? version;

      await testPool.end();

      return {
        success: true,
        message: `Conexión exitosa. ${shortVersion}`,
      };
    } catch (error) {
      if (testPool) {
        try {
          await testPool.end();
        } catch (closeError) {
          logger.error(closeError, `[${this.type}] Error al cerrar pool de test`);
        }
      }

      const errorMessage = error instanceof Error ? error.message : String(error);
      return {
        success: false,
        message: `Error de conexión: ${errorMessage}`,
      };
    }
  }

  /**
   * Convierte parámetros de @param o :param a formato posicional $1, $2, etc.
   */
  private convertParameters(sql: string, params?: IQueryParams): { sql: string; values: unknown[] } {
    if (!params || Object.keys(params).length === 0) {
      return { sql, values: [] };
    }

    const values: unknown[] = [];
    const paramMap = new Map<string, number>();
    let paramIndex = 1;

    // Construir mapa de parámetros a índices posicionales
    for (const [key, value] of Object.entries(params)) {
      paramMap.set(key, paramIndex);
      values.push(value);
      paramIndex++;
    }

    // Reemplazar @param o :param con $N
    let convertedSql = sql;
    for (const [key, index] of paramMap.entries()) {
      // Reemplazar @key o :key con $N
      const atPattern = new RegExp(`@${key}\\b`, 'g');
      const colonPattern = new RegExp(`:${key}\\b`, 'g');
      convertedSql = convertedSql.replace(atPattern, `$${index}`);
      convertedSql = convertedSql.replace(colonPattern, `$${index}`);
    }

    return { sql: convertedSql, values };
  }

  /**
   * Ejecuta una query SQL
   */
  protected async doExecuteQuery(sql: string, params?: IQueryParams): Promise<IQueryResult> {
    if (!this.pool) {
      throw new Error('Pool de conexiones no inicializado');
    }

    // Convertir parámetros a formato posicional
    const { sql: convertedSql, values } = this.convertParameters(sql, params);

    // Ejecutar query
    const result = await this.pool.query(convertedSql, values);

    return {
      rows: result.rows ?? [],
      rowCount: result.rowCount ?? 0,
      executionTimeMs: 0, // Será calculado por AbstractAdapter
    };
  }

  /**
   * Obtiene la lista de tablas
   */
  protected async doGetTables(): Promise<string[]> {
    const query = `
      SELECT
        table_schema || '.' || table_name as table_name
      FROM
        information_schema.tables
      WHERE
        table_type = 'BASE TABLE'
        AND table_schema NOT IN ('pg_catalog', 'information_schema')
      ORDER BY
        table_schema, table_name
    `;

    const result = await this.doExecuteQuery(query);

    return (result.rows as Record<string, unknown>[]).map((row) => row.table_name as string);
  }

  /**
   * Obtiene las columnas de una tabla
   */
  protected async doGetColumns(tableName: string): Promise<IColumnInfo[]> {
    // Dividir schema.table si existe
    const parts = tableName.split('.');
    const schema = parts.length > 1 ? parts[0] : 'public';
    const table = parts.length > 1 ? parts[1] : parts[0];

    const query = `
      SELECT
        column_name as name,
        data_type as type,
        is_nullable as nullable,
        character_maximum_length as max_length,
        numeric_precision as precision,
        numeric_scale as scale
      FROM
        information_schema.columns
      WHERE
        table_schema = $1
        AND table_name = $2
      ORDER BY
        ordinal_position
    `;

    const result = await this.pool!.query(query, [schema ?? 'public', table ?? '']);

    return (result.rows as Record<string, unknown>[]).map((row) => ({
      name: row.name as string,
      type: row.type as string,
      nullable: row.nullable === 'YES',
      maxLength: row.max_length ? Number(row.max_length) : undefined,
      precision: row.precision ? Number(row.precision) : undefined,
      scale: row.scale ? Number(row.scale) : undefined,
    }));
  }

  /**
   * Obtiene datos de muestra de una tabla
   */
  protected async doGetSampleData(tableName: string, limit: number): Promise<IQueryResult> {
    // Sanitizar nombre de tabla (básico, para producción usar parametrización)
    const sanitizedTable = tableName.replace(/[^\w\."]/g, '');

    const query = `SELECT * FROM ${sanitizedTable} LIMIT ${limit}`;

    return await this.doExecuteQuery(query);
  }

  /**
   * Hook después de conectar - registra información del servidor
   */
  protected async afterConnect(): Promise<void> {
    try {
      const result = await this.doExecuteQuery('SELECT version() as version, current_database() as db');
      const info = result.rows[0] as Record<string, unknown>;

      if (info) {
        const version = (info.version as string).split(',')[0];
        logger.info(`[${this.type}] Conectado a: ${version}`);
        logger.info(`[${this.type}] Base de datos: ${info.db}`);
      }
    } catch (error) {
      // No lanzar error, es solo informativo
      logger.warn(`[${this.type}] No se pudo obtener información del servidor: ${error}`);
    }
  }

  /**
   * Obtiene estadísticas del pool de conexiones
   */
  getPoolStats(): {
    totalCount: number;
    idleCount: number;
    waitingCount: number;
  } | null {
    if (!this.pool) {
      return null;
    }

    return {
      totalCount: this.pool.totalCount,
      idleCount: this.pool.idleCount,
      waitingCount: this.pool.waitingCount,
    };
  }
}
