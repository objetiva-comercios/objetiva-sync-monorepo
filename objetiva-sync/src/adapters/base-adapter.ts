/**
 * Clase base abstracta para adaptadores de fuentes de datos
 * Implementa funcionalidad común y define el template pattern
 */

import type { z } from 'zod';
import type {
  IDataSourceAdapter,
  IConnectionConfig,
  IQueryResult,
  IQueryParams,
  IColumnInfo,
} from './types.js';
import type { TestResult } from '../types/common.js';
import { logger } from '../utils/logger.js';

/**
 * Clase abstracta base para todos los adaptadores
 */
export abstract class AbstractAdapter implements IDataSourceAdapter {
  protected _isConnected: boolean = false;
  protected config: IConnectionConfig | null = null;

  /**
   * Tipo del adaptador (debe ser implementado por subclases)
   */
  abstract readonly type: string;

  /**
   * Nombre legible del adaptador (debe ser implementado por subclases)
   */
  abstract readonly displayName: string;

  /**
   * Indica si el adaptador está conectado
   */
  get isConnected(): boolean {
    return this._isConnected;
  }

  /**
   * Obtiene el schema Zod para validar configuración
   * Debe ser implementado por cada adaptador
   */
  abstract getConfigSchema(): z.ZodTypeAny;

  /**
   * Conecta a la fuente de datos
   * Template method que llama a doConnect (implementado por subclases)
   */
  async connect(config: IConnectionConfig): Promise<void> {
    try {
      logger.info(`[${this.type}] Conectando a fuente de datos...`);

      // Validar configuración
      const schema = this.getConfigSchema();
      const validatedConfig = schema.parse(config);

      // Guardar configuración
      this.config = validatedConfig;

      // Hook: antes de conectar
      await this.beforeConnect();

      // Conectar (implementado por subclase)
      await this.doConnect(validatedConfig);

      this._isConnected = true;

      // Hook: después de conectar
      await this.afterConnect();

      logger.info(`[${this.type}] ✅ Conectado exitosamente`);
    } catch (error) {
      this._isConnected = false;
      logger.error(error, `[${this.type}] ❌ Error al conectar`);
      throw error;
    }
  }

  /**
   * Desconecta de la fuente de datos
   * Template method que llama a doDisconnect (implementado por subclases)
   */
  async disconnect(): Promise<void> {
    try {
      if (!this._isConnected) {
        logger.warn(`[${this.type}] No hay conexión activa para cerrar`);
        return;
      }

      logger.info(`[${this.type}] Desconectando...`);

      // Hook: antes de desconectar
      await this.beforeDisconnect();

      // Desconectar (implementado por subclase)
      await this.doDisconnect();

      this._isConnected = false;
      this.config = null;

      // Hook: después de desconectar
      await this.afterDisconnect();

      logger.info(`[${this.type}] ✅ Desconectado exitosamente`);
    } catch (error) {
      logger.error(error, `[${this.type}] ❌ Error al desconectar`);
      throw error;
    }
  }

  /**
   * Prueba la conexión sin guardar estado
   */
  async testConnection(config?: IConnectionConfig): Promise<TestResult> {
    const configToTest = config ?? this.config;

    if (!configToTest) {
      return {
        success: false,
        message: 'No hay configuración de conexión disponible',
      };
    }

    try {
      logger.info(`[${this.type}] Probando conexión...`);

      // Validar configuración
      const schema = this.getConfigSchema();
      const validatedConfig = schema.parse(configToTest);

      // Probar conexión (implementado por subclase)
      const result = await this.doTestConnection(validatedConfig);

      logger.info(
        `[${this.type}] Test de conexión: ${result.success ? '✅ exitoso' : '❌ fallido'}`
      );

      return result;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      logger.error(error, `[${this.type}] Error en test de conexión`);

      return {
        success: false,
        message: `Error: ${errorMessage}`,
      };
    }
  }

