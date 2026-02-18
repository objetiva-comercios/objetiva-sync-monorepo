/**
 * Rutas de configuración
 * Gestión de conexiones, consultas y mapeos
 */

import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { requireNoPasswordChange } from '../middleware/auth.js';

/**
 * Registra las rutas de configuración
 */
export async function registerConfigRoutes(app: FastifyInstance) {
  /**
   * GET /config - Índice de configuración
   */
  app.get(
    '/config',
    { preHandler: requireNoPasswordChange },
    async (_request: FastifyRequest, reply: FastifyReply) => {
      // Redirigir a la sección de conexión por defecto
      return reply.redirect('/config/connection');
    }
  );

  /**
   * GET /config/connection - Configuración de conexión ERP
   */
  app.get(
    '/config/connection',
    { preHandler: requireNoPasswordChange },
    async (_request: FastifyRequest, reply: FastifyReply) => {
      return reply.view('config/connection.ejs', {
        title: 'Configuración de Conexión',
      });
    }
  );

  /**
   * GET /config/queries - Gestión de consultas SQL
   */
  app.get(
    '/config/queries',
    { preHandler: requireNoPasswordChange },
    async (_request: FastifyRequest, reply: FastifyReply) => {
      return reply.view('config/queries.ejs', {
        title: 'Gestión de Consultas',
      });
    }
  );

  /**
   * GET /config/api - Configuración de API remota
   */
  app.get(
    '/config/api',
    { preHandler: requireNoPasswordChange },
    async (_request: FastifyRequest, reply: FastifyReply) => {
      return reply.view('config/api.ejs', {
        title: 'Configuración de API',
      });
    }
  );

  /**
   * GET /config/mappings - ELIMINADO EN FASE 5
   * La vista mappings.ejs fue eliminada - ya no se usa field_mappings
   */
  // app.get(
  //   '/config/mappings',
  //   { preHandler: requireNoPasswordChange },
  //   async (_request: FastifyRequest, reply: FastifyReply) => {
  //     return reply.view('config/mappings.ejs', {
  //       title: 'Mapeo de Campos',
  //     });
  //   }
  // );
}
