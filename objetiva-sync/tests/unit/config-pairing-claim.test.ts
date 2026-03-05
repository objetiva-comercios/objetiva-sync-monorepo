/**
 * Unit Tests: POST /api/config/pairing/claim (Phase 21, Plan 01)
 *
 * Tests the claim proxy route that:
 * - Forwards claim requests to the gateway
 * - Saves 4 config keys to SQLite on success
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
    it('saves 4 config keys and returns success with gatewayUrl', async () => {
      const gatewayData = {
        success: true,
        gatewayUrl: 'https://gateway.example.com',
        jwtSecret: 'super-secret-jwt',
        syncPassword: 'sync-pass-123',
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

      // Verify 4 keys were saved
      expect(setConfig).toHaveBeenCalledTimes(4)
      expect(setConfig).toHaveBeenCalledWith('REMOTE_API_URL', 'https://gateway.example.com')
      expect(setConfig).toHaveBeenCalledWith('REMOTE_API_USERNAME', 'sync')
      expect(setConfig).toHaveBeenCalledWith('REMOTE_API_PASSWORD', 'encrypted:sync-pass-123', true)
      expect(setConfig).toHaveBeenCalledWith('JWT_SECRET', 'encrypted:super-secret-jwt', true)
    })

    it('normalizes trailing slashes in gatewayUrl', async () => {
      const gatewayData = {
        success: true,
        gatewayUrl: null, // gateway returns null for gatewayUrl
        jwtSecret: 'secret',
        syncPassword: 'pass',
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

    it('encrypts syncPassword and jwtSecret before saving', async () => {
      const gatewayData = {
        success: true,
        gatewayUrl: 'https://gw.test',
        jwtSecret: 'my-jwt-secret',
        syncPassword: 'my-sync-pass',
      }
      vi.spyOn(global, 'fetch').mockResolvedValue(mockFetchResponse(200, gatewayData))

      await app.inject({
        method: 'POST',
        url: '/api/config/pairing/claim',
        payload: { gatewayUrl: 'https://gw.test', code: 'CODE01' },
      })

      // encrypt should have been called with the plaintext values
      expect(encrypt).toHaveBeenCalledWith('my-sync-pass')
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
        syncPassword: 'valid-pass',
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
      expect(body.error).toContain('contrasena de sync')

      // Should NOT have saved any config keys
      expect(setConfig).not.toHaveBeenCalled()
    })

    it('returns 502 when gateway returns null syncPassword', async () => {
      const gatewayData = {
        success: true,
        gatewayUrl: 'https://gateway.example.com',
        jwtSecret: 'valid-secret',
        syncPassword: null,
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
      expect(body.error).toContain('contrasena de sync')

      // Should NOT have saved any config keys
      expect(setConfig).not.toHaveBeenCalled()
    })
  })
})
