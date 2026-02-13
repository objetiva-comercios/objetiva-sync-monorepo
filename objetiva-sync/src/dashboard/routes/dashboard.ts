/**
 * Rutas del dashboard principal HTMX
 * Vista general del sistema (legacy - movido a /admin)
 */

import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { requireNoPasswordChange } from '../middleware/auth.js';

/**
 * Registra las rutas del dashboard HTMX (legacy)
 * Estas rutas estan en /admin para mantener compatibilidad
 * El nuevo React dashboard esta en /dashboard
 */
export async function registerDashboardRoutes(app: FastifyInstance) {
  /**
   * GET /admin - Dashboard principal HTMX (legacy)
   */
  app.get(
    '/admin',
    { preHandler: requireNoPasswordChange },
    async (_request: FastifyRequest, reply: FastifyReply) => {
      return reply.view('dashboard/index.ejs', {
        title: 'Dashboard (Legacy)',
      });
    }
  );
}
