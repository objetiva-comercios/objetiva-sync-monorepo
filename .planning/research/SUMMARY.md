# Project Research Summary

**Project:** Schema-Driven Sync Control System
**Domain:** PostgreSQL Schema Introspection & TypeScript Codegen for Data Synchronization
**Researched:** 2026-01-26
**Confidence:** HIGH

## Executive Summary

This project adds schema introspection, validation, and code generation capabilities to an existing TypeScript-based ERP synchronization system running in a distributed environment (separate sync and gateway servers). The research reveals a clear 2025 standard: **Prisma as the introspection engine and schema source of truth**, **zod-prisma-types for automated validator generation**, and **schema-as-a-service via HTTP endpoint** to bridge the distributed architecture.

The core value proposition is establishing PostgreSQL as the ultimate source of truth, with automated tooling propagating schema changes through Prisma Client regeneration, Zod validator updates, and TypeScript type recompilation. This eliminates the primary pain point: schema drift causing silent validation failures and query errors. The recommended architecture consists of four layered components: (1) Schema Introspection Layer querying PostgreSQL metadata, (2) Schema Distribution Endpoint exposing metadata via authenticated HTTP API, (3) Code Generation Pipeline transforming metadata into type-safe artifacts, and (4) Runtime Validation Layer enforcing contracts during sync operations.

The critical risk is **schema version skew between distributed services**, where the sync application validates against a stale cached schema while the gateway operates on an updated schema. Mitigation requires schema versioning, cache invalidation events, and coordinated deployment patterns. Secondary risks include treating generated code as source (should be build artifacts), synchronous introspection in request paths (pre-warm caches instead), and attempting to validate dynamically-constructed SQL (classify and handle separately). The research has high confidence due to alignment with proven production tooling (Prisma 5.22+, Zod 3.23+) and established patterns from similar distributed systems.

## Key Findings

### Recommended Stack

The 2025 stack for schema-driven TypeScript systems centers on Prisma for introspection and ORM, with Zod for runtime validation. PostgreSQL should be the single source of truth, driving all downstream code generation.

**Core technologies:**
- **Prisma 5.22+**: Primary introspection tool (`prisma db pull`), handles PostgreSQL edge cases, already integrated in gateway, generates TypeScript types via `@prisma/client`
- **zod-prisma-types 3.1.8+**: Automated Zod schema generation from Prisma models, maintains consistency across validation layers, handles complex types (Decimal, DateTime, JSON)
- **Zod 3.23+**: Runtime validation framework (already in stack), provides type-safe parsing with detailed error messages
- **Kysely 0.27+ (optional)**: Type-safe SQL query builder for complex queries, direct PostgreSQL introspection via kysely-codegen, complement to Prisma for SQL-heavy operations
- **Prisma Migrate Diff**: Built-in drift detection comparing schema.prisma against live database, generates migration SQL, essential for CI/CD validation

**Why Prisma over alternatives:**
- Native PostgreSQL support with battle-tested introspection
- Already integrated (gateway uses Prisma 5.22.0)
- Bidirectional workflow (introspection and migrations)
- Rich type mapping including enums, arrays, jsonb, composite types

**Critical workflow:** PostgreSQL → `prisma db pull` → `prisma generate` (updates client + Zod) → TypeScript compilation catches breaking changes

### Expected Features

Research identified 12 core features across table stakes, differentiators, and anti-features. The MVP focuses on solving "schema drift breaks queries without warning."

**Must have (table stakes):**
- **PostgreSQL Schema Introspection** — foundation for all features, read tables/columns/constraints/relationships
- **SQL Query Validation Against Schema** — validate queries at save/runtime, detect missing columns and type mismatches
- **Zod Schema Code Generation** — auto-generate validators from PostgreSQL types, ensure validation matches database
- **Prisma Schema Code Generation** — auto-generate ORM schema from PostgreSQL, maintain Prisma Client consistency
- **TypeScript Type Generation** — generate interfaces/types from tables, enable compile-time type safety

**Should have (differentiators):**
- **Schema Drift Detection** — proactive detection of schema changes before failures occur, compare snapshots
- **Field-Level Error Reporting** — precise validation errors with suggestions (e.g., "Did you mean customer_id?")
- **Schema Change Impact Analysis** — identify which queries break from schema changes, migration checklist generation
- **Incremental Codegen with Change Tracking** — regenerate only affected code, preserve custom modifications
- **Multi-Schema/Multi-Database Support** — handle enterprise ERP patterns with multiple PostgreSQL schemas
- **Custom Type Mapping Configuration** — override default type mappings, add custom validators for specific columns
- **Schema Documentation Generation** — auto-generate docs from schema including ERDs and constraint descriptions

