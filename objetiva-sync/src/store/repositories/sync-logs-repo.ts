/**
 * Repositorio para la tabla `sync_logs`
 * Gestión del historial de sincronizaciones
 */

import { eq, and, gte, lte, desc } from 'drizzle-orm';
import { getDatabase } from '../index.js';
import { syncLogs, type SyncLog, type NewSyncLog } from '../schema.js';
import { logger } from '../../utils/logger.js';
import { daysAgo } from '../../utils/helpers.js';
import type { EntityType, SyncType, LogStatus } from '../../types/common.js';
import { logEventEmitter } from '../../dashboard/routes/api/log-stream.js';

/**
 * Interfaz para filtros de logs
 */
export interface LogFilters {
  entityType?: EntityType;
  queryId?: number;
  syncType?: SyncType;
  status?: LogStatus;
  dateFrom?: string;
  dateTo?: string;
}

/**
 * Interfaz para paginación
 */
export interface LogPagination {
  limit?: number;
  offset?: number;
}

/**
 * Resultado de consulta de logs con paginación
 */
export interface LogsResult {
  logs: SyncLog[];
  total: number;
  limit: number;
  offset: number;
}

/**
 * Crea un nuevo log de sincronización
 */
export async function createLog(data: {
  queryId?: number;
  queryName?: string;
  entityType: EntityType;
  syncType: SyncType;
  status: LogStatus;
  recordsFetched?: number;
  recordsSent?: number;
  recordsFailed?: number;
  durationMs?: number;
  errorMessage?: string | null;
  details?: Record<string, unknown> | null;
}): Promise<number> {
  try {
    const db = getDatabase();

    const newLog: NewSyncLog = {
      queryId: data.queryId ?? null,
      queryName: data.queryName ?? null,
      entityType: data.entityType,
      syncType: data.syncType,
      status: data.status,
      recordsFetched: data.recordsFetched ?? 0,
      recordsSent: data.recordsSent ?? 0,
      recordsFailed: data.recordsFailed ?? 0,
      durationMs: data.durationMs ?? null,
      errorMessage: data.errorMessage ?? null,
      details: data.details ? JSON.stringify(data.details) : null,
    };

    const result = await db.insert(syncLogs).values(newLog).returning();
    const insertedId = result[0]?.id;

    if (!insertedId) {
      throw new Error('No se pudo obtener el ID del log creado');
    }

    const logMessage = data.queryName
      ? `Log de sync creado: ${data.queryName} (${data.entityType}) - ${data.status} (ID: ${insertedId})`
      : `Log de sync creado: ${data.entityType} - ${data.status} (ID: ${insertedId})`;

    logger.info(logMessage);
n    // Emit SSE event for real-time dashboard updates
    const createdLog = await getLogById(insertedId);
    if (createdLog) {
      logEventEmitter.emit('newLog', createdLog);
    }
    return insertedId;
  } catch (error) {
    logger.error(error, 'Error al crear log de sincronización');
    throw error;
  }
}

/**
 * Actualiza un log existente
 */
export async function updateLog(
  id: number,
  data: {
    status?: LogStatus;
    recordsFetched?: number;
    recordsSent?: number;
    recordsFailed?: number;
    durationMs?: number;
    errorMessage?: string | null;
    metadata?: Record<string, unknown> | null;
  }
): Promise<void> {
  try {
    const db = getDatabase();

    const updateData: Partial<NewSyncLog> = {};

    if (data.status !== undefined) updateData.status = data.status;
    if (data.recordsFetched !== undefined) updateData.recordsFetched = data.recordsFetched;
    if (data.recordsSent !== undefined) updateData.recordsSent = data.recordsSent;
    if (data.recordsFailed !== undefined) updateData.recordsFailed = data.recordsFailed;
    if (data.durationMs !== undefined) updateData.durationMs = data.durationMs;
    if (data.errorMessage !== undefined) updateData.errorMessage = data.errorMessage;
    if (data.metadata !== undefined) {
      updateData.details = data.metadata ? JSON.stringify(data.metadata) : null;
    }

    await db.update(syncLogs).set(updateData).where(eq(syncLogs.id, id));

    logger.info(`Log de sync actualizado: ID ${id}`);
  } catch (error) {
    logger.error(error, `Error al actualizar log de sincronización: ${id}`);
    throw error;
  }
}

