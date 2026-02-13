# Phase 17: Dashboard Modernization - Research

**Researched:** 2026-02-13
**Domain:** React UI migration, shadcn/ui, monorepo shared packages
**Confidence:** HIGH

## Summary

Researched the full replacement of HTMX+EJS dashboards with a unified React + shadcn/ui dashboard in a shared monorepo package. The standard approach uses Vite for builds, npm workspaces for monorepo sharing, shadcn/ui with the new unified radix-ui package (February 2026), TanStack Table for data grids, and Recharts for metrics visualization.

**Key findings:**
- shadcn/ui is NOT a component library - you own the code after installation, requiring manual updates
- February 2026 introduced unified `radix-ui` package (cleaner than multiple @radix-ui/react-* packages)
- Shared React packages in npm workspaces require careful build configuration to avoid hook/dependency issues
- Dual route migration strategy (`/dashboard` React vs `/admin` HTMX) is standard for gradual migrations
- Fastify can serve React SPAs via @fastify/vite or @fastify/static

**Primary recommendation:** Use Vite library mode for shared dashboard package, install shadcn/ui components directly in the shared package (not in consumers), serve via @fastify/static for production simplicity.

## Standard Stack

The established libraries/tools for React dashboard modernization in 2026:

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| React | 18.3+ | UI framework | Industry standard, hooks-based modern React |
| Vite | 5.x | Build tool | Fast HMR, ESM-native, best React DX in 2026 |
| shadcn/ui | latest | Component primitives | Accessible Radix UI components with Tailwind styling |
| radix-ui | latest | Headless primitives | NEW unified package (Feb 2026), replaces @radix-ui/react-* |
| TailwindCSS | 3.4+ | Styling | Default styling system for shadcn/ui |
| TypeScript | 5.3+ | Type safety | Required for shadcn/ui, improves DX |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| @tanstack/react-table | 8.x | Data tables | Pagination, sorting, filtering for data grids |
| Recharts | 2.x | Charts/graphs | Time-series visualization, metrics charts |
| lucide-react | 0.263+ | Icons | Default icon set for shadcn/ui |
| clsx + tailwind-merge | latest | Class utilities | Conditional styling, className merging |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| shadcn/ui | MUI, Chakra UI | Those are dependencies you update; shadcn is code you own |
| Recharts | Chart.js, D3 | Recharts is React-native; others require wrappers |
| @tanstack/react-table | Custom table | TanStack handles complex features (sorting, filtering) |

**Installation:**
```bash
# In shared package
pnpm create vite@latest dashboard --template react-ts
cd dashboard
pnpm add tailwindcss @tailwindcss/vite
pnpm add lucide-react clsx tailwind-merge class-variance-authority
pnpm add -D @types/node

# Initialize shadcn/ui (creates components/ui directory)
pnpm dlx shadcn@latest init

# Add specific components as needed
pnpm dlx shadcn@latest add button card table sidebar

# Data table dependencies
pnpm add @tanstack/react-table

# Charts dependencies
pnpm add recharts
```

## Architecture Patterns

### Recommended Monorepo Structure
```
objetiva-sync-monorepo/
├── shared/
│   ├── schemas/                    # Existing Zod schemas
│   ├── types/                      # Existing TypeScript types
│   └── dashboard/                  # NEW: Shared React dashboard
│       ├── package.json            # Library mode Vite config
│       ├── vite.config.ts          # build.lib for library mode
│       ├── tsconfig.json           # Path aliases (@/)
│       ├── src/
│       │   ├── components/
│       │   │   ├── ui/             # shadcn components (Button, Card, etc.)
│       │   │   ├── data/           # Data display (SyncTable, MetricsChart)
│       │   │   └── layout/         # Layout (Sidebar, Header)
│       │   ├── hooks/              # Custom React hooks (usePolling, etc.)
│       │   ├── lib/                # Utilities (cn, fetch helpers)
│       │   └── index.ts            # Public API exports
│       └── dist/                   # Built library output
├── objetiva-sync/
│   ├── src/
│   │   ├── dashboard-react/        # NEW: React dashboard integration
│   │   │   ├── App.tsx             # Imports from @objetiva/shared/dashboard
│   │   │   ├── main.tsx            # React entry point
│   │   │   └── index.html          # Vite dev server entry
│   │   ├── dashboard/              # EXISTING: HTMX dashboard (keep during migration)
│   │   └── routes/
│   │       ├── dashboard-react.ts  # Serves /dashboard (React SPA)
│   │       └── dashboard.ts        # Serves /admin (HTMX, renamed)
│   └── package.json                # Depends on @objetiva/shared
└── objetiva-sync-gateway/
    └── (similar structure if gateway also needs dashboard)
```

