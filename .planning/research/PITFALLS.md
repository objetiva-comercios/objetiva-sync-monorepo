# PITFALLS: Schema-Driven Validation Systems

**Research Focus**: Common mistakes when adding schema introspection and validation to existing TypeScript sync systems

**Project Context**: PostgreSQL → Prisma/Zod codegen → Query validation in distributed environment

---

## 1. CODEGEN PITFALLS

### 1.1 Stale Generated Code After Schema Changes

**Warning Signs:**
- Runtime type errors despite "valid" TypeScript compilation
- Prisma Client methods returning unexpected column types
- Zod validation passing but database rejecting values
- CI passes but production fails with schema mismatches
- Generated files have older timestamps than schema files

**Prevention Strategy:**
- **Never commit generated code to version control** (Prisma client, Zod schemas)
- Add pre-commit hooks that verify generated code is fresh
- Implement `postinstall` script that regenerates all schemas
- Add CI step that fails if generated code differs from fresh generation
- Use file watchers in development to auto-regenerate on schema changes
- Include generation timestamp comments in generated files for auditing

**Phase Mapping:**
- **Phase 1-2**: Establish codegen pipeline with staleness detection
- **Phase 3**: Add automated regeneration triggers
- **Testing Phase**: Verify staleness detection catches schema drift

**Critical Mistake:**
Treating generated Prisma/Zod files as "source code" rather than build artifacts. They must be regenerated atomically with schema changes.

---

### 1.2 Type Mismatches Between Layers

**Warning Signs:**
- Prisma types differ from Zod schemas for same table
- Database allows NULL but generated types are non-nullable
- Enum values in DB don't match TypeScript string literals
- Optional fields in Zod conflict with required fields in Prisma
- Date/timestamp types inconsistent across layers

**Prevention Strategy:**
- **Single source of truth**: Introspect from PostgreSQL, never manual schemas
- Use Prisma's `prisma db pull` instead of manually editing `schema.prisma`
- Generate Zod from Prisma schema using `zod-prisma-types` or similar
- Never maintain parallel schema definitions
- Add integration tests that compare actual DB schema to generated types
- Use strict TypeScript modes: `strictNullChecks`, `strictPropertyInitialization`

**Phase Mapping:**
- **Phase 1**: Establish PostgreSQL → Prisma → Zod generation chain
- **Phase 2**: Add cross-layer type consistency tests
- **Phase 4**: Implement continuous validation between layers

**Critical Mistake:**
Manually maintaining Zod schemas separately from Prisma. This creates divergence over time as developers update one but forget the other.

---

### 1.3 Ignoring Database Constraints During Generation

**Warning Signs:**
- Generated schemas allow invalid data that DB rejects
- Foreign key constraints missing from type definitions
- Unique constraints not reflected in validation logic
- Check constraints ignored (e.g., `age > 0` not in Zod schema)
- Partial indexes causing unexpected validation failures

**Prevention Strategy:**
- Configure Prisma introspection to capture all constraint types
- Extend Zod generation to include DB-level constraints
- Map PostgreSQL CHECK constraints to Zod refinements
- Document constraints that can't be represented in types
- Add runtime validation layer for constraints types can't capture
- Use DB comments to annotate special validation rules

**Phase Mapping:**
- **Phase 2**: Capture basic constraints (NOT NULL, UNIQUE, FK)
- **Phase 3**: Extend to complex constraints (CHECK, partial indexes)
- **Later**: Runtime enforcement of unrepresentable constraints

**Critical Mistake:**
Assuming TypeScript types provide the same guarantees as database constraints. Types are erased at runtime; constraints are enforced permanently.

---

## 2. INTROSPECTION RELIABILITY

### 2.1 Connection Failures in Distributed Systems

**Warning Signs:**
- Introspection works locally but fails in CI/staging
- Intermittent "connection refused" errors during schema regeneration
- Network partitions causing stale schema snapshots
- VPN/firewall blocking gateway → PostgreSQL connection
- Connection pool exhaustion during introspection

**Prevention Strategy:**
- **Never introspect in production builds** - use cached schema snapshot
- Implement retry logic with exponential backoff for introspection
- Add connection health checks before introspection
- Use service discovery for PostgreSQL host (not hardcoded IPs)
- Configure connection timeouts appropriate for network latency
- Implement fallback to last-known-good schema snapshot
- Log introspection failures with full connection diagnostics

**Phase Mapping:**
- **Phase 1**: Basic connection with retry logic
- **Phase 2**: Health checks and fallback mechanisms
- **Phase 5**: Production-ready schema caching

