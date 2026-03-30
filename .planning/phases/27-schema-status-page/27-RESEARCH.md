# Phase 27: Schema Status Page - Research

**Researched:** 2026-03-30
**Domain:** React dashboard page, Tailwind CSS, JWT-authenticated data fetching, schema comparison rendering
**Confidence:** HIGH

---

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

- **D-01:** Top tab bar with conditional rendering (`useState`). Two tabs: "Dashboard" and "Schema Status". No router needed — simple state toggle in `App.tsx`.
- **D-02:** Tab bar sits at the top of the page, above existing Dashboard content. Both pages render based on active tab state.
- **D-03:** Single comparison table per entity with columns: Field Name | PostgreSQL (type, nullable) | Compiled (type, nullable) | Sync (type, nullable) | Status.
- **D-04:** Each layer sub-column shows `data_type` and `is_nullable` info. When a layer is null/missing, show "—" placeholder.
- **D-05:** Horizontal entity tabs below the page title, one per entity. Click to switch which entity's comparison table is displayed.
- **D-06:** Each entity tab shows a summary badge with mismatch/missing count (e.g. "2 problemas"). Fully aligned entities show a green checkmark.
- **D-07:** Status column shows colored circle indicator: green for aligned, red for mismatched, yellow for missing.
- **D-08:** Entire row gets subtle background tint: neutral for aligned, light red (`bg-red-500/10`) for mismatched, light yellow (`bg-yellow-500/10`) for missing fields.
- **D-09:** Status text displayed next to dot: "Alineado", "Desincronizado", "Faltante".

### Claude's Discretion

- Loading state and error handling patterns (follow existing Dashboard.tsx patterns)
- How to handle `sync_reported: false` state (informational banner vs inline indicator)
- Table styling details (borders, padding, header style) — follow existing dashboard design system
- Whether to show entity summary counts at the top of the page before the table

### Deferred Ideas (OUT OF SCOPE)

None — discussion stayed within phase scope.
</user_constraints>

---

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| SCHEMA-01 | Dashboard del gateway muestra pagina de Schema Status con todas las columnas, tipos, nullable, defaults y comentarios de cada entidad | `EntityComparison.fields[]` contains `ComparisonFieldRow` with `column_name`, `data_type`, `is_nullable` per layer. The `SchemaComparisonTable` renders all fields in a 5-column table. |
| SCHEMA-03 | Schema Status indica visualmente campos alineados (verde), desincronizados (rojo) y nuevos no propagados (amarillo) | `ComparisonFieldRow.status` is `'aligned' | 'mismatched' | 'missing'`. D-07/D-08/D-09 map these to emerald-400/red-400/yellow-400 dot + row tint pattern. |
</phase_requirements>

---

## Summary

Phase 27 is a pure React frontend phase. The backend API (`GET /api/schemas/compare`) was delivered in Phase 26 and is fully implemented. This phase adds a "Schema Status" tab to the gateway dashboard (`App.tsx`), a `useSchemaComparison` hook that fetches from the compare endpoint with JWT auth, and several new display components.

The critical discovery is that `GET /api/schemas/compare` requires a JWT Bearer token (via `authenticate` middleware), but the existing dashboard makes **unauthenticated** requests. The hook must obtain a token via `POST /api/setup/token` (which is unauthenticated and always available) and attach it as `Authorization: Bearer <token>` to the compare fetch. This is the only architectural gap between the existing hook pattern and the new hook.

The UI contract is fully specified in `27-UI-SPEC.md`. All design decisions are locked. Implementation follows established patterns exactly: same loading/error state structure as `Dashboard.tsx`, same hook pattern as `useGatewayData.ts`, same Tailwind utility class conventions, same `cn()` helper from `lib/utils.ts`.

**Primary recommendation:** Implement 4 files in this order: (1) `useSchemaComparison.ts` hook with JWT token acquisition, (2) `SchemaStatus.tsx` page root, (3) `SchemaComparisonTable.tsx` table component, (4) `SchemaEntityTabs.tsx` entity switcher. Then modify `App.tsx` to add the top tab bar.

---

## Standard Stack

