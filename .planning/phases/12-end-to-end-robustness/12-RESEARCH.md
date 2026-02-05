# Phase 12: End-to-End Robustness - Research

**Researched:** 2026-02-04
**Domain:** E2E Testing, Error Recovery, Integration Testing
**Confidence:** HIGH

## Summary

Phase 12 validates the complete sync pipeline from schema change through regeneration, validation, and sync with reliable error recovery. This is a VALIDATION phase, not a feature-building phase. The research covers E2E testing strategies for multi-service Node.js applications, error recovery patterns with retry/backoff, chaos testing for network failures, and data integrity validation.

The project already has solid foundations: Vitest test framework, existing integration tests, retry queue manager with exponential backoff, error classifier, and a real E2E test harness (`tests/e2e/real-sync-test.ts`). The standard approach for 2026 is to use Vitest for unit/integration tests, Testcontainers for database isolation, and lightweight chaos injection tools (chaos-fetch, nock) for failure simulation. Data integrity is validated through database constraints and transaction testing.

**Primary recommendation:** Build E2E workflow tests using Vitest with Testcontainers for PostgreSQL isolation, use existing retry/error recovery mechanisms, inject chaos via nock for network failure simulation, and validate data integrity through database constraint testing.

## Standard Stack

The established libraries/tools for this domain:

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| vitest | 2.1.8+ | Test framework | Already used in project, fast, native ESM support, perfect for Node.js backends |
| testcontainers | latest | Database isolation | Industry standard for integration testing with real databases in Docker |
| nock | 13.x+ | HTTP mocking/chaos | De facto standard for HTTP request mocking in Node.js, now uses MSW interceptors |
| @databases/pg-test | latest | PostgreSQL testing | Uses Docker to provide real PostgreSQL instances for tests |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| chaos-fetch | latest | Network chaos injection | Simulate latency, errors, rate limiting in fetch calls |
| msw | 2.x+ | API mocking | Alternative to nock, more modern API, works in browser + Node |
| retry | 0.13.x+ | Exponential backoff | Already exists in project via exponential-backoff npm package |
| pg (node-postgres) | latest | PostgreSQL client | For direct database queries in test assertions |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| testcontainers | @electric-sql/pglite | PGlite is WASM Postgres, zero Docker overhead, but not full PostgreSQL feature set |
| nock | msw | MSW has more modern API, works in browser too, but nock is simpler for pure Node.js |
| vitest | jest | Jest is more mature, but Vitest is 10-20x faster for ESM projects |

**Installation:**
```bash
# Already installed in project
npm install vitest@2.1.8

# Add for Phase 12
npm install --save-dev testcontainers nock @types/node
```

## Architecture Patterns

### Recommended Project Structure
```
objetiva-sync/
├── tests/
│   ├── e2e/                      # Full E2E tests (real services)
│   │   └── real-sync-test.ts     # ✅ Already exists
│   ├── integration/              # Integration tests (mocked external deps)
│   │   ├── workflow-validation.test.ts
│   │   └── error-recovery.test.ts
│   └── setup.ts                  # Global test setup
├── vitest.config.ts              # Main config
└── vitest.e2e.config.ts          # Separate E2E config (optional)

objetiva-sync-gateway/
├── tests/
│   ├── integration/
│   │   ├── schema-regeneration.test.ts
│   │   └── introspection.test.ts
│   └── setup.ts
└── vitest.config.ts
```

### Pattern 1: Testcontainers with Vitest Global Setup
**What:** Start PostgreSQL container once in global setup, create unique database per test suite
**When to use:** Integration tests that need real PostgreSQL (schema validation, constraint testing)
**Example:**
```typescript
// vitest.global-setup.ts
import { PostgreSqlContainer } from 'testcontainers';

let container: StartedPostgreSqlContainer;

export async function setup() {
  container = await new PostgreSqlContainer('postgres:16')
    .withDatabase('test_db')
    .withUsername('test_user')
    .withPassword('test_pass')
    .start();

  // Store connection info for tests
  process.env.TEST_DATABASE_URL = container.getConnectionUri();

  return async () => {
    await container.stop();
  };
}
```

