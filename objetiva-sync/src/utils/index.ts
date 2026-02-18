/**
 * Módulo de utilidades
 * Exporta logger, crypto y helpers
 */

export * from './logger.js';
export * from './crypto.js';
export * from './helpers.js';

/**
 * Re-exportaciones específicas
 */

// Logger
export {
  logger,
  createModuleLogger,
  logOperationStart,
  logOperationEnd,
  logError,
  syncLogger,
  apiLogger,
  dbLogger,
  devLog,
} from './logger.js';

// Crypto
export {
  encrypt,
  decrypt,
  hashPassword,
  comparePassword,
  generateKey,
  encryptJSON,
  decryptJSON,
  encryptCredentials,
  decryptCredentials,
} from './crypto.js';

// Helpers
export {
  sleep,
  formatDate,
  parseDate,
  parseSQLPlaceholders,
  replaceLastSyncPlaceholder,
  sanitizeSQL,
  truncate,
  capitalize,
  titleCase,
  calculateNextRetry,
  chunk,
  waitUntil,
  retry,
  toQueryString,
  parseQueryString,
  deepClone,
  isPlainObject,
  deepMerge,
  formatCurrency,
  formatNumber,
  percentage,
  isISODate,
  dateDiffMs,
  formatDuration,
  now,
  daysAgo,
} from './helpers.js';
