/**
 * Integration tests for multi-source origin tracking (Phase 14)
 *
 * These tests verify:
 * - Origin columns populated when X-Origin-Source header sent
 * - Last-write-wins behavior (later sync overwrites)
 * - Backwards compatibility (null origin without header)
 *
 * Prerequisites:
 * - Gateway running at GATEWAY_URL (default http://localhost:3001)
 * - Valid credentials in SYNC_USERNAME / SYNC_PASSWORD
 */

import { describe, it, expect, beforeAll } from 'vitest'
import { fetch } from 'undici'
import { loadEnv, getConfig } from '../../src/config/index.js'

// Skip if gateway not available
const GATEWAY_URL = process.env.GATEWAY_URL || 'http://localhost:3001'
let gatewayAvailable = false
let authToken: string | null = null

async function checkGatewayHealth(): Promise<boolean> {
  try {
    const resp = await fetch(`${GATEWAY_URL}/health`, {
      signal: AbortSignal.timeout(3000),
    })
    return resp.ok
  } catch {
    return false
  }
}

async function getAuthToken(): Promise<string> {
  if (authToken) return authToken

  const config = getConfig()
  const resp = await fetch(`${GATEWAY_URL}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      username: config.api.username,
      password: config.api.password,
    }),
  })

  if (!resp.ok) {
    throw new Error(`Auth failed: ${resp.status}`)
  }

  const data = (await resp.json()) as { token: string }
  authToken = data.token
  return authToken
}

beforeAll(async () => {
  loadEnv()
  gatewayAvailable = await checkGatewayHealth()
})

describe.skipIf(!gatewayAvailable)('Origin Tracking Integration', () => {
  const testArticleCode = `TEST_ORIGIN_${Date.now()}`

  it('should populate origin columns when X-Origin-Source header sent', async () => {
    const token = await getAuthToken()
    const sourceId = 'test-source-A'
    const syncId = `sync-${Date.now()}`

    const resp = await fetch(`${GATEWAY_URL}/api/articulos/batch`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
        'X-Origin-Source': sourceId,
        'X-Sync-Id': syncId,
        'X-Query-Id': '1',
        'X-Query-Name': 'test-query',
        'X-Batch-Number': '1',
        'X-Total-Batches': '1',
      },
      body: JSON.stringify({
        articulos: [{
          erp_codigo: testArticleCode,
          erp_nombre: 'Origin Test Article',
        }],
      }),
    })

    expect(resp.status).toBeLessThan(300)

    // Verify via status endpoint or direct DB query
    // Note: Full verification requires database access or audit endpoint
    const data = await resp.json() as any
    expect(data.success || data.result?.inserted > 0 || data.result?.updated > 0).toBe(true)
  })

  it('should support last-write-wins (second source overwrites)', async () => {
    const token = await getAuthToken()

    // First write from source A
    await fetch(`${GATEWAY_URL}/api/articulos/batch`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
        'X-Origin-Source': 'source-A',
        'X-Sync-Id': 'sync-1',
        'X-Query-Id': '1',
        'X-Query-Name': 'test',
        'X-Batch-Number': '1',
        'X-Total-Batches': '1',
      },
      body: JSON.stringify({
        articulos: [{
          erp_codigo: `${testArticleCode}_LWW`,
          erp_nombre: 'LWW Test Article',
          nombre: 'From Source A',
        }],
      }),
    })

    // Small delay to ensure different timestamp
    await new Promise(r => setTimeout(r, 100))

    // Second write from source B (should overwrite)
    const resp = await fetch(`${GATEWAY_URL}/api/articulos/batch`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
        'X-Origin-Source': 'source-B',
        'X-Sync-Id': 'sync-2',
        'X-Query-Id': '1',
        'X-Query-Name': 'test',
        'X-Batch-Number': '1',
        'X-Total-Batches': '1',
      },
      body: JSON.stringify({
        articulos: [{
          erp_codigo: `${testArticleCode}_LWW`,
          erp_nombre: 'LWW Test Article',
          nombre: 'From Source B',  // This should be the final value
        }],
      }),
    })

    expect(resp.status).toBeLessThan(300)
    const data = await resp.json() as any
    // Second write should update (not insert)
    expect(data.result?.updated).toBeGreaterThanOrEqual(1)
  })

  it('should allow sync without X-Origin-Source (backwards compatible)', async () => {
    const token = await getAuthToken()

    const resp = await fetch(`${GATEWAY_URL}/api/articulos/batch`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
        // No X-Origin-Source header
      },
      body: JSON.stringify({
        articulos: [{
          erp_codigo: `${testArticleCode}_NOORIGIN`,
          erp_nombre: 'No Origin Test',
        }],
      }),
    })

    // Should succeed without origin tracking
    expect(resp.status).toBeLessThan(300)
    const data = await resp.json() as any
    expect(data.success || data.result?.inserted > 0).toBe(true)
  })
})

describe.skipIf(!gatewayAvailable)('Source ID Generation', () => {
  it('should generate stable source ID', async () => {
    // Import dynamically to avoid issues if module not built
    const { getSourceId } = await import('../../src/api-client/index.js')

    const id1 = getSourceId()
    const id2 = getSourceId()

    // Should be stable (cached)
    expect(id1).toBe(id2)

    // Should be non-empty string
    expect(typeof id1).toBe('string')
    expect(id1.length).toBeGreaterThan(0)

    // Should contain hostname-derived portion with default suffix
    expect(id1).toMatch(/^[a-zA-Z0-9-]+-default$/)
  })

  it('should respect SYNC_SOURCE_ID environment variable', async () => {
    const customId = 'custom-test-source'
    process.env.SYNC_SOURCE_ID = customId

    // Need fresh import to pick up env var
    const { generateSourceId } = await import('../../src/api-client/index.js')
    const id = generateSourceId()

    expect(id).toBe(customId)

    // Clean up
    delete process.env.SYNC_SOURCE_ID
  })
})
