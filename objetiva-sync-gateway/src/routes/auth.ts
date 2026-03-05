import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import crypto from 'crypto'
import { logger } from '../lib/logger.js'
import { metrics } from '../lib/metrics.js'
import { authenticate } from '../middleware/auth.js'
import { writeEnvVar } from '../utils/env-writer.js'

const LoginSchema = z.object({
  username: z.string().min(1, 'Username es requerido'),
  password: z.string().min(1, 'Password es requerido')
})

const ChangePasswordSchema = z.object({
  currentPassword: z.string().min(1, 'Current password is required'),
  newPassword: z.string().min(6, 'New password must be at least 6 characters')
})

/**
 * Parse a duration string (like '1h', '24h', '30m', '86400') to seconds.
 * @param duration - Duration string or number (already in seconds if number)
 * @returns Number of seconds
 */
function parseDurationToSeconds(duration: string | number): number {
  if (typeof duration === 'number') {
    return duration
  }

  const match = duration.match(/^(\d+)(s|m|h|d)?$/)
  if (!match) {
    // Default to 1 hour if unparseable
    return 3600
  }

  const value = parseInt(match[1], 10)
  const unit = match[2] || 's'

  switch (unit) {
    case 's': return value
    case 'm': return value * 60
    case 'h': return value * 3600
    case 'd': return value * 86400
    default: return value
  }
}

/**
 * Get JWT expiration settings from environment.
 * Returns both the raw value for jwt.sign and seconds for client response.
 */
function getJwtExpiresIn(): { raw: string | number; seconds: number } {
  const jwtExpiresInRaw = process.env.JWT_EXPIRES_IN

  if (!jwtExpiresInRaw) {
    return { raw: '24h', seconds: 86400 }
  }

  // If it's a pure number string, treat as seconds
  if (!isNaN(Number(jwtExpiresInRaw))) {
    const seconds = Number(jwtExpiresInRaw)
    return { raw: seconds, seconds }
  }

  // It's a duration string like '1h', '24h', '30m'
  return { raw: jwtExpiresInRaw, seconds: parseDurationToSeconds(jwtExpiresInRaw) }
}

