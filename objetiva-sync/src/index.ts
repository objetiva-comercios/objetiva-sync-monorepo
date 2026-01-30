/**
 * Servidor principal de Objetiva Sync
 * Fastify + HTMX + EJS
 */

// IMPORTANTE: Cargar configuración del entorno PRIMERO, antes de cualquier otro import
// Esto es necesario porque los módulos como logger requieren acceso a la configuración
import { loadEnv, requireEnv } from './config/env.js';
loadEnv(); // Ejecutar inmediatamente

import Fastify from 'fastify';
import fastifyCookie from '@fastify/cookie';
import fastifyFormbody from '@fastify/formbody';
import fastifySession from '@fastify/session';
import fastifyStatic from '@fastify/static';
import fastifyView from '@fastify/view';
import ejs from 'ejs';
import path from 'path';
import { fileURLToPath } from 'url';
import { initDatabase } from './store/index.js';
import { logger } from './utils/logger.js';
import { registerRoutes } from './dashboard/routes/index.js';
import { ensureAdminExists } from './services/auth-service.js';
import { deleteOldLogs } from './store/repositories/sync-logs-repo.js';
import { LOG_CONFIG } from './config/constants.js';
import { initScheduler, stopScheduler } from './sync/scheduler-instance.js';
import { initializeSchemaCache } from './services/schema-cache.js';

// ESM __dirname equivalent
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * Crea y configura la aplicación Fastify
 */
export async function createApp() {
  const config = requireEnv();

  // Crear instancia de Fastify
  const app = Fastify({
    logger: config.NODE_ENV === 'development'
      ? {
          level: config.LOG_LEVEL,
          transport: {
            target: 'pino-pretty',
            options: {
              colorize: true,
              translateTime: 'SYS:standard',
              ignore: 'pid,hostname',
            },
          },
        }
      : false,
    trustProxy: true,
  });

  try {
    // 1. Registrar plugin de cookies
    await app.register(fastifyCookie);

    // 2. Registrar plugin para parsear formularios HTML
    await app.register(fastifyFormbody);

    // 3. Registrar plugin de sesiones
    const sessionSecret = config.SESSION_SECRET;
    if (!sessionSecret) {
      throw new Error('SESSION_SECRET is required');
    }

    await app.register(fastifySession, {
      secret: sessionSecret,
      cookie: {
        secure: config.NODE_ENV === 'production',
        httpOnly: true,
        maxAge: 24 * 60 * 60 * 1000, // 24 horas
        path: '/',
      },
      saveUninitialized: false,
      rolling: true, // Renovar sesión en cada request
    });

    // 4. Registrar archivos estáticos
    await app.register(fastifyStatic, {
      root: path.join(__dirname, 'dashboard', 'static'),
      prefix: '/static/',
    });

    // 5. Registrar view engine (EJS)
    await app.register(fastifyView, {
      engine: {
        ejs,
      },
      root: path.join(__dirname, 'dashboard', 'views'),
      layout: 'layouts/main.ejs',
      options: {
        filename: path.join(__dirname, 'dashboard', 'views'),
      },
      includeViewExtension: true,
      viewExt: 'ejs',
    });

    // 6. Decorar request con user helper
    app.decorateRequest('user', null);

    // 7. Hook para agregar helpers a las vistas
    app.addHook('onRequest', async (request, reply) => {
      reply.locals = {
        appName: config.APP_NAME,
        user: request.session.get('user') || null,
        flashMessages: request.session.get('flash') || [],
        currentPath: request.url,
      };

      // Limpiar flash messages después de leerlos
      request.session.set('flash', []);
    });

    // 8. Registrar todas las rutas
    await registerRoutes(app);

    // 9. Error handler global
    app.setErrorHandler((error: Error & { statusCode?: number }, request, reply) => {
      logger.error({ error, url: request.url, method: request.method }, 'Error no manejado');

      if (reply.sent) {
        return;
      }

      const statusCode = error.statusCode || 500;
      const message =
        config.NODE_ENV === 'production'
          ? 'Error interno del servidor'
          : error.message;

      // Si es una request AJAX/HTMX, retornar JSON
      if (request.headers['hx-request']) {
        reply.status(statusCode).send({
          success: false,
          error: message,
        });
        return;
      }

      // Si es una request normal, renderizar página de error
      reply.status(statusCode).view('error.ejs', {
        statusCode,
        message,
        stack: config.NODE_ENV === 'development' ? error.stack : null,
      });
    });

    // 10. 404 handler
    app.setNotFoundHandler((request, reply) => {
      logger.warn({ url: request.url }, 'Ruta no encontrada');

      if (request.headers['hx-request']) {
        reply.status(404).send({
          success: false,
          error: 'Ruta no encontrada',
        });
        return;
      }

      reply.status(404).view('404.ejs', {
        url: request.url,
      });
    });

    return app;
  } catch (error) {
    logger.error({ error }, 'Error al crear aplicación Fastify');
    throw error;
  }
}

