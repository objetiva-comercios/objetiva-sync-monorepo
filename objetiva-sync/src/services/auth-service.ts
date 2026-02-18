/**
 * Servicio de autenticación
 * Maneja validación de credenciales, cambio de password y usuario admin
 */

import { hashPassword, comparePassword } from '../utils/crypto.js';
import * as ConfigRepo from '../store/repositories/config-repo.js';
import { requireEnv } from '../config/env.js';
import { logger } from '../utils/logger.js';

/**
 * Claves de configuración para autenticación
 */
const CONFIG_KEYS = {
  ADMIN_USERNAME: 'admin_username',
  ADMIN_PASSWORD_HASH: 'admin_password_hash',
  FIRST_LOGIN_REQUIRED: 'first_login_required',
} as const;

/**
 * Interface de usuario
 */
export interface User {
  username: string;
  isAdmin: boolean;
  requirePasswordChange: boolean;
}

/**
 * Asegura que existe el usuario admin
 * Crea uno con password del .env si no existe
 */
export async function ensureAdminExists(): Promise<void> {
  try {
    const config = requireEnv();

    // Verificar si ya existe el usuario admin
    const existingUsername = await ConfigRepo.getConfig(CONFIG_KEYS.ADMIN_USERNAME);

    if (existingUsername) {
      logger.info('✅ Usuario admin ya existe');
      return;
    }

    // Crear usuario admin inicial
    logger.info('👤 Creando usuario admin inicial...');

    const username = 'admin';
    const adminPassword = config.ADMIN_PASSWORD;
    if (!adminPassword) {
      throw new Error('ADMIN_PASSWORD is required in environment variables');
    }
    const passwordHash = await hashPassword(adminPassword);

    await ConfigRepo.setConfig(CONFIG_KEYS.ADMIN_USERNAME, username, false);
    await ConfigRepo.setConfig(CONFIG_KEYS.ADMIN_PASSWORD_HASH, passwordHash, true);
    await ConfigRepo.setConfig(CONFIG_KEYS.FIRST_LOGIN_REQUIRED, 'true', false);

    logger.info({ username }, '✅ Usuario admin creado exitosamente');
  } catch (error) {
    logger.error({ error }, '❌ Error al crear usuario admin');
    throw error;
  }
}

/**
 * Valida credenciales de usuario
 */
export async function validateCredentials(
  username: string,
  password: string
): Promise<User | null> {
  try {
    // Obtener username y hash almacenados
    const storedUsername = await ConfigRepo.getConfig(CONFIG_KEYS.ADMIN_USERNAME);
    const storedPasswordHash = await ConfigRepo.getConfig(CONFIG_KEYS.ADMIN_PASSWORD_HASH);

    if (!storedUsername || !storedPasswordHash) {
      logger.warn('⚠️  No hay usuario admin configurado');
      return null;
    }

    // Verificar username
    if (username !== storedUsername.value) {
      logger.warn({ username }, '⚠️  Usuario no encontrado');
      return null;
    }

    // Verificar password
    const isValid = await comparePassword(password, storedPasswordHash.value);

    if (!isValid) {
      logger.warn({ username }, '⚠️  Password incorrecto');
      return null;
    }

    // Verificar si requiere cambio de password
    const firstLoginRequired = await ConfigRepo.getConfig(CONFIG_KEYS.FIRST_LOGIN_REQUIRED);
    const requirePasswordChange = firstLoginRequired?.value === 'true';

    logger.info({ username }, '✅ Credenciales válidas');

    return {
      username: storedUsername.value,
      isAdmin: true,
      requirePasswordChange,
    };
  } catch (error) {
    logger.error({ error, username }, '❌ Error al validar credenciales');
    return null;
  }
}

/**
 * Cambia el password del usuario admin
 */
export async function changePassword(newPassword: string): Promise<boolean> {
  try {
    // Validar que el password no esté vacío
    if (!newPassword || newPassword.length < 6) {
      logger.warn('⚠️  Password muy corto (mínimo 6 caracteres)');
      return false;
    }

    // Hashear nuevo password
    const newPasswordHash = await hashPassword(newPassword);

    // Actualizar en base de datos
    await ConfigRepo.setConfig(CONFIG_KEYS.ADMIN_PASSWORD_HASH, newPasswordHash, true);

    // Marcar que ya no requiere cambio de password
    await ConfigRepo.setConfig(CONFIG_KEYS.FIRST_LOGIN_REQUIRED, 'false', false);

    logger.info('✅ Password cambiado exitosamente');
    return true;
  } catch (error) {
    logger.error({ error }, '❌ Error al cambiar password');
    return false;
  }
}

/**
 * Verifica si el usuario requiere cambio de password
 */
export async function requiresPasswordChange(): Promise<boolean> {
  try {
    const firstLoginRequired = await ConfigRepo.getConfig(CONFIG_KEYS.FIRST_LOGIN_REQUIRED);
    return firstLoginRequired?.value === 'true';
  } catch (error) {
    logger.error({ error }, '❌ Error al verificar requisito de cambio de password');
    return false;
  }
}

/**
 * Obtiene el usuario actual desde la sesión
 */
export function getUserFromSession(session: any): User | null {
  return session.get('user') || null;
}

/**
 * Guarda el usuario en la sesión
 */
export function setUserInSession(session: any, user: User): void {
  session.set('user', user);
}

/**
 * Elimina el usuario de la sesión (logout)
 */
export function clearUserFromSession(session: any): void {
  session.destroy();
}
