/**
 * Server-Sent Events endpoint for real-time log streaming
 * Broadcasts new sync logs to connected dashboard clients
 */

import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { EventEmitter } from 'node:events';
import { requireNoPasswordChange } from '../../middleware/auth.js';
import type { SyncLog } from '../../../store/schema.js';

// Singleton event emitter for log broadcasting
export const logEventEmitter = new EventEmitter();
logEventEmitter.setMaxListeners(50); // Support multiple dashboard connections

interface StreamQuery {
  entityType?: string;
  status?: string;
}

export async function registerLogStreamRoutes(app: FastifyInstance) {
  app.get('/api/logs/stream', {
    preHandler: requireNoPasswordChange
  }, async (request: FastifyRequest<{ Querystring: StreamQuery }>, reply: FastifyReply) => {
    const { entityType, status } = request.query;

    // Set SSE headers
    reply.raw.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
      'X-Accel-Buffering': 'no' // Disable nginx buffering
    });

    // Send initial connection confirmation
    reply.raw.write(`event: connected\ndata: ${JSON.stringify({ message: 'Log stream connected', filters: { entityType, status } })}\n\n`);

    // Handler for new log events
    const handler = (log: SyncLog) => {
      // Apply filters
      if (entityType && log.entityType !== entityType) return;
      if (status && log.status !== status) return;

      const data = {
        id: log.id,
        entityType: log.entityType,
        queryName: log.queryName,
        status: log.status,
        recordsFetched: log.recordsFetched,
        recordsSent: log.recordsSent,
        recordsFailed: log.recordsFailed,
        durationMs: log.durationMs,
        errorMessage: log.errorMessage,
        createdAt: log.createdAt
      };

      reply.raw.write(`event: log\ndata: ${JSON.stringify(data)}\nid: ${log.id}\n\n`);
    };

    // Heartbeat every 15 seconds per CONTEXT.md
    const heartbeat = setInterval(() => {
      reply.raw.write(`: heartbeat\n\n`);
    }, 15000);

    // Subscribe to log events
    logEventEmitter.on('newLog', handler);

    // Cleanup on disconnect
    request.raw.on('close', () => {
      clearInterval(heartbeat);
      logEventEmitter.off('newLog', handler);
    });

    // Keep connection open (don't call reply.send())
  });
}