/**
 * Inicia el servidor
 */
async function start() {
  try {
    logger.info('🚀 Iniciando Objetiva Sync...');

    // 1. Inicializar base de datos
    logger.info('📦 Inicializando base de datos...');
    await initDatabase();

    // 2. Asegurar que existe el usuario admin
    logger.info('👤 Verificando usuario admin...');
    await ensureAdminExists();

    // 3. Limpiar logs antiguos y programar limpieza diaria
    logger.info('🧹 Ejecutando limpieza de logs antiguos...');
    const deletedCount = await deleteOldLogs(LOG_CONFIG.RETENTION_DAYS);
    logger.info(`✅ Limpieza completada: ${deletedCount} logs eliminados (retención: ${LOG_CONFIG.RETENTION_DAYS} días)`);

    // Programar limpieza diaria (cada 24 horas)
    setInterval(async () => {
      try {
        logger.info('🧹 Ejecutando limpieza diaria de logs...');
        const count = await deleteOldLogs(LOG_CONFIG.RETENTION_DAYS);
        logger.info(`✅ Limpieza diaria completada: ${count} logs eliminados`);
      } catch (error) {
        logger.error({ error }, '❌ Error en limpieza diaria de logs');
      }
    }, 24 * 60 * 60 * 1000); // 24 horas en ms

    // 3.5. Inicializar schema cache (para query validation)
    logger.info('📋 Inicializando schema cache desde gateway...');
    await initializeSchemaCache();

    // 4. Inicializar scheduler automático
    logger.info('⏰ Inicializando scheduler automático...');
    await initScheduler();

    // 5. Crear aplicación Fastify
    logger.info('⚙️  Configurando servidor Fastify...');
    const app = await createApp();

    // 6. Obtener configuración
    const config = requireEnv();

    // 7. Iniciar servidor
    await app.listen({
      port: config.PORT,
      host: '0.0.0.0', // Escuchar en todas las interfaces
    });

    logger.info(`✅ Servidor iniciado en http://localhost:${config.PORT}`);
    logger.info(`📊 Dashboard disponible en http://localhost:${config.PORT}/dashboard`);
    logger.info('🔐 Usuario por defecto: admin / (ver .env para password)');
  } catch (error) {
    logger.error({ error }, '❌ Error fatal al iniciar servidor');
    process.exit(1);
  }
}

/**
 * Manejo de señales para graceful shutdown
 */
function setupGracefulShutdown(app: Awaited<ReturnType<typeof createApp>>) {
  const signals = ['SIGINT', 'SIGTERM'] as const;

  for (const signal of signals) {
    process.on(signal, async () => {
      logger.info(`📴 Señal ${signal} recibida, cerrando servidor...`);

      try {
        // Detener scheduler primero
        stopScheduler();

        // Luego cerrar servidor
        await app.close();
        logger.info('✅ Servidor cerrado correctamente');
        process.exit(0);
      } catch (error) {
        logger.error({ error }, '❌ Error al cerrar servidor');
        process.exit(1);
      }
    });
  }

  process.on('unhandledRejection', (reason, promise) => {
    logger.error({ reason, promise }, '❌ Unhandled Promise Rejection');
  });

  process.on('uncaughtException', (error) => {
    logger.error({ error }, '❌ Uncaught Exception');
    process.exit(1);
  });
}

// Iniciar servidor cuando este módulo se ejecuta directamente
// En desarrollo con tsx o en producción con node
const isMainModule = process.argv[1]?.includes('index.ts') ||
                     process.argv[1]?.includes('index.js') ||
                     import.meta.url.endsWith('index.ts') ||
                     import.meta.url.endsWith('index.js');

if (isMainModule) {
  start()
    .then(async () => {
      const app = await createApp();
      setupGracefulShutdown(app);
    })
    .catch((error) => {
      logger.error({ error }, '❌ Error fatal');
      process.exit(1);
    });
}

// Exportar para testing
export { start };
