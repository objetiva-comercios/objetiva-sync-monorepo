import pino from 'pino';
import { existsSync, mkdirSync } from 'fs';
import { dirname } from 'path';
import { requireEnv } from '../config/index.js';
import { getCorrelationId } from '../lib/correlation.js';

/**
 * Crea el logger según el entorno
 * - Desarrollo: Pretty print en consola
 * - Producción: JSON logs a archivo y consola
 */
function createLogger() {
  const env = requireEnv();
  const isDevelopment = env.NODE_ENV === 'development';
  const isTest = env.NODE_ENV === 'test';

  // Asegurar que el directorio de logs existe
  const logDir = dirname(env.LOG_FILE);
  if (!existsSync(logDir)) {
    mkdirSync(logDir, { recursive: true });
  }

  // Configuración base
  const baseConfig: pino.LoggerOptions = {
    level: isTest ? 'silent' : env.LOG_LEVEL,
    timestamp: pino.stdTimeFunctions.isoTime,
    // Add correlationId to every log entry when available
    mixin: () => {
      const correlationId = getCorrelationId();
      return correlationId ? { correlationId } : {};
    },
    formatters: {
      level: (label) => {
        return { level: label };
      },
    },
  };

  // En desarrollo: pretty print
  if (isDevelopment) {
    return pino({
      ...baseConfig,
      transport: {
        target: 'pino-pretty',
        options: {
          colorize: true,
          translateTime: 'SYS:standard',
          ignore: 'pid,hostname',
          singleLine: false,
        },
      },
    });
  }

  // En producción: JSON logs con múltiples destinos
  return pino(
    {
      ...baseConfig,
    },
    pino.multistream([
      // Consola
      { stream: process.stdout },
      // Archivo
      { stream: pino.destination({ dest: env.LOG_FILE, sync: false }) },
    ])
  );
}

/**
 * Instancia del logger (lazy initialization)
 */
let loggerInstance: pino.Logger | null = null;

/**
 * Obtiene la instancia del logger (la crea si no existe)
 */
function getLogger(): pino.Logger {
  if (!loggerInstance) {
    loggerInstance = createLogger();
  }
  return loggerInstance;
}

/**
 * Logger global exportado con lazy initialization
 * Usar un Proxy para que se comporte como el logger real
 */
export const logger = new Proxy({} as pino.Logger, {
  get(_target, prop) {
    const instance = getLogger();
    const value = instance[prop as keyof pino.Logger];

    // Si es una función, bindearla al logger instance
    if (typeof value === 'function') {
      return value.bind(instance);
    }

    return value;
  },
});

/**
 * Logger con contexto para módulos específicos
 */
export function createModuleLogger(module: string) {
  return logger.child({ module });
}

/**
 * Helper para logear inicio de operación
 */
export function logOperationStart(operation: string, details?: object) {
  logger.info({ operation, ...details }, `${operation} - Iniciando`);
  return {
    startTime: Date.now(),
    operation,
  };
}

/**
 * Helper para logear fin de operación con duración
 */
export function logOperationEnd(
  context: { startTime: number; operation: string },
  success: boolean,
  details?: object
) {
  const duration = Date.now() - context.startTime;
  const logFn = success ? logger.info : logger.error;

  logFn(
    {
      operation: context.operation,
      success,
      durationMs: duration,
      ...details,
    },
    `${context.operation} - ${success ? 'Completado' : 'Fallido'} (${duration}ms)`
  );
}

/**
 * Helper para logear errores con stack trace
 */
export function logError(error: unknown, context?: string) {
  if (error instanceof Error) {
    logger.error(
      {
        error: {
          message: error.message,
          stack: error.stack,
          name: error.name,
        },
        context,
      },
      `Error${context ? ` en ${context}` : ''}: ${error.message}`
    );
  } else {
    logger.error(
      {
        error,
        context,
      },
      `Error desconocido${context ? ` en ${context}` : ''}`
    );
  }
}

/**
 * Helper para logear sync events
 */
export const syncLogger = {
  start: (entityType: string, syncType: string) => {
    return logOperationStart(`sync:${entityType}`, { entityType, syncType });
  },

  end: (
    context: { startTime: number; operation: string },
    result: {
      success: boolean;
      recordsFetched?: number;
      recordsSent?: number;
      recordsFailed?: number;
      error?: string;
    }
  ) => {
    logOperationEnd(context, result.success, {
      recordsFetched: result.recordsFetched,
      recordsSent: result.recordsSent,
      recordsFailed: result.recordsFailed,
      error: result.error,
    });
  },

  progress: (entityType: string, message: string, details?: object) => {
    logger.info({ entityType, ...details }, `[${entityType}] ${message}`);
  },

  error: (entityType: string, error: unknown) => {
    logError(error, `sync:${entityType}`);
  },
};

/**
 * Helper para logear API requests
 */
export const apiLogger = {
  request: (method: string, url: string, details?: object) => {
    logger.debug({ method, url, ...details }, `API Request: ${method} ${url}`);
  },

  response: (
    method: string,
    url: string,
    statusCode: number,
    durationMs: number,
    details?: object
  ) => {
    const logFn = statusCode >= 400 ? logger.warn : logger.debug;
    logFn(
      {
        method,
        url,
        statusCode,
        durationMs,
        ...details,
      },
      `API Response: ${method} ${url} - ${statusCode} (${durationMs}ms)`
    );
  },

  error: (method: string, url: string, error: unknown) => {
    logError(error, `API ${method} ${url}`);
  },
};

/**
 * Helper para logear operaciones de base de datos
 */
export const dbLogger = {
  query: (operation: string, table: string, details?: object) => {
    logger.debug({ operation, table, ...details }, `DB ${operation}: ${table}`);
  },

  error: (operation: string, table: string, error: unknown) => {
    logError(error, `DB ${operation} on ${table}`);
  },
};

/**
 * Logger para desarrollo (solo en NODE_ENV=development)
 */
export function devLog(message: string, data?: object) {
  if (process.env.NODE_ENV === 'development') {
    logger.debug(data, `[DEV] ${message}`);
  }
}

export default logger;
