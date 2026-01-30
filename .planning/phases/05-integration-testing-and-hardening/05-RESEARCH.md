# Phase 5: Integration Testing & Hardening - Research

**Researched:** 2026-01-30
**Domain:** Integration testing, Gateway logging, Real-time dashboard updates
**Confidence:** HIGH

## Summary

This phase focuses on three interconnected domains: (1) integration testing that validates the complete schema-driven sync pipeline end-to-end, (2) gateway logging infrastructure for production observability, and (3) real-time dashboard log display using Server-Sent Events.

The existing codebase already has a solid testing foundation with Vitest configured in `objetiva-sync`, including integration tests that use in-memory SQLite databases with proper cleanup. The gateway uses Pino for logging but lacks structured ingestion logging. The dashboard currently uses HTMX with polling for log updates.

**Primary recommendation:** Use transaction-based test isolation for PostgreSQL integration tests, implement SSE via `@fastify/sse` for real-time log updates, and extend Pino logging with human-readable production format including batch metadata.

## Standard Stack

The established libraries/tools for this domain:

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| vitest | 2.x | Test runner | Already in use, fast, native ESM, excellent TypeScript support |
| @fastify/sse | latest | Server-Sent Events | Official Fastify plugin, clean API, maintains connection lifecycle |
| pino | 9.x | Structured logging | Already in both sync/gateway, high performance, structured output |
| pino-pretty | 12.x | Human-readable logs | Already in use for development, readable format |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| vitest-environment-prisma-postgres | latest | Test isolation | Transaction-based rollback for Prisma/PostgreSQL tests |
| testcontainers | 11.x | Docker-based test DB | Alternative if real PostgreSQL needed vs mocking |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| @fastify/sse | fastify-sse-v2 | Third-party, less maintained, but supports async generators better |
| Real PostgreSQL | Mock Prisma | Faster tests but less realistic, may miss PostgreSQL-specific behavior |
| vitest-environment-prisma-postgres | Manual transaction setup | More control but more boilerplate |

**Installation:**
```bash
# In objetiva-sync (already has vitest)
# No new dependencies needed for basic integration tests

# In objetiva-sync-gateway
npm install @fastify/sse
```

## Architecture Patterns

### Recommended Test Structure
```
objetiva-sync/
├── src/__tests__/           # Unit tests with mocks
├── tests/                   # Integration tests
│   ├── integration/         # End-to-end sync pipeline tests
│   │   ├── articulos.integration.test.ts
│   │   ├── comprobantes-cabecera.integration.test.ts
│   │   ├── comprobantes-detalle.integration.test.ts
│   │   ├── comprobantes-pagos.integration.test.ts
│   │   └── schema-change.integration.test.ts
│   ├── fixtures/            # Test data factories
│   │   └── test-data.ts
│   └── setup/               # Test environment setup
│       └── test-db.ts
```

### Pattern 1: Transaction-Based Test Isolation
**What:** Each test runs within a database transaction that rolls back after completion
**When to use:** PostgreSQL integration tests requiring realistic database behavior
**Example:**
```typescript
// Source: vitest-environment-prisma-postgres documentation
// tests/setup/test-db.ts
import { beforeEach, afterEach } from 'vitest';
import { prisma } from './prisma-client';

let transactionId: string;

beforeEach(async () => {
  // Start transaction
  await prisma.$executeRaw`BEGIN`;
  transactionId = await prisma.$queryRaw`SELECT txid_current()`;
});

afterEach(async () => {
  // Rollback transaction
  await prisma.$executeRaw`ROLLBACK`;
});
```

