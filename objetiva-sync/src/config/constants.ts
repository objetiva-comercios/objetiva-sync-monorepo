/**
 * Constantes del sistema Objetiva Sync
 */

/**
 * Configuración de sincronización
 */
export const SYNC_CONFIG = {
  // Tamaño de batch por defecto
  BATCH_SIZE_DEFAULT: 100,
  BATCH_SIZE_MIN: 1,
  BATCH_SIZE_MAX: 1000,

  // Delay entre batches para backpressure (ms)
  DELAY_BETWEEN_BATCHES_MS: 100, // 100ms backpressure delay between batches (was 500ms, reduced for throughput)

  // Intervalo de polling
  SYNC_INTERVAL_MIN_MINUTES: 0, // 0 = desactivado
  SYNC_INTERVAL_DEFAULT_MINUTES: 30,
  SYNC_INTERVAL_MAX_MINUTES: 1440, // 24 horas

  // Timeout para queries
  QUERY_TIMEOUT_MS: 120000, // 120 seconds (2 minutes) for large dataset queries
  QUERY_TIMEOUT_MAX_MS: 300000, // 5 minutos
} as const;

/**
 * Configuración de reintentos
 */
export const RETRY_CONFIG = {
  // Máximo de intentos antes de marcar como failed
  MAX_ATTEMPTS: 5,

  // Backoff exponencial en minutos
  BACKOFF_SCHEDULE: [1, 5, 15, 30, 60] as const,

  // Tiempo máximo entre reintentos
  MAX_RETRY_DELAY_MINUTES: 60,
} as const;

/**
 * Códigos de error
 */
export const ERROR_CODES = {
  // Configuración
  CONFIG_NOT_FOUND: 'CONFIG_NOT_FOUND',
  CONFIG_INVALID: 'CONFIG_INVALID',

  // Conexión
  CONNECTION_FAILED: 'CONNECTION_FAILED',
  CONNECTION_TIMEOUT: 'CONNECTION_TIMEOUT',
  CONNECTION_NOT_ACTIVE: 'CONNECTION_NOT_ACTIVE',

  // Queries
  QUERY_SYNTAX_ERROR: 'QUERY_SYNTAX_ERROR',
  QUERY_TIMEOUT: 'QUERY_TIMEOUT',
  QUERY_NOT_FOUND: 'QUERY_NOT_FOUND',

  // Mappings
  MAPPING_VALIDATION_ERROR: 'MAPPING_VALIDATION_ERROR',
  REQUIRED_FIELD_MISSING: 'REQUIRED_FIELD_MISSING',

  // Sincronización
  SYNC_IN_PROGRESS: 'SYNC_IN_PROGRESS',
  SYNC_FAILED: 'SYNC_FAILED',
  SYNC_PARTIAL: 'SYNC_PARTIAL',

  // API Remota
  API_AUTH_FAILED: 'API_AUTH_FAILED',
  API_NETWORK_ERROR: 'API_NETWORK_ERROR',
  API_TIMEOUT: 'API_TIMEOUT',
  API_RATE_LIMIT: 'API_RATE_LIMIT',
  API_VALIDATION_ERROR: 'API_VALIDATION_ERROR',

  // Base de datos
  DB_ERROR: 'DB_ERROR',
  DB_CONSTRAINT_VIOLATION: 'DB_CONSTRAINT_VIOLATION',

  // Autenticación
  AUTH_INVALID_CREDENTIALS: 'AUTH_INVALID_CREDENTIALS',
  AUTH_SESSION_EXPIRED: 'AUTH_SESSION_EXPIRED',
  AUTH_UNAUTHORIZED: 'AUTH_UNAUTHORIZED',

  // Genérico
  UNKNOWN_ERROR: 'UNKNOWN_ERROR',
  VALIDATION_ERROR: 'VALIDATION_ERROR',
} as const;

/**
 * Nombres de tablas de la base de datos
 */
export const TABLE_NAMES = {
  CONFIG: 'config',
  CONNECTION_CONFIG: 'connection_config',
  QUERIES: 'queries',
  // FIELD_MAPPINGS: 'field_mappings', // ELIMINADO EN FASE 3 - ya no se usa
  SYNC_STATE: 'sync_state',
  RETRY_QUEUE: 'retry_queue',
  SYNC_LOGS: 'sync_logs',
  NOTIFICATION_CONFIG: 'notification_config',
} as const;

/**
 * Claves de configuración en tabla config
 */
