/**
 * Exportaciones centralizadas de adaptadores
 */

// Tipos e interfaces
export type {
  IDataSourceAdapter,
  IConnectionConfig,
  IQueryResult,
  IQueryParams,
  IColumnInfo,
  AdapterConstructor,
  IAdapterRegistry,
} from './types.js';

// Clase base
export { AbstractAdapter } from './base-adapter.js';

// Adaptador SQL Server
export { SQLServerAdapter } from './sqlserver/index.js';
export type { SQLServerConfig } from './sqlserver/index.js';

// Adaptador PostgreSQL
export { PostgreSQLAdapter } from './postgresql/index.js';
export type { PostgreSQLConfig } from './postgresql/index.js';

// Registro de adaptadores disponibles
import { SQLServerAdapter } from './sqlserver/index.js';
import { PostgreSQLAdapter } from './postgresql/index.js';
import type { IAdapterRegistry, IDataSourceAdapter } from './types.js';

/**
 * Registro global de adaptadores
 */
export const ADAPTER_REGISTRY: IAdapterRegistry = {
  sqlserver: SQLServerAdapter,
  postgres: PostgreSQLAdapter,
};

/**
 * Factory para crear instancias de adaptadores
 */
export function createAdapter(type: string): IDataSourceAdapter {
  const AdapterClass = ADAPTER_REGISTRY[type];

  if (!AdapterClass) {
    throw new Error(
      `Adaptador no encontrado: ${type}. Adaptadores disponibles: ${Object.keys(ADAPTER_REGISTRY).join(', ')}`
    );
  }

  return new AdapterClass();
}

/**
 * Obtiene la lista de tipos de adaptadores disponibles
 */
export function getAvailableAdapters(): string[] {
  return Object.keys(ADAPTER_REGISTRY);
}
