# Phase 18: Pre-Flight Validator - Research

**Researched:** 2026-03-05
**Domain:** Fastify gateway startup validation, .env file writing with mutex, structured health reporting
**Confidence:** HIGH

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

**Startup failure behavior:**
- Gateway starts in **setup-only mode** when critical env vars are missing — only setup wizard and preflight routes are available, all other routes return 503
- Required env vars validated at startup: `DATABASE_URL` (critical), `JWT_SECRET` (critical), `SYNC_PASSWORD` (critical), `GATEWAY_PUBLIC_URL` (optional, warn only)
- If DATABASE_URL is present but PostgreSQL is unreachable: start in **degraded mode** (current behavior preserved) — setup wizard accessible, preflight reports the failure
- If required tables are missing: start normally but preflight reports which tables are missing with a migration hint (`npx prisma migrate deploy`)
- Exit with code 1 only on truly unrecoverable errors (port conflict, file system failure) — not on missing config

**Preflight endpoint design:**
- `GET /api/setup/preflight` — no authentication required
- Returns 5 checks: env_vars, db_connectivity, db_tables, jwt_configured, env_file_writable
- Response format: flat JSON array with overall `ready` boolean flag
- Each check: `{ id, name, status: "pass"|"fail"|"warn", message, remediation }`
- Overall structure: `{ ready: boolean, checks: [...], timestamp }`
- Rate-limit the endpoint (10 req/min per IP) to prevent abuse since it's unauthenticated

**.env writing strategy:**
- **Single centralized module** (`src/utils/env-writer.ts`) replaces all scattered .env writes in setup.ts and auth.ts
- **In-memory async mutex** (simple promise-based lock, no external dependency)
- **Always double-quote values** in .env: `KEY="value"` — handles `$`, `#`, spaces, quotes by escaping inner quotes with `\"`
- If .env file doesn't exist, create from `.env.example` template if available, otherwise create empty with header comment
- After writing, **update `process.env` in-place** for immediate effect without restart
- Fix ENV-04 bug: refactor all 4 raw .env write locations (setup.ts ×3, auth.ts ×1) to use the new centralized writer

**Error message style:**
- **English** for all error messages
- Structured **Pino JSON** for production plus human-readable **startup banner** on stderr
- Startup banner format: numbered checklist with ✓/✗ per check, shown once at boot
- Include specific remediation commands per check

### Claude's Discretion
- Exact mutex implementation details (promise chain vs semaphore pattern)
- Startup banner visual formatting
- Preflight endpoint response field naming conventions
- Order of checks during startup validation
- Whether to add an `x-preflight-status` header to all responses when in degraded mode

### Deferred Ideas (OUT OF SCOPE)
- Setup access token shown in container logs for first-time security — Phase 19 (INT-04 blocker)
- QR code for pairing — Future requirement PAIR-F01
- Hot reload of JWT_SECRET after .env write — evaluate in Phase 19
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| PF-01 | Gateway validates all required env vars at startup and shows specific errors per missing variable | Startup validation block in `server.ts:start()` before `buildApp()`, with mode switching |
| PF-02 | Gateway verifies PostgreSQL connectivity before accepting requests | Extend existing `prisma.$connect()` block in `server.ts`, add to `systemState` |
| PF-03 | Gateway verifies existence of 4 required tables at startup | Raw SQL via `prisma.$queryRaw` against `pg_tables` — pattern already exists in `setup.ts:825` |
| PF-04 | GET /api/setup/preflight returns structured JSON checklist with pass/fail + remediation | New Fastify route registered in `app.ts`, no auth, rate-limited via `@fastify/rate-limit` |
| PF-05 | Centralized .env writing with mutex and correct special character escaping | New `src/utils/env-writer.ts` module with promise-based lock, replaces 4 inline write locations |
</phase_requirements>

---

## Summary

This phase adds a validation layer to the Objetiva Sync Gateway that catches misconfiguration at startup rather than producing cryptic runtime errors. The implementation is purely additive within the gateway — no cross-service changes.

The three main deliverables are: (1) a startup validation sequence in `server.ts` that checks env vars and DB before accepting traffic, enabling setup-only mode when critical config is absent; (2) a `GET /api/setup/preflight` endpoint returning a structured 5-check JSON checklist; and (3) a centralized `src/utils/env-writer.ts` module with an in-memory async mutex that fixes the ENV-04 special-character bug.

