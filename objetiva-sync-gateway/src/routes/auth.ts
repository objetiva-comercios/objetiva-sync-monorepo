import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import bcrypt from 'bcryptjs'
import { logger } from '../lib/logger.js'
import { metrics } from '../lib/metrics.js'

const LoginSchema = z.object({
  username: z.string().min(1, 'Username es requerido'),
  password: z.string().min(1, 'Password es requerido')
})

export async function registerAuthRoutes(app: FastifyInstance) {
  app.post('/auth/login', async (request, reply) => {
    const body = LoginSchema.parse(request.body)

    // Obtener credenciales de .env
    const SYNC_USERNAME = process.env.SYNC_USERNAME || 'admin'
    const SYNC_PASSWORD_HASH = process.env.SYNC_PASSWORD_HASH

    if (!SYNC_PASSWORD_HASH || SYNC_PASSWORD_HASH === 'change-this-hash-in-setup') {
      logger.error('SYNC_PASSWORD_HASH no configurado en .env')

      metrics.recordLogin({
        timestamp: new Date(),
        comercioId: 'system',
        comercioUsername: body.username,
        success: false,
        ipAddress: request.ip
      })

      return reply.status(503).send({
        success: false,
        error: 'Sistema de autenticación no configurado. Ejecuta /setup primero.'
      })
    }

    // Verificar username
    if (body.username !== SYNC_USERNAME) {
      logger.warn({ username: body.username }, 'Intento de login con usuario incorrecto')

      metrics.recordLogin({
        timestamp: new Date(),
        comercioId: 'system',
        comercioUsername: body.username,
        success: false,
        ipAddress: request.ip
      })

      return reply.status(401).send({
        success: false,
        error: 'Credenciales inválidas'
      })
    }

    // Verificar password
    const validPassword = await bcrypt.compare(body.password, SYNC_PASSWORD_HASH)

    if (!validPassword) {
      logger.warn({ username: body.username }, 'Intento de login con password incorrecta')

      metrics.recordLogin({
        timestamp: new Date(),
        comercioId: 'system',
        comercioUsername: body.username,
        success: false,
        ipAddress: request.ip
      })

      return reply.status(401).send({
        success: false,
        error: 'Credenciales inválidas'
      })
    }

    // Login exitoso - generar token
    const token = app.jwt.sign({
      username: body.username,
      authenticated: true
    })

    logger.info({ username: body.username }, 'Login exitoso')

    metrics.recordLogin({
      timestamp: new Date(),
      comercioId: 'system',
      comercioUsername: body.username,
      success: true,
      ipAddress: request.ip
    })

    return reply.send({
      success: true,
      token,
      user: {
        username: body.username
      }
    })
  })
}
