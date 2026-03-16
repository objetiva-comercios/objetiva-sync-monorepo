import Fastify from 'fastify'
import cors from '@fastify/cors'
import jwt from '@fastify/jwt'
import fastifyStatic from '@fastify/static'
import rateLimit from '@fastify/rate-limit'
import path from 'path'
import { fileURLToPath } from 'url'
import { logger } from './lib/logger.js'
import { rTracer, getCorrelationId } from './lib/correlation.js'
import { registerErrorHandler } from './middleware/error-handler.js'
import { registerArticulosRoutes } from './routes/articulos.js'
import { registerComprobantesRoutes } from './routes/comprobantes.js'
import { registerSetupRoutes } from './routes/setup.js'
import { registerStatusRoutes } from './routes/status.js'
import { registerSchemaRoutes } from './routes/schemas.js'
import { registerRegenerateRoutes } from './routes/regenerate-schemas.js'
import { registerDashboardRoutes } from './routes/dashboard.js'
import { registerPairingRoutes } from './routes/pairing.js'
import { registerHealthRoutes } from './routes/health.js'
import { registerMetricsRoutes } from './routes/metrics.js'
import { registerPreflightRoutes } from './routes/preflight.js'
import { httpDuration, httpRequestsTotal } from './lib/prometheus.js'
import { systemState } from './lib/system-state.js'

// Augment Fastify request for timing
declare module 'fastify' {
  interface FastifyRequest {
    startTime: number
  }
}

export async function buildApp() {
  const app = Fastify({
    loggerInstance: logger as any,
    trustProxy: true,
    disableRequestLogging: process.env.NODE_ENV === 'production'
  })

  // Rate limiting — global: false means per-route opt-in via config.rateLimit
  // MUST be registered BEFORE routes
  await app.register(rateLimit as any, { global: false })

  // Correlation ID tracking - MUST be registered FIRST before routes
  // Enables end-to-end request tracing via X-Correlation-ID header
  await app.register(rTracer.fastifyPlugin, {
    useHeader: true,
    headerName: 'X-Correlation-ID',
    echoHeader: true
  })

  // Create child logger with correlationId and start timing for each request
  app.addHook('onRequest', async (request) => {
    // Start timing for Prometheus metrics
    request.startTime = Date.now()

    // Add correlationId to logger
    const correlationId = getCorrelationId()
    if (correlationId) {
      request.log = request.log.child({ correlationId })
    }
  })

  // Record HTTP metrics on response
  app.addHook('onResponse', async (request, reply) => {
    // Skip metrics endpoint to avoid recursion
    if (request.url === '/metrics') return

    const duration = (Date.now() - request.startTime) / 1000
    // Use route pattern, not full URL (avoids cardinality explosion)
    const route = request.routeOptions?.url || request.url
    const labels = {
      method: request.method,
      route,
      status_code: reply.statusCode.toString()
    }

    httpDuration.observe(labels, duration)
    httpRequestsTotal.inc(labels)
  })

  // CORS
  await app.register(cors as any, {
    origin: true,
    credentials: true
  })

  // JWT
  // NOTE: process.env values are always strings. jsonwebtoken treats a digit-only
  // string like "86400" as milliseconds (86.4s!), not seconds. Parse to number
  // so it is correctly interpreted as seconds.
  const jwtExpiresInRaw = process.env.JWT_EXPIRES_IN
  const jwtExpiresIn = jwtExpiresInRaw
    ? (isNaN(Number(jwtExpiresInRaw)) ? jwtExpiresInRaw : Number(jwtExpiresInRaw))
    : '24h'

  await app.register(jwt as any, {
    secret: process.env.JWT_SECRET || 'change-me-in-production',
    sign: {
      expiresIn: jwtExpiresIn
    }
  })

  // Static files - Serve React dashboard
  const __filename = fileURLToPath(import.meta.url)
  const __dirname = path.dirname(__filename)
  const dashboardPath = path.join(__dirname, '..', 'dashboard', 'dist')

  await app.register(fastifyStatic as any, {
    root: dashboardPath,
    prefix: '/'
  })

  // Setup-only mode — return 503 on all routes NOT in the allowlist
  // Checked after rate-limit and correlation hooks so those still work.
  // The hook runs on every request; systemState.startupMode is read live.
  // /api/setup/token is included so the setup wizard (step 5) can obtain a JWT token
  // during setup-only mode, before any password-based auth exists.
  const SETUP_ONLY_ALLOWLIST = ['/health', '/metrics', '/setup', '/api/setup/', '/api/pairing/']
  app.addHook('onRequest', async (request, reply) => {
    if (systemState.startupMode !== 'setup-only') return
    const url = request.url
    const allowed = SETUP_ONLY_ALLOWLIST.some((prefix) => url.startsWith(prefix))
    if (!allowed) {
      // Redirect browsers to /setup, return JSON for API clients
      const accept = request.headers.accept || ''
      if (accept.includes('text/html')) {
        return reply.redirect('/setup')
      }
      return reply.code(503).send({
        error: 'SERVICE_UNAVAILABLE',
        message: 'Gateway is in setup-only mode. Complete configuration at /setup.',
        setupUrl: '/setup'
      })
    }
  })

  // Health check (before other routes, no auth required)
  await registerHealthRoutes(app)

  // Metrics endpoint (no auth required, Prometheus needs to scrape)
  await registerMetricsRoutes(app)

  // Preflight endpoint (no auth required, used by setup wizard)
  await registerPreflightRoutes(app)

  // Routes
  await registerStatusRoutes(app)
  await registerSetupRoutes(app)
  await registerArticulosRoutes(app)
  await registerComprobantesRoutes(app)
  await registerSchemaRoutes(app)
  await registerRegenerateRoutes(app)
  await registerDashboardRoutes(app)
  await registerPairingRoutes(app)

  // SPA fallback - todas las rutas no encontradas sirven el dashboard
  app.setNotFoundHandler(async (request, reply) => {
    // Si es una ruta de API, devolver 404 JSON
    if (request.url.startsWith('/api/')) {
      return reply.code(404).send({ error: 'Not found' })
    }
    // Para todas las demás rutas, servir el index.html del dashboard
    return reply.sendFile('index.html')
  })

  // Error handler (debe ser lo ultimo)
  registerErrorHandler(app)

  return app
}
