/**
 * Adaptador para SQL Server
 * Utiliza el paquete mssql para conexión con pool
 */

import sql from 'mssql';
import sqlMsnodesqlv8 from 'mssql/msnodesqlv8.js';
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

/**
 * Schema Zod para configuración de SQL Server
 */
const sqlServerConfigSchema = z.object({
  server: z.string().min(1, 'El servidor es requerido'),
  port: z.number().int().min(1).max(65535).optional(),
  database: z.string().min(1, 'La base de datos es requerida'),
  user: z.string().optional(),
  password: z.string().optional(),
  driver: z.string().optional(), // 'tedious' (default) or 'msnodesqlv8'
  options: z
    .object({
      encrypt: z.boolean().default(false),
      trustServerCertificate: z.boolean().default(true),
      trustedConnection: z.boolean().default(false),
      enableArithAbort: z.boolean().default(true),
      connectionTimeout: z.number().int().min(1000).default(30000),
      requestTimeout: z.number().int().min(1000).default(120000),
    })
    .optional(),
}).refine(
  (data) => {
    // Si trustedConnection está activo, no se requiere user/password
    const useTrustedConnection = data.options?.trustedConnection ?? false;
    if (useTrustedConnection) {
      return true;
    }
    // Si no usa trustedConnection, requiere user y password
    return data.user && data.password;
  },
  {
    message: 'Se requiere usuario y contraseña, o activar autenticación de Windows',
  }
);

/**
 * Tipo inferido de la configuración
 */
export type SQLServerConfig = z.infer<typeof sqlServerConfigSchema>;

/**
 * Adaptador para conectar a SQL Server
 */
export class SQLServerAdapter extends AbstractAdapter {
  readonly type = 'sqlserver';
  readonly displayName = 'Microsoft SQL Server';

  private pool: sql.ConnectionPool | null = null;

  /**
   * Obtiene el schema Zod para validación
   */
  getConfigSchema(): z.ZodTypeAny {
    return sqlServerConfigSchema;
  }

  /**
   * Conecta a SQL Server y crea el pool de conexiones
   */
  protected async doConnect(config: IConnectionConfig): Promise<void> {
    const sqlConfig = config as SQLServerConfig;

    const useTrustedConnection = sqlConfig.options?.trustedConnection ?? false;
    const useCustomDriver = sqlConfig.driver === 'msnodesqlv8';

    // Configuración base
    const poolConfig: sql.config = {
      server: sqlConfig.server,
      database: sqlConfig.database,
      options: {
        encrypt: sqlConfig.options?.encrypt ?? false,
        trustServerCertificate: sqlConfig.options?.trustServerCertificate ?? true,
        enableArithAbort: sqlConfig.options?.enableArithAbort ?? true,
      },
      connectionTimeout: sqlConfig.options?.connectionTimeout ?? 30000,
      requestTimeout: sqlConfig.options?.requestTimeout ?? 120000,
      pool: {
        min: 1,
        max: 10,
        idleTimeoutMillis: 30000,
      },
    };

    // Agregar puerto solo si está definido
    if (sqlConfig.port) {
      poolConfig.port = sqlConfig.port;
    }

    // Configurar autenticación
    if (useTrustedConnection) {
      // Para msnodesqlv8 driver (Windows Authentication nativo)
      if (useCustomDriver) {
        (poolConfig.options as any).trustedConnection = true;
        logger.info(`[${this.type}] Usando autenticación de Windows (msnodesqlv8)`);
      } else {
        // Para tedious driver (Windows Authentication via domain)
        (poolConfig as any).authentication = {
          type: 'ntlm',
          options: {
            domain: '',
          },
        };
        logger.info(`[${this.type}] Usando autenticación de Windows (NTLM)`);
      }
    } else {
      // Autenticación SQL Server
      poolConfig.user = sqlConfig.user;
      poolConfig.password = sqlConfig.password;
      logger.info(`[${this.type}] Usando autenticación SQL Server (usuario: ${sqlConfig.user})`);
    }

    // Crear pool con el driver correcto
    if (useCustomDriver && useTrustedConnection) {
      // Usar msnodesqlv8 importado directamente
      this.pool = new sqlMsnodesqlv8.ConnectionPool(poolConfig);
    } else {
      // Usar tedious (default)
      this.pool = new sql.ConnectionPool(poolConfig);
    }

    // Conectar
    await this.pool.connect();

    logger.info(
      `[${this.type}] Pool de conexiones creado: ${sqlConfig.server}/${sqlConfig.database}`
    );
  }

  /**
   * Desconecta y cierra el pool
   */
  protected async doDisconnect(): Promise<void> {
    if (this.pool) {
      await this.pool.close();
      this.pool = null;
      logger.info(`[${this.type}] Pool de conexiones cerrado`);
    }
  }

