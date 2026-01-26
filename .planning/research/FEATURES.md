# FEATURES.md
## Schema-Driven Synchronization Control System

**Research Date:** 2026-01-26
**Research Focus:** Feature categorization for schema-driven sync control capabilities
**Context:** Production schema management, validation systems, and sync pipeline reliability

---

## Executive Summary

Schema-driven sync control systems bridge the gap between database schema definitions and runtime validation/code generation. Based on analysis of production tools (Prisma, Drizzle, TypeORM, Zapatos, Kysely) and schema validation libraries (Zod, Yup, AJV), this document categorizes features into three tiers:

- **Table Stakes**: Core features required for any schema-driven system to function
- **Differentiators**: Features that provide competitive advantage and solve real pain points
- **Anti-Features**: Capabilities that sound appealing but introduce risk or complexity

---

## Table Stakes Features

These features are non-negotiable for a production schema-driven sync control system.

### 1. PostgreSQL Schema Introspection
**Complexity:** Medium
**Dependencies:** None (foundation feature)

**Capabilities:**
- Read table definitions (columns, types, constraints)
- Extract foreign key relationships
- Identify primary keys and unique constraints
- Detect indexes
- Parse column nullability and default values
- Read custom types (enums, composite types)
- Support for multiple schemas (public, custom)

**Why Table Stakes:**
Without introspection, there's no source of truth. Every schema-driven tool (Prisma, TypeORM, Drizzle) starts here.

---

### 2. SQL Query Validation Against Schema
**Complexity:** High
**Dependencies:** Schema introspection

**Capabilities:**
- Parse SQL SELECT queries
- Validate column references exist in schema
- Verify JOIN relationships match foreign keys
- Type-check WHERE clause predicates
- Detect SELECT * and flag missing columns
- Validate aggregate functions and GROUP BY
- Check subquery column compatibility

**Why Table Stakes:**
The core problem statement is "schema drift breaks queries without warning." Query validation is the minimum viable solution.

**Implementation Notes:**
- Requires SQL parser (consider `pgsql-parser` or `node-sql-parser`)
- Must handle SQL dialects (PostgreSQL-specific syntax)
- Complex feature: CTEs, window functions, LATERAL joins add significant complexity

---

### 3. Zod Schema Code Generation
**Complexity:** Medium
**Dependencies:** Schema introspection

**Capabilities:**
- Generate Zod schemas from PostgreSQL column types
- Map PostgreSQL types to Zod validators:
  - `VARCHAR(n)` → `z.string().max(n)`
  - `INTEGER` → `z.number().int()`
  - `TIMESTAMP` → `z.date()` or `z.string().datetime()`
  - `JSONB` → `z.record()` or custom schema
  - `ENUM` → `z.enum([...])`
- Handle nullable columns → `.nullable()` or `.optional()`
- Generate validation for constraints (min/max, regex patterns from CHECK constraints)
- Support for composite types → nested Zod objects

**Why Table Stakes:**
Current system already uses Zod validation. Generated schemas ensure validation matches database schema.

**Implementation Notes:**
- Type mapping requires opinionated decisions (TIMESTAMP as Date vs ISO string)
- CHECK constraints may not parse cleanly into Zod validators
- Custom PostgreSQL types need fallback handling

---

### 4. Prisma Schema Code Generation
**Complexity:** Medium-High
**Dependencies:** Schema introspection

**Capabilities:**
- Generate Prisma schema file from PostgreSQL schema
- Map tables to `model` definitions
- Define relationships (`@relation` attributes)
- Handle indexes and constraints
- Support for composite primary keys
- Generate enums from PostgreSQL ENUMs
- Handle schema namespaces (multi-schema support)

**Why Table Stakes:**
Current system uses Prisma for persistence. Generated Prisma schema ensures ORM matches database schema.

**Implementation Notes:**
- Prisma schema DSL has specific conventions (naming, relation inference)
- Bidirectional relations require careful handling
- Prisma migration workflow vs. external schema changes (introspection mode)

---

### 5. TypeScript Type Generation
**Complexity:** Low-Medium
**Dependencies:** Schema introspection

**Capabilities:**
- Generate TypeScript interfaces/types from tables
- Map PostgreSQL types to TypeScript types
- Handle nullable → `| null` union types
- Generate types for query result shapes
- Support for JSON column type definitions
- Export types for use across sync pipeline