### Pattern 2: Test Data Factories (Recommended for this project)
**What:** Functions that generate valid test data with sensible defaults and overrides
**When to use:** Integration tests needing realistic entity data
**Example:**
```typescript
// tests/fixtures/test-data.ts
export function createArticulo(overrides: Partial<ArticuloInput> = {}): ArticuloInput {
  return {
    erp_codigo: `ART-${Date.now()}`,
    sku: `SKU-${Date.now()}`,
    codigo: `COD-${Date.now()}`,
    nombre: 'Test Articulo',
    objeto: 'producto',
    ...overrides
  };
}

export function createComprobanteCabecera(overrides: Partial<ComprobanteCabeceraInput> = {}): ComprobanteCabeceraInput {
  const timestamp = Date.now();
  return {
    erp_operacion: 'FC',
    erp_formulario: 'A',
    erp_numero: `${timestamp}`,
    operacion: 'FC',
    formulario: 'A',
    numero: `${timestamp}`,
    fecha: new Date().toISOString(),
    cantidad_items: 1,
    total_bruto: 100,
    total_descuentos: 0,
    total_neto: 100,
    total_iva: 21,
    total_venta: 121,
    ...overrides
  };
}
```

### Pattern 3: SSE Log Streaming
**What:** Server-Sent Events endpoint for real-time log updates
**When to use:** Dashboard real-time log display
**Example:**
```typescript
// Source: @fastify/sse official documentation
import sse from '@fastify/sse';

// Register plugin
await app.register(sse, { heartbeatInterval: 15000 });

// SSE endpoint for logs
app.get('/api/logs/stream', { sse: true }, async (request, reply) => {
  reply.sse.keepAlive();

  // On new log entry (from event emitter or pub/sub)
  logEmitter.on('log', (log) => {
    reply.sse.send({
      event: 'log',
      data: formatLogForDisplay(log),
      id: log.id.toString()
    });
  });

  // Cleanup on disconnect
  reply.sse.onClose(() => {
    logEmitter.removeListener('log', handler);
  });
});
```

### Pattern 4: Human-Readable Production Logging
**What:** Structured but human-readable log format for production
**When to use:** Gateway batch ingestion logging
**Example:**
```typescript
// Gateway logging format for batch ingestion
function logBatchIngestion(result: IngestionResult, metadata: BatchMetadata) {
  const level = result.errors.length > 0 ? 'warn' : 'info';

  const message = result.errors.length === 0
    ? `[${metadata.entity}] Batch ${metadata.batchNumber}/${metadata.totalBatches} ingested: ${result.inserted} inserted, ${result.updated} updated`
    : `[${metadata.entity}] Batch ${metadata.batchNumber}/${metadata.totalBatches} partial: ${result.inserted} inserted, ${result.updated} updated, ${result.errors.length} failed`;

  logger[level]({
    entity: metadata.entity,
    queryId: metadata.queryId,
    queryName: metadata.queryName,
    batchNumber: metadata.batchNumber,
    totalBatches: metadata.totalBatches,
    inserted: result.inserted,
    updated: result.updated,
    errorCount: result.errors.length,
    errors: result.errors.slice(0, 3) // First 3 errors for debugging
  }, message);
}
```

### Anti-Patterns to Avoid
- **Shared test database state:** Tests that depend on data from other tests cause flaky failures
- **Polling for real-time updates:** SSE is more efficient and reliable than polling intervals
- **Silent failures in logs:** Always include error codes and actionable context in log messages
- **Test timeouts without cleanup:** Ensure database transactions rollback even on timeout

## Don't Hand-Roll

Problems that look simple but have existing solutions:

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Test isolation | Manual truncation between tests | Transaction rollback | Faster, no race conditions, no foreign key issues |
| SSE connection management | Raw `reply.raw.write()` | @fastify/sse plugin | Handles heartbeat, reconnection, Last-Event-ID |
| Log event broadcasting | Global state/callbacks | Node.js EventEmitter | Built-in, reliable, supports multiple listeners |
| Test data generation | Hardcoded fixtures | Factory functions | Flexible, prevents accidental collisions |

**Key insight:** The Fastify ecosystem has mature SSE support that handles edge cases (heartbeat, disconnection, backpressure) that would be error-prone to implement manually.

## Common Pitfalls

### Pitfall 1: Parallel Test Execution with Shared Database
**What goes wrong:** Tests modify the same database rows causing race conditions
**Why it happens:** Vitest runs tests in parallel by default
**How to avoid:** Use `--no-threads` flag for database integration tests, or ensure complete isolation via transactions
**Warning signs:** Tests pass individually but fail when run together

