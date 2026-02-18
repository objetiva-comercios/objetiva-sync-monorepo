/**
 * Interfaces y tipos para adaptadores de fuentes de datos
 */

import type { z } from 'zod';
import type { TestResult } from '../types/common.js';

/**
 * Configuración genérica de conexión
 */
export interface IConnectionConfig {
  [key: string]: unknown;
}

/**
 * Información de columna de una tabla
 */
export interface IColumnInfo {
  name: string;
  type: string;
  nullable: boolean;
  maxLength?: number;
  precision?: number;
  scale?: number;
}

/**
 * Resultado de ejecución de query
 */
export interface IQueryResult {
  rows: unknown[];
  rowCount: number;
  executionTimeMs: number;
}

/**
 * Parámetros para queries SQL
 */
export interface IQueryParams {
  [key: string]: string | number | boolean | Date | null;
}

/**
 * Interface principal para adaptadores de fuentes de datos
 * Implementa el patrón Strategy para soportar múltiples fuentes (SQL Server, PostgreSQL, MySQL, Excel)
 */
export interface IDataSourceAdapter {
  /**
   * Tipo del adaptador (identificador único)
   */
  readonly type: string;

  /**
   * Nombre legible del adaptador
   */
  readonly displayName: string;

  /**
   * Indica si el adaptador está conectado
   */
  readonly isConnected: boolean;

  /**
   * Obtiene el schema Zod para validar la configuración de conexión
   */
  getConfigSchema(): z.ZodTypeAny;

  /**
   * Conecta a la fuente de datos
   * @param config Configuración de conexión específica del adaptador
   */
  connect(config: IConnectionConfig): Promise<void>;

  /**
   * Desconecta de la fuente de datos
   */
  disconnect(): Promise<void>;

  /**
   * Prueba la conexión sin guardar estado
   * @param config Configuración de conexión a probar
   */
  testConnection(config?: IConnectionConfig): Promise<TestResult>;

  /**
   * Ejecuta una query SQL
   * @param sql Query SQL a ejecutar
   * @param params Parámetros opcionales (key-value pairs)
   */
  executeQuery(sql: string, params?: IQueryParams): Promise<IQueryResult>;

  /**
   * Obtiene la lista de tablas disponibles
   */
  getTables(): Promise<string[]>;

  /**
   * Obtiene las columnas de una tabla
   * @param tableName Nombre de la tabla
   */
  getColumns(tableName: string): Promise<IColumnInfo[]>;

  /**
   * Obtiene una muestra de datos de una tabla (útil para preview)
   * @param tableName Nombre de la tabla
   * @param limit Límite de filas (default: 10)
   */
  getSampleData(tableName: string, limit?: number): Promise<IQueryResult>;
}

/**
 * Tipo para el constructor de adaptadores
 */
export type AdapterConstructor = new () => IDataSourceAdapter;

/**
 * Registro de adaptadores disponibles
 */
export interface IAdapterRegistry {
  [type: string]: AdapterConstructor;
}
