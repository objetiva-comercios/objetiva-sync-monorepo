# Phase 4: Enhanced Query Validation - Research

**Researched:** 2026-01-30
**Domain:** SQL query validation against live PostgreSQL schemas, schema caching, field suggestions
**Confidence:** HIGH

## Summary

This phase extends the existing validation system to use live schema metadata from the gateway, replacing static Zod schemas with dynamic schema-driven validation. The sync service will fetch schemas from the gateway's `/api/schemas/:entity` endpoint (built in Phase 2), cache them with 1-hour TTL, and validate SQL query outputs against the live PostgreSQL schema structure.

The existing `query-validator.ts` already implements Zod-based validation with `requiredFields` and `optionalFields` checks. Phase 4 enhances this by:
1. Fetching live schema metadata from gateway on startup
2. Auto-refreshing cache based on TTL
3. Adding SQL structure validation (column detection in SELECT queries)
4. Providing fuzzy "Did you mean?" suggestions for field name mismatches
5. Integrating validation into the dashboard's query save flow

**Primary recommendation:** Use the existing `SchemaResponse` type from Phase 3's codegen types, implement a simple in-memory cache with TTL refresh, use `fastest-levenshtein` for field suggestions, and validate at save-time in the dashboard API endpoint.

## Standard Stack

The established libraries/tools for this domain:

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| zod | ^3.x (existing) | Runtime schema validation | Already used throughout codebase, proven pattern |
| fastest-levenshtein | ^1.0.16 | Fuzzy string matching for "Did you mean?" | Fastest JS implementation, zero dependencies |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| node-fetch or native fetch | built-in | HTTP requests to gateway | Fetch schemas from gateway API |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| fastest-levenshtein | fuse.js | fuse.js is more powerful but overkill for simple column name matching |
| In-memory cache | Redis/cache-manager | Redis adds deployment complexity; in-memory sufficient for single-instance sync service |
| node-sql-parser | Manual regex | Parser handles edge cases (aliases, subqueries); regex fails on complex SQL |

**Installation:**
```bash
npm install fastest-levenshtein
```

Note: Most dependencies are already installed (zod, node-fetch patterns). Only `fastest-levenshtein` is new.

## Architecture Patterns

### Recommended Project Structure
```
objetiva-sync/src/
  services/
    schema-cache.ts         # NEW: Schema caching with TTL refresh
  sync/
    query-validator.ts      # MODIFY: Add live schema validation
    schema-validator.ts     # NEW: Schema-driven field validation
  dashboard/routes/api/
    queries.ts              # MODIFY: Add pre-save validation
```

### Pattern 1: Schema Cache Service
**What:** Singleton service that fetches and caches gateway schemas with automatic TTL refresh
**When to use:** Any validation that needs schema metadata
**Example:**
```typescript
// Source: Based on existing gateway schema-cache.ts pattern
interface CacheEntry {
  schema: SchemaResponse;
  fetchedAt: number;
  expiresAt: number;
}

const TTL_MS = 60 * 60 * 1000; // 1 hour

class SchemaCache {
  private cache = new Map<string, CacheEntry>();

  async getSchema(entity: string): Promise<SchemaResponse | null> {
    const entry = this.cache.get(entity);

    // Return cached if valid
    if (entry && Date.now() < entry.expiresAt) {
      return entry.schema;
    }

    // Fetch fresh from gateway
    try {
      const schema = await this.fetchFromGateway(entity);
      this.cache.set(entity, {
        schema,
        fetchedAt: Date.now(),
        expiresAt: Date.now() + TTL_MS,
      });
      return schema;
    } catch (error) {
      // Return stale cache on error (graceful degradation)
      return entry?.schema ?? null;
    }
  }
}
```

### Pattern 2: Field Validation with Suggestions
**What:** Validate query result columns against schema and provide "Did you mean?" suggestions
**When to use:** Before saving queries, during test-and-validate
**Example:**
```typescript
// Source: Pattern based on fastest-levenshtein docs
import { closest } from 'fastest-levenshtein';

function validateFields(
  queryColumns: string[],
  schemaColumns: ColumnMetadata[]
): ValidationError[] {
  const errors: ValidationError[] = [];
  const schemaColumnNames = schemaColumns.map(c => c.column_name);

  for (const column of queryColumns) {
    if (!schemaColumnNames.includes(column)) {
      const suggestion = closest(column, schemaColumnNames);
      const distance = levenshtein(column, suggestion);

      errors.push({
        field: column,
        type: 'UNEXPECTED_FIELD',
        message: `Field '${column}' not found in schema`,
        suggestion: distance <= 3 ? `Did you mean '${suggestion}'?` : undefined,
      });
    }
  }

  return errors;
}
```