### Pitfall 2: SSE Connection Accumulation
**What goes wrong:** Server accumulates stale SSE connections, memory grows
**Why it happens:** Client disconnects silently without cleanup
**How to avoid:** Use `reply.sse.onClose()` for cleanup, implement heartbeat to detect dead connections
**Warning signs:** Memory usage grows over time, `reply.sse.isConnected` returns false for connections

### Pitfall 3: Test Database Schema Drift
**What goes wrong:** Integration tests fail because test database schema differs from production
**Why it happens:** Migrations not applied to test database
**How to avoid:** Run `prisma migrate deploy` before tests, or use same database setup script as production
**Warning signs:** Tests work locally but fail in CI, or vice versa

### Pitfall 4: Flaky Tests from Timing Issues
**What goes wrong:** Tests intermittently fail due to async operations not completing
**Why it happens:** Using `setTimeout` or assuming synchronous execution
**How to avoid:** Use proper async/await, wait for database writes to confirm, use retry with exponential backoff in assertions
**Warning signs:** Tests fail ~10% of the time with timeout errors

### Pitfall 5: SSE Proxy Buffering
**What goes wrong:** SSE messages delayed or lost when behind reverse proxy
**Why it happens:** Proxies may buffer responses waiting for content-length
**How to avoid:** Configure nginx/reverse proxy to disable buffering for SSE endpoints (`X-Accel-Buffering: no`)
**Warning signs:** Messages arrive in batches instead of real-time in production but work locally

### Pitfall 6: Log Retention Causing Disk Issues
**What goes wrong:** Log storage grows unbounded
**Why it happens:** No automatic cleanup of old logs
**How to avoid:** Implement `deleteOldLogs()` on startup or scheduled task (7-day retention per CONTEXT.md)
**Warning signs:** Database size grows rapidly, queries slow down

## Code Examples

Verified patterns from official sources and codebase analysis:

### Integration Test Structure
```typescript
// tests/integration/articulos.integration.test.ts
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { PrismaClient } from '@prisma/client';
import { IngestionService } from '../../src/services/ingestion';
import { createArticulo, createArticuloBatch } from '../fixtures/test-data';

describe('Articulos Integration Test', () => {
  let prisma: PrismaClient;

  beforeAll(async () => {
    prisma = new PrismaClient({
      datasources: { db: { url: process.env.TEST_DATABASE_URL } }
    });
    await prisma.$connect();
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  beforeEach(async () => {
    // Clean test data - delete in correct order for FK constraints
    await prisma.articulo.deleteMany({
      where: { erp_codigo: { startsWith: 'TEST-' } }
    });
  });

  it('should ingest articulos batch successfully', async () => {
    const testData = createArticuloBatch(10, { erp_codigo: 'TEST-' });

    const result = await IngestionService.ingestArticulos(prisma, testData);

    expect(result.inserted).toBe(10);
    expect(result.updated).toBe(0);
    expect(result.errors).toHaveLength(0);

    // Verify in database
    const stored = await prisma.articulo.findMany({
      where: { erp_codigo: { startsWith: 'TEST-' } }
    });
    expect(stored).toHaveLength(10);
  });

  it('should update existing articulos', async () => {
    const articulo = createArticulo({ erp_codigo: 'TEST-UPDATE-001' });

    // Insert first
    await IngestionService.ingestArticulos(prisma, [articulo]);

    // Update with modified data
    const updated = { ...articulo, nombre: 'Updated Name' };
    const result = await IngestionService.ingestArticulos(prisma, [updated]);

    expect(result.inserted).toBe(0);
    expect(result.updated).toBe(1);

    // Verify update
    const stored = await prisma.articulo.findFirst({
      where: { erp_codigo: 'TEST-UPDATE-001' }
    });
    expect(stored?.nombre).toBe('Updated Name');
  });
});
```

