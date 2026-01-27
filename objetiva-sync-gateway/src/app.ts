import Fastify from 'fastify'
import cors from '@fastify/cors'
import jwt from '@fastify/jwt'
import { logger } from './lib/logger.js'
import { registerErrorHandler } from './middleware/error-handler.js'
import { registerAuthRoutes } from './routes/auth.js'
import { registerArticulosRoutes } from './routes/articulos.js'
import { registerComprobantesRoutes } from './routes/comprobantes.js'
import { registerSetupRoutes } from './routes/setup.js'
import { registerStatusRoutes } from './routes/status.js'
import { registerSchemaRoutes } from './routes/schemas.js'

export async function buildApp() {
  const app = Fastify({
    logger: logger as any,
    trustProxy: true,
    disableRequestLogging: process.env.NODE_ENV === 'production'
  })

  // CORS
  await app.register(cors, {
    origin: true,
    credentials: true
  })

  // JWT
  await app.register(jwt, {
    secret: process.env.JWT_SECRET || 'change-me-in-production',
    sign: {
      expiresIn: process.env.JWT_EXPIRES_IN || '24h'
    }
  })

  // Routes
  await registerStatusRoutes(app)
  await registerSetupRoutes(app)
  await registerAuthRoutes(app)
  await registerArticulosRoutes(app)
  await registerComprobantesRoutes(app)
  await registerSchemaRoutes(app)

  // Health check
  app.get('/health', async () => {
    return { status: 'ok', timestamp: new Date().toISOString() }
  })

  // Error handler (debe ser lo último)
  registerErrorHandler(app)

  return app
}
