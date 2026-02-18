# Testing Patterns

**Analysis Date:** 2026-01-26

## Test Framework

**Runner:**
- Vitest (v2.1.8)
- Config: `C:/Users/sistemas/.proyectos/objetiva-sync-monorepo/objetiva-sync/vitest.config.ts`

**Assertion Library:**
- Vitest built-in expect (similar to Jest)
- Functions: `expect().toBe()`, `expect().toEqual()`, `expect().toHaveLength()`, etc.

**Run Commands:**
```bash
npm test                   # Run all tests
npm test -- --watch      # Watch mode (re-run on file changes)
npm test:coverage        # Run with coverage report
```

## Test File Organization

**Location:**
- Co-located tests in `__tests__` directories: `C:/Users/sistemas/.proyectos/objetiva-sync-monorepo/objetiva-sync/src/__tests__/`
- Separate test directory: `C:/Users/sistemas/.proyectos/objetiva-sync-monorepo/objetiva-sync/tests/`
- Both locations are included in vitest config: `include: ['src/**/*.test.ts', 'tests/**/*.test.ts']`

**Naming:**
- Test files: `*.test.ts` extension only (not `.spec.ts`)
- Example: `crypto.test.ts`, `api-client-metadata.test.ts`, `config-repo.test.ts`

**Structure:**
```
src/
├── __tests__/
│   ├── api-client-metadata.test.ts
│   ├── integration-query-based-sync.test.ts
│   ├── repositories-query-based.test.ts
│   └── sync-engine-metadata.test.ts
tests/
├── helpers/
│   └── test-db.ts                 # Shared test utilities
├── setup.ts                        # Global test setup
├── store/
│   └── repositories/
│       ├── config-repo.test.ts
│       └── queries-repo.test.ts
├── sync/
│   └── transformer.test.ts
└── utils/
    ├── crypto.test.ts
    └── helpers.test.ts
```

## Test Structure

**Suite Organization:**
```typescript
/**
 * Module docstring explaining what's tested
 */

import { describe, it, expect, vi, beforeEach, afterAll } from 'vitest';
// imports

describe('Feature or Module Name', () => {
  // Module-level setup
  let resource: Type;

  beforeEach(() => {
    // Setup before each test
    resource = createResource();
  });

  afterAll(() => {
    // Cleanup after all tests in suite
    resource.cleanup();
  });

  describe('Feature subset (nested)', () => {
    it('should do specific behavior', () => {
      // Arrange
      const input = 'test';

      // Act
      const result = myFunction(input);

      // Assert
      expect(result).toBe('expected');
    });

    it('should handle edge case', () => {
      expect(() => myFunction(null)).toThrow();
    });
  });
});
```

**Patterns:**
- All tests use `describe()` for grouping
- Nested describe blocks for logical grouping (feature → sub-feature)
- Use `beforeEach()` for setup that runs before each test
- Use `afterAll()` for cleanup that runs once after all tests
- Use `beforeAll()` for one-time setup (e.g., database initialization)

## Mocking

**Framework:** Vitest's `vi` object

**Patterns:**

```typescript
// Mock module
vi.mock('../utils/logger.js', () => ({
  logger: {
    info: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
    debug: vi.fn(),
  },
}));

// Mock with implementation
vi.mock('undici', () => ({
  fetch: vi.fn(),
}));

// Clear mocks before each test
beforeEach(() => {
  vi.clearAllMocks();
});

// Spy on method
const spy = vi.spyOn(object, 'method');

// Mock function with return value
const mockFn = vi.fn().mockResolvedValue({ success: true });
const mockFn = vi.fn().mockReturnValue('value');
const mockFn = vi.fn().mockImplementation((arg) => arg * 2);

// Get mock calls
expect(mockFn).toHaveBeenCalledTimes(1);
expect(mockFn).toHaveBeenCalledWith(expectedArg);
const callArgs = mockFn.mock.calls[0];
```

**From Real Tests:**

Mock AuthManager in API client tests:
```typescript
const mockAuthManager: AuthManager = {
  getToken: vi.fn().mockResolvedValue('test-token-123'),
  login: vi.fn(),
  logout: vi.fn(),
  isAuthenticated: vi.fn(),
} as any;
```

Mock database adapter in sync tests:
```typescript
const mockAdapter = {
  testConnection: vi.fn().mockResolvedValue({ success: true }),
  executeQuery: vi.fn().mockImplementation((sqlQuery: string) => {
    if (sqlQuery.includes('articulos')) {
      return Promise.resolve({
        rows: [{ sku: 'ART-001', nombre: 'Producto 1' }],
        rowCount: 1,
      });
    }
    return Promise.resolve({ rows: [], rowCount: 0 });
  }),
};
```

