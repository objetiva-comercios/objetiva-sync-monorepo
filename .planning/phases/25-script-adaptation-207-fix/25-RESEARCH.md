# Phase 25: Script Adaptation & 207 Fix - Research

**Researched:** 2026-03-28
**Domain:** Node.js CLI scripting, TypeScript codegen orchestration, HTTP 207 Multi-Status handling
**Confidence:** HIGH

---

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

- **D-01:** Script moves to monorepo root at `scripts/regenerate-schemas.ts`, invoked via `npm run regenerate-schemas` from root `package.json`
- **D-02:** GATEWAY_URL and JWT_SECRET come from `.env` file at monorepo root (env vars only, no CLI argument override)
- **D-03:** Script runs `prisma generate` automatically as final step after writing files (complete workflow in one command)
- **D-04:** Old script at `objetiva-sync-gateway/scripts/regenerate-schemas.ts` is deleted along with its package.json script entries — clean break, no deprecation shim
- **D-05:** Fix is in sync clients only (not gateway). When 207 response has `errors.length === 0`, return `success: true`. Gateway behavior (207 for mixed results) is correct HTTP semantics
- **D-06:** When 207 has 0 errors, log at `info` level ("Batch exitoso, sin errores"). When 207 has actual errors, keep `warn` level. All 4 entity clients updated identically
- **D-07:** Clean removal of ALL Windows-specific code from the regeneration flow: `stopGatewayIfRunning()`, `isDllUnlocked()`, `deleteDllIfExists()`, `waitForDllUnlock()`, `DLL_PATH`, `sleep()` busy-wait, EPERM retry logic, `kill-gateway-process.mjs` reference
- **D-08:** `prisma generate` runs as a simple single-attempt call — no retry logic needed since gateway is remote and no local process holds DLL locks
- **D-09:** Dry-run shows field-level diff grouped by entity: added fields (+), removed fields (-), type/nullable changes (~). Includes summary line ("N changes in M entities")
- **D-10:** Diff uses ANSI terminal colors: green for added, red for removed, yellow for modified. Uses chalk or built-in ANSI escape codes

### Claude's Discretion

- Implementation of the `regenerateSchemas()` codegen function adaptation (internal to the script)
- Choice of color library (chalk vs raw ANSI codes) based on existing dependencies
- Exact file path resolution logic for writing to `shared/schemas/generated/` and `prisma/schema.prisma` from monorepo root

### Deferred Ideas (OUT OF SCOPE)

None — discussion stayed within phase scope
</user_constraints>

---

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| REGEN-01 | Operator can run regeneration script from Windows and get updated schemas from remote gateway | New script at monorepo root uses existing `regenerateSchemas()` — already works against remote HTTP; only invocation path changes |
| REGEN-02 | Script generates Zod files in `shared/schemas/generated/` and Prisma in `prisma/schema.prisma` locally | `regenerateSchemas()` already computes correct absolute paths; new script must resolve them from monorepo root instead of gateway root |
| REGEN-03 | Script requires no process killing, Windows DLL handling, or Docker filesystem access | Remove 7 functions + DLL_PATH constant from current script; replace `runPrismaGenerate()` with single `execSync` call |
| REGEN-04 | Script shows diff of detected changes before writing files (dry-run available) | `displayDiff()` and `displaySummary()` already exist in `diff-display.ts`; `--dry-run` flag parsing already works |
| FIX-01 | Batches with HTTP 207 and 0 errors count as successful (not failed) | 4 sync clients have identical copy-pasted 207 block; change: check `errors.length === 0`, return `success: true`, log at `info` level |
</phase_requirements>

---

## Summary

Phase 25 consists of two independent tasks that can be planned and executed in parallel: (1) migrating the schema regeneration script from `objetiva-sync-gateway/scripts/` to the monorepo root at `scripts/regenerate-schemas.ts`, and (2) fixing the 207 Multi-Status bug in all 4 sync API clients.

The script migration is primarily a **path resolution change** plus a **removal of Windows-specific code**. The `regenerateSchemas()` function in `objetiva-sync-gateway/src/codegen/index.ts` is the core workhorse and remains untouched — it already supports dry-run, diff display, and correct path resolution relative to `process.cwd()`. The new script simply needs to: load `.env` from monorepo root, call `regenerateSchemas()` with the right options, and run `prisma generate` as a simple `execSync` call when changes are written. All Windows-specific code (7 functions + 1 constant) is removed with no replacement.

