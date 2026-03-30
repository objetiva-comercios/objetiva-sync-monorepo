---
phase: 25-script-adaptation-207-fix
plan: "01"
subsystem: scripts
tags: [schema-regeneration, distributed, windows, cleanup]
dependency_graph:
  requires: [25-00]
  provides: [root-regenerate-schemas-script]
  affects: [objetiva-sync-gateway/src/codegen, shared/schemas/generated, prisma/schema.prisma]
tech_stack:
  added: [tsx@root, dotenv@root]
  patterns: [process.chdir-for-cwd-resolution, execSync-single-call-prisma-generate, esm-import-with-js-extension]
key_files:
  created:
    - scripts/regenerate-schemas.ts
    - .env.example
  modified:
    - package.json
  deleted:
    - objetiva-sync-gateway/scripts/regenerate-schemas.ts
    - objetiva-sync-gateway/scripts/kill-gateway-process.mjs
decisions:
  - "skipPrismaGenerate: true in regenerateSchemas() call — run prisma generate separately with stdio: inherit for real-time output (D-03, D-08)"
  - "process.chdir(gatewayDir) before regenerateSchemas() — codegen/index.ts resolves prismaSchemaPath and monorepoRoot relative to process.cwd()"
  - "No skipFileWrites — regenerateSchemas() writes files directly, no DLL locking concern in distributed arch"
  - "Single execSync prisma generate call, no retry loop — gateway runs on Linux Docker, no Windows DLL issues"
requirements_completed: [REGEN-01, REGEN-02, REGEN-03, REGEN-04]
metrics:
  duration: ~8 minutes
  completed: "2026-03-29T22:54:00Z"
  tasks_completed: 2
  tasks_total: 2
  files_created: 2
  files_modified: 1
  files_deleted: 2
---

# Phase 25 Plan 01: Script Adaptation — Create Root Script and Delete Old Gateway Script

## One-liner

Root `scripts/regenerate-schemas.ts` replaces Windows-specific gateway script: loads root `.env`, chdirs to gateway, calls `regenerateSchemas()`, runs single `prisma generate` — zero process-killing or DLL dependencies.

## What Was Built

### Task 1: Create new regeneration script and wire root package.json

Created `scripts/regenerate-schemas.ts` at monorepo root with:
- Dotenv config loading from `resolve(__dirname, '..', '.env')` (monorepo root)
- `process.chdir(gatewayDir)` before calling `regenerateSchemas()` so `prisma/schema.prisma` and monorepoRoot paths resolve correctly inside codegen
- `regenerateSchemas({ dryRun, entity, skipPrismaGenerate: true })` — defers prisma generate
- `execSync('npx prisma generate', { cwd: gatewayDir, stdio: 'inherit' })` — single call, no retry
- Zero Windows-specific code (no taskkill, DLL_PATH, isDllUnlocked, deleteDllIfExists, waitForDllUnlock, stopGatewayIfRunning, sleep busy-wait)

Updated `package.json` (root):
- Added `scripts.regenerate-schemas`: `tsx scripts/regenerate-schemas.ts`
- Added `scripts.regenerate-schemas:dry-run`: `tsx scripts/regenerate-schemas.ts --dry-run`
- Added `devDependencies`: `tsx@^4.19.2` and `dotenv@^17.2.3`

Created `.env.example` at monorepo root documenting `GATEWAY_URL` and `JWT_SECRET`.

**Commit:** `bbcebea`

### Task 2: Delete old gateway script and clean up gateway package.json

- Deleted `objetiva-sync-gateway/scripts/regenerate-schemas.ts` (Windows-specific 3-phase flow)
- Deleted `objetiva-sync-gateway/scripts/kill-gateway-process.mjs` (Windows process killer)
- Removed `regenerate-schemas` and `regenerate-schemas:dry-run` script entries from `objetiva-sync-gateway/package.json`
- Verified: zero dangling references to `kill-gateway-process` in `objetiva-sync-gateway/src/`

**Commit:** `5e604b7`

## Commits

| Hash | Type | Description |
|------|------|-------------|
| bbcebea | feat | Create root regenerate-schemas script and wire package.json |
| 5e604b7 | chore | Delete old gateway script and kill helper, clean gateway package.json |

## Verification Results

| Check | Result |
|-------|--------|
| `test -f scripts/regenerate-schemas.ts` | PASS |
| `test ! -f objetiva-sync-gateway/scripts/regenerate-schemas.ts` | PASS |
| `test ! -f objetiva-sync-gateway/scripts/kill-gateway-process.mjs` | PASS |
| `grep "regenerate-schemas" package.json` | PASS |
| `! grep "regenerate-schemas" objetiva-sync-gateway/package.json` | PASS |
| Windows code count in new script | 0 (PASS) |
| `grep "process.chdir" scripts/regenerate-schemas.ts` | PASS |

## Deviations from Plan

None — plan executed exactly as written.

## Known Stubs

None — script imports from `objetiva-sync-gateway/src/codegen/index.js` which is real production code. The `regenerateSchemas()` call is fully wired.

## Self-Check: PASSED

- `scripts/regenerate-schemas.ts` exists: YES
- `package.json` has `regenerate-schemas` entries: YES
- `.env.example` has `GATEWAY_URL`: YES
- Old gateway files deleted: YES
- Commits bbcebea and 5e604b7 exist: YES