### Core (already installed in dashboard)

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| React | 18.3.1 | UI rendering, `useState`, `useEffect`, `useCallback` | Project standard |
| Tailwind CSS | 3.4.1 | Utility-class styling | Project standard |
| lucide-react | 0.263.1 | Icon set: `CheckCircle2`, `XCircle`, `AlertTriangle`, `RefreshCw`, `Database` | Project standard — CLAUDE.md mandates Lucide icons |
| clsx | 2.1.0 | Conditional class composition | Project standard |
| tailwind-merge | 2.2.0 | Merges conflicting Tailwind classes | Project standard |
| class-variance-authority | 0.7.0 | Component variant API (CVA) | Project standard |

**No new packages to install.** All dependencies are already present in `dashboard/package.json`.

### Existing Utilities (reuse, do not rebuild)

| Utility | Location | Use in Phase 27 |
|---------|----------|-----------------|
| `cn()` | `src/lib/utils.ts` | All conditional class composition |
| `getEntityLabel()` | `src/lib/utils.ts` | Display entity names in entity tabs |
| `Card`, `CardHeader`, `CardContent` | `src/components/ui/card.tsx` | Wraps table and entity tab bar |

---

## Architecture Patterns

### Recommended File Structure (new files only)

```
objetiva-sync-gateway/dashboard/src/
├── hooks/
│   └── useSchemaComparison.ts    # New: data hook with JWT auth
├── components/
│   ├── SchemaStatus.tsx          # New: page root component
│   ├── SchemaComparisonTable.tsx # New: per-entity comparison table
│   └── SchemaEntityTabs.tsx      # New: horizontal entity tab switcher
└── App.tsx                       # Modified: add top-level tab bar
```

No new directories needed. All files go into existing `hooks/` and `components/` directories.

### Pattern 1: JWT Token Acquisition in useSchemaComparison

**What:** The compare endpoint requires a JWT Bearer token. The dashboard has no auth session. `POST /api/setup/token` (unauthenticated) issues a valid token.

**Why this is the correct approach:** `POST /api/setup/token` is always enabled regardless of gateway mode (per comment in `setup.ts`: "Always allowed: the wizard is served on /setup regardless of mode, and operators need to re-pair without restarting the gateway."). The token is signed with the same `JWT_SECRET` the gateway uses for all other JWT operations.

**When to use:** Only `useSchemaComparison` needs this — the existing `useGatewayData` fetches unauthenticated endpoints (`/api/stats`, `/api/status`).

**Example:**
```typescript
// Source: objetiva-sync-gateway/src/routes/setup.ts (POST /api/setup/token)
// Source: objetiva-sync-gateway/src/middleware/auth.ts (Authorization: Bearer pattern)

const API_BASE = '/api'
const POLL_INTERVAL = 10_000

export function useSchemaComparison() {
  const [data, setData] = useState<EntityComparison[] | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const tokenRef = useRef<string | null>(null)

  const getToken = useCallback(async (): Promise<string> => {
    if (tokenRef.current) return tokenRef.current
    const res = await fetch(`${API_BASE}/setup/token`, { method: 'POST' })
    if (!res.ok) throw new Error('Failed to obtain auth token')
    const body = await res.json()
    tokenRef.current = body.token
    return body.token
  }, [])

  const fetchData = useCallback(async () => {
    try {
      const token = await getToken()
      const res = await fetch(`${API_BASE}/schemas/compare`, {
        headers: { Authorization: `Bearer ${token}` }
      })
      if (!res.ok) throw new Error(`API error ${res.status}`)
      const json = await res.json()
      setData(json)
      setError(null)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch schemas')
    } finally {
      setIsLoading(false)
    }
  }, [getToken])

  useEffect(() => {
    fetchData()
    const interval = setInterval(fetchData, POLL_INTERVAL)
    return () => clearInterval(interval)
  }, [fetchData])

  return { data, isLoading, error, refresh: fetchData }
}
```

**Token caching:** Store the token in a `useRef` (not state, to avoid re-renders). Re-use on every poll. If a 401 is returned, clear `tokenRef.current` and retry once — handles token expiry gracefully.

### Pattern 2: Loading / Error States (copy from Dashboard.tsx)

**What:** Full-page spinner for initial load; centered error card with retry button for errors.

