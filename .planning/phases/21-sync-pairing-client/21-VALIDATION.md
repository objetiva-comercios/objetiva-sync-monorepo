---
phase: 21
slug: sync-pairing-client
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-03-05
---

# Phase 21 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Vitest (vitest.config.ts at objetiva-sync root) |
| **Config file** | `objetiva-sync/vitest.config.ts` |
| **Quick run command** | `cd objetiva-sync && npm test -- --testPathPattern="config-pairing\|gateway-client" --run` |
| **Full suite command** | `cd objetiva-sync && npm test -- --run` |
| **Estimated runtime** | ~10 seconds |

---

## Sampling Rate

- **After every task commit:** Run `cd objetiva-sync && npm test -- --testPathPattern="config-pairing|gateway-client" --run`
- **After every plan wave:** Run `cd objetiva-sync && npm test -- --run`
- **Before `/gsd:verify-work`:** Full suite must be green
- **Max feedback latency:** 10 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 21-01-01 | 01 | 1 | SPC-02 | unit | `cd objetiva-sync && npm test -- --testPathPattern="config-pairing" --run` | ❌ W0 | ⬜ pending |
| 21-01-02 | 01 | 1 | SPC-02 | unit | same | ❌ W0 | ⬜ pending |
| 21-01-03 | 01 | 1 | SPC-03 | unit | `cd objetiva-sync && npm test -- --testPathPattern="gateway-client" --run` | ❌ W0 | ⬜ pending |
| 21-02-01 | 02 | 1 | SPC-01 | manual | manual — open browser | N/A | ⬜ pending |
| 21-02-02 | 02 | 1 | SPC-03 | manual | manual — browser test | N/A | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `objetiva-sync/tests/unit/config-pairing-claim.test.ts` — stubs for SPC-02 (claim route: success, 404, 410, 502, missing fields)
- [ ] `objetiva-sync/tests/unit/gateway-client.test.ts` — stubs for SPC-03 (SQLite-first read for URL and JWT secret)

*Existing `tests/setup.ts` and `tests/store/repositories/config-repo.test.ts` patterns provide all needed fixtures — no new conftest needed.*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Pairing card renders with correct fields and layout | SPC-01 | EJS view rendering, visual layout | Open /config/api in browser, verify card appears with gateway URL input, code input, and "Conectar" button |
| Auto-uppercase and input masking on code field | SPC-01 | DOM behavior | Type lowercase letters in code field, verify auto-uppercase |
| Success/error UI feedback after claim | SPC-02 | Client-side JS + visual | Attempt claim with valid/invalid code, verify banners appear |
| Status card auto-refreshes after successful pairing + test | SPC-03 | Full integration flow | Complete pairing, verify status card updates |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 10s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
