/**
 * API endpoints para gestión de conexiones al ERP
 * Incluye CRUD, test de conexión y activación
 */

import type { FastifyInstance } from 'fastify';
import { requireNoPasswordChange } from '../../middleware/auth.js';
import {
  getActiveConnection,
  getAllConnections,
  getConnectionById,
  getConnectionConfig,
  createConnection,
  updateConnection,
  deleteConnection,
  setActiveConnection,
  updateTestStatus,
} from '../../../store/repositories/connection-config-repo.js';
import { testDatabaseConnection } from '../../../adapters/database-adapter.js';
import { logger } from '../../../utils/logger.js';

/**
 * Registra las rutas de API de conexiones
 */
export async function registerConnectionsApiRoutes(app: FastifyInstance) {
  /**
   * GET /api/connections/active - Obtener conexión activa (HTML fragment)
   */
  app.get(
    '/api/connections/active',
    { preHandler: requireNoPasswordChange },
    async (_request, reply) => {
      try {
        const connection = await getActiveConnection();

        if (!connection) {
          return reply.type('text/html').send(`
            <div class="bg-yellow-50 border-l-4 border-yellow-400 p-4">
              <div class="flex">
                <div class="flex-shrink-0">
                  <i data-lucide="alert-triangle" class="h-5 w-5 text-yellow-400"></i>
                </div>
                <div class="ml-3">
                  <h3 class="text-sm font-medium text-yellow-800">
                    No hay conexión activa
                  </h3>
                  <div class="mt-2 text-sm text-yellow-700">
                    <p>Configure y active una conexión para comenzar a sincronizar datos.</p>
                  </div>
                </div>
              </div>
            </div>
          `);
        }

        const html = `
          <div class="bg-green-50 border-l-4 border-green-400 p-4">
            <div class="flex items-center justify-between">
              <div class="flex items-center">
                <div class="flex-shrink-0">
                  <i data-lucide="check-circle" class="h-5 w-5 text-green-400"></i>
                </div>
                <div class="ml-3">
                  <h3 class="text-sm font-medium text-green-800">
                    Conexión Activa: ${escapeHtml(connection.name)}
                  </h3>
                  <div class="mt-1 text-sm text-green-700">
                    <p>Tipo: <span class="font-medium capitalize">${escapeHtml(connection.adapterType)}</span></p>
                    ${
                      connection.testStatus
                        ? `<p>Estado: <span class="font-medium">${connection.testStatus === 'success' ? 'Probada exitosamente' : 'Prueba fallida'}</span></p>`
                        : ''
                    }
                  </div>
                </div>
              </div>
              <div>
                <button
                  onclick="testConnection(${connection.id})"
                  class="inline-flex items-center px-3 py-2 border border-transparent text-sm leading-4 font-medium rounded-md text-green-700 bg-green-100 hover:bg-green-200 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-green-500"
                >
                  <i data-lucide="activity" class="mr-2 h-4 w-4"></i>
                  Probar Conexión
                </button>
              </div>
            </div>
          </div>
        `;

        return reply.type('text/html').send(html);
      } catch (error) {
        logger.error({ error }, 'Error al obtener conexión activa');
        return reply.status(500).type('text/html').send(`
          <div class="bg-red-50 border-l-4 border-red-400 p-4">
            <div class="flex">
              <div class="flex-shrink-0">
                <i data-lucide="x-circle" class="h-5 w-5 text-red-400"></i>
              </div>
              <div class="ml-3">
                <h3 class="text-sm font-medium text-red-800">Error al cargar conexión activa</h3>
              </div>
            </div>
          </div>
        `);
      }
    }
  );

  /**
   * GET /api/connections/list - Lista de conexiones (HTML fragment)
   */
  app.get(
    '/api/connections/list',
    { preHandler: requireNoPasswordChange },
    async (_request, reply) => {
      try {
        const connections = await getAllConnections();

        if (connections.length === 0) {
          return reply.type('text/html').send(`
            <div class="text-center py-12">
              <i data-lucide="database" class="h-12 w-12 mx-auto text-gray-300 mb-3"></i>
              <p class="text-sm text-gray-500">No hay conexiones configuradas</p>
              <p class="text-xs text-gray-400 mt-1">Cree una nueva conexión para comenzar</p>
            </div>
          `);
        }

        const html = `
          <div class="overflow-x-auto">
            <table class="table table-zebra w-full">
              <thead>
                <tr>
                  <th>NOMBRE</th>
                  <th>TIPO</th>
                  <th>ESTADO DE PRUEBA</th>
                  <th>ESTADO</th>
                  <th>ACCIONES</th>
                </tr>
              </thead>
              <tbody>
                ${connections
                  .map(
                    (conn) => `
                  <tr class="${conn.isActive ? 'bg-success/10' : ''}">
                    <td class="font-medium">
                      ${escapeHtml(conn.name)}
                      ${
                        conn.isActive
                          ? '<span class="badge badge-success badge-sm ml-2">Activa</span>'
                          : ''
                      }
                    </td>
                    <td class="capitalize">
                      ${escapeHtml(conn.adapterType)}
                    </td>
                    <td>
                      ${getTestStatusBadge(conn.testStatus, conn.testMessage)}
                    </td>
                    <td>
                      ${conn.testedAt ? new Date(conn.testedAt).toLocaleString('es-AR') : 'No probada'}
                    </td>
                    <td class="space-x-2">
                      <button
                        onclick="testConnection(${conn.id})"
                        class="btn btn-ghost btn-xs btn-circle"
                        title="Probar conexión"
                      >
                        <i data-lucide="activity" class="h-4 w-4"></i>
                      </button>
                      <button
                        onclick="editConnection(${conn.id})"
                        class="btn btn-ghost btn-xs btn-circle"
                        title="Editar"
                      >
                        <i data-lucide="edit" class="h-4 w-4"></i>
                      </button>
                      ${
                        !conn.isActive
                          ? `
                        <button
                          onclick="setActiveConnection(${conn.id})"
                          class="btn btn-ghost btn-xs btn-circle"
                          title="Activar"
                        >
                          <i data-lucide="check" class="h-4 w-4"></i>
                        </button>
                      `
                          : ''
                      }
                      <button
                        onclick="deleteConnection(${conn.id})"
                        class="btn btn-ghost btn-xs btn-circle ${conn.isActive ? 'btn-disabled' : ''}"
                        title="Eliminar"
                        ${conn.isActive ? 'disabled' : ''}
                      >
                        <i data-lucide="trash-2" class="h-4 w-4"></i>
                      </button>
                    </td>
                  </tr>
                `
                  )
                  .join('')}
              </tbody>
            </table>
          </div>
        `;

        return reply.type('text/html').send(html);
      } catch (error) {
        logger.error({ error }, 'Error al listar conexiones');
        return reply.status(500).type('text/html').send(`
          <div class="text-center py-12 text-red-600">
            <i data-lucide="alert-circle" class="h-12 w-12 mx-auto mb-3"></i>
            <p class="text-sm">Error al cargar conexiones</p>
          </div>
        `);
      }
    }
  );

  /**
   * GET /api/connections/:id - Obtener detalles de una conexión (JSON)
   */
  app.get<{
    Params: { id: string };
  }>(
    '/api/connections/:id',
    { preHandler: requireNoPasswordChange },
    async (request, reply) => {
      try {
        const id = parseInt(request.params.id, 10);

        if (isNaN(id)) {
          return reply.status(400).send({
            success: false,
            error: 'ID de conexión inválido',
          });
        }

        const connection = await getConnectionById(id);

        if (!connection) {
          return reply.status(404).send({
            success: false,
            error: 'Conexión no encontrada',
          });
        }

        // Get decrypted config
        const config = await getConnectionConfig(id);

        // Remove password from response for security
        const sanitizedConfig = { ...config };
        if ('password' in sanitizedConfig) {
          delete sanitizedConfig.password;
        }

        return reply.send({
          success: true,
          data: {
            id: connection.id,
            name: connection.name,
            adapterType: connection.adapterType,
            isActive: connection.isActive,
            testStatus: connection.testStatus,
            testMessage: connection.testMessage,
            config: sanitizedConfig,
          },
        });
      } catch (error) {
        logger.error({ error }, 'Error al obtener conexión');
        return reply.status(500).send({
          success: false,
          error: 'Error al obtener conexión',
        });
      }
    }
  );

  /**
   * POST /api/connections - Crear nueva conexión
   */
  app.post(
    '/api/connections',
    { preHandler: requireNoPasswordChange },
    async (request, reply) => {
      try {
        const body = request.body as {
          name: string;
          adapterType: string;
          config: Record<string, unknown>;
        };

        if (!body.name || !body.adapterType || !body.config) {
          return reply.status(400).send({
            success: false,
            error: 'Faltan campos requeridos',
          });
        }

        const id = await createConnection({
          name: body.name,
          adapterType: body.adapterType,
          config: body.config,
        });

        return reply.send({
          success: true,
          message: 'Conexión creada exitosamente',
          id,
        });
      } catch (error) {
        logger.error({ error }, 'Error al crear conexión');
        return reply.status(500).send({
          success: false,
          error: 'Error al crear conexión',
        });
      }
    }
  );

  /**
   * PUT /api/connections/:id - Actualizar conexión
   */
  app.put<{
    Params: { id: string };
  }>(
    '/api/connections/:id',
    { preHandler: requireNoPasswordChange },
    async (request, reply) => {
      try {
        const id = parseInt(request.params.id, 10);

        if (isNaN(id)) {
          return reply.status(400).send({
            success: false,
            error: 'ID de conexión inválido',
          });
        }

        const body = request.body as {
          name?: string;
          config?: Record<string, unknown>;
        };

        await updateConnection(id, {
          name: body.name,
          config: body.config,
        });

        return reply.send({
          success: true,
          message: 'Conexión actualizada exitosamente',
        });
      } catch (error) {
        logger.error({ error }, 'Error al actualizar conexión');
        return reply.status(500).send({
          success: false,
          error: 'Error al actualizar conexión',
        });
      }
    }
  );

  /**
   * DELETE /api/connections/:id - Eliminar conexión
   */
  app.delete<{
    Params: { id: string };
  }>(
    '/api/connections/:id',
    { preHandler: requireNoPasswordChange },
    async (request, reply) => {
      try {
        const id = parseInt(request.params.id, 10);

        if (isNaN(id)) {
          return reply.status(400).send({
            success: false,
            error: 'ID de conexión inválido',
          });
        }

        const connection = await getConnectionById(id);

        if (!connection) {
          return reply.status(404).send({
            success: false,
            error: 'Conexión no encontrada',
          });
        }

        if (connection.isActive) {
          return reply.status(400).send({
            success: false,
            error: 'No se puede eliminar la conexión activa',
          });
        }

        await deleteConnection(id);

        return reply.send({
          success: true,
          message: 'Conexión eliminada exitosamente',
        });
      } catch (error) {
        logger.error({ error }, 'Error al eliminar conexión');
        return reply.status(500).send({
          success: false,
          error: 'Error al eliminar conexión',
        });
      }
    }
  );

  /**
   * POST /api/connections/test-config - Probar configuración de conexión
   */
  app.post(
    '/api/connections/test-config',
    { preHandler: requireNoPasswordChange },
    async (request, reply) => {
      try {
        const body = request.body as {
          adapterType: string;
          config: Record<string, unknown>;
          connectionId?: number;
        };

        if (!body.adapterType || !body.config) {
          return reply.status(400).send({
            success: false,
            error: 'Faltan campos requeridos',
          });
        }

        logger.info(`Probando configuración de tipo: ${body.adapterType}, connectionId: ${body.connectionId}`);

        // If connectionId provided and password is empty, use stored password
        // This handles the case where user edits a connection but doesn't re-enter password
        let configToTest = { ...body.config };
        const hasPassword = configToTest.password && String(configToTest.password).length > 0;
        logger.info(`Config has password: ${hasPassword}, connectionId: ${body.connectionId}`);

        if (body.connectionId && !hasPassword) {
          try {
            const storedConfig = await getConnectionConfig(body.connectionId);
            logger.info(`Stored config keys: ${Object.keys(storedConfig || {}).join(', ')}`);
            if (storedConfig?.password) {
              configToTest.password = storedConfig.password;
              logger.info('Using stored password for connection test');
            } else {
              logger.warn('No password found in stored config');
            }
          } catch (err) {
            logger.warn({ err }, 'Could not retrieve stored config for password fallback');
          }
        }

        // Test the connection
        const testResult = await testDatabaseConnection(body.adapterType, configToTest);

        // Si se proporciona connectionId, actualizar el estado de prueba en la base de datos
        if (body.connectionId) {
          await updateTestStatus(body.connectionId, testResult);
        }

        if (testResult.success) {
          return reply.send({
            success: true,
            message: testResult.message || 'Conexión exitosa',
          });
        } else {
          return reply.status(400).send({
            success: false,
            error: testResult.message || 'Error en la conexión',
          });
        }
      } catch (error) {
        logger.error({ error }, 'Error al probar configuración de conexión');
        return reply.status(500).send({
          success: false,
          error: 'Error al probar conexión',
        });
      }
    }
  );

  /**
   * POST /api/connections/:id/test - Probar conexión
   */
  app.post<{
    Params: { id: string };
  }>(
    '/api/connections/:id/test',
    { preHandler: requireNoPasswordChange },
    async (request, reply) => {
      try {
        const id = parseInt(request.params.id, 10);

        if (isNaN(id)) {
          return reply.status(400).send({
            success: false,
            error: 'ID de conexión inválido',
          });
        }

        const connection = await getConnectionById(id);

        if (!connection) {
          return reply.status(404).send({
            success: false,
            error: 'Conexión no encontrada',
          });
        }

        const config = await getConnectionConfig(id);
        logger.info(`[Test by ID] Config keys: ${Object.keys(config).join(', ')}, has password: ${!!config.password}`);

        // Test the connection
        const testResult = await testDatabaseConnection(connection.adapterType, config);

        // Update test status
        await updateTestStatus(id, testResult);

        if (testResult.success) {
          return reply.send({
            success: true,
            message: testResult.message || 'Conexión exitosa',
          });
        } else {
          return reply.status(400).send({
            success: false,
            error: testResult.message || 'Error en la conexión',
          });
        }
      } catch (error) {
        logger.error({ error }, 'Error al probar conexión');
        return reply.status(500).send({
          success: false,
          error: 'Error al probar conexión',
        });
      }
    }
  );

  /**
   * POST /api/connections/:id/activate - Activar conexión
   */
  app.post<{
    Params: { id: string };
  }>(
    '/api/connections/:id/activate',
    { preHandler: requireNoPasswordChange },
    async (request, reply) => {
      try {
        const id = parseInt(request.params.id, 10);

        if (isNaN(id)) {
          return reply.status(400).send({
            success: false,
            error: 'ID de conexión inválido',
          });
        }

        const connection = await getConnectionById(id);

        if (!connection) {
          return reply.status(404).send({
            success: false,
            error: 'Conexión no encontrada',
          });
        }

        await setActiveConnection(id);

        return reply.send({
          success: true,
          message: 'Conexión activada exitosamente',
        });
      } catch (error) {
        logger.error({ error }, 'Error al activar conexión');
        return reply.status(500).send({
          success: false,
          error: 'Error al activar conexión',
        });
      }
    }
  );
}

/**
 * Helper para escapar HTML y prevenir XSS
 */
function escapeHtml(unsafe: string): string {
  return unsafe
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

/**
 * Helper para generar badge de estado de prueba
 */
function getTestStatusBadge(status: string | null, message: string | null): string {
  if (!status) {
    return '<span class="badge badge-ghost">No probada</span>';
  }

  if (status === 'success') {
    return '<span class="badge badge-success">Exitosa</span>';
  }

  return `<span class="badge badge-error" title="${message ? escapeHtml(message) : 'Error'}">Fallida</span>`;
}
