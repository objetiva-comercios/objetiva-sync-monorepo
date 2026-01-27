# Phase 2: Schema Distribution Endpoint - Context

**Gathered:** 2026-01-27
**Status:** Ready for planning

<domain>
## Phase Boundary

HTTP API endpoint that exposes PostgreSQL schema metadata to remote sync service. Gateway serves schema introspection results (from Phase 1) via authenticated REST API. Remote sync service running on different server fetches current schema metadata over HTTP.

</domain>

<decisions>
## Implementation Decisions

### API structure
- Single endpoint pattern: `GET /api/schemas/:entity` only (no bulk retrieval)
- Entity name validated against configured SYNC_ENTITIES list
- Missing/invalid entity returns 404 with error message: "Entity not found: xyz"
- No query parameter filtering - always return complete schema for requested entity

### Response format
- Direct schema object as response body (no wrapper keys like `data` or `schema`)
- Structure: `{ entity: 'articulos', columns: [...], constraints: [...] }`
- Include constraint information: primary keys, foreign keys, unique constraints
- Column types use normalized format from Phase 1 (varchar→string, decimal→number, jsonb→json)
- Error responses use detailed structure: `{ error: 'message', code: 'DB_CONNECTION_FAILED', details: {...} }`

### Caching strategy
- 1-hour TTL as specified in roadmap success criteria
- Cache implementation details left to Claude's discretion

### Authentication
- JWT authentication required as specified in roadmap
- 401 responses for unauthorized requests
- Implementation approach left to Claude's discretion

### Claude's Discretion
- Cache implementation mechanism (in-memory, Redis, etc.)
- Cache invalidation triggers beyond TTL
- JWT validation approach and token handling
- Rate limiting strategy
- CORS policy configuration
- HTTP response headers (cache-control, etc.)

</decisions>

<specifics>
## Specific Ideas

No specific requirements — open to standard approaches.

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope.

</deferred>

---

*Phase: 02-schema-distribution-endpoint*
*Context gathered: 2026-01-27*
