# Phase 6: CLI E2E Verification - Research

**Researched:** 2026-02-03
**Domain:** CLI E2E Testing and Verification
**Confidence:** HIGH

## Summary

This phase requires end-to-end verification of the regenerate-schemas CLI command, which was code-complete in Phase 3 but never executed against a running system. The domain is CLI integration testing with real external dependencies (gateway HTTP server, PostgreSQL database).

The standard approach is to write integration tests that spawn the CLI as a child process, capturing stdout/stderr and exit codes, while verifying side effects (file writes, database state). Since the codebase already uses Vitest for testing, we can leverage Node.js built-in `child_process.spawn()` for process spawning and Vitest's `toMatchFileSnapshot()` for file content verification.

Key insight: This is verification testing, not unit testing. Tests should exercise the complete pipeline with real dependencies (gateway must be running, PostgreSQL must be accessible) to confirm the code works in practice, not just in theory.

**Primary recommendation:** Write 3-5 integration tests using Vitest that spawn the CLI script with `child_process.spawn()`, verify exit codes and console output, and assert file changes using `toMatchFileSnapshot()` for critical success paths and error scenarios.

## Standard Stack

The established libraries/tools for CLI E2E testing in Node.js:

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| Node.js child_process | built-in | Process spawning, stdout/stderr capture, exit codes | Native API, no dependencies, used universally |
| Vitest | 4.0.18 | Test framework (already in project) | Fast, TypeScript-native, snapshot support |
| tsx | 4.19.2 | TypeScript execution (already in project) | Runs .ts files directly without compilation |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| clet | latest | CLI testing helper | Only if native spawn is too verbose (optional) |
| dotenv | 17.2.3 | Environment variable loading (already in project) | Loading .env.test for test configuration |
| diff | 8.0.3 | Text comparison (already in project) | Already used by CLI for diff display |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| spawn() | clet library | clet adds helper methods but introduces dependency; spawn() is sufficient for 3-5 tests |
| Vitest | Jest | Project already standardized on Vitest; switching would be inconsistent |
| Real database | Mock responses | Defeats purpose of E2E verification - need to prove gateway integration works |

**Installation:**
```bash
# No new dependencies required - all libraries already in project
# Project already has: vitest, tsx, dotenv, diff, child_process (built-in)
```

## Architecture Patterns

### Recommended Test Structure
```
objetiva-sync-gateway/
├── tests/
│   ├── integration/           # New directory for CLI E2E tests
│   │   └── cli-regenerate.integration.test.ts
│   ├── helpers/               # Test utilities
│   │   ├── cli-runner.ts     # Spawn helper with output capture
│   │   └── test-env.ts       # Environment setup
│   └── fixtures/              # Test data (if needed)
├── scripts/
│   └── regenerate-schemas.ts  # CLI script under test
└── vitest.config.ts           # Already configured
```

### Pattern 1: CLI Process Spawner Helper
**What:** Reusable helper that spawns CLI, captures output, returns structured result
**When to use:** Every test that executes the CLI command
**Example:**
```typescript
// tests/helpers/cli-runner.ts
import { spawn } from 'node:child_process';
import { resolve } from 'node:path';

interface CliResult {
  exitCode: number;
  stdout: string;
  stderr: string;
  duration: number;
}

export async function runRegenerateSchemas(
  args: string[] = [],
  env: Record<string, string> = {}
): Promise<CliResult> {
  const startTime = Date.now();
  const cliPath = resolve(__dirname, '../../scripts/regenerate-schemas.ts');

  return new Promise((resolve, reject) => {
    const child = spawn('tsx', [cliPath, ...args], {
      cwd: resolve(__dirname, '../..'),
      env: { ...process.env, ...env },
      stdio: ['pipe', 'pipe', 'pipe']
    });

    let stdout = '';
    let stderr = '';

    child.stdout?.on('data', (data) => { stdout += data.toString(); });
    child.stderr?.on('data', (data) => { stderr += data.toString(); });

    child.on('close', (code) => {
      resolve({
        exitCode: code ?? -1,
        stdout,
        stderr,
        duration: Date.now() - startTime
      });
    });

    child.on('error', reject);
  });
}
```