### Pattern 3: Type Mismatch Detection
**What:** Compare actual query result types against expected schema types
**When to use:** When validating query test results
**Example:**
```typescript
function detectTypeMismatch(
  fieldValue: unknown,
  expectedType: string
): { mismatch: boolean; actualType: string; expectedType: string } {
  const actualType = typeof fieldValue;

  // Normalize PostgreSQL types to JS types
  const typeMap: Record<string, string[]> = {
    'varchar': ['string'],
    'text': ['string'],
    'int': ['number'],
    'decimal': ['number', 'string'], // Decimals can come as strings
    'boolean': ['boolean'],
    'timestamp': ['string', 'object'], // Date objects or ISO strings
    'jsonb': ['object', 'string'],
  };

  const expectedJsTypes = typeMap[expectedType] || ['unknown'];
  const mismatch = !expectedJsTypes.includes(actualType);

  return { mismatch, actualType, expectedType };
}
```

### Anti-Patterns to Avoid
- **Validating at runtime sync execution:** Validate at save-time only; runtime validation adds latency to every sync
- **Blocking on cache misses:** Always fall back to stale cache or skip validation if gateway is unreachable
- **Parsing SQL for complex validation:** Don't try to parse SQL to extract expected columns; validate actual query results instead
- **Storing schemas locally:** Don't persist schemas to disk; always fetch fresh from gateway source of truth

## Don't Hand-Roll

Problems that look simple but have existing solutions:

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| String similarity | Custom edit distance | fastest-levenshtein | Edge cases in Unicode, performance |
| Cache TTL management | setTimeout-based expiry | Check timestamp on get | Memory leaks, race conditions with timers |
| Field type coercion | Manual type checking | Zod transforms | Already have Zod, consistent error handling |
| Schema refresh on startup | Inline fetch logic | Dedicated initialization function | Testability, error handling isolation |

**Key insight:** The existing `query-validator.ts` already handles 80% of the validation logic. Phase 4 adds: (1) dynamic schema source, (2) suggestions, (3) integration with save flow.

## Common Pitfalls

### Pitfall 1: Stale Schema Cache Causing False Positives
**What goes wrong:** Schema changes in PostgreSQL, but cached schema doesn't reflect changes, causing valid queries to fail validation
**Why it happens:** 1-hour TTL means up to 1 hour of stale data
**How to avoid:**
1. After running `npm run regenerate-schemas`, manually clear sync service cache
2. Add `/api/cache/invalidate` endpoint for admin use
3. Log warnings when validation fails to help debug
**Warning signs:** Validation failures that work when testing directly against database

### Pitfall 2: Network Errors on Startup Blocking Sync Service
**What goes wrong:** Gateway unreachable on sync startup, service fails to start
**Why it happens:** Synchronous schema fetch in startup path
**How to avoid:**
1. Make schema fetch async and non-blocking
2. Allow service to start with empty cache
3. Validate with warning "schema unavailable" instead of hard failure
**Warning signs:** Sync service won't start when gateway is restarting

### Pitfall 3: "Did You Mean" Suggestions for Completely Wrong Fields
**What goes wrong:** Suggesting "customer_id" when user typed "total_amount" (unrelated)
**Why it happens:** Levenshtein distance doesn't consider semantic similarity
**How to avoid:**
1. Only suggest when distance <= 3 (catches typos, not completely different words)
2. Only suggest when field name length ratio is reasonable (0.5 to 2.0)
**Warning signs:** Confusing suggestions that mislead rather than help

