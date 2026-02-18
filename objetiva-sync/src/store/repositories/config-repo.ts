/**
 * Repositorio para la tabla `config`
 * Gestión de configuración general del sistema
 */

import { eq } from 'drizzle-orm';
import { getDatabase } from '../index.js';
import { config, type Config, type NewConfig } from '../schema.js';
import { logger } from '../../utils/logger.js';

/**
 * Obtiene un valor de configuración por clave
 */
export async function getConfig(key: string): Promise<Config | null> {
  try {
    const db = getDatabase();
    const result = await db.select().from(config).where(eq(config.key, key)).limit(1);
    return result[0] ?? null;
  } catch (error) {
    logger.error(error, `Error al obtener config con key: ${key}`);
    throw error;
  }
}

/**
 * Establece un valor de configuración (upsert)
 */
export async function setConfig(
  key: string,
  value: string,
  encrypted: boolean = false
): Promise<void> {
  try {
    const db = getDatabase();

    // Intentar actualizar primero
    const existing = await getConfig(key);

    if (existing) {
      // Actualizar
      await db
        .update(config)
        .set({
          value,
          encrypted: encrypted,
          updatedAt: new Date().toISOString(),
        })
        .where(eq(config.key, key));

      logger.info(`Config actualizada: ${key}`);
    } else {
      // Insertar
      const newConfig: NewConfig = {
        key,
        value,
        encrypted: encrypted,
      };

      await db.insert(config).values(newConfig);
      logger.info(`Config creada: ${key}`);
    }
  } catch (error) {
    logger.error(error, `Error al establecer config: ${key}`);
    throw error;
  }
}

/**
 * Obtiene toda la configuración del sistema
 */
export async function getAllConfig(): Promise<Config[]> {
  try {
    const db = getDatabase();
    const result = await db.select().from(config);
    return result;
  } catch (error) {
    logger.error(error, 'Error al obtener toda la configuración');
    throw error;
  }
}

/**
 * Elimina una clave de configuración
 */
export async function deleteConfig(key: string): Promise<void> {
  try {
    const db = getDatabase();
    await db.delete(config).where(eq(config.key, key));
    logger.info(`Config eliminada: ${key}`);
  } catch (error) {
    logger.error(error, `Error al eliminar config: ${key}`);
    throw error;
  }
}

/**
 * Verifica si existe una clave de configuración
 */
export async function hasConfig(key: string): Promise<boolean> {
  const result = await getConfig(key);
  return result !== null;
}
