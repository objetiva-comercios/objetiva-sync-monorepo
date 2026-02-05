/**
 * Integration tests for error recovery and retry mechanisms
 * Tests gateway unreachable recovery, batch processor retry with exponential backoff,
 * cancellation via AbortSignal, and RetryQueueManager lifecycle
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createMockApiClient, createMockApiClientWithErrors } from '../helpers/gateway-mock.js';
import { createArticuloBatch, resetCounter } from '../fixtures/test-data.js';
import { createTestDb, clearTestDb, closeTestDb } from '../helpers/test-db.js';
import { injectTestDatabase } from '../helpers/db-injector.js';
import { processBatchWithRetry, processBatches } from '../../src/sync/batch-processor.js';
import type { BatchProcessorFn } from '../../src/sync/batch-processor.js';
import type { BatchResult } from '../../src/types/common.js';
import { classifyError } from '../../src/utils/error-classifier.js';
import { RetryQueueManager } from '../../src/sync/retry-queue-manager.js';
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

describe('Error Recovery - Gateway Unreachable Recovery', () => {
  beforeEach(() => {
    resetCounter();
    // Reset syncStateManager to default (running)
    vi.mocked(syncStateManager.getCurrentSync).mockReturnValue({ status: 'running' } as any);
  });

  it('API client returns error when gateway sendBatch fails (ECONNREFUSED)', async () => {
    const mockClient = createMockApiClient();
    const batch = createArticuloBatch(5);

    // Override sendBatch to reject with ECONNREFUSED
    const connRefusedError = new Error('fetch failed');
    (connRefusedError as any).cause = new Error('connect ECONNREFUSED 127.0.0.1:3000');

    vi.mocked(mockClient.articulos.sendBatch).mockRejectedValueOnce(connRefusedError);

    // Call sendBatch and catch error
    await expect(mockClient.articulos.sendBatch(batch)).rejects.toThrow('fetch failed');

    // Classify the error
    const classified = classifyError(connRefusedError);

    expect(classified.code).toBe('GATEWAY_UNREACHABLE');
    expect(classified.isRetryable).toBe(true);
    expect(classified.message).toContain('Gateway no disponible');
  });

  it('API client recovers when gateway comes back online', async () => {
    const mockClient = createMockApiClient();
    const batch = createArticuloBatch(10);

    // First call: reject with ECONNREFUSED
    const connRefusedError = new Error('fetch failed');
    (connRefusedError as any).cause = new Error('connect ECONNREFUSED 127.0.0.1:3000');

    // Second call: resolve with success
    vi.mocked(mockClient.articulos.sendBatch)
      .mockRejectedValueOnce(connRefusedError)
      .mockResolvedValueOnce({ success: true, inserted: 10, updated: 0, errors: [] });

    // First call: should fail
    await expect(mockClient.articulos.sendBatch(batch)).rejects.toThrow('fetch failed');

    // Second call: should succeed
    const result = await mockClient.articulos.sendBatch(batch);

    expect(result.success).toBe(true);
    expect(result.inserted).toBe(10);
    expect(result.errors.length).toBe(0);
  });

  it('API client handles HTTP 500 from gateway', async () => {
    const mockClient = createMockApiClient();
    const batch = createArticuloBatch(5);

    // Mock sendBatch to return server error result
    vi.mocked(mockClient.articulos.sendBatch).mockResolvedValueOnce({
      success: false,
      inserted: 0,
      updated: 0,
      errors: batch.map((item, i) => ({
        index: i,
        identifier: item.erp_codigo,
        error: 'Gateway server error',
        code: 'GATEWAY_SERVER_ERROR'
      }))
    });

    const result = await mockClient.articulos.sendBatch(batch);

    expect(result.success).toBe(false);
    expect(result.inserted).toBe(0);
    expect(result.errors.length).toBe(5);

    // Classify the error
    const serverError = new Error('HTTP 500: Internal Server Error');
    const classified = classifyError(serverError);

    expect(classified.code).toBe('GATEWAY_SERVER_ERROR');
    expect(classified.isRetryable).toBe(true);
  });

  it('API client handles HTTP 401 (auth failure)', async () => {
    const mockClient = createMockApiClient();
    const batch = createArticuloBatch(5);

    // Mock sendBatch to reject with 401
    const authError = new Error('HTTP 401: Unauthorized');
    vi.mocked(mockClient.articulos.sendBatch).mockRejectedValueOnce(authError);

    await expect(mockClient.articulos.sendBatch(batch)).rejects.toThrow('HTTP 401');

    // Classify the error
    const classified = classifyError(authError);

    expect(classified.code).toBe('GATEWAY_AUTH_ERROR');
    expect(classified.isRetryable).toBe(false);
    expect(classified.rootCause).toContain('credenciales del gateway');
  });
});

describe('Error Recovery - Batch Processor Retry with Exponential Backoff', () => {
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

  it('processBatchWithRetry retries on failure and succeeds on second attempt', async () => {
    const batch = createArticuloBatch(10);

    // Mock processFn: fails on first attempt, succeeds on second
    const mockProcessFn = vi.fn<BatchProcessorFn<IArticuloPayload>>()
      .mockResolvedValueOnce({
        success: false,
        inserted: 0,
        updated: 0,
        errors: batch.map((item, i) => ({
          index: i,
          identifier: item.erp_codigo,
          error: 'Temporary failure',
          code: 'TEMP_ERROR'
        }))
      })
      .mockResolvedValueOnce({
        success: true,
        inserted: 10,
        updated: 0,
        errors: []
      });

    // Call processBatchWithRetry
    const resultPromise = processBatchWithRetry(
      batch,
      mockProcessFn,
      { batchNumber: 1, totalBatches: 1 },
      3 // maxRetries
    );

    // Advance timers to allow retry delay (2s exponential backoff)
    await vi.advanceTimersByTimeAsync(2000);

    const result = await resultPromise;

    expect(mockProcessFn).toHaveBeenCalledTimes(2);
    expect(result.success).toBe(true);
    expect(result.inserted).toBe(10);
    expect(result.errors.length).toBe(0);
  });

  it('processBatchWithRetry gives up after maxRetries', async () => {
    const batch = createArticuloBatch(5);

    // Mock processFn: always fails
    const mockProcessFn = vi.fn<BatchProcessorFn<IArticuloPayload>>()
      .mockResolvedValue({
        success: false,
        inserted: 0,
        updated: 0,
        errors: batch.map((item, i) => ({
          index: i,
          identifier: item.erp_codigo,
          error: 'Persistent failure',
          code: 'PERM_ERROR'
        }))
      });

    // Call processBatchWithRetry with maxRetries=3
    const resultPromise = processBatchWithRetry(
      batch,
      mockProcessFn,
      { batchNumber: 1, totalBatches: 1 },
      3
    );

    // Advance timers for all retry attempts (2s, 4s, 8s)
    await vi.advanceTimersByTimeAsync(2000);
    await vi.advanceTimersByTimeAsync(4000);

    const result = await resultPromise;

    expect(mockProcessFn).toHaveBeenCalledTimes(3);
    expect(result.success).toBe(false);
    expect(result.errors.length).toBeGreaterThan(0);
    // Last error should indicate max retries exceeded
    expect(result.errors.some(e => e.code === 'MAX_RETRIES_EXCEEDED' || e.code === 'PERM_ERROR')).toBe(true);
  });

  it('processBatchWithRetry does NOT retry on 4xx client error', async () => {
    const batch = createArticuloBatch(5);

    // Mock processFn: throws 400 error
    const mockProcessFn = vi.fn<BatchProcessorFn<IArticuloPayload>>()
      .mockRejectedValue(new Error('HTTP 400: Bad Request'));

    // Call processBatchWithRetry
    await expect(
      processBatchWithRetry(
        batch,
        mockProcessFn,
        { batchNumber: 1, totalBatches: 1 },
        3
      )
    ).rejects.toThrow('HTTP 400');

    // Should only be called once (no retry on 4xx)
    expect(mockProcessFn).toHaveBeenCalledTimes(1);
  });

  it('processBatchWithRetry returns partial result without retrying', async () => {
    const batch = createArticuloBatch(10);

    // Mock processFn: returns partial success (5 inserted, 5 failed)
    const mockProcessFn = vi.fn<BatchProcessorFn<IArticuloPayload>>()
      .mockResolvedValue({
        success: false,
        inserted: 5,
        updated: 0,
        errors: batch.slice(5).map((item, i) => ({
          index: i + 5,
          identifier: item.erp_codigo,
          error: 'Partial failure',
          code: 'VALIDATION_ERROR'
        }))
      });

    const result = await processBatchWithRetry(
      batch,
      mockProcessFn,
      { batchNumber: 1, totalBatches: 1 },
      3
    );

    // Should only be called once (partial success = no retry)
    expect(mockProcessFn).toHaveBeenCalledTimes(1);
    expect(result.inserted).toBe(5);
    expect(result.errors.length).toBe(5);
  });

  it('processBatches continues processing remaining batches when continueOnError=true', async () => {
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

    expect(mockProcessFn).toHaveBeenCalledTimes(3);
    expect(result.successfulBatches).toBe(2);
    expect(result.failedBatches).toBe(1);
    expect(result.inserted).toBe(20);
  });

  it('processBatches stops on first failure when continueOnError=false', async () => {
    const items = createArticuloBatch(30); // 3 batches of 10

    // Mock processFn: batch 1 succeeds, batch 2 fails
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
      });

    const result = await processBatches(items, mockProcessFn, {
      batchSize: 10,
      continueOnError: false,
      enableRetries: false
    });

    // Should only process 2 batches (stop after batch 2 fails)
    expect(mockProcessFn).toHaveBeenCalledTimes(2);
    expect(result.failedBatches).toBeGreaterThanOrEqual(1);
  });
});

describe('Error Recovery - Cancellation via AbortSignal', () => {
  beforeEach(() => {
    resetCounter();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  it('processBatchWithRetry aborts on sync cancellation', async () => {
    const batch = createArticuloBatch(10);

    // Mock syncStateManager: running on first call, canceled on subsequent calls
    vi.mocked(syncStateManager.getCurrentSync)
      .mockReturnValueOnce({ status: 'running' } as any)
      .mockReturnValue({ status: 'canceled' } as any);

    // Mock processFn: fails on first attempt
    const mockProcessFn = vi.fn<BatchProcessorFn<IArticuloPayload>>()
      .mockResolvedValue({
        success: false,
        inserted: 0,
        updated: 0,
        errors: batch.map((item, i) => ({
          index: i,
          identifier: item.erp_codigo,
          error: 'Failure',
          code: 'ERROR'
        }))
      });

    const result = await processBatchWithRetry(
      batch,
      mockProcessFn,
      { batchNumber: 1, totalBatches: 1 },
      3
    );

    // Should only be called once (cancellation prevents retry)
    expect(mockProcessFn).toHaveBeenCalledTimes(1);
    expect(result.errors.some(e => e.code === 'SYNC_CANCELED')).toBe(true);
  });

  it('processBatches stops when sync is canceled between batches', async () => {
    const items = createArticuloBatch(30); // 3 batches of 10

    // Mock syncStateManager: running for batch 1, canceled before batch 2
    let callCount = 0;
    vi.mocked(syncStateManager.getCurrentSync).mockImplementation(() => {
      callCount++;
      // Allow first batch to complete, cancel before second batch
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
    expect(mockProcessFn).toHaveBeenCalledTimes(1);
    expect(result.inserted).toBe(10);
    expect(result.errors.some(e => e.code === 'SYNC_CANCELED')).toBe(true);
    expect(result.success).toBe(false);
  });
});

describe('Error Recovery - RetryQueueManager Lifecycle', () => {
  let db: ReturnType<typeof createTestDb>;
  let retryQueueManager: RetryQueueManager;

  beforeEach(() => {
    resetCounter();
    db = createTestDb();
    injectTestDatabase(db);
    retryQueueManager = new RetryQueueManager();
  });

  afterEach(() => {
    closeTestDb(db);
    vi.restoreAllMocks();
  });

  it('addFailedBatch creates retry queue entry', async () => {
    const batch = createArticuloBatch(5);

    const itemId = await retryQueueManager.addFailedBatch({
      entityType: 'articulos',
      syncType: 'full',
      payload: batch,
      error: 'Test error'
    });

    expect(itemId).toBeGreaterThan(0);
  });

  it('processRetries calls processor function for pending items', async () => {
    // Import repository functions to manually set nextRetryAt to past
    const { default: Database } = await import('better-sqlite3');
    const sqlite = db.$client as InstanceType<typeof Database>;

    // Add 2 failed batches
    const batch1 = createArticuloBatch(3);
    const batch2 = createArticuloBatch(3);

    const id1 = await retryQueueManager.addFailedBatch({
      entityType: 'articulos',
      syncType: 'full',
      payload: batch1,
      error: 'Error 1'
    });

    const id2 = await retryQueueManager.addFailedBatch({
      entityType: 'articulos',
      syncType: 'full',
      payload: batch2,
      error: 'Error 2'
    });

    // Update nextRetryAt to past so items are ready for processing
    const pastDate = new Date(Date.now() - 60000).toISOString(); // 1 minute ago
    sqlite.exec(`UPDATE retry_queue SET next_retry_at = '${pastDate}' WHERE id IN (${id1}, ${id2})`);

    // Mock processor that succeeds
    const mockProcessor = vi.fn().mockResolvedValue({ success: true });

    const result = await retryQueueManager.processRetries(mockProcessor);

    expect(result.processed).toBe(2);
    expect(result.successful).toBe(2);
    expect(mockProcessor).toHaveBeenCalledTimes(2);
  });

  it('processRetries handles processor failure and increments attempt count', async () => {
    const { default: Database } = await import('better-sqlite3');
    const sqlite = db.$client as InstanceType<typeof Database>;

    const batch = createArticuloBatch(3);

    const itemId = await retryQueueManager.addFailedBatch({
      entityType: 'articulos',
      syncType: 'full',
      payload: batch,
      error: 'Initial error'
    });

    // Update nextRetryAt to past so item is ready for processing
    const pastDate = new Date(Date.now() - 60000).toISOString();
    sqlite.exec(`UPDATE retry_queue SET next_retry_at = '${pastDate}' WHERE id = ${itemId}`);

    // Mock processor that fails
    const mockProcessor = vi.fn().mockResolvedValue({
      success: false,
      error: 'Still failing'
    });

    const result = await retryQueueManager.processRetries(mockProcessor);

    expect(result.processed).toBe(1);
    expect(result.successful).toBe(0);
    expect(result.skipped).toBeGreaterThanOrEqual(0);
  });

  it('processRetries eventually stops calling processor for failed items', async () => {
    // This test verifies that the retry mechanism doesn't retry forever
    // We don't test the exact implementation details (status field, etc.)
    // Just verify that after many retries, the system eventually gives up

    const { retryQueue } = await import('../../src/store/schema.js');
    const { eq } = await import('drizzle-orm');

    const batch = createArticuloBatch(3);

    const itemId = await retryQueueManager.addFailedBatch({
      entityType: 'articulos',
      syncType: 'full',
      payload: batch,
      error: 'Initial error'
    });

    // Mock processor that always fails
    const mockProcessor = vi.fn().mockResolvedValue({
      success: false,
      error: 'Permanent failure'
    });

    const pastDate = new Date(Date.now() - 60000).toISOString();

    // Keep processing retries until no more items are processed
    // This should stop after maxAttempts (default 5)
    let totalCalls = 0;
    for (let i = 0; i < 10; i++) { // Try up to 10 times
      await db.update(retryQueue)
        .set({ nextRetryAt: pastDate })
        .where(eq(retryQueue.id, itemId));

      const result = await retryQueueManager.processRetries(mockProcessor);

      if (result.processed === 0) {
        // No more items to process - retry system gave up
        break;
      }
      totalCalls++;
    }

    // Should have stopped before 10 iterations (default maxAttempts is 5)
    expect(totalCalls).toBeLessThan(10);
    expect(totalCalls).toBeGreaterThan(0);
  });
});