### Pattern 1: Shared Dashboard Package (Library Mode)
**What:** Build shared dashboard as a Vite library that both objetiva-sync and objetiva-sync-gateway can consume
**When to use:** Monorepo with multiple apps needing the same dashboard UI

**vite.config.ts in shared/dashboard:**
```typescript
// Source: https://vite.dev/guide/build (Library Mode)
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'

export default defineConfig({
  plugins: [react()],
  build: {
    lib: {
      entry: path.resolve(__dirname, 'src/index.ts'),
      name: 'ObjetivaDashboard',
      formats: ['es'], // ESM only for modern build
      fileName: 'index',
    },
    rollupOptions: {
      // Externalize React and other peer deps
      external: ['react', 'react-dom', 'react/jsx-runtime'],
      output: {
        globals: {
          react: 'React',
          'react-dom': 'ReactDOM',
        },
      },
    },
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
})
```

**package.json in shared/dashboard:**
```json
{
  "name": "@objetiva/dashboard",
  "type": "module",
  "exports": {
    ".": "./dist/index.js",
    "./styles": "./dist/style.css"
  },
  "peerDependencies": {
    "react": "^18.3.0",
    "react-dom": "^18.3.0"
  }
}
```

### Pattern 2: Dual Routes During Migration
**What:** Serve React dashboard at `/dashboard`, keep HTMX at `/admin` during migration
**When to use:** Gradual migration to avoid breaking existing workflows

**Example route setup (objetiva-sync):**
```typescript
// Source: Community best practices for HTMX-to-React migration
// NEW: React dashboard route
app.get('/dashboard', async (req, reply) => {
  return reply.sendFile('dashboard-react.html') // Vite build output
})

// EXISTING: HTMX dashboard (renamed route)
app.get('/admin', { preHandler: requireAuth }, async (req, reply) => {
  return reply.view('dashboard/index.ejs', { title: 'Admin' })
})
```

### Pattern 3: Auto-Refresh with useInterval Hook
**What:** Custom hook for polling API endpoints without memory leaks
**When to use:** Metrics visualization that updates every 10-30 seconds

**Implementation:**
```typescript
// Source: https://upmostly.com/tutorials/setinterval-in-react-components-using-hooks
import { useEffect, useRef } from 'react'

function useInterval(callback: () => void, delay: number | null) {
  const savedCallback = useRef<() => void>()

  // Remember latest callback
  useEffect(() => {
    savedCallback.current = callback
  }, [callback])

  // Set up interval
  useEffect(() => {
    if (delay === null) return

    const tick = () => savedCallback.current?.()
    const id = setInterval(tick, delay)
    return () => clearInterval(id)
  }, [delay])
}

// Usage in component
function MetricsChart() {
  const [data, setData] = useState([])

  const fetchMetrics = async () => {
    const res = await fetch('/api/dashboard/stats')
    setData(await res.json())
  }

  useInterval(fetchMetrics, 15000) // 15 seconds

  useEffect(() => {
    fetchMetrics() // Initial load
  }, [])

  return <LineChart data={data} />
}
```

### Pattern 4: TanStack Table with Pagination
**What:** Feature-rich data table with client-side pagination
**When to use:** Displaying sync logs, query lists, records with origin info

**Example:**
```typescript
// Source: https://tanstack.com/table/v8/docs/framework/react/examples/pagination
import { useReactTable, getCoreRowModel, getPaginationRowModel } from '@tanstack/react-table'

function SyncLogsTable({ data }) {
  const table = useReactTable({
    data,
    columns: [
      { accessorKey: 'entityType', header: 'Entity' },
      { accessorKey: 'origin_source', header: 'Source' },
      { accessorKey: 'origin_timestamp', header: 'Synced At' },
      { accessorKey: 'recordCount', header: 'Records' },
    ],
    getCoreRowModel: getCoreRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    initialState: { pagination: { pageSize: 25 } },
  })

  return (
    <div>
      <Table>
        <TableHeader>
          {table.getHeaderGroups().map(headerGroup => (
            <TableRow key={headerGroup.id}>
              {headerGroup.headers.map(header => (
                <TableHead key={header.id}>
                  {header.column.columnDef.header}
                </TableHead>
              ))}
            </TableRow>
          ))}
        </TableHeader>
        <TableBody>
          {table.getRowModel().rows.map(row => (
            <TableRow key={row.id}>
              {row.getVisibleCells().map(cell => (
                <TableCell key={cell.id}>
                  {cell.getValue()}
                </TableCell>
              ))}
            </TableRow>
          ))}
        </TableBody>
      </Table>
      <div className="flex items-center gap-2">
        <Button onClick={() => table.previousPage()} disabled={!table.getCanPreviousPage()}>
          Previous
        </Button>
        <span>Page {table.getState().pagination.pageIndex + 1} of {table.getPageCount()}</span>
        <Button onClick={() => table.nextPage()} disabled={!table.getCanNextPage()}>
          Next
        </Button>
      </div>
    </div>
  )
}
```

