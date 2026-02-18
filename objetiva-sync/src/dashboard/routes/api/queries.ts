/**
 * API endpoints para gestión de consultas SQL
 * HTMX-powered endpoints para el editor de queries
 */

import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { requireNoPasswordChange } from '../../middleware/auth.js';
import {
  getQuery,
  createQuery,
  updateQuery,
  deleteQuery,
  reorderQueries,
  updateQueryInterval,
  toggleQueryScheduled,
  getQueriesOrdered,
} from '../../../store/repositories/queries-repo.js';
import {
  getActiveConnectionConfig,
  getConnectionById,
  getConnectionConfig,
  getAllConnections,
} from '../../../store/repositories/connection-config-repo.js';
import { executeQueryOnConnection } from '../../../adapters/database-adapter.js';
import { logger } from '../../../utils/logger.js';
import type { EntityType } from '../../../types/common.js';
import { validateQueryAgainstSchema } from '../../../sync/schema-validator.js';

/**
 * Convert EntityType to PostgreSQL table name (plural form)
 *
 * Required because EntityType values are singular (e.g., 'articulo')
 * but PostgreSQL table names are plural (e.g., 'articulos').
 */
function entityTypeToTableName(entityType: string): string {
  const mapping: Record<string, string> = {
    'articulo': 'articulos',
    'comprobante_cabecera': 'comprobantes_cabecera',
    'comprobante_detalle': 'comprobantes_detalle',
    'comprobante_pago': 'comprobantes_pagos',
  };
  return mapping[entityType] || entityType;
}

/**
 * Apply LIMIT to a SELECT query based on adapter type.
 *
 * - SQL Server: SELECT TOP N ...
 * - PostgreSQL/MySQL: SELECT ... LIMIT N
 *
 * @param sqlQuery Original query
 * @param adapterType Database adapter type
 * @param limit Number of rows to limit
 * @returns Query with appropriate LIMIT syntax
 */