**Defer (v2+ / anti-features):**
- **Automatic Query Rewriting** — high risk of silent correctness bugs, prefer explicit failure over silent fixes
- **Real-Time Schema Synchronization** — schema changes should be deliberate, not reactive polling
- **Automatic Migration Generation** — database migrations too risky for automation, use existing tools (Prisma Migrate)
- **Schema Rollback/Time Travel** — adds complexity, use database-level backups instead
- **Cross-Database Schema Unification** — out of scope for PostgreSQL-specific system
- **Visual Schema Editor** — sync system should consume schema, not author it
- **Embedded SQL Query Builder** — users already write SQL, validation is goal not construction

### Architecture Approach

The architecture establishes PostgreSQL as the authoritative source of truth and propagates structural metadata through automated tooling. Four primary components form a layered validation pipeline suitable for distributed deployment.

**Major components:**

1. **Schema Introspection Layer (Gateway)** — Queries PostgreSQL information_schema and pg_catalog, extracts table/column metadata including constraints and relationships, formats as normalized JSON schema object, uses Prisma's introspection utilities with fallback to direct queries

2. **Schema Distribution Endpoint (Gateway HTTP API)** — Exposes `GET /api/schemas` with JWT authentication, returns JSON schema metadata (tables, columns, types, constraints), implements caching (in-memory Map with TTL), supports entity-specific queries (`/api/schemas/:entity`), consumed by sync query validator and CLI tools

3. **Code Generation Pipeline (Gateway CLI)** — CLI command `regenerate-schemas` fetches schema metadata, generates/updates `prisma/schema.prisma`, runs `prisma generate` to update @prisma/client, generates Zod schemas using zod-prisma-types, writes to shared/schemas directory, provides diff summary for review before commit

4. **Runtime Validation Layer (Distributed)** — Sync application validates query results against schemas from gateway endpoint, caches schemas locally with TTL, detects field mismatches (missing, extra, type errors), Gateway validates incoming batches using generated Zod schemas, blocks invalid data with detailed error messages

**Data flow:** PostgreSQL metadata → Introspection Service → HTTP Schema Endpoint → CLI Regeneration (updates Prisma/Zod) + Sync Query Validator (runtime checks) → Type-safe persistence

**Key patterns:**
- Single source of truth (PostgreSQL)
- Generated artifacts as build outputs (not source)
- Schema versioning to prevent distributed skew
- Multi-tier caching (in-memory + optional Redis)
- Event-driven cache invalidation (not just TTL)

### Critical Pitfalls

Research identified 18 pitfalls across 6 categories. Top 5 most critical for this distributed system:

1. **Stale Generated Code After Schema Changes** — Runtime type errors despite "valid" TypeScript compilation, Prisma Client methods returning unexpected types. **Avoid:** Never commit generated code to version control, add pre-commit hooks verifying freshness, implement postinstall regeneration, add CI staleness checks, treat generated files as build artifacts not source code.

2. **Schema Version Skew in Distributed System** — Sync service validates against stale schema while gateway uses new schema, queries valid on sync fail on PostgreSQL, column renames causing "column does not exist" errors. **Avoid:** Version schema snapshots with monotonic numbers, implement schema version handshake between services, invalidate cache on version mismatch, monitor schema version lag, coordinate schema updates across services.

3. **Synchronous Introspection in Request Path** — First query after restart takes 10+ seconds, cache miss causes blocking introspection, user-facing requests timeout during cache refresh. **Avoid:** Pre-warm cache during application startup (not on first request), use background refresh before TTL expires, implement request coalescing for concurrent cache misses, serve stale cache during refresh, add circuit breaker for introspection failures.

4. **Uncoordinated Schema Migrations** — Migrations run on PostgreSQL but sync service unaware, zero-downtime deployments break, backward-incompatible changes deployed without coordination. **Avoid:** Use expand-contract pattern for breaking changes (add new, migrate, remove old), implement schema version compatibility matrix, deploy with feature flags for gradual rollout, maintain backward compatibility for N-1 version.

