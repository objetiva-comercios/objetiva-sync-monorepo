# Phase 26: Schema Comparison API - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md -- this log preserves the alternatives considered.

**Date:** 2026-03-29
**Phase:** 26-schema-comparison-api
**Areas discussed:** Schema reporting endpoint, In-memory storage, Comparison response structure, Compiled schema source

---

## Schema Reporting Endpoint

| Option | Description | Selected |
|--------|-------------|----------|
| POST /api/schemas/report | Sync sends a POST with all 4 entity schemas in a single request body. Gateway overwrites stored snapshot. Simple, one call per sync startup. | ✓ |
| PUT /api/schemas/report/:entity | Sync sends one PUT per entity (4 calls). Gateway stores each independently. More granular but more network calls. | |
| You decide | Claude picks the best approach based on codebase patterns | |

**User's choice:** POST /api/schemas/report
**Notes:** None

### Follow-up: When should sync call the report endpoint?

| Option | Description | Selected |
|--------|-------------|----------|
| On sync startup | Sync reports schemas once when it initializes, before the first sync cycle. | ✓ |
| Before each sync cycle | Reports schemas before every sync run. More up-to-date but adds overhead per cycle. | |
| You decide | Claude picks based on what makes sense for the architecture | |

**User's choice:** On sync startup
**Notes:** None

### Follow-up: Auth required?

| Option | Description | Selected |
|--------|-------------|----------|
| Yes, JWT auth | Uses existing authenticate middleware. Consistent with all other /api/* routes. | ✓ |
| No auth needed | Schema metadata is not sensitive. Simpler implementation but breaks the auth pattern. | |

**User's choice:** Yes, JWT auth
**Notes:** None

---

## In-Memory Storage

| Option | Description | Selected |
|--------|-------------|----------|
| Simple Map, no expiration | A Map<entity, schema> overwritten on each POST. Lost on restart, repopulated when sync reconnects. Matches existing schemaCache pattern. | ✓ |
| Map with TTL expiration | Schemas expire after N hours. Comparison API shows 'no sync data' if stale. Adds complexity. | |
| You decide | Claude picks the simplest approach that meets requirements | |

**User's choice:** Simple Map, no expiration
**Notes:** None

### Follow-up: Missing sync data handling?

| Option | Description | Selected |
|--------|-------------|----------|
| Show 'not reported' status | If sync hasn't connected, the sync layer shows as 'not reported' in comparison. | ✓ |
| Omit sync layer entirely | Only show 2-way comparison when sync hasn't reported. | |
| You decide | Claude picks based on what Phase 27 (UI) will need | |

**User's choice:** Show 'not reported' status
**Notes:** None

---

## Comparison Response Structure

| Option | Description | Selected |
|--------|-------------|----------|
| Per-field with 3 layers | Each field row has: { column_name, postgresql, compiled, sync, status }. Phase 27 can render directly as table rows. | ✓ |
| Flat diff list | Only list fields that differ, not aligned ones. Smaller payload but Phase 27 can't render full column table. | |
| You decide | Claude picks the structure that best serves Phase 27's UI needs | |

**User's choice:** Per-field with 3 layers
**Notes:** None

### Follow-up: Comparison attributes?

| Option | Description | Selected |
|--------|-------------|----------|
| data_type + is_nullable | Compare type and nullability. These break queries/validation if mismatched. | ✓ |
| data_type + is_nullable + default_value | Also compare defaults. More thorough but defaults often differ between layers. | |
| All column attributes | Compare everything: type, nullable, default, comment, ordinal position. | |

**User's choice:** data_type + is_nullable
**Notes:** None

### Follow-up: Single or per-entity endpoint?

| Option | Description | Selected |
|--------|-------------|----------|
| Single GET /api/schemas/compare | Returns comparison for all 4 entities in one request. Matches success criteria #3. | ✓ |
| Both: bulk + per-entity | GET /api/schemas/compare for all + GET /api/schemas/compare/:entity for one. | |

**User's choice:** Single GET /api/schemas/compare
**Notes:** None

---

## Compiled Schema Source

| Option | Description | Selected |
|--------|-------------|----------|
| Import generated TableSchemaMetadata | Each file in shared/schemas/generated/ already exports a tableSchemaMetadata object. Direct import, no transformation needed. | ✓ |
| Derive from Prisma client metadata | Use Prisma's DMMF to extract field types. Technically possible but types don't map 1:1 to PostgreSQL types. | |
| You decide | Claude picks the most reliable source for compiled schemas | |

**User's choice:** Import generated TableSchemaMetadata
**Notes:** None

---

## Claude's Discretion

- Comparison service internal architecture (class vs functions)
- Route registration pattern (follow existing schemas.ts)
- Sync-side client code for report endpoint
- Route file organization (new file vs extend existing)

## Deferred Ideas

None -- discussion stayed within phase scope