function applyQueryLimit(sqlQuery: string, adapterType: string, limit: number = 10): string {
  const trimmedQuery = sqlQuery.trim();

  // Only apply to SELECT statements
  if (!trimmedQuery.toUpperCase().startsWith('SELECT')) {
    return trimmedQuery;
  }

  if (adapterType === 'sqlserver') {
    // SQL Server: SELECT TOP N ...
    return trimmedQuery.replace(/SELECT/i, `SELECT TOP ${limit}`);
  } else {
    // PostgreSQL, MySQL: ... LIMIT N
    // Check if LIMIT already exists
    if (/LIMIT\s+\d+/i.test(trimmedQuery)) {
      return trimmedQuery;
    }
    return `${trimmedQuery} LIMIT ${limit}`;
  }
}

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
      incrementalType: { type: 'string', enum: ['datetime', ''] },  // Simplificado: solo Fecha/Hora o Full sync
      joinField: { type: 'string' },
      connectionId: { type: 'string' }, // ID de conexión específica (vacío = conexión activa)
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
      incrementalType: { type: 'string', enum: ['datetime', ''] },  // Simplificado
      connectionId: { type: 'string' },  // ID de conexión específica (vacío = conexión activa)
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

        // Get all connections to show connection names in the list
        const connections = await getAllConnections();
        const connectionMap = new Map(connections.map(c => [c.id, c]));

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

              // Get connection info for this query
              const connection = query.connectionId ? connectionMap.get(query.connectionId) : null;
              const connectionBadge = connection
                ? `<span class="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-purple-100 text-purple-800" title="Conexión específica: ${escapeHtml(connection.name)}">🔗 ${escapeHtml(connection.name)}</span>`
                : '<span class="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-gray-100 text-gray-600" title="Usa la conexión marcada como activa (⭐)">🔗 Conexión global</span>';

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
                      ? '<span class="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-green-100 text-green-800" title="La query se sincronizará">Habilitada</span>'
                      : '<span class="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-gray-100 text-gray-800" title="La query no se sincronizará">Deshabilitada</span>'
                  }
                  ${
                    query.isScheduled
                      ? '<span class="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-blue-100 text-blue-800">Programada</span>'
                      : ''
                  }
                  ${connectionBadge}
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

              <!-- Actions -->
              <div class="flex-shrink-0 flex items-center gap-2">

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

        // Obtener el lastSyncValue del estado de sincronización
        const { getLastSyncValue } = await import('../../../store/repositories/sync-state-repo.js');
        const lastSyncValue = await getLastSyncValue(id);

        return reply.send({
          success: true,
          data: {
            ...query,
            lastSyncValue,  // Agregar el último valor de sincronización
          },
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
      connectionId?: string;
      isActive?: string;
      isScheduled?: string;
      syncInterval?: string;
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
          connectionId,
          isActive,
          isScheduled,
          syncInterval,
        } = request.body;

        // Convertir checkboxes a boolean
        const isActiveBoolean = isActive === 'on';
        const isScheduledBoolean = isScheduled === 'on';

        // Convertir syncInterval a number (default 1800 = 30 min)
        const syncIntervalNumber = syncInterval ? parseInt(syncInterval, 10) : 1800;

        // Normalizar incrementalType (empty string to undefined)
        // UI usa 'datetime', DB almacena 'date'
        const normalizedIncrementalType =
          incrementalType === 'datetime' ? 'date' : undefined;

        // Parse connectionId (empty string = null = use active connection)
        const parsedConnectionId = connectionId && connectionId.trim() !== ''
          ? parseInt(connectionId, 10)
          : null;

        // Validate connectionId if provided
        if (parsedConnectionId !== null) {
          if (isNaN(parsedConnectionId)) {
            return reply.status(400).send({
              success: false,
              error: 'ID de conexión inválido',
            });
          }
          const conn = await getConnectionById(parsedConnectionId);
          if (!conn) {
            return reply.status(400).send({
              success: false,
              error: `Conexión con ID ${parsedConnectionId} no encontrada`,
            });
          }
        }

        // IMPORTANTE: Invalidar cache de schemas antes de validar para obtener
        // los schemas más recientes del gateway (reflejando cambios en PostgreSQL)
        const { schemaCache } = await import('../../../services/schema-cache.js');
        schemaCache.invalidate(); // Limpiar TODO el cache para forzar refresh desde gateway

        // Get the connection to use for validation
        // If connectionId specified, use that; otherwise use active connection
        let validationConnection: { adapterType: string; config: Record<string, unknown> } | null = null;

        if (parsedConnectionId !== null) {
          const conn = await getConnectionById(parsedConnectionId);
          if (conn) {
            const config = await getConnectionConfig(parsedConnectionId);
            validationConnection = { adapterType: conn.adapterType, config };
          }
        } else {
          const activeConn = await getActiveConnectionConfig();
          if (activeConn) {
            validationConnection = { adapterType: activeConn.adapterType, config: activeConn.config };
          }
        }

        if (validationConnection) {
          // Execute a limited test query to get sample data
          // Reemplazar @lastSync con una fecha dummy para que no falle la validación
          const safeSqlQuery = sqlQuery.replace(/@lastSync/gi, "'1900-01-01'");
          const testQuery = applyQueryLimit(safeSqlQuery, validationConnection.adapterType, 10);

          let testRows: Record<string, unknown>[] = [];
          try {
            const result = await executeQueryOnConnection(
              validationConnection.adapterType,
              validationConnection.config,
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
          const validation = await validateQueryAgainstSchema(testRows, entityTypeToTableName(entityType));

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
            entityType,
            sqlQuery,
            incrementalField: incrementalField || null,
            incrementalType: normalizedIncrementalType || null,  // Ya convertido: 'date' o null
            joinField: joinField || null,
            connectionId: parsedConnectionId,
            isActive: isActiveBoolean,
            isScheduled: isScheduledBoolean,
            syncInterval: syncIntervalNumber,
          });

          logger.info(`Query actualizada: ${name} (ID: ${resultQueryId}, connectionId: ${parsedConnectionId ?? 'default'})`);
        } else {
          resultQueryId = await createQuery({
            entityType,
            name,
            sqlQuery,
            incrementalField: incrementalField || undefined,
            incrementalType: normalizedIncrementalType || undefined,  // Ya convertido: 'date' o undefined
            joinField: joinField || undefined,
            connectionId: parsedConnectionId,
            isActive: isActiveBoolean,
            isScheduled: isScheduledBoolean,
            syncInterval: syncIntervalNumber,
          });

          logger.info(`Query creada: ${name} (ID: ${resultQueryId}, connectionId: ${parsedConnectionId ?? 'default'})`);
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
   *
   * Si se especifica connectionId, usa esa conexión.
   * Si no, usa la conexión activa global.
   */
  app.post<{
    Body: {
      sqlQuery: string;
      incrementalField?: string;
      incrementalType?: 'datetime' | 'number' | 'string' | '';
      connectionId?: string;
    };
  }>(
    '/api/queries/test',
    { preHandler: requireNoPasswordChange, schema: testQuerySchema },
    async (
      request,
      reply
    ) => {
      try {
        const { sqlQuery, connectionId } = request.body;

        // Parse connectionId (empty string = null = use active connection)
        const parsedConnectionId = connectionId && connectionId.trim() !== ''
          ? parseInt(connectionId, 10)
          : null;

        logger.info({ connectionId: parsedConnectionId ?? 'active' }, 'Test de query solicitado');

        // Get connection to use: specific or active
        let connection: { adapterType: string; config: Record<string, unknown>; name: string } | null = null;

        if (parsedConnectionId !== null) {
          // Use specific connection
          if (isNaN(parsedConnectionId)) {
            return reply.type('text/html').send(`
              <div class="bg-red-50 border border-red-200 rounded p-3">
                <div class="flex items-center">
                  <i data-lucide="alert-circle" class="h-4 w-4 text-red-600 mr-2"></i>
                  <p class="text-sm text-red-800">ID de conexión inválido</p>
                </div>
              </div>
            `);
          }

          const conn = await getConnectionById(parsedConnectionId);
          if (!conn) {
            return reply.type('text/html').send(`
              <div class="bg-red-50 border border-red-200 rounded p-3">
                <div class="flex items-center">
                  <i data-lucide="alert-circle" class="h-4 w-4 text-red-600 mr-2"></i>
                  <p class="text-sm text-red-800">Conexión con ID ${parsedConnectionId} no encontrada</p>
                </div>
              </div>
            `);
          }

          const config = await getConnectionConfig(parsedConnectionId);
          connection = {
            adapterType: conn.adapterType,
            config,
            name: conn.name,
          };
        } else {
          // Use active connection
          const activeConn = await getActiveConnectionConfig();
          if (activeConn) {
            connection = {
              adapterType: activeConn.adapterType,
              config: activeConn.config,
              name: activeConn.name,
            };
          }
        }

        if (!connection) {
          const html = `
            <div class="bg-yellow-50 border border-yellow-200 rounded p-3">
              <div class="flex items-center">
                <i data-lucide="alert-circle" class="h-4 w-4 text-yellow-600 mr-2"></i>
                <p class="text-sm text-yellow-800">
                  No hay una conexión ${parsedConnectionId ? 'especificada' : 'activa'} configurada. Por favor, ${parsedConnectionId ? 'verifica la conexión' : 'activa una conexión primero'}.
                </p>
              </div>
            </div>
          `;
          return reply.type('text/html').send(html);
        }

        // Reemplazar @lastSync con una fecha muy antigua para pruebas
        // Esto permite probar consultas con @lastSync sin error
        const testSqlQuery = sqlQuery.replace(/@lastSync/gi, "'1900-01-01'");

        // Ejecutar query
        const result = await executeQueryOnConnection(
          connection.adapterType,
          connection.config,
          testSqlQuery
        );

        // Generar HTML con resultados
        const html = `
          <div class="space-y-3">
            <div class="flex items-center justify-between pb-2 border-b border-gray-200">
              <div class="flex items-center text-sm">
                <i data-lucide="check-circle" class="h-4 w-4 text-green-600 mr-2"></i>
                <span class="font-medium text-gray-700">Consulta ejecutada exitosamente</span>
                <span class="ml-2 px-2 py-0.5 text-xs bg-blue-100 text-blue-700 rounded">${escapeHtml(connection.name)}</span>
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
   * POST /api/queries/get-date-columns - Obtener columnas de tipo fecha de una query
   * Detecta campos de fecha analizando los valores devueltos por la consulta
   */
  app.post<{
    Body: {
      sqlQuery: string;
    };
  }>(
    '/api/queries/get-date-columns',
    { preHandler: requireNoPasswordChange },
    async (request, reply) => {
      try {
        const { sqlQuery } = request.body;

        if (!sqlQuery?.trim()) {
          return reply.status(400).send({
            success: false,
            error: 'sqlQuery es requerido'
          });
        }

        // Obtener conexión activa
        const activeConnection = await getActiveConnectionConfig();

        if (!activeConnection) {
          return reply.status(400).send({
            success: false,
            error: 'No hay una conexión activa configurada'
          });
        }

        // Ejecutar query con TOP 5 para obtener datos de muestra
        // Reemplazar @lastSync con una fecha dummy para que no falle
        const testQuery = sqlQuery
          .replace(/SELECT/i, 'SELECT TOP 5')
          .replace(/@lastSync/gi, "'1900-01-01'");

        const result = await executeQueryOnConnection(
          activeConnection.adapterType,
          activeConnection.config,
          testQuery
        );

        // Detectar columnas de fecha analizando los valores
        const dateColumns: string[] = [];
        const rows = result.rows as Record<string, unknown>[];

        if (rows.length > 0) {
          const firstRow = rows[0];

          if (firstRow) {
            for (const [colName, value] of Object.entries(firstRow)) {
              // Detectar si es un campo de fecha
              if (isDateValue(value)) {
                dateColumns.push(colName);
              }
            }
          }
        }

        logger.info({ dateColumns, rowCount: rows.length }, '[API] Columnas de fecha detectadas');

        return reply.send({
          success: true,
          dateColumns
        });
      } catch (error) {
        logger.error({ error }, '[API] Error al obtener columnas de fecha');
        return reply.status(500).send({
          success: false,
          error: error instanceof Error ? error.message : 'Error al ejecutar consulta'
        });
      }
    }
  );

  /**
   * Detecta si un valor es de tipo fecha/datetime
   */
  function isDateValue(value: unknown): boolean {
    if (value === null || value === undefined) {
      return false;
    }

    // Si es un objeto Date
    if (value instanceof Date) {
      return true;
    }

    // Si es un string que parece fecha ISO (2024-05-18T06:52:58.717)
    if (typeof value === 'string') {
      // Patrón ISO: YYYY-MM-DDTHH:MM:SS
      const isoPattern = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/;
      // Patrón fecha simple: YYYY-MM-DD
      const datePattern = /^\d{4}-\d{2}-\d{2}$/;

      if (isoPattern.test(value) || datePattern.test(value)) {
        // Verificar que sea una fecha válida
        const parsed = new Date(value);
        return !isNaN(parsed.getTime());
      }
    }

    return false;
  }

  /**
   * POST /api/queries/test-and-validate - Probar query y validar contra schema
   *
   * Si se especifica connectionId, usa esa conexión.
   * Si no, usa la conexión activa global.
   */
  app.post<{
    Body: {
      sqlQuery: string;
      entityType: EntityType;
      queryId?: number;
      connectionId?: string;
    };
  }>(
    '/api/queries/test-and-validate',
    { preHandler: requireNoPasswordChange },
    async (request, reply) => {
      try {
        const { sqlQuery, entityType, queryId, connectionId } = request.body;

        if (!sqlQuery || !entityType) {
          return reply.status(400).send({
            success: false,
            error: 'sqlQuery y entityType son requeridos'
          });
        }

        // Parse connectionId (empty string = null = use active connection)
        const parsedConnectionId = connectionId && connectionId.trim() !== ''
          ? parseInt(connectionId, 10)
          : null;

        logger.info({ entityType, queryId, connectionId: parsedConnectionId ?? 'active' }, '[API] Test and validate query solicitado');

        // Get connection to use: specific or active
        let connection: { adapterType: string; config: Record<string, unknown>; name: string } | null = null;

        if (parsedConnectionId !== null) {
          // Use specific connection
          if (isNaN(parsedConnectionId)) {
            return reply.status(400).send({
              success: false,
              error: 'ID de conexión inválido'
            });
          }

          const conn = await getConnectionById(parsedConnectionId);
          if (!conn) {
            return reply.status(400).send({
              success: false,
              error: `Conexión con ID ${parsedConnectionId} no encontrada`
            });
          }

          const config = await getConnectionConfig(parsedConnectionId);
          connection = {
            adapterType: conn.adapterType,
            config,
            name: conn.name,
          };
        } else {
          // Use active connection
          const activeConn = await getActiveConnectionConfig();
          if (activeConn) {
            connection = {
              adapterType: activeConn.adapterType,
              config: activeConn.config,
              name: activeConn.name,
            };
          }
        }

        if (!connection) {
          return reply.status(400).send({
            success: false,
            error: `No hay una conexión ${parsedConnectionId ? 'especificada' : 'activa'} configurada. Por favor, ${parsedConnectionId ? 'verifica la conexión' : 'activa una conexión primero'}.`
          });
        }

        // Información de sincronización incremental
        let lastSyncValue: string | null = null;
        let incrementalInfo: { field: string; lastSync: string } | null = null;

        // Si hay queryId, obtener info de sincronización
        if (queryId) {
          const { getLastSyncValue } = await import('../../../store/repositories/sync-state-repo.js');
          lastSyncValue = await getLastSyncValue(queryId);

          const query = await getQuery(queryId);
          if (query?.incrementalField && lastSyncValue) {
            incrementalInfo = {
              field: query.incrementalField,
              lastSync: lastSyncValue,
            };
          }
        }

        // Reemplazar @lastSync con una fecha muy antigua para pruebas
        const safeSqlQuery = sqlQuery.replace(/@lastSync/gi, "'1900-01-01'");

        // Ejecutar query de conteo total primero (sin filtro incremental)
        let totalCount = 0;
        try {
          const countQuery = `SELECT COUNT(*) as total FROM (${safeSqlQuery}) AS subquery`;
          const countResult = await executeQueryOnConnection(
            connection.adapterType,
            connection.config,
            countQuery
          );
          totalCount = (countResult.rows[0] as { total: number })?.total ?? 0;
        } catch {
          // Si falla el conteo, continuar sin él
          logger.warn('[API] No se pudo obtener conteo total');
        }

        // Ejecutar query con limite para muestra (syntax depends on adapter type)
        const testQuery = applyQueryLimit(safeSqlQuery, connection.adapterType, 10);

        const queryResult = await executeQueryOnConnection(
          connection.adapterType,
          connection.config,
          testQuery
        );

        // IMPORTANTE: Invalidar cache de schemas antes de validar para obtener
        // los schemas más recientes del gateway (reflejando cambios en PostgreSQL)
        const { schemaCache } = await import('../../../services/schema-cache.js');
        schemaCache.invalidate(); // Limpiar TODO el cache para forzar refresh desde gateway

        // Importar y usar el validator (ahora obtendrá schemas frescos del gateway)
        const { validateQueryResult } = await import('../../../sync/query-validator.js');
        const zodValidation = await validateQueryResult(queryResult.rows as Record<string, unknown>[], entityType);
        // NEW: Live schema validation
        const schemaValidation = await validateQueryAgainstSchema(
          queryResult.rows as Record<string, unknown>[],
          entityTypeToTableName(entityType)
        );

        // Retornar resultado
        return reply.send({
          success: true,
          rowCount: queryResult.rowCount,
          totalCount,  // Total de registros (sin LIMIT)
          connectionName: connection.name,  // Conexión utilizada
          incrementalInfo,  // Info de sync incremental si está configurado
          sampleData: zodValidation.sampleData,
          validation: {
            isValid: zodValidation.isValid && schemaValidation.isValid,
            requiredFields: zodValidation.requiredFields,
            optionalFields: zodValidation.optionalFields,
            validationErrors: zodValidation.validationErrors.slice(0, 20), // Limitar errores
            recommendations: zodValidation.recommendations,
            // NEW: Schema validation results
            schemaValidation: {
              isValid: schemaValidation.isValid,
              errors: schemaValidation.errors,
              warnings: schemaValidation.warnings,
              schemaUnavailable: schemaValidation.schemaUnavailable,
            },
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

  /**
   * GET /api/connections/dropdown - Lista de conexiones para selector en forms
   * Retorna solo id, name y adapterType para popular dropdowns
   */
  app.get(
    '/api/connections/dropdown',
    { preHandler: requireNoPasswordChange },
    async (_request: FastifyRequest, reply: FastifyReply) => {
      try {
        const connections = await getAllConnections();

        // Return simplified list for dropdown
        const dropdownData = connections.map((conn) => ({
          id: conn.id,
          name: conn.name,
          adapterType: conn.adapterType,
          isActive: conn.isActive,
        }));

        return reply.send({
          success: true,
          data: dropdownData,
        });
      } catch (error) {
        logger.error({ error }, 'Error al obtener conexiones para dropdown');
        return reply.status(500).send({
          success: false,
          error: 'Error al obtener conexiones',
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