### Anti-Patterns to Avoid
- **Don't install shadcn/ui components in multiple packages** - Install once in shared package, consumers import from there
- **Don't use npm link for testing** - Can cause React hooks errors due to symlink duplicate instances. Use `npm pack` instead
- **Don't forget to externalize React in library build** - Will bundle React twice and break hooks
- **Don't skip cleanup in useEffect** - Always return cleanup function from intervals/timers

## Don't Hand-Roll

Problems that look simple but have existing solutions:

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Data table with sorting/filtering | Custom table component | @tanstack/react-table | Handles pagination state, column definitions, row selection, 1000+ edge cases |
| Time-series charts | SVG + D3 from scratch | Recharts | React-native API, responsive by default, handles tooltips/legends |
| Accessible dropdowns/menus | Custom div + onClick | Radix UI primitives (via shadcn) | ARIA, keyboard navigation, focus trapping, screen reader support |
| Auto-refresh polling | setInterval in component | useInterval custom hook | Prevents memory leaks, handles component unmount, ref-based callback |
| Dark mode theming | Manual class toggling | shadcn ThemeProvider | localStorage persistence, system preference detection, smooth transitions |
| CSS class merging | String concatenation | clsx + tailwind-merge | Handles conditional classes, resolves Tailwind conflicts |
| Form validation | Manual state + error messages | React Hook Form + Zod | Type-safe, async validation, integration with existing Zod schemas |

**Key insight:** shadcn/ui components are pre-built with Radix UI accessibility baked in. Don't re-implement ARIA patterns - use the primitives.

## Common Pitfalls

### Pitfall 1: shadcn/ui Ownership Misunderstanding
**What goes wrong:** Treating shadcn/ui like a dependency you can `npm update` to get bug fixes
**Why it happens:** Developers expect component libraries to work like MUI or Chakra
**How to avoid:**
- Understand that `shadcn@latest add button` copies TypeScript source into your codebase
- YOU own the code after installation - bugs are YOUR problem
- Track shadcn component versions manually if updates are needed
- Use `pnpm dlx shadcn@latest migrate radix` to migrate to unified radix-ui package (Feb 2026)
**Warning signs:**
- Expecting automatic security patches
- Not reading component source code before using

### Pitfall 2: React Hooks Duplication in Monorepo
**What goes wrong:** "Invalid hook call" errors when shared package uses React hooks
**Why it happens:** Symlinks in npm workspaces can cause multiple React instances
**How to avoid:**
- Add `react` and `react-dom` to `peerDependencies` (not `dependencies`) in shared package
- Externalize React in Vite library build configuration
- Consumer apps install React once, shared package uses that instance
- Test with `npm pack` instead of `npm link` to catch issues
**Warning signs:**
- "Invalid hook call. Hooks can only be called inside the body of a function component"
- Multiple React versions in node_modules tree

### Pitfall 3: Unified radix-ui Package Not Used
**What goes wrong:** Installing individual `@radix-ui/react-*` packages in Feb 2026+
**Why it happens:** Following outdated shadcn/ui tutorials from 2024-2025
**How to avoid:**
- Use `pnpm dlx shadcn@latest init` which defaults to unified package
- For existing projects, run `pnpm dlx shadcn@latest migrate radix`
- Verify `package.json` has `radix-ui` not `@radix-ui/react-dialog`, etc.
**Warning signs:**
- 10+ `@radix-ui/react-*` packages in dependencies
- Dependency conflicts between Radix packages

