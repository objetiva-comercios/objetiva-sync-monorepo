/**
 * API endpoints para sincronización manual
 * Permite ejecutar sincronizaciones manualmente desde el dashboard
 */

import type { FastifyInstance } from 'fastify';
import { requireNoPasswordChange } from '../../middleware/auth.js';
import { getAllQueries, getQueriesOrdered, getQuery } from '../../../store/repositories/queries-repo.js';
import { getActiveConnectionConfig } from '../../../store/repositories/connection-config-repo.js';
import { getConfig } from '../../../store/repositories/config-repo.js';
import { decrypt } from '../../../utils/crypto.js';
import { createAdapter } from '../../../adapters/index.js';
import { APIClient } from '../../../api-client/index.js';
import { SyncEngine } from '../../../sync/index.js';
import type { SyncOptions } from '../../../sync/index.js';
import { EntityType, SyncType } from '../../../types/common.js';
import { logger } from '../../../utils/logger.js';
import { SYNC_CONFIG } from '../../../config/constants.js';
import { syncStateManager } from '../../../sync/sync-state-manager.js';
import { getSyncQueue } from '../../../sync/sync-queue-instance.js';
import { notifyGatewayCancellation } from '../../../services/gateway-client.js';
import { v4 as uuidv4 } from 'uuid';
import * as SyncStateRepo from '../../../store/repositories/sync-state-repo.js';
import * as SyncLogsRepo from '../../../store/repositories/sync-logs-repo.js';

/**
 * Registra las rutas de API de sincronización
 */