**Example:**
```typescript
// Source: objetiva-sync-gateway/dashboard/src/components/Dashboard.tsx (lines 11-39)
// Loading — identical except copy string
if (isLoading && !data) {
  return (
    <div className="min-h-screen gradient-bg grid-pattern flex items-center justify-center">
      <div className="text-center space-y-4">
        <RefreshCw className="w-16 h-16 text-primary animate-spin mx-auto" />
        <p className="text-xl font-semibold text-muted-foreground">Cargando schemas...</p>
      </div>
    </div>
  )
}

// Error
if (error) {
  return (
    <div className="min-h-screen gradient-bg grid-pattern flex items-center justify-center">
      <div className="text-center space-y-4 max-w-md">
        <AlertCircle className="w-16 h-16 text-red-400 mx-auto" />
        <h2 className="text-2xl font-bold">Error al cargar schemas</h2>
        <p className="text-muted-foreground">{error}</p>
        <button onClick={refresh}
          className="px-4 py-2 bg-primary text-primary-foreground rounded-lg hover:opacity-90 transition-opacity">
          Reintentar
        </button>
      </div>
    </div>
  )
}
```

### Pattern 3: Status Dot + Row Tint

**What:** Maps `ComparisonFieldRow.status` to color tokens. Dot is a 6px `rounded-full inline-block`. Row tint is applied via `cn()` on the `<tr>`.

**Example:**
```typescript
// Source: 27-CONTEXT.md D-07, D-08, D-09 / 27-UI-SPEC.md Semantic Alignment Colors

const STATUS_CONFIG = {
  aligned:    { dot: 'bg-emerald-400', row: '',               text: 'text-emerald-400', label: 'Alineado' },
  mismatched: { dot: 'bg-red-400',     row: 'bg-red-500/10',  text: 'text-red-400',     label: 'Desincronizado' },
  missing:    { dot: 'bg-yellow-400',  row: 'bg-yellow-500/10', text: 'text-yellow-400', label: 'Faltante' },
}

// Row usage:
<tr className={cn('border-b border-border transition-colors', STATUS_CONFIG[field.status].row)}>
  ...
  <td>
    <span className={cn('inline-block w-1.5 h-1.5 rounded-full mr-2', STATUS_CONFIG[field.status].dot)} />
    <span className={cn('text-sm', STATUS_CONFIG[field.status].text)}>
      {STATUS_CONFIG[field.status].label}
    </span>
  </td>
</tr>
```

### Pattern 4: Entity Tab Bar with Summary Badge

**What:** Horizontal tab row. Each tab shows entity display name + badge. Badge shows problem count or green checkmark.

**Example:**
```typescript
// Source: 27-CONTEXT.md D-05, D-06 / 27-UI-SPEC.md SchemaEntityTabs

{entities.map((entity) => {
  const problems = entity.summary.mismatched + entity.summary.missing
  const isActive = entity.entity === activeEntity
  return (
    <button
      key={entity.entity}
      onClick={() => onSelect(entity.entity)}
      className={cn(
        'flex items-center gap-2 px-4 min-h-[44px] text-sm font-medium border-b-2 transition-colors',
        isActive
          ? 'border-primary text-primary font-bold'
          : 'border-transparent text-muted-foreground hover:text-foreground'
      )}
    >
      {getEntityLabel(entity.entity)}
      {problems === 0
        ? <CheckCircle2 className="w-4 h-4 text-emerald-400" />
        : <span className="text-xs bg-muted px-1.5 py-0.5 rounded-full">
            {problems} {problems === 1 ? 'problema' : 'problemas'}
          </span>
      }
    </button>
  )
})}
```

### Pattern 5: App.tsx Tab Bar (top-level navigation)

**What:** Adds two tabs at the very top of the app. Existing `<Dashboard />` becomes one of the tabs.

