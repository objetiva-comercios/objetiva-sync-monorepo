# Phase 3: CLI Code Regeneration - Context

**Gathered:** 2026-01-27
**Status:** Ready for planning

<domain>
## Phase Boundary

Command-line tool that introspects PostgreSQL schemas via gateway API and automatically regenerates Prisma schema and Zod validation files, keeping code synchronized with database as the source of truth. Supports selective entity regeneration and dry-run preview mode.

</domain>

<decisions>
## Implementation Decisions

### Command invocation & flags
- Base command: `npm run regenerate-schemas`
- `--entity` flag: Single entity per invocation (e.g., `--entity articulos`)
- `--dry-run` flag: Preview changes without writing files
- Default behavior: Write files immediately after showing diff (no --dry-run)
- No `--force` flag: Always show diff summary before writing

### Diff presentation & user feedback
- Diff format: Structured summary first (Added: X, Modified: Y, Removed: Z), followed by detailed line-by-line diff
- No changes output: Show what was validated (e.g., "Validated 4 entities, no changes needed")
- Color coding: Green for additions, red for removals, yellow for modifications
- Multi-entity organization: Sequential - show each entity's complete changes before moving to next

### File modification behavior
- No automatic backups - assume git is the backup mechanism
- Prisma schema: Full overwrite - manual customizations belong in separate files
- Zod schema location: Separate file per entity (e.g., `articulos.schema.ts`)
- Post-generation: Automatically run `prisma generate` after updating schema.prisma

### Error handling & validation
- Gateway unavailable: Fail immediately with clear error message (no retries)
- Partial failure: Stop immediately - all or nothing (no partial updates)
- Pre-flight checks: Validate required environment variables (gateway URL, auth token) before starting
- Error message format: Structured output with error codes and actionable suggestions (e.g., "E001: Gateway unreachable at ${URL}. Check GATEWAY_URL env var.")

### Claude's Discretion
- Exact TypeScript types for CLI argument parsing
- Code organization within CLI script
- Detailed diff formatting (line number display, context lines)
- Progress indicators during schema fetching and file writing
- Exit codes for different error scenarios

</decisions>

<specifics>
## Specific Ideas

- CLI should feel like a standard Node.js development tool - familiar patterns for developers
- Error messages should be immediately actionable - point to exact configuration or network issue
- Sequential entity display ensures complete understanding of each entity's changes before moving on
- Color coding follows standard diff conventions that developers expect

</specifics>

<deferred>
## Deferred Ideas

None - discussion stayed within phase scope

</deferred>

---

*Phase: 03-cli-code-regeneration*
*Context gathered: 2026-01-27*