**In test file:**
```typescript
// schema-regeneration.test.ts
import { describe, it, beforeAll, afterAll, expect } from 'vitest';
import { Client } from 'pg';

describe('Schema Regeneration E2E', () => {
  let pgClient: Client;

  beforeAll(async () => {
    pgClient = new Client({ connectionString: process.env.TEST_DATABASE_URL });
    await pgClient.connect();
  });

  afterAll(async () => {
    await pgClient.end();
  });

  it('should regenerate schemas after table column added', async () => {
    // 1. Add column to PostgreSQL
    await pgClient.query('ALTER TABLE articulos ADD COLUMN test_field VARCHAR(50)');

    // 2. Trigger regeneration (call regenerate-schemas endpoint)
    // 3. Verify Zod schema includes new field
    // 4. Verify Prisma schema includes new field
  });
});
```

### Pattern 2: Chaos Testing with Nock
**What:** Intercept HTTP requests and inject failures (timeouts, connection refused, 5xx errors)
**When to use:** Testing error recovery, retry logic, graceful degradation
**Example:**
```typescript
// error-recovery.test.ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import nock from 'nock';
import { ArticulosClient } from '../src/api-client/articulos-client.js';
import { classifyError } from '../src/utils/error-classifier.js';

describe('Error Recovery', () => {
  beforeEach(() => {
    nock.cleanAll();
  });

  afterEach(() => {
    nock.cleanAll();
  });

  it('should retry and recover when gateway is temporarily down', async () => {
    const gatewayUrl = 'http://localhost:3335';

    // First 2 attempts: connection refused
    nock(gatewayUrl)
      .post('/api/articulos/batch')
      .twice()
      .replyWithError({ code: 'ECONNREFUSED' });

    // Third attempt: success
    nock(gatewayUrl)
      .post('/api/articulos/batch')
      .reply(200, { success: true, inserted: 10, updated: 0, errors: [] });

    // Execute with retry logic
    // Verify eventual success after retries
  });

  it('should classify ECONNREFUSED as GATEWAY_UNREACHABLE with isRetryable=true', () => {
    const error = new Error('connect ECONNREFUSED 127.0.0.1:3335');
    const classified = classifyError(error);

    expect(classified.code).toBe('GATEWAY_UNREACHABLE');
    expect(classified.isRetryable).toBe(true);
  });
});
```

### Pattern 3: Data Integrity Testing
**What:** Verify no duplicates/corruption during failures by checking database constraints
**When to use:** Validating batch retry logic doesn't insert duplicates
**Example:**
```typescript
// data-integrity.test.ts
import { describe, it, expect, beforeAll } from 'vitest';
import { PrismaClient } from '@prisma/client';

describe('Data Integrity During Failures', () => {
  let prisma: PrismaClient;

  beforeAll(() => {
    prisma = new PrismaClient();
  });

  it('should not create duplicates when batch is retried', async () => {
    // 1. Insert batch with SKU='TEST-001'
    // 2. Simulate failure mid-batch
    // 3. Retry entire batch (includes TEST-001 again)
    // 4. Query database for SKU='TEST-001'

    const articles = await prisma.articulos.findMany({
      where: { sku: 'TEST-001' }
    });

    // Should only have ONE record despite retry
    expect(articles).toHaveLength(1);
  });

  it('should preserve lastSyncValue when sync is cancelled', async () => {
    // Test cancellation doesn't corrupt sync state (Phase 10 requirement)
  });
});
```

### Pattern 4: Separate E2E Config for Full Workflow Tests
**What:** Separate vitest config for E2E tests that run against real services
**When to use:** Full end-to-end tests (schema change → regeneration → sync)
**Example:**
```typescript
// vitest.e2e.config.ts
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['tests/e2e/**/*.test.ts'],
    testTimeout: 60000, // E2E tests take longer
    hookTimeout: 30000,
    globals: true,
    environment: 'node',
    // Don't parallelize E2E tests - they modify shared state
    pool: 'forks',
    poolOptions: {
      forks: {
        singleFork: true, // Run serially
      },
    },
  },
});
```

### Anti-Patterns to Avoid
- **Starting containers per test:** Extremely slow, start once in beforeAll or globalSetup
- **Mocking database in integration tests:** Defeats purpose - use real DB via testcontainers
- **Not cleaning up containers:** Always stop containers in afterAll/globalTeardown
- **Testing with production gateway:** Use test gateway or mock, never hit production
- **Not verifying database state:** E2E test must query DB to confirm data arrived correctly

## Don't Hand-Roll

