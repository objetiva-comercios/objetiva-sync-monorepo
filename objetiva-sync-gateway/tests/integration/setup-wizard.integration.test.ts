/**
 * Setup Wizard Integration Tests (Phase 19, Plan 01)
 *
 * Verifies the new wizard endpoints:
 * - POST /api/setup/save-domain — saves GATEWAY_PUBLIC_URL, returns assembled URL
 * - GET /api/setup/generate-env — returns merged .env content with download headers
 * - GET /api/setup/status — includes gatewayUrl field
 *
 * Uses buildApp() with inject() for fast in-process testing.
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { buildApp } from '../../src/app.js'
import type { FastifyInstance } from 'fastify'
import fs from 'fs/promises'
import path from 'path'
import os from 'os'

let app: FastifyInstance
let testEnvDir: string
let originalCwd: string

beforeAll(async () => {
  // Create a temp directory with a .env file so generate-env has content to return
  testEnvDir = await fs.mkdtemp(path.join(os.tmpdir(), 'gw-test-'))
  await fs.writeFile(path.join(testEnvDir, '.env'), 'DATABASE_URL=postgresql://test:test@localhost:5432/testdb\nJWT_SECRET=test-secret\n')
  await fs.writeFile(
    path.join(testEnvDir, '.env.example'),
    '# Database\nDATABASE_URL=\n# JWT\nJWT_SECRET=\n# Gateway public URL\n# GATEWAY_PUBLIC_URL=\n'
  )

  // Store original cwd and switch to the temp dir so routes resolve .env correctly
  originalCwd = process.cwd()
  process.chdir(testEnvDir)

  process.env.JWT_SECRET = process.env.JWT_SECRET || 'change-me-in-production'
  process.env.JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || '86400'

  app = await buildApp()
  await app.ready()
})

afterAll(async () => {
  await app.close()
  process.chdir(originalCwd)
  await fs.rm(testEnvDir, { recursive: true, force: true })
})

describe('POST /api/setup/save-domain', () => {
  it('returns 200 with assembled URL (no port)', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/api/setup/save-domain',
      payload: { protocol: 'https', domain: 'gw.example.com' }
    })

    expect(response.statusCode).toBe(200)
    const body = JSON.parse(response.body)
    expect(body.success).toBe(true)
    expect(body.url).toBe('https://gw.example.com')
  })

  it('returns 200 with non-default port in URL', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/api/setup/save-domain',
      payload: { protocol: 'https', domain: 'gw.example.com', port: '8443' }
    })

    expect(response.statusCode).toBe(200)
    const body = JSON.parse(response.body)
    expect(body.success).toBe(true)
    expect(body.url).toBe('https://gw.example.com:8443')
  })

  it('omits default https port 443 from URL', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/api/setup/save-domain',
      payload: { protocol: 'https', domain: 'gw.example.com', port: '443' }
    })

    expect(response.statusCode).toBe(200)
    const body = JSON.parse(response.body)
    expect(body.url).toBe('https://gw.example.com')
  })

  it('omits default http port 80 from URL', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/api/setup/save-domain',
      payload: { protocol: 'http', domain: 'gw.example.com', port: '80' }
    })

    expect(response.statusCode).toBe(200)
    const body = JSON.parse(response.body)
    expect(body.url).toBe('http://gw.example.com')
  })

  it('returns 400 when domain is empty', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/api/setup/save-domain',
      payload: { protocol: 'https', domain: '' }
    })

    expect(response.statusCode).toBe(400)
  })

  it('returns 400 when domain contains invalid characters', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/api/setup/save-domain',
      payload: { protocol: 'https', domain: 'bad domain!' }
    })

    expect(response.statusCode).toBe(400)
  })
})

describe('GET /api/setup/generate-env', () => {
  it('returns 200 with text/plain content type', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/api/setup/generate-env'
    })

    expect(response.statusCode).toBe(200)
    expect(response.headers['content-type']).toMatch(/text\/plain/)
  })

  it('has Content-Disposition attachment header with .env filename', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/api/setup/generate-env'
    })

    expect(response.headers['content-disposition']).toMatch(/attachment/)
    expect(response.headers['content-disposition']).toMatch(/\.env/)
  })

  it('response body contains key=value lines from current .env', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/api/setup/generate-env'
    })

    expect(response.body).toContain('DATABASE_URL=')
    expect(response.body).toContain('JWT_SECRET=')
  })
})

describe('GET /api/setup/status includes gatewayUrl', () => {
  it('status response includes gatewayUrl field', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/api/setup/status'
    })

    expect(response.statusCode).toBe(200)
    const body = JSON.parse(response.body)
    expect(body).toHaveProperty('gatewayUrl')
  })
})