### Pattern 2: Pre-Test Gateway Health Check
**What:** Verify gateway is running and accessible before executing CLI tests
**When to use:** beforeAll hook to fail fast if gateway is down
**Example:**
```typescript
// tests/integration/cli-regenerate.integration.test.ts
import { describe, it, expect, beforeAll } from 'vitest';

describe('CLI Regenerate Schemas E2E', () => {
  beforeAll(async () => {
    // Verify gateway is accessible
    const gatewayUrl = process.env.GATEWAY_URL || 'http://localhost:3002';
    try {
      const response = await fetch(`${gatewayUrl}/health`);
      if (!response.ok) {
        throw new Error(`Gateway not healthy: ${response.status}`);
      }
    } catch (error) {
      throw new Error(
        `Gateway must be running for E2E tests. Start with: npm run dev\n` +
        `Expected URL: ${gatewayUrl}\n` +
        `Error: ${error}`
      );
    }
  });

  // Tests...
});
```

### Pattern 3: File Snapshot Verification
**What:** Verify generated file contents using Vitest's `toMatchFileSnapshot()`
**When to use:** After successful CLI run to verify schema.prisma and Zod files
**Example:**
```typescript
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

it('should generate correct Prisma schema structure', async () => {
  const result = await runRegenerateSchemas(['--dry-run']);

  expect(result.exitCode).toBe(0);
  expect(result.stdout).toContain('Fetched 4 schema(s)');

  // If not dry-run, verify file contents
  // Note: For dry-run, we verify output describes changes correctly
  expect(result.stdout).toContain('model articulos');
  expect(result.stdout).toContain('model comprobantes_cabecera');
});

it('should write valid Prisma schema file', async () => {
  // Run without dry-run to actually write files
  const result = await runRegenerateSchemas(['--entity', 'articulos']);

  expect(result.exitCode).toBe(0);

  // Verify file was written
  const schemaPath = resolve(__dirname, '../../prisma/schema.prisma');
  const schemaContent = readFileSync(schemaPath, 'utf-8');

  // Verify essential content
  expect(schemaContent).toContain('datasource db');
  expect(schemaContent).toContain('generator client');
  expect(schemaContent).toContain('model articulos');

  // Optional: Use snapshot for full comparison
  await expect(schemaContent).toMatchFileSnapshot(
    './snapshots/schema-with-articulos.prisma'
  );
});
```

### Pattern 4: Error Scenario Testing
**What:** Verify error codes (E001-E005) display correctly when preconditions fail
**When to use:** Testing failure paths (missing env vars, gateway down, auth failure)
**Example:**
```typescript
it('should fail with E001 when GATEWAY_URL missing', async () => {
  const result = await runRegenerateSchemas([], {
    GATEWAY_URL: '', // Unset environment variable
  });

  expect(result.exitCode).toBe(1);
  expect(result.stderr).toContain('E001: GATEWAY_URL environment variable not set');
});

it('should fail with E003 when authentication fails', async () => {
  const result = await runRegenerateSchemas([], {
    GATEWAY_URL: process.env.GATEWAY_URL!,
    SYNC_USERNAME: 'invalid',
    SYNC_PASSWORD: 'wrong',
  });

  expect(result.exitCode).toBe(1);
  expect(result.stderr).toContain('E003: Authentication failed');
});
```

### Pattern 5: Prisma Generate Verification
**What:** Verify `prisma generate` runs and produces Prisma Client
**When to use:** After schema.prisma file is written successfully
**Example:**
```typescript
it('should run prisma generate successfully', async () => {
  const result = await runRegenerateSchemas(['--entity', 'articulos']);

  expect(result.exitCode).toBe(0);
  expect(result.stdout).toContain('Running prisma generate');
  expect(result.stdout).toContain('Generated Prisma Client'); // Output from prisma

  // Verify Prisma Client exists
  const clientPath = resolve(__dirname, '../../node_modules/.prisma/client');
  expect(existsSync(clientPath)).toBe(true);
});
```

