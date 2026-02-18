/**
 * Rutas de logs
 * Visualización de historial de sincronizaciones
 */

import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { requireNoPasswordChange } from '../middleware/auth.js';

/**
 * Registra las rutas de logs
 */
export async function registerLogsRoutes(app: FastifyInstance) {
  /**
   * GET /logs - Vista de logs de sincronización
   */
  app.get(
    '/logs',
    { preHandler: requireNoPasswordChange },
    async (_request: FastifyRequest, reply: FastifyReply) => {
      return reply.view('logs/index.ejs', {
        title: 'Logs de Sincronización',
      });
    }
  );
}