The 207 fix is a surgical change to 4 nearly identical code blocks. Currently all 4 clients always return `success: false` when HTTP 207 is received. The fix adds a check: if `result.errors.length === 0`, return `success: true` and log at `info` level instead of `warn`. The gateway behavior does not change.

**Primary recommendation:** Two plans — Plan A (script migration + DLL removal) and Plan B (207 fix) — executable in parallel. Both are low-risk changes with clear before/after boundaries.

---

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `tsx` | 4.21.0 (installed) | TypeScript runner for the new script | Already used in gateway package; available globally |
| `chalk` | 5.6.2 (gateway dep) | ANSI terminal colors in diff output | Already used by `diff-display.ts`; D-10 allows chalk |
| `dotenv` | 17.2.3 (gateway dev dep) | Load `.env` from monorepo root | Already used by old script |
| `fast-jwt` | 6.1.0 (gateway dep) | Sign JWT for gateway auth | Used by `regenerateSchemas()` — imported transitively |
| `diff` | 8.0.3 (gateway dep) | Structured patch computation | Used by `diff-display.ts` — imported transitively |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| Node.js `node:path` | built-in | `resolve()` for cross-platform path construction | Used by new script for all file paths |
| Node.js `node:child_process` | built-in | `execSync('npx prisma generate')` | Single call at end of non-dry-run flow |
| Node.js `node:url` | built-in | `fileURLToPath` / `import.meta.url` for `__dirname` equivalent | ESM scripts need this for `__dirname` |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| `chalk` | Raw ANSI escape codes | chalk already installed, cleaner API — no reason to change |
| `tsx` at root | `ts-node` | tsx already installed and working, don't change |
| `dotenv` | `--env-file` Node flag | dotenv already used in codebase, consistent pattern |

**Installation:**