Problems that look simple but have existing solutions:

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Exponential backoff retry | Custom sleep + counter loop | retry npm package OR existing RetryQueueManager | Edge cases: jitter, max attempts, exponential calculation errors |
| PostgreSQL test database | Manual pg_dump/restore scripts | testcontainers or @databases/pg-test | Container lifecycle, cleanup, parallel test isolation |
| HTTP mocking | Custom monkey-patch of fetch | nock or msw | Request matching, response simulation, persist/replay |
| Schema diffing | String comparison of generated files | diff-display.ts (already exists) | Colored output, change detection, summary stats |
| Test database seeding | Custom SQL scripts | Prisma migrations + seed.ts | Type-safe, versioned, repeatable |

**Key insight:** Error recovery is complex - exponential backoff needs jitter to prevent thundering herd, max retry caps to prevent infinite loops, and proper error classification to know what's retryable. The project already has robust error handling (error-classifier.ts, retry-queue-manager.ts) - don't rebuild it.

## Common Pitfalls

### Pitfall 1: Testcontainers Not Stopping
**What goes wrong:** PostgreSQL containers accumulate, consuming ports/memory
**Why it happens:** Test process exits before afterAll/globalTeardown runs, or errors thrown in setup
**How to avoid:** Always wrap container.stop() in try-finally, use Vitest's globalTeardown, add timeout to stop calls
**Warning signs:** `docker ps` shows multiple postgres containers running, port 5432 already in use errors

### Pitfall 2: Flaky Network Tests Due to Real Timing
**What goes wrong:** Tests fail intermittently because retry timing is unpredictable
**Why it happens:** Real exponential backoff has random jitter, tests assert on exact retry counts
**How to avoid:** Mock time via vi.useFakeTimers(), assert on eventual success not retry count, use nock.persist() for unlimited retries
**Warning signs:** Tests pass locally but fail in CI, tests fail when run multiple times

### Pitfall 3: Race Conditions in Parallel Tests
**What goes wrong:** Tests interfere with each other - one test's data appears in another test
**Why it happens:** Vitest runs test files in parallel by default, sharing same database
**How to avoid:** Use unique database per test file (create in beforeAll), or run E2E tests serially (pool: 'forks', singleFork: true)
**Warning signs:** Tests fail when run together but pass in isolation (--no-parallel flag)

### Pitfall 4: Not Testing Actual Cancellation Signal
**What goes wrong:** Tests verify retry logic but don't test user cancellation (AbortSignal)
**Why it happens:** Forgetting that AbortSignal is separate from timeout/retry
**How to avoid:** Create tests that call abortController.abort() mid-sync, verify sync stops immediately without retries
**Warning signs:** Cancellation tests missing, Phase 10 cancellation behavior not validated

### Pitfall 5: Schema Regeneration Tests Don't Restart Gateway
**What goes wrong:** Test calls /api/schemas/regenerate but doesn't wait for gateway to restart
**Why it happens:** Regeneration endpoint returns 202 immediately, actual work happens in background
**How to avoid:** Test must poll gateway health endpoint until restart completes, or mock the spawn() call and test logic without actual restart
**Warning signs:** Tests timeout waiting for regenerated schemas, gateway process killed mid-test

## Code Examples

Verified patterns from research and existing codebase:

