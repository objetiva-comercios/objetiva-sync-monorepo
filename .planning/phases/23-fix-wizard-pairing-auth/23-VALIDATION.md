---
phase: 23
slug: fix-wizard-pairing-auth
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-03-16
---

# Phase 23 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Vitest 4.0.18 |
| **Config file** | `objetiva-sync-gateway/vitest.config.ts`, `objetiva-sync/vitest.config.ts` |
| **Quick run command** | `cd objetiva-sync-gateway && npx vitest run tests/integration/wizard-flow.test.ts` |
| **Full suite command** | `cd objetiva-sync-gateway && npx vitest run && cd ../objetiva-sync && npx vitest run` |
| **Estimated runtime** | ~15 seconds |

---

## Sampling Rate

- **After every task commit:** Run `cd objetiva-sync-gateway && npx vitest run tests/integration/wizard-flow.test.ts`
- **After every plan wave:** Run `cd objetiva-sync-gateway && npx vitest run && cd ../objetiva-sync && npx vitest run`
- **Before `/gsd:verify-work`:** Full suite must be green
- **Max feedback latency:** 15 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 23-01-01 | 01 | 1 | AUTH-RM-04 | integration | `cd objetiva-sync-gateway && npx vitest run tests/integration/wizard-flow.test.ts -x` | ❌ W0 | ⬜ pending |
| 23-01-02 | 01 | 1 | AUTH-RM-04 | integration | `cd objetiva-sync-gateway && npx vitest run tests/integration/setup-wizard.integration.test.ts -x` | ✅ | ⬜ pending |
| 23-01-03 | 01 | 1 | PAIR-01 | integration | `cd objetiva-sync-gateway && npx vitest run tests/integration/wizard-flow.test.ts -x` | ❌ W0 | ⬜ pending |
| 23-01-04 | 01 | 1 | PAIR-02 | integration | `cd objetiva-sync-gateway && npx vitest run tests/integration/wizard-flow.test.ts -x` | ❌ W0 | ⬜ pending |
| 23-02-01 | 02 | 1 | AUTH-RM-06 | unit | `cd objetiva-sync && npx vitest run tests/unit/gateway-client.test.ts -x` | ✅ | ⬜ pending |
| 23-03-01 | 03 | 1 | AUTH-RM-05 | integration | `cd objetiva-sync-gateway && npx vitest run tests/integration/wizard-flow.test.ts -x` | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `objetiva-sync-gateway/tests/integration/wizard-flow.test.ts` — full wizard flow E2E covering AUTH-RM-04, PAIR-01, PAIR-02
- [ ] Update `objetiva-sync-gateway/tests/integration/setup-wizard.integration.test.ts` — fix broken 403 test (needs setupComplete=true)

*Existing infrastructure covers test framework and fixtures.*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Fresh Install Wizard completes visually | AUTH-RM-05 | Full browser-based wizard flow | Start gateway with empty DB, open browser, walk through 5 steps |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 15s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
