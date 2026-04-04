import type { FastifyRequest, FastifyReply } from 'fastify'
import { createVerifier } from 'fast-jwt'
import { logger } from '../lib/logger.js'
import { systemState } from '../lib/system-state.js'

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
 * Try verifying a token with the current process.env.JWT_SECRET.
 *
 * After the setup wizard saves a new JWT_SECRET, @fastify/jwt still holds the
 * startup default. This fallback lets tokens signed with the NEW secret pass
 * verification without requiring a container restart.
 *
 * Only activates when process.env.JWT_SECRET differs from what @fastify/jwt
 * was registered with (i.e., the wizard updated the secret mid-lifecycle).
 */
function tryFallbackVerify(token: string): Record<string, unknown> | null {
  const currentSecret = process.env.JWT_SECRET
  const startupSecret = systemState.startupJwtSecret
  if (!currentSecret || currentSecret === startupSecret) return null

  try {
    const verifier = createVerifier({ key: currentSecret })
    return verifier(token) as Record<string, unknown>
  } catch {
    return null
  }
}

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
    // Before returning 401, try verifying with the current JWT_SECRET.
    // This handles the case where the setup wizard updated the secret but
    // @fastify/jwt still holds the old cached value.
    const rawToken = authHeader.replace(/^Bearer\s+/i, '')
    const fallbackPayload = tryFallbackVerify(rawToken)
    if (fallbackPayload) {
      // Attach payload so downstream handlers can read request.user
      ;(request as any).user = fallbackPayload
      return
    }

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