**Critical Mistake:**
Introspecting synchronously during application startup in production. This creates a hard dependency on PostgreSQL availability for your sync service to boot.

---

### 2.2 Permission and Access Issues

**Warning Signs:**
- Introspection succeeds but misses tables (insufficient grants)
- System tables inaccessible causing incomplete schema
- Row-level security policies interfering with introspection
- Different schema views for different database users
- Missing columns due to column-level permissions

**Prevention Strategy:**
- Create dedicated introspection user with `USAGE` on all schemas
- Grant `SELECT` on `information_schema` and `pg_catalog`
- Test introspection with minimum required permissions
- Document exact GRANT statements needed for introspection
- Add validation that compares introspected schema to expected baseline
- Detect "partial introspection" by tracking table/column counts
- Use PostgreSQL roles consistently across environments

**Phase Mapping:**
- **Phase 1**: Define introspection user permissions
- **Phase 2**: Add permission validation tests
- **Phase 3**: Detect and alert on partial introspection

**Critical Mistake:**
Using a superuser for introspection in development but a restricted user in production, causing schema differences between environments.

---

### 2.3 Schema Introspection Race Conditions

**Warning Signs:**
- Introspection captures mid-migration state
- Generated code references tables that don't exist yet
- Foreign keys point to columns being renamed
- Transactions not visible to introspection queries
- Multi-step migrations causing inconsistent snapshots

**Prevention Strategy:**
- **Lock schema during introspection** or use snapshot isolation
- Never introspect during active migrations
- Use advisory locks to prevent concurrent introspection
- Implement introspection "readiness" check (wait for migrations)
- Tag schema versions to correlate introspection with migration state
- Use PostgreSQL's transaction isolation to get consistent snapshot
- Add validation that schema is "stable" before introspection

**Phase Mapping:**
- **Phase 2**: Basic migration/introspection coordination
- **Phase 3**: Advisory locks and readiness checks
- **Phase 4**: Full transaction isolation for introspection

**Critical Mistake:**
Running `prisma db pull` while a migration is in progress, capturing a half-migrated schema that represents neither the old nor new state.

---

## 3. QUERY VALIDATION EDGE CASES

### 3.1 Dynamic SQL Not Analyzable at Save Time

**Warning Signs:**
- Queries built from runtime variables fail validation
- String concatenation creates unparsable SQL
- Table/column names selected from configuration
- Conditional WHERE clauses based on user input
- Queries using `format()` or template strings with dynamic identifiers

**Prevention Strategy:**
- **Distinguish static vs dynamic queries** with clear taxonomy
- Validate static queries at save time, dynamic queries at runtime
- Use parameterized queries exclusively for values (never identifiers)
- Whitelist allowed dynamic table/column names from schema
- Create query builder that's both type-safe and validatable
- Add runtime validation layer for unavoidably dynamic queries
- Log and monitor dynamic query patterns for anomalies

**Phase Mapping:**
- **Phase 2**: Classify queries as static/dynamic
- **Phase 3**: Validate static queries at save time
- **Phase 4**: Runtime validation for dynamic queries

**Critical Mistake:**
Attempting to validate all SQL at save time without distinguishing between truly static queries and those with runtime-dependent structure.

---

### 3.2 Parameterized Query Type Mismatches

**Warning Signs:**
- Query validation passes but runtime fails with type errors
- Prepared statement parameter types don't match placeholders
- `$1` expects `integer` but receives `string`
- Array parameters misinterpreted as single values
- NULL handling inconsistent between validation and execution

**Prevention Strategy:**
- Parse parameter placeholders (`$1`, `$2`) and infer expected types
- Cross-reference placeholder types with Prisma/Zod schemas
- Validate parameter count matches placeholder count
- Use typed query builders (e.g., `Kysely`, `Zapatos`) instead of raw SQL
- Add integration tests that execute validated queries
- Map PostgreSQL types to TypeScript types explicitly
- Handle NULL/undefined consistently across validation and execution

**Phase Mapping:**
- **Phase 3**: Parameter type inference and validation
- **Phase 4**: Integration testing of validated queries
- **Phase 5**: Typed query builder integration

**Critical Mistake:**
Validating query structure but ignoring parameter types, allowing type mismatches to slip through to runtime.

---

### 3.3 Schema Version Skew in Distributed System

**Warning Signs:**
- Sync service validates against stale schema while gateway uses new schema
- Queries valid on sync server fail on PostgreSQL
- Column renames causing "column does not exist" errors
- Type changes causing subtle data corruption
- Cache serving outdated schema to validation layer

