# Phase 11: Deployment Configuration - Context

**Gathered:** 2026-02-04
**Status:** Ready for planning

<domain>
## Phase Boundary

Production deployment scripts and environment templates for both modules. objetiva-sync-gateway deploys to AlmaLinux VPS, objetiva-sync deploys to Windows (Git Bash). Scripts build, migrate, and start services via PM2. Nginx is already configured externally.

</domain>

<decisions>
## Implementation Decisions

### Target environment
- **objetiva-sync-gateway**: AlmaLinux (Linux VPS), separate machine
- **objetiva-sync**: Windows environment with Git Bash shell, separate machine
- Both communicate over the network (gateway serves API, sync calls it)
- **Process manager**: PM2 for both modules
- **Nginx**: Already configured on the Linux VPS — deploy script does NOT touch nginx

### Script behavior
- **Language**: Bash scripts for both (Git Bash on Windows, native on AlmaLinux)
- **Interaction**: Fully unattended — no prompts, errors go to logs/stdout
- **Failure mode**: Stop on error (exit immediately with clear error message, no rollback)
- **Pre-flight checks**: Claude's discretion on what checks to include

### Environment variables
- **Secret management**: .env files only (on each server)
- **Defaults**: Non-secret values get sensible defaults (PORT, BATCH_SIZE, etc.)
- **Environments**: Production only — no staging/production split
- **Validation**: Deploy script checks all required env vars are set and non-empty before building/starting

### Database migration
- **Gateway (PostgreSQL/Prisma)**: Auto-migrate — script runs `prisma migrate deploy` automatically
- **Sync (SQLite/Drizzle)**: Auto-migrate — script runs Drizzle migrations during deploy
- **Backup**: pg_dump before every migration on gateway
- **Backup location**: Local directory on the server (e.g., backups/ folder)

### Claude's Discretion
- Pre-flight check selection (Node version, deps, connectivity)
- Exact backup directory path and naming convention
- PM2 ecosystem file structure
- Build step details (TypeScript compilation approach)
- Log output format and verbosity

</decisions>

<specifics>
## Specific Ideas

No specific requirements — open to standard approaches

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope

</deferred>

---

*Phase: 11-deployment-configuration*
*Context gathered: 2026-02-04*