export const CONFIG_KEYS = {
  ADMIN_PASSWORD_HASH: 'admin_password_hash',
  REMOTE_API_URL: 'remote_api_url',
  REMOTE_API_CREDENTIALS: 'remote_api_credentials',
  ACTIVE_ADAPTER: 'active_adapter',
  SYNC_INTERVAL_MINUTES: 'sync_interval_minutes',
  BATCH_SIZE: 'batch_size',
} as const;

/**
 * Tipos de adaptadores soportados
 */
export const ADAPTER_TYPES = {
  SQL_SERVER: 'sqlserver',
  POSTGRESQL: 'postgres',
  MYSQL: 'mysql',
  EXCEL: 'excel',
} as const;

/**
 * Placeholder para queries SQL
 */
export const SQL_PLACEHOLDERS = {
  LAST_SYNC: ':lastSync',
} as const;

/**
 * Configuración de sesión
 */
export const SESSION_CONFIG = {
  // Nombre de la cookie
  COOKIE_NAME: 'objetiva-sync-session',

  // Tiempo de expiración (ms)
  MAX_AGE_MS: 24 * 60 * 60 * 1000, // 24 horas

  // Secreto (se carga de env)
  SECRET_MIN_LENGTH: 32,
} as const;

/**
 * Configuración de encriptación
 */
export const ENCRYPTION_CONFIG = {
  // Algoritmo
  ALGORITHM: 'aes-256-gcm',

  // Longitud de clave
  KEY_LENGTH: 32,

  // Longitud de IV
  IV_LENGTH: 16,

  // Longitud de auth tag
  AUTH_TAG_LENGTH: 16,
} as const;

/**
 * Configuración de bcrypt
 */
export const BCRYPT_CONFIG = {
  // Salt rounds (costo)
  SALT_ROUNDS: 12,
} as const;

/**
 * Configuración de API remota
 */
export const REMOTE_API_CONFIG = {
  // Timeout para requests (ms)
  REQUEST_TIMEOUT_MS: 30000, // 30 segundos

  // Tiempo de vida del token JWT (buffer de seguridad)
  TOKEN_EXPIRY_BUFFER_MS: 5 * 60 * 1000, // 5 minutos antes de expirar

  // Reintentos en caso de error
  MAX_RETRIES: 3,
  RETRY_DELAY_MS: 1000, // 1 segundo
} as const;

/**
 * Límites de datos
 */
export const DATA_LIMITS = {
  // Límites de strings
  MAX_STRING_LENGTH: 500,
  MAX_TEXT_LENGTH: 5000,

  // Límites de arrays
  MAX_BATCH_SIZE: 1000,
  MIN_BATCH_SIZE: 1,

  // Límites de números
  MAX_PRICE: 999999999.99,
  MAX_QUANTITY: 999999,
} as const;

/**
 * Configuración de logs
 */
export const LOG_CONFIG = {
  // Días de retención de logs en DB
  RETENTION_DAYS: 30,

  // Días de retención de retry queue completados
  RETRY_QUEUE_RETENTION_DAYS: 30,
} as const;

/**
 * Mensajes de usuario
 */
export const USER_MESSAGES = {
  AUTH: {
    LOGIN_SUCCESS: 'Inicio de sesión exitoso',
    LOGIN_FAILED: 'Credenciales inválidas',
    LOGOUT_SUCCESS: 'Sesión cerrada',
    PASSWORD_CHANGED: 'Contraseña actualizada',
    SESSION_EXPIRED: 'Sesión expirada. Por favor, inicia sesión nuevamente.',
  },
  SYNC: {
    STARTED: 'Sincronización iniciada',
    SUCCESS: 'Sincronización completada exitosamente',
    FAILED: 'Error en la sincronización',
    IN_PROGRESS: 'Ya hay una sincronización en progreso',
  },
  CONFIG: {
    SAVED: 'Configuración guardada',
    TEST_SUCCESS: 'Prueba exitosa',
    TEST_FAILED: 'Prueba fallida',
  },
} as const;

/**
 * Patrones regex comunes
 */
export const REGEX_PATTERNS = {
  // Fecha ISO 8601
  ISO_DATE: /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{3})?Z?$/,

  // Número de documento (CUIT argentino)
  CUIT: /^\d{2}-\d{8}-\d$/,

  // Código de comprobante
  COMPROBANTE_CODE: /^[A-Z]-\d{4}-\d{8}$/,
} as const;