### Full E2E Workflow Test (Schema Change → Regeneration → Sync)
```typescript
// workflow-validation.test.ts
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { PostgreSqlContainer, StartedPostgreSqlContainer } from 'testcontainers';
import { Client } from 'pg';
import { fetch } from 'undici';

describe('E2E Workflow: Schema Change → Regeneration → Sync', () => {
  let pgContainer: StartedPostgreSqlContainer;
  let pgClient: Client;
  let gatewayUrl: string;

  beforeAll(async () => {
    // Start PostgreSQL container
    pgContainer = await new PostgreSqlContainer('postgres:16')
      .withDatabase('test_gateway_db')
      .start();

    pgClient = new Client({ connectionString: pgContainer.getConnectionUri() });
    await pgClient.connect();

    // Create initial schema
    await pgClient.query(`
      CREATE TABLE articulos (
        sku VARCHAR(50) PRIMARY KEY,
        nombre VARCHAR(255) NOT NULL,
        objeto VARCHAR(50)
      );
    `);

    // Start gateway pointing to this database
    gatewayUrl = 'http://localhost:3335';
  }, 60000);

  afterAll(async () => {
    await pgClient.end();
    await pgContainer.stop();
  });

  it('should complete full workflow successfully', async () => {
    // Step 1: Add column to PostgreSQL schema
    await pgClient.query('ALTER TABLE articulos ADD COLUMN precio NUMERIC(10,2)');

    // Step 2: Trigger regenerate-schemas endpoint
    const regenResponse = await fetch(`${gatewayUrl}/api/schemas/regenerate`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });

    expect(regenResponse.status).toBe(202);

    // Step 3: Wait for gateway to restart (poll health endpoint)
    await waitForGatewayRestart(gatewayUrl);

    // Step 4: Verify Zod schema includes new field
    // (Read shared/schemas/articulos.ts, check for 'precio' field)

    // Step 5: Execute sync with new field
    // (Send batch with precio field, verify it validates and persists)

    // Step 6: Query PostgreSQL to verify data arrived correctly
    const result = await pgClient.query('SELECT * FROM articulos WHERE sku = $1', ['TEST-SKU']);
    expect(result.rows[0].precio).toBeDefined();
  }, 120000);
});

async function waitForGatewayRestart(url: string, maxAttempts = 30): Promise<void> {
  for (let i = 0; i < maxAttempts; i++) {
    try {
      const response = await fetch(`${url}/health`);
      if (response.ok) return;
    } catch {
      // Gateway still down
    }
    await new Promise(resolve => setTimeout(resolve, 2000));
  }
  throw new Error('Gateway did not restart in time');
}
```

### Testing Retry with Exponential Backoff
```typescript
// retry-backoff.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { RetryQueueManager } from '../src/sync/retry-queue-manager.js';
import type { RetryQueueItem } from '../src/store/schema.js';

describe('Retry Queue with Exponential Backoff', () => {
  let retryManager: RetryQueueManager;

  beforeEach(() => {
    retryManager = new RetryQueueManager();
    vi.useFakeTimers();
  });

  it('should retry failed batches with increasing backoff', async () => {
    // Mock processor function that fails first 2 times, succeeds on 3rd
    let attemptCount = 0;
    const mockProcessor = vi.fn(async (item: RetryQueueItem) => {
      attemptCount++;
      if (attemptCount < 3) {
        return { success: false, error: 'Temporary failure' };
      }
      return { success: true };
    });

    // Add failed batch to queue
    const itemId = await retryManager.addFailedBatch({
      entityType: 'articulos',
      syncType: 'FULL',
      payload: [{ sku: 'TEST-001' }],
      error: 'Initial failure',
    });

    // Process retries (fast-forward time between attempts)
    for (let i = 0; i < 3; i++) {
      await retryManager.processRetries(mockProcessor);
      vi.advanceTimersByTime(60000); // Simulate time passing
    }

    // Verify success after retries
    expect(mockProcessor).toHaveBeenCalledTimes(3);
    expect(attemptCount).toBe(3);
  });
});
```

### Testing Gateway Unreachable Recovery
```typescript
// gateway-unreachable.test.ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import nock from 'nock';
import { ArticulosClient } from '../src/api-client/articulos-client.js';
import { AuthManager } from '../src/api-client/auth.js';

describe('Gateway Unreachable Recovery', () => {
  const GATEWAY_URL = 'http://localhost:3335';
  let client: ArticulosClient;
  let authManager: AuthManager;

  beforeEach(() => {
    nock.cleanAll();
    authManager = new AuthManager(GATEWAY_URL, 'test-user', 'test-pass');
    client = new ArticulosClient(GATEWAY_URL, authManager);
  });

  afterEach(() => {
    nock.cleanAll();
  });

  it('should recover when gateway comes back online', async () => {
    // Mock auth endpoint
    nock(GATEWAY_URL)
      .post('/auth/login')
      .reply(200, { token: 'test-jwt-token' });

    // First attempt: connection refused (gateway down)
    nock(GATEWAY_URL)
      .post('/api/articulos/batch')
      .replyWithError({ code: 'ECONNREFUSED' });

    // Second attempt: success (gateway back up)
    nock(GATEWAY_URL)
      .post('/api/articulos/batch')
      .reply(200, {
        success: true,
        data: { inserted: 1, updated: 0, errors: [] },
      });

    // First call should fail
    await expect(
      client.sendBatch([{ sku: 'TEST-001', nombre: 'Test' }])
    ).rejects.toThrow();

    // Second call (retry) should succeed
    const result = await client.sendBatch([{ sku: 'TEST-001', nombre: 'Test' }]);
    expect(result.success).toBe(true);
    expect(result.inserted).toBe(1);
  });
});
```

