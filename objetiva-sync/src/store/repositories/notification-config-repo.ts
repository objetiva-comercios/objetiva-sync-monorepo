/**
 * Repositorio para la tabla `notification_config`
 * Gestión de canales de notificación
 */

import { eq, and } from 'drizzle-orm';
import { getDatabase } from '../index.js';
import {
  notificationConfig,
  type NotificationConfig,
  type NewNotificationConfig,
} from '../schema.js';
import { logger } from '../../utils/logger.js';
import { encryptJSON, decryptJSON } from '../../utils/crypto.js';
import type { TestResult } from '../../types/common.js';

/**
 * Tipos de canales de notificación
 */
export type ChannelType = 'slack' | 'telegram' | 'pushover' | 'webhook';

/**
 * Obtiene una configuración de notificación por ID
 */
export async function getNotification(id: number): Promise<NotificationConfig | null> {
  try {
    const db = getDatabase();
    const result = await db
      .select()
      .from(notificationConfig)
      .where(eq(notificationConfig.id, id))
      .limit(1);
    return result[0] ?? null;
  } catch (error) {
    logger.error(error, `Error al obtener notificación con ID: ${id}`);
    throw error;
  }
}

/**
 * Obtiene todas las configuraciones de notificación habilitadas
 */
export async function getEnabledNotifications(): Promise<NotificationConfig[]> {
  try {
    const db = getDatabase();
    const result = await db
      .select()
      .from(notificationConfig)
      .where(eq(notificationConfig.isEnabled, true));
    return result;
  } catch (error) {
    logger.error(error, 'Error al obtener notificaciones habilitadas');
    throw error;
  }
}

/**
 * Obtiene todas las notificaciones
 */
export async function getAllNotifications(): Promise<NotificationConfig[]> {
  try {
    const db = getDatabase();
    return await db.select().from(notificationConfig);
  } catch (error) {
    logger.error(error, 'Error al obtener todas las notificaciones');
    throw error;
  }
}

/**
 * Obtiene notificaciones por tipo de canal
 */
export async function getNotificationsByChannel(
  channelType: ChannelType
): Promise<NotificationConfig[]> {
  try {
    const db = getDatabase();
    return await db
      .select()
      .from(notificationConfig)
      .where(eq(notificationConfig.channelType, channelType));
  } catch (error) {
    logger.error(error, `Error al obtener notificaciones de canal: ${channelType}`);
    throw error;
  }
}

/**
 * Obtiene notificaciones habilitadas que deben notificar en caso de éxito
 */
export async function getNotificationsForSuccess(): Promise<NotificationConfig[]> {
  try {
    const db = getDatabase();
    return await db
      .select()
      .from(notificationConfig)
      .where(
        and(
          eq(notificationConfig.isEnabled, true),
          eq(notificationConfig.notifyOnSuccess, true)
        )
      );
  } catch (error) {
    logger.error(error, 'Error al obtener notificaciones para success');
    throw error;
  }
}

/**
 * Obtiene notificaciones habilitadas que deben notificar en caso de error
 */
export async function getNotificationsForError(): Promise<NotificationConfig[]> {
  try {
    const db = getDatabase();
    return await db
      .select()
      .from(notificationConfig)
      .where(
        and(
          eq(notificationConfig.isEnabled, true),
          eq(notificationConfig.notifyOnError, true)
        )
      );
  } catch (error) {
    logger.error(error, 'Error al obtener notificaciones para error');
    throw error;
  }
}

/**
 * Obtiene notificaciones habilitadas que deben notificar en caso de warning
 */
export async function getNotificationsForWarning(): Promise<NotificationConfig[]> {
  try {
    const db = getDatabase();
    return await db
      .select()
      .from(notificationConfig)
      .where(
        and(
          eq(notificationConfig.isEnabled, true),
          eq(notificationConfig.notifyOnWarning, true)
        )
      );
  } catch (error) {
    logger.error(error, 'Error al obtener notificaciones para warning');
    throw error;
  }
}

/**
 * Crea una nueva configuración de notificación
 * El config se encripta antes de guardar
 */
