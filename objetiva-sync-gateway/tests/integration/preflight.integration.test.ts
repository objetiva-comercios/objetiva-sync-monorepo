/**
 * Preflight Integration Tests (Phase 18, Plan 02)
 *
 * Verifies the GET /api/setup/preflight endpoint:
 * - Returns 200 with { ready, checks, timestamp }
 * - checks array has exactly 5 items with correct ids
 * - Each check has required fields (id, name, status, message, remediation)
 * - jwt_configured returns "warn" when using default secret
 * - env_file_writable returns "pass" when .env is writable
 *
 * Uses buildApp() with inject() for fast in-process testing.
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { buildApp } from '../../src/app.js'
import type { FastifyInstance } from 'fastify'

const EXPECTED_CHECK_IDS = [
  'env_vars',
  'db_connectivity',
  'db_tables',
  'jwt_configured',
  'env_file_writable'
]

describe('Preflight Integration Tests', () => {
  let app: FastifyInstance

  beforeAll(async () => {
    // Set default JWT secret so jwt_configured check returns "warn"
    process.env.JWT_SECRET = 'change-me-in-production'
    process.env.JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || '1h'

    app = await buildApp()
    await app.ready()
  })

  afterAll(async () => {
    await app.close()
  })

  describe('GET /api/setup/preflight', () => {
    it('should return 200 with ready, checks, and timestamp', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/api/setup/preflight'
      })

      expect(response.statusCode).toBe(200)
      const body = JSON.parse(response.body)
      expect(typeof body.ready).toBe('boolean')
      expect(Array.isArray(body.checks)).toBe(true)
      expect(typeof body.timestamp).toBe('string')
      // timestamp must be a valid ISO 8601 date
      expect(new Date(body.timestamp).toString()).not.toBe('Invalid Date')
    })

    it('should return exactly 5 checks', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/api/setup/preflight'
      })

      const body = JSON.parse(response.body)
      expect(body.checks).toHaveLength(5)
    })

    it('should have checks with correct ids in order', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/api/setup/preflight'
      })

      const body = JSON.parse(response.body)
      const ids = body.checks.map((c: { id: string }) => c.id)
      expect(ids).toEqual(EXPECTED_CHECK_IDS)
    })

    it('each check should have required fields (id, name, status, message, remediation)', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/api/setup/preflight'
      })

      const body = JSON.parse(response.body)
      for (const check of body.checks) {
        expect(check).toHaveProperty('id')
        expect(check).toHaveProperty('name')
        expect(check).toHaveProperty('status')
        expect(check).toHaveProperty('message')
        expect(check).toHaveProperty('remediation')
        expect(['pass', 'fail', 'warn']).toContain(check.status)
        expect(typeof check.name).toBe('string')
        expect(typeof check.message).toBe('string')
      }
    })

    it('jwt_configured should return "warn" when using default secret', async () => {
      // JWT_SECRET is set to default "change-me-in-production" in beforeAll
      const response = await app.inject({
        method: 'GET',
        url: '/api/setup/preflight'
      })

      const body = JSON.parse(response.body)
      const jwtCheck = body.checks.find((c: { id: string }) => c.id === 'jwt_configured')
      expect(jwtCheck).toBeDefined()
      expect(jwtCheck.status).toBe('warn')
    })

    it('env_file_writable should return "pass" in test env', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/api/setup/preflight'
      })

      const body = JSON.parse(response.body)
      const writableCheck = body.checks.find((c: { id: string }) => c.id === 'env_file_writable')
      expect(writableCheck).toBeDefined()
      expect(writableCheck.status).toBe('pass')
    })

    it('ready should be false when any critical check fails', async () => {
      // In test env, DB may not be connected — ready may be false
      const response = await app.inject({
        method: 'GET',
        url: '/api/setup/preflight'
      })

      const body = JSON.parse(response.body)
      const hasFail = body.checks.some((c: { status: string }) => c.status === 'fail')
      const hasWarn = body.checks.some((c: { status: string }) => c.status === 'warn')

      if (hasFail || hasWarn) {
        expect(body.ready).toBe(false)
      } else {
        expect(body.ready).toBe(true)
      }
    })
  })
})
