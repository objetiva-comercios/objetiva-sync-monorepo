/**
 * API endpoints para gestión de logs de sincronización
 * Logs con filtros, paginación y estadísticas
 */

import type { FastifyInstance} from 'fastify';
import { requireNoPasswordChange } from '../../middleware/auth.js';
import {
  getLogs,
  getRecentStats,
  getLogById,
  getLogDetails,
  deleteAllLogs,
} from '../../../store/repositories/sync-logs-repo.js';
import { readBatch, countBatches, getBatchesMetadata } from '../../../utils/batch-storage.js';
import { logger } from '../../../utils/logger.js';
import type { EntityType, SyncType, LogStatus } from '../../../types/common.js';

/**
 * Registra las rutas de API de logs
 */
export async function registerLogsApiRoutes(app: FastifyInstance) {
  /**
   * GET /api/logs/stats - Estadísticas de logs (últimas 24h)
   */
  app.get(
    '/api/logs/stats',
    { preHandler: requireNoPasswordChange },
    async (_request, reply) => {
      try {
        const stats = await getRecentStats();

        return reply.send({
          success: true,
          data: stats,
        });
      } catch (error) {
        logger.error({ error }, 'Error al obtener estadísticas de logs');
        return reply.status(500).send({
          success: false,
          error: 'Error al obtener estadísticas',
        });
      }
    }
  );

  /**
   * GET /api/logs/list - Lista de logs con filtros (HTML fragment)
   */
  app.get(
    '/api/logs/list',
    { preHandler: requireNoPasswordChange },
    async (request, reply) => {
      try {
        const query = request.query as {
          entityType?: string;
          syncType?: string;
          status?: string;
          dateFrom?: string;
          dateTo?: string;
          page?: string;
        };

        const page = parseInt(query.page || '1', 10);
        const limit = 20;
        const offset = (page - 1) * limit;

        // Build filters
        const filters: {
          entityType?: EntityType;
          syncType?: SyncType;
          status?: LogStatus;
          dateFrom?: string;
          dateTo?: string;
        } = {};

        if (query.entityType) filters.entityType = query.entityType as EntityType;
        if (query.syncType) filters.syncType = query.syncType as SyncType;
        if (query.status) filters.status = query.status as LogStatus;
        if (query.dateFrom) filters.dateFrom = new Date(query.dateFrom).toISOString();
        if (query.dateTo) filters.dateTo = new Date(query.dateTo).toISOString();

        const result = await getLogs(filters, { limit, offset });

        if (result.logs.length === 0) {
          return reply.type('text/html').send(`
            <div class="text-center py-12">
              <i data-lucide="inbox" class="h-12 w-12 mx-auto text-gray-300 mb-3"></i>
              <p class="text-sm text-gray-500">No se encontraron logs</p>
              <p class="text-xs text-gray-400 mt-1">Prueba ajustando los filtros</p>
            </div>
          `);
        }

        const totalPages = Math.ceil(result.total / limit);

        const html = `
          <div class="overflow-x-auto">
            <table id="logs-table" class="min-w-full divide-y divide-gray-200">
              <thead class="bg-gray-50">
                <tr>
                  <th scope="col" class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Fecha
                  </th>
                  <th scope="col" class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Entidad
                  </th>
                  <th scope="col" class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Query
                  </th>
                  <th scope="col" class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Tipo
                  </th>
                  <th scope="col" class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Estado
                  </th>
                  <th scope="col" class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Registros
                  </th>
                  <th scope="col" class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Duración
                  </th>
                  <th scope="col" class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Acciones
                  </th>
                </tr>
              </thead>
              <tbody class="bg-white divide-y divide-gray-200">
                ${result.logs
                  .map(
                    (log) => `
                  <tr class="hover:bg-gray-50">
                    <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                      ${log.createdAt ? new Date(log.createdAt).toLocaleString('es-AR') : '-'}
                    </td>
                    <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                      <span class="capitalize">${escapeHtml(log.entityType)}</span>
                    </td>
                    <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-700">
                      ${log.queryName ? escapeHtml(log.queryName) : '<span class="text-gray-400">-</span>'}
                    </td>
                    <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                      <span class="capitalize">${escapeHtml(log.syncType)}</span>
                    </td>
                    <td class="px-6 py-4 whitespace-nowrap">
                      ${getStatusBadge(log.status)}
                    </td>
                    <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                      <div class="text-xs">
                        <div>Obtenidos: ${log.recordsFetched ?? 0}</div>
                        <div>Enviados: ${log.recordsSent ?? 0}</div>
                        ${
                          log.recordsFailed && log.recordsFailed > 0
                            ? `<div class="text-red-600">Fallidos: ${log.recordsFailed}</div>`
                            : ''
                        }
                      </div>
                    </td>
                    <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                      ${log.durationMs ? formatDuration(log.durationMs) : '-'}
                    </td>
                    <td class="px-6 py-4 whitespace-nowrap text-sm font-medium">
                      <button
                        onclick="viewLogDetails(${log.id})"
                        class="text-blue-600 hover:text-blue-900"
                        title="Ver detalles"
                      >
                        <i data-lucide="eye" class="h-4 w-4"></i>
                      </button>
                    </td>
                  </tr>
                `
                  )
                  .join('')}
              </tbody>
            </table>
          </div>

          <!-- Pagination -->
          ${
            totalPages > 1
              ? `
            <div class="bg-white px-4 py-3 flex items-center justify-between border-t border-gray-200 sm:px-6 mt-4">
              <div class="flex-1 flex justify-between sm:hidden">
                <button
                  ${page === 1 ? 'disabled' : ''}
                  onclick="goToPage(${page - 1})"
                  class="relative inline-flex items-center px-4 py-2 border border-gray-300 text-sm font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50 ${
                    page === 1 ? 'opacity-50 cursor-not-allowed' : ''
                  }"
                >
                  Anterior
                </button>
                <button
                  ${page === totalPages ? 'disabled' : ''}
                  onclick="goToPage(${page + 1})"
                  class="ml-3 relative inline-flex items-center px-4 py-2 border border-gray-300 text-sm font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50 ${
                    page === totalPages ? 'opacity-50 cursor-not-allowed' : ''
                  }"
                >
                  Siguiente
                </button>
              </div>
              <div class="hidden sm:flex-1 sm:flex sm:items-center sm:justify-between">
                <div>
                  <p class="text-sm text-gray-700">
                    Mostrando <span class="font-medium">${offset + 1}</span> a <span class="font-medium">${Math.min(offset + limit, result.total)}</span> de <span class="font-medium">${result.total}</span> resultados
                  </p>
                </div>
                <div>
                  <nav class="relative z-0 inline-flex rounded-md shadow-sm -space-x-px" aria-label="Pagination">
                    ${Array.from({ length: Math.min(totalPages, 5) }, (_, i) => {
                      const pageNum = i + 1;
                      return `
                        <button
                          onclick="goToPage(${pageNum})"
                          class="relative inline-flex items-center px-4 py-2 border border-gray-300 bg-white text-sm font-medium text-gray-700 hover:bg-gray-50 ${
                            pageNum === page
                              ? 'z-10 bg-blue-50 border-blue-500 text-blue-600'
                              : ''
                          }"
                        >
                          ${pageNum}
                        </button>
                      `;
                    }).join('')}
                  </nav>
                </div>
              </div>
            </div>
          `
              : ''
          }

          <script>
            function goToPage(page) {
              const form = document.getElementById('filters-form');
              const formData = new FormData(form);
              const params = new URLSearchParams();

              for (const [key, value] of formData.entries()) {
                if (value) {
                  params.append(key, value);
                }
              }

              params.append('page', page.toString());

              htmx.ajax('GET', '/api/logs/list?' + params.toString(), {
                target: '#logs-container',
                swap: 'innerHTML'
              });
            }

            window.goToPage = goToPage;
          </script>
        `;

        return reply.type('text/html').send(html);
      } catch (error) {
        logger.error({ error }, 'Error al listar logs');
        return reply.status(500).type('text/html').send(`
          <div class="text-center py-12 text-red-600">
            <i data-lucide="alert-circle" class="h-12 w-12 mx-auto mb-3"></i>
            <p class="text-sm">Error al cargar logs</p>
          </div>
        `);
      }
    }
  );

  /**
   * GET /api/logs/:id - Obtener detalles de un log (JSON)
   */
  app.get<{
    Params: { id: string };
  }>(
    '/api/logs/:id',
    { preHandler: requireNoPasswordChange },
    async (request, reply) => {
      try {
        const id = parseInt(request.params.id, 10);

        if (isNaN(id)) {
          return reply.status(400).send({
            success: false,
            error: 'ID de log inválido',
          });
        }

        const log = await getLogById(id);

        if (!log) {
          return reply.status(404).send({
            success: false,
            error: 'Log no encontrado',
          });
        }

        return reply.send({
          success: true,
          data: log,
        });
      } catch (error) {
        logger.error({ error }, 'Error al obtener log');
        return reply.status(500).send({
          success: false,
          error: 'Error al obtener log',
        });
      }
    }
  );

  /**
   * GET /api/logs/:id/details - Obtener detalles formateados en HTML (modal)
   */
  app.get<{
    Params: { id: string };
    Querystring: { batch?: string };
  }>(
    '/api/logs/:id/details',
    { preHandler: requireNoPasswordChange },
    async (request, reply) => {
      try {
        const id = parseInt(request.params.id, 10);
        const requestedBatch = parseInt(request.query.batch || '1', 10);

        if (isNaN(id)) {
          return reply.status(400).type('text/html').send('<p>ID de log inválido</p>');
        }

        const log = await getLogById(id);

        if (!log) {
          return reply.status(404).type('text/html').send('<p>Log no encontrado</p>');
        }

        // Parsear detalles y contar lotes
        const details = log.details ? JSON.parse(log.details) : null;
        const totalBatches = await countBatches(id);
        const currentBatch = Math.max(1, Math.min(requestedBatch, totalBatches || 1));

        // Leer el lote actual
        let batchData = null;
        if (totalBatches > 0) {
          batchData = await readBatch(id, currentBatch);
        }

        const html = `
          <div class="fixed inset-0 z-50 overflow-y-auto" id="log-details-modal">
            <div class="flex items-center justify-center min-h-screen px-4">
              <div class="fixed inset-0 bg-gray-500 bg-opacity-75 transition-opacity" onclick="closeLogDetails()"></div>

              <div class="relative bg-white rounded-lg max-w-6xl w-full max-h-[90vh] overflow-hidden shadow-xl">
                <!-- Header -->
                <div class="bg-gray-50 px-6 py-4 border-b border-gray-200">
                  <div class="flex items-center justify-between">
                    <h3 class="text-lg font-medium text-gray-900">
                      Detalles de Sincronización #${log.id}
                    </h3>
                    <button onclick="closeLogDetails()" class="text-gray-400 hover:text-gray-500">
                      <i data-lucide="x" class="h-6 w-6"></i>
                    </button>
                  </div>
                </div>

                <!-- Content -->
                <div class="px-6 py-4 overflow-y-auto max-h-[calc(90vh-8rem)]">
                  <!-- Summary -->
                  <div class="grid grid-cols-2 gap-4 mb-6">
                    <div>
                      <p class="text-sm font-medium text-gray-500">Entidad</p>
                      <p class="mt-1 text-sm text-gray-900 capitalize">${escapeHtml(log.entityType)}</p>
                    </div>
                    <div>
                      <p class="text-sm font-medium text-gray-500">Estado</p>
                      <p class="mt-1">${getStatusBadge(log.status)}</p>
                    </div>
                    <div>
                      <p class="text-sm font-medium text-gray-500">Tipo</p>
                      <p class="mt-1 text-sm text-gray-900 capitalize">${escapeHtml(log.syncType)}</p>
                    </div>
                    <div>
                      <p class="text-sm font-medium text-gray-500">Fecha</p>
                      <p class="mt-1 text-sm text-gray-900">${log.createdAt ? new Date(log.createdAt).toLocaleString('es-AR') : '-'}</p>
                    </div>
                    <div>
                      <p class="text-sm font-medium text-gray-500">Registros Obtenidos</p>
                      <p class="mt-1 text-sm text-gray-900">${log.recordsFetched ?? 0}</p>
                    </div>
                    <div>
                      <p class="text-sm font-medium text-gray-500">Registros Enviados</p>
                      <p class="mt-1 text-sm text-gray-900">${log.recordsSent ?? 0}</p>
                    </div>
                    ${log.recordsFailed && log.recordsFailed > 0 ? `
                    <div class="col-span-2">
                      <p class="text-sm font-medium text-gray-500">Registros Fallidos</p>
                      <p class="mt-1 text-sm text-red-600 font-semibold">${log.recordsFailed}</p>
                    </div>
                    ` : ''}
                    <div>
                      <p class="text-sm font-medium text-gray-500">Duración</p>
                      <p class="mt-1 text-sm text-gray-900">${log.durationMs ? formatDuration(log.durationMs) : '-'}</p>
                    </div>
                    ${details?.batchSize ? `
                    <div>
                      <p class="text-sm font-medium text-gray-500">Tamaño de Lote</p>
                      <p class="mt-1 text-sm text-gray-900">${details.batchSize} registros</p>
                    </div>
                    ` : ''}
                  </div>

                  ${log.errorMessage ? `
                  <div class="mb-6">
                    <h4 class="text-sm font-medium text-gray-900 mb-2">Error</h4>
                    <div class="bg-red-50 border border-red-200 rounded-md p-3">
                      <p class="text-sm text-red-700">${escapeHtml(log.errorMessage)}</p>
                    </div>
                  </div>
                  ` : ''}

                  ${batchData && batchData.records && batchData.records.length > 0 ? `
                  <div class="mb-6">
                    <div class="flex justify-between items-center mb-2">
                      <h4 class="text-sm font-medium text-gray-900">
                        Lote ${currentBatch} de ${totalBatches}
                        <span class="text-gray-500 font-normal">(${batchData.recordCount} registros en este lote)</span>
                      </h4>
                      ${totalBatches > 1 ? `
                      <div class="flex items-center space-x-2">
                        <button
                          onclick="navigateToBatch(${id}, ${currentBatch - 1})"
                          ${currentBatch <= 1 ? 'disabled' : ''}
                          class="inline-flex items-center px-3 py-1 border border-gray-300 rounded-md text-xs font-medium ${currentBatch <= 1 ? 'text-gray-400 bg-gray-100 cursor-not-allowed' : 'text-gray-700 bg-white hover:bg-gray-50'}"
                        >
                          <i data-lucide="chevron-left" class="w-4 h-4 mr-1"></i>
                          Anterior
                        </button>
                        <span class="text-sm text-gray-600">Página ${currentBatch}/${totalBatches}</span>
                        <button
                          onclick="navigateToBatch(${id}, ${currentBatch + 1})"
                          ${currentBatch >= totalBatches ? 'disabled' : ''}
                          class="inline-flex items-center px-3 py-1 border border-gray-300 rounded-md text-xs font-medium ${currentBatch >= totalBatches ? 'text-gray-400 bg-gray-100 cursor-not-allowed' : 'text-gray-700 bg-white hover:bg-gray-50'}"
                        >
                          Siguiente
                          <i data-lucide="chevron-right" class="w-4 h-4 ml-1"></i>
                        </button>
                      </div>
                      ` : ''}
                    </div>
                    <div class="bg-gray-50 border border-gray-200 rounded-md overflow-x-scroll">
                      <table id="logs-table" class="min-w-full divide-y divide-gray-200">
                        <thead class="bg-gray-100">
                          <tr>
                            <th class="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase sticky left-0 bg-gray-100 z-10">#</th>
                            ${Object.keys(batchData.records[0] || {}).map(key => `
                              <th class="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase whitespace-nowrap">${escapeHtml(key)}</th>
                            `).join('')}
                          </tr>
                        </thead>
                        <tbody class="bg-white divide-y divide-gray-200">
                          ${batchData.records.map((record: any, idx: number) => `
                            <tr class="hover:bg-gray-50">
                              <td class="px-3 py-2 text-xs text-gray-500 sticky left-0 bg-white z-10">${(currentBatch - 1) * (details?.batchSize || 100) + idx + 1}</td>
                              ${Object.entries(record).map(([key, value]) => `
                                <td class="px-3 py-2 text-xs text-gray-900 whitespace-nowrap">${escapeHtml(String(value) || '-')}</td>
                              `).join('')}
                            </tr>
                          `).join('')}
                        </tbody>
                      </table>
                    </div>
                  </div>
                  ` : ''}

                  ${details?.errors && details.errors.length > 0 ? `
                  <div>
                    <h4 class="text-sm font-medium text-gray-900 mb-2">Errores (primeros 10)</h4>
                    <div class="bg-red-50 border border-red-200 rounded-md p-3 space-y-2">
                      ${details.errors.map((error: any) => `
                        <div class="text-xs">
                          <span class="font-medium text-red-800">Registro ${error.index}:</span>
                          <span class="text-red-700">${escapeHtml(error.error)}</span>
                        </div>
                      `).join('')}
                    </div>
                  </div>
                  ` : ''}
                </div>

                <!-- Footer -->
                <div class="bg-gray-50 px-6 py-3 border-t border-gray-200 flex justify-end">
                  <button
                    onclick="closeLogDetails()"
                    class="px-4 py-2 bg-white border border-gray-300 rounded-md text-sm font-medium text-gray-700 hover:bg-gray-50"
                  >
                    Cerrar
                  </button>
                </div>
              </div>
            </div>
          </div>

          <script>
            lucide.createIcons();

            // Función para navegar entre lotes
            function navigateToBatch(logId, batchNumber) {
              htmx.ajax('GET', '/api/logs/' + logId + '/details?batch=' + batchNumber, {
                target: 'body',
                swap: 'beforeend'
              }).then(() => {
                // Cerrar el modal actual
                const currentModal = document.getElementById('log-details-modal');
                if (currentModal) {
                  currentModal.remove();
                }
              });
            }

            // Hacer la función global
            window.navigateToBatch = navigateToBatch;
          </script>
        `;

        return reply.type('text/html').send(html);
      } catch (error) {
        logger.error({ error }, 'Error al obtener detalles del log');
        return reply.status(500).type('text/html').send('<p>Error al cargar detalles</p>');
      }
    }
  );

  /**
   * DELETE /api/logs/all - Eliminar TODOS los logs
   */
  app.delete(
    '/api/logs/all',
    { preHandler: requireNoPasswordChange },
    async (_request, reply) => {
      try {
        logger.warn('Eliminando TODOS los logs de la base de datos...');

        const deletedCount = await deleteAllLogs();

        logger.info({ deletedCount }, 'Todos los logs fueron eliminados');

        return reply.send({
          success: true,
          message: `${deletedCount} logs eliminados correctamente`,
          deletedCount,
        });
      } catch (error) {
        logger.error({ error }, 'Error al eliminar todos los logs');
        return reply.status(500).send({
          success: false,
          error: 'Error al eliminar los logs',
        });
      }
    }
  );

  /**
   * GET /api/logs/:id/batch/:batchNumber - Obtener un lote específico (JSON)
   */
  app.get<{
    Params: { id: string; batchNumber: string };
  }>(
    '/api/logs/:id/batch/:batchNumber',
    { preHandler: requireNoPasswordChange },
    async (request, reply) => {
      try {
        const logId = parseInt(request.params.id, 10);
        const batchNumber = parseInt(request.params.batchNumber, 10);

        if (isNaN(logId) || isNaN(batchNumber)) {
          return reply.status(400).send({
            success: false,
            error: 'ID de log o número de lote inválido',
          });
        }

        const batch = await readBatch(logId, batchNumber);

        if (!batch) {
          return reply.status(404).send({
            success: false,
            error: 'Lote no encontrado',
          });
        }

        return reply.send({
          success: true,
          data: batch,
        });
      } catch (error) {
        logger.error({ error }, 'Error al obtener lote');
        return reply.status(500).send({
          success: false,
          error: 'Error al obtener lote',
        });
      }
    }
  );

  /**
   * GET /api/logs/:id/batches/count - Obtener cantidad de lotes
   */
  app.get<{
    Params: { id: string };
  }>(
    '/api/logs/:id/batches/count',
    { preHandler: requireNoPasswordChange },
    async (request, reply) => {
      try {
        const logId = parseInt(request.params.id, 10);

        if (isNaN(logId)) {
          return reply.status(400).send({
            success: false,
            error: 'ID de log inválido',
          });
        }

        const count = await countBatches(logId);

        return reply.send({
          success: true,
          count,
        });
      } catch (error) {
        logger.error({ error }, 'Error al contar lotes');
        return reply.status(500).send({
          success: false,
          error: 'Error al contar lotes',
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
    success: '<span class="px-2 inline-flex text-xs leading-5 font-semibold rounded-full bg-green-100 text-green-800">Exitoso</span>',
    failed: '<span class="px-2 inline-flex text-xs leading-5 font-semibold rounded-full bg-red-100 text-red-800">Fallido</span>',
    partial: '<span class="px-2 inline-flex text-xs leading-5 font-semibold rounded-full bg-yellow-100 text-yellow-800">Parcial</span>',
    running: '<span class="px-2 inline-flex text-xs leading-5 font-semibold rounded-full bg-blue-100 text-blue-800">En ejecución</span>',
    started: '<span class="px-2 inline-flex text-xs leading-5 font-semibold rounded-full bg-blue-100 text-blue-800">Iniciado</span>',
    canceled: '<span class="px-2 inline-flex text-xs leading-5 font-semibold rounded-full bg-orange-100 text-orange-800">Cancelado</span>',
  };

  return badges[status as keyof typeof badges] || '<span class="px-2 inline-flex text-xs leading-5 font-semibold rounded-full bg-gray-100 text-gray-800">Desconocido</span>';
}

/**
 * Helper para formatear duración
 */
function formatDuration(ms: number): string {
  if (ms < 1000) {
    return `${ms}ms`;
  }

  const seconds = Math.floor(ms / 1000);
  if (seconds < 60) {
    return `${seconds}s`;
  }

  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = seconds % 60;
  return `${minutes}m ${remainingSeconds}s`;
}
