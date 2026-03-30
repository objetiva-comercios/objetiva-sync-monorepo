# Phase 28: Deploy Flow Documentation - Context

**Gathered:** 2026-03-30
**Status:** Ready for planning

<domain>
## Phase Boundary

Document the complete schema regeneration deploy cycle as a runbook section in the existing DEPLOY.md. Covers: regenerate schemas locally, review diffs, commit, push, rebuild Docker image, and verify prisma db push runs automatically on container start. Does NOT add new tooling or automation — purely documentation of the existing flow.

</domain>

<decisions>
## Implementation Decisions

### Document Location & Format
- **D-01:** New section added to `objetiva-sync-gateway/DEPLOY.md` titled "Ciclo de Deploy: Regeneracion de Schemas" (or similar). Keeps all deploy info in one file.
- **D-02:** Numbered runbook format — step-by-step procedure with exact commands to copy-paste. Operator follows top to bottom.

### Scenarios & Depth
- **D-03:** One generic flow covers all cases (the procedure is the same: regenerate → review diff → commit → rebuild → verify). Each scenario (new column, type change, column removal, new table) gets a short callout note explaining what to watch for.
- **D-04:** Include one example of dry-run diff output showing what a typical case looks like (e.g., new column added to articulos).

### Target Audience & Tone
- **D-05:** Written for the operator who already knows the system — skip basic explanations of Docker, monorepo structure, or sync pipeline. Go straight to commands.
- **D-06:** Written in Spanish, consistent with existing DEPLOY.md.

### Verification & Troubleshooting
- **D-07:** Each runbook step includes an inline "Verificar:" line showing how to confirm it worked (e.g., check diff output, check docker logs, check Schema Status).
- **D-08:** Short troubleshooting FAQ at the end covering 3-5 common issues (JWT auth fails, container doesn't pick up changes, prisma db push errors, diff shows no changes when expected).
- **D-09:** Final end-to-end verification is checking the Schema Status page in the gateway dashboard — all columns should show green (aligned) after the full cycle completes.

### Claude's Discretion
- Exact wording and section titles within the runbook
- Which specific dry-run example to use (as long as it shows a new column scenario)
- Number and choice of troubleshooting FAQ entries (3-5 range)
- Whether to include a brief intro paragraph before the runbook steps

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Existing Deploy Documentation
- `objetiva-sync-gateway/DEPLOY.md` — Current gateway deploy guide where the new section will be added
- `objetiva-sync-gateway/docker-entrypoint.sh` — Shows prisma db push runs automatically on container start
- `objetiva-sync-gateway/Dockerfile` — Docker build configuration
- `objetiva-sync-gateway/docker-compose.yml` — Docker compose configuration

### Schema Regeneration Technical Reference
- `.planning/REGENERACION_SCHEMAS.md` — Complete technical document describing the regeneration flow, distributed architecture, and all phases (introspection, generation, writing, prisma generate)

### Phase 25 Context (Script Implementation)
- `.planning/phases/25-script-adaptation-207-fix/25-CONTEXT.md` — Decisions about script location (monorepo root), invocation (`npm run regenerate-schemas`), dry-run format, and env var configuration

### Requirements
- `.planning/REQUIREMENTS.md` — FIX-02 defines acceptance criteria for this phase

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `objetiva-sync-gateway/DEPLOY.md` — Existing deploy doc (155+ lines), well-structured with numbered sections, already in Spanish
- `.planning/REGENERACION_SCHEMAS.md` — Technical reference with complete flow diagrams that can inform the runbook content

### Established Patterns
- DEPLOY.md uses numbered sections (1, 2, 3...) with bash code blocks and verification steps
- Spanish language throughout with technical terms in English (Docker, Prisma, PostgreSQL)
- Includes "Verificar" steps after key commands (e.g., `docker compose ps`, check logs)

### Integration Points
- New section appended to existing DEPLOY.md after the current deployment sections
- Schema Status page (Phase 27) is the verification endpoint for the full cycle
- Regeneration script at `scripts/regenerate-schemas.ts` invoked via `npm run regenerate-schemas`

</code_context>

<specifics>
## Specific Ideas

- Schema Status page (Phase 27) is the canonical end-to-end verification — all columns green means the cycle completed successfully
- The operator already knows the system, so the doc should feel like a quick-reference runbook, not a tutorial

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope

</deferred>

---

*Phase: 28-deploy-flow-documentation*
*Context gathered: 2026-03-30*
