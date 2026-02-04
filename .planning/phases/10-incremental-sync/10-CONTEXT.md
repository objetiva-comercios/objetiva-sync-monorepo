# Phase 10: Incremental Sync - Context

**Gathered:** 2026-02-04
**Status:** Ready for planning

<domain>
## Phase Boundary

Sync service fetches only records modified since last successful sync, dramatically reducing sync time for routine updates. Applies to all 4 entity types: articulos, comprobantes_cabecera, comprobantes_detalle, comprobantes_pagos. Full sync override available. Dashboard shows incremental vs full distinction and sync history.

**Note:** There is an initial incremental sync implementation already in the codebase. It is untested and may not work. Researcher should audit existing code before planning new work.

</domain>

<decisions>
## Implementation Decisions

### Timestamp tracking
- Modification timestamp field: `erp_fecha_sync` (same column name across all entity tables — researcher should verify this against the actual PostgreSQL schema)
- Timestamps stored **per entity type** (4 independent timestamps: articulos, comprobantes_cabecera, comprobantes_detalle, comprobantes_pagos)
- Stored in **SQLite sync.db** alongside existing sync state
- Records with NULL `erp_fecha_sync` are **always included** in every incremental sync (treated as "always modified")

### Full vs incremental behavior
- **First run** (no stored timestamp): automatic full sync, then incremental from there
- **Default mode** after first run: always incremental — user doesn't choose each time
- Full sync override: Claude's discretion on UX (checkbox, button, or other approach based on existing dashboard layout)
- **All 4 entity types** use incremental sync identically — no exceptions

### Failure & recovery
- On failure: **keep original timestamp** — don't update to last successful batch
- Next sync after failure re-fetches everything since last fully successful sync
- Duplicate processing is safe — gateway uses upsert (createMany with conflict handling), so re-processing is idempotent
- **Clock skew protection**: subtract a small overlap window (e.g., 5 minutes) from stored timestamp to catch edge-case records modified during previous sync

### Visibility & feedback
- Dashboard shows **'INCREMENTAL' or 'COMPLETA' badge** next to sync status/progress
- **Per-entity last sync timestamps** visible on dashboard (table or section showing when each entity type was last synced)
- During incremental sync, show **both counts**: modified records processed AND unchanged records skipped
- **Sync history section** on dashboard showing recent runs with type (incremental/full), record counts, and duration

### Claude's Discretion
- Full sync override UX approach (button, checkbox, etc.)
- Exact overlap window duration for clock skew protection
- Sync history table design and how many entries to show
- How to integrate with existing dashboard layout
- Whether to audit/fix/rewrite existing incremental sync code vs build from scratch

</decisions>

<specifics>
## Specific Ideas

- Existing incremental sync code in codebase should be audited first — may be partially working or provide useful patterns
- The `erp_fecha_sync` field name should be verified by researcher against actual PostgreSQL schema before implementation

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope

</deferred>

---

*Phase: 10-incremental-sync*
*Context gathered: 2026-02-04*
