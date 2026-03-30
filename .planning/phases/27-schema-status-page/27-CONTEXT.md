# Phase 27: Schema Status Page - Context

**Gathered:** 2026-03-30
**Status:** Ready for planning

<domain>
## Phase Boundary

React dashboard page in the gateway showing schema alignment across all 3 layers (PostgreSQL live, gateway compiled, sync reported) for all 4 entities. Consumes the Phase 26 comparison API (`GET /api/schemas/compare`). Delivers SCHEMA-01 (full column details) and SCHEMA-03 (color-coded alignment indicators).

</domain>

<decisions>
## Implementation Decisions

### Navigation & Page Switching
- **D-01:** Top tab bar with conditional rendering (`useState`). Two tabs: "Dashboard" and "Schema Status". No router needed — simple state toggle in `App.tsx`.
- **D-02:** Tab bar sits at the top of the page, above existing Dashboard content. Both pages render based on active tab state.

### Schema Table Layout
- **D-03:** Single comparison table per entity with columns: Field Name | PostgreSQL (type, nullable) | Compiled (type, nullable) | Sync (type, nullable) | Status.
- **D-04:** Each layer sub-column shows `data_type` and `is_nullable` info. When a layer is null/missing, show "—" placeholder.

### Entity Switching
- **D-05:** Horizontal entity tabs below the page title, one per entity. Click to switch which entity's comparison table is displayed.
- **D-06:** Each entity tab shows a summary badge with mismatch/missing count (e.g. "2 mismatched"). Fully aligned entities show a green checkmark.

### Alignment Indicators
- **D-07:** Status column shows colored circle indicator: green for aligned, red for mismatched, yellow for missing.
- **D-08:** Entire row gets subtle background tint: neutral for aligned, light red (red-50) for mismatched, light yellow (yellow-50) for missing fields.
- **D-09:** Status text displayed next to dot: "Aligned", "Mismatch", "Missing".

### Claude's Discretion
- Loading state and error handling patterns (follow existing Dashboard.tsx patterns)
- How to handle `sync_reported: false` state (informational banner vs inline indicator)
- Table styling details (borders, padding, header style) — follow existing dashboard design system
- Whether to show entity summary counts at the top of the page before the table

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Phase 26 API (data source)
- `objetiva-sync-gateway/src/routes/schema-comparison.ts` — `GET /api/schemas/compare` returns `EntityComparison[]`
- `objetiva-sync-gateway/src/services/schema-comparison.ts` — `EntityComparison`, `ComparisonFieldRow`, `FieldLayerData` type definitions

### Existing Dashboard
- `objetiva-sync-gateway/dashboard/src/App.tsx` — Entry point, currently renders `<Dashboard />` directly (will need tab bar)
- `objetiva-sync-gateway/dashboard/src/components/Dashboard.tsx` — Existing dashboard page with loading/error patterns to follow
- `objetiva-sync-gateway/dashboard/src/hooks/useGatewayData.ts` — Data fetching hook pattern to replicate for schema comparison
- `objetiva-sync-gateway/dashboard/src/components/ui/card.tsx` — Existing UI component

### Design System
- `objetiva-sync-gateway/dashboard/package.json` — Dependencies: React 18, Tailwind CSS 3.4, Lucide React, clsx, tailwind-merge, CVA

### Requirements
- `.planning/REQUIREMENTS.md` — SCHEMA-01 (show all columns/types/nullable/defaults/comments), SCHEMA-03 (green/red/yellow alignment indicators)

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `Dashboard.tsx` loading/error states: Spinner with `RefreshCw` icon, error card with retry button — same pattern for Schema Status
- `useGatewayData` hook: Fetch-on-mount + periodic refresh pattern — replicate for schema comparison data
- `ui/card.tsx`: Card component with shadow/rounded variants
- `MetricCard`, `EntityCard` components: Card-based layouts already established
- Lucide icons available: `CheckCircle`, `XCircle`, `AlertTriangle`, `Database`, `RefreshCw`

### Established Patterns
- Components use Tailwind utility classes directly
- `clsx` + `tailwind-merge` for conditional class composition
- Dark theme with `gradient-bg grid-pattern` background classes
- `text-muted-foreground`, `text-primary`, `bg-primary` CSS custom property tokens

### Integration Points
- `App.tsx` — Add tab bar state and conditional rendering
- New `SchemaStatus.tsx` component in `components/`
- New `useSchemaComparison.ts` hook in `hooks/`
- API endpoint: `GET /api/schemas/compare` (Phase 26, JWT auth required)

</code_context>

<specifics>
## Specific Ideas

No specific requirements — open to standard approaches

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope

</deferred>

---

*Phase: 27-schema-status-page*
*Context gathered: 2026-03-30*
