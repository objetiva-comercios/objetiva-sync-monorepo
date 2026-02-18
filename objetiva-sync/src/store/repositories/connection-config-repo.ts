/**
 * Repositorio para la tabla `connection_config`
 * Gestión de conexiones a orígenes de datos (ERPs)
 */

import { eq } from 'drizzle-orm';
import { getDatabase } from '../index.js';
import {
  connectionConfig,
  type ConnectionConfig,
  type NewConnectionConfig,
} from '../schema.js';
import { logger } from '../../utils/logger.js';
import { encryptJSON, decryptJSON } from '../../utils/crypto.js';
import type { TestResult } from '../../types/common.js';

/**
 * Obtiene la conexión activa
 */
export async function getActiveConnection(): Promise<ConnectionConfig | null> {
  try {
    const db = getDatabase();
    const result = await db
      .select()
      .from(connectionConfig)
      .where(eq(connectionConfig.isActive, true))
      .limit(1);

    return result[0] ?? null;
  } catch (error) {
    logger.error(error, 'Error al obtener conexión activa');
    throw error;
  }
}

/**
 * Obtiene una conexión por ID
 */
export async function getConnectionById(id: number): Promise<ConnectionConfig | null> {
  try {
    const db = getDatabase();
    const result = await db
      .select()
      .from(connectionConfig)
      .where(eq(connectionConfig.id, id))
      .limit(1);

    return result[0] ?? null;
  } catch (error) {
    logger.error(error, `Error al obtener conexión con ID: ${id}`);
    throw error;
  }
}

/**
 * Obtiene todas las conexiones
 */
export async function getAllConnections(): Promise<ConnectionConfig[]> {
  try {
    const db = getDatabase();
    return await db.select().from(connectionConfig);
  } catch (error) {
    logger.error(error, 'Error al obtener todas las conexiones');
    throw error;
  }
}

/**
 * Crea una nueva conexión
 * El config se encripta antes de guardar
 */
export async function createConnection(data: {
  adapterType: string;
  name: string;
  config: Record<string, unknown>;
}): Promise<number> {
  try {
    const db = getDatabase();

    // Encriptar la configuración
    const encryptedConfig = encryptJSON(data.config);

    const newConnection: NewConnectionConfig = {
      adapterType: data.adapterType,
      name: data.name,
      configJson: encryptedConfig,
      isActive: false,
    };

    const result = await db.insert(connectionConfig).values(newConnection).returning();
    const insertedId = result[0]?.id;

    if (!insertedId) {
      throw new Error('No se pudo obtener el ID de la conexión creada');
    }

    logger.info(`Conexión creada: ${data.name} (ID: ${insertedId})`);
    return insertedId;
  } catch (error) {
    logger.error(error, `Error al crear conexión: ${data.name}`);
    throw error;
  }
}

/**
 * Actualiza una conexión existente
 */
export async function updateConnection(
  id: number,
  data: {
    name?: string;
    config?: Record<string, unknown>;
  }
): Promise<void> {
  try {
    const db = getDatabase();

    const updateData: Partial<NewConnectionConfig> & { updatedAt: string } = {
      updatedAt: new Date().toISOString(),
    };

    if (data.name !== undefined) {
      updateData.name = data.name;
    }

    if (data.config !== undefined) {
      updateData.configJson = encryptJSON(data.config);
    }

    await db.update(connectionConfig).set(updateData).where(eq(connectionConfig.id, id));

    logger.info(`Conexión actualizada: ID ${id}`);
  } catch (error) {
    logger.error(error, `Error al actualizar conexión: ${id}`);
    throw error;
  }
}

/**
 * Elimina una conexión
 */
export async function deleteConnection(id: number): Promise<void> {
  try {
    const db = getDatabase();
    await db.delete(connectionConfig).where(eq(connectionConfig.id, id));
    logger.info(`Conexión eliminada: ID ${id}`);
  } catch (error) {
    logger.error(error, `Error al eliminar conexión: ${id}`);
    throw error;
  }
}

/**
 * Actualiza el estado de test de una conexión
 */
export async function updateTestStatus(
  id: number,
  result: TestResult
): Promise<void> {
  try {
    const db = getDatabase();

    await db
      .update(connectionConfig)
      .set({
        testStatus: result.success ? 'success' : 'failed',
        testMessage: result.message,
        testedAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      })
      .where(eq(connectionConfig.id, id));

    logger.info(`Test status actualizado para conexión ID ${id}: ${result.success ? 'success' : 'failed'}`);
  } catch (error) {
    logger.error(error, `Error al actualizar test status de conexión: ${id}`);
    throw error;
  }
}

/**
 * Activa una conexión (desactiva todas las demás)
 */
export async function setActiveConnection(id: number): Promise<void> {
  try {
    const db = getDatabase();

    // Primero desactivar todas
    await db.update(connectionConfig).set({ isActive: false });

    // Luego activar la seleccionada
    await db
      .update(connectionConfig)
      .set({
        isActive: true,
        updatedAt: new Date().toISOString(),
      })
      .where(eq(connectionConfig.id, id));

    logger.info(`Conexión activada: ID ${id}`);
  } catch (error) {
    logger.error(error, `Error al activar conexión: ${id}`);
    throw error;
  }
}

/**
 * Obtiene la configuración desencriptada de una conexión
 */
export async function getConnectionConfig(id: number): Promise<Record<string, unknown>> {
  try {
    const connection = await getConnectionById(id);

    if (!connection) {
      throw new Error(`Conexión no encontrada: ${id}`);
    }

    return decryptJSON(connection.configJson);
  } catch (error) {
    logger.error(error, `Error al obtener config desencriptada: ${id}`);
    throw error;
  }
}

/**
 * Obtiene la configuración desencriptada de la conexión activa
 */
export async function getActiveConnectionConfig(): Promise<{
  id: number;
  adapterType: string;
  name: string;
  config: Record<string, unknown>;
} | null> {
  try {
    const connection = await getActiveConnection();

    if (!connection) {
      return null;
    }

    const config = decryptJSON(connection.configJson) as Record<string, unknown>;

    return {
      id: connection.id,
      adapterType: connection.adapterType,
      name: connection.name,
      config,
    };
  } catch (error) {
    logger.error(error, 'Error al obtener config de conexión activa');
    throw error;
  }
}