**Example:**
```typescript
// Source: 27-CONTEXT.md D-01, D-02 / 27-UI-SPEC.md Navigation Change

function App() {
  const [activeTab, setActiveTab] = useState<'dashboard' | 'schema'>('dashboard')

  return (
    <div>
      {/* Top tab bar */}
      <nav className="bg-card border-b border-border">
        <div className="max-w-[1600px] mx-auto px-4 flex gap-0">
          {(['dashboard', 'schema'] as const).map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={cn(
                'px-6 min-h-[44px] text-sm font-medium border-b-2 transition-colors',
                activeTab === tab
                  ? 'border-primary text-primary font-bold'
                  : 'border-transparent text-muted-foreground hover:text-foreground'
              )}
            >
              {tab === 'dashboard' ? 'Dashboard' : 'Schema Status'}
            </button>
          ))}
        </div>
      </nav>
      {/* Page content */}
      {activeTab === 'dashboard' ? <Dashboard /> : <SchemaStatus />}
    </div>
  )
}
```

### Pattern 6: Layer Cell Rendering

**What:** Each of the three layer columns (PostgreSQL, Compilado, Sync) renders `data_type` in mono font and `is_nullable` as YES/NO in muted text. When the layer is `null`, renders "—".

**Example:**
```typescript
// Source: 27-CONTEXT.md D-04 / 27-UI-SPEC.md SchemaComparisonTable

function LayerCell({ layer }: { layer: FieldLayerData | null }) {
  if (!layer) return <td className="px-4 py-2 text-muted-foreground">—</td>
  return (
    <td className="px-4 py-2">
      <span className="font-mono text-sm">{layer.data_type}</span>
      <span className="block text-xs text-muted-foreground">
        {layer.is_nullable ? 'YES' : 'NO'}
      </span>
    </td>
  )
}
```

### Anti-Patterns to Avoid

- **Re-fetching a new token on every poll:** Cache the token in `useRef`, only re-fetch when null or on 401 response.
- **Using `useState` for the token:** Token storage in ref avoids unnecessary re-renders on every poll cycle.
- **Importing `EntityComparison` / `ComparisonFieldRow` types from gateway source:** The dashboard cannot import from `../../../src/services/...`. Define a local copy of the types in `src/types/index.ts` or inline in the hook file.
- **Using `font-medium` (weight 500) for labels:** The UI-SPEC mandates only weights 400 and 700. Column headers use `text-xs font-bold`, body uses `text-sm` (default 400).
- **Applying `cn()` from scratch:** Import from `@/lib/utils`, never inline a custom merge function.
- **Wrapping `gradient-bg grid-pattern` around table only:** The full page wrapper needs `min-h-screen gradient-bg grid-pattern`, matching Dashboard pattern exactly.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Class conditional merging | Custom string interpolation | `cn()` from `@/lib/utils` | Already handles Tailwind conflicts correctly |
| Fetch with retry/interval | Custom polling logic | Mirror `useGatewayData` pattern exactly | Proven pattern; handles cleanup via `clearInterval` on unmount |
| Status color mapping | Scattered `if/else` chains | `STATUS_CONFIG` lookup object | Single source of truth; easier to maintain |
| Entity display names | Hardcoded strings per component | `getEntityLabel()` from `@/lib/utils` | Already maps all 4 entity names with accents |
| JWT token endpoint | Custom auth endpoint | `POST /api/setup/token` (existing) | Already implemented, always enabled, correct JWT_SECRET |

**Key insight:** Every utility, hook pattern, style token, and type needed for this phase already exists in the codebase. This phase is purely assembly of known patterns with new data shapes.

---

## Common Pitfalls

### Pitfall 1: Token not sent with Authorization header
**What goes wrong:** `fetch('/api/schemas/compare')` without headers returns 401 — the dashboard appears to load but stays in error state forever.
**Why it happens:** Developers copy `useGatewayData` directly, which never sends auth headers (stats/status are unauthenticated routes).
**How to avoid:** In `useSchemaComparison`, always call `getToken()` first and pass `{ headers: { Authorization: 'Bearer ' + token } }` to the fetch.
**Warning signs:** Network tab shows 401 response on `/api/schemas/compare`.

### Pitfall 2: Importing gateway TypeScript types directly into dashboard
**What goes wrong:** `import type { EntityComparison } from '../../../src/services/schema-comparison'` fails at Vite build time — the dashboard cannot traverse outside its `src/` directory to the gateway `src/`.
**Why it happens:** Types are defined in the gateway service file, tempting direct import.
**How to avoid:** Define a local `SchemaTypes` interface in `src/types/index.ts` or inline in `useSchemaComparison.ts`. Copy the `EntityComparison`, `ComparisonFieldRow`, and `FieldLayerData` interface shapes verbatim.
**Warning signs:** Vite build error mentioning path resolution failure or files outside project root.