### Pitfall 4: Forgetting Auto-Refresh Cleanup
**What goes wrong:** Memory leaks, intervals running after component unmount
**Why it happens:** Using `setInterval` directly without cleanup
**How to avoid:**
- Always return cleanup function from `useEffect`: `return () => clearInterval(id)`
- Use custom `useInterval` hook that handles cleanup automatically
- Set interval delay to `null` to pause polling (don't just skip cleanup)
**Warning signs:**
- Console errors about setting state on unmounted component
- Browser performance degrades over time

### Pitfall 5: Not Externalizing Dependencies in Library Build
**What goes wrong:** Shared dashboard bundle includes React, Tailwind, making it 500KB+
**Why it happens:** Default Vite library config bundles everything
**How to avoid:**
- Add `rollupOptions.external: ['react', 'react-dom']` in vite.config.ts
- Use `peerDependencies` for libraries consumers should provide
- Ship only component code, let consumer provide React
**Warning signs:**
- Shared package dist/ folder is unexpectedly large (>100KB)
- Duplicate React errors in console

### Pitfall 6: CSS Not Injected in Library Mode
**What goes wrong:** shadcn components render without styles when imported from shared package
**Why it happens:** Vite library mode doesn't auto-inject CSS
**How to avoid:**
- Export CSS file separately: `"./styles": "./dist/style.css"` in package.json
- Consumer must import both: `import { Button } from '@objetiva/dashboard'` AND `import '@objetiva/dashboard/styles'`
- Alternative: Use `vite-plugin-lib-inject-css` to auto-inject (adds complexity)
**Warning signs:**
- Components render but have no styling
- Tailwind classes not applied

## Code Examples

Verified patterns from official sources:

### shadcn/ui Initialization (Vite + React)
```typescript
// Source: https://ui.shadcn.com/docs/installation/vite

// 1. Install Tailwind
// pnpm add tailwindcss @tailwindcss/vite

// 2. src/index.css
@import "tailwindcss";

// 3. vite.config.ts
import path from "path"
import tailwindcss from "@tailwindcss/vite"
import react from "@vitejs/plugin-react"
import { defineConfig } from "vite"

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
})

// 4. tsconfig.json and tsconfig.app.json
{
  "compilerOptions": {
    "baseUrl": ".",
    "paths": {
      "@/*": ["./src/*"]
    }
  }
}

// 5. Initialize shadcn
// pnpm dlx shadcn@latest init
// Select "Neutral" or preferred base color

// 6. Add components
// pnpm dlx shadcn@latest add button table sidebar
```

### Dark Mode with ThemeProvider (Vite)
```typescript
// Source: https://ui.shadcn.com/docs/dark-mode/vite

// components/theme-provider.tsx
import { createContext, useContext, useEffect, useState } from "react"

type Theme = "dark" | "light" | "system"

type ThemeProviderState = {
  theme: Theme
  setTheme: (theme: Theme) => void
}

const ThemeProviderContext = createContext<ThemeProviderState | undefined>(undefined)

export function ThemeProvider({
  children,
  defaultTheme = "system",
  storageKey = "vite-ui-theme",
}: {
  children: React.ReactNode
  defaultTheme?: Theme
  storageKey?: string
}) {
  const [theme, setTheme] = useState<Theme>(
    () => (localStorage.getItem(storageKey) as Theme) || defaultTheme
  )

  useEffect(() => {
    const root = window.document.documentElement
    root.classList.remove("light", "dark")

    if (theme === "system") {
      const systemTheme = window.matchMedia("(prefers-color-scheme: dark)").matches
        ? "dark"
        : "light"
      root.classList.add(systemTheme)
      return
    }

    root.classList.add(theme)
  }, [theme])

  const value = {
    theme,
    setTheme: (theme: Theme) => {
      localStorage.setItem(storageKey, theme)
      setTheme(theme)
    },
  }

  return (
    <ThemeProviderContext.Provider value={value}>
      {children}
    </ThemeProviderContext.Provider>
  )
}

export const useTheme = () => {
  const context = useContext(ThemeProviderContext)
  if (context === undefined) throw new Error("useTheme must be used within ThemeProvider")
  return context
}

// App.tsx
import { ThemeProvider } from "@/components/theme-provider"

function App() {
  return (
    <ThemeProvider defaultTheme="dark" storageKey="objetiva-theme">
      <Dashboard />
    </ThemeProvider>
  )
}
```

### Sidebar Navigation with Multi-Section
```typescript
// Source: https://ui.shadcn.com/docs/components/radix/sidebar

import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupLabel,
  SidebarGroupContent,
  SidebarMenu,
  SidebarMenuItem,
  SidebarMenuButton,
  SidebarProvider,
  SidebarTrigger,
} from "@/components/ui/sidebar"
import { Home, Database, Settings, LineChart } from "lucide-react"

export function AppSidebar() {
  return (
    <Sidebar>
      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel>Dashboard</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              <SidebarMenuItem>
                <SidebarMenuButton asChild>
                  <a href="/dashboard">
                    <Home className="h-4 w-4" />
                    <span>Overview</span>
                  </a>
                </SidebarMenuButton>
              </SidebarMenuItem>
              <SidebarMenuItem>
                <SidebarMenuButton asChild>
                  <a href="/dashboard/metrics">
                    <LineChart className="h-4 w-4" />
                    <span>Metrics</span>
                  </a>
                </SidebarMenuButton>
              </SidebarMenuItem>
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        <SidebarGroup>
          <SidebarGroupLabel>Records</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              <SidebarMenuItem>
                <SidebarMenuButton asChild>
                  <a href="/dashboard/records">
                    <Database className="h-4 w-4" />
                    <span>Sync Records</span>
                  </a>
                </SidebarMenuButton>
              </SidebarMenuItem>
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        <SidebarGroup>
          <SidebarGroupLabel>Settings</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              <SidebarMenuItem>
                <SidebarMenuButton asChild>
                  <a href="/dashboard/settings">
                    <Settings className="h-4 w-4" />
                    <span>Configuration</span>
                  </a>
                </SidebarMenuButton>
              </SidebarMenuItem>
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>
    </Sidebar>
  )
}

// Layout component
export function DashboardLayout({ children }: { children: React.ReactNode }) {
  return (
    <SidebarProvider>
      <AppSidebar />
      <main className="flex-1">
        <SidebarTrigger />
        {children}
      </main>
    </SidebarProvider>
  )
}
```

### Recharts Time-Series with Auto-Refresh
```typescript
// Source: https://refine.dev/blog/recharts/ + polling best practices

import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts'
import { useInterval } from '@/hooks/useInterval'

interface MetricsData {
  date: string
  success: number
  failed: number
}

export function SyncMetricsChart() {
  const [data, setData] = useState<MetricsData[]>([])
  const [isLoading, setIsLoading] = useState(true)

  const fetchMetrics = async () => {
    try {
      const response = await fetch('/api/dashboard/stats')
      const result = await response.json()
      if (result.success) {
        setData(result.data.syncsPerDay)
      }
    } catch (error) {
      console.error('Failed to fetch metrics:', error)
    } finally {
      setIsLoading(false)
    }
  }

  // Initial load
  useEffect(() => {
    fetchMetrics()
  }, [])

  // Auto-refresh every 15 seconds
  useInterval(() => {
    fetchMetrics()
  }, 15000)

  if (isLoading) return <div>Loading...</div>

  return (
    <ResponsiveContainer width="100%" height={400}>
      <LineChart data={data}>
        <CartesianGrid strokeDasharray="3 3" />
        <XAxis
          dataKey="date"
          tickFormatter={(value) => new Date(value).toLocaleDateString()}
        />
        <YAxis />
        <Tooltip
          labelFormatter={(value) => new Date(value).toLocaleDateString()}
        />
        <Legend />
        <Line
          type="monotone"
          dataKey="success"
          stroke="#10b981"
          name="Successful Syncs"
        />
        <Line
          type="monotone"
          dataKey="failed"
          stroke="#ef4444"
          name="Failed Syncs"
        />
      </LineChart>
    </ResponsiveContainer>
  )
}
```

### Serving React SPA from Fastify
```typescript
// Source: https://github.com/fastify/fastify-vite + @fastify/static

import Fastify from 'fastify'
import fastifyStatic from '@fastify/static'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

const app = Fastify({ logger: true })

// Serve static assets from Vite build
app.register(fastifyStatic, {
  root: path.join(__dirname, 'dist'),
  prefix: '/assets/',
})

// Serve index.html for all dashboard routes (SPA routing)
app.get('/dashboard/*', async (req, reply) => {
  return reply.sendFile('index.html')
})

// API routes remain unchanged
app.register(dashboardApiRoutes, { prefix: '/api/dashboard' })

await app.listen({ port: 3000 })
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Multiple `@radix-ui/react-*` packages | Unified `radix-ui` package | Feb 2026 | Cleaner package.json, fewer dependency conflicts |
| HTMX for interactivity | React for rich UI, HTMX for forms | 2025-2026 | HTMX still valid for server-driven UI, React for complex state |
| Next.js default for React | Vite for library/SPA builds | 2024-2026 | Vite has better DX for non-SSR apps, faster builds |
| Class-based React components | Functional components + hooks | 2019+ | Hooks are standard, class components deprecated pattern |
| CSS-in-JS (styled-components) | Tailwind CSS utility classes | 2022+ | Tailwind has better performance, smaller bundle |

**Deprecated/outdated:**
- `@radix-ui/react-dialog`, `@radix-ui/react-dropdown-menu`, etc. (individual packages) - Use `radix-ui` unified package instead
- `npm link` for monorepo testing - Use `npm pack` to avoid React duplicate instance errors
- Manual ARIA attributes on divs - Use Radix UI primitives which have accessibility built-in

## Open Questions

Things that couldn't be fully resolved:

1. **Optimal shared package export strategy**
   - What we know: Can export components individually or as bundle, CSS separate or injected
   - What's unclear: Trade-off between tree-shaking (individual exports) vs simplicity (single bundle)
   - Recommendation: Start with single bundle export, optimize later if bundle size becomes issue

2. **Migration timeline: Big bang vs gradual**
   - What we know: Dual routes (`/dashboard` React, `/admin` HTMX) enable gradual migration
   - What's unclear: How long to maintain both dashboards before removing HTMX version
   - Recommendation: Remove HTMX dashboard in same phase after verification (full replacement per phase goal)

3. **API endpoint reuse vs new optimized endpoints**
   - What we know: Existing APIs return HTMX-ready HTML fragments, need JSON for React
   - What's unclear: Whether to create new `/api/v2/*` endpoints or modify existing
   - Recommendation: Reuse existing endpoints where possible (e.g., `/api/dashboard/stats` already returns JSON), create new only if structure incompatible

## Sources

### Primary (HIGH confidence)
- [shadcn/ui Installation - Vite](https://ui.shadcn.com/docs/installation/vite) - Official setup guide
- [shadcn/ui Dark Mode - Vite](https://ui.shadcn.com/docs/dark-mode/vite) - ThemeProvider implementation
- [shadcn/ui Sidebar Component](https://ui.shadcn.com/docs/components/radix/sidebar) - Navigation patterns
- [shadcn/ui February 2026 Changelog](https://ui.shadcn.com/docs/changelog/2026-02-radix-ui) - Unified radix-ui package migration
- [TanStack Table v8 Pagination Guide](https://tanstack.com/table/v8/docs/guide/pagination) - Official pagination API
- [Vite Building for Production](https://vite.dev/guide/build) - Library mode configuration

### Secondary (MEDIUM confidence)
- [Implementing Polling in React (Medium)](https://medium.com/@sfcofc/implementing-polling-in-react-a-guide-for-efficient-real-time-data-fetching-47f0887c54a7) - useInterval pattern
- [setInterval in React Components Using Hooks (Upmostly)](https://upmostly.com/tutorials/setinterval-in-react-components-using-hooks) - Cleanup best practices
- [shadcn/ui Best Practices for 2026 (Medium)](https://medium.com/write-a-catalyst/shadcn-ui-best-practices-for-2026-444efd204f44) - Component organization patterns
- [npm Workspaces Monorepo Guide (Earthly)](https://earthly.dev/blog/npm-workspaces-monorepo/) - Monorepo configuration
- [Building React Component Library with Vite (Medium)](https://medium.com/@mevlutcantuna/building-a-modern-react-component-library-a-guide-with-vite-typescript-and-tailwind-css-862558516b8d) - Library mode setup

### Tertiary (LOW confidence - marked for validation)
- [Recharts GitHub Issues](https://github.com/recharts/recharts/issues/287) - Real-time chart discussion (community, not official)
- [HTMX to React Migration Strategy](https://htmx.org/essays/a-real-world-react-to-htmx-port/) - Reverse direction but useful for understanding dual routes
- WebSearch results for "Fastify serve React SPA" - No single authoritative source, multiple approaches found

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH - Official documentation verified for all core libraries
- Architecture: HIGH - Vite library mode and shadcn setup from official sources
- Pitfalls: MEDIUM - Mix of official docs (unified radix-ui) and community best practices (hooks duplication)

**Research date:** 2026-02-13
**Valid until:** 2026-03-15 (30 days - shadcn/ui and React ecosystem stable)

**Key validations performed:**
- shadcn/ui documentation fetched directly (WebFetch)
- Vite library mode configuration verified against official docs
- Unified radix-ui package migration confirmed from Feb 2026 changelog
- TanStack Table pagination API verified from official docs
- Auto-refresh patterns cross-referenced across multiple sources
