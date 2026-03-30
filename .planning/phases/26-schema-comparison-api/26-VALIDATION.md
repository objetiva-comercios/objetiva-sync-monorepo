---
phase: 26
slug: schema-comparison-api
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-03-29
---

# Phase 26 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Vitest (existing) |
| **Config file** | `objetiva-sync-gateway/vitest.config.ts` |
| **Quick run command** | `cd objetiva-sync-gateway && npx vitest run tests/unit/` |
| **Full suite command** | `cd objetiva-sync-gateway && npx vitest run` |
| **Estimated runtime** | ~15 seconds |

---

## Sampling Rate

- **After every task commit:** Run `cd objetiva-sync-gateway && npx vitest run tests/unit/`
- **After every plan wave:** Run `cd objetiva-sync-gateway && npx vitest run`
- **Before `/gsd:verify-work`:** Full suite must be green
- **Max feedback latency:** 15 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 26-01-01 | 01 | 1 | SCHEMA-04 | unit | `npx vitest run tests/unit/sync-schema-store.test.ts` | ❌ W0 | ⬜ pending |
| 26-01-02 | 01 | 1 | SCHEMA-04 | integration | `npx vitest run tests/integration/schema-comparison.integration.test.ts` | ❌ W0 | ⬜ pending |
| 26-01-03 | 01 | 1 | SCHEMA-04 | integration | same file | ❌ W0 | ⬜ pending |
| 26-02-01 | 02 | 1 | SCHEMA-02 | integration | `npx vitest run tests/integration/schema-comparison.integration.test.ts` | ❌ W0 | ⬜ pending |
| 26-02-02 | 02 | 1 | SCHEMA-02 | unit | `npx vitest run tests/unit/schema-comparison.test.ts` | ❌ W0 | ⬜ pending |
| 26-02-03 | 02 | 1 | SCHEMA-02 | unit | same file | ❌ W0 | ⬜ pending |
| 26-02-04 | 02 | 1 | SCHEMA-02 | unit | same file | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `objetiva-sync-gateway/tests/unit/sync-schema-store.test.ts` — stubs for SCHEMA-04 (store set/get/reset/hasData)
- [ ] `objetiva-sync-gateway/tests/unit/schema-comparison.test.ts` — stubs for SCHEMA-02 (aligned, mismatched, missing, not_reported, summary)
- [ ] `objetiva-sync-gateway/tests/integration/schema-comparison.integration.test.ts` — route-level tests for SCHEMA-04 + SCHEMA-02 (uses `buildApp()` + `app.inject()` pattern)

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Sync calls report endpoint on startup | SCHEMA-04 | Requires running sync process | Start sync, verify gateway logs show schema report received |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 15s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
