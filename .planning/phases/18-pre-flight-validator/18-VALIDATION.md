---
phase: 18
slug: pre-flight-validator
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-03-05
---

# Phase 18 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Vitest ^4.0.18 |
| **Config file** | `objetiva-sync-gateway/vitest.config.ts` |
| **Quick run command** | `cd objetiva-sync-gateway && npx vitest run tests/unit/env-writer.test.ts` |
| **Full suite command** | `cd objetiva-sync-gateway && npx vitest run` |
| **Estimated runtime** | ~15 seconds |

---

## Sampling Rate

- **After every task commit:** Run `cd objetiva-sync-gateway && npx vitest run tests/unit/env-writer.test.ts`
- **After every plan wave:** Run `cd objetiva-sync-gateway && npx vitest run`
- **Before `/gsd:verify-work`:** Full suite must be green
- **Max feedback latency:** 15 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 18-01-01 | 01 | 1 | PF-05 | unit | `npx vitest run tests/unit/env-writer.test.ts` | ❌ W0 | ⬜ pending |
| 18-01-02 | 01 | 1 | PF-05 | unit | `npx vitest run tests/unit/env-writer.test.ts` | ❌ W0 | ⬜ pending |
| 18-02-01 | 02 | 1 | PF-01 | integration | `npx vitest run tests/integration/preflight.integration.test.ts` | ❌ W0 | ⬜ pending |
| 18-02-02 | 02 | 1 | PF-02 | integration | `npx vitest run tests/integration/preflight.integration.test.ts` | ❌ W0 | ⬜ pending |
| 18-02-03 | 02 | 1 | PF-03 | integration | `npx vitest run tests/integration/preflight.integration.test.ts` | ❌ W0 | ⬜ pending |
| 18-03-01 | 03 | 2 | PF-04 | integration | `npx vitest run tests/integration/preflight.integration.test.ts` | ❌ W0 | ⬜ pending |
| 18-03-02 | 03 | 2 | PF-01 | integration | `npx vitest run tests/integration/preflight.integration.test.ts` | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `tests/unit/env-writer.test.ts` — stubs for PF-05 (mutex, escaping, concurrent writes)
- [ ] `tests/integration/preflight.integration.test.ts` — stubs for PF-01 through PF-04
- [ ] `@fastify/rate-limit` install: `cd objetiva-sync-gateway && npm install @fastify/rate-limit`

*Wave 0 creates test stubs and installs missing dependency before implementation begins.*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Startup banner shows ✓/✗ checklist on stderr | PF-01 | Visual formatting verification | Start gateway with missing env vars, verify banner output |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 15s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