### Anti-Patterns to Avoid
- **Mocking gateway responses in E2E tests:** Defeats the purpose - E2E means testing real integration
- **Running tests sequentially with sleep():** Use proper async/await and process events
- **Ignoring stderr output:** Errors may be logged to stderr even with exit code 0
- **Not cleaning up test files:** If writing real files, restore originals in afterEach
- **Asserting exact output strings:** Use `.toContain()` or regex - exact output may change with library versions

## Don't Hand-Roll

Problems that look simple but have existing solutions:

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Process output capture | Custom stream handlers | `child_process.spawn()` with data event handlers | Well-tested, handles encoding/buffering correctly |
| File content comparison | String equality checks | Vitest `toMatchFileSnapshot()` | Generates readable diffs, updates snapshots with --update flag |
| Environment variable management | Manual process.env manipulation | dotenv with `.env.test` file | Isolated test config, prevents polluting dev environment |
| Timeout handling | Manual setTimeout | Vitest `testTimeout` config | Framework-managed, proper cleanup on failure |
| Gateway health check | Retry loops | Single fetch with clear error message | E2E tests should fail fast if prerequisites missing |

**Key insight:** CLI E2E testing benefits from simplicity. Native Node.js APIs (spawn, fs) are sufficient for 3-5 tests. Avoid over-engineering with helper libraries unless test count exceeds 10+ and verbosity becomes painful.

## Common Pitfalls

### Pitfall 1: Gateway Process File Lock on Windows
**What goes wrong:** On Windows, the gateway may hold a file lock on schema.prisma, causing CLI writes to fail with EBUSY error
**Why it happens:** tsx watch mode keeps schema.prisma open for hot-reload detection
**How to avoid:** CLI already implements stopGatewayIfRunning() to kill gateway before writing. Tests should verify this works correctly.
**Warning signs:** Test passes on Linux/Mac but fails on Windows with "file is busy" error

### Pitfall 2: Test Flakiness from Shared Database State
**What goes wrong:** Tests fail intermittently if they modify shared PostgreSQL schema concurrently
**Why it happens:** Multiple tests running in parallel against same database, schema introspection returns inconsistent results
**How to avoid:**
- Use `describe.sequential()` in Vitest to run CLI tests one at a time
- Or use separate test databases (DATABASE_URL with different db name per test)
- Prefer `--dry-run` tests that don't modify state
**Warning signs:** Tests pass individually but fail when run together

### Pitfall 3: Missing Environment Variables
**What goes wrong:** Test fails with cryptic error instead of clear "gateway not configured" message
**Why it happens:** CLI uses process.env directly, tests inherit developer's shell environment
**How to avoid:**
- Create `.env.test` with explicit test configuration
- Use `dotenv.config({ path: '.env.test' })` in test setup
- Verify required vars exist in beforeAll hook
**Warning signs:** Tests work for some developers but not others

### Pitfall 4: Exit Code 0 with Errors in Output
**What goes wrong:** Test asserts exit code is 0, but stderr contains errors that should fail the test
**Why it happens:** CLI may log warnings to stderr without failing, or test only checks exitCode
**How to avoid:** Assert both exitCode AND absence of error keywords in stderr
**Warning signs:** CLI reports "warnings" but test passes as success

### Pitfall 5: Race Condition with prisma generate
**What goes wrong:** Test checks for Prisma Client immediately after CLI exits, but client files don't exist yet
**Why it happens:** `prisma generate` is spawned as child process, CLI exits before it completes
**How to avoid:** CLI already waits for prisma generate to complete (execSync). Tests should verify "Generated Prisma Client" appears in stdout.
**Warning signs:** Test fails with "Prisma Client not found" immediately after successful CLI run

### Pitfall 6: Snapshot Brittleness
**What goes wrong:** Snapshot tests fail on minor whitespace or version changes that don't affect functionality
**Why it happens:** Full file snapshots are fragile, capture irrelevant details
**How to avoid:**
- Use snapshots only for critical structure (model definitions, field types)
- Use `.toContain()` assertions for non-critical parts (comments, formatting)
- Update snapshots consciously with `vitest --update`
**Warning signs:** Snapshot failures on every Prisma version update

