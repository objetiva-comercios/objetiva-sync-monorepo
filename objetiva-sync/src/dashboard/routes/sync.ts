/**
 * Rutas de sincronización
 * Control de sincronizaciones y cola de reintentos
 */

import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { requireNoPasswordChange } from '../middleware/auth.js';

/**
 * Registra las rutas de sincronización
 */
export async function registerSyncRoutes(app: FastifyInstance) {
  /**
   * GET /sync - Vista de sincronizaciones
   */
  app.get(
    '/sync',
    { preHandler: requireNoPasswordChange },
    async (_request: FastifyRequest, reply: FastifyReply) => {
      return reply.view('sync/index.ejs', {
        title: 'Sincronización',
      });
    }
  );

  /**
   * GET /sync/retry-queue - Cola de reintentos
   */
  app.get(
    '/sync/retry-queue',
    { preHandler: requireNoPasswordChange },
    async (_request: FastifyRequest, reply: FastifyReply) => {
      return reply.view('sync/retry-queue.ejs', {
        title: 'Cola de Reintentos',
      });
    }
  );
}
