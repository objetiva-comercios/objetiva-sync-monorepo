/**
 * Unit Tests: 207 Multi-Status conditional success logic in all 4 API clients
 * (Phase 25, Plans 00 + 02)
 *
 * Tests that:
 * - 207 response with errors.length === 0 returns success: true
 * - 207 response with errors.length > 0 returns success: false
 * - 207/0-errors logs at logger.info level with "Batch exitoso, sin errores"
 * - 207/errors>0 logs at logger.warn level with "207 Multi-Status"
 * - articulos-client preserves data.result fallback (not data fallback)
 * - other 3 clients preserve data fallback (not data.result fallback)
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'

// ── Module mocks ──────────────────────────────────────────────────────────────

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

vi.mock('../../src/utils/error-classifier.js', () => ({
  classifyError: vi.fn(() => ({
    code: 'UNKNOWN',
    message: 'Unknown error',
    rootCause: 'Unknown',
    isRetryable: false,
  })),
}))

vi.mock('../../src/config/constants.js', () => ({
  SYNC_CONFIG: {
    BATCH_SIZE_DEFAULT: 100,
    MAX_RETRIES: 3,
    RETRY_DELAY_MS: 1000,
  },
}))

vi.mock('../../src/services/gateway-client.js', () => ({
  getJwtToken: vi.fn(async () => 'test-token'),
  notifyGatewayCancellation: vi.fn(),
}))

vi.mock('../../src/api-client/index.js', () => ({
  getSourceId: vi.fn(() => 'test-source'),
}))

// ── Imports after mocks ───────────────────────────────────────────────────────

import { logger } from '../../src/utils/logger.js'
import { ArticulosClient } from '../../src/api-client/articulos-client.js'
import { ComprobantesCabeceraClient } from '../../src/api-client/comprobantes-cabecera-client.js'
import { ComprobantesDetalleClient } from '../../src/api-client/comprobantes-detalle-client.js'
import { ComprobantesPagosClient } from '../../src/api-client/comprobantes-pagos-client.js'

// ── Helpers ───────────────────────────────────────────────────────────────────

/**
 * Build a mock Response with a given status and JSON body.
 */
function mockResponse(status: number, body: unknown): Response {
  return {
    status,
    ok: status >= 200 && status < 300,
    json: vi.fn(async () => body),
    headers: new Headers(),
    redirected: false,
    statusText: String(status),
    type: 'basic',
    url: '',
    body: null,
    bodyUsed: false,
    arrayBuffer: vi.fn(),
    blob: vi.fn(),
    clone: vi.fn(),
    formData: vi.fn(),
    text: vi.fn(),
  } as unknown as Response
}

// ── Test data factories ───────────────────────────────────────────────────────

const minimalArticulo = () => ({ codigo: 'ART001', descripcion: 'Test articulo', precio: 100 })
const minimalCabecera = () => ({ numero: '0001-00000001', fecha: '2024-01-01', tipo: 'FA', cliente: 'TEST' })
const minimalDetalle = () => ({ numero: '0001-00000001', producto: 'ART001', cantidad: 1, precio: 100 })
const minimalPago = () => ({ numero: '0001-00000001', forma_pago: 'EF', importe: 100 })

// ── 207/0-errors: success: true (all clients) ─────────────────────────────────