**Prevention Strategy:**
- **Version schema snapshots** with monotonic version numbers
- Sync service must validate against gateway's current schema version
- Implement schema version handshake between services
- Add schema version to query validation cache keys
- Invalidate validation cache on schema version mismatch
- Use distributed locking for schema updates across services
- Monitor schema version lag between services

**Phase Mapping:**
- **Phase 2**: Schema versioning infrastructure
- **Phase 3**: Cross-service version handshake
- **Phase 4**: Automatic cache invalidation on version change
- **Phase 5**: Monitoring and alerting for version skew

**Critical Mistake:**
Deploying schema changes to gateway/PostgreSQL without coordinated schema refresh on sync service, creating validation against phantom schema.

---

## 4. SCHEMA CACHING STRATEGIES

### 4.1 Naive Cache Invalidation

**Warning Signs:**
- Schema changes take minutes/hours to propagate
- Queries validated against stale cache fail in production
- Cache invalidation storms during deployments
- No way to force cache refresh without restart
- Different services have different cached schema versions

**Prevention Strategy:**
- **Use event-driven cache invalidation** (not TTL alone)
- Implement schema change events via PostgreSQL NOTIFY/LISTEN
- Add admin endpoint to force schema cache refresh
- Use versioned cache keys (include schema hash in key)
- Implement multi-tier caching (memory + Redis) with consistent invalidation
- Add cache warmup during deployment before traffic
- Monitor cache hit rates and staleness metrics

**Phase Mapping:**
- **Phase 3**: Basic caching with TTL
- **Phase 4**: Event-driven invalidation
- **Phase 5**: Multi-tier caching with warmup

**Critical Mistake:**
Using only TTL-based caching, forcing you to choose between stale cache (long TTL) or excessive introspection (short TTL).

---

### 4.2 Cold Cache Performance Impact

**Warning Signs:**
- First query after restart takes 10+ seconds
- Cache miss causes blocking introspection
- Thundering herd when cache expires under load
- Schema introspection overwhelming PostgreSQL
- User-facing requests timing out during cache refresh

**Prevention Strategy:**
- **Pre-warm cache during application startup** (not on first request)
- Use background refresh before TTL expires (not on expiry)
- Implement request coalescing for concurrent cache misses
- Serve stale cache during background refresh
- Add circuit breaker for introspection failures
- Use async introspection with fallback to last known good
- Monitor p99 latency for cache misses

**Phase Mapping:**
- **Phase 3**: Startup cache warming
- **Phase 4**: Background refresh and request coalescing
- **Phase 5**: Circuit breakers and stale-while-revalidate

**Critical Mistake:**
Triggering synchronous introspection on cache miss in user request path, causing request timeouts when cache is cold.

---

### 4.3 Memory Bloat from Cached Schemas

**Warning Signs:**
- Memory usage grows unbounded with schema size
- Large PostgreSQL databases (1000+ tables) causing OOM
- Schema cache consuming gigabytes of memory
- Garbage collection pauses correlating with schema refreshes
- Multiple cached representations of same schema (Prisma, Zod, custom)

**Prevention Strategy:**
- **Cache only necessary schema subset** (not entire database)
- Lazy-load schema for tables/columns actually queried
- Share schema representation across layers (avoid duplication)
- Use schema compression for large databases
- Implement LRU eviction for rarely-used table schemas
- Monitor memory usage per cached schema entry
- Consider external cache (Redis) for very large schemas

**Phase Mapping:**
- **Phase 3**: Measure baseline schema memory usage
- **Phase 4**: Subset caching and lazy loading
- **Phase 5**: External caching for large schemas

**Critical Mistake:**
Caching the entire PostgreSQL schema (all databases, all tables, all columns) when your sync system only uses a small subset.

---

## 5. DISTRIBUTED SYSTEM SPECIFIC PITFALLS

### 5.1 Network Partition Handling

**Warning Signs:**
- Sync service can't reach gateway but continues operating
- Split-brain scenarios with different schema views
- Queries validated against unreachable database
- No degradation strategy when PostgreSQL unavailable
- Silent failures masking connectivity issues

