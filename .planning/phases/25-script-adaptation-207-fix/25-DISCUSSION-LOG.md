# Phase 25: Script Adaptation & 207 Fix - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-03-28
**Phase:** 25-script-adaptation-207-fix
**Areas discussed:** Script location & invocation, 207 fix strategy, DLL/process removal scope, Diff display format

---

## Script Location & Invocation

| Option | Description | Selected |
|--------|-------------|----------|
| Monorepo root | Move script to monorepo root (scripts/regenerate-schemas.ts). Run with npm run regenerate-schemas from root package.json. | ✓ |
| Keep in gateway package | Keep script at objetiva-sync-gateway/scripts/ but remove local-gateway dependencies. | |
| New shared package | Create a new tools/ or dev-tools/ package in the monorepo. | |

**User's choice:** Monorepo root
**Notes:** Clean separation — script is a dev tool, not part of gateway runtime.

| Option | Description | Selected |
|--------|-------------|----------|
| Env var only | GATEWAY_URL from .env file. Consistent with existing patterns. | ✓ |
| CLI arg with env fallback | Accept --gateway-url flag, fall back to env var. | |

**User's choice:** Env var only
**Notes:** Operator sets it once in root .env.

| Option | Description | Selected |
|--------|-------------|----------|
| Script runs prisma generate | Complete workflow in one command. No DLL issues since gateway is remote. | ✓ |
| Write files only | Operator runs prisma generate manually. | |

**User's choice:** Script runs prisma generate
**Notes:** No DLL conflict possible in new architecture.

---

## 207 Fix Strategy

| Option | Description | Selected |
|--------|-------------|----------|
| Fix sync clients | When 207 has errors:0, set success:true. Gateway behavior is correct HTTP semantics. | ✓ |
| Fix gateway to return 200 | Change gateway to return 200 when 0 errors. | |
| Fix both sides | Belt and suspenders approach. | |

**User's choice:** Fix sync clients
**Notes:** Minimal change in 4 client files. Gateway 207 semantics are correct.

| Option | Description | Selected |
|--------|-------------|----------|
| Info when 0 errors | Log at info level when 207 has 0 errors. Keep warn for actual errors. | ✓ |
| Keep warn for all 207 | 207 is unusual — keep warn regardless. | |

**User's choice:** Info when 0 errors
**Notes:** Cleaner logs, no false alarms.

---

## DLL/Process Removal Scope

| Option | Description | Selected |
|--------|-------------|----------|
| Clean removal | Remove ALL Windows-specific code. Script becomes fetch→compute→write→prisma generate. | ✓ |
| Keep DLL retry as safety net | Remove process killing but keep DLL check/retry around prisma generate. | |

**User's choice:** Clean removal
**Notes:** Gateway is remote, no DLL conflict possible.

| Option | Description | Selected |
|--------|-------------|----------|
| Delete old script | Remove old script and package.json entries. Clean break. | ✓ |
| Keep but deprecate | Add deprecation notice pointing to new script. | |

**User's choice:** Delete it
**Notes:** No confusion about which to run.

---

## Diff Display Format

| Option | Description | Selected |
|--------|-------------|----------|
| Field-level diff | Per-field changes grouped by entity: added, removed, type changes. Summary line. | ✓ |
| File-level unified diff | Traditional unified diff of generated files. | |

**User's choice:** Field-level diff
**Notes:** Operator sees exactly what changed at the schema level.

| Option | Description | Selected |
|--------|-------------|----------|
| Colored (ANSI) | Green for added, red for removed, yellow for modified. | ✓ |
| Plain text with symbols | +/-/~ symbols, no colors. | |

**User's choice:** Colored
**Notes:** REGEN-04 explicitly asks for colored diff.

---

## Claude's Discretion

- Implementation of `regenerateSchemas()` codegen function adaptation
- Choice of color library (chalk vs raw ANSI codes)
- Exact file path resolution logic from monorepo root

## Deferred Ideas

None — discussion stayed within phase scope
