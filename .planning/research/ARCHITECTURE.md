# Architecture Research: Schema-Driven Validation Systems

**Research Question:** How are schema-driven validation systems typically structured? What are the key components and data flows?

**Context:** Integration of schema introspection and validation into objetiva-sync monorepo architecture where sync and gateway run on separate physical servers.

---

## Executive Summary

Schema-driven validation systems establish a database as the single source of truth and propagate structural metadata through automated tooling to maintain consistency across validation layers, ORM models, and API contracts. The architecture consists of four primary components:

1. **Schema Introspection Layer** - Reads database metadata
2. **Schema Distribution Endpoint** - Exposes metadata via HTTP API
3. **Code Generation Pipeline** - Transforms metadata into type-safe schemas
4. **Runtime Validation Layer** - Enforces contracts during data flow

For the objetiva-sync system, this maps to: PostgreSQL → Gateway Schema API → CLI Introspection Tool → Prisma/Zod Regeneration → Query Validator.

---

## Component Architecture

### 1. Schema Introspection Layer

**Purpose:** Extract authoritative structural metadata from the database system.

**Location in Project:** Gateway server (has direct PostgreSQL access)

**Key Responsibilities:**
- Query database information schema (columns, types, constraints, nullability)
- Extract foreign key relationships and indexes
- Format metadata into structured representation
- Handle database-specific type mappings

**Implementation Approach:**
```
PostgreSQL Information Schema
       ↓
Introspection Query Engine
       ↓
Normalized Schema Metadata (JSON)
```

**Integration Points:**
- **Input:** PostgreSQL connection via Prisma
- **Output:** Schema metadata object containing:
  - Table names
  - Column definitions (name, type, nullable, default)
  - Primary/foreign keys
  - Indexes and constraints

**Technology Stack:**
- Prisma's introspection utilities (`prisma db pull` internals)
- Direct PostgreSQL system catalog queries
- TypeScript schema metadata interfaces

**Build Order:** Phase 1 - Foundation (must exist before schema endpoint)

---

### 2. Schema Distribution Endpoint

**Purpose:** Expose schema metadata via authenticated HTTP endpoint for consumption by remote sync instances.

**Location in Project:** Gateway server (`objetiva-sync-gateway`)

**Key Responsibilities:**
- Authenticate incoming schema requests (JWT)
- Retrieve current schema metadata on-demand
- Return structured JSON schema representation
- Support entity-specific or full schema queries
- Cache schema metadata for performance

**API Contract:**
```
GET /api/schemas
Authorization: Bearer <jwt-token>

Response: {
  "articulos": {
    "table": "articulos",
    "columns": [
      { "name": "id", "type": "integer", "nullable": false, "isPrimaryKey": true },
      { "name": "codigo", "type": "varchar", "nullable": false, "maxLength": 50 },
      { "name": "descripcion", "type": "text", "nullable": true }
    ]
  },
  "comprobantes_cabecera": { ... }
}

GET /api/schemas/:entity
Returns schema for specific entity only
```

**Integration Points:**
- **Input:** HTTP request with JWT authentication
- **Dependencies:** Schema Introspection Layer, JWT auth middleware
- **Output:** JSON schema metadata payload
- **Consumers:** Sync application query validator, CLI introspection tool

**Technology Stack:**
- Fastify route handler (`/routes/schemas.ts`)
- JWT authentication middleware (existing)
- Response caching (Node.js Map or Redis)

**Build Order:** Phase 2 - Gateway Schema Endpoint (depends on introspection layer)

---

### 3. Code Generation Pipeline

**Purpose:** Transform database schema metadata into type-safe code artifacts (Prisma models, Zod validators).

**Location in Project:** CLI command executed on gateway server, outputs to gateway codebase

**Key Responsibilities:**
- Fetch schema metadata from introspection layer
- Generate Prisma schema file from metadata
- Run `prisma generate` to update TypeScript client
- Generate Zod schemas matching Prisma models
- Update shared schema files used by both sync and gateway
- Provide diff summary of changes

