import type { FastifyInstance } from 'fastify'
import { register } from '../lib/prometheus.js'

export async function registerMetricsRoutes(app: FastifyInstance) {
  app.get('/metrics', async (request, reply) => {
    try {
      reply.header('Content-Type', register.contentType)
      const metrics = await register.metrics()
      return reply.send(metrics)
    } catch (err) {
      request.log.error({ err }, 'Failed to collect metrics')
      return reply.code(500).send({ error: 'Failed to collect metrics' })
    }
  })
}
