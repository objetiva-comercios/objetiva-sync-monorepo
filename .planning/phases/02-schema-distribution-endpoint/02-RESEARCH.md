# Phase 2: Schema Distribution Endpoint - Research

**Researched:** 2026-01-27
**Domain:** Fastify REST API with JWT authentication, in-memory caching, PostgreSQL schema introspection
**Confidence:** HIGH

## Summary

This phase adds a single authenticated REST endpoint (`GET /api/schemas/:entity`) to the existing Fastify 4 gateway that serves PostgreSQL schema metadata produced by Phase 1's `IntrospectionService`. The endpoint validates the entity name against the configured `SYNC_ENTITIES` list, caches results in memory with 1-hour TTL, and requires JWT authentication matching the existing gateway pattern.

The implementation is straightforward because all building blocks already exist:
- **Introspection**: `IntrospectionService.introspectTable()` from Phase 1 returns `TableSchema` objects
- **Authentication**: `authenticate` preHandler middleware already validates JWT tokens via `request.jwtVerify()`
- **Entity config**: `getSyncEntities()` returns the allowed entity list (with env var override)
- **Route pattern**: Existing routes (`articulos.ts`, `comprobantes.ts`) demonstrate the exact registration pattern

The only new concerns are: (1) an in-memory cache with TTL for schema results, and (2) entity name validation against the allowed list.

**Primary recommendation:** Use a simple `Map<string, { data: TableSchema; expires: number }>` for caching -- no external library needed. Follow the existing route registration pattern exactly. Reuse the existing `authenticate` preHandler.

## Standard Stack

### Core

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| fastify | 4.28.1 | HTTP framework (already installed) | Project standard, all routes use it |
| @fastify/jwt | 7.2.4 | JWT authentication (already installed) | Already registered in `app.ts`, `authenticate` middleware exists |
| pg | 8.17.2 | PostgreSQL pool (already installed) | Phase 1's `introspectionPool` already configured |
| zod | 3.23.8 | Schema validation (already installed) | Project standard for runtime validation |

### Supporting

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| pino | 9.5.0 | Logging (already installed) | All route handlers use `logger` from `lib/logger.ts` |

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Simple Map cache | `@fastify/caching` plugin | Plugin adds HTTP cache headers (RFC 2616) but we need data-level caching of introspection results, not response-level caching. A Map is simpler and more appropriate. |
| Simple Map cache | `node-cache` npm package | Adds unnecessary dependency for a single cache with ~4 entries. Map + timestamp check is trivial. |
| Simple Map cache | Redis | Overkill for single-process gateway with 4 entities. No Redis in current stack. |

**Installation:**
```bash
# No new packages needed - all dependencies already installed
```

## Architecture Patterns

### Recommended Project Structure

New files to create:
```
objetiva-sync-gateway/src/
  routes/
    schemas.ts          # NEW - GET /api/schemas/:entity route
  services/
    schema-cache.ts     # NEW - In-memory cache with TTL
```

Files to modify:
```
objetiva-sync-gateway/src/
  app.ts                # MODIFY - register schema routes
```

### Pattern 1: Route Registration (follow existing convention)

**What:** Register the schema route using the same pattern as `articulos.ts` and `comprobantes.ts`
**When to use:** All new routes in this gateway

```typescript
// Source: Existing codebase pattern from articulos.ts
import type { FastifyInstance } from 'fastify';
import { authenticate } from '../middleware/auth.js';

export async function registerSchemaRoutes(app: FastifyInstance) {
  app.get(
    '/api/schemas/:entity',
    { preHandler: authenticate },
    async (request, reply) => {
      // handler logic
    }
  );
}
```

**Confidence:** HIGH -- directly observed in existing codebase

### Pattern 2: In-Memory Cache with TTL

**What:** Simple Map-based cache that stores introspection results per entity with expiration timestamps
**When to use:** When caching small amounts of data in a single-process application

```typescript
// Pattern: Map<key, { data, expiresAt }> with lazy expiration
interface CacheEntry<T> {
  data: T;
  expiresAt: number;
}

const cache = new Map<string, CacheEntry<TableSchema>>();
const TTL_MS = 60 * 60 * 1000; // 1 hour

function get(key: string): TableSchema | null {
  const entry = cache.get(key);
  if (!entry) return null;
  if (Date.now() > entry.expiresAt) {
    cache.delete(key);
    return null;
  }
  return entry.data;
}

function set(key: string, data: TableSchema): void {
  cache.set(key, { data, expiresAt: Date.now() + TTL_MS });
}

function invalidate(key?: string): void {
  if (key) cache.delete(key);
  else cache.clear();
}
```

