import type { FastifyInstance } from 'fastify'
import { metrics } from '../lib/metrics.js'

export async function registerStatusRoutes(app: FastifyInstance) {
  /**
   * GET /api/status/recent - Endpoint JSON para obtener sincronizaciones recientes
   */
  app.get('/api/status/recent', async (_request, reply) => {
    const recent = metrics.getRecentEvents(15)
    return reply.send({
      success: true,
      syncs: recent.syncs,
      timestamp: Date.now()
    })
  })
}
