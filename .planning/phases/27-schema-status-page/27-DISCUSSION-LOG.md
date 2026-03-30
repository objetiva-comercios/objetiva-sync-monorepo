# Phase 27: Schema Status Page - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-03-30
**Phase:** 27-schema-status-page
**Areas discussed:** Navigation & page switching, Schema table layout, Entity switching, Alignment indicators

---

## Navigation & Page Switching

| Option | Description | Selected |
|--------|-------------|----------|
| Top tab bar | Horizontal tabs at top ("Dashboard" / "Schema Status"), conditional rendering with useState, no router | ✓ |
| Header with nav links | Persistent header/navbar with app title and nav links, still no router | |
| Add react-router | Install react-router-dom for URL-based routing, heavier but future-proof | |

**User's choice:** Top tab bar
**Notes:** Lightweight approach, consistent with current single-page structure. No router dependency needed.

---

## Schema Table Layout

| Option | Description | Selected |
|--------|-------------|----------|
| Single table, 3 sub-columns | One table per entity: Field Name / PostgreSQL / Compiled / Sync / Status. Compact, easy to scan. | ✓ |
| Layered cards | Three stacked cards per entity (one per layer), harder to spot per-field differences | |
| Diff view | Side-by-side diff format highlighting only differences, hides aligned fields | |

**User's choice:** Single table, 3 sub-columns
**Notes:** Shows all 3 layers side by side for easy comparison. Each layer shows data_type + is_nullable.

---

## Entity Switching

| Option | Description | Selected |
|--------|-------------|----------|
| Entity tabs | Horizontal tabs below page title, one per entity, with summary badge showing mismatch count | ✓ |
| All entities stacked | Show all 4 entity tables in single scrollable page | |
| Summary cards + expand | 4 summary cards, click to expand full comparison table | |

**User's choice:** Entity tabs with summary badges
**Notes:** Each tab shows entity name + status badge (e.g. "2 mismatched" or green checkmark for fully aligned).

---

## Alignment Indicators

| Option | Description | Selected |
|--------|-------------|----------|
| Color dot + row tint | Colored circle in Status column + subtle row background tint (red-50 for mismatch, yellow-50 for missing) | ✓ |
| Lucide icons only | CheckCircle/XCircle/AlertTriangle icons, no row background tinting | |
| Badge chips | Colored badge/pill with text label, more explicit but wider | |

**User's choice:** Color dot + row tint
**Notes:** Combines dot indicator with row-level background color for quick visual scanning. Aligned rows neutral, mismatched red-tinted, missing yellow-tinted.

---

## Claude's Discretion

- Loading and error state handling (follow existing Dashboard.tsx patterns)
- Handling of `sync_reported: false` state
- Table styling details (borders, padding, headers)
- Entity summary counts above the table

## Deferred Ideas

None — discussion stayed within phase scope
