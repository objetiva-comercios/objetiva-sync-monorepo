/**
 * Registro de todas las rutas del dashboard
 */

import type { FastifyInstance } from 'fastify';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';
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

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/**
 * Path to React dashboard build output
 */
const REACT_DASHBOARD_PATH = path.join(__dirname, '../../../dist/dashboard-react');

/**
 * Register React dashboard routes
 * Serves static assets and SPA fallback
 */
async function registerReactDashboardRoutes(app: FastifyInstance): Promise<void> {
  // Check if React dashboard build exists
  const dashboardExists = fs.existsSync(REACT_DASHBOARD_PATH);

  if (!dashboardExists) {
    app.log.warn('React dashboard not built. Run "npm run build:dashboard" to enable /dashboard');

    // Fallback route when dashboard not built
    app.get('/dashboard', async (_request, reply) => {
      return reply.status(503).send({
        error: 'Dashboard not built',
        message: 'Run "npm run build:dashboard" to build the React dashboard',
      });
    });
    return;
  }

  // Serve static assets from React dashboard build at /dashboard-assets/
  // This avoids conflict with SPA routes
  await app.register(import('@fastify/static'), {
    root: path.join(REACT_DASHBOARD_PATH, 'assets'),
    prefix: '/dashboard/assets/',
    decorateReply: false,
  });

  // Read and cache index.html with injected config
  const indexHtmlPath = path.join(REACT_DASHBOARD_PATH, 'index.html');
  const getIndexHtml = () => {
    const html = fs.readFileSync(indexHtmlPath, 'utf-8');
    // Inject app config as global variable
    const configScript = `<script>window.__APP_CONFIG__ = ${JSON.stringify({
      appName: env?.APP_NAME || 'Objetiva Sync',
      version: '1.0.0',
    })};</script>`;
    return html.replace('</head>', `${configScript}</head>`);
  };

  // SPA routes - serve index.html for all /dashboard paths
  app.get('/dashboard', async (_request, reply) => {
    return reply.type('text/html').send(getIndexHtml());
  });

  app.get('/dashboard/*', async (_request, reply) => {
    // Check if requesting an actual file (has extension)
    const url = (_request as any).url as string;
    if (url.includes('.')) {
      // Try to serve the file directly
      const filePath = path.join(REACT_DASHBOARD_PATH, url.replace('/dashboard', ''));
      if (fs.existsSync(filePath)) {
        return reply.sendFile(url.replace('/dashboard/', ''), REACT_DASHBOARD_PATH);
      }
    }
    // SPA fallback - serve index.html with config
    return reply.type('text/html').send(getIndexHtml());
  });

  app.log.info('React dashboard registered at /dashboard');
}

/**
 * Registra todas las rutas de la aplicacion
 */
export async function registerRoutes(app: FastifyInstance): Promise<void> {
  // Health check endpoint (public, before auth middleware)
  await registerHealthRoutes(app, env?.GATEWAY_URL);

  // Rutas de autenticacion (publicas y privadas)
  await registerAuthRoutes(app);

  // React dashboard routes (antes de las rutas HTMX del dashboard)
  await registerReactDashboardRoutes(app);

  // Rutas del dashboard HTMX (ahora en /admin)
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
