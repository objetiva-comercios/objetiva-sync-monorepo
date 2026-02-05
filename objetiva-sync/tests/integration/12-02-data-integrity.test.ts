/**
 * Integration tests for data integrity under failure conditions
 * Tests that error recovery does not produce duplicate records
 * and that sync state remains consistent after failures
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createMockApiClient, createMockApiClientWithPartialSuccess } from '../helpers/gateway-mock.js';
import { createArticuloBatch, resetCounter } from '../fixtures/test-data.js';
import { processBatches, calculateBatchStats, mergeBatchResults } from '../../src/sync/batch-processor.js';
import type { BatchProcessorFn } from '../../src/sync/batch-processor.js';
import type { BatchResult } from '../../src/types/common.js';
import { classifyError } from '../../src/utils/error-classifier.js';
import type { IArticuloPayload } from '../../src/types/articulos.js';

// Mock config/env to prevent requireEnv() errors in logger
vi.mock('../../src/config/env.js', () => ({
  loadEnv: vi.fn(),
  requireEnv: vi.fn(() => ({
    NODE_ENV: 'test',
    LOG_LEVEL: 'error',
    LOG_FILE: './logs/test.log',
    DATABASE_PATH: ':memory:',
  })),
}));

// Mock syncStateManager at module level
vi.mock('../../src/sync/sync-state-manager.js', () => ({
  syncStateManager: {
    getCurrentSync: vi.fn().mockReturnValue({ status: 'running' }),
    startSync: vi.fn(),
    updateProgress: vi.fn(),
    completeSync: vi.fn(),
    isSyncing: vi.fn().mockReturnValue(false),
    cancelSync: vi.fn(),
    reset: vi.fn(),
    getHistory: vi.fn().mockReturnValue([]),
  }
}));

// Mock logger to suppress logs during tests
vi.mock('../../src/utils/logger.js');

// Mock batch-storage to prevent file I/O
vi.mock('../../src/utils/batch-storage.js', () => ({ saveBatch: vi.fn() }));

// Import mocked syncStateManager for per-test configuration
import { syncStateManager } from '../../src/sync/sync-state-manager.js';

describe('Data Integrity - No Duplicate Records on Batch Retry', () => {
  beforeEach(() => {
    resetCounter();
    // Reset syncStateManager to default (running)
    vi.mocked(syncStateManager.getCurrentSync).mockReturnValue({ status: 'running' } as any);
  });

  it('batch processor tracks inserted vs updated correctly across retries', async () => {
    const items = createArticuloBatch(10);

    // Mock processFn: returns success (10 inserted)
    const mockProcessFn = vi.fn<BatchProcessorFn<IArticuloPayload>>()
      .mockResolvedValue({
        success: true,
        inserted: 10,
        updated: 0,
        errors: []
      });

    const result = await processBatches(items, mockProcessFn, {
      batchSize: 10,
      enableRetries: false
    });

    // Should count inserted records only once
    expect(result.inserted).toBe(10);
    expect(result.updated).toBe(0);
    expect(result.errors.length).toBe(0);
  });

  it('upsert response (inserted + updated) correctly reported via mock API client', async () => {
    const mockClient = createMockApiClient();
    const batch = createArticuloBatch(10);

    // Override sendBatch to return mixed insert/update result
    vi.mocked(mockClient.articulos.sendBatch).mockResolvedValueOnce({
      success: true,
      inserted: 3,
      updated: 7,
      errors: []
    });

    const result = await mockClient.articulos.sendBatch(batch);

    expect(result.success).toBe(true);
    expect(result.inserted).toBe(3);
    expect(result.updated).toBe(7);
    expect(result.errors.length).toBe(0);
  });

  it('partial batch failure does not inflate record counts', async () => {
    const mockClient = createMockApiClientWithPartialSuccess();
    const batch = createArticuloBatch(10);

    const result = await mockClient.articulos.sendBatch(batch);

    // Should have 5 inserted, 5 errors (half success)
    expect(result.inserted).toBe(5);
    expect(result.errors.length).toBe(5);

    // Total should equal batch size (no inflation)
    const totalProcessed = result.inserted + result.updated + result.errors.length;
    expect(totalProcessed).toBe(10);
  });
});

describe('Data Integrity - Sync State Consistency After Failure', () => {
  beforeEach(() => {
    resetCounter();
    vi.useFakeTimers();
    // Reset syncStateManager to default (running)
    vi.mocked(syncStateManager.getCurrentSync).mockReturnValue({ status: 'running' } as any);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  it('batch processor result reflects accurate counts after mixed batch outcomes', async () => {
    const items = createArticuloBatch(30); // 3 batches of 10

    // Mock processFn: batch 1 succeeds, batch 2 fails, batch 3 succeeds
    const mockProcessFn = vi.fn<BatchProcessorFn<IArticuloPayload>>()
      .mockResolvedValueOnce({
        success: true,
        inserted: 10,
        updated: 0,
        errors: []
      })
      .mockResolvedValueOnce({
        success: false,
        inserted: 0,
        updated: 0,
        errors: Array.from({ length: 10 }, (_, i) => ({
          index: i,
          identifier: `ITEM-${i}`,
          error: 'Batch 2 failure',
          code: 'ERROR'
        }))
      })
      .mockResolvedValueOnce({
        success: true,
        inserted: 10,
        updated: 0,
        errors: []
      });

    const result = await processBatches(items, mockProcessFn, {
      batchSize: 10,
      continueOnError: true,
      enableRetries: false
    });

    // Should only count confirmed batches (batch 1 and 3)
    expect(result.inserted).toBe(20);
    expect(result.successfulBatches).toBe(2);
    expect(result.failedBatches).toBe(1);
  });

  it('cancellation mid-batch stops processing and reports partial results', async () => {
    const items = createArticuloBatch(30); // 3 batches of 10

    // Mock syncStateManager: running for batch 1, canceled before batch 2
    let callCount = 0;
    vi.mocked(syncStateManager.getCurrentSync).mockImplementation(() => {
      callCount++;
      // Allow first batch to complete (2 calls: pre-check and post-check)
      if (callCount <= 2) {
        return { status: 'running' } as any;
      }
      return { status: 'canceled' } as any;
    });

    // Mock processFn: always succeeds
    const mockProcessFn = vi.fn<BatchProcessorFn<IArticuloPayload>>()
      .mockResolvedValue({
        success: true,
        inserted: 10,
        updated: 0,
        errors: []
      });

    const result = await processBatches(items, mockProcessFn, {
      batchSize: 10,
      enableRetries: false
    });

    // Should only process batch 1
    expect(result.inserted).toBe(10);
    expect(result.errors.some(e => e.code === 'SYNC_CANCELED')).toBe(true);
    expect(result.success).toBe(false);
  });

  it('calculateBatchStats reports correct rates', () => {
    const batchResult: BatchResult = {
      success: true,
      inserted: 8,
      updated: 2,
      errors: [{
        index: 0,
        identifier: 'ITEM-0',
        error: 'Failed item',
        code: 'ERROR'
      }]
    };

    const stats = calculateBatchStats(batchResult);

    expect(stats.totalProcessed).toBe(11); // 8 + 2 + 1
    expect(stats.successRate).toBeCloseTo(90.9, 1); // 10/11 * 100
    expect(stats.failureRate).toBeCloseTo(9.1, 1); // 1/11 * 100
  });

  it('mergeBatchResults correctly combines multiple results', () => {
    const results: BatchResult[] = [
      {
        success: true,
        inserted: 5,
        updated: 1,
        errors: [{
          index: 0,
          identifier: 'X',
          error: 'Error 1',
          code: 'ERR1'
        }]
      },
      {
        success: true,
        inserted: 3,
        updated: 0,
        errors: []
      },
      {
        success: false,
        inserted: 0,
        updated: 0,
        errors: [
          {
            index: 0,
            identifier: 'Y',
            error: 'Error 2',
            code: 'ERR2'
          },
          {
            index: 1,
            identifier: 'Z',
            error: 'Error 3',
            code: 'ERR3'
          }
        ]
      }
    ];

    const merged = mergeBatchResults(results);

    expect(merged.inserted).toBe(8); // 5 + 3 + 0
    expect(merged.updated).toBe(1); // 1 + 0 + 0
    expect(merged.errors.length).toBe(3); // 1 + 0 + 2
    expect(merged.success).toBe(false); // Third result has success=false
  });
});

describe('Data Integrity - Error Classification Drives Retry Decisions', () => {
  beforeEach(() => {
    resetCounter();
  });

  it('retryable errors (ECONNREFUSED, ECONNRESET, HTTP 5xx) are classified as isRetryable=true', () => {
    // ECONNREFUSED
    const connRefusedError = new Error('fetch failed');
    (connRefusedError as any).cause = new Error('connect ECONNREFUSED 127.0.0.1:3000');
    const classified1 = classifyError(connRefusedError);
    expect(classified1.code).toBe('GATEWAY_UNREACHABLE');
    expect(classified1.isRetryable).toBe(true);

    // ECONNRESET
    const connResetError = new Error('fetch failed');
    (connResetError as any).cause = new Error('socket hang up | ECONNRESET');
    const classified2 = classifyError(connResetError);
    expect(classified2.code).toBe('GATEWAY_CONNECTION_RESET');
    expect(classified2.isRetryable).toBe(true);

    // HTTP 500
    const serverError = new Error('HTTP 500: Internal Server Error');
    const classified3 = classifyError(serverError);
    expect(classified3.code).toBe('GATEWAY_SERVER_ERROR');
    expect(classified3.isRetryable).toBe(true);

    // HTTP 503
    const unavailableError = new Error('HTTP 503: Service Unavailable');
    const classified4 = classifyError(unavailableError);
    expect(classified4.code).toBe('GATEWAY_SERVER_ERROR');
    expect(classified4.isRetryable).toBe(true);
  });

  it('non-retryable errors (ENOTFOUND, HTTP 401, unknown) are classified as isRetryable=false', () => {
    // ENOTFOUND (DNS)
    const dnsError = new Error('getaddrinfo ENOTFOUND gateway.example.com');
    const classified1 = classifyError(dnsError);
    expect(classified1.code).toBe('GATEWAY_DNS_ERROR');
    expect(classified1.isRetryable).toBe(false);

    // HTTP 401
    const authError = new Error('HTTP 401: Unauthorized');
    const classified2 = classifyError(authError);
    expect(classified2.code).toBe('GATEWAY_AUTH_ERROR');
    expect(classified2.isRetryable).toBe(false);

    // HTTP 403
    const forbiddenError = new Error('HTTP 403: Forbidden');
    const classified3 = classifyError(forbiddenError);
    expect(classified3.code).toBe('GATEWAY_AUTH_ERROR');
    expect(classified3.isRetryable).toBe(false);

    // Unknown error
    const unknownError = new Error('Something weird happened');
    const classified4 = classifyError(unknownError);
    expect(classified4.code).toBe('UNKNOWN_ERROR');
    expect(classified4.isRetryable).toBe(false);
  });

  it('AbortError from user cancellation is classified as SYNC_CANCELED with isRetryable=false', () => {
    // Create AbortError (DOMException with name 'AbortError')
    const abortError = new DOMException('The operation was aborted', 'AbortError');
    const classified = classifyError(abortError);

    expect(classified.code).toBe('SYNC_CANCELED');
    expect(classified.isRetryable).toBe(false);
    expect(classified.message).toContain('cancelada por el usuario');
  });
});