  /**
   * Prueba la conexión sin guardar estado
   */
  protected async doTestConnection(config: IConnectionConfig): Promise<TestResult> {
    const sqlConfig = config as SQLServerConfig;

    let testPool: sql.ConnectionPool | null = null;

    try {
      const useTrustedConnection = sqlConfig.options?.trustedConnection ?? false;
      const useCustomDriver = sqlConfig.driver === 'msnodesqlv8';

      // Configuración base
      const poolConfig: sql.config = {
        server: sqlConfig.server,
        database: sqlConfig.database,
        options: {
          encrypt: sqlConfig.options?.encrypt ?? false,
          trustServerCertificate: sqlConfig.options?.trustServerCertificate ?? true,
          enableArithAbort: sqlConfig.options?.enableArithAbort ?? true,
        },
        connectionTimeout: sqlConfig.options?.connectionTimeout ?? 30000,
        requestTimeout: sqlConfig.options?.requestTimeout ?? 120000,
      };

      // Agregar puerto solo si está definido
      if (sqlConfig.port) {
        poolConfig.port = sqlConfig.port;
      }

      // Configurar autenticación
      if (useTrustedConnection) {
        // Para msnodesqlv8 driver (Windows Authentication nativo)
        if (useCustomDriver) {
          (poolConfig.options as any).trustedConnection = true;
        } else {
          // Para tedious driver (Windows Authentication via domain)
          (poolConfig as any).authentication = {
            type: 'ntlm',
            options: {
              domain: '',
            },
          };
        }
      } else {
        // Autenticación SQL Server
        poolConfig.user = sqlConfig.user;
        poolConfig.password = sqlConfig.password;
      }

      // Crear pool con el driver correcto
      if (useCustomDriver && useTrustedConnection) {
        // Usar msnodesqlv8 importado directamente
        testPool = new sqlMsnodesqlv8.ConnectionPool(poolConfig);
      } else {
        // Usar tedious (default)
        testPool = new sql.ConnectionPool(poolConfig);
      }

      await testPool.connect();

      // Ejecutar query simple para verificar
      const result = await testPool.request().query('SELECT @@VERSION as version');

      const version = result.recordset[0]?.version ?? 'Desconocida';
      const shortVersion = version.split('\n')[0] ?? version;

      await testPool.close();

      return {
        success: true,
        message: `Conexión exitosa. ${shortVersion}`,
      };
    } catch (error) {
      if (testPool) {
        try {
          await testPool.close();
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
   * Ejecuta una query SQL
   */
  protected async doExecuteQuery(sql: string, params?: IQueryParams): Promise<IQueryResult> {
    if (!this.pool) {
      throw new Error('Pool de conexiones no inicializado');
    }

    const request = this.pool.request();

    // Agregar parámetros si existen
    if (params) {
      for (const [key, value] of Object.entries(params)) {
        request.input(key, value);
      }
    }

    // Ejecutar query
    const result = await request.query(sql);

    return {
      rows: result.recordset ?? [],
      rowCount: result.recordset?.length ?? 0,
      executionTimeMs: 0, // Será calculado por AbstractAdapter
    };
  }

  /**
   * Obtiene la lista de tablas
   */
  protected async doGetTables(): Promise<string[]> {
    const query = `
      SELECT
        TABLE_SCHEMA + '.' + TABLE_NAME as TableName
      FROM
        INFORMATION_SCHEMA.TABLES
      WHERE
        TABLE_TYPE = 'BASE TABLE'
      ORDER BY
        TABLE_SCHEMA, TABLE_NAME
    `;

    const result = await this.doExecuteQuery(query);

    return (result.rows as Record<string, unknown>[]).map((row) => row.TableName as string);
  }

  /**
   * Obtiene las columnas de una tabla
   */
  protected async doGetColumns(tableName: string): Promise<IColumnInfo[]> {
    // Dividir schema.table si existe
    const parts = tableName.split('.');
    const schema = parts.length > 1 ? parts[0] : 'dbo';
    const table = parts.length > 1 ? parts[1] : parts[0];

    const query = `
      SELECT
        COLUMN_NAME as name,
        DATA_TYPE as type,
        IS_NULLABLE as nullable,
        CHARACTER_MAXIMUM_LENGTH as maxLength,
        NUMERIC_PRECISION as precision,
        NUMERIC_SCALE as scale
      FROM
        INFORMATION_SCHEMA.COLUMNS
      WHERE
        TABLE_SCHEMA = @schema
        AND TABLE_NAME = @table
      ORDER BY
        ORDINAL_POSITION
    `;

    const result = await this.doExecuteQuery(query, {
      schema: schema ?? 'dbo',
      table: table ?? '',
    });

    return (result.rows as Record<string, unknown>[]).map((row) => ({
      name: row.name as string,
      type: row.type as string,
      nullable: row.nullable === 'YES',
      maxLength: row.maxLength ? Number(row.maxLength) : undefined,
      precision: row.precision ? Number(row.precision) : undefined,
      scale: row.scale ? Number(row.scale) : undefined,
    }));
  }

  /**
   * Obtiene datos de muestra de una tabla
   */
  protected async doGetSampleData(tableName: string, limit: number): Promise<IQueryResult> {
    // Sanitizar nombre de tabla (básico, para producción usar parametrización)
    const sanitizedTable = tableName.replace(/[^\w\.\[\]]/g, '');

    const query = `SELECT TOP ${limit} * FROM ${sanitizedTable}`;

    return await this.doExecuteQuery(query);
  }

  /**
   * Hook después de conectar - registra información del servidor
   */
  protected async afterConnect(): Promise<void> {
    try {
      const result = await this.doExecuteQuery('SELECT @@VERSION as version, DB_NAME() as db');
      const info = result.rows[0] as Record<string, unknown>;

      if (info) {
        const version = (info.version as string).split('\n')[0];
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
    size: number;
    available: number;
    pending: number;
    borrowed: number;
  } | null {
    if (!this.pool) {
      return null;
    }

    return {
      size: this.pool.size,
      available: this.pool.available,
      pending: this.pool.pending,
      borrowed: this.pool.borrowed,
    };
  }
}