### Pitfall 3: Token expiry causing infinite 401 loop
**What goes wrong:** If the JWT expires mid-session, every poll gets 401, the token is re-fetched, but the new token is also immediately invalid (misconfigured expiry), causing an infinite loop.
**Why it happens:** Not clearing the cached token on 401 response, OR the `JWT_EXPIRES_IN` env var is set very short.
**How to avoid:** On 401 response: clear `tokenRef.current = null` and retry once. If second attempt also 401, set error state and stop retrying.
**Warning signs:** Rapid 401 responses in network tab, browser console flood of fetch calls.

### Pitfall 4: Active tab defaulting to wrong entity
**What goes wrong:** Entity tab defaults to `undefined` or the last entity instead of first.
**Why it happens:** `useState('')` as initial entity, or not initializing from API data when it arrives.
**How to avoid:** In `SchemaStatus.tsx`, when `data` first becomes non-null, initialize `activeEntity` to `data[0]?.entity`. Use `useEffect` watching `data` to set initial entity if `activeEntity` is empty.
**Warning signs:** Table renders empty on initial load, entity tabs don't highlight correctly.

### Pitfall 5: `sync_reported: false` not checked at page level
**What goes wrong:** The banner is shown per-entity (checking only the active entity), but `sync_reported` applies to the entire store (all entities have the same value). Shows/hides banner incorrectly when switching entities.
**Why it happens:** Checking `activeComparison.sync_reported` instead of `data.some(e => !e.sync_reported)` or `data[0].sync_reported`.
**How to avoid:** Check `sync_reported` once from any entity (they all share the same `syncSchemaStore.hasData()` result). Show banner at page level based on `data[0]?.sync_reported === false`.

### Pitfall 6: Row tint overriding hover/focus styles
**What goes wrong:** `bg-red-500/10` and `bg-yellow-500/10` on `<tr>` conflict with hover states added later.
**Why it happens:** Tailwind's base tint class takes precedence when both classes are present without specificity management.
**How to avoid:** Use `cn()` to merge — apply row tint in one conditional, hover in another. Or omit hover on colored rows (the UI-SPEC does not specify hover effects on table rows).

---

## Code Examples

### Type definitions to copy into dashboard types

```typescript
// Add to: objetiva-sync-gateway/dashboard/src/types/index.ts
// Source: objetiva-sync-gateway/src/services/schema-comparison.ts

export interface FieldLayerData {
  data_type: string
  is_nullable: boolean
}

export interface ComparisonFieldRow {
  column_name: string
  status: 'aligned' | 'mismatched' | 'missing'
  postgresql: FieldLayerData | null
  compiled: FieldLayerData | null
  sync: FieldLayerData | null
}

export interface EntityComparison {
  entity: string
  sync_reported: boolean
  summary: {
    aligned: number
    mismatched: number
    missing: number
  }
  fields: ComparisonFieldRow[]
}
```

### SyncNotReportedBanner component

```typescript
// Source: 27-UI-SPEC.md SyncNotReportedBanner

import { AlertTriangle } from 'lucide-react'

export function SyncNotReportedBanner() {
  return (
    <div className="bg-yellow-500/10 border border-yellow-500/30 rounded-lg p-3 flex items-start gap-2">
      <AlertTriangle className="w-4 h-4 text-yellow-400 mt-0.5 shrink-0" />
      <p className="text-sm text-yellow-400">
        Sync no ha reportado schemas al gateway. Los datos de la columna Sync no están disponibles.
      </p>
    </div>
  )
}
```

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Router-based navigation (React Router) | `useState` tab toggle in `App.tsx` | D-01 decision | No dependency needed; simpler state management |
| Per-fetch token request | Cached token in `useRef`, re-fetch on 401 only | Phase 27 research | Eliminates 1 extra request per 10-second poll cycle |

---

## Open Questions

1. **Token expiry duration**
   - What we know: `JWT_EXPIRES_IN` is configurable via env var; defaults to `undefined` (no expiry) when not set.
   - What's unclear: Production deployments may set a short expiry (e.g., `3600` seconds = 1 hour).
   - Recommendation: Implement the 401-retry-once pattern to handle expiry gracefully. Document in hook comments that token refresh on 401 is intentional.

