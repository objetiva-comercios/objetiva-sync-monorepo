/**
 * Unit Tests: POST /api/config/pairing/claim (Phase 22, Plan 02)
 *
 * Tests the claim proxy route that:
 * - Forwards claim requests to the gateway
 * - Saves 2 config keys to SQLite on success (URL + JWT_SECRET)
 * - Returns appropriate error responses for each gateway error code
 *
 * Strategy:
 * - Mock global fetch to simulate gateway responses
 * - Mock setConfig and encrypt to avoid real SQLite/crypto
 * - Use Fastify inject pattern with a minimal app
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import Fastify from 'fastify'
import type { FastifyInstance } from 'fastify'

// ── Module mocks (must be hoisted above imports that use them) ────────────────

vi.mock('../../src/store/repositories/config-repo.js', () => ({
  getConfig: vi.fn().mockResolvedValue(null),
  setConfig: vi.fn().mockResolvedValue(undefined),
}))

vi.mock('../../src/utils/crypto.js', () => ({
  encrypt: vi.fn((v: string) => `encrypted:${v}`),
  decrypt: vi.fn((v: string) => v.replace('encrypted:', '')),
}))

vi.mock('../../src/utils/logger.js', () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
}))

vi.mock('../../src/services/gateway-client.js', () => ({
  getJwtToken: vi.fn().mockResolvedValue('test-jwt-token'),
}))

// Mock session middleware so requireNoPasswordChange passes
vi.mock('../../src/services/auth-service.js', () => ({
  getUserFromSession: vi.fn(() => ({ id: 1, username: 'test', requirePasswordChange: false })),
}))

// ── Imports after mocks ───────────────────────────────────────────────────────

import { setConfig } from '../../src/store/repositories/config-repo.js'
import { encrypt } from '../../src/utils/crypto.js'
import { registerConfigApiRoutes } from '../../src/dashboard/routes/api/config.js'

// ── Helpers ───────────────────────────────────────────────────────────────────

async function buildApp(): Promise<FastifyInstance> {
  const app = Fastify({ logger: false })

  // Minimal session plugin so middleware can read session
  app.decorateRequest('session', {
    getter() {
      return {}
    },
  })

  await registerConfigApiRoutes(app)
  await app.ready()
  return app
}

/** Build a mock fetch response */
function mockFetchResponse(status: number, body: unknown): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: vi.fn().mockResolvedValue(body),
    text: vi.fn().mockResolvedValue(JSON.stringify(body)),
  } as unknown as Response
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('POST /api/config/pairing/claim', () => {
  let app: FastifyInstance

  beforeEach(async () => {
    vi.clearAllMocks()
    app = await buildApp()
  })

  // ── Validation ──────────────────────────────────────────────────────────────

  describe('Input validation', () => {
    it('returns 400 when gatewayUrl is missing', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/api/config/pairing/claim',
        payload: { code: 'ABC123' },
      })

      expect(response.statusCode).toBe(400)
      const body = JSON.parse(response.body)
      expect(body.success).toBe(false)
    })

    it('returns 400 when code is missing', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/api/config/pairing/claim',
        payload: { gatewayUrl: 'https://gateway.example.com' },
      })

      expect(response.statusCode).toBe(400)
      const body = JSON.parse(response.body)
      expect(body.success).toBe(false)
    })

    it('returns 400 when both fields are missing', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/api/config/pairing/claim',
        payload: {},
      })

      expect(response.statusCode).toBe(400)
      const body = JSON.parse(response.body)
      expect(body.success).toBe(false)
    })
  })

  // ── Success path ─────────────────────────────────────────────────────────────

  describe('Success path (gateway returns 200)', () => {
    it('saves 2 config keys (URL + JWT_SECRET) and returns success with gatewayUrl', async () => {
      const gatewayData = {
        success: true,
        gatewayUrl: 'https://gateway.example.com',
        jwtSecret: 'super-secret-jwt',
      }
      vi.spyOn(global, 'fetch').mockResolvedValue(mockFetchResponse(200, gatewayData))

      const response = await app.inject({
        method: 'POST',
        url: '/api/config/pairing/claim',
        payload: {
          gatewayUrl: 'https://gateway.example.com/',
          code: 'ABC123',
        },
      })

      expect(response.statusCode).toBe(200)
      const body = JSON.parse(response.body)
      expect(body.success).toBe(true)
      expect(body.gatewayUrl).toBe('https://gateway.example.com')

      // Verify only 2 keys were saved (URL + JWT_SECRET, no password/username)
      expect(setConfig).toHaveBeenCalledTimes(2)
      expect(setConfig).toHaveBeenCalledWith('REMOTE_API_URL', 'https://gateway.example.com')
      expect(setConfig).toHaveBeenCalledWith('JWT_SECRET', 'encrypted:super-secret-jwt', true)
    })

    it('normalizes trailing slashes in gatewayUrl', async () => {
      const gatewayData = {
        success: true,
        gatewayUrl: null, // gateway returns null for gatewayUrl
        jwtSecret: 'secret',
      }
      vi.spyOn(global, 'fetch').mockResolvedValue(mockFetchResponse(200, gatewayData))

      const response = await app.inject({
        method: 'POST',
        url: '/api/config/pairing/claim',
        payload: {
          gatewayUrl: 'https://gateway.example.com///',
          code: 'XYZ789',
        },
      })

      expect(response.statusCode).toBe(200)
      const body = JSON.parse(response.body)
      // When gateway returns null gatewayUrl, falls back to the normalized baseUrl
      expect(body.gatewayUrl).toBe('https://gateway.example.com')

      // Verifies fetch was called with correct URL (normalized)
      expect(fetch).toHaveBeenCalledWith(
        'https://gateway.example.com/api/pairing/claim',
        expect.objectContaining({ method: 'POST' })
      )
    })

    it('encrypts jwtSecret before saving', async () => {
      const gatewayData = {
        success: true,
        gatewayUrl: 'https://gw.test',
        jwtSecret: 'my-jwt-secret',
      }
      vi.spyOn(global, 'fetch').mockResolvedValue(mockFetchResponse(200, gatewayData))

      await app.inject({
        method: 'POST',
        url: '/api/config/pairing/claim',
        payload: { gatewayUrl: 'https://gw.test', code: 'CODE01' },
      })

      // encrypt should have been called with the jwtSecret only (no syncPassword)
      expect(encrypt).toHaveBeenCalledTimes(1)
      expect(encrypt).toHaveBeenCalledWith('my-jwt-secret')
    })
  })

  // ── Gateway error codes ───────────────────────────────────────────────────────

  describe('Gateway error responses', () => {
    it('returns 404 with Spanish error when gateway returns 404 (invalid code)', async () => {
      vi.spyOn(global, 'fetch').mockResolvedValue(
        mockFetchResponse(404, { success: false, error: 'CODE_INVALID' })
      )

      const response = await app.inject({
        method: 'POST',
        url: '/api/config/pairing/claim',
        payload: { gatewayUrl: 'https://gateway.example.com', code: 'BADCOD' },
      })

      expect(response.statusCode).toBe(404)
      const body = JSON.parse(response.body)
      expect(body.success).toBe(false)
      expect(body.error).toBe('Codigo invalido o expirado')
    })

    it('returns 410 with Spanish error when gateway returns 410 (consumed code)', async () => {
      vi.spyOn(global, 'fetch').mockResolvedValue(
        mockFetchResponse(410, { success: false, error: 'CODE_CONSUMED' })
      )

      const response = await app.inject({
        method: 'POST',
        url: '/api/config/pairing/claim',
        payload: { gatewayUrl: 'https://gateway.example.com', code: 'USED01' },
      })

      expect(response.statusCode).toBe(410)
      const body = JSON.parse(response.body)
      expect(body.success).toBe(false)
      expect(body.error).toBe('Codigo ya fue utilizado')
    })

    it('returns 502 for other non-ok gateway responses', async () => {
      vi.spyOn(global, 'fetch').mockResolvedValue(
        mockFetchResponse(500, { success: false, error: 'INTERNAL_ERROR' })
      )

      const response = await app.inject({
        method: 'POST',
        url: '/api/config/pairing/claim',
        payload: { gatewayUrl: 'https://gateway.example.com', code: 'CODE01' },
      })

      expect(response.statusCode).toBe(502)
      const body = JSON.parse(response.body)
      expect(body.success).toBe(false)
    })

    it('returns 502 when gateway is unreachable (fetch throws)', async () => {
      vi.spyOn(global, 'fetch').mockRejectedValue(new Error('ECONNREFUSED'))

      const response = await app.inject({
        method: 'POST',
        url: '/api/config/pairing/claim',
        payload: { gatewayUrl: 'https://gateway.example.com', code: 'CODE01' },
      })

      expect(response.statusCode).toBe(502)
      const body = JSON.parse(response.body)
      expect(body.success).toBe(false)
      expect(body.error).toContain('No se pudo conectar')
    })
  })

  // ── Null credential rejection ─────────────────────────────────────────────────

  describe('Null credential rejection', () => {
    it('returns 502 when gateway returns null jwtSecret', async () => {
      const gatewayData = {
        success: true,
        gatewayUrl: 'https://gateway.example.com',
        jwtSecret: null,
      }
      vi.spyOn(global, 'fetch').mockResolvedValue(mockFetchResponse(200, gatewayData))

      const response = await app.inject({
        method: 'POST',
        url: '/api/config/pairing/claim',
        payload: { gatewayUrl: 'https://gateway.example.com', code: 'CODE01' },
      })

      expect(response.statusCode).toBe(502)
      const body = JSON.parse(response.body)
      expect(body.success).toBe(false)
      expect(body.error).toContain('JWT secret')

      // Should NOT have saved any config keys
      expect(setConfig).not.toHaveBeenCalled()
    })

    it('succeeds even when syncPassword is absent (no longer required)', async () => {
      const gatewayData = {
        success: true,
        gatewayUrl: 'https://gateway.example.com',
        jwtSecret: 'valid-secret',
        // syncPassword not provided — this is fine in the new model
      }
      vi.spyOn(global, 'fetch').mockResolvedValue(mockFetchResponse(200, gatewayData))

      const response = await app.inject({
        method: 'POST',
        url: '/api/config/pairing/claim',
        payload: { gatewayUrl: 'https://gateway.example.com', code: 'CODE01' },
      })

      expect(response.statusCode).toBe(200)
      const body = JSON.parse(response.body)
      expect(body.success).toBe(true)

      // Should have saved 2 keys
      expect(setConfig).toHaveBeenCalledTimes(2)
    })
  })
})