describe('ArticulosClient — 207 Multi-Status handling', () => {
  let client: ArticulosClient
  let fetchSpy: ReturnType<typeof vi.spyOn>

  beforeEach(() => {
    vi.clearAllMocks()
    client = new ArticulosClient('http://test-gateway:3335')
    fetchSpy = vi.spyOn(globalThis, 'fetch')
  })

  it('207 with 0 errors returns success: true', async () => {
    fetchSpy.mockResolvedValue(
      mockResponse(207, { success: true, data: { inserted: 5, updated: 3, errors: [] } })
    )
    const result = await client.sendBatch([minimalArticulo()])
    expect(result.success).toBe(true)
    expect(result.inserted).toBe(5)
    expect(result.updated).toBe(3)
    expect(result.errors).toHaveLength(0)
  })

  it('207 with errors > 0 returns success: false', async () => {
    fetchSpy.mockResolvedValue(
      mockResponse(207, {
        success: false,
        data: {
          inserted: 3,
          updated: 1,
          errors: [{ index: 0, identifier: 'ART001', error: 'duplicate key', code: 'DUPLICATE' }],
        },
      })
    )
    const result = await client.sendBatch([minimalArticulo()])
    expect(result.success).toBe(false)
    expect(result.errors).toHaveLength(1)
  })

  it('207 with 0 errors logs at info level with "Batch exitoso, sin errores"', async () => {
    fetchSpy.mockResolvedValue(
      mockResponse(207, { success: true, data: { inserted: 2, updated: 0, errors: [] } })
    )
    await client.sendBatch([minimalArticulo()])
    const infoMock = vi.mocked(logger.info)
    const warnMock = vi.mocked(logger.warn)
    const infoCallArgs = infoMock.mock.calls.map(args => JSON.stringify(args))
    const has207InfoCall = infoCallArgs.some(a => a.includes('Batch exitoso, sin errores'))
    expect(has207InfoCall).toBe(true)
    // warn must NOT have been called with 207 message
    const warnCallArgs = warnMock.mock.calls.map(args => JSON.stringify(args))
    const has207WarnCall = warnCallArgs.some(a => a.includes('207 Multi-Status'))
    expect(has207WarnCall).toBe(false)
  })

  it('207 with errors > 0 logs at warn level with "207 Multi-Status"', async () => {
    fetchSpy.mockResolvedValue(
      mockResponse(207, {
        success: false,
        data: {
          inserted: 0,
          updated: 0,
          errors: [{ index: 0, identifier: 'X', error: 'err', code: 'ERR' }],
        },
      })
    )
    await client.sendBatch([minimalArticulo()])
    const warnMock = vi.mocked(logger.warn)
    const warnCallArgs = warnMock.mock.calls.map(args => JSON.stringify(args))
    const has207WarnCall = warnCallArgs.some(a => a.includes('207 Multi-Status'))
    expect(has207WarnCall).toBe(true)
  })

  it('articulos: preserves data.result fallback path (not data fallback)', async () => {
    // articulos-client uses data.data || data.result — verify data.result works
    fetchSpy.mockResolvedValue(
      mockResponse(207, { success: true, data: null, result: { inserted: 7, updated: 2, errors: [] } })
    )
    const result = await client.sendBatch([minimalArticulo()])
    expect(result.success).toBe(true)
    expect(result.inserted).toBe(7)
    expect(result.updated).toBe(2)
  })
})

// ── ComprobantesClient (cabecera) ─────────────────────────────────────────────