**Data Flow:**
```
PostgreSQL Metadata
       ↓
CLI Command: regenerate-schemas
       ↓
Generate prisma/schema.prisma
       ↓
Run: prisma generate (updates @prisma/client)
       ↓
Generate Zod schemas (shared/schemas/*.ts)
       ↓
Commit changes (manual user action)
```

**Implementation Approach:**

**Phase 1: Prisma Regeneration**
```typescript
// CLI command: npm run regenerate-schemas
1. Query introspection layer for current schema
2. Generate Prisma schema file using template:
   - datasource db block
   - generator client block
   - model definitions from metadata
3. Execute: npx prisma generate
4. Verify client regeneration
```

**Phase 2: Zod Schema Generation**
```typescript
// After Prisma client regenerated
1. Read Prisma schema file (or use metadata directly)
2. For each model, generate Zod schema:
   - Map Prisma types to Zod validators
   - Handle nullable fields (.nullable() / .optional())
   - Apply string length constraints
   - Add custom validation rules
3. Write to shared/schemas/ directory
4. Update index.ts exports
```

**Type Mapping Strategy:**
```
PostgreSQL → Prisma → Zod
VARCHAR → String → z.string()
INTEGER → Int → z.number().int()
BOOLEAN → Boolean → z.boolean()
TIMESTAMP → DateTime → z.date()
TEXT → String → z.string()
DECIMAL → Decimal → z.number()
```

**Integration Points:**
- **Input:** Schema metadata from introspection layer
- **Output:**
  - `prisma/schema.prisma` (updated)
  - `shared/schemas/*.ts` (Zod validators)
  - `@prisma/client` TypeScript types (regenerated)
- **Consumers:** Gateway ingestion service, sync query validator

**Technology Stack:**
- Node.js CLI script (TypeScript)
- Prisma CLI (`prisma generate`)
- Template engine for code generation (handlebars or template literals)
- File system operations (fs/promises)

**Build Order:** Phase 3 - CLI Introspection & Regeneration (depends on schema endpoint)

---

### 4. Runtime Validation Layer

**Purpose:** Enforce schema contracts during data synchronization using generated validators.

**Location in Project:**
- Sync application (`objetiva-sync`) - Query result validation
- Gateway application (`objetiva-sync-gateway`) - Batch ingestion validation

**Key Responsibilities:**

**In Sync Application:**
- Fetch current schemas from gateway endpoint
- Validate SQL query results against expected schema
- Detect field mismatches (missing, extra, type mismatch)
- Provide detailed validation errors
- Block invalid data from reaching gateway

**In Gateway Application:**
- Validate incoming batch payloads using Zod schemas
- Ensure data conforms to PostgreSQL expectations
- Return validation errors to sync client

**Data Flow:**
```
SQL Server Query Result
       ↓
Query Validator (Sync)
  - Fetch schema from gateway /api/schemas
  - Compare result fields vs. expected schema
  - Validate field types and nullability
       ↓
Zod Validation (Sync)
  - Apply entity-specific Zod schema
  - Transform to typed payload
       ↓
HTTP POST to Gateway
       ↓
Zod Validation (Gateway)
  - Validate batch structure
  - Validate individual records
       ↓
Prisma Persistence
```

**Enhanced Query Validator Design:**

```typescript
// Location: objetiva-sync/src/sync/query-validator.ts

interface SchemaField {
  name: string;
  type: string;
  nullable: boolean;
}

interface EntitySchema {
  table: string;
  columns: SchemaField[];
}

class QueryValidator {
  private schemaCache: Map<string, EntitySchema>;
  private apiClient: SchemaApiClient;

  // Fetch schemas from gateway
  async refreshSchemas(entityType?: string): Promise<void> {
    const schemas = await this.apiClient.getSchemas(entityType);
    this.schemaCache.set(entityType, schemas);
  }

  // Validate query result structure
  validateResultStructure(
    entityType: string,
    queryResult: Record<string, any>
  ): ValidationResult {
    const schema = this.schemaCache.get(entityType);

    // Check for missing required fields
    // Check for unexpected extra fields
    // Validate field types match expected schema
    // Validate nullability constraints

    return {
      valid: boolean,
      errors: ValidationError[],
      warnings: string[]
    };
  }

  // Existing Zod validation (enhanced)
  validateWithZod(entityType: string, data: unknown): TypedPayload {
    // Apply Zod schema validation
    // Return typed payload or throw
  }
}
```

