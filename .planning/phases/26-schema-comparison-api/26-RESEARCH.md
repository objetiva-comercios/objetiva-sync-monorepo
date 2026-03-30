# Phase 26: Schema Comparison API - Research

**Researched:** 2026-03-29
**Domain:** Fastify API routes, in-memory state, 3-way schema comparison logic, sync-side HTTP client
**Confidence:** HIGH

---

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

**Schema Reporting Endpoint**
- D-01: New route `POST /api/schemas/report` receives all 4 entity schemas in a single request body. Gateway overwrites its stored snapshot entirely.
- D-02: Sync calls the report endpoint once on startup, before the first sync cycle. Gateway always has a snapshot if sync has connected at least once.
- D-03: Endpoint uses JWT auth via existing `authenticate` middleware, consistent with all other `/api/*` routes.

**In-Memory Storage**
- D-04: Simple `Map<entity, schema>` overwritten on each POST. No TTL, no expiration. Lost on restart, repopulated when sync reconnects.
- D-05: When sync hasn't reported yet, the comparison API shows sync layer as `"not_reported"` status — not omitted, not shown as matching.

**Comparison Response Structure**
- D-06: Single endpoint `GET /api/schemas/compare` returns comparison for all 4 entities in one response (per success criteria #3).
- D-07: Per-field structure with 3 layers: each field row has `{ column_name, status, postgresql, compiled, sync }` where `sync` can be `null` if not reported.
- D-08: Status values: `"aligned"` (all present layers match), `"mismatched"` (present layers differ), `"missing"` (field exists in PostgreSQL but absent in compiled or sync).
- D-09: Comparison attributes for alignment: `data_type` + `is_nullable` only. Default values and comments are informational, not compared for alignment status.
- D-10: Each entity includes a summary object: `{ aligned: N, mismatched: N, missing: N }`.

**Compiled Schema Source**
- D-11: Gateway reads compiled schemas by importing the generated `TableSchemaMetadata` exports from `shared/schemas/generated/*.schema.ts`. These are the compiled truth — no Prisma DMMF derivation.

### Claude's Discretion

- Comparison service internal architecture (class vs functions)
- Exact route registration pattern (follow existing schemas.ts as template)
- Sync-side client code for calling the report endpoint (follow existing API client patterns)
- Whether to add the report endpoint to the existing `schemas.ts` routes file or create a new route file

### Deferred Ideas (OUT OF SCOPE)

None — discussion stayed within phase scope
</user_constraints>

---

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| SCHEMA-02 | Schema Status compara 3 niveles: PostgreSQL live vs schemas compilados en gateway vs schemas reportados por sync | D-06 through D-10 define the exact comparison structure; `IntrospectionService.introspectTable()` provides PostgreSQL live layer; `tableSchemas` map in `shared/schemas/index.ts` provides compiled layer; in-memory Map (D-04) provides sync layer |
| SCHEMA-04 | Sync reporta su version de schemas al gateway via endpoint dedicado | D-01, D-02, D-03 define the POST endpoint; sync startup sequence in `objetiva-sync/src/index.ts` step 3.5 (`initializeSchemaCache`) is where the report call hooks in |
</phase_requirements>

---

## Summary

Phase 26 adds two new API endpoints to the gateway: `POST /api/schemas/report` (sync reports its compiled schema snapshot) and `GET /api/schemas/compare` (returns 3-way comparison). Both are greenfield endpoints — no existing code needs modification except route registration in `app.ts` and a new startup call in the sync service.

The gateway side involves: a new in-memory store (a simple `Map<string, TableSchemaMetadata>`) to hold the sync-reported snapshot, a comparison service that joins 3 data sources per entity, and the two Fastify route handlers. The sync side involves a new lightweight client function that calls `POST /api/schemas/report` on startup using the same pattern as `ArticulosClient` (native `fetch` + `getJwtToken()` + `getGatewayUrl()`).

All the building blocks are already in place and well-understood: the route registration pattern, `authenticate` middleware, `IntrospectionService`, `getSyncEntities()`, `tableSchemas` map, and the fetch/JWT pattern on the sync side. This phase is primarily wiring known components together with new comparison logic.

**Primary recommendation:** Create a new route file `schema-comparison.ts` (separate from the existing `schemas.ts` to avoid growing that file); create a new `SyncSchemaStore` module for the in-memory Map; create a pure `SchemaComparisonService` with functions (not class, per Claude's discretion — functions are simpler and testable). Register the new routes in `app.ts` with one new import line.

---

## Standard Stack

### Core — Already in Use
| Library | Version | Purpose | Source |
|---------|---------|---------|--------|
| Fastify | (existing) | HTTP framework | `app.ts` |
| `@fastify/jwt` | (existing) | JWT auth registered on app | `app.ts` |
| Zod | (existing) | Request body validation | `schemas/introspection.ts` |
| TypeScript | (existing) | Type safety | whole monorepo |
| Vitest | (existing) | Test framework | `vitest.config.ts`, `tests/` |

### Already-Available Utilities
| Module | Purpose | Location |
|--------|---------|---------|
| `authenticate` | JWT preHandler middleware | `src/middleware/auth.ts` |
| `IntrospectionService.introspectTable()` | PostgreSQL live schema per entity | `src/services/introspection.ts` |
| `getSyncEntities()` | Returns 4 entity names | `src/config/entities.ts` |
| `tableSchemas` / `getTableSchema()` | Compiled schemas map | `shared/schemas/index.ts` |
| `schemaCache` | Pattern reference for in-memory store | `src/services/schema-cache.ts` |
| `getJwtToken()` | JWT generation for sync side | `objetiva-sync/src/services/gateway-client.ts` |
| `getGatewayUrl()` (private) | Base URL for sync side | `objetiva-sync/src/services/gateway-client.ts` |

**Installation:** No new dependencies required.

---

## Architecture Patterns

### Recommended Project Structure (new files only)
```
objetiva-sync-gateway/src/
├── services/
│   └── sync-schema-store.ts     # In-memory Map<entity, TableSchemaMetadata>
│   └── schema-comparison.ts     # Pure comparison logic functions
├── routes/
│   └── schema-comparison.ts     # POST /api/schemas/report + GET /api/schemas/compare

objetiva-sync/src/
├── api-client/
│   └── schema-report-client.ts  # One-shot POST /api/schemas/report on startup
```

### Pattern 1: Route Registration (follow existing schemas.ts)
```typescript
// Source: objetiva-sync-gateway/src/routes/schemas.ts (existing template)
import type { FastifyInstance } from 'fastify';
import { authenticate } from '../middleware/auth.js';

export async function registerSchemaComparisonRoutes(app: FastifyInstance) {
  app.post(
    '/api/schemas/report',
    { preHandler: authenticate },
    async (request, reply) => { /* ... */ }
  );

  app.get(
    '/api/schemas/compare',
    { preHandler: authenticate },
    async (request, reply) => { /* ... */ }
  );
}
```

Then in `app.ts`, add one line:
```typescript
import { registerSchemaComparisonRoutes } from './routes/schema-comparison.js';
// ...
await registerSchemaComparisonRoutes(app);
```

### Pattern 2: In-Memory Sync Schema Store (D-04)
```typescript
// src/services/sync-schema-store.ts
import type { TableSchemaMetadata } from '@shared/types/schema-metadata.js';

// Simple Map — no TTL, overwritten on each POST
const store = new Map<string, TableSchemaMetadata>();

export const syncSchemaStore = {
  set(snapshots: TableSchemaMetadata[]): void {
    store.clear();
    for (const schema of snapshots) {
      store.set(schema.entity, schema);
    }
  },
  get(entity: string): TableSchemaMetadata | null {
    return store.get(entity) ?? null;
  },
  hasData(): boolean {
    return store.size > 0;
  },
  // For testing
  _resetForTest(): void {
    store.clear();
  },
};
```

### Pattern 3: Comparison Response Structure (D-07, D-08, D-09, D-10)
```typescript
// Response shape for GET /api/schemas/compare
interface FieldLayerData {
  data_type: string;
  is_nullable: boolean;
}

interface ComparisonFieldRow {
  column_name: string;
  status: 'aligned' | 'mismatched' | 'missing';
  postgresql: FieldLayerData | null;   // null if column missing from PG (shouldn't happen)
  compiled: FieldLayerData | null;     // null if column absent in compiled schema
  sync: FieldLayerData | null;         // null if sync not reported yet
}

interface EntityComparison {
  entity: string;
  sync_reported: boolean;              // false = "not_reported" state (D-05)
  summary: { aligned: number; mismatched: number; missing: number };
  fields: ComparisonFieldRow[];
}

// Full response
type CompareResponse = EntityComparison[];
```

### Pattern 4: Comparison Logic (D-08, D-09)
The comparison is PostgreSQL-authoritative — iterate PostgreSQL columns, check if compiled and sync columns match on `data_type` + `is_nullable`:

```typescript
function compareField(
  columnName: string,
  pg: FieldLayerData,
  compiled: FieldLayerData | null,
  sync: FieldLayerData | null,
  syncReported: boolean
): ComparisonFieldRow {
  // "missing": field in PG but absent from compiled or (if sync reported) absent from sync
  const compiledAbsent = compiled === null;
  const syncAbsent = syncReported && sync === null;
  if (compiledAbsent || syncAbsent) {
    return { column_name: columnName, status: 'missing', postgresql: pg, compiled, sync };
  }

  // "aligned": all present layers agree on data_type + is_nullable
  const compiledMatches = compiled.data_type === pg.data_type && compiled.is_nullable === pg.is_nullable;
  const syncMatches = !syncReported || (sync!.data_type === pg.data_type && sync!.is_nullable === pg.is_nullable);
  const status = compiledMatches && syncMatches ? 'aligned' : 'mismatched';

  return { column_name: columnName, status, postgresql: pg, compiled, sync };
}
```

### Pattern 5: Sync-Side Report Call (D-02)
```typescript
// objetiva-sync/src/api-client/schema-report-client.ts
import { tableSchemas } from '@shared/schemas/index.js';
import { getJwtToken } from '../services/gateway-client.js';
import { logger } from '../utils/logger.js';

export async function reportSchemasToGateway(gatewayUrl: string): Promise<void> {
  const snapshots = Object.values(tableSchemas);
  const token = await getJwtToken();

  const response = await fetch(`${gatewayUrl}/api/schemas/report`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ schemas: snapshots }),
    signal: AbortSignal.timeout(10_000),
  });

  if (!response.ok) {
    logger.warn({ status: response.status }, 'Schema report to gateway failed (non-blocking)');
    return; // Non-blocking — sync proceeds even if report fails
  }
  logger.info({ entities: snapshots.map(s => s.entity) }, 'Schemas reported to gateway');
}
```

Call site in `objetiva-sync/src/index.ts`, step 3.5:
```typescript
// After initializeSchemaCache(), add:
await reportSchemasToGateway(await getGatewayUrl());
```

### Pattern 6: POST /api/schemas/report Request Body Validation
```typescript
// Zod schema for POST body
import { z } from 'zod';

const columnMetadataSchema = z.object({
  column_name: z.string(),
  data_type: z.string(),
  is_nullable: z.boolean(),
  default_value: z.string().nullable().optional(),
  ordinal_position: z.number().int().positive().optional(),
  column_comment: z.string().nullable().optional(),
});

const tableSchemaMetadataSchema = z.object({
  entity: z.string(),
  columns: z.array(columnMetadataSchema),
  constraints: z.array(z.object({
    constraint_name: z.string(),
    constraint_type: z.enum(['PRIMARY KEY', 'FOREIGN KEY', 'UNIQUE', 'CHECK']),
    columns: z.array(z.string()),
  })),
});

const reportBodySchema = z.object({
  schemas: z.array(tableSchemaMetadataSchema).min(1),
});
```

### Anti-Patterns to Avoid
- **Adding to schemas.ts:** The existing `schemas.ts` file handles PostgreSQL introspection distribution. The comparison feature is conceptually different — keep it in a new route file to maintain single-responsibility.
- **Modifying `schemaCache`:** The existing gateway `schemaCache` is for PostgreSQL introspection results with TTL. The sync-reported store is a different concern with different lifecycle semantics (no TTL, cleared/reset on each POST). Use a separate module.
- **Parallel introspection in compare endpoint:** The existing `introspectEntities()` processes sequentially to avoid pool exhaustion. Follow the same pattern: `for...of` with `await IntrospectionService.introspectTable()` per entity.
- **Making sync schema report blocking:** If the report call fails, sync should still proceed. Non-blocking with a warning log is the right behavior.
- **Returning 404 when sync not reported:** Per D-05, return the full comparison with `sync_reported: false` and `sync: null` per field. Never omit entities from the response.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| JWT auth on new routes | Custom token parsing | `authenticate` preHandler | Already handles all error codes (TOKEN_MISSING, TOKEN_EXPIRED, SIGNATURE_MISMATCH) |
| Entity list | Hardcoded array | `getSyncEntities()` | Respects SYNC_ENTITIES env override; single source of truth |
| Compiled schema lookup | Manual file imports | `tableSchemas` map in `shared/schemas/index.ts` | Already has all 4 entities; barrel export keeps it in sync with regeneration |
| PostgreSQL live schema | Direct DB query | `IntrospectionService.introspectTable()` | Already handles type normalization, retry, pool |
| JWT generation (sync side) | New signing logic | `getJwtToken()` | Already reads secret from SQLite config or env |
| In-memory store boilerplate | Complex store | Simple `Map<string, T>` | No TTL, no expiration needed per D-04 |

---

## Common Pitfalls

### Pitfall 1: `getGatewayUrl` is private in gateway-client.ts
**What goes wrong:** `getGatewayUrl` is not exported from `gateway-client.ts`. If `schema-report-client.ts` imports it, TypeScript will error.
**Why it happens:** The function was designed for internal use only.
**How to avoid:** Either: (a) export `getGatewayUrl` from `gateway-client.ts` — this is a safe additive change; or (b) call `getConfig('REMOTE_API_URL')` directly from `schema-report-client.ts` using the same pattern. Option (a) is cleaner.
**Warning signs:** TS2459 or "not exported" error at import time.

### Pitfall 2: Type mismatch between gateway `ColumnMetadata` and shared `ColumnMetadata`
**What goes wrong:** There are TWO `ColumnMetadata` interfaces: one in `objetiva-sync-gateway/src/types/schema.ts` (used by IntrospectionService, with `ordinal_position` required) and one in `shared/types/schema-metadata.ts` (used by compiled schemas, with `ordinal_position` optional). The comparison service must read both.
**Why it happens:** Gateway-internal types are more strict than shared types; both have `column_name`, `data_type`, `is_nullable`.
**How to avoid:** In the comparison service, import from `shared/types/schema-metadata.ts` for sync-reported data, and cast the PostgreSQL result (which has both) to just the fields needed for comparison (`data_type`, `is_nullable`). Don't try to force a single type across all 3 layers.
**Warning signs:** TS2322 type error when assigning introspection results to shared type slots.

### Pitfall 3: `initializeSchemaCache` in sync is a no-op (schemas are already local)
**What goes wrong:** Looking at `initializeSchemaCache()` in sync and assuming it makes HTTP calls — it does not. Schemas in sync are loaded synchronously from `shared/schemas/`. The schema report call is therefore a NEW network call, not a replacement of an existing one.
**Why it happens:** Historical migration from HTTP schema fetching to local files; function kept for compatibility.
**How to avoid:** Add the `reportSchemasToGateway()` call AFTER `initializeSchemaCache()` in `start()`. It's a separate concern.
**Warning signs:** Confusion about why `initializeSchemaCache` doesn't call the gateway.

### Pitfall 4: Missing entity in comparison when PostgreSQL introspection fails
**What goes wrong:** If `IntrospectionService.introspectTable()` throws for one entity, the comparison loop breaks and that entity is omitted from the response.
**Why it happens:** Unhandled rejection in the `for...of` loop.
**How to avoid:** Wrap each introspection call in try/catch. Return an entity entry with all `postgresql` fields as `null` and `status: 'missing'` when introspection fails, rather than omitting it. Log the error.
**Warning signs:** Response has < 4 entities with no error indication.

### Pitfall 5: Column union — only iterating PostgreSQL columns misses extra compiled/sync columns
**What goes wrong:** The comparison logic iterates PostgreSQL columns as the authoritative set. Columns that exist in compiled/sync but NOT in PostgreSQL will be silently ignored.
**Why it happens:** PostgreSQL is defined as authoritative for "what exists" (D-08: `missing` = field in PostgreSQL absent elsewhere).
**How to avoid:** Per the locked decision D-08, `missing` status is only defined for "field exists in PostgreSQL but absent in compiled or sync." Do NOT add reverse-direction missing detection. The UI (Phase 27) handles the display. This is the correct behavior per the spec.
**Warning signs:** Impulse to add extra iterations for compiled-only or sync-only columns — resist it, it's out of scope.

### Pitfall 6: Registration order in app.ts
**What goes wrong:** New routes registered AFTER `setNotFoundHandler` won't be reachable via HTTP.
**Why it happens:** Fastify processes routes before the 404 handler, but the static file handler for `/` catches unknown routes as SPA fallback before the 404 handler sees them.
**How to avoid:** Register `registerSchemaComparisonRoutes(app)` alongside the other route registrations, before `setNotFoundHandler`.
**Warning signs:** All requests to new endpoints return 200 with `index.html` body.

---

## Code Examples

### Complete GET /api/schemas/compare handler skeleton
```typescript
// Source: pattern derived from existing schemas.ts route + locked decisions
app.get(
  '/api/schemas/compare',
  { preHandler: authenticate },
  async (_request, reply) => {
    const entities = getSyncEntities();
    const results: EntityComparison[] = [];

    for (const entity of entities) {
      let pgSchema: TableSchema | null = null;
      try {
        pgSchema = await IntrospectionService.introspectTable('public', entity);
      } catch (err) {
        logger.error({ entity, err }, 'Introspection failed for comparison');
      }

      const compiledSchema = getTableSchema(entity); // from shared/schemas/index.ts
      const syncSchema = syncSchemaStore.get(entity); // null if not reported
      const syncReported = syncSchemaStore.hasData();

      results.push(
        buildEntityComparison(entity, pgSchema, compiledSchema, syncSchema, syncReported)
      );
    }

    return results;
  }
);
```

### POST /api/schemas/report handler skeleton
```typescript
app.post(
  '/api/schemas/report',
  { preHandler: authenticate },
  async (request, reply) => {
    const parseResult = reportBodySchema.safeParse(request.body);
    if (!parseResult.success) {
      return reply.status(400).send({
        error: 'Invalid schema report body',
        code: 'VALIDATION_ERROR',
        details: parseResult.error.flatten(),
      });
    }

    syncSchemaStore.set(parseResult.data.schemas);

    logger.info(
      { entities: parseResult.data.schemas.map(s => s.entity) },
      'Sync schema snapshot stored'
    );

    return reply.status(200).send({ success: true });
  }
);
```

### Sync startup hook (in objetiva-sync/src/index.ts)
```typescript
// 3.5. Inicializar schema cache (para query validation) - existing
logger.info('Inicializando schema cache desde gateway...');
await initializeSchemaCache();

// NEW: Report schemas to gateway for 3-way comparison
try {
  const gatewayUrl = await getGatewayUrl();
  await reportSchemasToGateway(gatewayUrl);
} catch (err) {
  logger.warn({ err }, 'Schema report to gateway failed (non-blocking)');
}
```

---

## Environment Availability

Step 2.6: SKIPPED — this is a code-only change. No external tools or services beyond the existing gateway + sync setup. All dependencies (PostgreSQL, Node.js, Fastify) are already verified operational by previous phases.

---

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Vitest (existing) |
| Config file | `objetiva-sync-gateway/vitest.config.ts` |
| Quick run command | `cd objetiva-sync-gateway && npx vitest run tests/unit/` |
| Full suite command | `cd objetiva-sync-gateway && npx vitest run` |

### Phase Requirements → Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| SCHEMA-04 | POST /api/schemas/report stores snapshot, returns 200 | unit | `npx vitest run tests/unit/sync-schema-store.test.ts` | Wave 0 |
| SCHEMA-04 | POST /api/schemas/report requires JWT auth (401 without token) | integration | `npx vitest run tests/integration/schema-comparison.integration.test.ts` | Wave 0 |
| SCHEMA-04 | POST /api/schemas/report with invalid body returns 400 | integration | same file | Wave 0 |
| SCHEMA-02 | GET /api/schemas/compare returns all 4 entities | integration | same file | Wave 0 |
| SCHEMA-02 | GET /api/schemas/compare shows "not_reported" state when sync hasn't called report | unit | `npx vitest run tests/unit/schema-comparison.test.ts` | Wave 0 |
| SCHEMA-02 | aligned/mismatched/missing status computed correctly | unit | same file | Wave 0 |
| SCHEMA-02 | summary counts correct | unit | same file | Wave 0 |

### Sampling Rate
- **Per task commit:** `cd objetiva-sync-gateway && npx vitest run tests/unit/`
- **Per wave merge:** `cd objetiva-sync-gateway && npx vitest run`
- **Phase gate:** Full suite green before `/gsd:verify-work`

### Wave 0 Gaps
- [ ] `tests/unit/sync-schema-store.test.ts` — covers SCHEMA-04 (store set/get/reset/hasData)
- [ ] `tests/unit/schema-comparison.test.ts` — covers SCHEMA-02 (aligned, mismatched, missing, not_reported, summary)
- [ ] `tests/integration/schema-comparison.integration.test.ts` — covers SCHEMA-04 + SCHEMA-02 route-level (uses `buildApp()` + `app.inject()` like `pairing.integration.test.ts`)

---

## Open Questions

1. **Should `getGatewayUrl` be exported from `gateway-client.ts`?**
   - What we know: It is currently a private function (not exported). `schema-report-client.ts` on the sync side needs to know the gateway URL.
   - What's unclear: Whether exporting it introduces any coupling concern, or whether `schema-report-client.ts` should call `getConfig('REMOTE_API_URL')` directly.
   - Recommendation: Export `getGatewayUrl` from `gateway-client.ts` — it's an additive change, the function is already well-defined, and centralizing URL resolution is cleaner.

2. **How to handle `syncReported` flag for comparison status?**
   - What we know: D-05 says sync layer shows `"not_reported"` when sync hasn't connected. D-08 defines `"missing"` only for fields absent in compiled/sync when present in PG.
   - What's unclear: If sync hasn't reported, should a field where compiled = pg = aligned still show `"aligned"` or something else?
   - Recommendation: When `!syncReported`, treat the sync layer as "not participating." Fields should show `aligned` if `postgresql === compiled` (2-way alignment), with `sync: null` in the field row. The `sync_reported: false` flag on the entity tells Phase 27's UI that sync alignment is unknown. This is the least surprising behavior.

---

## Sources

### Primary (HIGH confidence)
- Direct codebase inspection — all claims verified against actual source files
  - `objetiva-sync-gateway/src/routes/schemas.ts` — route registration pattern
  - `objetiva-sync-gateway/src/services/schema-cache.ts` — in-memory store pattern
  - `objetiva-sync-gateway/src/services/introspection.ts` — IntrospectionService API
  - `objetiva-sync-gateway/src/middleware/auth.ts` — authenticate middleware shape
  - `objetiva-sync-gateway/src/config/entities.ts` — getSyncEntities()
  - `objetiva-sync-gateway/src/app.ts` — route registration and import pattern
  - `shared/schemas/index.ts` — tableSchemas map, getTableSchema()
  - `shared/schemas/generated/articulos.schema.ts` — TableSchemaMetadata concrete shape
  - `shared/types/schema-metadata.ts` — type definitions
  - `objetiva-sync/src/services/gateway-client.ts` — getJwtToken(), HTTP pattern
  - `objetiva-sync/src/api-client/articulos-client.ts` — fetch + JWT pattern
  - `objetiva-sync/src/index.ts` — startup sequence, schema cache init location
  - `objetiva-sync/src/services/schema-cache.ts` — initializeSchemaCache() is a no-op
  - `objetiva-sync-gateway/tests/integration/pairing.integration.test.ts` — test infrastructure pattern
  - `objetiva-sync-gateway/vitest.config.ts` — Vitest setup

---

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — all libraries already in use, verified from package.json and source files
- Architecture patterns: HIGH — all patterns derived directly from existing code in the same codebase
- Comparison logic: HIGH — locked decisions D-07 through D-10 are unambiguous; Open Question 2 is a minor edge case with a clear recommendation
- Pitfalls: HIGH — all identified from actual code inspection (type mismatch between two ColumnMetadata interfaces, private getGatewayUrl, no-op initializeSchemaCache)
- Test infrastructure: HIGH — existing test files confirm Vitest + `buildApp()` + `app.inject()` pattern

**Research date:** 2026-03-29
**Valid until:** 2026-04-29 (stable stack, no external dependencies)
