# Phase 1: Schema Introspection Foundation - Context

**Gathered:** 2026-01-26
**Status:** Ready for planning

<domain>
## Phase Boundary

Gateway service extracts complete PostgreSQL schema metadata (columns, types, nullability, constraints) for configurable sync entities and normalizes it into consistent JSON structure. This establishes the foundation for schema distribution and validation in later phases.

</domain>

<decisions>
## Implementation Decisions

### Introspection Scope & Depth
- **Metadata level:** Extended scope - capture columns, types, nullability, plus constraints (primary keys, unique, foreign keys), defaults, and check constraints
- **Entity scope:** Configurable entity list - make it easy to add/remove entities without code changes
- **Type detail:** Base type only - capture 'DECIMAL', 'array', 'jsonb' without precision/scale or array element types
- **Table metadata:** Include table and column comments from PostgreSQL (COMMENT ON)

### JSON Normalization Format
- **Structure:** Flat format - `{tableName, columns: [{name, type, nullable, ...}]}`
- **Field naming:** snake_case (PostgreSQL convention) - column_name, data_type, is_nullable, default_value
- **Type representation:** Simplified standard names - normalize to 'int', 'varchar', 'timestamp' instead of PostgreSQL verbosity
- **Introspection metadata:** Pure schema data only - no timestamps, database name, or schema version in output

### Error Handling & Reliability
- **Connection failures:** Retry with exponential backoff - 3 attempts with increasing delays (1s, 2s, 4s), then fail with clear error
- **Partial failures:** Return partial results with errors - successful entities + error details for failed ones, let caller decide handling
- **Error detail level:** Contextual messages - what failed, which entity, why - without stack traces
- **Logging:** Write introspection errors to gateway log system with severity levels

### Performance & Caching Strategy
- **Caching:** No caching - always query PostgreSQL fresh to ensure current schema state
- **Query execution:** Sequential queries - query entities one at a time to avoid overwhelming database connection pool
- **Safeguards:** Query timeout per entity (5 seconds maximum)
- **Metrics:** No performance tracking - keep introspection logic simple

### Claude's Discretion
- SQL query optimization approach for information_schema and pg_catalog
- Exact structure of constraint representation in JSON
- Log message formatting and severity assignment

</decisions>

<specifics>
## Specific Ideas

No specific requirements - open to standard PostgreSQL introspection approaches.

</specifics>

<deferred>
## Deferred Ideas

None - discussion stayed within phase scope.

</deferred>

---

*Phase: 01-schema-introspection-foundation*
*Context gathered: 2026-01-26*