**Integration Points:**
- **Input (Sync):**
  - SQL query results from adapter
  - Schema metadata from gateway endpoint
- **Input (Gateway):**
  - HTTP batch payload from sync
- **Dependencies:**
  - Generated Zod schemas
  - Schema API client
- **Output:**
  - Validated, typed payloads
  - Detailed validation error messages

**Technology Stack:**
- Zod validators (generated)
- HTTP client for schema endpoint (axios/native fetch)
- Schema caching (in-memory Map)
- Error formatting utilities

**Build Order:** Phase 4 - Enhanced Query Validation (depends on schema endpoint and Zod generation)

---

## Data Flow Architecture

### End-to-End Schema Propagation Flow

```
┌─────────────────────────────────────────────────────────────────┐
│ 1. DATABASE SCHEMA (Source of Truth)                            │
│                                                                  │
│  PostgreSQL Database                                             │
│    └─ information_schema                                         │
│    └─ pg_catalog                                                 │
└──────────────────────┬──────────────────────────────────────────┘
                       │
                       ↓
┌─────────────────────────────────────────────────────────────────┐
│ 2. INTROSPECTION LAYER (Gateway Server)                          │
│                                                                  │
│  Schema Introspection Service                                    │
│    ├─ Query information_schema                                   │
│    ├─ Extract table/column metadata                              │
│    └─ Format as JSON schema object                               │
└──────────────────────┬──────────────────────────────────────────┘
                       │
                       ↓
┌─────────────────────────────────────────────────────────────────┐
│ 3. SCHEMA DISTRIBUTION (Gateway HTTP API)                        │
│                                                                  │
│  GET /api/schemas                                                │
│    ├─ Authentication: JWT                                        │
│    ├─ Response: JSON schema metadata                             │
│    └─ Caching: In-memory                                         │
└──────────────┬───────────────────────────┬──────────────────────┘
               │                           │
               ↓                           ↓
┌──────────────────────────┐  ┌────────────────────────────────────┐
│ 4a. CLI REGENERATION     │  │ 4b. RUNTIME VALIDATION (Sync)      │
│     (Gateway Server)     │  │     (Sync Server)                  │
│                          │  │                                    │
│  CLI: regenerate-schemas │  │  Query Validator                   │
│    ↓                     │  │    ├─ Fetch schemas from endpoint  │
│  Update Prisma schema    │  │    ├─ Cache schemas locally        │
│    ↓                     │  │    ├─ Validate query results       │
│  Run: prisma generate    │  │    └─ Detect schema mismatches     │
│    ↓                     │  │                                    │
│  Generate Zod schemas    │  │  Query Execution                   │
│    ↓                     │  │    ├─ Structure validation         │
│  Commit changes          │  │    ├─ Zod validation               │
│                          │  │    └─ Type-safe payload            │
└──────────────┬───────────┘  └────────────────┬───────────────────┘
               │                               │
               ↓                               ↓
┌─────────────────────────────────────────────────────────────────┐
│ 5. CODE ARTIFACTS                                                │
│                                                                  │
│  prisma/schema.prisma          shared/schemas/*.ts               │
│  @prisma/client (types)        Zod validators                    │
└──────────────┬──────────────────────────────────────────────────┘
               │
               ↓
┌─────────────────────────────────────────────────────────────────┐
│ 6. RUNTIME VALIDATION (Gateway)                                  │
│                                                                  │
│  Batch Ingestion                                                 │
│    ├─ Validate with generated Zod schemas                        │
│    ├─ Enforce data contracts                                     │
│    └─ Persist via Prisma ORM                                     │
└─────────────────────────────────────────────────────────────────┘
```