/**
 * Obtiene un log por ID
 */
export async function getLogById(id: number): Promise<SyncLog | null> {
  try {
    const db = getDatabase();
    const result = await db.select().from(syncLogs).where(eq(syncLogs.id, id)).limit(1);
    return result[0] ?? null;
  } catch (error) {
    logger.error(error, `Error al obtener log con ID: ${id}`);
    throw error;
  }
}

/**
 * Obtiene logs con filtros y paginación
 */
export async function getLogs(
  filters: LogFilters = {},
  pagination: LogPagination = {}
): Promise<LogsResult> {
  try {
    const db = getDatabase();
    const { limit = 50, offset = 0 } = pagination;

    // Construir condiciones WHERE
    const conditions = [];

    if (filters.entityType) {
      conditions.push(eq(syncLogs.entityType, filters.entityType));
    }

    if (filters.queryId) {
      conditions.push(eq(syncLogs.queryId, filters.queryId));
    }

    if (filters.syncType) {
      conditions.push(eq(syncLogs.syncType, filters.syncType));
    }

    if (filters.status) {
      conditions.push(eq(syncLogs.status, filters.status));
    }

    if (filters.dateFrom) {
      conditions.push(gte(syncLogs.createdAt, filters.dateFrom));
    }

    if (filters.dateTo) {
      conditions.push(lte(syncLogs.createdAt, filters.dateTo));
    }

    // Query con condiciones
    const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

    // Obtener logs
    const logs = await db
      .select()
      .from(syncLogs)
      .where(whereClause)
      .orderBy(desc(syncLogs.createdAt))
      .limit(limit)
      .offset(offset);

    // Contar total (sin paginación)
    const allLogs = await db.select().from(syncLogs).where(whereClause);
    const total = allLogs.length;

    return {
      logs,
      total,
      limit,
      offset,
    };
  } catch (error) {
    logger.error(error, 'Error al obtener logs');
    throw error;
  }
}

/**
 * Obtiene los últimos N logs
 */
export async function getRecentLogs(limit: number = 20): Promise<SyncLog[]> {
  try {
    const db = getDatabase();
    return await db
      .select()
      .from(syncLogs)
      .orderBy(desc(syncLogs.createdAt))
      .limit(limit);
  } catch (error) {
    logger.error(error, 'Error al obtener logs recientes');
    throw error;
  }
}

/**
 * Obtiene logs de una entidad
 */
export async function getLogsByEntity(
  entityType: EntityType,
  limit: number = 20
): Promise<SyncLog[]> {
  try {
    const db = getDatabase();
    return await db
      .select()
      .from(syncLogs)
      .where(eq(syncLogs.entityType, entityType))
      .orderBy(desc(syncLogs.createdAt))
      .limit(limit);
  } catch (error) {
    logger.error(error, `Error al obtener logs de entidad: ${entityType}`);
    throw error;
  }
}

/**
 * Obtiene logs de una query específica
 */
export async function getLogsByQuery(queryId: number, limit: number = 20): Promise<SyncLog[]> {
  try {
    const db = getDatabase();
    return await db
      .select()
      .from(syncLogs)
      .where(eq(syncLogs.queryId, queryId))
      .orderBy(desc(syncLogs.createdAt))
      .limit(limit);
  } catch (error) {
    logger.error(error, `Error al obtener logs de query: ${queryId}`);
    throw error;
  }
}

/**
 * Obtiene el último log de una query específica
 */
export async function getLastLogByQuery(queryId: number): Promise<SyncLog | null> {
  try {
    const db = getDatabase();
    const result = await db
      .select()
      .from(syncLogs)
      .where(eq(syncLogs.queryId, queryId))
      .orderBy(desc(syncLogs.createdAt))
      .limit(1);

    return result[0] ?? null;
  } catch (error) {
    logger.error(error, `Error al obtener último log de query: ${queryId}`);
    throw error;
  }
}