export async function registerAuthRoutes(app: FastifyInstance) {
  app.post('/auth/login', async (request, reply) => {
    const body = LoginSchema.parse(request.body)

    // Obtener credenciales de .env
    const SYNC_USERNAME = process.env.SYNC_USERNAME || 'admin'
    const SYNC_PASSWORD = process.env.SYNC_PASSWORD

    if (!SYNC_PASSWORD || SYNC_PASSWORD === 'change-me') {
      logger.error('SYNC_PASSWORD no configurado en .env')

      metrics.recordLogin({
        timestamp: new Date(),
        comercioId: 'system',
        comercioUsername: body.username,
        success: false,
        ipAddress: request.ip
      })

      return reply.status(503).send({
        success: false,
        error: 'Sistema de autenticacion no configurado. Ejecuta /setup primero.'
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
        error: 'Credenciales invalidas'
      })
    }

    // Verificar password (timing-safe comparison)
    const inputBuf = Buffer.from(body.password)
    const storedBuf = Buffer.from(SYNC_PASSWORD)
    const validPassword = inputBuf.length === storedBuf.length && crypto.timingSafeEqual(inputBuf, storedBuf)

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
        error: 'Credenciales invalidas'
      })
    }

    // Login exitoso - generar token
    const expiresInConfig = getJwtExpiresIn()
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
      expiresIn: expiresInConfig.seconds,
      tokenType: 'Bearer',
      user: {
        username: body.username
      }
    })
  })

  // Auth diagnostics endpoint - returns token metadata and config status
  app.get('/api/auth/diagnostics', { preHandler: [authenticate] }, async (request, reply) => {
    try {
      const token = request.headers.authorization?.replace('Bearer ', '')

      if (!token) {
        return reply.status(400).send({
          success: false,
          error: 'TOKEN_MISSING',
          message: 'No token found in request'
        })
      }

      // Decode token to extract metadata (token is already verified by authenticate middleware)
      const decoded = app.jwt.decode(token, { complete: true }) as {
        header: { alg: string };
        payload: { iat?: number; exp?: number; username?: string };
      } | null

      if (!decoded) {
        return reply.status(400).send({
          success: false,
          error: 'TOKEN_INVALID',
          message: 'Could not decode token'
        })
      }

      const now = Math.floor(Date.now() / 1000)

      return reply.send({
        success: true,
        token: {
          isValid: true,
          issuedAt: decoded.payload.iat ? new Date(decoded.payload.iat * 1000).toISOString() : null,
          expiresAt: decoded.payload.exp ? new Date(decoded.payload.exp * 1000).toISOString() : null,
          expiresInSeconds: decoded.payload.exp ? decoded.payload.exp - now : null,
          username: decoded.payload.username || null,
          algorithm: decoded.header.alg
        },
        config: {
          tokenTTL: process.env.JWT_EXPIRES_IN || '1h',
          jwtSecretConfigured: !!process.env.JWT_SECRET && process.env.JWT_SECRET !== 'change-this-secret-in-production-debe-ser-el-mismo-que-en-objetiva-sync',
          syncPasswordConfigured: process.env.SYNC_PASSWORD !== undefined && process.env.SYNC_PASSWORD !== 'change-me'
        }
      })
    } catch (err) {
      logger.error({ err }, 'Error in diagnostics endpoint')
      return reply.status(500).send({
        success: false,
        error: 'INTERNAL_ERROR',
        message: 'Failed to retrieve diagnostics'
      })
    }
  })

  // Password change endpoint - requires authentication and current password verification
  app.post('/api/auth/change-password', { preHandler: [authenticate] }, async (request, reply) => {
    try {
      // Validate request body
      const parseResult = ChangePasswordSchema.safeParse(request.body)
      if (!parseResult.success) {
        return reply.status(400).send({
          success: false,
          error: 'VALIDATION_ERROR',
          message: parseResult.error.errors.map(e => e.message).join(', ')
        })
      }

      const { currentPassword, newPassword } = parseResult.data

      // Check if system is configured
      const SYNC_PASSWORD = process.env.SYNC_PASSWORD
      if (!SYNC_PASSWORD || SYNC_PASSWORD === 'change-me') {
        logger.warn('Password change attempted but system not configured')
        return reply.status(503).send({
          success: false,
          error: 'SYSTEM_NOT_CONFIGURED',
          message: 'Auth system not configured - run /setup first'
        })
      }

      // Verify current password (timing-safe)
      const curBuf = Buffer.from(currentPassword)
      const storedBuf = Buffer.from(SYNC_PASSWORD)
      const isCurrentPasswordValid = curBuf.length === storedBuf.length && crypto.timingSafeEqual(curBuf, storedBuf)
      if (!isCurrentPasswordValid) {
        logger.warn({ username: request.user?.username }, 'Password change failed: invalid current password')
        return reply.status(401).send({
          success: false,
          error: 'PASSWORD_INVALID',
          message: 'Current password is incorrect'
        })
      }

      // Update .env file using centralized env-writer (serialized, correct escaping)
      try {
        await writeEnvVar('SYNC_PASSWORD', newPassword)
      } catch (err) {
        logger.error({ err }, 'Failed to write .env file')
        return reply.status(500).send({
          success: false,
          error: 'ENV_WRITE_ERROR',
          message: 'Failed to update configuration file'
        })
      }

      logger.info({ username: request.user?.username }, 'Password changed successfully')

      return reply.send({
        success: true,
        message: 'Password changed successfully. Server restart required for changes to take effect.'
      })
    } catch (err) {
      logger.error({ err }, 'Error in change-password endpoint')
      return reply.status(500).send({
        success: false,
        error: 'INTERNAL_ERROR',
        message: 'Failed to change password'
      })
    }
  })

  // Token refresh endpoint - allows clients to get new token before current expires
  app.post('/auth/refresh', async (request, reply) => {
    try {
      // Verify current token - may be near expiration but still valid
      await request.jwtVerify()

      // Extract username from verified token
      const payload = request.user as { username: string; authenticated: boolean }

      if (!payload.username) {
        logger.warn('Token refresh failed: no username in payload')
        return reply.status(401).send({
          success: false,
          error: 'TOKEN_INVALID',
          message: 'Token payload is missing required fields'
        })
      }

      // Generate new token with same claims but fresh expiration
      const expiresInConfig = getJwtExpiresIn()
      const newToken = app.jwt.sign({
        username: payload.username,
        authenticated: true
      })

      logger.info({ username: payload.username }, 'Token refreshed successfully')

      return reply.send({
        success: true,
        token: newToken,
        expiresIn: expiresInConfig.seconds,
        issuedAt: new Date().toISOString(),
        tokenType: 'Bearer'
      })
    } catch (err: any) {
      // Check if token is expired
      const errorCode = err?.code || ''

      if (errorCode === 'FST_JWT_AUTHORIZATION_TOKEN_EXPIRED') {
        logger.warn('Token refresh failed: token expired')
        return reply.status(401).send({
          success: false,
          error: 'TOKEN_EXPIRED',
          message: 'Token expired, please login again'
        })
      }

      // Check for missing authorization header
      if (errorCode === 'FST_JWT_NO_AUTHORIZATION_IN_HEADER') {
        logger.warn('Token refresh failed: no authorization header')
        return reply.status(401).send({
          success: false,
          error: 'TOKEN_MISSING',
          message: 'Authorization header is required'
        })
      }

      // Generic invalid token
      logger.warn({ errorCode }, 'Token refresh failed: invalid token')
      return reply.status(401).send({
        success: false,
        error: 'TOKEN_INVALID',
        message: 'Token format is invalid or signature mismatch'
      })
    }
  })
}
