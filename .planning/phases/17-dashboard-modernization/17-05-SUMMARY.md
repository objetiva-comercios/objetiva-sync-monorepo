# Phase 17 Plan 05: Origin Display Components Summary

**RecordsTable with origin tracking columns, OriginBadge for source display, SourceFilter for filtering**

---
phase: 17-dashboard-modernization
plan: 05
subsystem: dashboard
tags: [react, origin-tracking, shadcn, data-table, filtering]
dependency_graph:
  requires: [17-02, 17-03, 14]
  provides: [records-table, origin-badge, source-filter]
  affects: [17-06]
tech_stack:
  added: [@radix-ui/react-select]
  patterns: [origin-display, source-filtering, conflict-indicator]
key_files:
  created:
    - shared/dashboard/src/components/ui/badge.tsx
    - shared/dashboard/src/components/ui/select.tsx
    - shared/dashboard/src/components/data/origin-badge.tsx
    - shared/dashboard/src/components/data/source-filter.tsx
    - shared/dashboard/src/components/data/records-table.tsx
  modified:
    - shared/dashboard/package.json
    - shared/dashboard/src/index.ts
decisions: []
metrics:
  duration: ~10 minutes
  completed: 2026-02-13
---

## What Changed

### 1. Added Badge and Select shadcn Components

Installed required shadcn/ui primitives for displaying origin information:

**Badge** (`shared/dashboard/src/components/ui/badge.tsx`):
- Variants: default, secondary, destructive, outline
- Used for displaying origin source names

**Select** (`shared/dashboard/src/components/ui/select.tsx`):
- Full dropdown with trigger, content, items
- Accessible keyboard navigation via Radix UI
- Used for source filtering

### 2. Created OriginBadge Component

```typescript
// shared/dashboard/src/components/data/origin-badge.tsx

export interface OriginBadgeProps {
  source: string | null         // Source identifier
  hasConflict?: boolean         // Show conflict indicator
  conflictAt?: string | null    // Conflict timestamp for tooltip
  short?: boolean               // Truncate long names (default: true)
}

export function OriginBadge(props: OriginBadgeProps): JSX.Element
```

Features:
- Truncates source names longer than 15 characters
- Shows AlertCircle icon with destructive variant when hasConflict=true
- Tooltip shows full source name and conflict timestamp
- "Unknown" badge with outline variant for null sources

### 3. Created SourceFilter Component

```typescript
// shared/dashboard/src/components/data/source-filter.tsx

export interface SourceFilterProps {
  sources: string[]              // Available source options
  value: string                  // Currently selected source
  onChange: (value: string) => void
  placeholder?: string
}

export function SourceFilter(props: SourceFilterProps): JSX.Element
```

Features:
- Select dropdown with "All sources" option
- Fixed 200px width for consistent UI
- Integrates with RecordsTable filtering

### 4. Created RecordsTable Component

```typescript
// shared/dashboard/src/components/data/records-table.tsx

export interface SyncRecord {
  id: string | number
  entityType: string
  recordsSent: number
  recordsSuccess: number
  recordsFailed: number
  status: 'success' | 'failed' | 'partial'
  createdAt: string
  // Origin tracking (from Phase 14)
  origin_source?: string | null
  origin_timestamp?: string | null
  has_conflict?: boolean
  conflict_at?: string | null
}

export interface RecordsTableProps {
  apiEndpoint?: string           // Default: '/api/logs'
  refreshInterval?: number       // Default: 30000ms
  title?: string
  description?: string
  defaultPageSize?: PageSize     // 10, 25, 50, or 100
}

export function RecordsTable(props: RecordsTableProps): JSX.Element
```

Features:
- Six columns: Entity, Status, Records, Source, Origin Time, Synced At
- Auto-refresh via useInterval hook
- SourceFilter integration in card header
- Status column with color-coded text (green/red/yellow)
- Records column shows sent/success/failed breakdown
- Loading and error states with Card wrapper

### 5. Library Exports

All new components exported from package entry point:

