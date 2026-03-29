---
phase: 25
slug: script-adaptation-207-fix
status: draft
nyquist_compliant: false
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
| 25-01-01 | 01 | 1 | REGEN-01 | integration | `npx vitest run regenerate-schemas` | ❌ W0 | ⬜ pending |
| 25-01-02 | 01 | 1 | REGEN-02 | integration | `npx vitest run regenerate-schemas` | ❌ W0 | ⬜ pending |
| 25-01-03 | 01 | 1 | REGEN-03 | unit | `npx vitest run regenerate-schemas` | ❌ W0 | ⬜ pending |
| 25-01-04 | 01 | 1 | REGEN-04 | integration | `npx vitest run regenerate-schemas` | ❌ W0 | ⬜ pending |
| 25-02-01 | 02 | 1 | FIX-01 | unit | `npx vitest run sync-client` | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] Test stubs for REGEN-01 through REGEN-04 (regeneration script tests)
- [ ] Test stubs for FIX-01 (207/0-errors handling)
- [ ] Shared fixtures for HTTP mocking (gateway responses)

*If none: "Existing infrastructure covers all phase requirements."*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Script runs from Windows dev machine | REGEN-01 | Requires actual Windows environment + network | Run `npm run regenerate-schemas` from Windows, verify output files |
| Colored diff output in terminal | REGEN-02 | Terminal color rendering | Run `npm run regenerate-schemas:dry-run`, visually verify colors |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 30s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