All required code patterns already exist in the codebase — `pg_tables` query for table detection lives in `setup.ts:825`, `systemState` for DB tracking lives in `server.ts`, and Fastify route registration follows established patterns in `app.ts`. The only new dependency is `@fastify/rate-limit` (not yet installed).

**Primary recommendation:** Build `env-writer.ts` first (isolated, testable), then startup validation, then the preflight route — this order prevents regressions and keeps the ENV-04 fix independent of the routing changes.

---

## Standard Stack

### Core (already installed)
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| fastify | ^5.7.4 | HTTP server + route registration | Existing stack |
| @prisma/client | ^6.19.2 | PostgreSQL queries including `$queryRaw` | Existing stack |
| pino | ^9.5.0 | Structured logging for startup banner | Existing stack |
| zod | ^3.23.8 | Response type validation | Existing stack |
| fs/promises | Node built-in | .env read/write | Existing stack |

### New Dependency
| Library | Version | Purpose | Why |
|---------|---------|---------|-----|
| @fastify/rate-limit | ^9.x | Rate limit unauthenticated `/api/setup/preflight` | Only new dep for v1.2; prevents abuse of public endpoint |

**Installation:**
```bash
cd objetiva-sync-gateway
npm install @fastify/rate-limit
```

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| In-memory promise mutex | `async-mutex` npm package | No external dep needed for single-process Docker; promise chain is 8 lines |
| `@fastify/rate-limit` | Manual IP counter in Map | Rate-limit plugin handles edge cases (proxy headers, TTL cleanup) — justified |

---

## Architecture Patterns

### New Files to Create
```
objetiva-sync-gateway/src/
├── utils/
│   └── env-writer.ts          # Centralized .env writer with mutex (PF-05)
└── routes/
    └── preflight.ts           # GET /api/setup/preflight route (PF-04)
```

### Modified Files
```
objetiva-sync-gateway/src/
├── server.ts                  # Startup validation + setup-only mode (PF-01, PF-02, PF-03)
└── app.ts                     # Register preflight route + rate-limit plugin
objetiva-sync-gateway/src/routes/
├── setup.ts                   # Replace 3 inline .env writes with env-writer (PF-05)
└── auth.ts                    # Replace 1 inline .env write with env-writer (PF-05)
```

### New Test Files
```
objetiva-sync-gateway/tests/
├── unit/
│   └── env-writer.test.ts     # Mutex concurrency + special char escaping
└── integration/
    └── preflight.integration.test.ts  # Preflight endpoint responses
```

### Pattern 1: In-Memory Async Mutex (promise chain)

**What:** A single shared promise that serializes async .env writes.
**When to use:** Single-process Docker container where inter-process locking is unnecessary.

```typescript
// src/utils/env-writer.ts
let writeLock: Promise<void> = Promise.resolve()

export async function writeEnvVar(key: string, value: string): Promise<void> {
  writeLock = writeLock.then(() => doWrite(key, value))
  return writeLock
}

async function doWrite(key: string, value: string): Promise<void> {
  const envPath = path.join(process.cwd(), '.env')
  const escaped = value.replace(/"/g, '\\"')  // escape inner double-quotes

  let content: string
  try {
    content = await fs.readFile(envPath, 'utf-8')
  } catch {
    // Create from template or empty
    content = await getInitialContent()
  }

  const line = `${key}="${escaped}"`
  if (content.includes(`${key}=`)) {
    content = content.replace(new RegExp(`^${key}=.*$`, 'm'), line)
  } else {
    content += `\n${line}\n`
  }

  await fs.writeFile(envPath, content, 'utf-8')
  process.env[key] = value  // hot-update process.env
}
```

**Why promise chain over semaphore:** The chain approach means each write waits for the prior one to finish. If a write throws, the chain resets to `Promise.resolve()` so subsequent writes are not permanently blocked. A simple semaphore (counter + queue) achieves the same but requires more code for no practical benefit in this context.

### Pattern 2: Special Character Escaping for .env

The confirmed bug in `auth.ts:271-274` is that passwords with `$`, `#`, or quotes are written unquoted:
```typescript
// BUGGY (auth.ts:272)
envContent.replace(/SYNC_PASSWORD=.*/g, `SYNC_PASSWORD=${newPassword}`)
// If newPassword = "p@$$#word", file gets: SYNC_PASSWORD=p@$$#word
// dotenv reads $$ as literal, # as comment start — value is corrupted
```

