import type { FastifyRequest, FastifyReply } from 'fastify'
import { logger } from '../lib/logger.js'

/**
 * Auth error codes for specific failure types.
 * Helps clients identify and handle different auth issues.
 */
export const AUTH_ERROR_CODES = {
  TOKEN_EXPIRED: 'Token has expired - refresh or login again',
  TOKEN_INVALID: 'Token format is invalid or signature mismatch',
  TOKEN_MISSING: 'Authorization header is required',
  SIGNATURE_MISMATCH: 'Token signature invalid - check JWT_SECRET matches between services'
} as const

export type AuthErrorCode = keyof typeof AUTH_ERROR_CODES

/**
 * Authentication middleware that verifies JWT tokens and returns specific error codes.
 */
export async function authenticate(
  request: FastifyRequest,
  reply: FastifyReply
) {
  // Check for missing Authorization header first
  const authHeader = request.headers.authorization
  if (!authHeader) {
    logger.warn({ path: request.url }, 'Auth failed: missing authorization header')
    return reply.status(401).send({
      success: false,
      error: 'TOKEN_MISSING',
      message: AUTH_ERROR_CODES.TOKEN_MISSING
    })
  }

  try {
    await request.jwtVerify()
  } catch (err: any) {
    const errorCode = err?.code || ''

    // Map @fastify/jwt error codes to our specific error codes
    if (errorCode === 'FST_JWT_AUTHORIZATION_TOKEN_EXPIRED') {
      logger.warn({ path: request.url }, 'Auth failed: token expired')
      return reply.status(401).send({
        success: false,
        error: 'TOKEN_EXPIRED',
        message: AUTH_ERROR_CODES.TOKEN_EXPIRED
      })
    }

    if (errorCode === 'FST_JWT_AUTHORIZATION_TOKEN_INVALID' ||
        errorCode === 'FST_JWT_BAD_REQUEST') {
      logger.warn({ path: request.url, errorCode }, 'Auth failed: invalid token')
      return reply.status(401).send({
        success: false,
        error: 'TOKEN_INVALID',
        message: AUTH_ERROR_CODES.TOKEN_INVALID
      })
    }

    if (errorCode === 'FST_JWT_NO_AUTHORIZATION_IN_HEADER') {
      logger.warn({ path: request.url }, 'Auth failed: no authorization in header')
      return reply.status(401).send({
        success: false,
        error: 'TOKEN_MISSING',
        message: AUTH_ERROR_CODES.TOKEN_MISSING
      })
    }

    // Check for signature verification failures
    if (err?.message?.includes('signature') || errorCode.includes('SIGNATURE')) {
      logger.warn({ path: request.url, errorCode }, 'Auth failed: signature mismatch')
      return reply.status(401).send({
        success: false,
        error: 'SIGNATURE_MISMATCH',
        message: AUTH_ERROR_CODES.SIGNATURE_MISMATCH
      })
    }

    // Generic fallback for unknown errors
    logger.warn({ path: request.url, errorCode, message: err?.message }, 'Auth failed: unknown error')
    return reply.status(401).send({
      success: false,
      error: 'TOKEN_INVALID',
      message: AUTH_ERROR_CODES.TOKEN_INVALID
    })
  }
}
