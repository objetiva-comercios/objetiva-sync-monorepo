# Phase 25: Script Adaptation & 207 Fix - Context

**Gathered:** 2026-03-28
**Status:** Ready for planning

<domain>
## Phase Boundary

Adapt the existing schema regeneration script for distributed architecture (Windows dev machine calling remote dockerized gateway) and fix the 207 Multi-Status bug where sync clients treat error-free 207 responses as failures. The script must run from the monorepo root, produce updated Zod and Prisma schemas locally, and support colored field-level dry-run diffs.

</domain>

<decisions>
## Implementation Decisions

### Script Location & Invocation
- **D-01:** Script moves to monorepo root at `scripts/regenerate-schemas.ts`, invoked via `npm run regenerate-schemas` from root `package.json`
- **D-02:** GATEWAY_URL and JWT_SECRET come from `.env` file at monorepo root (env vars only, no CLI argument override)
- **D-03:** Script runs `prisma generate` automatically as final step after writing files (complete workflow in one command)
- **D-04:** Old script at `objetiva-sync-gateway/scripts/regenerate-schemas.ts` is deleted along with its package.json script entries — clean break, no deprecation shim

### 207 Fix Strategy
- **D-05:** Fix is in sync clients only (not gateway). When 207 response has `errors.length === 0`, return `success: true`. Gateway behavior (207 for mixed results) is correct HTTP semantics
- **D-06:** When 207 has 0 errors, log at `info` level ("Batch exitoso, sin errores"). When 207 has actual errors, keep `warn` level. All 4 entity clients updated identically

### DLL/Process Removal
- **D-07:** Clean removal of ALL Windows-specific code from the regeneration flow: `stopGatewayIfRunning()`, `isDllUnlocked()`, `deleteDllIfExists()`, `waitForDllUnlock()`, `DLL_PATH`, `sleep()` busy-wait, EPERM retry logic, `kill-gateway-process.mjs` reference
- **D-08:** `prisma generate` runs as a simple single-attempt call — no retry logic needed since gateway is remote and no local process holds DLL locks

### Diff Display Format
- **D-09:** Dry-run shows field-level diff grouped by entity: added fields (+), removed fields (-), type/nullable changes (~). Includes summary line ("N changes in M entities")
- **D-10:** Diff uses ANSI terminal colors: green for added, red for removed, yellow for modified. Uses chalk or built-in ANSI escape codes

### Claude's Discretion
- Implementation of the `regenerateSchemas()` codegen function adaptation (internal to the script)
- Choice of color library (chalk vs raw ANSI codes) based on existing dependencies
- Exact file path resolution logic for writing to `shared/schemas/generated/` and `prisma/schema.prisma` from monorepo root

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Architecture & Flow
- `.planning/REGENERACION_SCHEMAS.md` — Complete technical document describing the regeneration flow, distributed architecture, and all phases (introspection, generation, writing, prisma generate)

### Requirements
- `.planning/REQUIREMENTS.md` — REGEN-01 through REGEN-04 and FIX-01 define acceptance criteria for this phase

### Existing Implementation
- `objetiva-sync-gateway/scripts/regenerate-schemas.ts` — Current script to be replaced (contains all Windows-specific code to remove)
- `objetiva-sync-gateway/src/codegen/index.ts` — `regenerateSchemas()` function that does the actual schema fetching and generation
- `objetiva-sync/src/api-client/articulos-client.ts` — 207 handling pattern (lines 133-153), identical in all 4 clients
- `objetiva-sync/src/api-client/comprobantes-cabecera-client.ts` — 207 handling (lines 116-128)
- `objetiva-sync/src/api-client/comprobantes-detalle-client.ts` — 207 handling (lines 151-163)
- `objetiva-sync/src/api-client/comprobantes-pagos-client.ts` — 207 handling (lines 114-126)

### Gateway 207 Response Source
- `objetiva-sync-gateway/src/routes/articulos.ts` — Line 158: `reply.status(hasErrors ? 207 : 200)` (gateway behavior is correct, no changes needed)
- `objetiva-sync-gateway/src/routes/comprobantes.ts` — Lines 152, 294, 436: same pattern for cabecera, detalle, pagos

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `regenerateSchemas()` in `objetiva-sync-gateway/src/codegen/index.ts` — Core function that fetches schemas via HTTP and generates content in memory. Supports `skipFileWrites`, `skipPrismaGenerate`, `dryRun`, `entity` options. Fully reusable from new script location
- `checkPrerequisites()` pattern — Health check + env var validation can be adapted for new script
- Existing `--dry-run` and `--entity` CLI argument parsing — Reusable pattern

### Established Patterns
- All 4 entity clients have identical copy-pasted 207 handling — fix should be applied identically to all 4
- Gateway uses `hasErrors ? 207 : 200` consistently across all routes — this is correct and unchanged
- Script uses `dotenv` for env loading from `.env` file
- Script uses `tsx` as TypeScript runner (see package.json)

### Integration Points
- Root `package.json` needs new `regenerate-schemas` and `regenerate-schemas:dry-run` script entries
- Root needs `tsx` as devDependency (or use existing if already installed)
- File write paths need to resolve correctly from monorepo root to `shared/schemas/generated/` and `objetiva-sync-gateway/prisma/schema.prisma`
- The `regenerateSchemas()` import path changes since script moves from gateway/scripts to monorepo root

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

*Phase: 25-script-adaptation-207-fix*
*Context gathered: 2026-03-28*