### Schema Change Propagation Sequence

**Scenario:** Developer adds new column to PostgreSQL table

```
Step 1: Database Migration
  └─ Developer runs Prisma migration
  └─ PostgreSQL schema updated

Step 2: Schema Regeneration (Manual Trigger)
  └─ Developer runs: npm run regenerate-schemas
  └─ CLI fetches new schema from introspection layer
  └─ Prisma schema file updated
  └─ Prisma client regenerated
  └─ Zod schemas regenerated
  └─ Developer reviews diff and commits changes

Step 3: Deployment
  └─ Gateway deployed with updated Prisma client
  └─ Gateway deployed with updated Zod schemas
  └─ Sync application queries /api/schemas
  └─ Sync validator cache refreshed

Step 4: Runtime Validation
  └─ Sync queries include new column
  └─ Query validator passes (structure matches schema)
  └─ Zod validation passes (new field validated)
  └─ Gateway ingestion succeeds
  └─ Prisma persists new field
```

---

## Component Boundaries

### Gateway Schema Endpoint Component

**Boundary Definition:**
- **Input Interface:** HTTP GET request with JWT token
- **Output Interface:** JSON schema metadata
- **Dependencies:** Schema introspection service, JWT auth middleware
- **Isolation:** Stateless, cacheable, versioned response format

**File Locations:**
```
objetiva-sync-gateway/
├─ src/routes/schemas.ts          # Route handler
├─ src/services/schema-introspection.ts  # Introspection logic
└─ src/middleware/auth.ts         # JWT validation (existing)
```

**API Contract:**
```typescript
// Request
GET /api/schemas
Headers: { Authorization: "Bearer <token>" }

// Response
{
  "version": "1.0",
  "entities": {
    "articulos": { columns: [...] },
    "comprobantes_cabecera": { columns: [...] },
    ...
  }
}
```

---

### Sync Query Validator Component

**Boundary Definition:**
- **Input Interface:** SQL query results (raw objects), entity type identifier
- **Output Interface:** Validated typed payload or validation errors
- **Dependencies:** Schema API client, Zod schemas, logger
- **Isolation:** Stateful (caches schemas), synchronous validation

**File Locations:**
```
objetiva-sync/
├─ src/sync/query-validator.ts         # Enhanced validator
├─ src/api-client/schema-client.ts     # Schema endpoint client
└─ src/types/*.ts                      # Entity type definitions (existing)
```

**Validation Pipeline:**
```typescript
queryResult (unknown)
  → validateStructure() → StructureValidationResult
  → validateWithZod() → TypedPayload
  → Output: IArticuloPayload | ValidationError
```

---

### CLI Introspection Tool Component

**Boundary Definition:**
- **Input Interface:** Command-line invocation, optional flags
- **Output Interface:** Updated files, console output summary
- **Dependencies:** Schema introspection service, Prisma CLI, file system
- **Isolation:** Stateless, idempotent, can run offline with cached schema

**File Locations:**
```
objetiva-sync-gateway/
├─ scripts/regenerate-schemas.ts       # CLI entry point
├─ scripts/generators/prisma-generator.ts    # Prisma schema builder
├─ scripts/generators/zod-generator.ts       # Zod schema builder
└─ package.json                        # Script: "regenerate-schemas"
```

**Command Interface:**
```bash
npm run regenerate-schemas           # Full regeneration
npm run regenerate-schemas -- --entity articulos  # Single entity
npm run regenerate-schemas -- --dry-run  # Show diff without writing
```

---

## Integration with Existing Architecture

### Current Architecture Layers

