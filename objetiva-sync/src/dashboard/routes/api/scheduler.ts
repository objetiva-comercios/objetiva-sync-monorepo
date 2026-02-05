/**
 * API endpoints para gestión del scheduler automático
 */

import type { FastifyInstance } from 'fastify';
import { requireNoPasswordChange } from '../../middleware/auth.js';
import { ConfigRepo } from '../../../store/repositories/index.js';
import { getScheduler, restartScheduler, stopScheduler } from '../../../sync/scheduler-instance.js';
import { CONFIG_KEYS } from '../../../config/constants.js';
import { logger } from '../../../utils/logger.js';

/**
 * Genera HTML para el estado del scheduler
 */
function generateStatusHTML(enabled: boolean, interval: number, jobs: any[], error?: string): string {
  const formatDate = (date: string | null) => {
    if (!date) return '<span class="text-gray-400">Nunca</span>';
    return new Date(date).toLocaleString('es-AR', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  const getEntityName = (entityType: string) => {
    switch (entityType) {
      case 'articulo': return 'Artículos';
      case 'comprobante': return 'Comprobantes';
      case 'pago': return 'Pagos';
      case 'retries': return 'Reintentos';
      case 'cleanup': return 'Limpieza';
      default: return entityType;
    }
  };

  const jobsTableHTML = enabled && jobs.length > 0 ? `
    <div class="mt-6">
      <h4 class="text-sm font-medium mb-3">Jobs Programados</h4>
      <div class="overflow-x-auto">
        <table class="table table-zebra w-full">
          <thead>
            <tr>
              <th>TIPO</th>
              <th>INTERVALO</th>
              <th>ÚLTIMA EJECUCIÓN</th>
              <th>PRÓXIMA EJECUCIÓN</th>
              <th>ESTADO</th>
            </tr>
          </thead>
          <tbody>
            ${jobs.map(job => `
              <tr>
                <td class="font-medium">${getEntityName(job.entityType)}</td>
                <td>${job.intervalMinutes} min</td>
                <td>${formatDate(job.lastRun)}</td>
                <td>${formatDate(job.nextRun)}</td>
                <td>
                  ${job.enabled
                    ? '<span class="badge badge-success">Activo</span>'
                    : '<span class="badge badge-ghost">Inactivo</span>'}
                </td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      </div>
    </div>
  ` : !enabled ? `
    <div class="alert alert-warning mt-4">
      <svg xmlns="http://www.w3.org/2000/svg" class="stroke-current shrink-0 h-6 w-6" fill="none" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" /></svg>
      <div>
        <h3 class="font-bold">Scheduler Desactivado</h3>
        <p class="text-sm">El scheduler automático está desactivado. Configure un intervalo mayor a 0 para activar la sincronización automática.</p>
      </div>
    </div>
  ` : '';

  return `
    <div class="card bg-base-100 shadow-xl">
      <div class="card-body">
        <div class="flex items-center justify-between mb-4">
          <h3 class="card-title">Estado del Scheduler</h3>
          ${enabled
            ? '<span class="badge badge-success gap-2"><svg class="w-2 h-2" fill="currentColor" viewBox="0 0 8 8"><circle cx="4" cy="4" r="3" /></svg>Activo</span>'
            : '<span class="badge badge-ghost gap-2"><svg class="w-2 h-2" fill="currentColor" viewBox="0 0 8 8"><circle cx="4" cy="4" r="3" /></svg>Inactivo</span>'}
        </div>
        <div class="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <div class="text-sm opacity-60">Intervalo de Sincronización</div>
            <div class="mt-1 text-sm font-medium">${interval > 0 ? `Cada ${interval} minutos` : 'Desactivado'}</div>
          </div>
          <div>
            <div class="text-sm opacity-60">Jobs Activos</div>
            <div class="mt-1 text-sm font-medium">${jobs.length}</div>
          </div>
        </div>
        ${error ? `<div class="alert alert-error mt-4"><svg xmlns="http://www.w3.org/2000/svg" class="stroke-current shrink-0 h-6 w-6" fill="none" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2m7-2a9 9 0 11-18 0 9 9 0 0118 0z" /></svg><span>${error}</span></div>` : ''}
        ${jobsTableHTML}
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
        const syncIntervalConfig = await ConfigRepo.getConfig(CONFIG_KEYS.SYNC_INTERVAL_MINUTES);
        const interval = syncIntervalConfig?.value ? parseInt(syncIntervalConfig.value, 10) : 0;

        let jobs: any[] = [];
        let enabled = false;

        if (scheduler && interval > 0) {
          enabled = true;
          jobs = scheduler.getJobs().map((job) => ({
            jobId: job.id,
            entityType: job.entityType,
            intervalMinutes: Math.round(job.intervalSeconds / 60),
            enabled: job.enabled,
            lastRun: job.lastRun,
            nextRun: job.nextRun,
          }));
        }

        // Generar HTML del status
        const html = generateStatusHTML(enabled, interval, jobs);
        return reply.type('text/html').send(html);
      } catch (error) {
        logger.error({ error }, '[API] Error al obtener estado del scheduler');
        const html = generateStatusHTML(false, 0, [], 'Error al obtener estado del scheduler');
        return reply.type('text/html').send(html);
      }
    }
  );

  /**
   * PUT /api/scheduler/interval - Actualizar intervalo de sincronización
   */
  app.put(
    '/api/scheduler/interval',
    { preHandler: requireNoPasswordChange },
    async (request, reply) => {
      try {
        const body = request.body as { interval: number };
        const interval = body.interval;

        if (interval === undefined || interval === null) {
          return reply.status(400).send({
            success: false,
            error: 'Intervalo requerido',
          });
        }

        if (interval < 0 || interval > 1440) {
          return reply.status(400).send({
            success: false,
            error: 'Intervalo debe estar entre 0 y 1440 minutos',
          });
        }

        // Guardar en configuración
        await ConfigRepo.setConfig(CONFIG_KEYS.SYNC_INTERVAL_MINUTES, String(interval));

        // Reiniciar scheduler con nueva configuración
        await restartScheduler();

        logger.info({ interval }, '[API] Intervalo de sincronización actualizado');

        return reply.send({
          success: true,
          message: `Intervalo actualizado a ${interval} minutos`,
        });
      } catch (error) {
        logger.error({ error }, '[API] Error al actualizar intervalo');
        return reply.status(500).send({
          success: false,
          error: 'Error al actualizar intervalo',
        });
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

        // Actualizar config a 0 (desactivado)
        await ConfigRepo.setConfig(CONFIG_KEYS.SYNC_INTERVAL_MINUTES, '0');

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