5. **Dynamic SQL Not Analyzable at Save Time** — Queries built from runtime variables fail validation, string concatenation creates unparsable SQL, table/column names from configuration. **Avoid:** Distinguish static vs dynamic queries with clear taxonomy, validate static queries at save time and dynamic at runtime, use parameterized queries exclusively for values, whitelist allowed dynamic identifiers from schema.

**Additional critical pitfalls:**
- Type mismatches between layers (Prisma vs Zod vs PostgreSQL)
- Connection failures in distributed systems (no retry logic)
- Schema introspection race conditions during migrations
- Naive cache invalidation (TTL-only without events)
- Missing observability for schema operations

## Implications for Roadmap

Based on research, the project should be structured in 5 phases following the natural dependency chain: introspection foundation → schema distribution → code generation → enhanced validation → integration hardening. This ordering prevents rework and ensures each phase delivers independently testable value.

### Phase 1: Schema Introspection Foundation
**Rationale:** All downstream components depend on ability to read PostgreSQL metadata programmatically. Must establish before building HTTP endpoint or codegen pipeline.

**Delivers:** Schema introspection service that queries PostgreSQL information_schema and pg_catalog, normalizes metadata into JSON format, handles PostgreSQL types/constraints/relationships, includes unit tests and error handling.

**Addresses:**
- F1: PostgreSQL Schema Introspection (table stakes from FEATURES.md)
- Establishes PostgreSQL as source of truth
- Foundation for all validation and codegen

**Avoids:**
- Pitfall: Connection failures (implement retry logic with exponential backoff)
- Pitfall: Permission issues (define introspection user with minimal grants)
- Pitfall: Schema introspection race conditions (use snapshot isolation)

**Stack elements:** Prisma 5.22+ for introspection utilities, direct PostgreSQL queries for metadata

**Research needs:** Standard implementation patterns, well-documented

### Phase 2: Schema Distribution Endpoint
**Rationale:** Sync service runs on separate physical server from gateway, requires HTTP access to schema metadata. Enables distributed validation architecture without shared database access.

**Delivers:** `GET /api/schemas` endpoint with JWT authentication, JSON schema metadata responses (tables, columns, types, constraints), entity-specific queries (`/api/schemas/:entity`), in-memory caching with TTL, integration with existing auth middleware.

**Addresses:**
- Schema distribution layer (architecture component)
- Enables remote schema queries for sync validator
- Provides versioned schema snapshots

**Avoids:**
- Pitfall: Cold cache performance impact (pre-warm during startup)
- Pitfall: Schema endpoint security (JWT auth, rate limiting, audit logging)
- Pitfall: Cache staleness (implement TTL-based refresh)

**Stack elements:** Fastify route handlers, existing JWT middleware

**Research needs:** Standard REST patterns for metadata endpoints

### Phase 3: CLI Introspection & Code Regeneration
**Rationale:** Manual schema regeneration provides safety and control. Developer reviews generated code changes before committing, preventing accidental breaking changes. Build-time codegen eliminates runtime overhead.