### Schema Change Test (CLI Roundtrip)
```typescript
// tests/integration/schema-change.integration.test.ts
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { execSync } from 'node:child_process';
import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';

describe('Schema Change Propagation', () => {
  const gatewayRoot = resolve(__dirname, '../../../objetiva-sync-gateway');
  const syncRoot = resolve(__dirname, '../../../objetiva-sync');

  it('should regenerate schemas when column added', async () => {
    // This test validates the full CLI roundtrip:
    // 1. Schema change in PostgreSQL (simulated by ALTER TABLE)
    // 2. Run regenerate-schemas CLI
    // 3. Verify Prisma schema updated
    // 4. Verify Zod schema updated
    // 5. Verify sync validation uses new schema

    // Note: This test requires a real test database
    // Skip in environments without PostgreSQL
    if (!process.env.TEST_DATABASE_URL) {
      console.log('Skipping schema change test - no TEST_DATABASE_URL');
      return;
    }

    // Run regenerate-schemas in dry-run mode
    const output = execSync('npm run regenerate-schemas:dry-run', {
      cwd: gatewayRoot,
      encoding: 'utf-8',
      env: { ...process.env, DATABASE_URL: process.env.TEST_DATABASE_URL }
    });

    // Verify no errors
    expect(output).not.toContain('Error');
    expect(output).toContain('Schema Regeneration Tool');
  });
});
```

### SSE Log Streaming Implementation
```typescript
// Source: @fastify/sse official documentation pattern
// objetiva-sync/src/dashboard/routes/api/log-stream.ts
import type { FastifyInstance } from 'fastify';
import sse from '@fastify/sse';
import { EventEmitter } from 'node:events';

// Singleton event emitter for log broadcasting
export const logEventEmitter = new EventEmitter();
logEventEmitter.setMaxListeners(100); // Support many dashboard connections

export async function registerLogStreamRoutes(app: FastifyInstance) {
  // Register SSE plugin
  await app.register(sse, {
    heartbeatInterval: 15000 // 15s heartbeat per CONTEXT.md requirement
  });

  app.get('/api/logs/stream', {
    sse: true,
    preHandler: requireNoPasswordChange
  }, async (request, reply) => {
    const query = request.query as { entityType?: string; status?: string };

    // Keep connection alive
    reply.sse.keepAlive();

    // Send initial connection confirmation
    reply.sse.send({
      event: 'connected',
      data: { message: 'Log stream connected', filters: query }
    });

    // Handler for new log events
    const handler = (log: SyncLog) => {
      // Apply filters
      if (query.entityType && log.entityType !== query.entityType) return;
      if (query.status && log.status !== query.status) return;

      reply.sse.send({
        event: 'log',
        data: formatLogForSSE(log),
        id: log.id.toString()
      });
    };

    // Subscribe to log events
    logEventEmitter.on('newLog', handler);

    // Cleanup on disconnect
    reply.sse.onClose(() => {
      logEventEmitter.off('newLog', handler);
    });
  });
}

function formatLogForSSE(log: SyncLog) {
  return {
    id: log.id,
    entityType: log.entityType,
    queryName: log.queryName,
    status: log.status,
    recordsFetched: log.recordsFetched,
    recordsSent: log.recordsSent,
    recordsFailed: log.recordsFailed,
    durationMs: log.durationMs,
    errorMessage: log.errorMessage,
    createdAt: log.createdAt
  };
}
```