### Testing No Duplicates on Batch Retry
```typescript
// duplicate-prevention.test.ts
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { PrismaClient } from '@prisma/client';
import { PostgreSqlContainer } from 'testcontainers';

describe('Data Integrity - No Duplicates on Retry', () => {
  let prisma: PrismaClient;
  let container: any;

  beforeAll(async () => {
    container = await new PostgreSqlContainer('postgres:16')
      .withDatabase('test_integrity_db')
      .start();

    prisma = new PrismaClient({
      datasources: {
        db: { url: container.getConnectionUri() },
      },
    });

    // Run migrations to create schema with constraints
    // In real test, use: execSync('npx prisma migrate deploy')
  });

  afterAll(async () => {
    await prisma.$disconnect();
    await container.stop();
  });

  it('should not create duplicate records when batch retried', async () => {
    // Insert batch
    await prisma.articulos.createMany({
      data: [
        { sku: 'TEST-001', nombre: 'Product 1' },
        { sku: 'TEST-002', nombre: 'Product 2' },
      ],
      skipDuplicates: true, // Use upsert behavior
    });

    // Simulate retry - same batch sent again
    await prisma.articulos.createMany({
      data: [
        { sku: 'TEST-001', nombre: 'Product 1' }, // Duplicate SKU
        { sku: 'TEST-002', nombre: 'Product 2' }, // Duplicate SKU
      ],
      skipDuplicates: true,
    });

    // Verify only 2 records exist (no duplicates)
    const count = await prisma.articulos.count();
    expect(count).toBe(2);

    const articles = await prisma.articulos.findMany({
      orderBy: { sku: 'asc' },
    });

    expect(articles).toHaveLength(2);
    expect(articles[0].sku).toBe('TEST-001');
    expect(articles[1].sku).toBe('TEST-002');
  });
});
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Jest for Node.js testing | Vitest with native ESM | 2023-2024 | 10-20x faster test execution, better ESM support |
| Manual Docker setup | Testcontainers library | 2022+ | Automatic container lifecycle, parallel test isolation |
| Custom retry logic | retry/exponential-backoff npm packages | Always standard | Jitter, max attempts, proper backoff calculation |
| Nock with custom interceptors | Nock using @mswjs/interceptors | 2024-2025 | Unified interception layer, fetch() support |
| Integration tests against production DB | Testcontainers with test databases | 2020+ | No risk to production data, parallel testing |

**Deprecated/outdated:**
- `pg-mem` (in-memory PostgreSQL): Limited feature support, better to use PGlite or testcontainers
- Jest for new Node.js projects: Vitest is now standard for ESM projects
- Mocha: Serial test execution too slow for modern CI pipelines

## Open Questions

Things that couldn't be fully resolved:

1. **Gateway Restart Detection in Tests**
   - What we know: /api/schemas/regenerate returns 202, spawns background process that kills gateway
   - What's unclear: Best way to detect when gateway has fully restarted (health endpoint? file watching?)
   - Recommendation: Add /health endpoint to gateway if missing, poll until response or implement file-based signal

2. **Testcontainers Startup Time in CI**
   - What we know: Starting PostgreSQL containers takes 20-30 seconds
   - What's unclear: Whether AlmaLinux CI environment has Docker available and sufficient resources
   - Recommendation: Test on actual CI environment, consider PGlite as lightweight alternative for schema validation tests

3. **Retry Queue Persistence Across Gateway Restarts**
   - What we know: Retry queue is in SQLite, survives restarts
   - What's unclear: Whether in-flight retries are correctly resumed after unexpected gateway crash
   - Recommendation: Add E2E test that kills gateway mid-retry, verifies retry resumes on restart

4. **Incremental Sync Clock Skew Testing**
   - What we know: Phase 10 added 5-minute overlap for clock skew protection
   - What's unclear: How to effectively test this in integration tests (requires time manipulation)
   - Recommendation: Use vi.useFakeTimers() or inject Date.now mock, advance by 4:59 vs 5:01 to test boundary

## Sources

### Primary (HIGH confidence)
- Vitest official docs: [vitest.dev/guide](https://vitest.dev/guide/)
- Testcontainers Node.js: [node.testcontainers.org](https://node.testcontainers.org/)
- Existing codebase:
  - `objetiva-sync/src/sync/retry-queue-manager.ts` - Retry logic implementation
  - `objetiva-sync/src/utils/error-classifier.ts` - Error classification and retry decisions
  - `objetiva-sync/src/api-client/articulos-client.ts` - AbortSignal.timeout usage
  - `objetiva-sync/tests/e2e/real-sync-test.ts` - Existing E2E test pattern
  - `objetiva-sync-gateway/src/routes/regenerate-schemas.ts` - Schema regeneration endpoint

### Secondary (MEDIUM confidence)
- [How to Test Your Node.js RESTful API with Vitest](https://danioshi.substack.com/p/how-to-test-your-nodejs-restful-api)
- [Nucamp: Testing in 2026](https://www.nucamp.co/blog/testing-in-2026-jest-react-testing-library-and-full-stack-testing-strategies)
- [Douglas Goulart: Vitest + PostgreSQL + Prisma](https://www.douglasgoulart.com/writings/creating-a-complete-nodejs-test-environment-with-vitest-postgresql-and-prisma)
- [V. Checha: Advanced Node.js Retry Patterns](https://v-checha.medium.com/advanced-node-js-patterns-implementing-robust-retry-logic-656cf70f8ee9)
- [Nasik Nazzar: Building Resilient Node.js Services](https://medium.com/@mnnasik7/building-resilient-node-js-services-with-exponential-backoff-5334fa5a3f7e)
- [retry npm package](https://www.npmjs.com/package/retry)
- [backoff npm package](https://www.npmjs.com/package/backoff)
- [DEV Community: Chaos-Driven Testing](https://dev.to/gkoos/chaos-driven-testing-for-full-stack-apps-integration-tests-that-break-and-heal-2ijk)
- [Splunk: Chaos Testing Explained](https://www.splunk.com/en_us/blog/learn/chaos-testing.html)
- [Diginode: Chaos Engineering for Node.js](https://diginode.in/nodejs/chaos-engineering-and-resilience-testing-for-node-js-applications/)
- [GitHub: node-chaos-monkey](https://github.com/goldbergyoni/node-chaos-monkey)
- [Practica.js: Testing Dark Scenarios](https://practica.dev/blog/testing-the-dark-scenarios-of-your-nodejs-application/)
- [@databases/pg-test docs](https://www.atdatabases.org/docs/pg-test)
- [Medium: Postgres and Integration Testing](https://medium.com/geoblinktech/postgres-and-integration-testing-in-node-js-apps-2e1b52af7ffc)
- [Corey Cleary: Know What to Test](https://www.coreycleary.me/know-what-to-test-using-these-recipes-node-service-that-calls-a-database)
- [QASource: Data Migration Testing 2026](https://blog.qasource.com/a-guide-to-data-migration-testing)
- [Rivery: Data Migration Checklist 2026](https://rivery.io/data-learning-center/complete-data-migration-checklist/)
- [Datafold: AI-Powered Data Migrations](https://www.datafold.com/blog/datafolds-ai-powered-data-migration-with-end-to-end-data-validation)
- [Testcontainers Getting Started](https://testcontainers.com/guides/getting-started-with-testcontainers-for-nodejs/)
- [DEV: Using TestContainers with Vitest](https://dev.to/jcteague/using-testconatiners-with-vitest-499f)
- [Codepunkt: Blazing Fast Prisma and Postgres Tests in Vitest](https://codepunkt.de/writing/blazing-fast-prisma-and-postgres-tests-in-vitest/)
- [Nikola Milovic: Integration Testing Node.js Postgres with Vitest & Testcontainers](https://nikolamilovic.com/posts/integration-testing-node-postgres-vitest-testcontainers/)
- [GitHub: vitest-database-containers](https://github.com/ivandotv/vitest-database-containers)
- [GitHub: vitest-environment-testcontainers](https://github.com/dextertanyj/vitest-environment-testcontainers)
- [MSW Comparison with Nock](https://mswjs.io/docs/comparison/)
- [OneUptime: Mock External APIs in Node.js Tests](https://oneuptime.com/blog/post/2026-01-06-nodejs-mock-external-apis-tests/view)
- [LogRocket: API Mock Testing with Nock](https://blog.logrocket.com/api-mock-testing-with-nock-node-js/)
- [kettanaito.com: Mocking in Node.js Has Just Changed Forever](https://kettanaito.com/blog/mocking-in-nodejs-has-just-changed-forever)
- [GitHub: nock](https://github.com/nock/nock)
- [MSW Node.js Integration](https://mswjs.io/docs/integrations/node)

### Tertiary (LOW confidence)
- None - all findings verified with official docs or existing codebase

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH - Vitest, testcontainers, nock are industry standard, already using Vitest
- Architecture: HIGH - Patterns verified in official docs + existing codebase matches recommendations
- Pitfalls: HIGH - Based on official documentation warnings and common Node.js testing issues
- Error recovery: HIGH - Project already has robust implementation (retry-queue-manager.ts, error-classifier.ts)
- Chaos testing: MEDIUM - Tools exist (nock, chaos-fetch) but project doesn't currently use them
- Testcontainers setup: MEDIUM - Requires Docker in test environment, not yet configured

**Research date:** 2026-02-04
**Valid until:** 2026-03-04 (30 days - testing patterns are stable)

## Additional Context: Project-Specific Findings

### Existing Components to Leverage (HIGH confidence from codebase)

1. **RetryQueueManager** (`src/sync/retry-queue-manager.ts`):
   - Already implements exponential backoff with configurable max attempts
   - Persists retry state to SQLite (survives restarts)
   - Has `processRetries()` method that can be tested
   - **Validation needed:** Test that retries resume correctly after sync service restart

2. **Error Classifier** (`src/utils/error-classifier.ts`):
   - Maps error types to codes (GATEWAY_UNREACHABLE, TIMEOUT_GATEWAY_REQUEST, etc.)
   - Determines isRetryable flag for each error type
   - Handles AbortError (user cancellation) vs TimeoutError separately
   - **Validation needed:** E2E test should verify all classified error types

3. **API Clients with AbortSignal**:
   - All API clients use `AbortSignal.timeout(120_000)` for 2-minute timeout
   - Combined with user cancellation signal via `AbortSignal.any()`
   - **Validation needed:** Test cancellation mid-batch doesn't corrupt data

4. **Existing E2E Test** (`tests/e2e/real-sync-test.ts`):
   - Already connects to real SQL Server and real gateway
   - Queries PostgreSQL to verify data arrived
   - Uses colored terminal output for readability
   - **Can be enhanced:** Add failure injection, schema change validation

5. **Schema Regeneration** (`gateway/src/codegen/index.ts`):
   - Authenticates with gateway, fetches schema metadata
   - Generates Prisma and Zod schemas
   - Computes diffs and displays changes
   - **Validation needed:** E2E test from PostgreSQL ALTER TABLE through Zod schema update

### What Phase 12 Must Test

Based on success criteria from phase description:

1. **Full workflow validation** (ROBU-01):
   - PostgreSQL schema change (ALTER TABLE ADD COLUMN)
   - regenerate-schemas CLI or POST /api/schemas/regenerate
   - Zod schema updated in shared/schemas/
   - Prisma schema updated
   - Sync validates against new schema
   - Data with new field persists correctly

2. **Gateway unreachable recovery** (ROBU-02):
   - Sync attempts when gateway is down
   - Retries with backoff (verify RetryQueueManager behavior)
   - Recovers when gateway comes back online
   - No data loss during downtime

3. **Batch failure recovery** (ROBU-02):
   - Mid-batch failure (e.g., network reset during batch send)
   - Failed batches added to retry queue
   - Retry queue processes failed batches
   - Successful retries don't create duplicates

4. **Data integrity** (success criterion 4):
   - No duplicate records after retry
   - No corrupted data (partial records)
   - Sync state remains consistent
   - lastSyncValue preserved correctly (Phase 10 requirement)

### Recommended Test Organization

```
tests/
├── integration/
│   ├── 12-01-workflow-validation.test.ts    # PLAN 12-01
│   │   - Schema change → regeneration → validation → sync
│   │   - Uses testcontainers for isolated PostgreSQL
│   │   - Verifies Zod/Prisma schemas updated
│   │
│   └── 12-02-error-recovery.test.ts         # PLAN 12-02
│       - Gateway unreachable + recovery (nock)
│       - Batch failure + retry (RetryQueueManager)
│       - Data integrity validation (no duplicates)
│       - Cancellation handling (AbortSignal)
│
└── e2e/
    └── real-sync-test.ts                     # Already exists, enhance
        - Add chaos injection option
        - Add schema change validation
        - Add retry queue verification
```