**What to Mock:**
- External API calls (HTTP fetch)
- File system operations
- Database connections
- Logger (to avoid test output pollution)
- Services provided as dependencies

**What NOT to Mock:**
- Pure utility functions (crypto, string manipulation)
- Type definitions and interfaces
- Helper functions in same module
- Business logic that needs testing

## Fixtures and Factories

**Test Data:**

```typescript
// In test file
const mockMetadata = {
  queryId: 42,
  queryName: 'Test Query - Factura A',
};

const testArticulos: IArticuloPayload[] = [
  {
    sku: 'TEST-001',
    erp_codigo: 'TEST-001',
    erp_nombre: 'Test Article',
    nombre: 'Test Article',
    objeto: 'producto',
  },
];

const testComprobantes: IComprobanteCabeceraPayload[] = [
  {
    erp_operacion: 'FC',
    erp_formulario: 'A',
    erp_numero: '00001',
    operacion: 'FC',
    formulario: 'A',
    numero: '00001',
    fecha: new Date().toISOString(),
    cantidad_items: 1,
    total_bruto: 100.0,
    total_descuentos: 0,
    total_neto: 100.0,
    total_iva: 21.0,
    total_venta: 121.0,
  },
];
```

**Location:**
- Test data defined at top of test file or in `beforeEach()` setup
- Shared test utilities in `tests/helpers/` directory
- Database factories in `tests/helpers/test-db.ts`

**Database Test Helpers:**

Located in `C:/Users/sistemas/.proyectos/objetiva-sync-monorepo/objetiva-sync/tests/helpers/test-db.ts`:

```typescript
// Create in-memory SQLite database for tests
export function createTestDb(): BetterSQLite3Database<typeof schema> {
  const sqlite = new Database(':memory:');
  const db = drizzle(sqlite, { schema });
  initTestSchema(sqlite);
  return db;
}

// Clear all data from test database
export function clearTestDb(db: BetterSQLite3Database<typeof schema>): void {
  // Deletes all records from all tables
}

// Close test database connection
export function closeTestDb(db: BetterSQLite3Database<typeof schema>): void {
  const sqlite = db.$client as Database.Database;
  sqlite.close();
}
```

**Usage Pattern:**
```typescript
describe('Config Repository', () => {
  let db: BetterSQLite3Database<typeof schema>;

  beforeEach(() => {
    db = createTestDb();
    ConfigRepo.initConfigRepo(db);
    clearTestDb(db);
  });

  afterAll(() => {
    if (db) closeTestDb(db);
  });
});
```

## Coverage

**Requirements:** No specific target enforced

**Coverage Configuration:**
- Provider: V8 (built-in)
- Reporters: text, HTML, LCOV
- Excluded from coverage:
  - `node_modules/**`
  - `tests/**`
  - `src/__tests__/**`
  - `**/*.test.ts`
  - `**/*.spec.ts`
  - `dist/**`

**View Coverage:**
```bash
npm test:coverage
# Opens HTML report at: coverage/index.html
```

## Test Types

**Unit Tests:**
- Scope: Individual function/class in isolation
- Examples: `tests/utils/crypto.test.ts`, `tests/utils/helpers.test.ts`
- Approach: Mock all external dependencies, test logic path by path
- Files: Test one utility or function per test file

```typescript
describe('Crypto Utils', () => {
  describe('encrypt / decrypt', () => {
    it('should encrypt and decrypt a string correctly', () => {
      const plaintext = 'Hello, World!';
      const encrypted = encrypt(plaintext);

      expect(encrypted).toBeTruthy();
      expect(encrypted).not.toBe(plaintext);

      const decrypted = decrypt(encrypted);
      expect(decrypted).toBe(plaintext);
    });

    it('should throw error on invalid encrypted string', () => {
      expect(() => decrypt('invalid-encrypted-string')).toThrow();
    });
  });
});
```

**Integration Tests:**
- Scope: Multiple modules working together (e.g., API client → adapter → database)
- Examples: `src/__tests__/integration-query-based-sync.test.ts`
- Approach: Mock external services (APIs, some adapters) but test data flow between modules
- Files: Test complete workflows or feature end-to-end