**Confidence:** HIGH -- standard JavaScript pattern, no library needed

### Pattern 3: Entity Validation Against Allowed List

**What:** Validate the `:entity` route parameter against `getSyncEntities()` before processing
**When to use:** Prevent introspection of arbitrary table names

```typescript
import { getSyncEntities } from '../config/entities.js';

// Inside route handler:
const { entity } = request.params as { entity: string };
const allowedEntities = getSyncEntities();

if (!allowedEntities.includes(entity)) {
  return reply.status(404).send({
    error: `Entity not found: ${entity}`,
    code: 'ENTITY_NOT_FOUND',
  });
}
```

**Confidence:** HIGH -- `getSyncEntities()` already exists and is tested in Phase 1

### Pattern 4: Response Format (per context decisions)

**What:** Direct schema object as response body without wrapper keys
**When to use:** Schema endpoint responses

```typescript
// Response shape matches TableSchema from types/schema.ts:
{
  entity: 'articulos',        // renamed from table_name per decision
  columns: [
    {
      column_name: 'id',
      data_type: 'int',       // normalized type from Phase 1
      is_nullable: false,
      default_value: "nextval('articulos_id_seq'::regclass)",
      ordinal_position: 1,
      column_comment: null
    }
    // ...
  ],
  constraints: [
    {
      constraint_name: 'articulos_pkey',
      constraint_type: 'PRIMARY KEY',
      columns: ['id']
    }
    // ...
  ]
}
```

**Confidence:** HIGH -- locked decision from CONTEXT.md

### Pattern 5: Error Response Format (per context decisions)

**What:** Detailed error structure with code field
**When to use:** All error responses from schema endpoint

```typescript
// Error responses use detailed structure per CONTEXT.md decision:
{
  error: 'Entity not found: xyz',
  code: 'ENTITY_NOT_FOUND',
}

// For introspection failures:
{
  error: 'Failed to introspect entity: articulos',
  code: 'DB_CONNECTION_FAILED',
  details: { message: 'Connection refused' }
}
```

**Confidence:** HIGH -- locked decision from CONTEXT.md

### Anti-Patterns to Avoid

- **Do not create a bulk endpoint:** Context decision specifies single entity endpoint only (`GET /api/schemas/:entity`), no `GET /api/schemas` for all entities.
- **Do not use query parameters for filtering:** Context decision specifies always returning complete schema for the requested entity.
- **Do not wrap response in `{ data: ... }` or `{ schema: ... }`:** Context decision specifies direct schema object as response body.
- **Do not use `@fastify/caching` for this:** That plugin manages HTTP cache headers. We need data-level caching of introspection results to avoid hitting the database on every request.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| JWT authentication | Custom token parsing | `authenticate` preHandler from `middleware/auth.ts` | Already handles `request.jwtVerify()` and 401 responses |
| Schema introspection | Direct SQL queries | `IntrospectionService.introspectTable()` from `services/introspection.ts` | Phase 1 already built this with retry logic, type normalization |
| Entity list | Hardcoded array in route | `getSyncEntities()` from `config/entities.ts` | Already handles env var override and default list |
| Error handling | Custom try/catch patterns | Gateway's `registerErrorHandler()` in `middleware/error-handler.ts` | Already handles ZodError, JWT errors, and generic errors |
| Logging | `console.log` | `logger` from `lib/logger.ts` | Pino logger already configured for the gateway |

**Key insight:** This phase is primarily glue code connecting Phase 1's introspection service to an HTTP endpoint. Nearly every building block already exists. The only new logic is the cache and the route handler.

## Common Pitfalls

### Pitfall 1: Cache Serving Stale Data After Schema Change

**What goes wrong:** User runs `regenerate-schemas` (future phase) but the endpoint keeps serving cached schema for up to 1 hour.
**Why it happens:** In-memory cache has no invalidation mechanism beyond TTL.
**How to avoid:** Expose a `cache.invalidate()` function that can be called when schema regeneration happens. For now, TTL-based expiration is acceptable per roadmap requirements. Document the invalidation hook for future phases.
**Warning signs:** Schema changes not reflected in sync service behavior.

### Pitfall 2: Introspection Pool Not Connected

**What goes wrong:** The `introspectionPool` from `lib/db.ts` fails to connect, and the schema endpoint returns 500 errors.
**Why it happens:** PostgreSQL might be temporarily unavailable, or `DATABASE_URL` misconfigured.
**How to avoid:** `IntrospectionService.introspectTable()` already uses `withRetry()` which handles transient connection errors. Ensure the route handler catches errors and returns the detailed error format specified in context decisions.
**Warning signs:** Repeated 500 errors on schema endpoint.