export async function registerSyncApiRoutes(app: FastifyInstance) {
  /**
   * GET /api/sync/available-entities - Obtener entidades disponibles para sincronizar (JSON)
   */
  app.get(
    '/api/sync/available-entities',
    { preHandler: requireNoPasswordChange },
    async (_request, reply) => {
      try {
        const queries = await getAllQueries();
        const activeQueries = queries.filter((q) => q.isActive);

        // Para cada entidad, verificar si tiene query y mappings
        const entities = [
          EntityType.ARTICULO,
          EntityType.COMPROBANTE_CABECERA,
          EntityType.COMPROBANTE_DETALLE,
          EntityType.COMPROBANTE_PAGO,
        ];

        const availableEntities = await Promise.all(
          entities.map(async (entityType) => {
            const query = activeQueries.find((q) => q.entityType === entityType);

            if (!query) {
              return {
                entityType,
                available: false,
                reason: 'Sin query activa',
              };
            }

            // FASE 3: Ya no se verifican mappings - validación directa contra schema
            return {
              entityType,
              available: true,
              queryId: query.id,
              queryName: query.name,
            };
          })
        );

        return reply.send({
          success: true,
          entities: availableEntities,
        });
      } catch (error) {
        logger.error({ error }, 'Error al obtener entidades disponibles');
        return reply.status(500).send({
          success: false,
          error: 'Error al obtener entidades disponibles',
        });
      }
    }
  );

  /**
   * GET /api/sync/available-queries - Obtener queries disponibles para sincronizar (query-based)
   */
  app.get(
    '/api/sync/available-queries',
    { preHandler: requireNoPasswordChange },
    async (_request, reply) => {
      try {
        const queries = await getQueriesOrdered(); // Ordenadas por displayOrder

        const availableQueries = queries
          .filter((q) => q.isActive)
          .map((q) => ({
            id: q.id,
            name: q.name,
            entityType: q.entityType,
            displayOrder: q.displayOrder,
            available: true,
          }));

        return reply.send({
          success: true,
          queries: availableQueries,
        });
      } catch (error) {
        logger.error({ error }, 'Error al obtener queries disponibles');
        return reply.status(500).send({
          success: false,
          error: 'Error al obtener queries disponibles',
        });
      }
    }
  );

  /**
   * GET /api/sync/queries - Obtener queries disponibles para sincronizar (HTML fragment)
   */
  app.get(
    '/api/sync/queries',
    { preHandler: requireNoPasswordChange },
    async (_request, reply) => {
      try {
        const queries = await getAllQueries();
        const activeQueries = queries.filter((q) => q.isActive);

        if (activeQueries.length === 0) {
          return reply.type('text/html').send(`
            <div class="text-center py-8 text-gray-500">
              <i data-lucide="inbox" class="h-12 w-12 mx-auto mb-2"></i>
              <p class="text-sm">No hay consultas activas</p>
              <p class="text-xs mt-1">Activa al menos una consulta en Configuración</p>
            </div>
          `);
        }

        // Agrupar por tipo de entidad
        const byEntity: Record<string, typeof queries> = {
          articulo: [],
          comprobante: [],
          pago: [],
        };

        activeQueries.forEach((q) => {
          if (q.entityType in byEntity) {
            byEntity[q.entityType].push(q);
          }
        });

        const html = `
          <div class="space-y-3">
            ${Object.entries(byEntity)
              .filter(([_, queries]) => queries.length > 0)
              .map(
                ([entityType, queries]) => `
              <div class="border border-gray-200 rounded-lg p-4">
                <div class="flex items-center justify-between mb-2">
                  <h4 class="text-sm font-medium text-gray-900">
                    ${entityType === 'articulo' ? '📦 Artículos' : entityType === 'comprobante' ? '📄 Comprobantes' : '💳 Pagos'}
                  </h4>
                  <span class="text-xs text-gray-500">${queries.length} ${queries.length === 1 ? 'consulta' : 'consultas'}</span>
                </div>
                ${queries
                  .map(
                    (q) => `
                  <div class="flex items-center justify-between py-2 text-sm">
                    <span class="text-gray-700">${escapeHtml(q.name)}</span>
                    <span class="text-xs text-gray-500">ID: ${q.id}</span>
                  </div>
                `
                  )
                  .join('')}
              </div>
            `
              )
              .join('')}
          </div>
        `;

        return reply.type('text/html').send(html);
      } catch (error) {
        logger.error({ error }, 'Error al listar queries para sync');
        return reply.status(500).type('text/html').send(`
          <div class="text-center py-8 text-red-600">
            <i data-lucide="alert-circle" class="h-8 w-8 mx-auto mb-2"></i>
            <p class="text-sm">Error al cargar consultas</p>
          </div>
        `);
      }
    }
  );

  /**
   * POST /api/sync/execute - Ejecutar sincronización manual
   */
  app.post<{
    Body: {
      entities: string[]; // ['articulo', 'comprobante', 'pago']
      fullSync?: boolean;
    };
  }>(
    '/api/sync/execute',
    { preHandler: requireNoPasswordChange },
    async (request, reply) => {
      try {
        const { entities, fullSync } = request.body;

        if (!entities || entities.length === 0) {
          return reply.status(400).send({
            success: false,
            error: 'Debes seleccionar al menos una entidad para sincronizar',
          });
        }

        logger.info({ entities, fullSync }, 'Ejecutando sincronización manual');

        // Verificar configuraciones
        const activeConnection = await getActiveConnectionConfig();
        if (!activeConnection) {
          return reply.status(400).send({
            success: false,
            error: 'No hay una conexión ERP activa configurada',
          });
        }

        // Verificar configuración de API remota
        const [apiUrl, apiUsername, apiPassword] = await Promise.all([
          getConfig('REMOTE_API_URL'),
          getConfig('REMOTE_API_USERNAME'),
          getConfig('REMOTE_API_PASSWORD'),
        ]);

        if (!apiUrl || !apiUsername || !apiPassword) {
          return reply.status(400).send({
            success: false,
            error: 'La API remota no está configurada completamente',
          });
        }

        // Crear adaptador de base de datos
        const adapter = createAdapter(activeConnection.adapterType, activeConnection.config);

        try {
          // Conectar al adaptador (pasarle la configuración)
          await adapter.connect(activeConnection.config);
          logger.info('Adaptador de base de datos conectado para sincronización manual');

          // Crear cliente de API
          const password = decrypt(apiPassword.value);

          // Log para debug (sin mostrar password completo)
          logger.info({
            baseUrl: apiUrl.value,
            username: apiUsername.value,
            passwordLength: password.length,
            passwordHint: password.length > 4 ? `${password.substring(0, 2)}...${password.substring(password.length - 2)}` : '***'
          }, 'Creando cliente API con credenciales');

          const apiClient = new APIClient({
            baseUrl: apiUrl.value,
            username: apiUsername.value,
            password: password,
          });

          // Crear motor de sincronización
          const syncEngine = new SyncEngine({
            dataSourceAdapter: adapter,
            apiClient: apiClient,
            delayBetweenBatches: SYNC_CONFIG.DELAY_BETWEEN_BATCHES_MS,
          });

          // Ejecutar sincronización según entidades seleccionadas
          const results = [];
          const syncOptions: SyncOptions = {
            fullSync: fullSync || false,
          };

          for (const entityType of entities) {
            try {
              let result;

              switch (entityType) {
                case 'articulo':
                  result = await syncEngine.syncArticulos(syncOptions);
                  break;
                case 'comprobante_cabecera':
                  result = await syncEngine.syncComprobantesCabecera(syncOptions);
                  break;
                case 'comprobante_detalle':
                  result = await syncEngine.syncComprobantesDetalle(syncOptions);
                  break;
                case 'comprobante_pago':
                  result = await syncEngine.syncComprobantesPago(syncOptions);
                  break;
                default:
                  logger.warn({ entityType }, 'Tipo de entidad desconocido');
                  continue;
              }

              results.push({
                entityType,
                ...result,
              });
            } catch (error) {
              logger.error({ error, entityType }, 'Error en sincronización de entidad');
              results.push({
                entityType,
                status: 'failed',
                error: error instanceof Error ? error.message : String(error),
              });
            }
          }

          // Calcular resumen
          const totalSuccess = results.filter((r) => r.status === 'success').length;
          const totalFailed = results.filter((r) => r.status === 'failed').length;
          const totalRecords = results.reduce((sum, r) => sum + (r.recordsProcessed || 0), 0);
          const totalSent = results.reduce((sum, r) => sum + (r.recordsSent || 0), 0);

          logger.info(
            { totalSuccess, totalFailed, totalRecords, totalSent },
            'Sincronización manual completada'
          );

          return reply.send({
            success: true,
            summary: {
              totalEntities: results.length,
              successful: totalSuccess,
              failed: totalFailed,
              totalRecords,
              totalSent,
            },
            results,
          });
        } finally {
          // Siempre desconectar el adaptador
          await adapter.disconnect();
          logger.info('Adaptador de base de datos desconectado');
        }
      } catch (error) {
        logger.error({ error }, 'Error al ejecutar sincronización');
        return reply.status(500).send({
          success: false,
          error: error instanceof Error ? error.message : 'Error al ejecutar sincronización',
        });
      }
    }
  );

  /**
   * GET /api/sync/status - Obtener estado de configuración (HTML fragment)
   */
  app.get(
    '/api/sync/status',
    { preHandler: requireNoPasswordChange },
    async (_request, reply) => {
      try {
        // Verificar configuraciones
        const activeConnection = await getActiveConnectionConfig();
        const [apiUrl, activeQueries] = await Promise.all([
          getConfig('REMOTE_API_URL'),
          getAllQueries().then((qs) => qs.filter((q) => q.isActive)),
        ]);

        const hasConnection = !!activeConnection;
        const hasApi = !!apiUrl;
        const hasQueries = activeQueries.length > 0;
        const isReady = hasConnection && hasApi && hasQueries;

        let statusClass = '';
        let iconName = '';
        let title = '';
        let description = '';
        const issues = [];

        if (!hasConnection) issues.push('Sin conexión ERP activa');
        if (!hasApi) issues.push('API remota no configurada');
        if (!hasQueries) issues.push('Sin consultas activas');

        if (isReady) {
          statusClass = 'bg-green-50 border-green-400';
          iconName = 'check-circle';
          title = 'Sistema listo para sincronizar';
          description = `${activeQueries.length} ${activeQueries.length === 1 ? 'consulta activa' : 'consultas activas'}`;
        } else {
          statusClass = 'bg-yellow-50 border-yellow-400';
          iconName = 'alert-triangle';
          title = 'Configuración incompleta';
          description = issues.join(', ');
        }

        const html = `
          <div class="${statusClass} border-l-4 p-4">
            <div class="flex">
              <div class="flex-shrink-0">
                <i data-lucide="${iconName}" class="h-5 w-5 ${isReady ? 'text-green-400' : 'text-yellow-400'}"></i>
              </div>
              <div class="ml-3">
                <h3 class="text-sm font-medium ${isReady ? 'text-green-800' : 'text-yellow-800'}">
                  ${escapeHtml(title)}
                </h3>
                <div class="mt-1 text-sm ${isReady ? 'text-green-700' : 'text-yellow-700'}">
                  <p>${escapeHtml(description)}</p>
                </div>
                ${
                  !isReady
                    ? `
                  <div class="mt-3">
                    <a href="/config" class="text-sm font-medium text-yellow-700 hover:text-yellow-600">
                      Ir a Configuración →
                    </a>
                  </div>
                `
                    : ''
                }
              </div>
            </div>
          </div>
        `;

        return reply.type('text/html').send(html);
      } catch (error) {
        logger.error({ error }, 'Error al obtener estado de sync');
        return reply.status(500).type('text/html').send(`
          <div class="bg-red-50 border-l-4 border-red-400 p-4">
            <div class="flex">
              <div class="flex-shrink-0">
                <i data-lucide="alert-circle" class="h-5 w-5 text-red-400"></i>
              </div>
              <div class="ml-3">
                <h3 class="text-sm font-medium text-red-800">Error al cargar estado</h3>
              </div>
            </div>
          </div>
        `);
      }
    }
  );

  /**
   * GET /api/sync/stream - Ejecutar sincronización con actualizaciones de progreso vía SSE
   * Soporta dos modos:
   * - Legacy: ?entities=articulo,comprobante_cabecera
   * - Query-based: ?queryIds=1,2,3
   */
  app.get<{
    Querystring: {
      entities?: string;
      queryIds?: string;
      fullSync?: string;
      batchSize?: string;
    };
  }>(
    '/api/sync/stream',
    { preHandler: requireNoPasswordChange },
    async (request, reply) => {
      const { entities: entitiesParam, queryIds: queryIdsParam, fullSync, batchSize: batchSizeParam } = request.query;

      // Validar que se pase entities o queryIds
      if (!entitiesParam && !queryIdsParam) {
        reply.status(400).send({ error: 'Parámetro entities o queryIds requerido' });
        return;
      }

      // Modo query-based (nuevo)
      const useQueryMode = !!queryIdsParam;

      let entities: string[] = [];
      let queryIds: number[] = [];

      if (useQueryMode) {
        // Parsear queryIds
        queryIds = queryIdsParam!.split(',').map(id => parseInt(id.trim(), 10)).filter(id => !isNaN(id));

        if (queryIds.length === 0) {
          reply.status(400).send({ error: 'Debes seleccionar al menos una query' });
          return;
        }
      } else {
        // Modo legacy (entities)
        entities = entitiesParam!.split(',').filter(e => e.trim());

        if (entities.length === 0) {
          reply.status(400).send({ error: 'Debes seleccionar al menos una entidad' });
          return;
        }
      }

      // Parsear y validar batchSize
      const batchSize = batchSizeParam ? parseInt(batchSizeParam, 10) : 100;
      if (isNaN(batchSize) || batchSize < 1 || batchSize > 5000) {
        reply.status(400).send({ error: 'batchSize debe ser un número entre 1 y 5000' });
        return;
      }

      // Generar ID único para este sync
      const syncId = uuidv4();

      logger.info({ syncId, entities, fullSync, batchSize }, 'Iniciando sincronización con SSE');

      // Configurar headers para SSE
      reply.raw.writeHead(200, {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
      });

      // SSE heartbeat mechanism - keep connection alive through proxies
      const HEARTBEAT_INTERVAL_MS = 15_000;
      const heartbeatTimer = setInterval(() => {
        try {
          reply.raw.write(': heartbeat\n\n');
        } catch {
          clearInterval(heartbeatTimer);
        }
      }, HEARTBEAT_INTERVAL_MS);

      // Cleanup on connection close
      request.raw.on('close', () => {
        clearInterval(heartbeatTimer);
      });


      // Función para enviar eventos SSE
      const sendEvent = (event: string, data: any) => {
        reply.raw.write(`event: ${event}\n`);
        reply.raw.write(`data: ${JSON.stringify(data)}\n\n`);
      };

      // Enviar syncId al cliente
      sendEvent('start', { syncId });

      try {
        // Verificar configuraciones
        const activeConnection = await getActiveConnectionConfig();
        if (!activeConnection) {
          sendEvent('error', { error: 'No hay una conexión ERP activa configurada' });
          clearInterval(heartbeatTimer);
          reply.raw.end();
          return;
        }

        const [apiUrl, apiUsername, apiPassword] = await Promise.all([
          getConfig('REMOTE_API_URL'),
          getConfig('REMOTE_API_USERNAME'),
          getConfig('REMOTE_API_PASSWORD'),
        ]);

        if (!apiUrl || !apiUsername || !apiPassword) {
          sendEvent('error', { error: 'La API remota no está configurada completamente' });
          clearInterval(heartbeatTimer);
          reply.raw.end();
          return;
        }

        // Crear adaptador y cliente
        const adapter = createAdapter(activeConnection.adapterType, activeConnection.config);
        await adapter.connect(activeConnection.config);

        const password = decrypt(apiPassword.value);
        const apiClient = new APIClient({
          baseUrl: apiUrl.value,
          username: apiUsername.value,
          password: password,
        });

        // Crear motor de sincronización con callback de progreso
        const syncEngine = new SyncEngine({
          dataSourceAdapter: adapter,
          apiClient: apiClient,
          delayBetweenBatches: SYNC_CONFIG.DELAY_BETWEEN_BATCHES_MS,
          onProgress: (progressData) => {
            // Enviar evento SSE
            sendEvent('progress', {
              ...progressData,
              syncType: progressData.syncType || (fullSync === 'true' ? 'full' : 'incremental'),
            });

            // Actualizar estado global
            syncStateManager.updateProgress({
              processedRecords: progressData.current || 0,
              successRecords: progressData.current || 0,
              totalRecords: progressData.total,
            });
          },
        });

        const results = [];
        const syncOptions: SyncOptions = {
          fullSync: fullSync === 'true',
          batchSize: batchSize,
        };

        // MODO QUERY-BASED (nuevo)
        if (useQueryMode) {
          // Obtener queries y ordenar por displayOrder
          const queries = await Promise.all(queryIds.map(id => getQuery(id)));
          const validQueries = queries.filter(q => q !== null && q.isActive);

          if (validQueries.length === 0) {
            sendEvent('error', { error: 'No se encontraron queries activas válidas' });
            clearInterval(heartbeatTimer);
            reply.raw.end();
            return;
          }

          // Ordenar por displayOrder
          const orderedQueries = validQueries.sort((a, b) => (a!.displayOrder || 0) - (b!.displayOrder || 0));

          // Iniciar estado para la primera query
          const firstQuery = orderedQueries[0]!;
          syncStateManager.startSync({
            syncId,
            entityType: firstQuery.entityType as EntityType,
            syncType: fullSync === 'true' ? SyncType.FULL : SyncType.INCREMENTAL,
            queryId: firstQuery.id,
          });

          // Ejecutar cada query en orden
          for (const query of orderedQueries) {
            if (!query) continue;

            try {
              logger.info({ queryId: query.id, queryName: query.name }, 'Ejecutando sincronización de query');

              const result = await syncEngine.syncQuery(query.id, syncOptions, syncId);

              results.push({
                queryId: query.id,
                queryName: query.name,
                entityType: query.entityType,
                ...result,
              });

              logger.info(
                { queryId: query.id, queryName: query.name, recordsSent: result.recordsSent },
                'Query sincronizada exitosamente'
              );
            } catch (error) {
              logger.error({ error, queryId: query.id, queryName: query.name }, 'Error en sincronización de query');
              results.push({
                queryId: query.id,
                queryName: query.name,
                entityType: query.entityType,
                status: 'failed',
                error: error instanceof Error ? error.message : String(error),
              });
            }
          }
        }
        // MODO LEGACY (entities)
        else {
          // Iniciar estado para la primera entidad
          const firstEntity = entities[0] as EntityType;
          syncStateManager.startSync({
            syncId,
            entityType: firstEntity,
            syncType: fullSync === 'true' ? SyncType.FULL : SyncType.INCREMENTAL,
            queryId: 0, // Legacy mode
          });

          for (const entityType of entities) {
            try {
              let result;

              switch (entityType) {
                case 'articulo':
                  result = await syncEngine.syncArticulos(syncOptions);
                  break;
                case 'comprobante_cabecera':
                  result = await syncEngine.syncComprobantesCabecera(syncOptions);
                  break;
                case 'comprobante_detalle':
                  result = await syncEngine.syncComprobantesDetalle(syncOptions);
                  break;
                case 'comprobante_pago':
                  result = await syncEngine.syncComprobantesPago(syncOptions);
                  break;
                default:
                  logger.warn({ entityType }, 'Tipo de entidad desconocido');
                  continue;
              }

              results.push({
                entityType,
                ...result,
              });
            } catch (error) {
              logger.error({ error, entityType }, 'Error en sincronización de entidad');
              results.push({
                entityType,
                status: 'failed',
                error: error instanceof Error ? error.message : String(error),
              });
            }
          }
        }

        await adapter.disconnect();

        // Calcular resumen
        const totalSuccess = results.filter((r) => r.status === 'success').length;
        const totalFailed = results.filter((r) => r.status === 'failed').length;
        const totalRecords = results.reduce((sum, r) => sum + (r.recordsProcessed || 0), 0);
        const totalSent = results.reduce((sum, r) => sum + (r.recordsSent || 0), 0);

        // Determinar si la sincronización fue exitosa
        // Solo es exitosa si al menos una entidad tuvo éxito y ninguna falló
        const syncSuccess = totalSuccess > 0 && totalFailed === 0;

        // Enviar evento de completado
        sendEvent('complete', {
          syncType: fullSync === 'true' ? 'full' : 'incremental',
          success: syncSuccess,
          summary: {
            totalEntities: results.length,
            successful: totalSuccess,
            failed: totalFailed,
            totalRecords,
            totalSent,
          },
          results,
          error: !syncSuccess && totalFailed > 0 ? `${totalFailed} entidad(es) fallaron durante la sincronización` : undefined,
        });

        // Completar estado global
        syncStateManager.completeSync('completed');

        clearInterval(heartbeatTimer);
        reply.raw.end();
      } catch (error) {
        logger.error({ error }, 'Error en sincronización SSE');

        // Completar estado con error
        syncStateManager.completeSync('failed', error instanceof Error ? error.message : 'Error desconocido');

        sendEvent('error', {
          error: error instanceof Error ? error.message : 'Error desconocido',
        });
        clearInterval(heartbeatTimer);
        reply.raw.end();
      }
    }
  );

  /**
   * GET /api/sync/current-status - Obtener estado actual de sincronización en progreso
   */
  app.get(
    '/api/sync/current-status',
    { preHandler: requireNoPasswordChange },
    async (_request, reply) => {
      try {
        const currentSync = syncStateManager.getCurrentSync();

        if (!currentSync) {
          return reply.send({
            success: true,
            data: null,
            message: 'No hay sincronización en progreso',
          });
        }

        return reply.send({
          success: true,
          data: currentSync,
        });
      } catch (error) {
        logger.error({ error }, '[API] Error al obtener estado de sincronización');
        return reply.status(500).send({
          success: false,
          error: 'Error al obtener estado de sincronización',
        });
      }
    }
  );

  /**
   * GET /api/sync/queue-status - Obtener estado actual de la cola de sincronización
   */
  app.get(
    '/api/sync/queue-status',
    { preHandler: requireNoPasswordChange },
    async (_request, reply) => {
      try {
        const syncQueue = getSyncQueue();
        const status = syncQueue.getQueueStatus();

        return reply.send({
          success: true,
          currentSync: status.currentSync,
          queuedSyncs: status.queue,
          totalInQueue: status.totalInQueue,
          isProcessing: status.isProcessing,
        });
      } catch (error) {
        logger.error({ error }, '[API] Error al obtener estado de cola');
        return reply.status(500).send({
          success: false,
          error: 'Error al obtener estado de cola',
        });
      }
    }
  );

  /**
   * GET /api/sync/gateway-health - Verificar conexión con objetiva-sync-gateway
   */
  app.get(
    '/api/sync/gateway-health',
    { preHandler: requireNoPasswordChange },
    async (_request, reply) => {
      try {
        // Verificar configuración de API remota
        const [apiUrl, apiUsername, apiPassword] = await Promise.all([
          getConfig('REMOTE_API_URL'),
          getConfig('REMOTE_API_USERNAME'),
          getConfig('REMOTE_API_PASSWORD'),
        ]);

        if (!apiUrl || !apiUsername || !apiPassword) {
          return reply.send({
            success: false,
            connected: false,
            message: 'API remota no configurada',
          });
        }

        // Crear cliente de API
        const password = decrypt(apiPassword.value);
        const apiClient = new APIClient({
          baseUrl: apiUrl.value,
          username: apiUsername.value,
          password: password,
        });

        // Probar conexión
        const testResult = await apiClient.testConnection();

        return reply.send({
          success: true,
          connected: testResult.success,
          message: testResult.message,
          url: apiUrl.value,
        });
      } catch (error) {
        logger.error({ error }, '[API] Error al verificar conexión con gateway');
        return reply.send({
          success: false,
          connected: false,
          message: error instanceof Error ? error.message : 'Error al verificar conexión',
        });
      }
    }
  );

  /**
   * GET /api/sync/sync-state - Obtener estado de sincronizacion por entidad
   */
  app.get(
    '/api/sync/sync-state',
    { preHandler: requireNoPasswordChange },
    async (_request, reply) => {
      try {
        const allStates = await SyncStateRepo.getAllSyncStates();

        // Enrich with query names
        const enrichedStates = await Promise.all(
          allStates.map(async (state) => {
            const query = await getQuery(state.queryId);
            return {
              queryId: state.queryId,
              queryName: query?.name ?? 'Desconocida',
              entityType: state.entityType,
              lastSyncValue: state.lastSyncValue,
              lastSyncAt: state.lastSyncAt,
              lastSyncCount: state.lastSyncCount,
              totalSynced: state.totalSynced,
              status: state.status,
              errorMessage: state.errorMessage,
            };
          })
        );

        return reply.send({ success: true, data: enrichedStates });
      } catch (error) {
        logger.error({ error }, 'Error al obtener sync state');
        return reply.status(500).send({ success: false, error: 'Error al obtener estado de sincronizacion' });
      }
    }
  );

  /**
   * GET /api/sync/history - Obtener historial de sincronizaciones
   */
  app.get<{
    Querystring: {
      limit?: string;
      entityType?: string;
    };
  }>(
    '/api/sync/history',
    { preHandler: requireNoPasswordChange },
    async (request, reply) => {
      try {
        const limit = request.query.limit ? parseInt(request.query.limit, 10) : 20;
        const entityType = request.query.entityType as EntityType | undefined;

        const { logs } = await SyncLogsRepo.getLogs(
          { entityType: entityType || undefined },
          { limit: Math.min(limit, 100), offset: 0 }
        );

        // Format for dashboard display
        const history = logs
          .filter(log => log.status !== 'started') // Exclude in-progress entries
          .map(log => ({
            id: log.id,
            queryId: log.queryId,
            queryName: log.queryName,
            entityType: log.entityType,
            syncType: log.syncType,
            status: log.status,
            recordsFetched: log.recordsFetched,
            recordsSent: log.recordsSent,
            recordsFailed: log.recordsFailed,
            durationMs: log.durationMs,
            createdAt: log.createdAt,
          }));

        return reply.send({ success: true, data: history });
      } catch (error) {
        logger.error({ error }, 'Error al obtener historial de sync');
        return reply.status(500).send({ success: false, error: 'Error al obtener historial' });
      }
    }
  );

  /**
   * POST /api/sync/cancel - Cancelar sincronización en progreso
   */
  app.post<{ Body?: {} }>(
    '/api/sync/cancel',
    {
      preHandler: requireNoPasswordChange,
      schema: {
        body: {
          type: 'object',
          additionalProperties: true
        }
      }
    },
    async (_request, reply) => {
      try {
        logger.info('[API] 🛑 Recibida petición de cancelación');

        // Obtener syncId antes de cancelar para notificar al gateway
        const currentSync = syncStateManager.getCurrentSync();
        const syncId = currentSync?.syncId;

        // Cancelar en el sync state manager (aborta HTTP requests)
        syncStateManager.cancelSync();

        // Cancelar en el sync queue (marca como cancelado)
        const syncQueue = getSyncQueue();
        syncQueue.cancelCurrentSync();

        // Notificar al gateway (fire-and-forget, no bloquea la respuesta)
        if (syncId) {
          notifyGatewayCancellation(syncId).catch(() => {
            // Silenciar errores - el gateway timeout detectará igualmente
          });
        }

        logger.info('[API] ✅ Sincronización cancelada por el usuario');

        return reply.send({
          success: true,
          message: 'Sincronización cancelada',
        });
      } catch (error) {
        logger.error({ error }, '[API] ❌ Error al cancelar sincronización');
        return reply.status(500).send({
          success: false,
          error: 'Error al cancelar sincronización',
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
