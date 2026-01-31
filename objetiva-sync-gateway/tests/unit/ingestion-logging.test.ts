/**
 * Tests for ingestion logging functionality
 * Validates that batch ingestion produces human-readable, structured logs
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { IngestionLogEntry } from '../../src/types/logging.js'

// Mock logger (hoisted to top, so must be defined inline)
vi.mock('../../src/lib/logger.js', () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn()
  }
}))

// Import after mock
import { IngestionService } from '../../src/services/ingestion.js'
import { logger } from '../../src/lib/logger.js'

const mockLogger = logger

describe('IngestionService - Logging Functionality', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('logIngestionResult()', () => {
    it('should log successful batch with human-readable format', () => {
      // Arrange
      const logEntry: IngestionLogEntry = {
        entity: 'articulo',
        batchNumber: 1,
        totalBatches: 1,
        inserted: 10,
        updated: 5,
        failed: 0,
        durationMs: 342
      }

      // Act
      IngestionService.logIngestionResult(logEntry)

      // Assert
      expect(mockLogger.info).toHaveBeenCalledTimes(1)

      const [logData, message] = mockLogger.info.mock.calls[0]

      // Verify message format: "Batch 1/1 - articulo: 15 processed (10 inserted, 5 updated) in 342ms"
      expect(message).toContain('Batch 1/1')
      expect(message).toContain('articulo')
      expect(message).toContain('15 processed')
      expect(message).toContain('10 inserted')
      expect(message).toContain('5 updated')
      expect(message).toContain('342ms')

      // Verify structured data
      expect(logData).toEqual({
        entity: 'articulo',
        batchNumber: 1,
        totalBatches: 1,
        inserted: 10,
        updated: 5,
        failed: 0,
        durationMs: 342
      })
    })

    it('should log failed batch with sample errors', () => {
      // Arrange
      const logEntry: IngestionLogEntry = {
        entity: 'comprobante_cabecera',
        batchNumber: 2,
        totalBatches: 5,
        inserted: 8,
        updated: 2,
        failed: 3,
        durationMs: 567,
        sampleErrors: [
          {
            index: 5,
            identifier: 'FC/A/00001234',
            error: '[DUPLICATE_KEY] Unique constraint failed on idx_comprobante_erp_unique',
            code: 'DUPLICATE_KEY'
          },
          {
            index: 8,
            identifier: 'FC/A/00001237',
            error: '[VALIDATION_ERROR] Required field missing: cliente_nombre',
            code: 'VALIDATION_ERROR'
          },
          {
            index: 12,
            identifier: 'FC/A/00001241',
            error: '[DATE_FORMAT_ERROR] Invalid date format: fecha',
            code: 'DATE_FORMAT_ERROR'
          }
        ]
      }

      // Act
      IngestionService.logIngestionResult(logEntry)

      // Assert
      expect(mockLogger.warn).toHaveBeenCalledTimes(1)

      const [logData, message] = mockLogger.warn.mock.calls[0]

      // Verify message includes error summary
      expect(message).toContain('Batch 2/5')
      expect(message).toContain('comprobante_cabecera')
      expect(message).toContain('10 processed')
      expect(message).toContain('3 failed')
      expect(message).toContain('Sample errors:')
      expect(message).toContain('FC/A/00001234: [DUPLICATE_KEY]')
      expect(message).toContain('FC/A/00001237: [VALIDATION_ERROR]')
      expect(message).toContain('FC/A/00001241: [DATE_FORMAT_ERROR]')

      // Verify structured data includes sample errors
      expect(logData.sampleErrors).toHaveLength(3)
      expect(logData.sampleErrors[0]).toEqual({
        identifier: 'FC/A/00001234',
        code: 'DUPLICATE_KEY',
        message: '[DUPLICATE_KEY] Unique constraint failed on idx_comprobante_erp_unique'
      })
    })

    it('should include metadata when provided', () => {
      // Arrange
      const logEntry: IngestionLogEntry = {
        entity: 'articulo',
        batchNumber: 3,
        totalBatches: 10,
        inserted: 50,
        updated: 0,
        failed: 0,
        durationMs: 1234,
        metadata: {
          syncId: 'sync-abc-123',
          queryId: 42,
          queryName: 'Artículos - Stock completo',
          batchNumber: 3,
          totalBatches: 10
        }
      }

      // Act
      IngestionService.logIngestionResult(logEntry)

      // Assert
      const [logData] = mockLogger.info.mock.calls[0]

      expect(logData.queryId).toBe(42)
      expect(logData.queryName).toBe('Artículos - Stock completo')
      expect(logData.syncId).toBe('sync-abc-123')
    })

    it('should handle missing optional metadata gracefully', () => {
      // Arrange - No metadata provided
      const logEntry: IngestionLogEntry = {
        entity: 'comprobante_detalle',
        batchNumber: 1,
        totalBatches: 1,
        inserted: 25,
        updated: 15,
        failed: 0,
        durationMs: 890
      }

      // Act
      IngestionService.logIngestionResult(logEntry)

      // Assert - Should not throw, should log normally
      expect(mockLogger.info).toHaveBeenCalledTimes(1)

      const [logData] = mockLogger.info.mock.calls[0]

      expect(logData.queryId).toBeUndefined()
      expect(logData.queryName).toBeUndefined()
      expect(logData.syncId).toBeUndefined()
      expect(logData.entity).toBe('comprobante_detalle')
    })

    it('should format message correctly with only inserts', () => {
      // Arrange
      const logEntry: IngestionLogEntry = {
        entity: 'articulo',
        batchNumber: 1,
        totalBatches: 1,
        inserted: 100,
        updated: 0,
        failed: 0,
        durationMs: 500
      }

      // Act
      IngestionService.logIngestionResult(logEntry)

      // Assert
      const [, message] = mockLogger.info.mock.calls[0]

      expect(message).toContain('100 processed')
      expect(message).toContain('(100 inserted)')
      expect(message).not.toContain('updated')
    })

    it('should include duration in all logs', () => {
      // Arrange - Fast batch
      const fastBatch: IngestionLogEntry = {
        entity: 'articulo',
        batchNumber: 1,
        totalBatches: 1,
        inserted: 5,
        updated: 0,
        failed: 0,
        durationMs: 42
      }

      // Arrange - Slow batch
      const slowBatch: IngestionLogEntry = {
        entity: 'comprobante_cabecera',
        batchNumber: 1,
        totalBatches: 1,
        inserted: 1000,
        updated: 500,
        failed: 0,
        durationMs: 5678
      }

      // Act
      IngestionService.logIngestionResult(fastBatch)
      IngestionService.logIngestionResult(slowBatch)

      // Assert
      const [, fastMessage] = mockLogger.info.mock.calls[0]
      const [, slowMessage] = mockLogger.info.mock.calls[1]

      expect(fastMessage).toContain('in 42ms')
      expect(slowMessage).toContain('in 5678ms')
    })

    it('should log field-level error details in sample errors', () => {
      // Arrange
      const logEntry: IngestionLogEntry = {
        entity: 'comprobante_pago',
        batchNumber: 1,
        totalBatches: 1,
        inserted: 10,
        updated: 0,
        failed: 2,
        durationMs: 234,
        sampleErrors: [
          {
            index: 0,
            identifier: 'FC/A/00001234 L1',
            error: '[FOREIGN_KEY_ERROR] Foreign key constraint failed on comprobante_id | Clave: FC/A/00001234 L1',
            code: 'FOREIGN_KEY_ERROR'
          },
          {
            index: 3,
            identifier: 'FC/A/00001237 L1',
            error: '[VALIDATION_ERROR] Expected number, received string | Clave: FC/A/00001237 L1 - EFECTIVO',
            code: 'VALIDATION_ERROR'
          }
        ]
      }

      // Act
      IngestionService.logIngestionResult(logEntry)

      // Assert
      expect(mockLogger.warn).toHaveBeenCalledTimes(1)

      const [logData, message] = mockLogger.warn.mock.calls[0]

      // Verify detailed error information
      expect(logData.sampleErrors[0].message).toContain('Foreign key constraint failed')
      expect(logData.sampleErrors[0].message).toContain('comprobante_id')
      expect(logData.sampleErrors[0].identifier).toBe('FC/A/00001234 L1')

      expect(logData.sampleErrors[1].message).toContain('Expected number, received string')
      expect(logData.sampleErrors[1].code).toBe('VALIDATION_ERROR')

      // Verify message includes identifiers
      expect(message).toContain('FC/A/00001234 L1: [FOREIGN_KEY_ERROR]')
      expect(message).toContain('FC/A/00001237 L1: [VALIDATION_ERROR]')
    })
  })
})
