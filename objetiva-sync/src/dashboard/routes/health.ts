/**
 * Health check endpoint for Kubernetes probes and monitoring
 * Returns 200 when healthy, 503 when degraded
 */

import type { FastifyInstance } from 'fastify'
import { logger } from '../../utils/logger.js'
import { getScheduler } from '../../sync/scheduler-instance.js'

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
    gateway?: HealthCheck
    scheduler?: HealthCheck
  }
}

/**
 * Check gateway connectivity with timeout
 */
async function checkGateway(gatewayUrl: string | undefined): Promise<HealthCheck> {
  if (!gatewayUrl) {
    return { status: 'down', error: 'Gateway URL not configured' }
  }
  const start = Date.now()
  try {
    const response = await fetch(`${gatewayUrl}/health`, {
      signal: AbortSignal.timeout(3000)
    })
    const latencyMs = Date.now() - start
    if (response.ok) {
      return { status: 'up', latencyMs }
    }
    return { status: 'down', latencyMs, error: `Gateway returned ${response.status}` }
  } catch (err) {
    const error = err instanceof Error ? err.message : 'Unknown error'
    logger.warn({ err }, 'Gateway health check failed')
    return { status: 'down', latencyMs: Date.now() - start, error }
  }
}

/**
 * Check scheduler status
 */
function checkScheduler(): HealthCheck {
  // Check if scheduler is registered and running
  try {
    const scheduler = getScheduler()
    if (!scheduler) {
      // Scheduler not initialized - this is OK if connection not configured
      return { status: 'up' }
    }
    const schedulerStatus = scheduler.getStatus()
    const isRunning = schedulerStatus.isRunning
    return {
      status: isRunning ? 'up' : 'down',
      error: isRunning ? undefined : 'Scheduler not running'
    }
  } catch {
    // Scheduler module not available - not critical for health
    return { status: 'up' }
  }
}

/**
 * Register health check routes
 */
export async function registerHealthRoutes(
  app: FastifyInstance,
  gatewayUrl?: string
): Promise<void> {
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
        checks: { gateway: { status: 'down', error: 'Server shutting down' } }
      })
    }

    const [gateway, scheduler] = await Promise.all([
      checkGateway(gatewayUrl),
      Promise.resolve(checkScheduler())
    ])

    // Gateway is critical, scheduler is optional
    const healthy = gateway.status === 'up'

    const response: HealthResponse = {
      status: healthy ? 'healthy' : 'degraded',
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      checks: { gateway, scheduler }
    }

    return reply.code(healthy ? 200 : 503).send(response)
  })
}