describe('ComprobantesCabeceraClient — 207 Multi-Status handling', () => {
  let client: ComprobantesCabeceraClient
  let fetchSpy: ReturnType<typeof vi.spyOn>

  beforeEach(() => {
    vi.clearAllMocks()
    client = new ComprobantesCabeceraClient('http://test-gateway:3335')
    fetchSpy = vi.spyOn(globalThis, 'fetch')
  })

  it('207 with 0 errors returns success: true', async () => {
    fetchSpy.mockResolvedValue(
      mockResponse(207, { success: true, data: { inserted: 10, updated: 2, errors: [] } })
    )
    const result = await client.sendBatch([minimalCabecera()])
    expect(result.success).toBe(true)
    expect(result.inserted).toBe(10)
    expect(result.errors).toHaveLength(0)
  })

  it('207 with errors > 0 returns success: false', async () => {
    fetchSpy.mockResolvedValue(
      mockResponse(207, {
        data: {
          inserted: 1,
          updated: 0,
          errors: [{ index: 0, identifier: '0001-001', error: 'dup', code: 'DUP' }],
        },
      })
    )
    const result = await client.sendBatch([minimalCabecera()])
    expect(result.success).toBe(false)
    expect(result.errors).toHaveLength(1)
  })

  it('207 with 0 errors logs at info level with "Batch exitoso, sin errores"', async () => {
    fetchSpy.mockResolvedValue(
      mockResponse(207, { success: true, data: { inserted: 1, updated: 0, errors: [] } })
    )
    await client.sendBatch([minimalCabecera()])
    const infoCallArgs = vi.mocked(logger.info).mock.calls.map(args => JSON.stringify(args))
    expect(infoCallArgs.some(a => a.includes('Batch exitoso, sin errores'))).toBe(true)
    const warnCallArgs = vi.mocked(logger.warn).mock.calls.map(args => JSON.stringify(args))
    expect(warnCallArgs.some(a => a.includes('207 Multi-Status'))).toBe(false)
  })

  it('207 with errors > 0 logs at warn level with "207 Multi-Status"', async () => {
    fetchSpy.mockResolvedValue(
      mockResponse(207, {
        data: {
          inserted: 0,
          updated: 0,
          errors: [{ index: 0, identifier: 'X', error: 'err', code: 'ERR' }],
        },
      })
    )
    await client.sendBatch([minimalCabecera()])
    const warnCallArgs = vi.mocked(logger.warn).mock.calls.map(args => JSON.stringify(args))
    expect(warnCallArgs.some(a => a.includes('207 Multi-Status'))).toBe(true)
  })

  it('cabecera: uses data fallback (not data.result)', async () => {
    // comprobantes-cabecera-client uses data.data || data — verify data fallback works
    fetchSpy.mockResolvedValue(
      mockResponse(207, { inserted: 3, updated: 1, errors: [] })
    )
    const result = await client.sendBatch([minimalCabecera()])
    expect(result.success).toBe(true)
    expect(result.inserted).toBe(3)
  })
})

// ── ComprobantesDetalleClient ─────────────────────────────────────────────────

describe('ComprobantesDetalleClient — 207 Multi-Status handling', () => {
  let client: ComprobantesDetalleClient
  let fetchSpy: ReturnType<typeof vi.spyOn>

  beforeEach(() => {
    vi.clearAllMocks()
    client = new ComprobantesDetalleClient('http://test-gateway:3335')
    fetchSpy = vi.spyOn(globalThis, 'fetch')
  })

  it('207 with 0 errors returns success: true', async () => {
    fetchSpy.mockResolvedValue(
      mockResponse(207, { success: true, data: { inserted: 8, updated: 0, errors: [] } })
    )
    const result = await client.sendBatch([minimalDetalle()])
    expect(result.success).toBe(true)
    expect(result.inserted).toBe(8)
    expect(result.errors).toHaveLength(0)
  })

  it('207 with errors > 0 returns success: false', async () => {
    fetchSpy.mockResolvedValue(
      mockResponse(207, {
        data: {
          inserted: 2,
          updated: 0,
          errors: [{ index: 0, identifier: 'DET001', error: 'fk violation', code: 'FK_ERR' }],
        },
      })
    )
    const result = await client.sendBatch([minimalDetalle()])
    expect(result.success).toBe(false)
    expect(result.errors).toHaveLength(1)
  })

  it('207 with 0 errors logs at info level with "Batch exitoso, sin errores"', async () => {
    fetchSpy.mockResolvedValue(
      mockResponse(207, { success: true, data: { inserted: 1, updated: 0, errors: [] } })
    )
    await client.sendBatch([minimalDetalle()])
    const infoCallArgs = vi.mocked(logger.info).mock.calls.map(args => JSON.stringify(args))
    expect(infoCallArgs.some(a => a.includes('Batch exitoso, sin errores'))).toBe(true)
    const warnCallArgs = vi.mocked(logger.warn).mock.calls.map(args => JSON.stringify(args))
    expect(warnCallArgs.some(a => a.includes('207 Multi-Status'))).toBe(false)
  })

  it('207 with errors > 0 logs at warn level with "207 Multi-Status"', async () => {
    fetchSpy.mockResolvedValue(
      mockResponse(207, {
        data: {
          inserted: 0,
          updated: 0,
          errors: [{ index: 0, identifier: 'X', error: 'err', code: 'ERR' }],
        },
      })
    )
    await client.sendBatch([minimalDetalle()])
    const warnCallArgs = vi.mocked(logger.warn).mock.calls.map(args => JSON.stringify(args))
    expect(warnCallArgs.some(a => a.includes('207 Multi-Status'))).toBe(true)
  })

  it('detalle: uses data fallback (not data.result)', async () => {
    fetchSpy.mockResolvedValue(
      mockResponse(207, { inserted: 4, updated: 0, errors: [] })
    )
    const result = await client.sendBatch([minimalDetalle()])
    expect(result.success).toBe(true)
    expect(result.inserted).toBe(4)
  })
})

