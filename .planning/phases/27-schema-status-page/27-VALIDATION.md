---
phase: 27
slug: schema-status-page
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-03-30
---

# Phase 27 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | None — no test config in dashboard; visual verification via playwright-cli |
| **Config file** | none |
| **Quick run command** | `npx vite build` (compile check) |
| **Full suite command** | playwright-cli visual verification of running dashboard |
| **Estimated runtime** | ~10 seconds (build), ~30 seconds (visual) |

---

## Sampling Rate

- **After every task commit:** Run `npx vite build` in `objetiva-sync-gateway/dashboard/`
- **After every plan wave:** Visual verification via playwright-cli screenshot
- **Before `/gsd:verify-work`:** Full visual verification — all entity tabs, all status indicators, loading/error states
- **Max feedback latency:** 30 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 27-01-01 | 01 | 1 | SCHEMA-01 | build | `cd objetiva-sync-gateway/dashboard && npx vite build` | ✅ | ⬜ pending |
| 27-01-02 | 01 | 1 | SCHEMA-01 | build | `cd objetiva-sync-gateway/dashboard && npx vite build` | ✅ | ⬜ pending |
| 27-01-03 | 01 | 1 | SCHEMA-03 | build | `cd objetiva-sync-gateway/dashboard && npx vite build` | ✅ | ⬜ pending |
| 27-01-04 | 01 | 1 | SCHEMA-03 | build | `cd objetiva-sync-gateway/dashboard && npx vite build` | ✅ | ⬜ pending |
| 27-02-01 | 02 | 2 | SCHEMA-01 | visual | playwright-cli screenshot | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

*Existing infrastructure covers build verification. Visual verification via playwright-cli requires running gateway + dashboard.*

- [ ] Gateway running with `POST /api/setup/token` available
- [ ] Dashboard dev server running on expected port

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Schema Status page renders full column table | SCHEMA-01 | Visual/interactive — no test framework in dashboard | Navigate to Schema Status tab, verify all 4 entities have data in table |
| Color-coded alignment indicators | SCHEMA-03 | Visual rendering verification | Check green/red/yellow dots and row tints across entity tabs |
| Entity tab switching with badges | SCHEMA-01 | Interactive behavior | Click each entity tab, verify table updates and badge counts match |
| Sync not reported banner | SCHEMA-01 | Conditional UI state | Verify banner shows when sync_reported=false |
| Loading/error states | SCHEMA-01 | Transient UI states | Verify spinner on load, error card on API failure |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 30s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending