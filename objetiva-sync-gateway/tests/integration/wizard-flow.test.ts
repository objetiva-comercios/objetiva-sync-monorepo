/**
 * Wizard Flow Integration Tests (Phase 23, Plan 01)
 *
 * Verifies the complete setup wizard flow end-to-end:
 * - save-domain -> save-jwt-secret -> apply-config -> setup/token -> pairing/generate
 * - Token endpoint survives mode transition from setup-only to normal (the 403 bug fix)
 * - Token endpoint locks after setupComplete=true (security lockout)
 *
 * DB-dependent steps (test-db, Prisma migrations in apply-config) are mocked.
 * Focus: HTTP flow and mode transitions per CONTEXT.md decision.
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest'
import { buildApp } from '../../src/app.js'
import { systemState } from '../../src/lib/system-state.js'
import { _resetForTest } from '../../src/lib/pairing-store.js'
import type { FastifyInstance } from 'fastify'
import fs from 'fs/promises'
import path from 'path'
import os from 'os'

// Mock child_process.execSync to prevent real Prisma migrations during apply-config
vi.mock('child_process', () => ({
  execSync: vi.fn(() => Buffer.from('mock: migrations applied'))
}))

let app: FastifyInstance
let testEnvDir: string
let originalCwd: string

beforeAll(async () => {
  // Create a temp directory with .env so wizard endpoints can read/write it
  testEnvDir = await fs.mkdtemp(path.join(os.tmpdir(), 'gw-wizard-flow-'))
  await fs.writeFile(path.join(testEnvDir, '.env'), 'DATABASE_URL=postgresql://test:test@localhost:5432/testdb\n')
  await fs.writeFile(
    path.join(testEnvDir, '.env.example'),
    '# Database\nDATABASE_URL=\n# JWT\nJWT_SECRET=\n# Gateway public URL\n# GATEWAY_PUBLIC_URL=\n'
  )

  // Create a minimal prisma/migrations directory for apply-config baseline logic
  const migrationsDir = path.join(testEnvDir, 'prisma', 'migrations')
  await fs.mkdir(migrationsDir, { recursive: true })

  originalCwd = process.cwd()
  process.chdir(testEnvDir)

  process.env.JWT_SECRET = 'test-jwt-secret-for-wizard-flow-32chars!!'
  process.env.JWT_EXPIRES_IN = '86400'
  process.env.DATABASE_URL = 'postgresql://test:test@localhost:5432/testdb'

  app = await buildApp()
  await app.ready()
})

afterAll(async () => {
  await app.close()
  process.chdir(originalCwd)
  await fs.rm(testEnvDir, { recursive: true, force: true })
})

describe('Wizard flow end-to-end', () => {
  beforeEach(() => {
    systemState.startupMode = 'setup-only'
    systemState.setupComplete = false
    systemState.dbConnected = false
    _resetForTest()
  })

  it('full wizard flow: save-domain -> save-jwt-secret -> apply-config -> token -> pairing/generate', async () => {
    // Step 1: Save domain
    const domainRes = await app.inject({
      method: 'POST',
      url: '/api/setup/save-domain',
      payload: { url: 'https://gateway.example.com' }
    })
    expect(domainRes.statusCode).toBe(200)
    const domainBody = JSON.parse(domainRes.body)
    expect(domainBody.success).toBe(true)

    // Step 2: Save JWT secret
    const jwtRes = await app.inject({
      method: 'POST',
      url: '/api/setup/save-jwt-secret',
      payload: { jwtSecret: 'a'.repeat(64) }
    })
    expect(jwtRes.statusCode).toBe(200)
    const jwtBody = JSON.parse(jwtRes.body)
    expect(jwtBody.success).toBe(true)

    // Step 3: Apply config (transitions mode from setup-only -> normal)
    // Prisma migrations are mocked via vi.mock('child_process')
    const applyRes = await app.inject({
      method: 'POST',
      url: '/api/setup/apply-config',
      payload: {}
    })
    expect(applyRes.statusCode).toBe(200)
    const applyBody = JSON.parse(applyRes.body)
    expect(applyBody.success).toBe(true)

    // Verify mode transition happened
    expect(systemState.startupMode).toBe('normal')

    // Step 4: Get token (THE BUG FIX — must work even though mode is now 'normal')
    const tokenRes = await app.inject({
      method: 'POST',
      url: '/api/setup/token'
    })
    expect(tokenRes.statusCode).toBe(200)
    const tokenBody = JSON.parse(tokenRes.body)
    expect(tokenBody.success).toBe(true)
    expect(tokenBody.token).toBeDefined()
    expect(typeof tokenBody.token).toBe('string')
    expect(tokenBody.token.split('.')).toHaveLength(3) // Valid JWT

    // Step 5: Generate pairing code using the token
    const pairingRes = await app.inject({
      method: 'POST',
      url: '/api/pairing/generate',
      headers: { Authorization: `Bearer ${tokenBody.token}` }
    })
    expect(pairingRes.statusCode).toBe(200)
    const pairingBody = JSON.parse(pairingRes.body)
    expect(pairingBody.success).toBe(true)
    expect(pairingBody.code).toBeDefined()
    expect(pairingBody.code).toHaveLength(6)
  })

  it('POST /api/setup/token returns 403 after setupComplete is true (lockout)', async () => {
    // Start in normal mode, setupComplete=false -> token works
    systemState.startupMode = 'normal'
    systemState.setupComplete = false

    const beforeRes = await app.inject({
      method: 'POST',
      url: '/api/setup/token'
    })
    expect(beforeRes.statusCode).toBe(200)

    // Simulate successful claim -> setupComplete = true
    systemState.setupComplete = true

    const afterRes = await app.inject({
      method: 'POST',
      url: '/api/setup/token'
    })
    expect(afterRes.statusCode).toBe(403)
    const body = JSON.parse(afterRes.body)
    expect(body.success).toBe(false)
    expect(body.error).toBe('Only available during setup')
  })

  it('POST /api/setup/token returns 200 in setup-only mode', async () => {
    systemState.startupMode = 'setup-only'
    systemState.setupComplete = false

    const res = await app.inject({
      method: 'POST',
      url: '/api/setup/token'
    })
    expect(res.statusCode).toBe(200)
    const body = JSON.parse(res.body)
    expect(body.success).toBe(true)
    expect(body.token).toBeDefined()
  })
})
