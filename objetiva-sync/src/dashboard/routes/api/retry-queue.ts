/**
 * API endpoints para gestión de cola de reintentos
 * Incluye estadísticas, listado, reintentos y eliminación
 */

import type { FastifyInstance } from 'fastify';
import { requireNoPasswordChange } from '../../middleware/auth.js';
import {
  getRetryQueueItem,
  getAllRetryItems,
  getRetryItemsByStatus,
  incrementAttempt,
  deleteRetryItem,
} from '../../../store/repositories/retry-queue-repo.js';
import { logger } from '../../../utils/logger.js';
import { RetryStatus } from '../../../types/common.js';
import type { RetryStatus as RetryStatusType } from '../../../types/common.js';

/**
 * Registra las rutas de API de retry queue
 */
export async function registerRetryQueueApiRoutes(app: FastifyInstance) {
  /**
   * GET /api/retry-queue/stats - Estadísticas de cola por estado
   */
  app.get(
    '/api/retry-queue/stats',
    { preHandler: requireNoPasswordChange },
    async (_request, reply) => {
      try {
        const allItems = await getAllRetryItems();

        const stats = {
          total: allItems.length,
          pending: allItems.filter((item) => item.status === 'pending').length,
          success: allItems.filter((item) => item.status === 'success').length,
          failed: allItems.filter((item) => item.status === 'failed').length,
        };

        return reply.send({
          success: true,
          data: stats,
        });
      } catch (error) {
        logger.error({ error }, 'Error al obtener estadísticas de retry queue');
        return reply.status(500).send({
          success: false,
          error: 'Error al obtener estadísticas',
        });
      }
    }
  );

  /**
   * GET /api/retry-queue/list - Lista de elementos con filtros (HTML fragment)
   */
  app.get(
    '/api/retry-queue/list',
    { preHandler: requireNoPasswordChange },
    async (request, reply) => {
      try {
        const query = request.query as {
          entityType?: string;
          status?: string;
        };

        // Get all items or filtered by status
        let items = query.status
          ? await getRetryItemsByStatus(query.status as RetryStatusType)
          : await getAllRetryItems();

        // Filter by entity type if provided
        if (query.entityType) {
          items = items.filter((item) => item.entityType === query.entityType);
        }

        // Sort by createdAt descending (most recent first)
        items.sort((a, b) => {
          const dateA = a.createdAt ? new Date(a.createdAt).getTime() : 0;
          const dateB = b.createdAt ? new Date(b.createdAt).getTime() : 0;
          return dateB - dateA;
        });

        if (items.length === 0) {
          return reply.type('text/html').send(`
            <div class="text-center py-12">
              <i data-lucide="inbox" class="h-12 w-12 mx-auto text-gray-300 mb-3"></i>
              <p class="text-sm text-gray-500">No hay elementos en la cola</p>
              <p class="text-xs text-gray-400 mt-1">Los elementos fallidos aparecerán aquí</p>
            </div>
          `);
        }

        const html = `
          <div class="overflow-x-auto">
            <table class="min-w-full divide-y divide-gray-200">
              <thead class="bg-gray-50">
                <tr>
                  <th scope="col" class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Fecha
                  </th>
                  <th scope="col" class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Entidad
                  </th>
                  <th scope="col" class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Estado
                  </th>
                  <th scope="col" class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Intentos
                  </th>
                  <th scope="col" class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Próximo Intento
                  </th>
                  <th scope="col" class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Error
                  </th>
                  <th scope="col" class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Acciones
                  </th>
                </tr>
              </thead>
              <tbody class="bg-white divide-y divide-gray-200">
                ${items
                  .map(
                    (item) => `
                  <tr class="hover:bg-gray-50">
                    <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                      ${item.createdAt ? new Date(item.createdAt).toLocaleString('es-AR') : '-'}
                    </td>
                    <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                      <span class="capitalize">${escapeHtml(item.entityType)}</span>
                    </td>
                    <td class="px-6 py-4 whitespace-nowrap">
                      ${getStatusBadge(item.status || 'unknown')}
                    </td>
                    <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                      ${item.attemptCount ?? 0}
                    </td>
                    <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                      ${item.nextRetryAt ? new Date(item.nextRetryAt).toLocaleString('es-AR') : '-'}
                    </td>
                    <td class="px-6 py-4 text-sm text-gray-500 max-w-xs truncate">
                      ${item.lastError !== null ? escapeHtml(item.lastError) : '-'}
                    </td>
                    <td class="px-6 py-4 whitespace-nowrap text-sm font-medium space-x-2">
                      ${
                        item.status === RetryStatus.PENDING
                          ? `
                        <button
                          onclick="retryItem(${item.id})"
                          class="text-blue-600 hover:text-blue-900"
                          title="Reintentar ahora"
                        >
                          <i data-lucide="repeat" class="h-4 w-4"></i>
                        </button>
                      `
                          : ''
                      }
                      <button
                        onclick="deleteItem(${item.id})"
                        class="text-red-600 hover:text-red-900"
                        title="Eliminar"
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
        logger.error({ error }, 'Error al listar retry queue');
        return reply.status(500).type('text/html').send(`
          <div class="text-center py-12 text-red-600">
            <i data-lucide="alert-circle" class="h-12 w-12 mx-auto mb-3"></i>
            <p class="text-sm">Error al cargar cola de reintentos</p>
          </div>
        `);
      }
    }
  );

  /**
   * POST /api/retry-queue/:id/retry - Reintentar un elemento específico
   */
  app.post<{
    Params: { id: string };
  }>(
    '/api/retry-queue/:id/retry',
    { preHandler: requireNoPasswordChange },
    async (request, reply) => {
      try {
        const id = parseInt(request.params.id, 10);

        if (isNaN(id)) {
          return reply.status(400).send({
            success: false,
            error: 'ID de elemento inválido',
          });
        }

        const item = await getRetryQueueItem(id);

        if (!item) {
          return reply.status(404).send({
            success: false,
            error: 'Elemento no encontrado',
          });
        }

        if (item.status !== RetryStatus.PENDING) {
          return reply.status(400).send({
            success: false,
            error: 'Solo se pueden reintentar elementos pendientes',
          });
        }

        // Note: The actual retry logic should be handled by the sync service
        // Here we just mark it as ready for immediate retry
        await incrementAttempt(id);

        return reply.send({
          success: true,
          message: 'Elemento marcado para reintento',
        });
      } catch (error) {
        logger.error({ error }, 'Error al reintentar elemento');
        return reply.status(500).send({
          success: false,
          error: 'Error al reintentar elemento',
        });
      }
    }
  );

  /**
   * POST /api/retry-queue/retry-all - Reintentar todos los elementos pendientes
   */
  app.post(
    '/api/retry-queue/retry-all',
    { preHandler: requireNoPasswordChange },
    async (_request, reply) => {
      try {
        const pendingItems = await getRetryItemsByStatus(RetryStatus.PENDING);

        if (pendingItems.length === 0) {
          return reply.send({
            success: true,
            message: 'No hay elementos pendientes para reintentar',
            count: 0,
          });
        }

        // Mark all pending items for immediate retry
        for (const item of pendingItems) {
          await incrementAttempt(item.id!);
        }

        return reply.send({
          success: true,
          message: `${pendingItems.length} elementos marcados para reintento`,
          count: pendingItems.length,
        });
      } catch (error) {
        logger.error({ error }, 'Error al reintentar todos los elementos');
        return reply.status(500).send({
          success: false,
          error: 'Error al reintentar elementos',
        });
      }
    }
  );

  /**
   * DELETE /api/retry-queue/:id - Eliminar un elemento de la cola
   */
  app.delete<{
    Params: { id: string };
  }>(
    '/api/retry-queue/:id',
    { preHandler: requireNoPasswordChange },
    async (request, reply) => {
      try {
        const id = parseInt(request.params.id, 10);

        if (isNaN(id)) {
          return reply.status(400).send({
            success: false,
            error: 'ID de elemento inválido',
          });
        }

        const item = await getRetryQueueItem(id);

        if (!item) {
          return reply.status(404).send({
            success: false,
            error: 'Elemento no encontrado',
          });
        }

        await deleteRetryItem(id);

        return reply.send({
          success: true,
          message: 'Elemento eliminado correctamente',
        });
      } catch (error) {
        logger.error({ error }, 'Error al eliminar elemento');
        return reply.status(500).send({
          success: false,
          error: 'Error al eliminar elemento',
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
 * Helper para generar badge de estado
 */
function getStatusBadge(status: string): string {
  const badges = {
    pending:
      '<span class="px-2 inline-flex text-xs leading-5 font-semibold rounded-full bg-yellow-100 text-yellow-800">Pendiente</span>',
    success:
      '<span class="px-2 inline-flex text-xs leading-5 font-semibold rounded-full bg-green-100 text-green-800">Resuelto</span>',
    failed:
      '<span class="px-2 inline-flex text-xs leading-5 font-semibold rounded-full bg-red-100 text-red-800">Fallido</span>',
  };

  return (
    badges[status as keyof typeof badges] ||
    '<span class="px-2 inline-flex text-xs leading-5 font-semibold rounded-full bg-gray-100 text-gray-800">Desconocido</span>'
  );
}
