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
import { registerHealthRoutes } from './health.js';
import { env } from '../../config/env.js';

/**
 * Registra todas las rutas de la aplicacion
 */
export async function registerRoutes(app: FastifyInstance): Promise<void> {
  // Health check endpoint (public, before auth middleware)
  await registerHealthRoutes(app, env?.GATEWAY_URL);

  // Rutas de autenticacion (publicas y privadas)
  await registerAuthRoutes(app);

  // Rutas del dashboard HTMX
  await registerDashboardRoutes(app);

  // Rutas de configuracion (requieren autenticacion)
  await registerConfigRoutes(app);

  // Rutas de sincronizacion (requieren autenticacion)
  await registerSyncRoutes(app);

  // Rutas de logs (requieren autenticacion)
  await registerLogsRoutes(app);

  // Rutas del scheduler (requieren autenticacion)
  await registerSchedulerRoutes(app);

  // API endpoints para queries
  await registerQueriesApiRoutes(app);

  // API endpoints para schema info (dinamico desde Zod)
  await registerSchemaInfoRoutes(app);

  // API endpoints para mappings - ELIMINADO EN FASE 3
  // await registerMappingsApiRoutes(app);

  // API endpoints para logs
  await registerLogsApiRoutes(app);

  // API endpoints para retry queue
  await registerRetryQueueApiRoutes(app);

  // API endpoints para connections
  await registerConnectionsApiRoutes(app);

  // API endpoints para configuracion
  await registerConfigApiRoutes(app);

  // API endpoints para dashboard
  await registerDashboardApiRoutes(app);

  // API endpoints para sincronizacion
  await registerSyncApiRoutes(app);

  // API endpoints para scheduler
  await registerSchedulerApiRoutes(app);

  // API endpoints para SSE log streaming
  await registerLogStreamRoutes(app);
}