**Existing Layers (from .planning/codebase/ARCHITECTURE.md):**
1. Presentation Layer (Dashboard)
2. Configuration Layer (env, constants)
3. Adapter Layer (data source abstraction)
4. API Client Layer (gateway communication)
5. Sync Engine Layer (orchestration)
6. Data Access Layer (SQLite store)
7. Auth Layer (JWT, sessions)
8. Ingestion Layer (gateway persistence)
9. API Gateway Layer (routes, middleware)
10. Utilities Layer (logger, helpers)

**New Schema-Driven Layers:**
11. **Schema Introspection Layer** (Gateway) - Peers with Ingestion Layer
12. **Schema Distribution Layer** (Gateway) - Peers with API Gateway Layer
13. **Code Generation Layer** (Gateway) - Build-time, not runtime
14. **Schema Validation Layer** (Sync) - Enhances Sync Engine Layer

### Integration Points

**Sync Engine Layer Enhancement:**
```
Current: Adapter → Query → Transform → Validate (Zod) → Batch → Send
New:     Adapter → Query → Validate (Structure) → Validate (Zod) → Batch → Send
                             ↑
                    Schema Endpoint (cache)
```

**API Gateway Layer Enhancement:**
```
Current Routes:           New Routes:
/api/articulos            /api/schemas
/api/comprobantes/*       /api/schemas/:entity
/api/health               (existing routes unchanged)
```

**Gateway Ingestion Layer:**
```
No changes required - continues using existing Zod schemas
Zod schemas are now generated instead of manually maintained
```

**Auth Layer:**
```
Schema endpoint reuses existing JWT middleware
No changes to authentication logic
```

---

## Build Order & Dependencies

### Phase 1: Schema Introspection Foundation
**Goal:** Ability to query PostgreSQL schema metadata programmatically

**Components:**
- Schema introspection service (gateway)
- Metadata type definitions
- Unit tests for introspection

**Dependencies:** None (uses existing Prisma connection)

**Deliverables:**
- `src/services/schema-introspection.ts`
- Unit tests
- Documentation

**Why First:** All other components depend on ability to read schema metadata

---

### Phase 2: Schema Distribution Endpoint
**Goal:** Expose schema metadata via authenticated HTTP API

**Components:**
- GET /api/schemas route handler
- GET /api/schemas/:entity route handler
- Schema response caching
- Integration with existing JWT auth

**Dependencies:** Phase 1 (introspection service)

**Deliverables:**
- `src/routes/schemas.ts`
- Route registration in server.ts
- Integration tests
- API documentation

**Why Second:** Sync validator and CLI tool both need HTTP access to schemas

---

### Phase 3: CLI Introspection & Regeneration
**Goal:** Automated Prisma and Zod schema generation from live database

**Components:**
- CLI script entry point
- Prisma schema generator
- Zod schema generator
- Diff visualization
- File writer utilities

**Dependencies:** Phase 1 (introspection), Phase 2 (optional - can use introspection directly)

**Deliverables:**
- `scripts/regenerate-schemas.ts`
- `scripts/generators/prisma-generator.ts`
- `scripts/generators/zod-generator.ts`
- npm script in package.json
- Documentation and usage guide

**Why Third:** Generates artifacts needed by validation layer, independent of runtime

---

### Phase 4: Enhanced Query Validation
**Goal:** Runtime validation of query results against live schema

**Components:**
- Enhanced QueryValidator class
- Schema API client
- Schema cache manager
- Structure validation logic
- Error formatting utilities

**Dependencies:** Phase 2 (schema endpoint), Phase 3 (generated Zod schemas)

**Deliverables:**
- `src/sync/query-validator.ts` (enhanced)
- `src/api-client/schema-client.ts`
- Unit and integration tests
- Dashboard validation error display

**Why Fourth:** Requires both schema endpoint (runtime) and generated schemas (build-time)

---

### Phase 5: Testing & Integration
**Goal:** End-to-end validation of schema-driven flow

**Components:**
- Integration tests for full sync pipeline
- Schema change simulation tests
- Dashboard UI for validation errors
- Schema drift detection alerts