### Pitfall 4: Circular Dependency Between Validation and Save
**What goes wrong:** Query save endpoint calls validation, which needs schema, which needs auth, which uses the same patterns
**Why it happens:** Tight coupling between validation and API layers
**How to avoid:**
1. Schema cache is a standalone singleton with its own auth handling
2. Validation functions are pure (take schema as parameter, don't fetch)
3. API layer orchestrates: fetch schema, call validation, handle result
**Warning signs:** Import cycles, "Cannot read property of undefined" errors

### Pitfall 5: Validating Against Wrong Entity Schema
**What goes wrong:** Query for `articulos` validated against `comprobantes` schema
**Why it happens:** Entity type mismatch between query configuration and validation call
**How to avoid:**
1. Entity type is part of query record, always pass it to validation
2. Schema cache keys by entity name
3. Add assertion: schema.entity === query.entityType
**Warning signs:** Validation passes queries with completely wrong field names

## Code Examples

Verified patterns from existing codebase and official sources:

### Startup Schema Loading
```typescript
// Source: Based on existing objectives-sync-gateway/src/codegen/index.ts
import { logger } from '../utils/logger.js';

async function loadSchemasOnStartup(): Promise<void> {
  const entities = ['articulos', 'comprobantes', 'comprobantes_detalle', 'comprobantes_pagos'];

  logger.info({ entities }, 'Loading schemas from gateway on startup');

  for (const entity of entities) {
    try {
      await schemaCache.getSchema(entity);
      logger.debug({ entity }, 'Schema loaded');
    } catch (error) {
      logger.warn({ entity, error }, 'Failed to load schema, will retry on first use');
    }
  }

  logger.info({ loadedCount: schemaCache.size() }, 'Startup schema loading complete');
}
```

### Validation Error with Suggestion
```typescript
// Source: Pattern combining Zod error structure with levenshtein
interface ValidationError {
  field: string;
  type: 'MISSING_REQUIRED' | 'UNEXPECTED_FIELD' | 'TYPE_MISMATCH';
  message: string;
  suggestion?: string;
  expectedType?: string;
  actualType?: string;
}

function formatValidationError(error: ValidationError): string {
  let message = `${error.field}: ${error.message}`;

  if (error.suggestion) {
    message += ` ${error.suggestion}`;
  }

  if (error.type === 'TYPE_MISMATCH' && error.expectedType && error.actualType) {
    message += ` (expected ${error.expectedType}, got ${error.actualType})`;
  }

  return message;
}
```

### Dashboard Query Save with Validation
```typescript
// Source: Extending existing objetiva-sync/src/dashboard/routes/api/queries.ts
app.post('/api/queries/save', async (request, reply) => {
  const { sqlQuery, entityType, ...rest } = request.body;

  // Step 1: Get live schema
  const schema = await schemaCache.getSchema(entityType);

  if (!schema) {
    logger.warn({ entityType }, 'Schema not available, skipping validation');
    // Proceed with save but log warning
  } else {
    // Step 2: Execute test query to get result structure
    const testResult = await executeQueryOnConnection(
      connection.adapterType,
      connection.config,
      `${sqlQuery} LIMIT 1`
    );

    // Step 3: Validate result against schema
    const validation = validateQueryAgainstSchema(testResult.rows, schema);

    if (!validation.isValid) {
      return reply.status(400).send({
        success: false,
        error: 'Query validation failed',
        validationErrors: validation.errors,
      });
    }
  }

  // Step 4: Save query
  // ... existing save logic
});
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Static Zod schemas in code | Dynamic schemas from gateway | Phase 4 | Schema changes propagate automatically |
| Manual field mapping | Direct column validation | This phase | Simpler configuration, fewer errors |
| Validation at sync runtime | Validation at save time | This phase | Fail fast, better UX |

**Deprecated/outdated:**
- `field_mappings` table: Removed in earlier phase, replaced by direct field validation
- `transformer.ts`: Removed, validation now in `query-validator.ts`

## Open Questions

Things that couldn't be fully resolved:

1. **Should validation block query save or just warn?**
   - What we know: Requirements say "Invalid queries cannot be saved" (VALID-08)
   - What's unclear: Edge cases like gateway unreachable, or schema temporarily out of sync
   - Recommendation: Block save on validation failure, but allow save with warning if gateway unreachable (logged)

2. **How to handle SELECT * queries?**
   - What we know: Cannot validate columns without knowing table structure
   - What's unclear: Should we prohibit SELECT * or validate at runtime?
   - Recommendation: Allow SELECT * but mark validation as "partial" - validate types at runtime if fields present

3. **Multi-table JOIN queries - which schema to validate against?**
   - What we know: Sync queries often join multiple tables
   - What's unclear: How to map joined columns to correct source schema
   - Recommendation: Validate against target entity schema only (the one being synced to)

## Sources

### Primary (HIGH confidence)
- Existing codebase: `objetiva-sync-gateway/src/services/schema-cache.ts` - TTL caching pattern
- Existing codebase: `objetiva-sync/src/sync/query-validator.ts` - Validation structure
- Existing codebase: `objetiva-sync-gateway/src/codegen/types.ts` - SchemaResponse type
- [fastest-levenshtein GitHub](https://github.com/ka-weihe/fastest-levenshtein) - Levenshtein implementation

### Secondary (MEDIUM confidence)
- [Zod Error Customization](https://zod.dev/error-customization) - Error message patterns
- [Ts.ED Cache documentation](https://tsed.dev/docs/cache.html) - Background refresh pattern
- [node-sql-parser npm](https://www.npmjs.com/package/node-sql-parser) - SQL parsing capabilities

### Tertiary (LOW confidence)
- General TypeScript caching patterns from Medium articles - Implementation details may vary

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH - Based on existing codebase patterns and verified npm packages
- Architecture: HIGH - Extends existing patterns already proven in Phase 2/3
- Pitfalls: MEDIUM - Some based on general experience, not project-specific testing

**Research date:** 2026-01-30
**Valid until:** 2026-03-01 (30 days - stable domain, existing patterns)
