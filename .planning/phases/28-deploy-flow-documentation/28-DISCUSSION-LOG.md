# Phase 28: Deploy Flow Documentation - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-03-30
**Phase:** 28-deploy-flow-documentation
**Areas discussed:** Document location & format, Scenarios & depth, Target audience & tone, Troubleshooting & verification

---

## Document Location & Format

### Q1: Where should the deploy flow document live?

| Option | Description | Selected |
|--------|-------------|----------|
| New section in DEPLOY.md | Add a "Schema Regeneration Deploy Cycle" section to the existing gateway DEPLOY.md. Keeps all deploy info in one place. | ✓ |
| New standalone file | Create a separate DEPLOY-SCHEMAS.md at monorepo root or in gateway/. Keeps it focused but adds another file to find. | |
| You decide | Claude picks the best location based on existing structure. | |

**User's choice:** New section in DEPLOY.md
**Notes:** Recommended option — keeps all deploy info in one place.

### Q2: What format style for the deploy steps?

| Option | Description | Selected |
|--------|-------------|----------|
| Numbered runbook | Step-by-step numbered procedure with exact commands to copy-paste. Like a checklist you follow top to bottom. | ✓ |
| Narrative guide | Prose explanation with embedded commands. More context about why each step matters, but longer to scan. | |
| Quick-reference card | Minimal: just the commands in order with one-line explanations. Fast to scan, assumes full understanding. | |

**User's choice:** Numbered runbook
**Notes:** Recommended option — straightforward copy-paste procedure.

---

## Scenarios & Depth

### Q3: How should each scenario be presented?

| Option | Description | Selected |
|--------|-------------|----------|
| One generic flow + scenario notes | The runbook is the same for all cases. Each scenario gets a short callout noting what to watch for. | ✓ |
| Separate flow per scenario | Each scenario gets its own numbered procedure with specific SQL examples. | |
| Generic flow only | Just the base procedure. The dry-run diff already shows what changed. | |

**User's choice:** One generic flow + scenario notes
**Notes:** Recommended option — avoids repetition while covering edge cases.

### Q4: Should the doc include example diff output?

| Option | Description | Selected |
|--------|-------------|----------|
| Yes, one example | Include a sample dry-run output for a typical case so the operator knows what to expect. | ✓ |
| No examples | Just describe what the dry-run does. | |
| You decide | Claude decides based on what makes the doc clearest. | |

**User's choice:** Yes, one example
**Notes:** Recommended option — gives operator visual reference of expected output.

---

## Target Audience & Tone

### Q5: Who is the primary reader?

| Option | Description | Selected |
|--------|-------------|----------|
| Operator who knows the system | Skip basic explanations, go straight to commands. | ✓ |
| Newcomer onboarding | Include context about what each component does and why each step matters. | |
| Both — layered | Quick runbook for experienced operator at top, expandable details below. | |

**User's choice:** Operator who knows the system
**Notes:** Recommended option — matches current operator profile.

### Q6: What language for the doc?

| Option | Description | Selected |
|--------|-------------|----------|
| Spanish | Consistent with existing DEPLOY.md which is in Spanish. | ✓ |
| English | Match technical docs and code comments which are mostly in English. | |
| You decide | Claude picks based on existing doc patterns. | |

**User's choice:** Spanish
**Notes:** Recommended option — consistent with existing DEPLOY.md.

---

## Troubleshooting & Verification

### Q7: Should the doc include a troubleshooting section?

| Option | Description | Selected |
|--------|-------------|----------|
| Short FAQ at the end | 3-5 common issues in quick problem → solution format. | |
| Inline verification per step | After each step, include a "Verify:" line showing how to confirm it worked. | |
| Both | Inline verification per step AND a troubleshooting FAQ at the end. | ✓ |
| None | Just the procedure. Operator knows where to look. | |

**User's choice:** Both
**Notes:** Most thorough option — inline checks catch issues early, FAQ covers edge cases.

### Q8: What's the key verification after the full cycle?

| Option | Description | Selected |
|--------|-------------|----------|
| Check Schema Status page | Phase 27 dashboard shows 3-way comparison. All columns green = success. | ✓ |
| Query PostgreSQL directly | Run a SQL query against the live DB to confirm the change is there. | |
| Both — dashboard + SQL | Schema Status page first, then direct SQL for certainty. | |

**User's choice:** Check Schema Status page
**Notes:** Recommended option — natural end-to-end verification using the tool built in Phase 27.

---

## Claude's Discretion

- Exact wording and section titles within the runbook
- Which specific dry-run example to use
- Number and choice of troubleshooting FAQ entries (3-5)
- Whether to include a brief intro paragraph

## Deferred Ideas

None — discussion stayed within phase scope
