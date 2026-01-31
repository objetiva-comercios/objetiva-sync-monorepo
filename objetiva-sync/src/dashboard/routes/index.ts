/**
 * Registro de todas las rutas del dashboard
 */

import type { FastifyInstance } from 'fastify';
import { registerAuthRoutes } from './auth.js';
import { registerDashboardRoutes } from './dashboard.js';
import { registerConfigRoutes } from './config.js';
import { registerSyncRoutes } from './sync.js';
import { registerLogsRoutes } from './logs.js';
import { registerSchedulerRoutes } from './scheduler.js';
import { registerQueriesApiRoutes } from './api/queries.js';
// import { registerMappingsApiRoutes } from './api/mappings.js'; // ELIMINADO EN FASE 3
import { registerSchemaInfoRoutes } from './api/schema-info.js';
import { registerLogsApiRoutes } from './api/logs.js';
import { registerRetryQueueApiRoutes } from './api/retry-queue.js';
import { registerConnectionsApiRoutes } from './api/connections.js';
import { registerConfigApiRoutes } from './api/config.js';
import { registerDashboardApiRoutes } from './api/dashboard.js';
import { registerSyncApiRoutes } from './api/sync.js';
import { registerSchedulerApiRoutes } from './api/scheduler.js';
import { registerLogStreamRoutes } from './api/log-stream.js';

/**
 * Registra todas las rutas de la aplicación
 */
export async function registerRoutes(app: FastifyInstance): Promise<void> {
  // Health check endpoint (público)
  app.get('/health', async (_request, reply) => {
    return reply.send({
      status: 'ok',
      timestamp: new Date().toISOString()
    });
  });

  // Rutas de autenticación (públicas y privadas)
  await registerAuthRoutes(app);

  // Rutas del dashboard (requieren autenticación)
  await registerDashboardRoutes(app);

  // Rutas de configuración (requieren autenticación)
  await registerConfigRoutes(app);

  // Rutas de sincronización (requieren autenticación)
  await registerSyncRoutes(app);

  // Rutas de logs (requieren autenticación)
  await registerLogsRoutes(app);

  // Rutas del scheduler (requieren autenticación)
  await registerSchedulerRoutes(app);

  // API endpoints para queries
  await registerQueriesApiRoutes(app);

  // API endpoints para schema info (dinámico desde Zod)
  await registerSchemaInfoRoutes(app);

  // API endpoints para mappings - ELIMINADO EN FASE 3
  // await registerMappingsApiRoutes(app);

  // API endpoints para logs
  await registerLogsApiRoutes(app);

  // API endpoints para retry queue
  await registerRetryQueueApiRoutes(app);

  // API endpoints para connections
  await registerConnectionsApiRoutes(app);

  // API endpoints para configuración
  await registerConfigApiRoutes(app);

  // API endpoints para dashboard
  await registerDashboardApiRoutes(app);

  // API endpoints para sincronización
  await registerSyncApiRoutes(app);

  // API endpoints para scheduler
n  // API endpoints para SSE log streaming
  await registerLogStreamRoutes(app);
  await registerSchedulerApiRoutes(app);
}
