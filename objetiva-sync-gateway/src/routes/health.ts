/**
 * Health check endpoint for Kubernetes probes and monitoring
 * Returns 200 when healthy, 503 when degraded
 */

import type { FastifyInstance } from 'fastify'
import { prisma } from '../lib/prisma.js'
import { logger } from '../lib/logger.js'

interface HealthCheck {
  status: 'up' | 'down'
  latencyMs?: number
  error?: string
}

interface HealthResponse {
  status: 'healthy' | 'degraded'
  timestamp: string
  uptime: number
  checks: {
    database: HealthCheck
  }
}

/**
 * Check database connectivity with timeout
 */
async function checkDatabase(): Promise<HealthCheck> {
  const start = Date.now()
  try {
    await Promise.race([
      prisma.$queryRaw`SELECT 1`,
      new Promise((_, reject) =>
        setTimeout(() => reject(new Error('Database timeout')), 3000)
      )
    ])
    return { status: 'up', latencyMs: Date.now() - start }
  } catch (err) {
    const error = err instanceof Error ? err.message : 'Unknown error'
    logger.warn({ err }, 'Database health check failed')
    return { status: 'down', latencyMs: Date.now() - start, error }
  }
}

/**
 * Register health check routes
 */
export async function registerHealthRoutes(app: FastifyInstance): Promise<void> {
  // Track server closing state for graceful shutdown
  let isClosing = false
  app.addHook('onClose', async () => {
    isClosing = true
  })

  app.get('/health', async (_request, reply) => {
    // Return 503 during shutdown to prevent traffic to dying pods
    if (isClosing) {
      return reply.code(503).send({
        status: 'degraded',
        timestamp: new Date().toISOString(),
        uptime: process.uptime(),
        checks: { database: { status: 'down', error: 'Server shutting down' } }
      })
    }

    const database = await checkDatabase()
    const healthy = database.status === 'up'

    const response: HealthResponse = {
      status: healthy ? 'healthy' : 'degraded',
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      checks: { database }
    }

    return reply.code(healthy ? 200 : 503).send(response)
  })
}
