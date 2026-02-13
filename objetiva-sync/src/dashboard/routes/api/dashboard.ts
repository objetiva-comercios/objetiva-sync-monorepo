/**
 * API endpoints para estadísticas del dashboard
 * Proporciona datos para gráficos y métricas
 */

import type { FastifyInstance } from 'fastify';
import { requireAuthApi } from '../../middleware/auth.js';
import { getDatabase } from '../../../store/index.js';
import { syncLogs } from '../../../store/schema.js';
import { sql, gte } from 'drizzle-orm';
import { logger } from '../../../utils/logger.js';

/**
 * Registra las rutas de API del dashboard
 */
export async function registerDashboardApiRoutes(app: FastifyInstance) {
  /**
   * GET /api/dashboard/stats - Estadísticas para gráficos del dashboard
   */
  app.get(
    '/api/dashboard/stats',
    { preHandler: requireAuthApi },
    async (_request, reply) => {
      try {
        const db = getDatabase();

        // Calculate dates
        const now = new Date();
        const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
        const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

        // Get sync status stats (last 7 days)
        const syncStatusResult = await db
          .select({
            status: syncLogs.status,
            count: sql<number>`count(*)`.as('count'),
          })
          .from(syncLogs)
          .where(gte(syncLogs.createdAt, sevenDaysAgo.toISOString()))
          .groupBy(syncLogs.status);

        const syncStatus = {
          success: 0,
          failed: 0,
          partial: 0,
        };

        syncStatusResult.forEach((row) => {
          if (row.status === 'success') syncStatus.success = Number(row.count);
          else if (row.status === 'failed') syncStatus.failed = Number(row.count);
          else if (row.status === 'partial') syncStatus.partial = Number(row.count);
        });

        // Get records by entity (last 7 days)
        const recordsByEntityResult = await db
          .select({
            entityType: syncLogs.entityType,
            totalSent: sql<number>`sum(${syncLogs.recordsSent})`.as('totalSent'),
          })
          .from(syncLogs)
          .where(gte(syncLogs.createdAt, sevenDaysAgo.toISOString()))
          .groupBy(syncLogs.entityType);

        const recordsByEntity: Record<string, number> = {
          articulo: 0,
          comprobante: 0,
          pago: 0,
        };

        recordsByEntityResult.forEach((row) => {
          if (row.entityType && row.totalSent !== null) {
            recordsByEntity[row.entityType] = Number(row.totalSent);
          }
        });

        // Get syncs per day (last 30 days)
        const syncsPerDayResult = await db
          .select({
            date: sql<string>`date(${syncLogs.createdAt})`.as('date'),
            status: syncLogs.status,
            count: sql<number>`count(*)`.as('count'),
          })
          .from(syncLogs)
          .where(gte(syncLogs.createdAt, thirtyDaysAgo.toISOString()))
          .groupBy(sql`date(${syncLogs.createdAt})`, syncLogs.status)
          .orderBy(sql`date(${syncLogs.createdAt})`);

        // Process syncs per day data
        const syncsPerDayMap = new Map<string, { date: string; success: number; failed: number }>();

        syncsPerDayResult.forEach((row) => {
          const dateKey = row.date;
          if (!syncsPerDayMap.has(dateKey)) {
            syncsPerDayMap.set(dateKey, {
              date: dateKey,
              success: 0,
              failed: 0,
            });
          }

          const dayData = syncsPerDayMap.get(dateKey)!;
          if (row.status === 'success') {
            dayData.success = Number(row.count);
          } else if (row.status === 'failed') {
            dayData.failed = Number(row.count);
          }
        });

        const syncsPerDay = Array.from(syncsPerDayMap.values());

        return reply.send({
          success: true,
          data: {
            syncStatus,
            recordsByEntity,
            syncsPerDay,
          },
        });
      } catch (error) {
        logger.error({ error }, 'Error al obtener estadísticas del dashboard');
        return reply.status(500).send({
          success: false,
          error: 'Error al obtener estadísticas',
        });
      }
    }
  );
}
