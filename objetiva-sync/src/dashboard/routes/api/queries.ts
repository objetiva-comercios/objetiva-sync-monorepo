/**
 * API endpoints para gestión de consultas SQL
 * HTMX-powered endpoints para el editor de queries
 */

import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { requireNoPasswordChange } from '../../middleware/auth.js';
import {
  getAllQueries,
  getQuery,
  createQuery,
  updateQuery,
  deleteQuery,
  reorderQueries,
  updateQueryInterval,
  toggleQueryScheduled,
  getQueriesOrdered,
} from '../../../store/repositories/queries-repo.js';
import { getActiveConnectionConfig } from '../../../store/repositories/connection-config-repo.js';
import { executeQueryOnConnection } from '../../../adapters/database-adapter.js';
import { logger } from '../../../utils/logger.js';
import type { EntityType } from '../../../types/common.js';
import { validateQueryAgainstSchema } from '../../../sync/schema-validator.js';

/**
 * Schema de validación para guardar query
 */
const saveQuerySchema = {
  body: {
    type: 'object',
    required: ['name', 'entityType', 'sqlQuery'],
    properties: {
      queryId: { type: 'string' },
      name: { type: 'string', minLength: 1 },
      entityType: {
        type: 'string',
        enum: ['articulo', 'comprobante_cabecera', 'comprobante_detalle', 'comprobante_pago']
      },
      sqlQuery: { type: 'string', minLength: 1 },
      incrementalField: { type: 'string' },
      incrementalType: { type: 'string', enum: ['datetime', 'number', 'string', ''] },
      joinField: { type: 'string' },
      isActive: { type: 'string' }, // Checkbox comes as "on" or undefined
    },
  },
};

/**
 * Schema de validación para test query
 */
const testQuerySchema = {
  body: {
    type: 'object',
    required: ['sqlQuery'],
    properties: {
      sqlQuery: { type: 'string', minLength: 1 },
      incrementalField: { type: 'string' },
      incrementalType: { type: 'string', enum: ['datetime', 'number', 'string', ''] },
    },
  },
};

/**
 * Registra las rutas de API de queries
 */