**Dependencies:** All previous phases

**Deliverables:**
- Integration test suite
- Dashboard UI enhancements
- Monitoring/alerting setup
- Documentation

**Why Last:** Validates entire system working together

---

## Technology Decisions

### Why Prisma for Introspection?
- Already integrated in gateway
- Built-in introspection capabilities (`prisma db pull`)
- Type-safe database access
- Migration management

### Why HTTP Endpoint vs. Shared Database?
- Sync and gateway on separate physical servers (constraint)
- HTTP enables authentication and authorization
- Cacheable, stateless, versionable
- Clear separation of concerns

### Why Manual Regeneration Command?
- User controls when schema changes propagate (safety)
- Allows review of generated code changes
- Prevents accidental breaking changes
- Fits development workflow (schema change → regenerate → test → commit)

### Why Cache Schemas in Sync?
- Reduce HTTP calls during sync operations
- Improve performance
- Enable offline validation during development
- TTL-based cache refresh for schema changes

### Why Generate Zod Instead of Manual?
- Single source of truth (PostgreSQL)
- Eliminates manual synchronization errors
- Consistent type mapping
- Reduces maintenance burden

---

## Risk Considerations

### Schema Endpoint Security
**Risk:** Exposing schema metadata could aid attackers

**Mitigation:**
- JWT authentication required
- Rate limiting on endpoint
- Schema metadata doesn't include sensitive data values
- Audit logging of schema requests

### Cache Staleness
**Risk:** Sync using outdated cached schema after database change

**Mitigation:**
- TTL-based cache expiration (default: 1 hour)
- Manual cache refresh command
- Schema version header in API response
- Dashboard warning when cache is stale

### Code Generation Failures
**Risk:** Regeneration script produces invalid code

**Mitigation:**
- Dry-run mode to preview changes
- Automated syntax validation (TypeScript compiler)
- Unit tests for generator functions
- Rollback capability (git revert)
- Manual review before commit

### Breaking Schema Changes
**Risk:** Database changes break existing sync configurations

**Mitigation:**
- Validation layer detects missing fields
- Detailed error messages guide users
- Backwards compatibility checks in tests
- Schema migration documentation

---

## Performance Considerations

### Schema Introspection
- **Operation:** Query PostgreSQL information_schema
- **Frequency:** On-demand (CLI) or per-request (endpoint with caching)
- **Cost:** ~50-200ms for 4 tables
- **Optimization:** Cache at endpoint level, 1-hour TTL

### Schema Endpoint Response
- **Payload Size:** ~5-15KB JSON for 4 entities
- **Caching:** In-memory Map, invalidate on cache timeout
- **Concurrent Requests:** Read-only, highly cacheable

### Query Validation
- **Structure Validation:** O(n) field comparison, <1ms per record
- **Zod Validation:** Existing overhead, no change
- **Schema Fetch:** Once per sync run, cached thereafter

### Code Generation
- **Frequency:** Manual, triggered by developer
- **Duration:** ~2-5 seconds (introspect + generate + prisma generate)
- **Impact:** Build-time only, no runtime cost

---

## Conclusion

The schema-driven validation architecture establishes PostgreSQL as the authoritative source of truth and propagates structural changes through a well-defined pipeline:

1. **Schema Introspection Layer** reads database metadata
2. **Schema Distribution Endpoint** exposes metadata to remote sync instances
3. **Code Generation Pipeline** produces type-safe Prisma and Zod artifacts
4. **Runtime Validation Layer** enforces contracts during synchronization

This architecture maintains the existing deployment model (separate servers) while eliminating manual schema synchronization, reducing validation errors, and providing robust tooling for schema evolution.

**Key Build Order:**
1. Introspection foundation
2. Schema HTTP endpoint
3. CLI regeneration tooling
4. Enhanced query validation
5. Integration testing

Each component has clear boundaries, defined interfaces, and explicit dependencies, enabling incremental development and testing.