**Prevention Strategy:**
- Implement health checks with circuit breaker pattern
- Fall back to last-known-good schema snapshot during partition
- Add "staleness acceptable" flag for validation results
- Fail fast and loud when schema unreachable (don't silently continue)
- Use distributed consensus for schema version (etcd, Consul)
- Monitor network latency between sync and gateway
- Add graceful degradation mode with reduced validation

**Phase Mapping:**
- **Phase 4**: Circuit breakers and health checks
- **Phase 5**: Graceful degradation and consensus

**Critical Mistake:**
Continuing to validate queries against a cached schema indefinitely during network partition, not detecting drift from actual database state.

---

### 5.2 Schema Migration Coordination

**Warning Signs:**
- Migrations run on PostgreSQL but sync service unaware
- Zero-downtime deployments break due to schema changes
- Backward-incompatible changes deployed without coordination
- Sync service using old schema while new migrations applied
- No rollback strategy for failed schema migrations

**Prevention Strategy:**
- **Coordinate migrations across all services** using deployment orchestration
- Use expand-contract pattern for breaking changes (add new, migrate, remove old)
- Implement schema version compatibility matrix
- Add pre-migration validation (can all services handle new schema?)
- Deploy schema changes with feature flags for gradual rollout
- Maintain backward compatibility for N-1 schema version
- Add automated rollback triggers for failed migrations

**Phase Mapping:**
- **Phase 4**: Basic migration coordination
- **Phase 5**: Expand-contract pattern and compatibility matrix
- **Later**: Automated rollback and gradual rollout

**Critical Mistake:**
Running database migrations independently of service deployments, creating windows where services are incompatible with schema state.

---

## 6. TESTING AND OBSERVABILITY PITFALLS

### 6.1 Inadequate Introspection Testing

**Warning Signs:**
- Schema introspection only tested in development
- No tests for partial introspection failures
- Edge cases (empty schemas, system tables) untested
- Performance degradation undetected in large databases
- No validation that introspection is complete/accurate

**Prevention Strategy:**
- Create test databases with edge cases (empty, huge, unusual types)
- Test introspection with various permission levels
- Add snapshot tests for introspected schema consistency
- Benchmark introspection performance at scale
- Test connection failure scenarios with network fault injection
- Validate introspection completeness (compare table counts, column counts)
- Add integration tests for full codegen pipeline

**Phase Mapping:**
- **Phase 2**: Basic introspection tests
- **Phase 3**: Edge case and permission tests
- **Phase 4**: Performance and fault injection tests

**Critical Mistake:**
Testing introspection only against a small development database, missing performance and edge case issues that appear in production.

---

### 6.2 Missing Observability for Schema Operations

**Warning Signs:**
- No visibility into when schema introspection occurs
- Cache hit/miss rates unknown
- Schema version drift between services undetected
- Query validation failures not logged
- Performance regressions in validation invisible

**Prevention Strategy:**
- Add structured logging for all schema operations (introspect, cache, validate)
- Emit metrics: introspection duration, cache hit rate, validation latency
- Track schema version across services with distributed tracing
- Log validation failures with full query context
- Add alerting for schema version skew
- Monitor database connection health from sync service
- Create dashboards for schema operation health

**Phase Mapping:**
- **Phase 3**: Basic logging and metrics
- **Phase 4**: Distributed tracing and alerting
- **Phase 5**: Comprehensive dashboards

**Critical Mistake:**
Treating schema operations as "plumbing" without observability, making production issues impossible to diagnose.

---

## SUMMARY: Top 5 Critical Mistakes to Avoid

1. **Committing Generated Code**: Treat Prisma/Zod outputs as build artifacts, not source
2. **Synchronous Introspection in Request Path**: Pre-warm caches, use background refresh
3. **Ignoring Network Partitions**: Implement circuit breakers and graceful degradation
4. **Uncoordinated Schema Migrations**: Deploy schema changes with service coordination
5. **Validating Dynamic SQL Statically**: Classify queries and validate appropriately

---

## Phase Mapping Quick Reference

| Pitfall Area | Phase 1-2 | Phase 3 | Phase 4 | Phase 5 |
|--------------|-----------|---------|---------|---------|
| **Codegen** | Pipeline setup, staleness detection | Auto-regeneration | Cross-layer testing | Continuous validation |
| **Introspection** | Connection + retry | Permissions + health | Migration coordination | Production caching |
| **Validation** | Static query classification | Save-time validation | Runtime dynamic validation | Typed builders |
| **Caching** | Basic TTL | Event-driven invalidation | Multi-tier + warmup | External cache + monitoring |
| **Distributed** | Basic connectivity | Schema versioning | Circuit breakers | Consensus + degradation |
| **Testing** | Basic introspection tests | Edge cases + permissions | Fault injection | Full pipeline tests |

---

**Document Version**: 1.0
**Last Updated**: 2026-01-26
**Research Type**: Project Research - Pitfalls Dimension
