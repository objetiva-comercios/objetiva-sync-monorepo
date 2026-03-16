/**
 * Pairing Routes Integration Tests (Phase 20, Plan 01)
 *
 * Verifies:
 * - POST /api/pairing/generate — requires JWT auth, returns code + expiresAt
 * - POST /api/pairing/claim — unauthenticated, rate-limited, returns credentials
 * - 410 for consumed codes, 404 for invalid/expired, 429 for rate limit
 * - /api/pairing/ accessible in setup-only mode (in SETUP_ONLY_ALLOWLIST)
 *
 * Each describe block uses its own app instance to avoid rate limit pollution.
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest'
import { buildApp } from '../../src/app.js'
import { _resetForTest } from '../../src/lib/pairing-store.js'
import type { FastifyInstance } from 'fastify'

/** Helper: create a fresh configured app + JWT token */
async function createTestApp() {
  process.env.JWT_SECRET = 'test-jwt-secret-for-pairing-tests-32chars'
  process.env.JWT_EXPIRES_IN = '1h'
  process.env.GATEWAY_PUBLIC_URL = 'https://gateway.example.com'

  const app = await buildApp()
  await app.ready()
  const token = app.jwt.sign({ username: 'admin', authenticated: true })
  return { app, token }
}

// ────────────────────────────────────────────────────────────────
// Generate endpoint tests
// ────────────────────────────────────────────────────────────────

describe('POST /api/pairing/generate', () => {
  let app: FastifyInstance
  let validToken: string

  beforeAll(async () => {
    const result = await createTestApp()
    app = result.app
    validToken = result.token
  })

  afterAll(async () => {
    await app.close()
    _resetForTest()
  })

  beforeEach(() => { _resetForTest() })

  it('returns 401 without Authorization header', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/api/pairing/generate'
    })

    expect(response.statusCode).toBe(401)
    const body = JSON.parse(response.body)
    expect(body.success).toBe(false)
    expect(body.error).toBe('TOKEN_MISSING')
  })

  it('returns 401 with invalid token', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/api/pairing/generate',
      headers: { Authorization: 'Bearer not-a-valid-jwt' }
    })

    expect(response.statusCode).toBe(401)
    const body = JSON.parse(response.body)
    expect(body.success).toBe(false)
  })

  it('returns 200 with valid JWT and a valid pairing code', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/api/pairing/generate',
      headers: { Authorization: `Bearer ${validToken}` }
    })

    expect(response.statusCode).toBe(200)
    const body = JSON.parse(response.body)
    expect(body.success).toBe(true)
    expect(body.code).toBeDefined()
    expect(body.code).toMatch(/^[A-Z2-9]{6}$/)
    expect(body.expiresAt).toBeDefined()
    expect(new Date(body.expiresAt).getTime()).toBeGreaterThan(Date.now())
  })

  it('code charset excludes ambiguous characters (0, O, I, 1)', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/api/pairing/generate',
      headers: { Authorization: `Bearer ${validToken}` }
    })

    expect(response.statusCode).toBe(200)
    const body = JSON.parse(response.body)
    expect(body.code).not.toMatch(/[01OI]/)
  })

  it('second generate call replaces first code', async () => {
    const res1 = await app.inject({
      method: 'POST',
      url: '/api/pairing/generate',
      headers: { Authorization: `Bearer ${validToken}` }
    })
    const code1 = JSON.parse(res1.body).code

    // Generate second code
    await app.inject({
      method: 'POST',
      url: '/api/pairing/generate',
      headers: { Authorization: `Bearer ${validToken}` }
    })

    // First code should now be invalid
    const claimRes = await app.inject({
      method: 'POST',
      url: '/api/pairing/claim',
      payload: { code: code1 }
    })

    expect(claimRes.statusCode).toBe(404)
    const body = JSON.parse(claimRes.body)
    expect(body.error).toBe('CODE_INVALID')
  })
})

// ────────────────────────────────────────────────────────────────
// Claim — success and error codes (own app instance per describe)
// ────────────────────────────────────────────────────────────────

describe('POST /api/pairing/claim — success path', () => {
  let app: FastifyInstance
  let validToken: string

  beforeAll(async () => {
    const result = await createTestApp()
    app = result.app
    validToken = result.token
  })

  afterAll(async () => {
    await app.close()
    _resetForTest()
  })

  beforeEach(() => { _resetForTest() })

  it('returns 200 with credentials for a valid code', async () => {
    const genRes = await app.inject({
      method: 'POST',
      url: '/api/pairing/generate',
      headers: { Authorization: `Bearer ${validToken}` }
    })
    const { code } = JSON.parse(genRes.body)

    const response = await app.inject({
      method: 'POST',
      url: '/api/pairing/claim',
      payload: { code }
    })

    expect(response.statusCode).toBe(200)
    const body = JSON.parse(response.body)
    expect(body.success).toBe(true)
    expect(body.gatewayUrl).toBe('https://gateway.example.com')
    expect(body.jwtSecret).toBe('test-jwt-secret-for-pairing-tests-32chars')
    expect(body.syncPassword).toBeUndefined()
  })

  it('accepts lowercase code (case-insensitive)', async () => {
    const genRes = await app.inject({
      method: 'POST',
      url: '/api/pairing/generate',
      headers: { Authorization: `Bearer ${validToken}` }
    })
    const { code } = JSON.parse(genRes.body)

    const response = await app.inject({
      method: 'POST',
      url: '/api/pairing/claim',
      payload: { code: code.toLowerCase() }
    })

    expect(response.statusCode).toBe(200)
    const body = JSON.parse(response.body)
    expect(body.success).toBe(true)
  })

  it('gatewayUrl is null when GATEWAY_PUBLIC_URL is not set', async () => {
    const savedUrl = process.env.GATEWAY_PUBLIC_URL
    delete process.env.GATEWAY_PUBLIC_URL

    try {
      const genRes = await app.inject({
        method: 'POST',
        url: '/api/pairing/generate',
        headers: { Authorization: `Bearer ${validToken}` }
      })
      const { code } = JSON.parse(genRes.body)

      const response = await app.inject({
        method: 'POST',
        url: '/api/pairing/claim',
        payload: { code }
      })

      expect(response.statusCode).toBe(200)
      const body = JSON.parse(response.body)
      expect(body.gatewayUrl).toBeNull()
    } finally {
      process.env.GATEWAY_PUBLIC_URL = savedUrl
    }
  })
})