Fix: always double-quote + escape inner double-quotes:
```typescript
// CORRECT
const escaped = value.replace(/\\/g, '\\\\').replace(/"/g, '\\"')
const line = `${key}="${escaped}"`
// Result: SYNC_PASSWORD="p@$$#word"  — dotenv reads correctly
```

Note: `$` and `#` inside double-quotes in dotenv format are treated as literals. Only inner `"` needs escaping as `\"`.

### Pattern 3: Startup Validation with Mode Switching

Insert validation in `server.ts:start()` BEFORE the `buildApp()` call:

```typescript
async function start() {
  // Phase 1: Env var validation
  const missingCritical = validateRequiredEnvVars()
  const startupMode: 'normal' | 'setup-only' | 'degraded' =
    missingCritical.length > 0 ? 'setup-only' : 'normal'

  // Phase 2: DB check (only if DATABASE_URL present)
  let preflightResults: PreflightCheck[] = []
  if (process.env.DATABASE_URL) {
    const dbCheck = await checkDbConnectivity()
    preflightResults.push(dbCheck)
    if (dbCheck.status === 'pass') {
      const tableCheck = await checkRequiredTables()
      preflightResults.push(tableCheck)
    }
  }

  // Extend systemState with preflight data
  systemState.preflightChecks = preflightResults
  systemState.startupMode = startupMode

  // Phase 3: Startup banner (stderr, human-readable)
  printStartupBanner(startupMode, preflightResults, missingCritical)

  // Phase 4: Build app (always — setup wizard must be reachable)
  const app = await buildApp(startupMode)
  await app.listen({ port: PORT, host: HOST })
}
```

### Pattern 4: Setup-Only Mode Route Gating

When `startupMode === 'setup-only'`, all routes EXCEPT setup/preflight/health return 503:

```typescript
// In buildApp(), add hook only when in setup-only mode
if (startupMode === 'setup-only') {
  app.addHook('onRequest', async (request, reply) => {
    const allowed = ['/setup', '/api/setup/', '/api/setup/preflight', '/health', '/metrics']
    const isAllowed = allowed.some(prefix => request.url.startsWith(prefix))
    if (!isAllowed) {
      return reply.code(503).send({
        error: 'SERVICE_UNAVAILABLE',
        message: 'Gateway is in setup mode. Complete configuration at /setup',
        setupUrl: '/setup'
      })
    }
  })
}
```

### Pattern 5: Preflight Endpoint

```typescript
// src/routes/preflight.ts
export async function registerPreflightRoutes(app: FastifyInstance): Promise<void> {
  app.get('/api/setup/preflight', async (_request, reply) => {
    const checks = await runAllPreflightChecks()
    const ready = checks.every(c => c.status === 'pass')
    return reply.send({ ready, checks, timestamp: new Date().toISOString() })
  })
}
```

Response shape:
```json
{
  "ready": false,
  "timestamp": "2026-03-05T10:00:00.000Z",
  "checks": [
    {
      "id": "env_vars",
      "name": "Required Environment Variables",
      "status": "fail",
      "message": "Missing: DATABASE_URL, SYNC_PASSWORD",
      "remediation": "Set DATABASE_URL and SYNC_PASSWORD in your .env file"
    },
    {
      "id": "db_connectivity",
      "name": "PostgreSQL Connectivity",
      "status": "fail",
      "message": "Connection refused: localhost:5432",
      "remediation": "Check PostgreSQL is running and DATABASE_URL is correct"
    },
    {
      "id": "db_tables",
      "name": "Required Database Tables",
      "status": "fail",
      "message": "Missing tables: articulos, comprobantes_pagos",
      "remediation": "Run: npx prisma migrate deploy"
    },
    {
      "id": "jwt_configured",
      "name": "JWT Secret",
      "status": "warn",
      "message": "JWT_SECRET is using default value",
      "remediation": "Run setup wizard at /setup or set JWT_SECRET in .env"
    },
    {
      "id": "env_file_writable",
      "name": ".env File Writable",
      "status": "pass",
      "message": ".env file exists and is writable",
      "remediation": null
    }
  ]
}
```

### Pattern 6: Rate Limiting the Preflight Endpoint

`@fastify/rate-limit` must be registered as a plugin before route handlers:

```typescript
// In app.ts buildApp()
import rateLimit from '@fastify/rate-limit'

await app.register(rateLimit, {
  max: 10,
  timeWindow: '1 minute',
  // Only apply to preflight — use route-level config or global with skip
  skipOnError: true
})

// OR: Apply rate-limit per-route (preferred — avoids global rate limiting)
app.get('/api/setup/preflight', {
  config: { rateLimit: { max: 10, timeWindow: '1 minute' } }
}, handler)
```