### Gateway Batch Logging Enhancement
```typescript
// Enhanced logging for IngestionService
// objetiva-sync-gateway/src/services/ingestion.ts additions

interface BatchMetadata {
  queryId?: number;
  queryName?: string;
  batchNumber: number;
  totalBatches: number;
  entity: string;
  syncId?: string;
}

function logIngestionResult(
  result: IngestionResult,
  metadata: BatchMetadata
): void {
  const hasErrors = result.errors.length > 0;
  const level = hasErrors ? 'warn' : 'info';

  // Human-readable message format per CONTEXT.md decision
  const statusText = hasErrors ? 'partial failure' : 'success';
  const message = `[SYNC] ${metadata.entity} batch ${metadata.batchNumber}/${metadata.totalBatches}: ${statusText} - ${result.inserted} inserted, ${result.updated} updated${hasErrors ? `, ${result.errors.length} failed` : ''}`;

  // Structured log data
  const logData: Record<string, unknown> = {
    syncId: metadata.syncId,
    queryId: metadata.queryId,
    queryName: metadata.queryName,
    entity: metadata.entity,
    batch: `${metadata.batchNumber}/${metadata.totalBatches}`,
    inserted: result.inserted,
    updated: result.updated
  };

  // Add error details for failed batches per CONTEXT.md requirement
  if (hasErrors) {
    logData.errorCount = result.errors.length;
    logData.sampleErrors = result.errors.slice(0, 3).map(err => ({
      identifier: err.identifier,
      code: err.code,
      error: err.error
    }));
  }

  logger[level](logData, message);
}
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Jest + manual DB cleanup | Vitest + transaction rollback | 2024 | 10x faster tests, better isolation |
| Polling for real-time | SSE/WebSocket | 2023+ | Lower latency, reduced server load |
| JSON-only logs | Hybrid (JSON prod + pretty dev) | Standard practice | Better debugging in development |
| Testcontainers | vitest-environment-prisma-postgres | 2024 | Simpler setup, faster startup |

**Deprecated/outdated:**
- `jest-mongodb` style: Global setup/teardown is slower than transaction isolation
- Manual SSE with `reply.raw`: Use `@fastify/sse` plugin instead
- `console.log` for production: Use structured logger (Pino) always

## Open Questions

Things that couldn't be fully resolved:

1. **Test Database Strategy**
   - What we know: Options are separate test PostgreSQL instance, transaction rollback, or mocking Prisma
   - What's unclear: Whether existing production PostgreSQL can be used with a test schema or needs separate instance
   - Recommendation: Start with transaction rollback using `vitest-environment-prisma-postgres` for maximum speed; fall back to Docker if realism needed

2. **SSE vs WebSocket for Real-Time Logs**
   - What we know: CONTEXT.md specifies "WebSocket or Server-Sent Events"
   - What's unclear: Whether bidirectional communication is needed
   - Recommendation: Use SSE - it's simpler for one-way server-to-client streaming, which is all logs need. @fastify/sse is well-maintained.

3. **Log Retention Implementation**
   - What we know: 7-day retention specified in CONTEXT.md, `deleteOldLogs()` exists in sync-logs-repo
   - What's unclear: Whether to run cleanup on startup, scheduled, or both
   - Recommendation: Run on application startup + daily scheduled task for reliability

## Sources

### Primary (HIGH confidence)
- [@fastify/sse GitHub](https://github.com/fastify/sse) - SSE plugin API and patterns
- [vitest-environment-prisma-postgres](https://github.com/codepunkt/vitest-environment-prisma-postgres) - Transaction-based test isolation
- [Prisma Integration Testing docs](https://www.prisma.io/docs/orm/prisma-client/testing/integration-testing) - Official Prisma testing guidance
- Existing codebase analysis: `objetiva-sync/vitest.config.ts`, `objetiva-sync/src/__tests__/*.test.ts`

### Secondary (MEDIUM confidence)
- [Pino Logger Guide](https://signoz.io/guides/pino-logger/) - Production logging patterns
- [Blazing fast Prisma tests](https://codepunkt.de/writing/blazing-fast-prisma-and-postgres-tests-in-vitest/) - Transaction rollback pattern
- [SSE with Fastify](https://edisondevadoss.medium.com/fastify-server-sent-events-sse-93de994e013b) - Implementation patterns

### Tertiary (LOW confidence)
- [Flaky Tests 2026 article](https://www.accelq.com/blog/flaky-tests/) - General flaky test guidance
- [SSE hidden risks article](https://medium.com/@2957607810/the-hidden-risks-of-sse-server-sent-events-what-developers-often-overlook-14221a4b3bfe) - SSE pitfalls

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH - Based on existing codebase libraries and official documentation
- Architecture: HIGH - Patterns derived from official Fastify/Vitest/Prisma docs and codebase analysis
- Pitfalls: MEDIUM - Mix of documented issues and common knowledge

**Research date:** 2026-01-30
**Valid until:** 2026-03-01 (30 days - stable technologies)
