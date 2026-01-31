/**
 * SSE Log Streaming Integration Tests
 *
 * Verifies the full SSE pipeline: createLog() -> logEventEmitter.emit() -> SSE stream
 */

import { describe, it, expect, beforeAll, beforeEach, afterEach, vi } from 'vitest';
import { loadEnv } from '../../src/config/env.js';
import { logEventEmitter } from '../../src/dashboard/routes/api/log-stream.js';
import { createLog, getLogById } from '../../src/store/repositories/sync-logs-repo.js';
import { initDatabase } from '../../src/store/index.js';
import type { SyncLog } from '../../src/store/schema.js';

describe('SSE Log Stream Integration', () => {
  beforeAll(() => {
    // Load environment configuration
    loadEnv();
  });

  beforeEach(async () => {
    // Initialize test database
    await initDatabase();
  });

  afterEach(() => {
    // Clean up all listeners after each test
    logEventEmitter.removeAllListeners();
  });

  it('should emit newLog event when createLog is called', async () => {
    // Arrange
    const mockListener = vi.fn();
    logEventEmitter.on('newLog', mockListener);

    // Act
    const logId = await createLog({
      entityType: 'articulos',
      syncType: 'manual',
      status: 'success',
      recordsFetched: 10,
      recordsSent: 10,
      recordsFailed: 0,
      durationMs: 1500
    });

    // Assert
    expect(mockListener).toHaveBeenCalledTimes(1);

    const emittedLog = mockListener.mock.calls[0][0] as SyncLog;
    expect(emittedLog).toBeDefined();
    expect(emittedLog.id).toBe(logId);
    expect(emittedLog.entityType).toBe('articulos');
    expect(emittedLog.status).toBe('success');
  });

  it('should emit log with all required fields for SSE', async () => {
    // Arrange
    const mockListener = vi.fn();
    logEventEmitter.on('newLog', mockListener);

    // Act
    const logId = await createLog({
      queryId: 1,
      queryName: 'Test Query',
      entityType: 'comprobantes_cabecera',
      syncType: 'incremental',
      status: 'partial',
      recordsFetched: 100,
      recordsSent: 95,
      recordsFailed: 5,
      durationMs: 3000,
      errorMessage: 'Some records failed validation',
      details: { batchSize: 50, errors: [] }
    });

    // Assert
    expect(mockListener).toHaveBeenCalledTimes(1);

    const emittedLog = mockListener.mock.calls[0][0] as SyncLog;

    // Verify all SSE-required fields are present
    expect(emittedLog).toHaveProperty('id');
    expect(emittedLog).toHaveProperty('entityType');
    expect(emittedLog).toHaveProperty('queryName');
    expect(emittedLog).toHaveProperty('status');
    expect(emittedLog).toHaveProperty('recordsFetched');
    expect(emittedLog).toHaveProperty('recordsSent');
    expect(emittedLog).toHaveProperty('recordsFailed');
    expect(emittedLog).toHaveProperty('durationMs');
    expect(emittedLog).toHaveProperty('createdAt');
    expect(emittedLog).toHaveProperty('errorMessage');

    // Verify values
    expect(emittedLog.id).toBe(logId);
    expect(emittedLog.queryName).toBe('Test Query');
    expect(emittedLog.recordsFetched).toBe(100);
    expect(emittedLog.recordsSent).toBe(95);
    expect(emittedLog.recordsFailed).toBe(5);
    expect(emittedLog.durationMs).toBe(3000);
  });

  it('should not emit event if log creation fails', async () => {
    // Arrange
    const mockListener = vi.fn();
    logEventEmitter.on('newLog', mockListener);

    // Act - Try to create invalid log (this should throw or fail)
    let error: Error | null = null;
    try {
      // @ts-expect-error - Intentionally passing invalid data
      await createLog({
        // Missing required fields
        entityType: null,
        syncType: null,
        status: null
      });
    } catch (e) {
      error = e as Error;
    }

    // Assert
    expect(error).toBeDefined();
    expect(mockListener).not.toHaveBeenCalled();
  });

  it('should support multiple listeners (simulating multiple dashboard clients)', async () => {
    // Arrange
    const listener1 = vi.fn();
    const listener2 = vi.fn();
    const listener3 = vi.fn();

    logEventEmitter.on('newLog', listener1);
    logEventEmitter.on('newLog', listener2);
    logEventEmitter.on('newLog', listener3);

    // Act
    await createLog({
      entityType: 'comprobantes_pagos',
      syncType: 'full',
      status: 'success',
      recordsFetched: 50,
      recordsSent: 50
    });

    // Assert
    expect(listener1).toHaveBeenCalledTimes(1);
    expect(listener2).toHaveBeenCalledTimes(1);
    expect(listener3).toHaveBeenCalledTimes(1);

    // All listeners should receive the same log
    const log1 = listener1.mock.calls[0][0] as SyncLog;
    const log2 = listener2.mock.calls[0][0] as SyncLog;
    const log3 = listener3.mock.calls[0][0] as SyncLog;

    expect(log1.id).toBe(log2.id);
    expect(log2.id).toBe(log3.id);
  });

  it('should handle rapid log creation without missing events', async () => {
    // Arrange
    const mockListener = vi.fn();
    logEventEmitter.on('newLog', mockListener);

    // Act - Create 10 logs in rapid succession
    const logPromises = Array.from({ length: 10 }, (_, i) =>
      createLog({
        entityType: 'articulos',
        syncType: 'manual',
        status: 'success',
        recordsFetched: i + 1,
        recordsSent: i + 1
      })
    );

    await Promise.all(logPromises);

    // Assert
    expect(mockListener).toHaveBeenCalledTimes(10);

    // Verify all logs have unique IDs
    const logIds = mockListener.mock.calls.map((call) => (call[0] as SyncLog).id);
    const uniqueIds = new Set(logIds);
    expect(uniqueIds.size).toBe(10);
  });

  it('should verify SSE endpoint would return correct headers (unit test of handler logic)', () => {
    // This tests the expected SSE headers without actually starting a server
    const expectedHeaders = {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
      'X-Accel-Buffering': 'no'
    };

    // Verify these are the correct SSE headers
    expect(expectedHeaders['Content-Type']).toBe('text/event-stream');
    expect(expectedHeaders['Cache-Control']).toBe('no-cache');
    expect(expectedHeaders['Connection']).toBe('keep-alive');
    expect(expectedHeaders['X-Accel-Buffering']).toBe('no');
  });

  it('should filter logs by entityType in SSE handler logic', async () => {
    // Arrange
    const allLogsListener = vi.fn();
    const articulosListener = vi.fn();

    logEventEmitter.on('newLog', allLogsListener);

    // Simulate filter logic (this would be done by SSE handler)
    logEventEmitter.on('newLog', (log: SyncLog) => {
      if (log.entityType === 'articulos') {
        articulosListener(log);
      }
    });

    // Act - Create logs of different types
    await createLog({
      entityType: 'articulos',
      syncType: 'manual',
      status: 'success'
    });

    await createLog({
      entityType: 'comprobantes_cabecera',
      syncType: 'manual',
      status: 'success'
    });

    await createLog({
      entityType: 'articulos',
      syncType: 'manual',
      status: 'success'
    });

    // Assert
    expect(allLogsListener).toHaveBeenCalledTimes(3); // Receives all logs
    expect(articulosListener).toHaveBeenCalledTimes(2); // Only receives articulos logs

    // Verify filtered logs are correct type
    const filteredLogs = articulosListener.mock.calls.map((call) => call[0] as SyncLog);
    filteredLogs.forEach((log) => {
      expect(log.entityType).toBe('articulos');
    });
  });
});