### Pitfall 3: Entity Name Injection

**What goes wrong:** Attacker sends arbitrary table names like `pg_shadow` or `users` to introspect sensitive tables.
**Why it happens:** Route parameter not validated against allowed entity list.
**How to avoid:** Always validate `:entity` against `getSyncEntities()` BEFORE calling `IntrospectionService`. Return 404 for unknown entities. This is a security requirement, not just validation.
**Warning signs:** Requests for entities not in the sync list.

### Pitfall 4: Response Shape Mismatch with Context Decision

**What goes wrong:** Route returns `TableSchema` directly (which has `table_name` field) but context decision specifies `entity` field.
**Why it happens:** `IntrospectionService.introspectTable()` returns `{ table_name, table_comment, columns, constraints }` but the API response should use `{ entity, columns, constraints }`.
**How to avoid:** Map the response in the route handler: rename `table_name` to `entity`, optionally include or exclude `table_comment` based on the response contract.
**Warning signs:** Consumer expecting `entity` field gets `table_name` instead.

### Pitfall 5: Missing Cache-Control Headers

**What goes wrong:** HTTP clients or proxies cache responses independently of the server-side cache, leading to unpredictable staleness.
**Why it happens:** No `Cache-Control` header set on schema responses.
**How to avoid:** Set `Cache-Control: public, max-age=3600` header on successful schema responses to align HTTP caching with server-side TTL. This communicates caching intent to intermediaries.
**Warning signs:** Clients seeing stale data even after server cache is invalidated.

### Pitfall 6: Performance Target Miss on Cache Hit

**What goes wrong:** Cache hit responses exceed the 100ms target specified in success criteria.
**Why it happens:** Unnecessary async operations, serialization overhead, or middleware bottlenecks.
**How to avoid:** On cache hit, the handler should return immediately from the Map lookup. No database calls, no async operations. The `authenticate` middleware is the only async step (JWT verification is CPU-bound, typically <5ms). Map lookup is O(1).
**Warning signs:** Latency metrics showing >100ms for cached responses.

## Code Examples

### Complete Route Handler Pattern

```typescript
// Source: Derived from existing codebase patterns + context decisions
// File: src/routes/schemas.ts

import type { FastifyInstance } from 'fastify';
import { authenticate } from '../middleware/auth.js';
import { IntrospectionService } from '../services/introspection.js';
import { getSyncEntities } from '../config/entities.js';
import { schemaCache } from '../services/schema-cache.js';
import { logger } from '../lib/logger.js';

export async function registerSchemaRoutes(app: FastifyInstance) {
  app.get(
    '/api/schemas/:entity',
    { preHandler: authenticate },
    async (request, reply) => {
      const { entity } = request.params as { entity: string };

      // Validate entity against allowed list
      const allowedEntities = getSyncEntities();
      if (!allowedEntities.includes(entity)) {
        return reply.status(404).send({
          error: `Entity not found: ${entity}`,
          code: 'ENTITY_NOT_FOUND',
        });
      }

      // Check cache first
      const cached = schemaCache.get(entity);
      if (cached) {
        reply.header('X-Cache', 'HIT');
        reply.header('Cache-Control', 'public, max-age=3600');
        return cached;
      }

      // Cache miss - introspect from database
      try {
        const tableSchema = await IntrospectionService.introspectTable(
          'public',
          entity
        );

        // Map response to API contract
        const response = {
          entity: tableSchema.table_name,
          columns: tableSchema.columns,
          constraints: tableSchema.constraints,
        };

        // Store in cache
        schemaCache.set(entity, response);

        reply.header('X-Cache', 'MISS');
        reply.header('Cache-Control', 'public, max-age=3600');
        return response;
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        const code = error && typeof error === 'object' && 'code' in error
          ? String((error as { code: string }).code)
          : 'INTROSPECTION_FAILED';

        logger.error({ entity, error: message }, 'Schema introspection failed');

        return reply.status(500).send({
          error: `Failed to introspect entity: ${entity}`,
          code,
          details: { message },
        });
      }
    }
  );
}
```

### Cache Module Pattern

