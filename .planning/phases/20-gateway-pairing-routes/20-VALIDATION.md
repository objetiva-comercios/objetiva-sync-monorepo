---
phase: 20
slug: gateway-pairing-routes
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-03-05
---

# Phase 20 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Vitest ^4.0.18 |
| **Config file** | `objetiva-sync-gateway/vitest.config.ts` |
| **Quick run command** | `cd objetiva-sync-gateway && npx vitest run tests/unit/pairing-store.test.ts tests/integration/pairing.integration.test.ts` |
| **Full suite command** | `cd objetiva-sync-gateway && npx vitest run` |
| **Estimated runtime** | ~10 seconds |

---

## Sampling Rate

- **After every task commit:** Run `cd objetiva-sync-gateway && npx vitest run tests/unit/pairing-store.test.ts`
- **After every plan wave:** Run `cd objetiva-sync-gateway && npx vitest run tests/unit/pairing-store.test.ts tests/integration/pairing.integration.test.ts`
- **Before `/gsd:verify-work`:** Full suite must be green
- **Max feedback latency:** 10 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 20-01-01 | 01 | 1 | PAIR-01 | unit | `npx vitest run tests/unit/pairing-store.test.ts` | ❌ W0 | ⬜ pending |
| 20-01-02 | 01 | 1 | PAIR-01 | unit | `npx vitest run tests/unit/pairing-store.test.ts` | ❌ W0 | ⬜ pending |
| 20-01-03 | 01 | 1 | PAIR-04 | unit | `npx vitest run tests/unit/pairing-store.test.ts` | ❌ W0 | ⬜ pending |
| 20-02-01 | 02 | 1 | PAIR-01 | integration | `npx vitest run tests/integration/pairing.integration.test.ts` | ❌ W0 | ⬜ pending |
| 20-02-02 | 02 | 1 | PAIR-02 | integration | `npx vitest run tests/integration/pairing.integration.test.ts` | ❌ W0 | ⬜ pending |
| 20-02-03 | 02 | 1 | PAIR-03 | integration | `npx vitest run tests/integration/pairing.integration.test.ts` | ❌ W0 | ⬜ pending |
| 20-02-04 | 02 | 1 | PAIR-04 | integration | `npx vitest run tests/integration/pairing.integration.test.ts` | ❌ W0 | ⬜ pending |
| 20-02-05 | 02 | 1 | PAIR-05 | integration | `npx vitest run tests/integration/pairing.integration.test.ts` | ❌ W0 | ⬜ pending |
| 20-03-01 | 03 | 2 | PAIR-01 | manual | Wizard step 6 shows code | N/A | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `tests/unit/pairing-store.test.ts` — stubs for PAIR-01 (charset, TTL, invalidation), PAIR-02 (case normalization), PAIR-04 (consumed tracking), SC-5
- [ ] `tests/integration/pairing.integration.test.ts` — stubs for PAIR-01, PAIR-02, PAIR-03, PAIR-04, PAIR-05 end-to-end via `app.inject()`

*Existing infrastructure covers framework setup — only test files needed.*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Wizard step 6 displays code prominently with copy button and countdown | PAIR-01 (UI) | Visual/UX verification | Navigate to wizard step 6, verify code display, copy button, and countdown timer |
| Wizard step 6 gated behind GATEWAY_PUBLIC_URL | PAIR-01 (UI) | Conditional UI rendering | Remove GATEWAY_PUBLIC_URL from .env, navigate to step 6, verify gating message |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 10s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