## Code Examples

Verified patterns from official sources:

### Complete Integration Test Structure
```typescript
// tests/integration/cli-regenerate.integration.test.ts
import { describe, it, expect, beforeAll } from 'vitest';
import { spawn } from 'node:child_process';
import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { config } from 'dotenv';

// Load test environment
config({ path: resolve(__dirname, '../../.env.test') });

interface CliResult {
  exitCode: number;
  stdout: string;
  stderr: string;
}

async function runCli(args: string[]): Promise<CliResult> {
  return new Promise((resolve, reject) => {
    const child = spawn('tsx', ['scripts/regenerate-schemas.ts', ...args], {
      cwd: resolve(__dirname, '../..'),
      env: process.env,
      stdio: ['pipe', 'pipe', 'pipe']
    });

    let stdout = '';
    let stderr = '';

    child.stdout?.on('data', (data) => { stdout += data.toString(); });
    child.stderr?.on('data', (data) => { stderr += data.toString(); });

    child.on('close', (code) => {
      resolve({ exitCode: code ?? -1, stdout, stderr });
    });

    child.on('error', reject);
  });
}

describe('CLI Regenerate Schemas E2E', { sequential: true }, () => {
  beforeAll(async () => {
    // Verify gateway is running
    const gatewayUrl = process.env.GATEWAY_URL;
    if (!gatewayUrl) {
      throw new Error('GATEWAY_URL not set in .env.test');
    }

    try {
      await fetch(`${gatewayUrl}/health`);
    } catch {
      throw new Error(`Gateway not accessible at ${gatewayUrl}. Start with: npm run dev`);
    }
  });

  it('should display help with authentication flow on dry-run', async () => {
    const result = await runCli(['--dry-run']);

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain('Authenticating with gateway');
    expect(result.stdout).toContain('Authentication successful');
    expect(result.stdout).toContain('Fetching schema');
  });

  it('should fail gracefully with E001 when GATEWAY_URL missing', async () => {
    const originalUrl = process.env.GATEWAY_URL;
    delete process.env.GATEWAY_URL;

    const result = await runCli(['--dry-run']);

    expect(result.exitCode).toBe(1);
    expect(result.stderr).toContain('E001: GATEWAY_URL environment variable not set');

    process.env.GATEWAY_URL = originalUrl; // Restore
  });

  it('should regenerate single entity successfully', async () => {
    const result = await runCli(['--entity', 'articulos']);

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain('Filter: articulos only');
    expect(result.stdout).toContain('Success! All schemas updated');

    // Verify file write
    const schemaPath = resolve(__dirname, '../../prisma/schema.prisma');
    const content = readFileSync(schemaPath, 'utf-8');
    expect(content).toContain('model articulos');
  });

  it('should run prisma generate after schema update', async () => {
    const result = await runCli(['--entity', 'articulos']);

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain('Running prisma generate');
    expect(result.stdout).toContain('Generated Prisma Client');

    // Verify Prisma Client exists
    const clientPath = resolve(__dirname, '../../node_modules/.prisma/client');
    expect(existsSync(clientPath)).toBe(true);
  });
});
```
**Source:** Based on [Node.js Child Process API](https://nodejs.org/api/child_process.html) and [Vitest Integration Testing patterns](https://vitest.dev/guide/)

### Gateway Health Check Helper
```typescript
// tests/helpers/gateway-health.ts
export async function waitForGateway(
  url: string,
  timeoutMs: number = 5000
): Promise<void> {
  const startTime = Date.now();

  while (Date.now() - startTime < timeoutMs) {
    try {
      const response = await fetch(`${url}/health`);
      if (response.ok) return;
    } catch {
      // Gateway not ready, wait
      await new Promise(resolve => setTimeout(resolve, 100));
    }
  }

  throw new Error(`Gateway not ready after ${timeoutMs}ms at ${url}`);
}
```
**Source:** Common pattern from [CLI Integration Testing article](https://dev.to/florianrappl/how-we-wrote-our-cli-integration-tests-53i3)

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Jest for testing | Vitest | ~2023 | Faster test execution, native ESM support, better TypeScript integration |
| Mocking all external calls | Real integration tests with actual services | Industry shift ~2022 | Higher confidence, catches real integration issues |
| Manual test scripts | Automated E2E in CI | Best practice since ~2020 | Prevents regressions, documents expected behavior |
| Unit tests only | Layered testing (unit + integration + E2E) | ~2021 Node.js best practices | Balances speed and coverage |

**Deprecated/outdated:**
- **Jest + ts-jest**: Vitest has better TypeScript support and speed (project already uses Vitest)
- **Manually running CLI commands**: Should be automated in test suite for regression prevention
- **Testing only with gateway mocked**: Phase 3 verification gap showed code correctness ≠ runtime correctness

## Open Questions

Things that couldn't be fully resolved:

1. **Should tests modify production schema.prisma or use test copy?**
   - What we know: CLI writes to `prisma/schema.prisma`, tests could overwrite production schema
   - What's unclear: Best balance between "test real behavior" vs "don't corrupt dev environment"
   - Recommendation: Use `--dry-run` for most tests, have 1-2 tests that write to real files (can restore from git if needed)

2. **How to handle Windows file lock issue in tests?**
   - What we know: CLI has `stopGatewayIfRunning()` to handle locks
   - What's unclear: Whether tests should verify lock handling or assume it works
   - Recommendation: Add one Windows-specific test that verifies gateway stop logic works (mark as `skipIf(!isWindows)`)

3. **Should we test against real PostgreSQL or test database?**
   - What we know: E2E verification requires real gateway, which requires real PostgreSQL
   - What's unclear: Whether to use production DB schema or dedicated test schema
   - Recommendation: Use same DATABASE_URL as gateway dev environment - introspection is read-only, won't corrupt data

## Sources

### Primary (HIGH confidence)
- [Node.js Child Process Documentation](https://nodejs.org/api/child_process.html) - Official API for spawn, stdout/stderr capture
- [Vitest Snapshot Testing Guide](https://vitest.dev/guide/snapshot) - Official docs for toMatchFileSnapshot()
- [Vitest CLI Reference](https://vitest.dev/guide/cli) - Command-line options and configuration
- [Prisma Testing Series: Integration Testing](https://www.prisma.io/blog/testing-series-3-aBUyF8nxAn) - Official Prisma testing best practices
- [Prisma Testing Series: E2E Testing](https://www.prisma.io/blog/testing-series-4-OVXtDis201) - End-to-end testing with Prisma

### Secondary (MEDIUM confidence)
- [How we wrote our CLI integration tests - DEV Community](https://dev.to/florianrappl/how-we-wrote-our-cli-integration-tests-53i3) - Real-world CLI testing patterns
- [Node.js Testing Best Practices by Yoni Goldberg](https://github.com/goldbergyoni/nodejs-testing-best-practices) - Comprehensive testing guide (August 2025)
- [Integration Tests on Node.js CLI - Medium](https://medium.com/@zorrodg/integration-tests-on-node-js-cli-part-1-why-and-how-fa5b1ba552fe) - CLI testing rationale and patterns

### Tertiary (LOW confidence)
- [clet - Command Line E2E Testing](https://github.com/node-modules/clet) - Helper library (optional, not required)
- [CLI Mocker](https://www.stackfive.io/work/javascript/how-to-write-tests-for-cli-tools) - Alternative testing approach (not needed for this phase)

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH - Project already has all required tools (vitest, tsx, child_process)
- Architecture: HIGH - Patterns verified from official Node.js and Vitest documentation
- Pitfalls: HIGH - Directly observed from Phase 3 audit findings (Windows file lock, verification gap)
- Code examples: HIGH - Based on official Node.js child_process API and Vitest snapshot docs

**Research date:** 2026-02-03
**Valid until:** 2026-03-03 (30 days - testing patterns are stable)

**Key constraint from context:**
This is a **gap closure phase** for Phase 3 verification. The CLI code is already complete and correct - we're proving it works in practice, not building new features. Tests should be **practical verification**, not exhaustive coverage.