```typescript
// shared/dashboard/src/index.ts

// Data components
export { RecordsTable, type RecordsTableProps, type SyncRecord } from './components/data/records-table'
export { OriginBadge, type OriginBadgeProps } from './components/data/origin-badge'
export { SourceFilter, type SourceFilterProps } from './components/data/source-filter'

// UI primitives
export { Badge, badgeVariants, type BadgeProps } from './components/ui/badge'
export { Select, SelectGroup, SelectValue, SelectTrigger, SelectContent, SelectLabel, SelectItem, SelectSeparator, SelectScrollUpButton, SelectScrollDownButton } from './components/ui/select'
```

## Component Usage

### Basic RecordsTable

```tsx
import { RecordsTable } from '@objetiva/dashboard'

// Default configuration
<RecordsTable />

// Custom endpoint and refresh
<RecordsTable
  apiEndpoint="/api/sync/logs"
  refreshInterval={10000}
  title="Recent Syncs"
  defaultPageSize={50}
/>
```

### Standalone OriginBadge

```tsx
import { OriginBadge } from '@objetiva/dashboard'

// Normal source
<OriginBadge source="server-1.company.com" />

// With conflict indicator
<OriginBadge
  source="server-2.company.com"
  hasConflict={true}
  conflictAt="2026-02-13T12:00:00Z"
/>

// Unknown source
<OriginBadge source={null} />
```

### Standalone SourceFilter

```tsx
import { SourceFilter } from '@objetiva/dashboard'

const [filter, setFilter] = useState('')
const sources = ['server-1', 'server-2', 'server-3']

<SourceFilter
  sources={sources}
  value={filter}
  onChange={setFilter}
/>
```

## API Compatibility

RecordsTable expects this response format from the API:

```typescript
// Option 1: {success: true, logs: [...]}
{
  success: true,
  logs: [
    {
      id: 1,
      entityType: "articulos",
      recordsSent: 100,
      recordsSuccess: 98,
      recordsFailed: 2,
      status: "partial",
      createdAt: "2026-02-13T12:00:00Z",
      origin_source: "server-1.company.com",
      origin_timestamp: "2026-02-13T11:55:00Z",
      has_conflict: false,
      conflict_at: null
    }
  ]
}

// Option 2: {success: true, data: [...]}
// Option 3: Direct array [...]
```

Origin tracking fields are optional for backwards compatibility with existing logs.

## Origin Tracking Integration

This plan provides UI for Phase 14's origin tracking feature:

| Phase 14 Field | UI Display |
|----------------|------------|
| origin_source | OriginBadge component |
| origin_timestamp | Origin Time column |
| has_conflict | Red badge with AlertCircle icon |
| conflict_at | Tooltip timestamp |

## Deviations from Plan

None - plan executed exactly as written.

## Commits

| Commit | Type | Description |
|--------|------|-------------|
| 2ef6754 | feat | Add badge and select shadcn components |
| 3f67f48 | feat | Create OriginBadge and SourceFilter components |
| 92364f1 | feat | Create RecordsTable with origin columns and exports |

## Verification Results

| Check | Result |
|-------|--------|
| badge.tsx exists | PASS |
| select.tsx exists | PASS |
| origin-badge.tsx exists | PASS |
| source-filter.tsx exists | PASS |
| records-table.tsx exists | PASS |
| `npm run build` succeeds | PASS |
| RecordsTable exported | PASS |
| OriginBadge exported | PASS |
| SourceFilter exported | PASS |
| SyncRecord type exported | PASS |

## Success Criteria

| Criterion | Status |
|-----------|--------|
| Records display origin_source as badge with truncation | PASS |
| Records display origin_timestamp column | PASS |
| Conflict indicator shows on records with has_conflict=true | PASS |
| Source filter dropdown populates from available sources | PASS |
| Filter updates table to show only matching records | PASS |

## Next Phase Readiness

**Ready for Plan 17-06 (Storybook Documentation)**

- All dashboard components created
- Components exported with TypeScript types
- RecordsTable integrates with DataTable from 17-03
- Charts from 17-04 can be combined with RecordsTable

**Dashboard integration points:**

- RecordsTable: Main sync logs view with origin columns
- OriginBadge: Reusable for any origin display needs
- SourceFilter: Reusable dropdown for source filtering
