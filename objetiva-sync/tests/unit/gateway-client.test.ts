/**
 * Unit Tests: gateway-client SQLite-first config reading (Phase 21, Plan 01)
 *
 * Tests that:
 * - getGatewayUrl() reads REMOTE_API_URL from SQLite, falls back to process.env.GATEWAY_URL
 * - getGatewayJwtSecret() reads JWT_SECRET from SQLite (decrypting if encrypted),
 *   falls back to process.env.JWT_SECRET
 * - getJwtToken() works with the async getGatewayJwtSecret()
 *
 * Strategy: Mock getConfig and decrypt to control what "SQLite" returns.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'

// ── Module mocks ──────────────────────────────────────────────────────────────

vi.mock('../../src/store/repositories/config-repo.js', () => ({
  getConfig: vi.fn(),
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

vi.mock('../../src/lib/correlation.js', () => ({
  getCorrelationId: vi.fn(() => null),
}))

// ── Imports after mocks ───────────────────────────────────────────────────────

import { getConfig } from '../../src/store/repositories/config-repo.js'
import { decrypt } from '../../src/utils/crypto.js'

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('gateway-client SQLite-first config reading', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    // Reset env vars to known state
    delete process.env.GATEWAY_URL
    delete process.env.JWT_SECRET
    // Reset module cache so we get a fresh module with fresh mocks
    vi.resetModules()
  })

  // ── getGatewayUrl ────────────────────────────────────────────────────────────

  describe('getGatewayUrl() (via notifyGatewayCancellation)', () => {
    it('uses SQLite REMOTE_API_URL when present', async () => {
      vi.mocked(getConfig).mockImplementation(async (key: string) => {
        if (key === 'REMOTE_API_URL') {
          return { key: 'REMOTE_API_URL', value: 'https://sqlite-gateway.example.com', encrypted: false, createdAt: '', updatedAt: null }
        }
        return null
      })

      // Re-import after resetModules to pick up fresh mocks
      vi.resetModules()
      // Re-apply mocks in new module context
      vi.doMock('../../src/store/repositories/config-repo.js', () => ({
        getConfig: vi.fn().mockImplementation(async (key: string) => {
          if (key === 'REMOTE_API_URL') {
            return { key: 'REMOTE_API_URL', value: 'https://sqlite-gateway.example.com', encrypted: false, createdAt: '', updatedAt: null }
          }
          return null
        }),
      }))
      vi.doMock('../../src/utils/crypto.js', () => ({
        encrypt: vi.fn((v: string) => `encrypted:${v}`),
        decrypt: vi.fn((v: string) => v.replace('encrypted:', '')),
      }))
      vi.doMock('../../src/utils/logger.js', () => ({
        logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
      }))
      vi.doMock('../../src/lib/correlation.js', () => ({
        getCorrelationId: vi.fn(() => null),
      }))

      const mod = await import('../../src/services/gateway-client.js')

      // notifyGatewayCancellation uses getGatewayUrl internally
      // We can verify via fetch mock that the correct URL was used
      const fetchMock = vi.spyOn(global, 'fetch').mockResolvedValue({
        ok: true,
        status: 200,
        json: vi.fn(),
      } as unknown as Response)

      await mod.notifyGatewayCancellation('sync-123')

      expect(fetchMock).toHaveBeenCalledWith(
        'https://sqlite-gateway.example.com/api/sync/sync-123/cancel',
        expect.anything()
      )
    })

    it('falls back to process.env.GATEWAY_URL when SQLite has no value', async () => {
      process.env.GATEWAY_URL = 'http://env-gateway.local:3335'

      vi.resetModules()
      vi.doMock('../../src/store/repositories/config-repo.js', () => ({
        getConfig: vi.fn().mockResolvedValue(null),
      }))
      vi.doMock('../../src/utils/crypto.js', () => ({
        encrypt: vi.fn((v: string) => `encrypted:${v}`),
        decrypt: vi.fn((v: string) => v.replace('encrypted:', '')),
      }))
      vi.doMock('../../src/utils/logger.js', () => ({
        logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
      }))
      vi.doMock('../../src/lib/correlation.js', () => ({
        getCorrelationId: vi.fn(() => null),
      }))

      const mod = await import('../../src/services/gateway-client.js')

      const fetchMock = vi.spyOn(global, 'fetch').mockResolvedValue({
        ok: true,
        status: 200,
        json: vi.fn(),
      } as unknown as Response)

      await mod.notifyGatewayCancellation('sync-456')

      expect(fetchMock).toHaveBeenCalledWith(
        'http://env-gateway.local:3335/api/sync/sync-456/cancel',
        expect.anything()
      )
    })
  })

  // ── getJwtToken ──────────────────────────────────────────────────────────────

  describe('getJwtToken()', () => {
    it('uses decrypted SQLite JWT_SECRET when present and encrypted', async () => {
      vi.resetModules()
      vi.doMock('../../src/store/repositories/config-repo.js', () => ({
        getConfig: vi.fn().mockImplementation(async (key: string) => {
          if (key === 'JWT_SECRET') {
            return { key: 'JWT_SECRET', value: 'encrypted:my-jwt-secret-32-chars-padding!', encrypted: true, createdAt: '', updatedAt: null }
          }
          return null
        }),
      }))
      vi.doMock('../../src/utils/crypto.js', () => ({
        encrypt: vi.fn((v: string) => `encrypted:${v}`),
        decrypt: vi.fn((v: string) => v.replace('encrypted:', '')),
      }))
      vi.doMock('../../src/utils/logger.js', () => ({
        logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
      }))
      vi.doMock('../../src/lib/correlation.js', () => ({
        getCorrelationId: vi.fn(() => null),
      }))
      // fast-jwt needs to be real for token signing
      vi.doMock('fast-jwt', async () => {
        const actual = await vi.importActual('fast-jwt') as Record<string, unknown>
        return actual
      })

      const mod = await import('../../src/services/gateway-client.js')

      // Should not throw because JWT_SECRET from SQLite is used
      const token = await mod.getJwtToken()
      expect(typeof token).toBe('string')
      expect(token.length).toBeGreaterThan(0)
    })

    it('falls back to process.env.JWT_SECRET when SQLite has no JWT_SECRET', async () => {
      process.env.JWT_SECRET = 'env-jwt-secret-32-chars-for-tests!'

      vi.resetModules()
      vi.doMock('../../src/store/repositories/config-repo.js', () => ({
        getConfig: vi.fn().mockResolvedValue(null),
      }))
      vi.doMock('../../src/utils/crypto.js', () => ({
        encrypt: vi.fn((v: string) => `encrypted:${v}`),
        decrypt: vi.fn((v: string) => v.replace('encrypted:', '')),
      }))
      vi.doMock('../../src/utils/logger.js', () => ({
        logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
      }))
      vi.doMock('../../src/lib/correlation.js', () => ({
        getCorrelationId: vi.fn(() => null),
      }))
      vi.doMock('fast-jwt', async () => {
        const actual = await vi.importActual('fast-jwt') as Record<string, unknown>
        return actual
      })

      const mod = await import('../../src/services/gateway-client.js')

      const token = await mod.getJwtToken()
      expect(typeof token).toBe('string')
      expect(token.length).toBeGreaterThan(0)
    })

    it('throws when neither SQLite nor env has JWT_SECRET', async () => {
      delete process.env.JWT_SECRET

      vi.resetModules()
      vi.doMock('../../src/store/repositories/config-repo.js', () => ({
        getConfig: vi.fn().mockResolvedValue(null),
      }))
      vi.doMock('../../src/utils/crypto.js', () => ({
        encrypt: vi.fn((v: string) => `encrypted:${v}`),
        decrypt: vi.fn((v: string) => v.replace('encrypted:', '')),
      }))
      vi.doMock('../../src/utils/logger.js', () => ({
        logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
      }))
      vi.doMock('../../src/lib/correlation.js', () => ({
        getCorrelationId: vi.fn(() => null),
      }))

      const mod = await import('../../src/services/gateway-client.js')

      await expect(mod.getJwtToken()).rejects.toThrow('JWT_SECRET')
    })
  })
})
