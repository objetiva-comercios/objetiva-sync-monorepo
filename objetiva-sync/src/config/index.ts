/**
 * Módulo de configuración
 * Exporta configuración de entorno y constantes del sistema
 */

export * from './env.js';
export * from './constants.js';

/**
 * Re-exportaciones específicas
 */
export type { Env } from './env.js';

export {
  loadEnv,
  requireEnv,
  env,
} from './env.js';

export {
  SYNC_CONFIG,
  RETRY_CONFIG,
  ERROR_CODES,
  TABLE_NAMES,
  CONFIG_KEYS,
  ADAPTER_TYPES,
  SQL_PLACEHOLDERS,
  SESSION_CONFIG,
  ENCRYPTION_CONFIG,
  BCRYPT_CONFIG,
  REMOTE_API_CONFIG,
  DATA_LIMITS,
  LOG_CONFIG,
  USER_MESSAGES,
  REGEX_PATTERNS,
} from './constants.js';