// ── ComprobantesPagosClient ───────────────────────────────────────────────────

describe('ComprobantesPagosClient — 207 Multi-Status handling', () => {
  let client: ComprobantesPagosClient
  let fetchSpy: ReturnType<typeof vi.spyOn>

  beforeEach(() => {
    vi.clearAllMocks()
    client = new ComprobantesPagosClient('http://test-gateway:3335')
    fetchSpy = vi.spyOn(globalThis, 'fetch')
  })

  it('207 with 0 errors returns success: true', async () => {
    fetchSpy.mockResolvedValue(
      mockResponse(207, { success: true, data: { inserted: 6, updated: 1, errors: [] } })
    )
    const result = await client.sendBatch([minimalPago()])
    expect(result.success).toBe(true)
    expect(result.inserted).toBe(6)
    expect(result.errors).toHaveLength(0)
  })

  it('207 with errors > 0 returns success: false', async () => {
    fetchSpy.mockResolvedValue(
      mockResponse(207, {
        data: {
          inserted: 0,
          updated: 0,
          errors: [{ index: 0, identifier: 'PAG001', error: 'constraint', code: 'CONSTRAINT' }],
        },
      })
    )
    const result = await client.sendBatch([minimalPago()])
    expect(result.success).toBe(false)
    expect(result.errors).toHaveLength(1)
  })

  it('207 with 0 errors logs at info level with "Batch exitoso, sin errores"', async () => {
    fetchSpy.mockResolvedValue(
      mockResponse(207, { success: true, data: { inserted: 1, updated: 0, errors: [] } })
    )
    await client.sendBatch([minimalPago()])
    const infoCallArgs = vi.mocked(logger.info).mock.calls.map(args => JSON.stringify(args))
    expect(infoCallArgs.some(a => a.includes('Batch exitoso, sin errores'))).toBe(true)
    const warnCallArgs = vi.mocked(logger.warn).mock.calls.map(args => JSON.stringify(args))
    expect(warnCallArgs.some(a => a.includes('207 Multi-Status'))).toBe(false)
  })

  it('207 with errors > 0 logs at warn level with "207 Multi-Status"', async () => {
    fetchSpy.mockResolvedValue(
      mockResponse(207, {
        data: {
          inserted: 0,
          updated: 0,
          errors: [{ index: 0, identifier: 'X', error: 'err', code: 'ERR' }],
        },
      })
    )
    await client.sendBatch([minimalPago()])
    const warnCallArgs = vi.mocked(logger.warn).mock.calls.map(args => JSON.stringify(args))
    expect(warnCallArgs.some(a => a.includes('207 Multi-Status'))).toBe(true)
  })

  it('pagos: uses data fallback (not data.result)', async () => {
    fetchSpy.mockResolvedValue(
      mockResponse(207, { inserted: 2, updated: 1, errors: [] })
    )
    const result = await client.sendBatch([minimalPago()])
    expect(result.success).toBe(true)
    expect(result.inserted).toBe(2)
  })
})