**Why Table Stakes:**
Type safety across the sync pipeline requires TypeScript types that match database schema.

---

## Differentiating Features

These features solve real pain points and provide competitive advantage over manual schema management.

### 6. Schema Drift Detection
**Complexity:** Medium
**Dependencies:** Schema introspection, persistent schema snapshots

**Capabilities:**
- Compare current database schema against last known snapshot
- Detect added/removed tables
- Detect added/removed/renamed columns
- Detect type changes (e.g., VARCHAR(50) → VARCHAR(100))
- Detect constraint changes (nullable → not null)
- Flag breaking vs. non-breaking changes
- Generate human-readable diff reports

**Why Differentiating:**
This is the proactive solution to "schema drift breaks queries without warning." Detecting drift before it causes failures is a major value-add.

**Implementation Notes:**
- Requires persisted schema snapshot (JSON file or database table)
- Breaking change classification requires domain logic
- Must handle schema evolution patterns (additive changes are often safe)

**Complexity Drivers:**
- Schema comparison algorithms (structural diff)
- Breaking vs. non-breaking change heuristics
- Handling renamed columns vs. removed + added columns (ambiguity)

---

### 7. Field-Level Error Reporting
**Complexity:** Medium-High
**Dependencies:** Query validation, schema introspection

**Capabilities:**
- Report specific line/column where query validation fails
- Identify which table/column is missing or mismatched
- Suggest corrections (e.g., "Did you mean `customer_id`?")
- Show expected vs. actual types in type mismatches
- Link errors to schema definitions
- Stack multiple errors (don't fail on first error)

**Why Differentiating:**
Developer experience. Generic "query invalid" errors are frustrating. Precise, actionable errors accelerate debugging.

**Implementation Notes:**
- Requires SQL parser with position tracking
- Fuzzy matching for suggestions (Levenshtein distance)
- Error message design is UX-critical

---

### 8. Schema Change Impact Analysis
**Complexity:** High
**Dependencies:** Schema drift detection, query validation, query inventory

**Capabilities:**
- Identify which queries are affected by schema changes
- Classify impact severity (breaking, warning, info)
- Generate migration checklist (queries to update, schemas to regenerate)
- Estimate blast radius (how many sync jobs affected)
- Provide before/after query comparisons

**Why Differentiating:**
Goes beyond detection to prescription. Answers "What breaks if I apply this schema migration?"

**Implementation Notes:**
- Requires inventory of all queries in the system
- Must parse queries and track column dependencies
- Complex feature: cross-query impact (e.g., shared staging tables)

**Complexity Drivers:**
- Query dependency graph construction
- Impact severity classification logic
- Handling indirect impacts (e.g., Zod validation of downstream data)

---

### 9. Incremental Codegen with Change Tracking
**Complexity:** Medium
**Dependencies:** Schema drift detection, codegen features

**Capabilities:**
- Regenerate only affected Zod/Prisma/TypeScript code
- Preserve custom modifications (via protected regions or separate files)
- Track which generated files are stale
- Provide opt-in regeneration (confirm before overwrite)
- Version generated code (git-friendly diffs)

**Why Differentiating:**
Production systems need codegen that doesn't clobber custom logic. Incremental updates reduce friction.

**Implementation Notes:**
- Protected region comments (e.g., `// CUSTOM CODE START/END`)
- File hashing to detect staleness
- Git integration for change visibility

---

### 10. Multi-Schema/Multi-Database Support
**Complexity:** Medium
**Dependencies:** Schema introspection

**Capabilities:**
- Introspect multiple PostgreSQL schemas (public, erp, analytics)
- Handle cross-schema queries and foreign keys
- Support multiple database connections (multi-tenant, sharded)
- Namespace generated code by schema/database
- Detect schema conflicts (same table name in different schemas)

**Why Differentiating:**
Enterprise ERP systems often use multiple schemas. Supporting this pattern unlocks complex use cases.

**Implementation Notes:**
- Schema-qualified table references (`erp.customers`)
- Codegen namespacing (avoid type name collisions)
- Connection pooling for multi-database scenarios

---

### 11. Custom Type Mapping Configuration
**Complexity:** Low-Medium
**Dependencies:** Codegen features

**Capabilities:**
- Override default PostgreSQL → Zod/TypeScript mappings
- Define custom validators for specific columns (e.g., email regex)
- Map PostgreSQL types to domain types (e.g., `citext` → email string)
- Configure JSON column schemas (nested Zod validation)
- Handle proprietary PostgreSQL extensions

**Why Differentiating:**
One-size-fits-all type mapping doesn't work for complex domains. Customization enables precision validation.

**Implementation Notes:**
- Configuration file (YAML/JSON) for type overrides
- Column-level and type-level overrides
- Must integrate with codegen pipeline

---

### 12. Schema Documentation Generation
**Complexity:** Low
**Dependencies:** Schema introspection

**Capabilities:**
- Generate Markdown/HTML docs from schema
- Include table/column descriptions (from PostgreSQL comments)
- Document relationships and constraints
- Link to generated types/schemas
- Export ERD diagrams (Mermaid, PlantUML)

**Why Differentiating:**
Self-documenting schemas improve onboarding and reduce tribal knowledge.

**Implementation Notes:**
- PostgreSQL `COMMENT ON` extraction
- Diagram generation libraries (Mermaid integration)

---

## Anti-Features

These features sound appealing but introduce risk, complexity, or misalignment with the problem domain.

### A1. Automatic Query Rewriting
**Why Anti-Feature:**
- High complexity, low reliability
- SQL rewriting requires deep understanding of query semantics
- Risk of silent correctness bugs (query runs but returns wrong data)
- Better to fail loudly than fix incorrectly

**Alternative Approach:**
- Provide suggested query fixes in error messages
- Require manual confirmation before applying rewrites

---

### A2. Real-Time Schema Synchronization
**Why Anti-Feature:**
- Sync pipelines should be deliberate, not reactive
- Real-time sync implies automatic codegen/deployment (dangerous)
- Schema changes should go through review/testing
- Polling database for changes adds latency and resource overhead

**Alternative Approach:**
- Explicit schema refresh command (manual trigger)
- CI/CD integration for schema validation on deployment

---

### A3. Automatic Migration Generation
**Why Anti-Feature:**
- Database migrations are high-risk operations
- Generated migrations may not match intended logic (data backfills, complex transforms)
- Prisma/TypeORM migration tools already exist (don't reinvent)
- Out of scope for sync control (schema introspection, not schema authoring)

**Alternative Approach:**
- Detect drift and warn, but don't auto-migrate
- Integrate with existing migration tools (Prisma Migrate, Flyway)

---

### A4. Schema Rollback/Time Travel
**Why Anti-Feature:**
- Adds significant complexity (schema versioning, snapshot storage)
- Database-level feature (use PostgreSQL backups, point-in-time recovery)
- Sync system should adapt to schema, not manage schema history

**Alternative Approach:**
- Store schema snapshots for drift detection only
- Rely on database backup/restore for rollback

---

### A5. Cross-Database Schema Unification
**Why Anti-Feature:**
- Attempting to merge schemas from MySQL, PostgreSQL, SQL Server is fraught
- Type systems differ fundamentally (no clean mapping)
- Out of scope for PostgreSQL-specific sync system

**Alternative Approach:**
- Focus on PostgreSQL (current ERP database)
- Provide extension points if multi-database support is needed later

---

### A6. Visual Schema Editor/Designer
**Why Anti-Feature:**
- Sync system should consume schema, not author it
- Schema design is a separate concern (use pgAdmin, DBeaver, DBDiagram.io)
- High UI complexity for limited value in this context

**Alternative Approach:**
- Generate visual documentation (read-only ERDs)
- Integrate with existing schema design tools

---

### A7. Embedded SQL Query Builder
**Why Anti-Feature:**
- Users already write SQL queries (existing workflow)
- Query builders abstract away SQL, reducing control
- Validation is the goal, not query construction

**Alternative Approach:**
- Validate user-written SQL queries
- Provide query templates/examples in documentation

---

## Feature Dependencies Map

```
Schema Introspection (F1)
├── SQL Query Validation (F2)
│   ├── Field-Level Error Reporting (F7)
│   └── Schema Change Impact Analysis (F8)
├── Zod Schema Codegen (F3)
│   └── Incremental Codegen (F9)
├── Prisma Schema Codegen (F4)
│   └── Incremental Codegen (F9)
├── TypeScript Type Codegen (F5)
│   └── Incremental Codegen (F9)
├── Schema Drift Detection (F6)
│   └── Schema Change Impact Analysis (F8)
├── Multi-Schema Support (F10)
├── Custom Type Mapping (F11)
└── Schema Documentation (F12)
```

---

## Implementation Complexity Estimates

| Feature | Complexity | Effort (Story Points) | Risk Level |
|---------|------------|----------------------|------------|
| F1: Schema Introspection | Medium | 5 | Low |
| F2: Query Validation | High | 13 | Medium |
| F3: Zod Codegen | Medium | 8 | Low |
| F4: Prisma Codegen | Medium-High | 8 | Medium |
| F5: TypeScript Codegen | Low-Medium | 3 | Low |
| F6: Schema Drift Detection | Medium | 5 | Low |
| F7: Field-Level Errors | Medium-High | 8 | Medium |
| F8: Impact Analysis | High | 13 | High |
| F9: Incremental Codegen | Medium | 5 | Medium |
| F10: Multi-Schema | Medium | 5 | Low |
| F11: Custom Type Mapping | Low-Medium | 3 | Low |
| F12: Documentation | Low | 2 | Low |

**Total Effort (Table Stakes):** 37 points
**Total Effort (Differentiators):** 41 points
**Total Effort (All Features):** 78 points

---

## Recommended Phasing

### Phase 1: MVP (Table Stakes)
**Goal:** Solve "schema drift breaks queries without warning"

- F1: Schema Introspection
- F2: SQL Query Validation (basic)
- F3: Zod Codegen (basic)
- F5: TypeScript Codegen

**Deliverable:** Validate queries against introspected schema, generate basic validation code.

### Phase 2: Proactive Drift Management
**Goal:** Detect schema changes before they cause failures

- F6: Schema Drift Detection
- F4: Prisma Codegen (if needed for persistence layer)
- F7: Field-Level Error Reporting (improve DX)

**Deliverable:** Automated drift detection, actionable error messages.

### Phase 3: Production Hardening
**Goal:** Handle complex schemas and reduce maintenance friction

- F8: Schema Change Impact Analysis
- F9: Incremental Codegen
- F10: Multi-Schema Support (if needed)
- F11: Custom Type Mapping

**Deliverable:** Production-grade schema management with impact analysis.

### Phase 4: Documentation & Polish
**Goal:** Improve discoverability and onboarding

- F12: Schema Documentation
- Enhanced error messages (suggestions, examples)

---

## Open Questions for Requirements Phase

1. **Query Inventory:** How are SQL queries currently stored? (code files, database, config?)
2. **Schema Change Frequency:** How often does the ERP schema change? (daily, weekly, monthly?)
3. **Validation Scope:** Validate queries at authoring time (IDE) or runtime (sync execution)?
4. **Codegen Workflow:** One-time generation or continuous regeneration on schema change?
5. **Multi-Tenant Considerations:** Single ERP database or multiple customer databases?
6. **Performance Requirements:** How many queries need validation? How large are schemas?
7. **Breaking Change Policy:** Who approves schema changes? Rollback process?

---

## References

**Production Schema Tools Analyzed:**
- Prisma (schema introspection, codegen, ORM)
- Drizzle ORM (type-safe SQL, schema introspection)
- Kysely (type-safe query builder)
- Zapatos (PostgreSQL codegen)
- TypeORM (decorators, introspection)

**Validation Libraries:**
- Zod (runtime validation, TypeScript inference)
- Yup (schema validation)
- AJV (JSON Schema validation)

**SQL Parsing:**
- `pgsql-parser` (PostgreSQL-specific, libpg_query bindings)
- `node-sql-parser` (multi-dialect SQL parser)

**Schema Diff Tools:**
- Migra (schema diff for PostgreSQL)
- Atlas (schema management and migration)

---

## Quality Gate Checklist

- [x] Categories are clear (table stakes vs differentiators vs anti-features)
- [x] Complexity noted for each feature
- [x] Dependencies between features identified
- [x] Implementation notes provided for high-complexity features
- [x] Phasing recommendations included
- [x] Open questions flagged for requirements phase