```typescript
// Source: Standard JavaScript Map + TTL pattern
// File: src/services/schema-cache.ts

import { logger } from '../lib/logger.js';

interface CacheEntry<T> {
  data: T;
  expiresAt: number;
}

const TTL_MS = 60 * 60 * 1000; // 1 hour per roadmap requirement SCHEMA-04
const store = new Map<string, CacheEntry<unknown>>();

export const schemaCache = {
  get<T>(key: string): T | null {
    const entry = store.get(key);
    if (!entry) return null;
    if (Date.now() > entry.expiresAt) {
      store.delete(key);
      logger.debug({ key }, 'Schema cache entry expired');
      return null;
    }
    return entry.data as T;
  },

  set<T>(key: string, data: T): void {
    store.set(key, { data, expiresAt: Date.now() + TTL_MS });
    logger.debug({ key, ttlMs: TTL_MS }, 'Schema cache entry set');
  },

  invalidate(key?: string): void {
    if (key) {
      store.delete(key);
      logger.info({ key }, 'Schema cache entry invalidated');
    } else {
      store.clear();
      logger.info('Schema cache cleared');
    }
  },

  size(): number {
    return store.size;
  },
};
```

### App Registration Pattern

```typescript
// Source: Existing pattern from app.ts
// File: src/app.ts (modification)

import { registerSchemaRoutes } from './routes/schemas.js';

// Add after existing route registrations:
await registerSchemaRoutes(app);
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| `@fastify/caching` for all caching | Data-level caching with simple Map for small datasets | Ongoing best practice | `@fastify/caching` is for HTTP cache headers (RFC 2616), not application data caching |
| Fastify 4 decorateRequest with reference types | Fastify 5 requires hooks/getters for reference types | Fastify 5 (not yet adopted here) | Current codebase uses Fastify 4.28.1, reference type decorators still work but should avoid for forward compatibility |

**Deprecated/outdated:**
- None relevant. The gateway uses Fastify 4.28.1 which is current stable. All patterns used are standard.

## Open Questions

1. **Cache invalidation on schema regeneration**
   - What we know: TTL-based expiration (1 hour) is the minimum requirement per SCHEMA-04
   - What's unclear: Future phases may need explicit invalidation when `regenerate-schemas` command runs
   - Recommendation: Export `schemaCache.invalidate()` so future phases can call it. For now, TTL is sufficient.

2. **Response shape: include `table_comment`?**
   - What we know: Context decision says `{ entity, columns, constraints }`. `IntrospectionService` also returns `table_comment`.
   - What's unclear: Whether `table_comment` should be included in the API response
   - Recommendation: Omit `table_comment` from the response to match the explicit context decision. Can add later if needed.

3. **Cache type for the response vs. raw TableSchema**
   - What we know: The cache should store the mapped API response (with `entity` field), not the raw `TableSchema` (with `table_name` field)
   - What's unclear: Nothing -- this is a design decision
   - Recommendation: Cache the mapped response object to avoid re-mapping on every cache hit

## Sources

### Primary (HIGH confidence)
- `/fastify/fastify` via Context7 -- Route registration, preHandler hooks, decorator patterns
- `/fastify/fastify-jwt` via Context7 -- JWT verify, authentication hook patterns
- Existing codebase files (directly inspected):
  - `objetiva-sync-gateway/src/app.ts` -- App setup, plugin registration
  - `objetiva-sync-gateway/src/middleware/auth.ts` -- JWT authenticate middleware
  - `objetiva-sync-gateway/src/services/introspection.ts` -- IntrospectionService from Phase 1
  - `objetiva-sync-gateway/src/types/schema.ts` -- TypeScript interfaces
  - `objetiva-sync-gateway/src/schemas/introspection.ts` -- Zod validation schemas
  - `objetiva-sync-gateway/src/config/entities.ts` -- Entity list configuration
  - `objetiva-sync-gateway/src/routes/articulos.ts` -- Existing route pattern
  - `objetiva-sync-gateway/src/lib/db.ts` -- PostgreSQL introspection pool
  - `objetiva-sync-gateway/src/lib/retry.ts` -- Retry wrapper with backoff

### Secondary (MEDIUM confidence)
- WebSearch: Fastify caching patterns 2025 -- confirmed simple Map approach is standard for small datasets
- WebSearch: `@fastify/caching` is for HTTP cache headers, not data-level caching

### Tertiary (LOW confidence)
- None

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH -- all libraries already installed and used in codebase
- Architecture: HIGH -- follows existing patterns exactly, only 2 new files
- Pitfalls: HIGH -- identified from direct codebase analysis and context decisions
- Code examples: HIGH -- derived from existing codebase patterns with verified API signatures

**Research date:** 2026-01-27
**Valid until:** 2026-02-27 (stable -- all libraries already in use, no version changes expected)
