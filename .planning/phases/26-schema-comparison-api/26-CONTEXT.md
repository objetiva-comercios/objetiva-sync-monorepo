# Phase 26: Schema Comparison API - Context

**Gathered:** 2026-03-29
**Status:** Ready for planning

<domain>
## Phase Boundary

Gateway endpoints for 3-way schema comparison (PostgreSQL live vs gateway compiled vs sync-reported) and sync schema reporting. Delivers the API data layer that Phase 27's Schema Status Page will consume.

</domain>

<decisions>
## Implementation Decisions

### Schema Reporting Endpoint
- **D-01:** New route `POST /api/schemas/report` receives all 4 entity schemas in a single request body. Gateway overwrites its stored snapshot entirely.
- **D-02:** Sync calls the report endpoint once on startup, before the first sync cycle. Gateway always has a snapshot if sync has connected at least once.
- **D-03:** Endpoint uses JWT auth via existing `authenticate` middleware, consistent with all other `/api/*` routes.

### In-Memory Storage
- **D-04:** Simple `Map<entity, schema>` overwritten on each POST. No TTL, no expiration. Lost on restart, repopulated when sync reconnects.
- **D-05:** When sync hasn't reported yet, the comparison API shows sync layer as `"not_reported"` status — not omitted, not shown as matching.

### Comparison Response Structure
- **D-06:** Single endpoint `GET /api/schemas/compare` returns comparison for all 4 entities in one response (per success criteria #3).
- **D-07:** Per-field structure with 3 layers: each field row has `{ column_name, status, postgresql, compiled, sync }` where `sync` can be `null` if not reported.
- **D-08:** Status values: `"aligned"` (all present layers match), `"mismatched"` (present layers differ), `"missing"` (field exists in PostgreSQL but absent in compiled or sync).
- **D-09:** Comparison attributes for alignment: `data_type` + `is_nullable` only. Default values and comments are informational, not compared for alignment status.
- **D-10:** Each entity includes a summary object: `{ aligned: N, mismatched: N, missing: N }`.

### Compiled Schema Source
- **D-11:** Gateway reads compiled schemas by importing the generated `TableSchemaMetadata` exports from `shared/schemas/generated/*.schema.ts`. These are the compiled truth — no Prisma DMMF derivation.

### Claude's Discretion
- Comparison service internal architecture (class vs functions)
- Exact route registration pattern (follow existing schemas.ts as template)
- Sync-side client code for calling the report endpoint (follow existing API client patterns)
- Whether to add the report endpoint to the existing `schemas.ts` routes file or create a new route file

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Existing Schema Infrastructure
- `objetiva-sync-gateway/src/routes/schemas.ts` -- Current `/api/schemas` route, template for new routes
- `objetiva-sync-gateway/src/types/schema.ts` -- `ColumnMetadata`, `ConstraintMetadata`, `TableSchema` interfaces
- `objetiva-sync-gateway/src/schemas/introspection.ts` -- Zod validation schemas for introspection
- `objetiva-sync-gateway/src/services/introspection.ts` -- `IntrospectionService` for PostgreSQL live queries
- `objetiva-sync-gateway/src/services/schema-cache.ts` -- Existing in-memory cache pattern
- `objetiva-sync-gateway/src/config/entities.ts` -- `getSyncEntities()` returns the 4 entity names

### Shared Types & Generated Schemas
- `shared/types/schema-metadata.ts` -- `TableSchemaMetadata`, `ColumnMetadata` shared types (single source of truth)
- `shared/schemas/generated/articulos.schema.ts` -- Example generated schema with `TableSchemaMetadata` export
- `shared/schemas/index.ts` -- Barrel export for all generated schemas

### Auth & Middleware
- `objetiva-sync-gateway/src/middleware/auth.ts` -- `authenticate` middleware for JWT validation

### Requirements
- `.planning/REQUIREMENTS.md` -- SCHEMA-02 (3-way comparison) and SCHEMA-04 (sync reports schemas) define acceptance criteria

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `IntrospectionService.introspectTable()`: Already fetches PostgreSQL live schema per entity
- `schemaCache`: In-memory cache with get/set pattern — can inspire sync-reported storage
- `authenticate` middleware: JWT auth preHandler, used on all API routes
- `getSyncEntities()`: Returns the 4 entity names, centralizes entity list
- `TableSchemaMetadata` in `shared/types/schema-metadata.ts`: Already has the exact shape needed for compiled schemas

### Established Patterns
- Routes registered via `registerXxxRoutes(app: FastifyInstance)` async functions
- Routes use `{ preHandler: authenticate }` for JWT auth
- API responses use camelCase or snake_case matching PostgreSQL conventions
- Error responses follow `{ error: string, code: string, details?: object }` pattern

### Integration Points
- New routes register in `objetiva-sync-gateway/src/app.ts`
- Sync client code lives in `objetiva-sync/src/api-client/`
- Generated schemas imported from `shared/schemas/generated/`

</code_context>

<specifics>
## Specific Ideas

No specific requirements -- open to standard approaches

</specifics>

<deferred>
## Deferred Ideas

None -- discussion stayed within phase scope

</deferred>

---

*Phase: 26-schema-comparison-api*
*Context gathered: 2026-03-29*