No new packages needed. All dependencies already exist in `objetiva-sync-gateway/`. The root `package.json` needs `tsx` as a devDependency (it's currently only in gateway) and `dotenv` similarly. However, since the monorepo uses npm workspaces, `tsx` is already available via `npx tsx` from any workspace. Verify:

```bash
# Already confirmed available:
# tsx v4.21.0 / node v22.14.0
npx tsx --version  # -> 4.21.0
```

**Root package.json devDependencies to add:**
```json
"tsx": "^4.19.2",
"dotenv": "^17.2.3"
```

---

## Architecture Patterns

### New Script Location
```
scripts/                              # NEW directory at monorepo root
└── regenerate-schemas.ts             # New script (D-01)

objetiva-sync-gateway/
├── scripts/
│   └── regenerate-schemas.ts         # DELETE (D-04)
├── src/
│   └── codegen/
│       ├── index.ts                  # UNTOUCHED — core orchestrator
│       ├── diff-display.ts           # UNTOUCHED — colors + diffs
│       ├── prisma-generator.ts       # UNTOUCHED
│       ├── zod-generator.ts          # UNTOUCHED
│       └── types.ts                  # UNTOUCHED

objetiva-sync/
└── src/
    └── api-client/
        ├── articulos-client.ts       # FIX lines 133-153
        ├── comprobantes-cabecera-client.ts  # FIX lines 116-137
        ├── comprobantes-detalle-client.ts   # FIX lines 151-172
        └── comprobantes-pagos-client.ts     # FIX lines 114-135
```

### Pattern 1: New Script — Simplified Orchestrator

The new `scripts/regenerate-schemas.ts` is a slimmed-down version of the old gateway script. Key changes:

1. `config({ path: resolve(__dirname, '..', '.env') })` — load from monorepo root (one level up from `scripts/`)
2. Import `regenerateSchemas` from gateway codegen using a relative path from monorepo root
3. Remove `DLL_PATH` constant and all 7 Windows-specific functions
4. Replace `runPrismaGenerate()` with a simple `execSync` + single try/catch
5. `GATEWAY_CWD` is no longer needed — `process.cwd()` will be monorepo root when invoked via root `npm run`

**Critical path resolution insight:** `regenerateSchemas()` in `codegen/index.ts` uses `process.cwd()` to resolve file paths:
- `prismaSchemaPath = resolve(process.cwd(), 'prisma/schema.prisma')` — this was correct when run from `objetiva-sync-gateway/`
- `monorepoRoot = resolve(process.cwd(), '..')` — this was gateway's parent = monorepo root

When running from **monorepo root** (D-01):
- `process.cwd()` = `/path/to/objetiva-sync-monorepo`
- `prismaSchemaPath = resolve(cwd, 'prisma/schema.prisma')` = wrong — should be `objetiva-sync-gateway/prisma/schema.prisma`
- `monorepoRoot = resolve(cwd, '..')` = wrong — would be parent of monorepo

**Resolution:** The new script should pass explicit path overrides to `regenerateSchemas()`, OR the codegen function should be called with `process.chdir()` to set CWD to gateway dir before invocation, OR paths should be computed in the script and passed as config.

The cleanest approach (Claude's discretion per CONTEXT.md) is to **set `process.chdir()` to the gateway directory before calling `regenerateSchemas()`** so all its internal `process.cwd()` calls resolve correctly. The script then changes back (or just exits). This avoids modifying `codegen/index.ts` at all.

Alternative: pass explicit base paths as options to `regenerateSchemas()`. This requires modifying `RegenerateOptions` to add optional path overrides.

**Recommended approach:** Use `process.chdir(gatewayDir)` before calling `regenerateSchemas()`. Simple, no API changes needed.

```typescript
// In scripts/regenerate-schemas.ts
const __dirname = dirname(fileURLToPath(import.meta.url));
const gatewayDir = resolve(__dirname, '..', 'objetiva-sync-gateway');

// Change cwd so regenerateSchemas() resolves paths correctly
process.chdir(gatewayDir);

// Now regenerateSchemas() works exactly as before
const result = await regenerateSchemas({ dryRun, entity });
```

**For prisma generate:** `npx prisma generate` must run from the gateway directory (where `prisma/schema.prisma` is). Since we `chdir` to gateway dir, it works naturally.

### Pattern 2: 207 Fix — Conditional on errors.length

Current code (all 4 clients, identical):
```typescript
if (response.status === 207) {
  const result = data.data || data.result;  // articulos-client uses data.result
  // cabecera/detalle/pagos use data.data || data

  logger.warn({ ... }, '... ⚠️ Batch con éxito parcial (207 Multi-Status)');

  return {
    success: false,  // <-- BUG: always false
    inserted: result.inserted || 0,
    updated: result.updated || 0,
    errors: result.errors || [],
  };
}
```

Fixed code (all 4 clients):
```typescript
if (response.status === 207) {
  const result = data.data || data.result;  // keep per-client variant
  // (cabecera/detalle/pagos: data.data || data)

  if (!result) {
    throw new Error('No data in 207 Multi-Status response');
  }

  const errors = result.errors || [];
  const hasErrors = errors.length > 0;

  if (hasErrors) {
    logger.warn({
      inserted: result.inserted || 0,
      updated: result.updated || 0,
      errors: errors.length,
    }, '[XxxClient] ⚠️ Batch con éxito parcial (207 Multi-Status)');
  } else {
    logger.info({
      inserted: result.inserted || 0,
      updated: result.updated || 0,
    }, '[XxxClient] Batch exitoso, sin errores');  // D-06
  }

  return {
    success: !hasErrors,   // <-- FIX: true when errors === 0
    inserted: result.inserted || 0,
    updated: result.updated || 0,
    errors: errors,
  };
}
```

**Note on result extraction differences between clients:**
- `articulos-client.ts` line 135: `data.data || data.result` (uses `data.result` as fallback)
- `comprobantes-cabecera-client.ts` line 118: `data.data || data`
- `comprobantes-detalle-client.ts` line 153: `data.data || data`
- `comprobantes-pagos-client.ts` line 116: `data.data || data`

Preserve each client's existing extraction pattern — only change the success logic and log level.

### Pattern 3: Script CLI Argument Parsing (reuse unchanged)

```typescript
const args = process.argv.slice(2);
const dryRun = args.includes('--dry-run');
const entityIndex = args.indexOf('--entity');
const entity = entityIndex !== -1 ? args[entityIndex + 1] : undefined;

if (entityIndex !== -1 && !entity) {
  console.error('Error: --entity flag requires a value');
  process.exit(1);
}
```

This pattern is copied verbatim from old script — no changes needed.

### Pattern 4: Import Path from Monorepo Root Script

The new script imports from the gateway's codegen module. Since both `scripts/` and `objetiva-sync-gateway/` are at the same directory level in the monorepo:

```typescript
// scripts/regenerate-schemas.ts
import { regenerateSchemas } from '../objetiva-sync-gateway/src/codegen/index.js';
```

This import works because `tsx` resolves TypeScript paths directly. The `.js` extension is required for ESM compatibility (TypeScript's `node16` module resolution).

### Anti-Patterns to Avoid

- **Don't modify `codegen/index.ts`** — the function works correctly when CWD is the gateway directory. The new script should adapt the environment, not the library.
- **Don't add `--entity` CLI overrides to .env** — D-02 says env vars only from `.env`, CLI args are for `--dry-run` and `--entity` flags only (these are not env vars, they're CLI flags for the script itself).
- **Don't keep any DLL/process code** — D-07 is a clean removal. No conditionals like "if Windows, do X". Just remove all of it.
- **Don't run `prisma generate` from monorepo root** — Prisma looks for `prisma/schema.prisma` relative to CWD. After `process.chdir(gatewayDir)`, it will find `objetiva-sync-gateway/prisma/schema.prisma`.
- **Don't forget to remove gateway `package.json` script entries** — D-04 says the old gateway scripts must be removed too.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Diff display | Custom diff renderer | Existing `diff-display.ts` (already in codegen) | Already battle-tested with CRLF normalization, noise filtering, structured patch format |
| Schema fetching + generation | New fetch loop | Existing `regenerateSchemas()` in `codegen/index.ts` | Handles JWT signing, entity enumeration, content generation, diff computation |
| Color output | Raw ANSI codes | `chalk` (already in gateway deps) | Already imported in codegen, consistent with existing output |
| JWT signing | Custom JWT implementation | `fast-jwt` via `signLocalToken()` inside `regenerateSchemas()` | Already handled internally — script doesn't need to touch JWT at all |

**Key insight:** This phase is fundamentally about **removing code, not adding it**. The Windows-specific code (7 functions, ~120 lines) is deleted. The 207 fix is 5 lines changed per client. The new script is shorter than the old one.

---

## Runtime State Inventory

> Not applicable. This is a code-only change — no rename/rebrand/migration involved.

None — verified: phase modifies TypeScript source files and package.json scripts only. No stored data, live service config, OS-registered state, secrets/env var names, or build artifacts are renamed.

---

## Common Pitfalls

### Pitfall 1: `process.cwd()` resolves relative to npm script invocation directory

**What goes wrong:** The root `package.json` runs `tsx scripts/regenerate-schemas.ts`. `process.cwd()` will be the monorepo root. `regenerateSchemas()` internally calls `resolve(process.cwd(), 'prisma/schema.prisma')` which would resolve to `{monorepo}/prisma/schema.prisma` (doesn't exist) instead of `{monorepo}/objetiva-sync-gateway/prisma/schema.prisma`.

**Why it happens:** `npm run` always sets CWD to the directory containing `package.json`, which for root scripts is the monorepo root.

**How to avoid:** Call `process.chdir(gatewayDir)` in the new script BEFORE calling `regenerateSchemas()`. `gatewayDir = resolve(__dirname, '..', 'objetiva-sync-gateway')` where `__dirname` is derived from `import.meta.url`.

**Warning signs:** `ENOENT: no such file or directory, open '...monorepo/prisma/schema.prisma'` error at runtime.

### Pitfall 2: ESM import path needs `.js` extension

**What goes wrong:** `import { regenerateSchemas } from '../objetiva-sync-gateway/src/codegen/index'` (no extension) fails with `ERR_MODULE_NOT_FOUND`.

**Why it happens:** The gateway's `package.json` sets `"type": "module"`. ESM requires explicit file extensions in import specifiers.

**How to avoid:** Always use `.js` extension: `import { ... } from '../objetiva-sync-gateway/src/codegen/index.js'`. `tsx` resolves `.js` imports to `.ts` files transparently.

**Warning signs:** `Cannot find module` or `ERR_MODULE_NOT_FOUND` when running the script.

### Pitfall 3: 207 result extraction — articulos vs comprobantes clients differ

**What goes wrong:** The articulos client uses `data.data || data.result` while the 3 comprobantes clients use `data.data || data`. Applying an identical fix template without checking each client's extraction line breaks one of them.

**Why it happens:** Copy-paste divergence during original implementation.

**How to avoid:** Fix each client individually. Preserve the existing extraction expression — only change the `success` return value and `logger` call.

**Warning signs:** `No data in 207 Multi-Status response` error thrown for articulos batches after applying identical fix to all 4.

### Pitfall 4: Root package.json needs tsx as devDependency

**What goes wrong:** `npm run regenerate-schemas` at root works on dev machine because `tsx` is installed globally, but fails on fresh clone where only workspace packages are installed.

**Why it happens:** `tsx` is in `objetiva-sync-gateway/devDependencies` but not in root `package.json`.

**How to avoid:** Add `"tsx": "^4.19.2"` and `"dotenv": "^17.2.3"` to root `package.json` devDependencies. Alternatively, scripts can use `npx tsx` which will find it in the workspace's `node_modules`.

**Warning signs:** `sh: tsx: not found` or `npx tsx: command not found` when running from root.

### Pitfall 5: Gateway `package.json` script removal leaves orphaned `kill-gateway-process.mjs`

**What goes wrong:** `kill-gateway-process.mjs` is no longer called from anywhere after removing the gateway scripts, but remains on disk as dead code.

**Why it happens:** D-04 says delete the old script and its package.json entries, but doesn't explicitly mention the kill helper.

**How to avoid:** When deleting `objetiva-sync-gateway/scripts/regenerate-schemas.ts`, also check if `kill-gateway-process.mjs` is referenced anywhere else. If not, delete it too.

**Warning signs:** Linter or unused-file warnings. Not a runtime issue.

---

## Code Examples

### New Script Skeleton (scripts/regenerate-schemas.ts)

```typescript
#!/usr/bin/env node
import { config } from 'dotenv';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execSync } from 'node:child_process';
import { regenerateSchemas } from '../objetiva-sync-gateway/src/codegen/index.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Load .env from monorepo root (scripts/ is one level down from root)
if (!process.env.SKIP_DOTENV) {
  config({ path: resolve(__dirname, '..', '.env') });
}

// Parse CLI arguments (unchanged from old script)
const args = process.argv.slice(2);
const dryRun = args.includes('--dry-run');
const entityIndex = args.indexOf('--entity');
const entity = entityIndex !== -1 ? args[entityIndex + 1] : undefined;

if (entityIndex !== -1 && !entity) {
  console.error('Error: --entity flag requires a value (e.g., --entity articulos)');
  process.exit(1);
}

const REQUIRED_ENV_VARS = ['GATEWAY_URL', 'JWT_SECRET'] as const;

async function checkPrerequisites(): Promise<void> {
  // (same as old script — validate env vars and gateway health)
}

async function main() {
  await checkPrerequisites();

  // Change CWD to gateway dir so regenerateSchemas() resolves paths correctly
  const gatewayDir = resolve(__dirname, '..', 'objetiva-sync-gateway');
  process.chdir(gatewayDir);

  try {
    const result = await regenerateSchemas({ dryRun, entity });

    if (dryRun || !result.hasChanges) {
      process.exit(0);
      return;
    }

    // Run prisma generate (simple, no retry — DLL not an issue with remote gateway)
    console.log('\nRunning prisma generate...\n');
    execSync('npx prisma generate', { cwd: gatewayDir, stdio: 'inherit' });

    console.log('\n✅ All schemas updated');
    process.exit(0);
  } catch (error) {
    console.error(`\n❌ Error: ${error instanceof Error ? error.message : String(error)}`);
    process.exit(1);
  }
}

main();
```

### Root package.json Script Entries (D-01)

```json
{
  "scripts": {
    "regenerate-schemas": "tsx scripts/regenerate-schemas.ts",
    "regenerate-schemas:dry-run": "tsx scripts/regenerate-schemas.ts --dry-run"
  }
}
```

### 207 Fix Template (FIX-01) — applies to all 4 clients

Replace the existing 207 block:

```typescript
// BEFORE (all 4 clients):
if (response.status === 207) {
  const result = data.data || data.result; // or data.data || data for comprobantes

  if (!result) {
    throw new Error('No data in 207 Multi-Status response');
  }

  logger.warn({
    inserted: result.inserted || 0,
    updated: result.updated || 0,
    errors: result.errors?.length || 0,
  }, '[XxxClient] ⚠️ Batch con éxito parcial (207 Multi-Status)');

  return {
    success: false,
    inserted: result.inserted || 0,
    updated: result.updated || 0,
    errors: result.errors || [],
  };
}

// AFTER:
if (response.status === 207) {
  const result = data.data || data.result; // preserve per-client extraction

  if (!result) {
    throw new Error('No data in 207 Multi-Status response');
  }

  const errors = result.errors || [];
  const hasErrors = errors.length > 0;

  if (hasErrors) {
    logger.warn({
      inserted: result.inserted || 0,
      updated: result.updated || 0,
      errors: errors.length,
    }, '[XxxClient] ⚠️ Batch con éxito parcial (207 Multi-Status)');
  } else {
    logger.info({
      inserted: result.inserted || 0,
      updated: result.updated || 0,
    }, '[XxxClient] Batch exitoso, sin errores');
  }

  return {
    success: !hasErrors,
    inserted: result.inserted || 0,
    updated: result.updated || 0,
    errors,
  };
}
```

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Run script from `objetiva-sync-gateway/` (local gateway required) | Run from monorepo root against remote gateway | Phase 25 | No process kill, no DLL handling |
| Kill gateway process before writing files (DLL lock prevention) | Write directly — no local Prisma engine | Phase 25 | Simpler, no race conditions |
| 207 always treated as failure | 207 with 0 errors treated as success | Phase 25 | Correct sync count metrics |

**Deprecated/outdated:**
- `stopGatewayIfRunning()`: Removed — gateway runs remotely, never needs killing for DLL
- `isDllUnlocked()` / `deleteDllIfExists()` / `waitForDllUnlock()`: Removed — no local Prisma engine during generation
- `sleep()` busy-wait: Removed — was only needed for DLL unlock retry
- `runPrismaGenerate()` with EPERM retry: Replaced with single `execSync` call
- `kill-gateway-process.mjs` reference: Removed — no longer needed

---

## Open Questions

1. **Does `regenerateSchemas()` need `skipFileWrites: true` in the new script?**
   - What we know: The old script used `skipFileWrites: true` + `skipPrismaGenerate: true` in Phase 1, then handled writing manually in Phase 3 (after killing gateway). That complexity existed only because the gateway needed to be killed between phases.
   - What's unclear: With remote gateway, there's no need for the two-phase approach. `regenerateSchemas()` can handle file writing itself when called with default options (`skipFileWrites: false`).
   - Recommendation: Call `regenerateSchemas({ dryRun, entity })` without `skipFileWrites`/`skipPrismaGenerate`. Let it write files. Then call `prisma generate` as a separate step after (since `codegen/index.ts` already handles `prisma generate` internally unless `skipPrismaGenerate: true`). Check if there's overlap — if `regenerateSchemas()` already runs `prisma generate` when `skipPrismaGenerate` is omitted, don't run it again in the script.

2. **Does the root `.env` file exist and contain `GATEWAY_URL` + `JWT_SECRET`?**
   - What we know: Currently these vars live in `objetiva-sync-gateway/.env`. D-02 says they should come from root `.env`.
   - What's unclear: Does a root `.env` file exist? Checked — no root `.env` found (only `objetiva-sync/.env` and `objetiva-sync-gateway/.env`).
   - Recommendation: The plan should include creating a root `.env.example` documenting `GATEWAY_URL` and `JWT_SECRET`, and the operator must copy values to a new root `.env`. The script's prerequisite check will catch missing vars.

---

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Node.js | Script runtime | ✓ | v22.14.0 | — |
| tsx | TypeScript runner | ✓ | v4.21.0 | — |
| Remote gateway at GATEWAY_URL | Schema fetch | Operator-dependent | — | Script exits with clear error message |
| `npx prisma generate` | Final step | ✓ (in gateway devDeps) | 6.19.2 | — |

**Missing dependencies with no fallback:**
- None blocking development/planning.

**Missing dependencies with fallback:**
- Remote gateway: script has `checkPrerequisites()` with clear error message and early exit if gateway unreachable.

---

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Vitest |
| Config file | `objetiva-sync-gateway/vitest.config.ts` / `objetiva-sync/vitest.config.ts` |
| Quick run (gateway) | `cd objetiva-sync-gateway && npx vitest run tests/unit` |
| Quick run (sync) | `cd objetiva-sync && npx vitest run tests/unit` |
| Full suite (gateway) | `cd objetiva-sync-gateway && npx vitest run` |
| Full suite (sync) | `cd objetiva-sync && npx vitest run` |

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| REGEN-01 | Script connects to remote gateway, fetches 4 schemas | integration | `cd objetiva-sync-gateway && npx vitest run tests/integration/cli-regenerate.integration.test.ts` | ✅ (existing test, may need updating for new script path) |
| REGEN-02 | Files written to correct paths | integration | Same cli-regenerate test | ✅ |
| REGEN-03 | No DLL/taskkill code in new script | manual review | `grep -r "taskkill\|DLL_PATH\|kill-gateway" scripts/` → expect no matches | N/A |
| REGEN-04 | Dry-run shows diff without writing | integration | Same cli-regenerate test (--dry-run path) | ✅ |
| FIX-01 | 207 with 0 errors returns success=true | unit | `cd objetiva-sync && npx vitest run tests/unit/gateway-client.test.ts` — or new unit test | ❌ Wave 0: new unit test needed |

### Sampling Rate
- **Per task commit:** `cd objetiva-sync && npx vitest run tests/unit`
- **Per wave merge:** `cd objetiva-sync-gateway && npx vitest run && cd ../objetiva-sync && npx vitest run`
- **Phase gate:** Full suite green before `/gsd:verify-work`

### Wave 0 Gaps
- [ ] `objetiva-sync/tests/unit/api-client-207-fix.test.ts` — unit test for 207 fix on all 4 clients. Must verify: (a) 207 + errors=0 → success=true, (b) 207 + errors>0 → success=false. Framework: Vitest with `vi.fn()` mock for `fetch`.
- [ ] The existing `cli-regenerate.integration.test.ts` references the OLD script path. If it hard-codes `objetiva-sync-gateway/scripts/regenerate-schemas.ts`, it needs updating for new path. Check `tests/helpers/cli-runner.js` for hard-coded paths.

---

## Project Constraints (from CLAUDE.md)

| Directive | Impact on Phase 25 |
|-----------|-------------------|
| Use `mcp__context7__query-docs` for library APIs | Not applicable — no new libraries introduced |
| Use `mcp__shadcn__search` before creating UI components | Not applicable — no UI components in this phase |
| `tsx` runner used throughout gateway | Confirmed — new script uses same `tsx` runner |
| No custom solutions when libraries exist | Confirmed — reusing `chalk`, `diff`, `regenerateSchemas()` |
| `superpowers:verification-before-completion` before declaring done | Must run both test suites before marking phase complete |

---

## Sources

### Primary (HIGH confidence)
- Direct code inspection: `objetiva-sync-gateway/scripts/regenerate-schemas.ts` — current script to replace (lines 1-327)
- Direct code inspection: `objetiva-sync-gateway/src/codegen/index.ts` — `regenerateSchemas()` function (lines 1-235)
- Direct code inspection: `objetiva-sync-gateway/src/codegen/diff-display.ts` — diff utilities (lines 1-317)
- Direct code inspection: `objetiva-sync-gateway/src/codegen/types.ts` — `RegenerateOptions` interface
- Direct code inspection: all 4 sync clients' 207 handling blocks
- `.planning/phases/25-script-adaptation-207-fix/25-CONTEXT.md` — locked decisions D-01 through D-10

### Secondary (MEDIUM confidence)
- `.planning/REGENERACION_SCHEMAS.md` — architecture documentation, confirmed matches code
- `objetiva-sync-gateway/package.json` — confirmed tsx v4.19.2, chalk v5.6.2 present

### Tertiary (LOW confidence)
- None.

---

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — all dependencies verified by direct `package.json` inspection and `--version` checks
- Architecture: HIGH — path resolution analysis based on direct code reading of `codegen/index.ts`
- Pitfalls: HIGH — CWD pitfall verified by reading `process.cwd()` usage in `codegen/index.ts` line 103 and 108; ESM extension pitfall verified from gateway `"type": "module"` in package.json
- 207 fix: HIGH — all 4 client blocks read directly, exact line numbers documented

**Research date:** 2026-03-28
**Valid until:** 2026-04-28 (stable codebase, no fast-moving dependencies)
