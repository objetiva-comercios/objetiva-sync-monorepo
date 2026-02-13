# Phase 17: Dashboard Modernization - Context

**Gathered:** 2026-02-13
**Status:** Ready for planning

<domain>
## Phase Boundary

Replace existing HTMX dashboards with a unified React + shadcn/ui dashboard in a shared monorepo package. The new dashboard displays origin tracking information, auth status, and metrics visualizations from Phases 14-16. This is a full replacement, not incremental migration.

</domain>

<decisions>
## Implementation Decisions

### Component Scope
- Full dashboard replacement with React + shadcn/ui (not partial migration)
- Default shadcn styling with minimal customization
- Sidebar navigation with sections (Records, Metrics, Settings, etc.)
- Pagination for data tables (25-50 rows per page)

### Origin Display
- Origin source and timestamp as inline table columns (visible by default)
- Visual indicator (badge/color) for records that had recent conflicts
- Source filter dropdown to browse records by origin
- Source identifier format: Claude's discretion based on available data

### Metrics Visualization
- Time-series line charts for sync duration over time (using Recharts)
- Auto-refresh every 10-30 seconds while viewing
- Default time range: last 7 days

### Migration Strategy
- Separate routes during migration: `/dashboard` (React) vs `/admin` (HTMX)
- Shared dashboard package in monorepo (used by both objetiva-sync and objetiva-sync-gateway)
- Remove HTMX dashboard after this phase is verified working
- API endpoints: Claude's discretion (reuse existing or create optimized endpoints)

### Claude's Discretion
- Exact source identifier display format (full hostname vs short label)
- API strategy (reuse vs new endpoints based on current structure)
- Auto-refresh interval (10-30 second range)
- Dark mode implementation details

</decisions>

<specifics>
## Specific Ideas

- "This is a monorepo, maybe this has to be accessible by both (objetiva-sync and objetiva-sync-gateway)"
- User clarified: current work is on objetiva-sync dashboard, not gateway-specific

</specifics>

<deferred>
## Deferred Ideas

None - discussion stayed within phase scope

</deferred>

---

*Phase: 17-dashboard-modernization*
*Context gathered: 2026-02-13*