  /**
   * Ejecuta una query SQL
   */
  async executeQuery(sql: string, params?: IQueryParams): Promise<IQueryResult> {
    if (!this._isConnected) {
      throw new Error(`[${this.type}] No hay conexión activa. Ejecutar connect() primero.`);
    }

    try {
      const startTime = Date.now();

      logger.debug({
        sql: sql.substring(0, 100) + (sql.length > 100 ? '...' : ''),
        params,
      }, `[${this.type}] Ejecutando query...`);

      // Ejecutar query (implementado por subclase)
      const result = await this.doExecuteQuery(sql, params);

      const executionTimeMs = Date.now() - startTime;

      logger.info(
        `[${this.type}] Query ejecutada: ${result.rowCount} filas en ${executionTimeMs}ms`
      );

      return {
        ...result,
        executionTimeMs,
      };
    } catch (error) {
      logger.error({ sql, params, error }, `[${this.type}] Error al ejecutar query`);
      throw error;
    }
  }

  /**
   * Obtiene la lista de tablas
   */
  async getTables(): Promise<string[]> {
    if (!this._isConnected) {
      throw new Error(`[${this.type}] No hay conexión activa`);
    }

    try {
      const tables = await this.doGetTables();
      logger.info(`[${this.type}] Obtenidas ${tables.length} tablas`);
      return tables;
    } catch (error) {
      logger.error({ error }, `[${this.type}] Error al obtener tablas`);
      throw error;
    }
  }

  /**
   * Obtiene las columnas de una tabla
   */
  async getColumns(tableName: string): Promise<IColumnInfo[]> {
    if (!this._isConnected) {
      throw new Error(`[${this.type}] No hay conexión activa`);
    }

    try {
      const columns = await this.doGetColumns(tableName);
      logger.info(`[${this.type}] Obtenidas ${columns.length} columnas de tabla ${tableName}`);
      return columns;
    } catch (error) {
      logger.error({ error, tableName }, `[${this.type}] Error al obtener columnas`);
      throw error;
    }
  }

  /**
   * Obtiene datos de muestra de una tabla
   */
  async getSampleData(tableName: string, limit: number = 10): Promise<IQueryResult> {
    if (!this._isConnected) {
      throw new Error(`[${this.type}] No hay conexión activa`);
    }

    try {
      const result = await this.doGetSampleData(tableName, limit);
      logger.info(
        `[${this.type}] Obtenidas ${result.rowCount} filas de muestra de tabla ${tableName}`
      );
      return result;
    } catch (error) {
      logger.error({ error, tableName }, `[${this.type}] Error al obtener datos de muestra`);
      throw error;
    }
  }

  // ============================================================================
  // MÉTODOS ABSTRACTOS - Deben ser implementados por subclases
  // ============================================================================

  /**
   * Implementación específica de conexión
   */
  protected abstract doConnect(config: IConnectionConfig): Promise<void>;

  /**
   * Implementación específica de desconexión
   */
  protected abstract doDisconnect(): Promise<void>;

  /**
   * Implementación específica de test de conexión
   */
  protected abstract doTestConnection(config: IConnectionConfig): Promise<TestResult>;

  /**
   * Implementación específica de ejecución de query
   */
  protected abstract doExecuteQuery(sql: string, params?: IQueryParams): Promise<IQueryResult>;

  /**
   * Implementación específica para obtener tablas
   */
  protected abstract doGetTables(): Promise<string[]>;

  /**
   * Implementación específica para obtener columnas
   */
  protected abstract doGetColumns(tableName: string): Promise<IColumnInfo[]>;

  /**
   * Implementación específica para obtener datos de muestra
   */
  protected abstract doGetSampleData(tableName: string, limit: number): Promise<IQueryResult>;

  // ============================================================================
  // HOOKS - Pueden ser sobrescritos por subclases si necesitan lógica adicional
  // ============================================================================

  /**
   * Hook ejecutado antes de conectar
   */
  protected async beforeConnect(): Promise<void> {
    // Implementación por defecto: no hace nada
  }

  /**
   * Hook ejecutado después de conectar
   */
  protected async afterConnect(): Promise<void> {
    // Implementación por defecto: no hace nada
  }

  /**
   * Hook ejecutado antes de desconectar
   */
  protected async beforeDisconnect(): Promise<void> {
    // Implementación por defecto: no hace nada
  }

  /**
   * Hook ejecutado después de desconectar
   */
  protected async afterDisconnect(): Promise<void> {
    // Implementación por defecto: no hace nada
  }
}
