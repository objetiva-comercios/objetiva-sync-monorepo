import type { FastifyInstance, FastifyError, FastifyRequest, FastifyReply } from 'fastify'
import { ZodError } from 'zod'
import { logger } from '../lib/logger.js'

export function registerErrorHandler(app: FastifyInstance) {
  app.setErrorHandler(async (error: FastifyError, request: FastifyRequest, reply: FastifyReply) => {
    // Zod validation errors
    if (error instanceof ZodError) {
      logger.warn({ error: error.errors }, 'Validation error')
      return reply.status(400).send({
        success: false,
        error: 'Error de validación',
        details: error.errors.map((e) => ({
          path: e.path.join('.'),
          message: e.message
        }))
      })
    }

    // Fastify validation errors
    if (error.validation) {
      logger.warn({ error }, 'Fastify validation error')
      return reply.status(400).send({
        success: false,
        error: 'Error de validación',
        details: error.validation
      })
    }

    // JWT errors
    if (error.statusCode === 401) {
      return reply.status(401).send({
        success: false,
        error: error.message || 'No autorizado'
      })
    }

    // Log error
    logger.error({
      error: {
        message: error.message,
        stack: error.stack,
        statusCode: error.statusCode
      },
      request: {
        method: request.method,
        url: request.url,
        headers: request.headers
      }
    }, 'Unhandled error')

    // Generic error response
    return reply.status(error.statusCode || 500).send({
      success: false,
      error: error.message || 'Error interno del servidor'
    })
  })
}
