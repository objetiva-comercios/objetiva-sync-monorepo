# Phase 17 Plan 01: Initialize Shared Dashboard Package Summary

**Vite + React + shadcn/ui foundation package for shared dashboard components**

---
phase: 17-dashboard-modernization
plan: 01
subsystem: dashboard
tags: [react, vite, shadcn-ui, tailwind, monorepo]
dependency_graph:
  requires: []
  provides: [shared-dashboard-package, shadcn-ui-foundation]
  affects: [17-02, 17-03, 17-04, 17-05, 17-06]
tech_stack:
  added: [vite, @vitejs/plugin-react, tailwindcss, @tailwindcss/vite, clsx, tailwind-merge, class-variance-authority, lucide-react, @radix-ui/react-slot, vite-plugin-dts]
  patterns: [library-mode-build, peer-dependencies, workspace-linking]
key_files:
  created:
    - shared/dashboard/package.json
    - shared/dashboard/vite.config.ts
    - shared/dashboard/tsconfig.json
    - shared/dashboard/components.json
    - shared/dashboard/src/index.ts
    - shared/dashboard/src/index.css
    - shared/dashboard/src/lib/utils.ts
    - shared/dashboard/src/components/ui/button.tsx
    - shared/dashboard/src/App.tsx
    - shared/dashboard/src/main.tsx
    - shared/dashboard/index.html
  modified:
    - package.json (workspace addition)
    - objetiva-sync/package.json (dependency addition)
    - package-lock.json
decisions: [VITE-01, REACT-PEER-01]
metrics:
  duration: ~10 minutes
  completed: 2026-02-13
---

## What Changed

### 1. Created @objetiva/dashboard package

New shared React dashboard package at `shared/dashboard/`:

- **Library mode build**: Outputs `dist/index.js` (79KB) and `dist/style.css` (27KB)
- **TypeScript declarations**: Generated via vite-plugin-dts
- **Exports**: Components, utilities, and styles available to consumers

### 2. Configured Vite + React foundation

```typescript
// vite.config.ts highlights
- @vitejs/plugin-react for React support
- @tailwindcss/vite for Tailwind CSS 4
- vite-plugin-dts for TypeScript declarations
- Library mode with external React (not bundled)
- Path alias @/ -> ./src/
```

### 3. Configured shadcn/ui

Created `components.json` for shadcn/ui CLI:

```json
{
  "style": "default",
  "rsc": false,
  "tsx": true,
  "tailwind": { "baseColor": "neutral", "cssVariables": true },
  "aliases": { "components": "@/components", "utils": "@/lib/utils" }
}
```

Added Button component as proof of concept - CLI `npx shadcn@latest add button` works.

### 4. Workspace integration

- Added `shared/dashboard` to root workspaces
- Added `@objetiva/dashboard: "*"` dependency to objetiva-sync
- Installed React 18.3 in objetiva-sync (peer dependency provider)
- Verified single React instance across workspace (prevents hook errors)

## Decisions Made

### VITE-01: Use Vite 5.x for build compatibility

**Context:** Vite 6.x had compatibility issues with @tailwindcss/vite in monorepo hoisting setup

**Decision:** Pin to Vite ^5.4.0 to match vitest versions in other workspaces

**Impact:** Consistent build behavior, no version conflicts in node_modules

### REACT-PEER-01: React as peerDependency in dashboard package

**Context:** Dashboard package needs React but bundling it causes "invalid hook call" errors when consumers have their own React

**Decision:** React 18.3+ as peerDependency, externalized in Vite build

**Impact:** Consumers must install React, but prevents duplicate React instances

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Vite version compatibility**

- **Found during:** Task 1
- **Issue:** Vite 6.x caused "D.createIdResolver is not a function" error with @tailwindcss/vite due to module resolution conflicts in shared/node_modules
- **Fix:** Changed vite dependency to ^5.4.0 to align with monorepo
- **Files modified:** shared/dashboard/package.json

**2. [Rule 3 - Blocking] TypeScript build configuration**

- **Found during:** Task 1
- **Issue:** tsc -b with project references failed with composite settings conflicts
- **Fix:** Simplified to vite build only with vite-plugin-dts for declaration generation
- **Files modified:** shared/dashboard/package.json, tsconfig.json

### Note on Unified radix-ui Package

The plan mentioned using "unified radix-ui package (Feb 2026)" and running `npx shadcn@latest migrate radix`. This migration command does not exist in current shadcn CLI. The ecosystem still uses individual @radix-ui/react-* packages (e.g., @radix-ui/react-slot for Button). This is the expected behavior and not a deviation.

## Commits

| Commit | Type | Description |
|--------|------|-------------|
| 5cc1e4d | feat | Initialize Vite + React dashboard package |
| 2f4eae7 | feat | Configure shadcn/ui with base utilities |
| 6886451 | feat | Register shared/dashboard as workspace dependency |

## Verification Results

| Check | Result |
|-------|--------|
| `npm run build` succeeds | PASS - dist/index.js (79KB), dist/style.css (27KB) |
| `npm ls @objetiva/dashboard` shows workspace link | PASS - linked correctly |
| components.json exists | PASS - valid shadcn configuration |
| No duplicate React instances | PASS - single React 18.3.1 deduped |
| shadcn CLI can add components | PASS - Button added successfully |

## Next Phase Readiness

**Ready for Plan 17-02 (Layout Components)**

- Core UI components (Sidebar, Header) can now be built
- shadcn/ui CLI working for adding more components
- Build pipeline established
- Workspace linking verified

**Dependencies for next plans:**

- 17-02 will add shadcn sidebar, navigation-menu, sheet components
- 17-03 will add data-table using tanstack/react-table
- All can use established build pipeline and component patterns