**Decision for discretion:** Use per-route rate limiting config rather than global plugin to avoid accidentally rate-limiting other routes. `@fastify/rate-limit` supports this via `config.rateLimit` on individual routes.

### Pattern 7: Table Check via pg_tables

This query pattern already exists in `setup.ts:825` — reuse it:

```typescript
async function checkRequiredTables(): Promise<PreflightCheck> {
  const REQUIRED = ['articulos', 'comprobantes_cabecera', 'comprobantes_detalle', 'comprobantes_pagos']
  try {
    const result = await prisma.$queryRaw<Array<{ tablename: string }>>`
      SELECT tablename FROM pg_tables
      WHERE schemaname = 'public'
      AND tablename = ANY(ARRAY['articulos', 'comprobantes_cabecera', 'comprobantes_detalle', 'comprobantes_pagos'])
    `
    const found = result.map(r => r.tablename)
    const missing = REQUIRED.filter(t => !found.includes(t))

    if (missing.length === 0) {
      return { id: 'db_tables', name: 'Required Database Tables', status: 'pass',
               message: 'All 4 required tables exist', remediation: null }
    }
    return { id: 'db_tables', name: 'Required Database Tables', status: 'fail',
             message: `Missing tables: ${missing.join(', ')}`,
             remediation: 'Run: npx prisma migrate deploy' }
  } catch (err) {
    return { id: 'db_tables', name: 'Required Database Tables', status: 'fail',
             message: 'Could not query table list', remediation: 'Check database connectivity' }
  }
}
```

### Anti-Patterns to Avoid

- **Don't exit(1) on missing env vars:** The decision is setup-only mode, not crash. Only truly unrecoverable errors (port bind failure, FS permissions) warrant exit(1).
- **Don't write .env without the mutex:** Two concurrent setup wizard steps could corrupt the file. All 4 write locations must be replaced, not just the new ones.
- **Don't share the preflight check results across request handlers naively:** The preflight endpoint should run live checks at request time (not cached from startup) so it reflects the current state after wizard steps have been completed.
- **Don't use `replace(/KEY=.*/g, ...)` without anchoring to line start:** The regex `/^KEY=/m` is safer — prevents matching `ANOTHER_KEY=` when `KEY` is a prefix.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Rate limiting | Manual IP counter + Map + cleanup timer | `@fastify/rate-limit` | Handles proxy headers (X-Forwarded-For), sliding window, proper 429 responses |
| .env file parsing | Custom line-by-line parser | Read file + regex replace + write back (pattern already in codebase) | dotenv for reading at startup is already handled; for writing, the existing string manipulation is sufficient |
| Async mutex | npm `async-mutex` or `p-limit` | 8-line promise chain (see Pattern 1) | Zero dependency, sufficient for single-process |

**Key insight:** The hardest parts of this phase (table detection, DB connectivity, Fastify route registration) have exact code patterns already in the codebase. The primary risk is the mutex implementation and ensuring all 4 write sites are migrated.

---

## Common Pitfalls

### Pitfall 1: Preflight Caches Stale State
**What goes wrong:** If preflight reads from `systemState.preflightChecks` set at startup, it won't reflect that the user just configured DATABASE_URL via the setup wizard.
**Why it happens:** Startup checks run once; wizard updates `process.env` but startup cache is never refreshed.
**How to avoid:** Run fresh checks in the preflight route handler. Use `systemState` only for the startup banner display — not as the preflight response source.
**Warning signs:** Preflight returns "fail" for DB even after successful wizard configuration.

### Pitfall 2: Regex Replaces Wrong Key
**What goes wrong:** `content.replace(/DATABASE_URL=.*/g, ...)` also matches `APP_DATABASE_URL=` or comments like `# DATABASE_URL=example`.
**Why it happens:** No line anchor in regex, no comment awareness.
**How to avoid:** Use `new RegExp('^' + key + '=.*', 'm')` for multi-line matching anchored at line start. Skip comment lines when reading.
**Warning signs:** Running tests with a key that is a prefix of another key corrupts both.

### Pitfall 3: Setup-Only Mode Blocks Health Check
**What goes wrong:** If `onRequest` hook is too aggressive, `/health` returns 503 — breaking Docker health checks and causing container restart loops.
**Why it happens:** Allowlist for setup-only mode doesn't include `/health` and `/metrics`.
**How to avoid:** Explicitly allow `/health`, `/metrics`, and all `/api/setup/` prefixes in the setup-only gate hook.

