/**
 * Rutas del dashboard principal HTMX
 * Vista general del sistema
 */

import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { requireNoPasswordChange } from '../middleware/auth.js';

/**
 * Registra las rutas del dashboard HTMX
 */
export async function registerDashboardRoutes(app: FastifyInstance) {
  /**
   * GET /dashboard - Dashboard principal HTMX
   */
  app.get(
    '/dashboard',
    { preHandler: requireNoPasswordChange },
    async (_request: FastifyRequest, reply: FastifyReply) => {
      return reply.view('dashboard/index.ejs', {
        title: 'Dashboard',
      });
    }
  );
}
