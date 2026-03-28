/**
 * pairing.ts — Pairing Code Routes (Phase 20)
 *
 * POST /api/pairing/generate — authenticated, issues a new pairing code
 * POST /api/pairing/claim   — unauthenticated, rate-limited, claims code for credentials
 *
 * Flow:
 *  1. Operator completes setup wizard and reaches step 5 (Link Sync Client)
 *  2. Wizard calls POST /api/pairing/generate (requires JWT) to get a 6-char code
 *  3. Operator reads code to the sync server or enters it in sync UI
 *  4. Sync server calls POST /api/pairing/claim with the code
 *  5. On success, sync receives { gatewayUrl, jwtSecret } in one call
 */

import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { authenticate } from '../middleware/auth.js'
import { generateCode, claimCode, getActiveCode } from '../lib/pairing-store.js'
import { logger } from '../lib/logger.js'
import { systemState } from '../lib/system-state.js'

const ClaimSchema = z.object({
  code: z.string().min(1, 'Code is required').max(10, 'Code too long')
})

// Tracks whether the most recently generated code was successfully claimed.
// Reset on generate, set on successful claim.
let lastCodeWasClaimed = false

export async function registerPairingRoutes(app: FastifyInstance): Promise<void> {
  /**
   * POST /api/pairing/generate
   *
   * Requires JWT authentication. Issues a new 6-char pairing code.
   * Any previously active code is invalidated.
   *
   * Response: { success, code, expiresAt }
   */
  app.post('/api/pairing/generate', {
    preHandler: [authenticate]
  }, async (request, reply) => {
    lastCodeWasClaimed = false
    const { code, expiresAt } = generateCode()

    logger.info(
      { path: '/api/pairing/generate', ip: request.ip },
      'Pairing code generated'
    )

    return reply.code(200).send({
      success: true,
      code,
      expiresAt: expiresAt.toISOString()
    })
  })

  /**
   * POST /api/pairing/claim
   *
   * Unauthenticated endpoint — rate-limited to 5 per minute per IP.
   * Validates the submitted code and returns gateway credentials on success.
   *
   * Response 200: { success, gatewayUrl, jwtSecret }
   * Response 400: { success: false, error: 'INVALID_INPUT' }
   * Response 404: { success: false, error: 'CODE_INVALID' }
   * Response 410: { success: false, error: 'CODE_CONSUMED' }
   */
  app.post('/api/pairing/claim', {
    config: {
      rateLimit: {
        max: 5,
        timeWindow: '1 minute'
      }
    }
  }, async (request, reply) => {
    // Validate request body
    const parsed = ClaimSchema.safeParse(request.body)
    if (!parsed.success) {
      return reply.code(400).send({
        success: false,
        error: 'INVALID_INPUT',
        message: parsed.error.errors[0]?.message ?? 'Invalid input'
      })
    }

    const { code } = parsed.data
    const result = claimCode(code)

    // Log all claim attempts for audit trail
    logger.info(
      { path: '/api/pairing/claim', ip: request.ip, result, codePrefix: code.slice(0, 2) },
      `Pairing claim attempt: ${result}`
    )

    if (result === 'ok') {
      lastCodeWasClaimed = true
      // Return the secret that @fastify/jwt actually verifies against,
      // not process.env which may have been updated by the setup wizard
      // after jwt plugin registration.
      const effectiveSecret = systemState.registeredJwtSecret ?? process.env.JWT_SECRET ?? null
      return reply.code(200).send({
        success: true,
        gatewayUrl: process.env.GATEWAY_PUBLIC_URL ?? null,
        jwtSecret: effectiveSecret
      })
    }

    if (result === 'consumed') {
      return reply.code(410).send({
        success: false,
        error: 'CODE_CONSUMED',
        message: 'This pairing code has already been used'
      })
    }

    // result === 'invalid'
    return reply.code(404).send({
      success: false,
      error: 'CODE_INVALID',
      message: 'Pairing code is invalid or has expired'
    })
  })

  /**
   * GET /api/pairing/status
   *
   * Requires JWT authentication. Returns whether the current pairing code
   * has been claimed by a sync client. Used by the setup wizard to poll
   * for pairing completion.
   *
   * Response: { active: boolean, claimed: boolean }
   *  - active=true,  claimed=false → code is live, waiting for claim
   *  - active=false, claimed=true  → code was claimed successfully
   *  - active=false, claimed=false → no code generated or code expired
   */
  app.get('/api/pairing/status', {
    preHandler: [authenticate]
  }, async (_request, reply) => {
    const entry = getActiveCode()

    if (entry) {
      // Code is still active (not yet claimed, not expired)
      const expired = Date.now() >= entry.expiresAt.getTime()
      return reply.code(200).send({
        active: !expired,
        claimed: false
      })
    }

    // No active code — either it was claimed or never generated / expired
    // We can't distinguish "claimed" from "expired" with the current store,
    // so we track it via a module-level flag set when generate→claim happens.
    return reply.code(200).send({
      active: false,
      claimed: lastCodeWasClaimed
    })
  })
}
