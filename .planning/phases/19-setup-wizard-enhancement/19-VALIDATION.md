---
phase: 19
slug: setup-wizard-enhancement
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-03-05
---

# Phase 19 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Vitest 4.0.18 |
| **Config file** | `objetiva-sync-gateway/vitest.config.ts` |
| **Quick run command** | `cd objetiva-sync-gateway && npx vitest run tests/unit/setup-wizard.test.ts` |
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
| 19-01-01 | 01 | 0 | WIZ-02 | unit | `npx vitest run tests/unit/setup-wizard.test.ts` | ❌ W0 | ⬜ pending |
| 19-01-02 | 01 | 0 | WIZ-04 | unit | `npx vitest run tests/unit/setup-wizard.test.ts` | ❌ W0 | ⬜ pending |
| 19-01-03 | 01 | 0 | WIZ-01, WIZ-03, WIZ-05, WIZ-06 | integration | `npx vitest run tests/integration/setup-wizard.integration.test.ts` | ❌ W0 | ⬜ pending |
| 19-02-01 | 02 | 1 | WIZ-03 | integration | `npx vitest run tests/integration/setup-wizard.integration.test.ts` | ✅ W0 | ⬜ pending |
| 19-02-02 | 02 | 1 | WIZ-05, WIZ-06 | integration | `npx vitest run tests/integration/setup-wizard.integration.test.ts` | ✅ W0 | ⬜ pending |
| 19-03-01 | 03 | 1 | WIZ-01, WIZ-02, WIZ-03, WIZ-04 | integration | `npx vitest run tests/integration/setup-wizard.integration.test.ts` | ✅ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `tests/unit/setup-wizard.test.ts` — unit tests for URL assembly (WIZ-02) and hex generation (WIZ-04)
- [ ] `tests/integration/setup-wizard.integration.test.ts` — integration tests for new endpoints (WIZ-01, WIZ-03, WIZ-05, WIZ-06)

*Existing tests `env-writer.test.ts`, `preflight.integration.test.ts` remain untouched.*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Step gating visual — only active step visible | WIZ-01 | DOM visibility is client-side JS | Open /setup, verify only step 1 visible. Click Next without filling fields — step should not advance |
| Download triggers browser save dialog | WIZ-06 | Browser file download behavior | Complete all steps, click Download — browser should offer .env file save |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 15s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