**Delivers:** CLI command `npm run regenerate-schemas`, Prisma schema generator (updates schema.prisma), Zod schema generator (creates shared/schemas/*.ts), runs `prisma generate` to update @prisma/client, diff visualization showing changes, file writing with TypeScript validation.

**Addresses:**
- F3: Zod Schema Code Generation (table stakes)
- F4: Prisma Schema Code Generation (table stakes)
- F5: TypeScript Type Generation (table stakes)
- F9: Incremental Codegen with Change Tracking (differentiator)

**Avoids:**
- Pitfall: Stale generated code (add staleness detection to CI)
- Pitfall: Type mismatches between layers (single source of truth: PostgreSQL → Prisma → Zod)
- Pitfall: Code generation failures (dry-run mode, syntax validation)

**Stack elements:** zod-prisma-types 3.1.8+, Prisma CLI, Node.js file system APIs

**Research needs:** MODERATE - zod-prisma-types integration patterns, custom type mapping configuration

### Phase 4: Enhanced Query Validation
**Rationale:** This phase delivers the core value proposition: preventing schema drift from breaking queries. Depends on schema endpoint (runtime metadata) and generated Zod schemas (validation logic).

**Delivers:** Enhanced QueryValidator class in sync application, schema API client for fetching metadata from gateway, local schema caching with TTL, structure validation (field existence, type matching), integration with existing Zod validation, detailed error messages with field-level reporting.

**Addresses:**
- F2: SQL Query Validation Against Schema (table stakes)
- F7: Field-Level Error Reporting (differentiator)
- Solves primary pain point: "schema drift breaks queries without warning"

**Avoids:**
- Pitfall: Schema version skew (implement version handshake)
- Pitfall: Dynamic SQL not analyzable (classify static vs dynamic queries)
- Pitfall: Parameterized query type mismatches (infer and validate parameter types)

**Stack elements:** Zod validators (generated), HTTP client for schema endpoint, schema caching layer

**Research needs:** MODERATE - SQL parsing libraries (pgsql-parser vs node-sql-parser), parameter type inference strategies

### Phase 5: Testing, Integration & Production Hardening
**Rationale:** Full end-to-end validation ensuring the entire schema-driven pipeline works in production scenarios. Adds observability, performance optimization, and failure handling.

**Delivers:** Integration tests for full sync pipeline with schema changes, schema drift detection and alerting, dashboard UI for validation errors, monitoring/metrics for schema operations (introspection duration, cache hit rate, validation latency), circuit breakers for introspection failures, graceful degradation during network partitions.

**Addresses:**
- F6: Schema Drift Detection (differentiator)
- F8: Schema Change Impact Analysis (differentiator)
- Production-grade reliability and observability

**Avoids:**
- Pitfall: Network partition handling (circuit breakers, fallback to last-known-good)
- Pitfall: Schema migration coordination (expand-contract pattern)
- Pitfall: Inadequate introspection testing (edge cases, fault injection)
- Pitfall: Missing observability (structured logging, metrics, tracing)

**Stack elements:** Prisma Migrate Diff for drift detection, monitoring tools (existing logger), testing frameworks

**Research needs:** LOW - Standard testing patterns, monitoring best practices

### Phase Ordering Rationale

**Why this sequence:**
1. Introspection must exist before anything can consume schema metadata
2. HTTP endpoint needed before sync validator can fetch remote schemas
3. Codegen produces artifacts (Zod schemas) needed by validation layer
4. Enhanced validation is the product value, depends on all prior infrastructure
5. Hardening comes last after core flow is proven

**Why these groupings:**
- Phases 1-2 establish infrastructure (introspection + distribution)
- Phase 3 is build-time tooling (independent of runtime)
- Phase 4 is runtime product value (depends on infrastructure)
- Phase 5 is production readiness (depends on complete flow)

**Dependency management:**
- Each phase has clear prerequisites (no circular dependencies)
- Phases 1-3 can be developed with integration tests (no full system required)
- Phase 4 requires deployed gateway with schema endpoint
- Phase 5 requires complete system for end-to-end testing

**Avoiding pitfalls:**
- Early phases address foundation pitfalls (connection reliability, permissions)
- Middle phases address codegen pitfalls (staleness, type consistency)
- Later phases address distributed system pitfalls (version skew, network partitions)
- Final phase addresses observability and coordination pitfalls

### Research Flags

**Phases likely needing deeper research during planning:**
- **Phase 3 (CLI Codegen):** zod-prisma-types integration patterns not fully documented, custom type mapping configuration may require experimentation, generator templates for complex PostgreSQL types need validation
- **Phase 4 (Query Validation):** SQL parsing library selection requires evaluation (pgsql-parser vs node-sql-parser trade-offs), parameter type inference strategies need prototyping, handling of complex SQL constructs (CTEs, window functions) may need custom logic

**Phases with standard patterns (skip research-phase):**
- **Phase 1 (Introspection):** Well-documented Prisma introspection patterns, standard PostgreSQL information_schema queries
- **Phase 2 (HTTP Endpoint):** Standard REST API patterns with JWT auth (already used in codebase)
- **Phase 5 (Testing & Hardening):** Established monitoring/testing practices, standard circuit breaker patterns

## Confidence Assessment

| Area | Confidence | Notes |
|------|------------|-------|
| Stack | **HIGH** | Prisma and Zod are production-proven, already integrated in codebase, extensive documentation, active communities, clear upgrade paths |
| Features | **HIGH** | Feature categorization based on analysis of production systems (Prisma, Drizzle, TypeORM, Kysely, Zapatos), table stakes vs differentiators validated against real-world implementations |
| Architecture | **HIGH** | Distributed architecture pattern (schema-as-a-service) is established for similar systems, component boundaries clear, integration points well-defined, deployment model matches existing infrastructure |
| Pitfalls | **MEDIUM-HIGH** | Pitfalls identified from distributed systems literature and schema-driven tool post-mortems, some pitfalls are theoretical (not experienced firsthand), mitigation strategies are standard patterns but need validation in this specific context |

**Overall confidence:** **HIGH**

The research benefits from:
- Alignment with proven production tooling (Prisma 5.22+, Zod 3.23+)
- Existing integration in codebase (gateway already uses Prisma and Zod)
- Established patterns for distributed systems (schema versioning, caching, validation)
- Clear dependency chain enabling incremental development
- Well-documented technologies with active communities

### Gaps to Address

**Implementation details requiring validation:**
- **zod-prisma-types custom configuration:** The exact syntax for custom type mappings (e.g., DECIMAL → string vs number, JSONB → specific Zod schema) needs hands-on validation during Phase 3 implementation
- **SQL parser selection:** Need to benchmark pgsql-parser vs node-sql-parser for PostgreSQL-specific syntax coverage, error reporting quality, and performance at scale during Phase 4 planning
- **Schema versioning strategy:** The exact mechanism for version numbering (hash-based vs monotonic counter vs timestamp) should be prototyped during Phase 2-3 to ensure compatibility with distributed cache invalidation

**Domain-specific unknowns:**
- **Sync system query patterns:** The ratio of static vs dynamic queries in the existing sync configurations will determine Phase 4 complexity. Audit existing queries during Phase 4 planning to classify validation approach.
- **Schema change frequency:** If the ERP PostgreSQL schema changes daily (vs monthly), caching strategy and drift detection urgency differ significantly. Determine actual change frequency from stakeholders.
- **Multi-tenant considerations:** Research assumes single ERP database. If multiple customer databases exist, Phase 2-3 need schema namespacing and Phase 4 needs multi-schema validation. Clarify deployment model early.

**Performance unknowns:**
- **Large schema scaling:** Research assumes ~4-10 tables (current articulos, comprobantes, etc.). If PostgreSQL has 100+ tables, Phase 2 caching and Phase 3 codegen performance need measurement. Profile introspection against production-scale database.
- **Validation latency budget:** Acceptable query validation overhead unknown (1ms? 10ms? 100ms?). Benchmark during Phase 4 against existing sync performance to set realistic targets.

**Integration details:**
- **Deployment coordination:** How schema migrations are deployed relative to gateway/sync deployments affects Phase 5 coordination strategy. Document existing deployment workflow to design migration handshake.
- **Existing error handling:** Current sync error logging/reporting patterns should inform Phase 4 validation error formatting. Review existing error flow to maintain consistency.

## Sources

### Primary (HIGH confidence)
- **Prisma Documentation (prisma.io):** Introspection workflows, db pull command, Prisma schema DSL, client generation, migrate diff capabilities
- **zod-prisma-types GitHub (chrishoermann/zod-prisma-types):** Generator configuration, type mapping rules, custom validator syntax, Prisma 5.x compatibility
- **Zod Documentation (zod.dev):** Schema validation patterns, type inference, error handling, runtime validation strategies
- **PostgreSQL Documentation (postgresql.org):** information_schema structure, pg_catalog system tables, constraint types, custom types and enums

### Secondary (MEDIUM confidence)
- **Kysely Documentation:** Type-safe SQL patterns, kysely-codegen for PostgreSQL, query validation approaches (evaluated as optional alternative)
- **Drizzle ORM Patterns:** Schema introspection strategies, type mapping approaches (evaluated for comparison)
- **Distributed Systems Literature:** Schema versioning patterns, cache invalidation strategies, circuit breaker patterns (general best practices applied to schema context)
- **Production Schema Tool Analyses:** TypeORM, Zapatos feature comparison, real-world pitfalls from GitHub issues and blog posts

### Tertiary (LOW confidence, needs validation)
- **SQL Parser Libraries:** pgsql-parser and node-sql-parser capabilities inferred from documentation, actual PostgreSQL syntax coverage needs hands-on testing
- **Schema Migration Coordination:** Expand-contract patterns are well-known but application to this specific distributed architecture needs validation
- **Query Validation Performance:** Estimated latency (<1ms structure validation, ~existing overhead for Zod) based on similar systems but needs benchmarking

---
*Research completed: 2026-01-26*
*Ready for roadmap: yes*