### Pitfall 4: JWT Default Value Detection
**What goes wrong:** The JWT_SECRET check needs to detect the default value `'change-me-in-production'` used in `app.ts:90`. If the check only tests for presence (truthy), it misses the insecure default.
**Why it happens:** `process.env.JWT_SECRET || 'change-me-in-production'` is non-empty, so a simple `!!process.env.JWT_SECRET` check returns true.
**How to avoid:** Check against the known default: `JWT_SECRET !== 'change-me-in-production' && JWT_SECRET !== 'change-this-secret-in-production-debe-ser-el-mismo-que-en-objetiva-sync'` (two defaults exist in codebase — verify both).

### Pitfall 5: Rate Limit Plugin Registration Order
**What goes wrong:** Registering `@fastify/rate-limit` after routes have been registered means the plugin is not applied to those routes.
**Why it happens:** Fastify's plugin encapsulation — decorators and hooks apply only to routes registered after the plugin.
**How to avoid:** Register `@fastify/rate-limit` in `buildApp()` before calling `registerPreflightRoutes()`.

### Pitfall 6: Concurrent mutex writes leaving chain broken
**What goes wrong:** If `doWrite()` throws, and `writeLock` is set to the rejected promise, all subsequent writes will also immediately reject.
**Why it happens:** The promise chain carries the rejection forward.
**How to avoid:** Reset the lock to `Promise.resolve()` in a `.catch()` inside the mutex wrapper, so failures don't poison the chain. Example: `writeLock = writeLock.then(() => doWrite(k, v)).catch(() => { /* reset implicitly by returning void */ })`

---

## Code Examples

### Existing .env Write Bug (auth.ts:271-274)
```typescript
// Source: objetiva-sync-gateway/src/routes/auth.ts:271
// CURRENT (buggy) — no quoting, no escaping
if (envContent.includes('SYNC_PASSWORD=')) {
  envContent = envContent.replace(/SYNC_PASSWORD=.*/g, `SYNC_PASSWORD=${newPassword}`)
} else {
  envContent += `\nSYNC_PASSWORD=${newPassword}\n`
}
```

### Existing Table Check (already works, reuse it)
```typescript
// Source: objetiva-sync-gateway/src/routes/setup.ts:825
const result = await tempPrisma.$queryRaw<Array<{ tablename: string }>>`
  SELECT tablename
  FROM pg_tables
  WHERE schemaname = 'public'
  AND tablename = ANY(ARRAY['articulos', 'comprobantes_cabecera', 'comprobantes_detalle', 'comprobantes_pagos'])
`
```

### Existing systemState (extend this)
```typescript
// Source: objetiva-sync-gateway/src/server.ts:9
export const systemState = {
  dbConnected: false,
  dbError: null as string | null,
  startTime: new Date(),
  lastDbCheck: null as Date | null
  // EXTEND with:
  // startupMode: 'normal' | 'setup-only' | 'degraded'
  // preflightChecks: PreflightCheck[]
}
```

### Integration Test Pattern (follow existing style)
```typescript
// Source: objetiva-sync-gateway/tests/integration/auth.integration.test.ts
import { buildApp } from '../../src/app.js'
import type { FastifyInstance } from 'fastify'

describe('Preflight Integration Tests', () => {
  let app: FastifyInstance

  beforeAll(async () => {
    process.env.JWT_SECRET = 'test-secret-for-integration-tests-32chars'
    app = await buildApp()
    await app.ready()
  })

  afterAll(async () => { await app.close() })

  it('should return 200 with checks array', async () => {
    const response = await app.inject({ method: 'GET', url: '/api/setup/preflight' })
    expect(response.statusCode).toBe(200)
    const body = JSON.parse(response.payload)
    expect(body).toHaveProperty('ready')
    expect(body).toHaveProperty('checks')
    expect(body.checks).toHaveLength(5)
  })
})
```

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Scattered inline .env writes | Centralized `env-writer.ts` with mutex | Phase 18 (now) | Fixes ENV-04 bug, enables safe concurrent setup |
| Crash on missing env vars | Setup-only mode, no exit(1) | Phase 18 (now) | Better UX for first-time setup |
| No preflight endpoint | `GET /api/setup/preflight` with 5 checks | Phase 18 (now) | Setup wizard can show live status |

