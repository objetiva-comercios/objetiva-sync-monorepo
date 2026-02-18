/**
 * Rutas del scheduler
 * Gestión y configuración del scheduler automático
 */

import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { requireNoPasswordChange } from '../middleware/auth.js';

/**
 * Registra las rutas del scheduler
 */
export async function registerSchedulerRoutes(app: FastifyInstance) {
  /**
   * GET /scheduler - Vista del scheduler automático
   */
  app.get(
    '/scheduler',
    { preHandler: requireNoPasswordChange },
    async (_request: FastifyRequest, reply: FastifyReply) => {
      return reply.view('scheduler/scheduler.ejs', {
        title: 'Scheduler Automático',
      });
    }
  );
}
