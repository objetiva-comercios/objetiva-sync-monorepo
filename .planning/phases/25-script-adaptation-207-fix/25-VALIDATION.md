---
phase: 25
slug: script-adaptation-207-fix
status: draft
nyquist_compliant: true
wave_0_complete: false
created: 2026-03-29
---

# Phase 25 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | vitest |
| **Config file** | vitest.config.ts (or per-package configs) |
| **Quick run command** | `npx vitest run --reporter=verbose` |
| **Full suite command** | `npx vitest run` |
| **Estimated runtime** | ~30 seconds |

---

## Sampling Rate

- **After every task commit:** Run `npx vitest run --reporter=verbose`
- **After every plan wave:** Run `npx vitest run`
- **Before `/gsd:verify-work`:** Full suite must be green
- **Max feedback latency:** 30 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 25-00-01 | 00 | 0 | FIX-01 | unit scaffold | `cd objetiva-sync && npx vitest run tests/unit/api-client-207-fix.test.ts` | Creates it | ⬜ pending |
| 25-01-01 | 01 | 1 | REGEN-01 | structural | `grep -q "process.chdir" scripts/regenerate-schemas.ts && grep -q "regenerate-schemas" package.json` | N/A (script) | ⬜ pending |
| 25-01-02 | 01 | 1 | REGEN-03 | structural | `grep -cE "taskkill\|DLL_PATH\|kill-gateway" scripts/regenerate-schemas.ts \| grep -q "^0$"` | N/A (script) | ⬜ pending |
| 25-02-01 | 02 | 1 | FIX-01 | unit | `cd objetiva-sync && npx vitest run tests/unit/api-client-207-fix.test.ts` | ✅ (from 25-00) | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [x] Test stubs for FIX-01 (207/0-errors handling) — Plan 25-00 creates `objetiva-sync/tests/unit/api-client-207-fix.test.ts`

*Note: REGEN-01 through REGEN-04 are verified structurally (grep/test checks) because they involve a CLI script that requires a live remote gateway to run. The script cannot be unit-tested without mocking the entire codegen pipeline. Manual verification covers the runtime behavior (see Manual-Only section below).*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Script runs from Windows dev machine | REGEN-01 | Requires actual Windows environment + network | Run `npm run regenerate-schemas` from Windows, verify output files |
| Colored diff output in terminal | REGEN-02 | Terminal color rendering | Run `npm run regenerate-schemas:dry-run`, visually verify colors |

---

## Validation Sign-Off

- [x] All tasks have `<automated>` verify or Wave 0 dependencies
- [x] Sampling continuity: no 3 consecutive tasks without automated verify
- [x] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 30s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