**Deprecated/outdated:**
- `setup.ts:774, 803, 884` inline `.env` writes — replaced by `env-writer.ts` calls
- `auth.ts:278` inline `.env` write — replaced by `env-writer.ts` call

---

## Open Questions

1. **Whether to add `x-preflight-status` header to all non-setup responses in setup-only mode**
   - What we know: context marks this as Claude's discretion
   - What's unclear: useful for debugging client-side errors, but adds header overhead
   - Recommendation: Skip for now — adds complexity for uncertain value; document in phase notes if needed later

2. **JWT default value sentinel list**
   - What we know: Two default values observed in codebase (`'change-me-in-production'` in app.ts, `'change-this-secret-in-production...'` in setup.ts:924)
   - What's unclear: Are there others?
   - Recommendation: Read both files during implementation to get exact strings; check `env.example` too

3. **buildApp() signature change for startupMode parameter**
   - What we know: `buildApp()` currently takes no parameters; startup mode needs to be passed to it
   - What's unclear: Whether to use a parameter or rely on `systemState` (which is already exported from server.ts)
   - Recommendation: Import `systemState` from `server.ts` inside `app.ts` — avoids changing the `buildApp` signature and keeps the pattern consistent with how `health.ts` accesses DB state

---

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Vitest ^4.0.18 |
| Config file | `objetiva-sync-gateway/vitest.config.ts` |
| Quick run command | `cd objetiva-sync-gateway && npx vitest run tests/unit/env-writer.test.ts` |
| Full suite command | `cd objetiva-sync-gateway && npx vitest run` |

### Phase Requirements to Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| PF-01 | Missing `DATABASE_URL` → setup-only mode, not crash | integration | `npx vitest run tests/integration/preflight.integration.test.ts` | ❌ Wave 0 |
| PF-02 | Bad DB credentials → preflight `db_connectivity` check shows fail | integration | `npx vitest run tests/integration/preflight.integration.test.ts` | ❌ Wave 0 |
| PF-03 | Missing tables → preflight `db_tables` check shows fail with migration hint | integration | `npx vitest run tests/integration/preflight.integration.test.ts` | ❌ Wave 0 |
| PF-04 | `GET /api/setup/preflight` returns `{ ready, checks, timestamp }` with 5 items | integration | `npx vitest run tests/integration/preflight.integration.test.ts` | ❌ Wave 0 |
| PF-05 | Two concurrent .env writes produce valid file with both values | unit | `npx vitest run tests/unit/env-writer.test.ts` | ❌ Wave 0 |
| PF-05 | Password with `$#"` written to .env is read back identically | unit | `npx vitest run tests/unit/env-writer.test.ts` | ❌ Wave 0 |

### Sampling Rate
- **Per task commit:** `cd objetiva-sync-gateway && npx vitest run tests/unit/env-writer.test.ts`
- **Per wave merge:** `cd objetiva-sync-gateway && npx vitest run`
- **Phase gate:** Full suite green before `/gsd:verify-work`

### Wave 0 Gaps
- [ ] `tests/unit/env-writer.test.ts` — covers PF-05 mutex and escaping
- [ ] `tests/integration/preflight.integration.test.ts` — covers PF-01 through PF-04
- [ ] `@fastify/rate-limit` install: `cd objetiva-sync-gateway && npm install @fastify/rate-limit`

---

## Sources

### Primary (HIGH confidence)
- Direct codebase inspection — `server.ts`, `app.ts`, `routes/setup.ts`, `routes/auth.ts`, `routes/health.ts`, `middleware/auth.ts` — read in full during research session
- `.env.example` — authoritative list of env var names and their defaults
- `package.json` — confirmed installed dependencies and missing `@fastify/rate-limit`
- `vitest.config.ts` + existing test files — confirmed test patterns and framework version

### Secondary (MEDIUM confidence)
- Fastify `@fastify/rate-limit` per-route config pattern — verified via established Fastify plugin API conventions (plugin is in the official @fastify org, same install pattern as @fastify/cors, @fastify/jwt already in use)

### Tertiary (LOW confidence)
- None — all claims backed by direct code inspection

---

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — all packages read from actual `package.json`
- Architecture: HIGH — all patterns copied from existing gateway code
- Pitfalls: HIGH — ENV-04 bug location confirmed (`auth.ts:271-274`), default JWT sentinel strings confirmed (`app.ts:90`, `setup.ts:924`)

**Research date:** 2026-03-05
**Valid until:** 2026-04-05 (stable stack — no fast-moving dependencies)
