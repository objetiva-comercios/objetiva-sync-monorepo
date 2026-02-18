/**
 * API endpoints para gestión del scheduler automático
 */

import type { FastifyInstance } from 'fastify';
import { requireNoPasswordChange } from '../../middleware/auth.js';
import { getScheduler, restartScheduler, stopScheduler } from '../../../sync/scheduler-instance.js';
import { getScheduledQueries } from '../../../store/repositories/queries-repo.js';
import { logger } from '../../../utils/logger.js';

/**
 * Formatea intervalo en segundos a texto legible
 */
function formatInterval(seconds: number): string {
  if (seconds < 60) return `${seconds}s`;
  if (seconds < 3600) return `${Math.round(seconds / 60)} min`;
  const hours = Math.round(seconds / 3600);
  return `${hours} hora${hours > 1 ? 's' : ''}`;
}

/**
 * Formatea fecha para mostrar
 */
function formatDate(date: Date | string | null | undefined): string {
  if (!date) return '<span class="text-base-content/40">-</span>';
  const d = typeof date === 'string' ? new Date(date) : date;
  return d.toLocaleString('es-AR', {
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}

/**
 * Genera HTML para el estado del scheduler
 */
function generateStatusHTML(
  isRunning: boolean,
  scheduledQueries: Array<{ id: number; name: string; entityType: string; syncInterval: number; isScheduled: boolean }>,
  runningJobs: Array<{
    jobId: string;
    queryId?: number;
    queryName?: string;
    entityType: string;
    intervalSeconds: number;
    enabled: boolean;
    lastRun?: Date;
    nextRun?: Date;
  }>,
  error?: string
): string {
  // Filter to show only query-based jobs (not system jobs like retries/cleanup)
  const queryJobs = runningJobs.filter(job => job.queryId);
  const systemJobs = runningJobs.filter(job => !job.queryId);

  const hasScheduledQueries = scheduledQueries.length > 0;

  // Status badge
  const statusBadge = isRunning
    ? '<span class="badge badge-success gap-2"><span class="w-2 h-2 bg-green-500 rounded-full animate-pulse"></span>Ejecutando</span>'
    : '<span class="badge badge-ghost gap-2"><span class="w-2 h-2 bg-gray-400 rounded-full"></span>Detenido</span>';

  // Query jobs table
  const queryJobsHTML = queryJobs.length > 0 ? `
    <div class="mt-6">
      <h4 class="text-sm font-medium mb-3 flex items-center gap-2">
        <i data-lucide="database" class="w-4 h-4"></i>
        Jobs de Consultas (${queryJobs.length})
      </h4>
      <div class="overflow-x-auto">
        <table class="table table-sm w-full">
          <thead>
            <tr class="bg-base-200">
              <th>CONSULTA</th>
              <th>INTERVALO</th>
              <th>ÚLTIMA EJECUCIÓN</th>
              <th>PRÓXIMA EJECUCIÓN</th>
              <th>ESTADO</th>
            </tr>
          </thead>
          <tbody>
            ${queryJobs.map(job => `
              <tr>
                <td class="font-medium">${job.queryName || `Query #${job.queryId}`}</td>
                <td>${formatInterval(job.intervalSeconds)}</td>
                <td class="text-sm">${formatDate(job.lastRun)}</td>
                <td class="text-sm">${formatDate(job.nextRun)}</td>
                <td>
                  ${job.enabled
                    ? '<span class="badge badge-success badge-sm">Activo</span>'
                    : '<span class="badge badge-ghost badge-sm">Inactivo</span>'}
                </td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      </div>
    </div>
  ` : '';

  // System jobs table (retries, cleanup)
  const systemJobsHTML = systemJobs.length > 0 ? `
    <div class="mt-6">
      <h4 class="text-sm font-medium mb-3 flex items-center gap-2">
        <i data-lucide="settings" class="w-4 h-4"></i>
        Jobs de Sistema (${systemJobs.length})
      </h4>
      <div class="overflow-x-auto">
        <table class="table table-sm w-full">
          <thead>
            <tr class="bg-base-200">
              <th>TIPO</th>
              <th>INTERVALO</th>
              <th>ÚLTIMA EJECUCIÓN</th>
              <th>PRÓXIMA EJECUCIÓN</th>
            </tr>
          </thead>
          <tbody>
            ${systemJobs.map(job => {
              const typeName = job.entityType === 'retries' ? '🔄 Reintentos' :
                              job.entityType === 'cleanup' ? '🧹 Limpieza de Logs' :
                              job.entityType;
              return `
                <tr>
                  <td class="font-medium">${typeName}</td>
                  <td>${formatInterval(job.intervalSeconds)}</td>
                  <td class="text-sm">${formatDate(job.lastRun)}</td>
                  <td class="text-sm">${formatDate(job.nextRun)}</td>
                </tr>
              `;
            }).join('')}
          </tbody>
        </table>
      </div>
    </div>
  ` : '';

  // Warning if no scheduled queries
  const noQueriesWarning = !hasScheduledQueries ? `
    <div class="alert alert-warning mt-4">
      <i data-lucide="alert-triangle" class="w-5 h-5"></i>
      <div>
        <h3 class="font-bold">Sin Consultas Programadas</h3>
        <p class="text-sm">No hay consultas configuradas para ejecución automática. Ve a <a href="/config/queries" class="link">Consultas</a> y activa "Programar ejecución" en las consultas que deseas automatizar.</p>
      </div>
    </div>
  ` : '';

  // Scheduled queries list (from DB, for reference)
  const scheduledQueriesHTML = hasScheduledQueries ? `
    <div class="mt-6">
      <h4 class="text-sm font-medium mb-3 flex items-center gap-2">
        <i data-lucide="list-checks" class="w-4 h-4"></i>
        Consultas Programadas en BD (${scheduledQueries.length})
      </h4>
      <div class="flex flex-wrap gap-2">
        ${scheduledQueries.map(q => `
          <div class="badge badge-outline gap-2">
            <span class="font-medium">${q.name}</span>
            <span class="text-xs opacity-60">${formatInterval(q.syncInterval)}</span>
          </div>
        `).join('')}
      </div>
    </div>
  ` : '';

  // Error display
  const errorHTML = error ? `
    <div class="alert alert-error mt-4">
      <i data-lucide="x-circle" class="w-5 h-5"></i>
      <span>${error}</span>
    </div>
  ` : '';

  return `
    <div class="card bg-base-100 shadow-xl">
      <div class="card-body">
        <div class="flex items-center justify-between mb-4">
          <h3 class="card-title">
            <i data-lucide="calendar-clock" class="w-5 h-5"></i>
            Estado del Scheduler
          </h3>
          ${statusBadge}
        </div>

        <div class="stats stats-vertical lg:stats-horizontal shadow bg-base-200">
          <div class="stat">
            <div class="stat-title">Consultas Programadas</div>
            <div class="stat-value text-primary">${scheduledQueries.length}</div>
            <div class="stat-desc">En base de datos</div>
          </div>
          <div class="stat">
            <div class="stat-title">Jobs Activos</div>
            <div class="stat-value text-secondary">${runningJobs.length}</div>
            <div class="stat-desc">En memoria</div>
          </div>
        </div>

        ${errorHTML}
        ${noQueriesWarning}
        ${queryJobsHTML}
        ${systemJobsHTML}
        ${scheduledQueriesHTML}
      </div>
    </div>
  `;
}

/**
 * Registra las rutas de API del scheduler
 */
export async function registerSchedulerApiRoutes(app: FastifyInstance) {
  /**
   * GET /api/scheduler/status - Obtener estado del scheduler (HTML partial)
   */
  app.get(
    '/api/scheduler/status',
    { preHandler: requireNoPasswordChange },
    async (_request, reply) => {
      try {
        const scheduler = getScheduler();

        // Get scheduled queries from database
        const scheduledQueries = await getScheduledQueries();
        const queriesData = scheduledQueries.map(q => ({
          id: q.id,
          name: q.name,
          entityType: q.entityType,
          syncInterval: q.syncInterval ?? 1800,
          isScheduled: q.isScheduled ?? false,
        }));

        // Get running jobs from scheduler
        let runningJobs: Array<{
          jobId: string;
          queryId?: number;
          queryName?: string;
          entityType: string;
          intervalSeconds: number;
          enabled: boolean;
          lastRun?: Date;
          nextRun?: Date;
        }> = [];

        const isRunning = scheduler?.getStatus().isRunning ?? false;

        if (scheduler) {
          runningJobs = scheduler.getJobs().map(job => ({
            jobId: job.id,
            queryId: job.queryId,
            queryName: job.queryName,
            entityType: job.entityType as string,
            intervalSeconds: job.intervalSeconds,
            enabled: job.enabled,
            lastRun: job.lastRun,
            nextRun: job.nextRun,
          }));
        }

        // Generate HTML
        const html = generateStatusHTML(isRunning, queriesData, runningJobs);
        return reply.type('text/html').send(html);
      } catch (error) {
        logger.error({ error }, '[API] Error al obtener estado del scheduler');
        const html = generateStatusHTML(false, [], [], 'Error al obtener estado del scheduler');
        return reply.type('text/html').send(html);
      }
    }
  );

  /**
   * POST /api/scheduler/restart - Reiniciar scheduler
   */
  app.post(
    '/api/scheduler/restart',
    { preHandler: requireNoPasswordChange },
    async (_request, reply) => {
      try {
        await restartScheduler();

        logger.info('[API] Scheduler reiniciado');

        return reply.send({
          success: true,
          message: 'Scheduler reiniciado correctamente',
        });
      } catch (error) {
        logger.error({ error }, '[API] Error al reiniciar scheduler');
        return reply.status(500).send({
          success: false,
          error: 'Error al reiniciar scheduler',
        });
      }
    }
  );

  /**
   * POST /api/scheduler/stop - Detener scheduler
   */
  app.post(
    '/api/scheduler/stop',
    { preHandler: requireNoPasswordChange },
    async (_request, reply) => {
      try {
        stopScheduler();

        logger.info('[API] Scheduler detenido');

        return reply.send({
          success: true,
          message: 'Scheduler detenido correctamente',
        });
      } catch (error) {
        logger.error({ error }, '[API] Error al detener scheduler');
        return reply.status(500).send({
          success: false,
          error: 'Error al detener scheduler',
        });
      }
    }
  );
}
