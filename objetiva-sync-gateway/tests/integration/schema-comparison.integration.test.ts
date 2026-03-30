/**
 * Integration Tests: Schema Comparison Routes (Phase 26, Plan 00)
 *
 * Verifies:
 * - POST /api/schemas/report — auth (401), validation (400 for invalid body, 400 for empty schemas), 200 happy path
 * - GET /api/schemas/compare — auth (401), 200 returns 4 entities, sync_reported state before/after POST
 *
 * Pattern follows pairing.integration.test.ts exactly:
 * - Uses buildApp() + app.inject() (NOT real HTTP)
 * - Uses app.jwt.sign() for test tokens
 * - Each describe block uses its own app instance to avoid cross-contamination
 *
 * NOTE: These tests will FAIL because:
 * 1. The sync-schema-store module does not exist yet (import fails)
 * 2. The schema comparison routes are not registered in app.ts yet
 * This is expected RED phase behavior (Wave 0).
 * Tests will pass once Plans 01 and 02 complete implementation.
 *
 * NOTE: Tests 6-8 (GET /api/schemas/compare entity content) depend on
 * a working PostgreSQL connection for IntrospectionService. In CI without
 * a live DB, those tests may fail with a DB connection error rather than
 * an assertion error — that is expected behavior.
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest'
import { buildApp } from '../../src/app.js'
import { _resetForTest } from '../../src/services/sync-schema-store.js'
import type { FastifyInstance } from 'fastify'

// ────────────────────────────────────────────────────────────────
// Test App Helper
// ────────────────────────────────────────────────────────────────

async function createTestApp() {
  process.env.JWT_SECRET = 'test-jwt-secret-for-schema-comparison-32chars'
  process.env.JWT_EXPIRES_IN = '1h'

  const app = await buildApp()
  await app.ready()
  const token = app.jwt.sign({ username: 'admin', authenticated: true })
  return { app, token }
}

// ────────────────────────────────────────────────────────────────
// Valid schema fixture for POST body
// ────────────────────────────────────────────────────────────────

const validSchemaPayload = {
  schemas: [
    {
      entity: 'articulos',
      columns: [
        {
          column_name: 'id',
          data_type: 'integer',
          is_nullable: false,
          default_value: null,
        },
      ],
      constraints: [],
    },
  ],
}

// ────────────────────────────────────────────────────────────────
// POST /api/schemas/report — auth
// ────────────────────────────────────────────────────────────────

describe('POST /api/schemas/report — authentication', () => {
  let app: FastifyInstance

  beforeAll(async () => {
    const result = await createTestApp()
    app = result.app
  })

  afterAll(async () => {
    await app.close()
    _resetForTest()
  })

  beforeEach(() => { _resetForTest() })

  it('returns 401 without Authorization header', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/api/schemas/report',
      payload: { schemas: [] },
    })

    expect(response.statusCode).toBe(401)
  })

  it('returns 401 with invalid token', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/api/schemas/report',
      headers: { Authorization: 'Bearer not-a-valid-jwt' },
      payload: validSchemaPayload,
    })

    expect(response.statusCode).toBe(401)
  })
})

// ────────────────────────────────────────────────────────────────
// POST /api/schemas/report — validation
// ────────────────────────────────────────────────────────────────

describe('POST /api/schemas/report — validation', () => {
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

  it('returns 400 with VALIDATION_ERROR when body has schemas as non-array', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/api/schemas/report',
      headers: { Authorization: `Bearer ${validToken}` },
      payload: { schemas: 'not-an-array' },
    })

    expect(response.statusCode).toBe(400)
    const body = JSON.parse(response.body)
    expect(body.code).toBe('VALIDATION_ERROR')
  })

  it('returns 400 when schemas is an empty array (min(1) validation)', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/api/schemas/report',
      headers: { Authorization: `Bearer ${validToken}` },
      payload: { schemas: [] },
    })

    expect(response.statusCode).toBe(400)
    const body = JSON.parse(response.body)
    expect(body.code).toBe('VALIDATION_ERROR')
  })

  it('returns 400 when schemas array contains items with missing required fields', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/api/schemas/report',
      headers: { Authorization: `Bearer ${validToken}` },
      payload: {
        schemas: [
          {
            // missing entity field
            columns: [],
            constraints: [],
          },
        ],
      },
    })

    expect(response.statusCode).toBe(400)
    const body = JSON.parse(response.body)
    expect(body.code).toBe('VALIDATION_ERROR')
  })
})

// ────────────────────────────────────────────────────────────────
// POST /api/schemas/report — happy path
// ────────────────────────────────────────────────────────────────

describe('POST /api/schemas/report — happy path', () => {
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

  it('returns 200 with { success: true } for valid body with 1 schema', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/api/schemas/report',
      headers: { Authorization: `Bearer ${validToken}` },
      payload: validSchemaPayload,
    })

    expect(response.statusCode).toBe(200)
    const body = JSON.parse(response.body)
    expect(body.success).toBe(true)
  })

  it('returns 200 with valid body containing all 4 entity schemas', async () => {
    const fullPayload = {
      schemas: [
        {
          entity: 'articulos',
          columns: [{ column_name: 'id', data_type: 'integer', is_nullable: false, default_value: null }],
          constraints: [],
        },
        {
          entity: 'comprobantes_cabecera',
          columns: [{ column_name: 'id', data_type: 'integer', is_nullable: false, default_value: null }],
          constraints: [],
        },
        {
          entity: 'comprobantes_detalle',
          columns: [{ column_name: 'id', data_type: 'integer', is_nullable: false, default_value: null }],
          constraints: [],
        },
        {
          entity: 'comprobantes_pagos',
          columns: [{ column_name: 'id', data_type: 'integer', is_nullable: false, default_value: null }],
          constraints: [],
        },
      ],
    }

    const response = await app.inject({
      method: 'POST',
      url: '/api/schemas/report',
      headers: { Authorization: `Bearer ${validToken}` },
      payload: fullPayload,
    })

    expect(response.statusCode).toBe(200)
    const body = JSON.parse(response.body)
    expect(body.success).toBe(true)
  })
})

// ────────────────────────────────────────────────────────────────
// GET /api/schemas/compare — authentication
// ────────────────────────────────────────────────────────────────

describe('GET /api/schemas/compare — authentication', () => {
  let app: FastifyInstance

  beforeAll(async () => {
    const result = await createTestApp()
    app = result.app
  })

  afterAll(async () => {
    await app.close()
    _resetForTest()
  })

  it('returns 401 without Authorization header', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/api/schemas/compare',
    })

    expect(response.statusCode).toBe(401)
  })
})

// ────────────────────────────────────────────────────────────────
// GET /api/schemas/compare — response structure and sync_reported state
// ────────────────────────────────────────────────────────────────

describe('GET /api/schemas/compare — response structure', () => {
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

  it('returns 200 with an array of 4 entities (one per sync entity)', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/api/schemas/compare',
      headers: { Authorization: `Bearer ${validToken}` },
    })

    expect(response.statusCode).toBe(200)
    const body = JSON.parse(response.body)
    expect(Array.isArray(body)).toBe(true)
    expect(body).toHaveLength(4)
  })

  it('each entity in response has required shape: entity, sync_reported, summary, fields', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/api/schemas/compare',
      headers: { Authorization: `Bearer ${validToken}` },
    })

    expect(response.statusCode).toBe(200)
    const body = JSON.parse(response.body)

    for (const entity of body) {
      expect(typeof entity.entity).toBe('string')
      expect(typeof entity.sync_reported).toBe('boolean')
      expect(typeof entity.summary).toBe('object')
      expect(typeof entity.summary.aligned).toBe('number')
      expect(typeof entity.summary.mismatched).toBe('number')
      expect(typeof entity.summary.missing).toBe('number')
      expect(Array.isArray(entity.fields)).toBe(true)
    }
  })

  it('sync_reported is false for all entities when POST /api/schemas/report was never called', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/api/schemas/compare',
      headers: { Authorization: `Bearer ${validToken}` },
    })

    expect(response.statusCode).toBe(200)
    const body = JSON.parse(response.body)

    for (const entity of body) {
      expect(entity.sync_reported).toBe(false)
    }
  })

  it('after POST report with an entity, sync_reported becomes true for all entities', async () => {
    // Report schemas first
    const postResponse = await app.inject({
      method: 'POST',
      url: '/api/schemas/report',
      headers: { Authorization: `Bearer ${validToken}` },
      payload: validSchemaPayload,
    })
    expect(postResponse.statusCode).toBe(200)

    // Then compare
    const getResponse = await app.inject({
      method: 'GET',
      url: '/api/schemas/compare',
      headers: { Authorization: `Bearer ${validToken}` },
    })

    expect(getResponse.statusCode).toBe(200)
    const body = JSON.parse(getResponse.body)

    // After any POST report, sync_reported should be true for all entities
    for (const entity of body) {
      expect(entity.sync_reported).toBe(true)
    }
  })
})