describe('POST /api/pairing/claim — error responses', () => {
  let app: FastifyInstance
  let validToken: string

  beforeAll(async () => {
    const result = await createTestApp()
    app = result.app
    validToken = result.token
  })

  afterAll(async () => {
    await app.close()
    _resetForTest()
  })

  beforeEach(() => { _resetForTest() })

  it('returns 410 CODE_CONSUMED on second claim attempt', async () => {
    const genRes = await app.inject({
      method: 'POST',
      url: '/api/pairing/generate',
      headers: { Authorization: `Bearer ${validToken}` }
    })
    const { code } = JSON.parse(genRes.body)

    // First claim — should succeed
    await app.inject({
      method: 'POST',
      url: '/api/pairing/claim',
      payload: { code }
    })

    // Second claim — should return 410
    const response = await app.inject({
      method: 'POST',
      url: '/api/pairing/claim',
      payload: { code }
    })

    expect(response.statusCode).toBe(410)
    const body = JSON.parse(response.body)
    expect(body.success).toBe(false)
    expect(body.error).toBe('CODE_CONSUMED')
  })

  it('returns 404 CODE_INVALID for unknown code', async () => {
    await app.inject({
      method: 'POST',
      url: '/api/pairing/generate',
      headers: { Authorization: `Bearer ${validToken}` }
    })

    const response = await app.inject({
      method: 'POST',
      url: '/api/pairing/claim',
      payload: { code: 'XXXXXX' }
    })

    expect(response.statusCode).toBe(404)
    const body = JSON.parse(response.body)
    expect(body.success).toBe(false)
    expect(body.error).toBe('CODE_INVALID')
  })

  it('returns 404 CODE_INVALID when no code has been generated', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/api/pairing/claim',
      payload: { code: 'AAAAAA' }
    })

    expect(response.statusCode).toBe(404)
    const body = JSON.parse(response.body)
    expect(body.success).toBe(false)
    expect(body.error).toBe('CODE_INVALID')
  })

})

// ────────────────────────────────────────────────────────────────
// Claim — input validation (own app instance to stay under rate limit)
// ────────────────────────────────────────────────────────────────

describe('POST /api/pairing/claim — input validation', () => {
  let app: FastifyInstance

  beforeAll(async () => {
    const result = await createTestApp()
    app = result.app
    _resetForTest()
  })

  afterAll(async () => {
    await app.close()
    _resetForTest()
  })

  it('returns 400 INVALID_INPUT when no body is provided', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/api/pairing/claim'
    })

    expect(response.statusCode).toBe(400)
    const body = JSON.parse(response.body)
    expect(body.success).toBe(false)
    expect(body.error).toBe('INVALID_INPUT')
  })

  it('returns 400 INVALID_INPUT when code is empty string', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/api/pairing/claim',
      payload: { code: '' }
    })

    expect(response.statusCode).toBe(400)
    const body = JSON.parse(response.body)
    expect(body.success).toBe(false)
    expect(body.error).toBe('INVALID_INPUT')
  })
})

// ────────────────────────────────────────────────────────────────
// SETUP_ONLY_ALLOWLIST verification
// ────────────────────────────────────────────────────────────────

describe('/api/pairing/ in SETUP_ONLY_ALLOWLIST', () => {
  let app: FastifyInstance

  beforeAll(async () => {
    const result = await createTestApp()
    app = result.app
    _resetForTest()
  })

  afterAll(async () => {
    await app.close()
    _resetForTest()
  })

  it('claim endpoint does not return 503 (allowlisted for setup-only mode)', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/api/pairing/claim',
      payload: { code: 'AAAAAA' }
    })

    // 4xx expected (invalid code), not 503 (setup-only block)
    expect(response.statusCode).not.toBe(503)
    expect([400, 404, 429]).toContain(response.statusCode)
  })
})

// ────────────────────────────────────────────────────────────────
// Rate limit test — fresh app, all 6 calls in one test
// ────────────────────────────────────────────────────────────────

describe('POST /api/pairing/claim — rate limiting', () => {
  let app: FastifyInstance

  beforeAll(async () => {
    const result = await createTestApp()
    app = result.app
    _resetForTest()
  })

  afterAll(async () => {
    await app.close()
    _resetForTest()
  })

  it('returns 429 on the 6th claim request per minute per IP', async () => {
    // Send 5 requests — each returns 404 (invalid code) but counts toward rate limit
    for (let i = 0; i < 5; i++) {
      const res = await app.inject({
        method: 'POST',
        url: '/api/pairing/claim',
        payload: { code: 'AAAAAA' }
      })
      expect(res.statusCode).toBe(404)
    }

    // 6th request should be rate limited
    const response = await app.inject({
      method: 'POST',
      url: '/api/pairing/claim',
      payload: { code: 'AAAAAA' }
    })

    expect(response.statusCode).toBe(429)
  })
})
