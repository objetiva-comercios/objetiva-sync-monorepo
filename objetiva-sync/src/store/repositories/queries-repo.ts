/**
 * Repositorio para la tabla `queries`
 * Gestión de consultas SQL configuradas para cada entidad
 */

import { eq, and } from 'drizzle-orm';
import { getDatabase } from '../index.js';
import { queries, type Query, type NewQuery } from '../schema.js';
import { logger } from '../../utils/logger.js';
import type { EntityType } from '../../types/common.js';

/**
 * Obtiene una query por ID
 */
export async function getQuery(id: number): Promise<Query | null> {
  try {
    const db = getDatabase();
    const result = await db.select().from(queries).where(eq(queries.id, id)).limit(1);
    return result[0] ?? null;
  } catch (error) {
    logger.error(error, `Error al obtener query con ID: ${id}`);
    throw error;
  }
}

/**
 * Obtiene todas las queries de una entidad
 */
export async function getQueriesByEntity(entityType: EntityType): Promise<Query[]> {
  try {
    const db = getDatabase();
    const result = await db
      .select()
      .from(queries)
      .where(eq(queries.entityType, entityType));
    return result;
  } catch (error) {
    logger.error(error, `Error al obtener queries de entidad: ${entityType}`);
    throw error;
  }
}

/**
 * Obtiene la query activa de una entidad
 */
export async function getActiveQueryByEntity(entityType: EntityType): Promise<Query | null> {
  try {
    const db = getDatabase();
    const result = await db
      .select()
      .from(queries)
      .where(and(eq(queries.entityType, entityType), eq(queries.isActive, true)))
      .limit(1);
    return result[0] ?? null;
  } catch (error) {
    logger.error(error, `Error al obtener query activa de entidad: ${entityType}`);
    throw error;
  }
}

/**
 * Obtiene todas las queries activas
 */
export async function getAllActiveQueries(): Promise<Query[]> {
  try {
    const db = getDatabase();
    const result = await db.select().from(queries).where(eq(queries.isActive, true));
    return result;
  } catch (error) {
    logger.error(error, 'Error al obtener queries activas');
    throw error;
  }
}

/**
 * Obtiene todas las queries
 */
export async function getAllQueries(): Promise<Query[]> {
  try {
    const db = getDatabase();
    return await db.select().from(queries);
  } catch (error) {
    logger.error(error, 'Error al obtener todas las queries');
    throw error;
  }
}

/**
 * Crea una nueva query
 */
export async function createQuery(data: {
  entityType: EntityType;
  name: string;
  sqlQuery: string;
  incrementalField?: string;
  incrementalType?: 'date' | 'id';
  joinField?: string;
  isActive?: boolean;
}): Promise<number> {
  try {
    const db = getDatabase();

    const newQuery: NewQuery = {
      entityType: data.entityType,
      name: data.name,
      sqlQuery: data.sqlQuery,
      incrementalField: data.incrementalField ?? null,
      incrementalType: data.incrementalType ?? null,
      joinField: data.joinField ?? null,
      isActive: data.isActive ?? true,
    };

    const result = await db.insert(queries).values(newQuery).returning();
    const insertedId = result[0]?.id;

    if (!insertedId) {
      throw new Error('No se pudo obtener el ID de la query creada');
    }

    logger.info(`Query creada: ${data.name} (ID: ${insertedId})`);
    return insertedId;
  } catch (error) {
    logger.error(error, `Error al crear query: ${data.name}`);
    throw error;
  }
}

/**
 * Actualiza una query existente
 */
export async function updateQuery(
  id: number,
  data: {
    name?: string;
    entityType?: EntityType;  // ← AGREGAR ESTA LÍNEA
    sqlQuery?: string;
    incrementalField?: string | null;
    incrementalType?: 'date' | 'id' | null;
    joinField?: string | null;
    isActive?: boolean;
  }
): Promise<void> {
  try {
    const db = getDatabase();

    const updateData: Partial<NewQuery> & { updatedAt: string } = {
      updatedAt: new Date().toISOString(),
    };

    if (data.name !== undefined) updateData.name = data.name;
    if (data.entityType !== undefined) updateData.entityType = data.entityType;  // ← AGREGAR ESTA LÍNEA
    if (data.sqlQuery !== undefined) updateData.sqlQuery = data.sqlQuery;
    if (data.incrementalField !== undefined) updateData.incrementalField = data.incrementalField;
    if (data.incrementalType !== undefined) updateData.incrementalType = data.incrementalType;
    if (data.joinField !== undefined) updateData.joinField = data.joinField;
    if (data.isActive !== undefined) updateData.isActive = data.isActive;

    await db.update(queries).set(updateData).where(eq(queries.id, id));

    logger.info(`Query actualizada: ID ${id}`);
  } catch (error) {
    logger.error(error, `Error al actualizar query: ${id}`);
    throw error;
  }
}