```typescript
describe('Integration: Query-based Sync Flow', () => {
  let syncEngine: SyncEngine;
  let mockAdapter: any;    // Mock the adapter
  let mockApiClient: any;  // Mock external API

  beforeEach(async () => {
    await initDatabase(':memory:'); // Use real database

    mockAdapter = {
      executeQuery: vi.fn().mockImplementation((sql) => {
        // Return realistic data based on query
        return Promise.resolve({ rows: [...], rowCount: 2 });
      }),
    };

    syncEngine = new SyncEngine({
      dataSourceAdapter: mockAdapter,
      apiClient: mockApiClient,
      defaultBatchSize: 100,
    });
  });

  it('should complete full sync flow with metadata', async () => {
    const queryId = await QueriesRepo.createQuery({...});
    const result = await syncEngine.syncQueryBased(queryId);
    expect(result.success).toBe(true);
  });
});
```

**E2E Tests:**
- Not currently used in this codebase
- Would test full application flow with real external services
- Framework would be needed (Playwright, Cypress, etc.)

## Common Patterns

**Async Testing:**
```typescript
// Using async/await (preferred)
it('should login successfully', async () => {
  const authManager = new AuthManager(baseUrl, user, pass);

  // Act
  await authManager.login();

  // Assert
  const token = await authManager.getToken();
  expect(token).toBeTruthy();
});

// Or using .then() for assertions on promises
it('should return encrypted data', async () => {
  const encrypted = await encrypt(plaintext);
  expect(encrypted).not.toBe(plaintext);
});
```

**Error Testing:**
```typescript
// Testing synchronous errors
it('should throw on invalid date', () => {
  expect(() => parseDate('invalid')).toThrow();
  expect(() => parseDate('invalid')).toThrow(Error);
  // Can also check message
  expect(() => parseDate('invalid')).toThrow(/inválida/);
});

// Testing async errors
it('should reject on login failure', async () => {
  const mockAuth = {
    getToken: vi.fn().mockRejectedValue(new Error('Login failed')),
  };

  await expect(mockAuth.getToken()).rejects.toThrow('Login failed');
});

// Testing error conditions
it('should handle tampered encrypted string', () => {
  const plaintext = 'Hello, World!';
  const encrypted = encrypt(plaintext);
  const tampered = encrypted.substring(0, encrypted.length - 5) + 'XXXXX';

  expect(() => decrypt(tampered)).toThrow();
});
```

**Mocking Dynamic Behavior:**
```typescript
// Mock function called multiple times with different returns
const mockFetch = vi.fn()
  .mockResolvedValueOnce({ ok: true, json: () => ({ token: 'abc' }) })
  .mockResolvedValueOnce({ ok: true, json: () => ({ token: 'xyz' }) })
  .mockRejectedValueOnce(new Error('Network error'));

// Verify calls
expect(mockFetch).toHaveBeenCalledTimes(3);
expect(mockFetch).toHaveBeenNthCalledWith(1, expectedUrl, expectedOptions);
```

**Test Isolation:**
- Use `beforeEach()` to reset state before each test
- Call `vi.clearAllMocks()` to reset mock call counts
- Use `describe.skip()` or `it.skip()` to disable tests temporarily
- Use `describe.only()` or `it.only()` to run single test

```typescript
describe.skip('Config Repository', () => {
  // These tests won't run - useful for WIP features
  // Real example: C:/Users/sistemas/.proyectos/objetiva-sync-monorepo/objetiva-sync/tests/store/repositories/config-repo.test.ts
});

it.skip('should handle edge case', () => {
  // Single test disabled
});
```

## Test Environment Configuration

**Global Setup:**
- File: `C:/Users/sistemas/.proyectos/objetiva-sync-monorepo/objetiva-sync/tests/setup.ts`
- Runs automatically before all test files

```typescript
// Loads test environment variables
dotenv.config({ path: path.join(__dirname, '..', '.env.test') });

// Sets NODE_ENV to 'test'
process.env.NODE_ENV = 'test';

// Disables logging unless ENABLE_TEST_LOGS env var is set
if (!process.env.ENABLE_TEST_LOGS) {
  process.env.LOG_LEVEL = 'error';
}

// Loads environment configuration at module level
loadEnv();
```

**Test-specific Configuration:**
- Logger level: `error` by default (silent in test mode)
- Test timeout: 10 seconds (`testTimeout: 10000`)
- Mock reset: `mockReset: true` (clears mock state between tests)
- Mocks restored: `restoreMocks: true` (restores original implementations)

---

*Testing analysis: 2026-01-26*