2. **SCHEMA-01 mentions defaults and comments — API only returns `data_type` + `is_nullable`**
   - What we know: `ComparisonFieldRow` only carries `data_type` and `is_nullable` per layer (D-09 in Phase 26). REQUIREMENTS.md SCHEMA-01 mentions "defaults y comentarios".
   - What's unclear: Whether SCHEMA-01 requires displaying defaults/comments or whether the 3-way comparison table satisfies the requirement by showing all available column data.
   - Recommendation: The API is the authoritative source for available data. Display everything the API provides (`data_type`, `is_nullable`). SCHEMA-01 is satisfied by showing column metadata across all 3 layers — defaults/comments are stored in PostgreSQL but not propagated by the Phase 26 comparison logic. Flag as informational: the planner should not add extra API calls for default/comment data unless explicitly requested.

---

## Environment Availability

Step 2.6: SKIPPED — this phase is purely frontend code changes in the dashboard. No external CLIs, services, or runtimes are required beyond Node.js (v22.14.0, verified) and the existing Vite dev server.

---

## Validation Architecture

### Test Framework

| Property | Value |
|----------|-------|
| Framework | None detected — no test config files, no `__tests__/` directory, no test scripts in `dashboard/package.json` |
| Config file | none |
| Quick run command | N/A — no framework installed |
| Full suite command | N/A |

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| SCHEMA-01 | Schema Status page renders column details table | manual-only | playwright-cli visual verification | ❌ Wave 0 |
| SCHEMA-03 | Color-coded alignment indicators rendered correctly | manual-only | playwright-cli visual verification | ❌ Wave 0 |

**Manual-only justification:** The dashboard has no test infrastructure. Both requirements are visual/interactive — they require browser rendering verification. Per project memory (`feedback_playwright_cli.md`), use playwright-cli for browser testing.

### Sampling Rate
- **Per task commit:** `playwright-cli screenshot` of schema status page
- **Phase gate:** Visual verification that all 3 status indicators appear and entity tab switching works before `/gsd:verify-work`

### Wave 0 Gaps
- [ ] No unit test framework — not required for this phase; visual verification via playwright-cli is sufficient
- [ ] No test files to create — validation is done manually via browser

---

## Sources

### Primary (HIGH confidence)
- `objetiva-sync-gateway/dashboard/src/components/Dashboard.tsx` — loading/error state patterns verified by reading source
- `objetiva-sync-gateway/dashboard/src/hooks/useGatewayData.ts` — hook pattern verified by reading source
- `objetiva-sync-gateway/src/services/schema-comparison.ts` — type definitions and API shape verified by reading source
- `objetiva-sync-gateway/src/routes/schema-comparison.ts` — JWT auth requirement verified by reading `preHandler: authenticate`
- `objetiva-sync-gateway/src/routes/setup.ts` — `POST /api/setup/token` always-available endpoint verified by reading source
- `objetiva-sync-gateway/dashboard/src/index.css` — CSS custom property tokens (colors) verified by reading source
- `objetiva-sync-gateway/dashboard/tailwind.config.js` — font families, animation keyframes verified by reading source
- `.planning/phases/27-schema-status-page/27-UI-SPEC.md` — complete UI design contract, verified as checker-approved
- `.planning/phases/27-schema-status-page/27-CONTEXT.md` — all locked decisions D-01 through D-09

### Secondary (MEDIUM confidence)
- `dashboard/package.json` — dependency versions (lucide-react 0.263.1, Tailwind 3.4.1, React 18.3.1) verified

### Tertiary (LOW confidence)
- None — all critical claims are verified from source files.

---

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — all packages verified from `package.json`
- Architecture: HIGH — all patterns traced to existing source files
- JWT token acquisition: HIGH — `POST /api/setup/token` route read and verified as unauthenticated
- Pitfalls: HIGH — derived from reading actual auth middleware and existing hook code
- SCHEMA-01 defaults/comments gap: MEDIUM — logical inference from comparing REQUIREMENTS.md with API type definitions

**Research date:** 2026-03-30
**Valid until:** 2026-04-30 (stable stack, no external dependencies)