/**
 * Elimina una query
 * Esto también eliminará el sync_state asociado por CASCADE
 */
export async function deleteQuery(id: number): Promise<void> {
  try {
    const db = getDatabase();
    await db.delete(queries).where(eq(queries.id, id));
    logger.info(`Query eliminada: ID ${id}`);
  } catch (error) {
    logger.error(error, `Error al eliminar query: ${id}`);
    throw error;
  }
}

/**
 * Actualiza el estado del último test de una query
 */
export async function updateQueryTestStatus(
  id: number,
  success: boolean,
  rowCount?: number
): Promise<void> {
  try {
    const db = getDatabase();

    await db
      .update(queries)
      .set({
        lastTestStatus: success ? 'success' : 'failed',
        lastTestAt: new Date().toISOString(),
        lastTestRowCount: rowCount ?? null,
        updatedAt: new Date().toISOString(),
      })
      .where(eq(queries.id, id));

    logger.info(`Test status actualizado para query ID ${id}: ${success ? 'success' : 'failed'}`);
  } catch (error) {
    logger.error(error, `Error al actualizar test status de query: ${id}`);
    throw error;
  }
}

/**
 * Activa/desactiva una query
 */
export async function toggleQueryActive(id: number, isActive: boolean): Promise<void> {
  try {
    const db = getDatabase();

    await db
      .update(queries)
      .set({
        isActive,
        updatedAt: new Date().toISOString(),
      })
      .where(eq(queries.id, id));

    logger.info(`Query ${isActive ? 'activada' : 'desactivada'}: ID ${id}`);
  } catch (error) {
    logger.error(error, `Error al cambiar estado de query: ${id}`);
    throw error;
  }
}

/**
 * Obtiene queries ordenadas por displayOrder
 */
export async function getQueriesOrdered(): Promise<Query[]> {
  try {
    const db = getDatabase();
    const result = await db.select().from(queries).orderBy(queries.displayOrder);
    return result;
  } catch (error) {
    logger.error(error, 'Error al obtener queries ordenadas');
    throw error;
  }
}

/**
 * Obtiene queries programadas para el scheduler (isScheduled = true)
 */
export async function getScheduledQueries(): Promise<Query[]> {
  try {
    const db = getDatabase();
    const result = await db
      .select()
      .from(queries)
      .where(and(eq(queries.isActive, true), eq(queries.isScheduled, true)))
      .orderBy(queries.displayOrder);
    return result;
  } catch (error) {
    logger.error(error, 'Error al obtener queries programadas');
    throw error;
  }
}

/**
 * Reordena queries después de drag & drop
 * @param orderedIds Array de IDs en el nuevo orden deseado
 */
export async function reorderQueries(orderedIds: number[]): Promise<void> {
  try {
    const db = getDatabase();

    // Actualizar displayOrder de cada query según su posición en el array
    for (let i = 0; i < orderedIds.length; i++) {
      await db
        .update(queries)
        .set({
          displayOrder: i,
          updatedAt: new Date().toISOString(),
        })
        .where(eq(queries.id, orderedIds[i]!));
    }

    logger.info(`Queries reordenadas: ${orderedIds.length} queries`);
  } catch (error) {
    logger.error(error, 'Error al reordenar queries');
    throw error;
  }
}

/**
 * Activa/desactiva programación de una query en el scheduler
 */
export async function toggleQueryScheduled(id: number, isScheduled: boolean): Promise<void> {
  try {
    const db = getDatabase();

    await db
      .update(queries)
      .set({
        isScheduled,
        updatedAt: new Date().toISOString(),
      })
      .where(eq(queries.id, id));

    logger.info(`Query ${isScheduled ? 'programada' : 'desprogramada'}: ID ${id}`);
  } catch (error) {
    logger.error(error, `Error al cambiar programación de query: ${id}`);
    throw error;
  }
}

/**
 * Actualiza el intervalo de sincronización de una query
 * @param id ID de la query
 * @param intervalSeconds Intervalo en segundos (15-86400)
 */
export async function updateQueryInterval(id: number, intervalSeconds: number): Promise<void> {
  try {
    // Validar rango
    if (intervalSeconds < 15 || intervalSeconds > 86400) {
      throw new Error('Intervalo debe estar entre 15 segundos y 86400 segundos (24 horas)');
    }

    const db = getDatabase();

    await db
      .update(queries)
      .set({
        syncInterval: intervalSeconds,
        updatedAt: new Date().toISOString(),
      })
      .where(eq(queries.id, id));

    logger.info(`Intervalo actualizado para query ID ${id}: ${intervalSeconds} segundos`);
  } catch (error) {
    logger.error(error, `Error al actualizar intervalo de query: ${id}`);
    throw error;
  }
}