export async function createNotification(data: {
  channelType: ChannelType;
  name: string;
  config: Record<string, unknown>;
  isEnabled?: boolean;
  notifyOnSuccess?: boolean;
  notifyOnError?: boolean;
  notifyOnWarning?: boolean;
}): Promise<number> {
  try {
    const db = getDatabase();

    // Encriptar la configuración
    const encryptedConfig = encryptJSON(data.config);

    const newNotification: NewNotificationConfig = {
      channelType: data.channelType,
      name: data.name,
      configJson: encryptedConfig,
      isEnabled: data.isEnabled ?? true,
      notifyOnSuccess: data.notifyOnSuccess ?? false,
      notifyOnError: data.notifyOnError ?? true,
      notifyOnWarning: data.notifyOnWarning ?? true,
    };

    const result = await db.insert(notificationConfig).values(newNotification).returning();
    const insertedId = result[0]?.id;

    if (!insertedId) {
      throw new Error('No se pudo obtener el ID de la notificación creada');
    }

    logger.info(`Notificación creada: ${data.name} (ID: ${insertedId})`);
    return insertedId;
  } catch (error) {
    logger.error(error, `Error al crear notificación: ${data.name}`);
    throw error;
  }
}

/**
 * Actualiza una configuración de notificación
 */
export async function updateNotification(
  id: number,
  data: {
    name?: string;
    config?: Record<string, unknown>;
    isEnabled?: boolean;
    notifyOnSuccess?: boolean;
    notifyOnError?: boolean;
    notifyOnWarning?: boolean;
  }
): Promise<void> {
  try {
    const db = getDatabase();

    const updateData: Partial<NewNotificationConfig> & { updatedAt: string } = {
      updatedAt: new Date().toISOString(),
    };

    if (data.name !== undefined) updateData.name = data.name;
    if (data.config !== undefined) updateData.configJson = encryptJSON(data.config);
    if (data.isEnabled !== undefined) updateData.isEnabled = data.isEnabled;
    if (data.notifyOnSuccess !== undefined) updateData.notifyOnSuccess = data.notifyOnSuccess;
    if (data.notifyOnError !== undefined) updateData.notifyOnError = data.notifyOnError;
    if (data.notifyOnWarning !== undefined) updateData.notifyOnWarning = data.notifyOnWarning;

    await db.update(notificationConfig).set(updateData).where(eq(notificationConfig.id, id));

    logger.info(`Notificación actualizada: ID ${id}`);
  } catch (error) {
    logger.error(error, `Error al actualizar notificación: ${id}`);
    throw error;
  }
}

/**
 * Elimina una configuración de notificación
 */
export async function deleteNotification(id: number): Promise<void> {
  try {
    const db = getDatabase();
    await db.delete(notificationConfig).where(eq(notificationConfig.id, id));
    logger.info(`Notificación eliminada: ID ${id}`);
  } catch (error) {
    logger.error(error, `Error al eliminar notificación: ${id}`);
    throw error;
  }
}

/**
 * Actualiza el estado de test de una notificación
 */
export async function updateTestStatus(id: number, result: TestResult): Promise<void> {
  try {
    const db = getDatabase();

    await db
      .update(notificationConfig)
      .set({
        testStatus: result.success ? 'success' : 'failed',
        testedAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      })
      .where(eq(notificationConfig.id, id));

    logger.info(
      `Test status actualizado para notificación ID ${id}: ${result.success ? 'success' : 'failed'}`
    );
  } catch (error) {
    logger.error(error, `Error al actualizar test status de notificación: ${id}`);
    throw error;
  }
}

/**
 * Habilita/deshabilita una notificación
 */
export async function toggleNotificationEnabled(id: number, isEnabled: boolean): Promise<void> {
  try {
    const db = getDatabase();

    await db
      .update(notificationConfig)
      .set({
        isEnabled,
        updatedAt: new Date().toISOString(),
      })
      .where(eq(notificationConfig.id, id));

    logger.info(`Notificación ${isEnabled ? 'habilitada' : 'deshabilitada'}: ID ${id}`);
  } catch (error) {
    logger.error(error, `Error al cambiar estado de notificación: ${id}`);
    throw error;
  }
}

/**
 * Obtiene la configuración desencriptada de una notificación
 */
export async function getNotificationConfig(id: number): Promise<Record<string, unknown>> {
  try {
    const notification = await getNotification(id);

    if (!notification) {
      throw new Error(`Notificación no encontrada: ${id}`);
    }

    return decryptJSON(notification.configJson);
  } catch (error) {
    logger.error(error, `Error al obtener config desencriptada: ${id}`);
    throw error;
  }
}