/**
 * Obtiene logs por estado
 */
export async function getLogsByStatus(status: LogStatus, limit: number = 20): Promise<SyncLog[]> {
  try {
    const db = getDatabase();
    return await db
      .select()
      .from(syncLogs)
      .where(eq(syncLogs.status, status))
      .orderBy(desc(syncLogs.createdAt))
      .limit(limit);
  } catch (error) {
    logger.error(error, `Error al obtener logs con status: ${status}`);
    throw error;
  }
}

/**
 * Elimina logs antiguos (older than X days)
 */
export async function deleteOldLogs(daysToKeep: number): Promise<number> {
  try {
    const db = getDatabase();
    const cutoffDate = daysAgo(daysToKeep).toISOString();

    // Contar logs a eliminar
    const logsToDelete = await db
      .select()
      .from(syncLogs)
      .where(lte(syncLogs.createdAt, cutoffDate));

    const count = logsToDelete.length;

    // Eliminar
    await db.delete(syncLogs).where(lte(syncLogs.createdAt, cutoffDate));

    logger.info(`Logs antiguos eliminados: ${count} (más de ${daysToKeep} días)`);
    return count;
  } catch (error) {
    logger.error(error, `Error al eliminar logs antiguos (${daysToKeep} días)`);
    throw error;
  }
}

/**
 * Elimina TODOS los logs (usar con precaución)
 */
export async function deleteAllLogs(): Promise<number> {
  try {
    const db = getDatabase();

    // Contar total de logs antes de eliminar
    const allLogs = await db.select().from(syncLogs);
    const count = allLogs.length;

    // Eliminar TODOS los logs
    await db.delete(syncLogs);

    logger.info(`Todos los logs eliminados: ${count} registros`);
    return count;
  } catch (error) {
    logger.error(error, 'Error al eliminar todos los logs');
    throw error;
  }
}

/**
 * Cuenta logs por estado
 */
export async function countByStatus(status: LogStatus): Promise<number> {
  try {
    const logs = await getLogsByStatus(status, Number.MAX_SAFE_INTEGER);
    return logs.length;
  } catch (error) {
    logger.error(error, `Error al contar logs con status: ${status}`);
    throw error;
  }
}

/**
 * Obtiene estadísticas de logs de las últimas 24 horas
 */
export async function getRecentStats(): Promise<{
  total: number;
  success: number;
  failed: number;
  partial: number;
  recordsSent: number;
  recordsFailed: number;
}> {
  try {
    const db = getDatabase();
    const last24h = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

    const recentLogs = await db
      .select()
      .from(syncLogs)
      .where(gte(syncLogs.createdAt, last24h));

    const stats = {
      total: recentLogs.length,
      success: recentLogs.filter((l) => l.status === 'success').length,
      failed: recentLogs.filter((l) => l.status === 'failed').length,
      partial: recentLogs.filter((l) => l.status === 'partial').length,
      recordsSent: recentLogs.reduce((sum, l) => sum + (l.recordsSent ?? 0), 0),
      recordsFailed: recentLogs.reduce((sum, l) => sum + (l.recordsFailed ?? 0), 0),
    };

    return stats;
  } catch (error) {
    logger.error(error, 'Error al obtener estadísticas recientes');
    throw error;
  }
}

/**
 * Obtiene el último log de una entidad
 */
export async function getLastLogByEntity(entityType: EntityType): Promise<SyncLog | null> {
  try {
    const db = getDatabase();
    const result = await db
      .select()
      .from(syncLogs)
      .where(eq(syncLogs.entityType, entityType))
      .orderBy(desc(syncLogs.createdAt))
      .limit(1);

    return result[0] ?? null;
  } catch (error) {
    logger.error(error, `Error al obtener último log de entidad: ${entityType}`);
    throw error;
  }
}

/**
 * Obtiene detalles desserializados de un log
 */
export async function getLogDetails<T = Record<string, unknown>>(id: number): Promise<T | null> {
  const log = await getLogById(id);

  if (!log || !log.details) {
    return null;
  }

  return JSON.parse(log.details) as T;
}