export async function registerQueriesApiRoutes(app: FastifyInstance) {
  /**
   * GET /api/queries/list - Lista de queries (HTML fragment para HTMX)
   */
  app.get(
    '/api/queries/list',
    { preHandler: requireNoPasswordChange },
    async (_request: FastifyRequest, reply: FastifyReply) => {
      try {
        const queries = await getQueriesOrdered(); // Usar getQueriesOrdered en lugar de getAllQueries

        if (queries.length === 0) {
          return reply.type('text/html').send(`
            <div class="px-4 py-8 text-center text-gray-500">
              <i data-lucide="database" class="h-8 w-8 mx-auto mb-2"></i>
              <p class="text-sm">No hay consultas configuradas</p>
              <p class="text-xs mt-1">Crea tu primera consulta</p>
            </div>
          `);
        }

        // Generar HTML de la lista con drag & drop y scheduling
        const html = queries
          .map(
            (query) => {
              // Formatear intervalo de sincronización
              const formatInterval = (seconds: number) => {
                if (seconds < 60) return `${seconds}s`;
                if (seconds < 3600) return `${Math.floor(seconds / 60)}m`;
                return `${Math.floor(seconds / 3600)}h`;
              };

              return `
          <div class="px-4 py-4 hover:bg-gray-50 border-b border-gray-200" data-query-id="${query.id}">
            <div class="flex items-start gap-3">
              <!-- Drag Handle -->
              <div class="drag-handle flex-shrink-0 cursor-move text-gray-400 hover:text-gray-600 pt-1" title="Arrastra para reordenar">
                <i data-lucide="grip-vertical" class="h-5 w-5"></i>
              </div>

              <!-- Query Info (clickable) -->
              <div class="flex-1 min-w-0 cursor-pointer" onclick="loadQueryForEdit(${query.id})">
                <div class="flex items-center gap-2 flex-wrap">
                  <h4 class="text-sm font-medium text-gray-900">
                    ${escapeHtml(query.name)}
                  </h4>
                  <span class="inline-flex items-center px-1.5 py-0.5 rounded text-xs font-mono bg-gray-200 text-gray-700" title="Query ID">
                    #${query.id}
                  </span>
                  ${
                    query.isActive
                      ? '<span class="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-green-100 text-green-800">Activa</span>'
                      : '<span class="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-gray-100 text-gray-800">Inactiva</span>'
                  }
                  ${
                    query.isScheduled
                      ? '<span class="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-blue-100 text-blue-800">Programada</span>'
                      : ''
                  }
                </div>
                <p class="mt-1 text-xs text-gray-500">
                  ${escapeHtml(query.entityType)}
                  ${query.incrementalField ? `• ${escapeHtml(query.incrementalField)}` : ''}
                  ${query.isScheduled ? `• Cada ${formatInterval(query.syncInterval || 1800)}` : ''}
                </p>
                ${
                  query.lastTestAt
                    ? `
                  <div class="mt-1 flex items-center text-xs">
                    ${
                      query.lastTestStatus === 'success'
                        ? '<i data-lucide="check-circle" class="h-3 w-3 text-green-500 mr-1"></i>'
                        : '<i data-lucide="x-circle" class="h-3 w-3 text-red-500 mr-1"></i>'
                    }
                    <span class="text-gray-500">
                      ${query.lastTestRowCount ?? 0} filas • ${new Date(query.lastTestAt).toLocaleDateString()}
                    </span>
                  </div>
                `
                    : ''
                }
              </div>

              <!-- Scheduling Controls -->
              <div class="flex-shrink-0 flex items-center gap-2">
                <!-- Checkbox para programar -->
                <label class="flex items-center cursor-pointer" onclick="event.stopPropagation()" title="Programar sincronización automática">
                  <input
                    type="checkbox"
                    class="schedule-checkbox h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
                    data-query-id="${query.id}"
                    ${query.isScheduled ? 'checked' : ''}
                    onchange="toggleQueryScheduled(${query.id}, this.checked)"
                  >
                  <span class="ml-1 text-xs text-gray-600">Auto</span>
                </label>

                <!-- Delete button -->
                <button
                  type="button"
                  onclick="event.stopPropagation(); deleteQueryById(${query.id})"
                  class="text-gray-400 hover:text-red-600"
                  title="Eliminar consulta"
                >
                  <i data-lucide="trash-2" class="h-4 w-4"></i>
                </button>
              </div>
            </div>
          </div>
        `;
            }
          )
          .join('');

        return reply.type('text/html').send(html);
      } catch (error) {
        logger.error({ error }, 'Error al listar queries');
        return reply.status(500).type('text/html').send(`
          <div class="px-4 py-8 text-center text-red-600">
            <i data-lucide="alert-circle" class="h-8 w-8 mx-auto mb-2"></i>
            <p class="text-sm">Error al cargar consultas</p>
          </div>
        `);
      }
    }
  );

  /**
   * GET /api/queries/:id - Obtener query por ID (JSON para JavaScript)
   */
  app.get<{
    Params: { id: string };
  }>(
    '/api/queries/:id',
    { preHandler: requireNoPasswordChange },
    async (
      request,
      reply
    ) => {
      try {
        const id = parseInt(request.params.id, 10);

        if (isNaN(id)) {
          return reply.status(400).send({
            success: false,
            error: 'ID inválido',
          });
        }

        const query = await getQuery(id);

        if (!query) {
          return reply.status(404).send({
            success: false,
            error: 'Consulta no encontrada',
          });
        }

        return reply.send({
          success: true,
          data: query,
        });
      } catch (error) {
        logger.error({ error }, 'Error al obtener query');
        return reply.status(500).send({
          success: false,
          error: 'Error al obtener consulta',
        });
      }
    }
  );

  /**
   * POST /api/queries/save - Guardar query (crear o actualizar)
   */
  app.post<{
    Body: {
      queryId?: string;
      name: string;
      entityType: EntityType;
      sqlQuery: string;
      incrementalField?: string;
      incrementalType?: 'datetime' | 'number' | 'string' | '';
      joinField?: string;
      isActive?: string;
    };
  }>(
    '/api/queries/save',
    { preHandler: requireNoPasswordChange, schema: saveQuerySchema },
    async (
      request,
      reply
    ) => {
      try {
        const {
          queryId,
          name,
          entityType,
          sqlQuery,
          incrementalField,
          incrementalType,
          joinField,
          isActive,
        } = request.body;

        // Convertir checkbox a boolean
        const isActiveBoolean = isActive === 'on';

        // Normalizar incrementalType (empty string to undefined)
        const normalizedIncrementalType =
          incrementalType && incrementalType.length > 0 ? incrementalType : undefined;
        // Validate query before saving
        const activeConnection = await getActiveConnectionConfig();

        if (activeConnection) {
          // Execute a limited test query to get sample data
          // NOTE: Uses SQL Server TOP syntax. For other databases, use LIMIT clause.
          // This is a known limitation - validation assumes SQL Server dialect.
          const testQuery = sqlQuery.trim().toUpperCase().startsWith('SELECT')
            ? sqlQuery.replace(/SELECT/i, 'SELECT TOP 10')
            : sqlQuery;

          let testRows: Record<string, unknown>[] = [];
          try {
            const result = await executeQueryOnConnection(
              activeConnection.adapterType,
              activeConnection.config,
              testQuery
            );
            testRows = result.rows as Record<string, unknown>[];
          } catch (queryError) {
            // Query execution failed - this is a different error than validation
            logger.error({ error: queryError }, 'Query execution failed during validation');
            return reply.status(400).send({
              success: false,
              error: 'Query execution failed: ' + (queryError instanceof Error ? queryError.message : String(queryError)),
            });
          }

          // Validate against schema
          const validation = await validateQueryAgainstSchema(testRows, entityType);

          if (!validation.isValid) {
            // Log validation failure
            logger.warn({ entityType, errors: validation.errors }, 'Query validation failed');

            return reply.status(400).send({
              success: false,
              error: 'Query validation failed against schema',
              validationErrors: validation.errors.map(err => ({
                field: err.field,
                type: err.type,
                message: err.message,
                suggestion: err.suggestion,
              })),
            });
          }

          // Log warnings (empty rows, schema unavailable) but allow save to proceed
          if (validation.warnings.length > 0) {
            logger.info({ entityType, warnings: validation.warnings }, 'Query validation passed with warnings');
          }

          // Log if schema was unavailable (but validation passed by default)
          if (validation.schemaUnavailable) {
            logger.warn({ entityType }, 'Schema unavailable during validation, proceeding without schema check');
          }
        } else {
          logger.warn('No active connection - skipping query validation');
        }


        // Si tiene ID, actualizar; si no, crear
        let resultQueryId: number;

         if (queryId && queryId !== '') {
          resultQueryId = parseInt(queryId, 10);

          await updateQuery(resultQueryId, {
            name,
            entityType,  // ← AGREGAR ESTA LÍNEA
            sqlQuery,
            incrementalField: incrementalField || null,
            incrementalType: normalizedIncrementalType === 'datetime' ? 'date' : normalizedIncrementalType === 'number' ? 'id' : null,
            joinField: joinField || null,
            isActive: isActiveBoolean,
          });

          logger.info(`Query actualizada: ${name} (ID: ${resultQueryId})`);
        } else {
          resultQueryId = await createQuery({
            entityType,
            name,
            sqlQuery,
            incrementalField: incrementalField || undefined,
            incrementalType: normalizedIncrementalType === 'datetime' ? 'date' : normalizedIncrementalType === 'number' ? 'id' : undefined,
            joinField: joinField || undefined,
            isActive: isActiveBoolean,
          });

          logger.info(`Query creada: ${name} (ID: ${resultQueryId})`);
        }

        return reply.send({
          success: true,
          id: resultQueryId,
        });
      } catch (error) {
        logger.error({ error }, 'Error al guardar query');
        return reply.status(500).send({
          success: false,
          error: 'Error al guardar consulta',
        });
      }
    }
  );

  /**
   * DELETE /api/queries/:id - Eliminar query
   */
  app.delete<{
    Params: { id: string };
  }>(
    '/api/queries/:id',
    { preHandler: requireNoPasswordChange },
    async (
      request,
      reply
    ) => {
      try {
        const id = parseInt(request.params.id, 10);

        if (isNaN(id)) {
          return reply.status(400).send({
            success: false,
            error: 'ID inválido',
          });
        }

        await deleteQuery(id);

        logger.info(`Query eliminada: ID ${id}`);

        return reply.send({
          success: true,
        });
      } catch (error) {
        logger.error({ error }, 'Error al eliminar query');
        return reply.status(500).send({
          success: false,
          error: 'Error al eliminar consulta',
        });
      }
    }
  );

  /**
   * POST /api/queries/test - Probar query (ejecutar en ERP)
   */
  app.post<{
    Body: {
      sqlQuery: string;
      incrementalField?: string;
      incrementalType?: 'datetime' | 'number' | 'string' | '';
    };
  }>(
    '/api/queries/test',
    { preHandler: requireNoPasswordChange, schema: testQuerySchema },
    async (
      request,
      reply
    ) => {
      try {
        const { sqlQuery } = request.body;

        logger.info('Test de query solicitado');

        // Obtener conexión activa
        const activeConnection = await getActiveConnectionConfig();

        if (!activeConnection) {
          const html = `
            <div class="bg-yellow-50 border border-yellow-200 rounded p-3">
              <div class="flex items-center">
                <i data-lucide="alert-circle" class="h-4 w-4 text-yellow-600 mr-2"></i>
                <p class="text-sm text-yellow-800">
                  No hay una conexión activa configurada. Por favor, activa una conexión primero.
                </p>
              </div>
            </div>
          `;
          return reply.type('text/html').send(html);
        }

        // Ejecutar query
        const result = await executeQueryOnConnection(
          activeConnection.adapterType,
          activeConnection.config,
          sqlQuery
        );

        // Generar HTML con resultados
        const html = `
          <div class="space-y-3">
            <div class="flex items-center justify-between pb-2 border-b border-gray-200">
              <div class="flex items-center text-sm">
                <i data-lucide="check-circle" class="h-4 w-4 text-green-600 mr-2"></i>
                <span class="font-medium text-gray-700">Consulta ejecutada exitosamente</span>
              </div>
              <span class="text-xs text-gray-500">${result.rowCount} ${result.rowCount === 1 ? 'fila' : 'filas'}</span>
            </div>

            ${
              result.rowCount > 0
                ? `
              <div class="bg-gray-50 border border-gray-200 rounded p-3 overflow-x-auto">
                <table class="min-w-full text-xs">
                  <thead>
                    <tr class="border-b border-gray-300">
                      ${Object.keys(result.rows[0] as Record<string, unknown>)
                        .map(
                          (key) => `
                        <th class="text-left py-1 px-2 font-medium text-gray-700">${escapeHtml(key)}</th>
                      `
                        )
                        .join('')}
                    </tr>
                  </thead>
                  <tbody>
                    ${result.rows
                      .slice(0, 10)
                      .map(
                        (row) => `
                      <tr class="border-b border-gray-200 hover:bg-gray-100">
                        ${Object.values(row as Record<string, unknown>)
                          .map(
                            (value) => `
                          <td class="py-1 px-2 text-gray-800 font-mono">${escapeHtml(String(value ?? ''))}</td>
                        `
                          )
                          .join('')}
                      </tr>
                    `
                      )
                      .join('')}
                  </tbody>
                </table>
                ${
                  result.rowCount > 10
                    ? `
                  <p class="text-xs text-gray-500 mt-2 text-center">
                    Mostrando 10 de ${result.rowCount} filas
                  </p>
                `
                    : ''
                }
              </div>
            `
                : `
              <div class="bg-gray-50 border border-gray-200 rounded p-3">
                <p class="text-sm text-gray-600 text-center">La consulta no devolvió resultados</p>
              </div>
            `
            }
          </div>
        `;

        return reply.type('text/html').send(html);
      } catch (error) {
        logger.error({ error }, 'Error al probar query');

        const errorMessage = error instanceof Error ? error.message : String(error);

        const html = `
          <div class="bg-red-50 border border-red-200 rounded p-3">
            <div class="flex items-start">
              <i data-lucide="x-circle" class="h-4 w-4 text-red-600 mr-2 mt-0.5"></i>
              <div>
                <p class="text-sm text-red-800 font-medium">Error al ejecutar consulta</p>
                <p class="text-xs text-red-700 mt-1 font-mono">${escapeHtml(errorMessage)}</p>
              </div>
            </div>
          </div>
        `;

        return reply.type('text/html').send(html);
      }
    }
  );

  /**
   * POST /api/queries/test-and-validate - Probar query y validar contra schema
   */
  app.post<{
    Body: {
      sqlQuery: string;
      entityType: EntityType;
      queryId?: number;
    };
  }>(
    '/api/queries/test-and-validate',
    { preHandler: requireNoPasswordChange },
    async (request, reply) => {
      try {
        const { sqlQuery, entityType, queryId } = request.body;

        if (!sqlQuery || !entityType) {
          return reply.status(400).send({
            success: false,
            error: 'sqlQuery y entityType son requeridos'
          });
        }

        logger.info({ entityType, queryId }, '[API] Test and validate query solicitado');

        // Obtener conexión activa
        const activeConnection = await getActiveConnectionConfig();

        if (!activeConnection) {
          return reply.status(400).send({
            success: false,
            error: 'No hay una conexión activa configurada. Por favor, activa una conexión primero.'
          });
        }

        // Ejecutar query (limitar a 10 filas para test)
        const testQuery = sqlQuery.trim().toUpperCase().startsWith('SELECT')
          ? sqlQuery.replace(/SELECT/i, 'SELECT TOP 10')
          : sqlQuery;

        const queryResult = await executeQueryOnConnection(
          activeConnection.adapterType,
          activeConnection.config,
          testQuery
        );

        // Importar y usar el validator
        const { validateQueryResult } = await import('../../../sync/query-validator.js');
        const validation = validateQueryResult(queryResult.rows as Record<string, unknown>[], entityType);

        // Retornar resultado
        return reply.send({
          success: true,
          rowCount: queryResult.rowCount,
          sampleData: validation.sampleData,
          validation: {
            isValid: validation.isValid,
            requiredFields: validation.requiredFields,
            optionalFields: validation.optionalFields,
            validationErrors: validation.validationErrors.slice(0, 20), // Limitar errores
            recommendations: validation.recommendations
          }
        });
      } catch (error) {
        logger.error({ error }, '[API] Error al test-and-validate query');

        const errorMessage = error instanceof Error ? error.message : String(error);

        return reply.status(500).send({
          success: false,
          error: errorMessage
        });
      }
    }
  );

  /**
   * PUT /api/queries/reorder - Reordenar queries (drag & drop)
   */
  app.put<{
    Body: {
      orderedIds: number[];
    };
  }>(
    '/api/queries/reorder',
    { preHandler: requireNoPasswordChange },
    async (request, reply) => {
      try {
        const { orderedIds } = request.body;

        if (!Array.isArray(orderedIds) || orderedIds.length === 0) {
          return reply.status(400).send({
            success: false,
            error: 'orderedIds debe ser un array con al menos un ID',
          });
        }

        // Validar que todos sean números
        const allNumbers = orderedIds.every(id => typeof id === 'number' && !isNaN(id));
        if (!allNumbers) {
          return reply.status(400).send({
            success: false,
            error: 'Todos los IDs deben ser números válidos',
          });
        }

        await reorderQueries(orderedIds);

        logger.info({ orderedIds }, 'Queries reordenadas');

        return reply.send({
          success: true,
        });
      } catch (error) {
        logger.error({ error }, 'Error al reordenar queries');
        return reply.status(500).send({
          success: false,
          error: 'Error al reordenar consultas',
        });
      }
    }
  );

  /**
   * PUT /api/queries/:id/schedule - Actualizar configuración de scheduling
   */
  app.put<{
    Params: { id: string };
    Body: {
      isScheduled?: boolean;
      syncInterval?: number;
    };
  }>(
    '/api/queries/:id/schedule',
    { preHandler: requireNoPasswordChange },
    async (request, reply) => {
      try {
        const id = parseInt(request.params.id, 10);

        if (isNaN(id)) {
          return reply.status(400).send({
            success: false,
            error: 'ID inválido',
          });
        }

        const { isScheduled, syncInterval } = request.body;

        // Validar intervalo si se proporciona
        if (syncInterval !== undefined) {
          if (typeof syncInterval !== 'number' || syncInterval < 15 || syncInterval > 86400) {
            return reply.status(400).send({
              success: false,
              error: 'syncInterval debe estar entre 15 segundos y 86400 segundos (24 horas)',
            });
          }

          await updateQueryInterval(id, syncInterval);
          logger.info({ queryId: id, syncInterval }, 'Intervalo de sincronización actualizado');
        }

        // Actualizar isScheduled si se proporciona
        if (isScheduled !== undefined) {
          if (typeof isScheduled !== 'boolean') {
            return reply.status(400).send({
              success: false,
              error: 'isScheduled debe ser un boolean',
            });
          }

          await toggleQueryScheduled(id, isScheduled);
          logger.info({ queryId: id, isScheduled }, 'Estado de programación actualizado');
        }

        // TODO: Reiniciar scheduler para aplicar cambios
        // await restartScheduler();

        return reply.send({
          success: true,
          message: 'Configuración de scheduling actualizada',
        });
      } catch (error) {
        logger.error({ error }, 'Error al actualizar configuración de scheduling');
        return reply.status(500).send({
          success: false,
          error: 'Error al actualizar configuración de scheduling',
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
