---
phase: 11-deployment-configuration
plan: 01
subsystem: deployment
status: complete
wave: 1
tags: [deployment, almalinux, pm2, automation, gateway, bash, documentation]

requires:
  - "10-04: Incremental sync documentation"
  - "09-03: Gateway schema consolidation"

provides:
  - automated-deployment-script
  - pm2-ecosystem-config
  - env-documentation
  - almalinux-deployment-guide

affects:
  - "11-02: Sync deployment (will use similar patterns)"
  - "12-*: Production deployment (will use these scripts)"

tech-stack:
  added:
    - pm2: "Process manager for production Node.js apps"
  patterns:
    - "Bash deployment automation with pre-flight checks"
    - "PM2 fork mode for SSE-compatible process management"
    - "Automated PostgreSQL backups before migrations"
    - "Environment variable validation before deployment"

key-files:
  created:
    - objetiva-sync-gateway/deploy.sh: "15-step automated deployment script"
    - objetiva-sync-gateway/ecosystem.config.js: "PM2 process configuration (fork mode)"
    - objetiva-sync-gateway/.env.example: "Comprehensive env var documentation (11 variables)"
    - objetiva-sync-gateway/DEPLOYMENT.md: "AlmaLinux deployment guide (13KB)"
  modified: []

decisions:
  - id: DEC-11-01-01
    title: "Use PM2 fork mode (not cluster) for gateway"
    rationale: "Gateway uses Server-Sent Events (SSE) for sync progress streaming. Cluster mode would break SSE connections due to lack of sticky sessions and inter-process state sharing."
    alternatives: ["Cluster mode with Redis for state", "Nginx load balancing"]
    chosen: "Fork mode, single instance"

  - id: DEC-11-01-02
    title: "Target AlmaLinux (RHEL) instead of Ubuntu/Debian"
    rationale: "VPS runs AlmaLinux. Different package manager (dnf vs apt), paths (/var/lib/pgsql vs /etc/postgresql), firewall (firewalld vs ufw), nginx config locations (/etc/nginx/conf.d vs sites-available)."
    alternatives: ["Keep Ubuntu/Debian docs", "Support both"]
    chosen: "AlmaLinux-specific documentation"

  - id: DEC-11-01-03
    title: "Automated pg_dump backup before every migration"
    rationale: "Migrations can fail or have bugs. Backups enable rollback. Using custom format (-Fc) with compression (-Z 9) for space efficiency. 7-day retention balances safety with disk usage."
    alternatives: ["Manual backups only", "No backups"]
    chosen: "Automated backups in deploy.sh"

  - id: DEC-11-01-04
    title: "Bash script instead of package.json scripts"
    rationale: "Need platform-specific logic (pg_dump connection string parsing, pm2 process detection, health checks). Bash provides better error handling (set -euo pipefail), logging, and system integration than npm scripts."
    alternatives: ["Node.js deployment script", "npm scripts only"]
    chosen: "Bash script with comprehensive error handling"

metrics:
  duration: "11 minutes"
  tasks-completed: 2
  tasks-total: 2
  files-created: 4
  lines-added: 1109
  commits: 2

completed: 2026-02-04
---

# Phase 11 Plan 01: Gateway Deployment Infrastructure Summary

Automated deployment infrastructure for objetiva-sync-gateway on AlmaLinux VPS with PM2, PostgreSQL backup automation, and comprehensive environment documentation.

## Objective Achieved

Created complete deployment automation for the gateway, enabling unattended deployment with a single command (`bash deploy.sh`). The script handles all deployment steps: dependency installation, TypeScript compilation, database backup, Prisma migrations, and PM2 process management. Updated all deployment documentation from Ubuntu/Debian to AlmaLinux (RHEL).

## Tasks Completed

### Task 1: Create gateway deploy.sh and ecosystem.config.js ✅

**Files created:**
- `deploy.sh` (290 lines): Comprehensive deployment automation
- `ecosystem.config.js` (51 lines): PM2 process configuration

**deploy.sh features:**
1. Header with `set -euo pipefail` for strict error handling
2. SCRIPT_DIR detection for reliable relative paths
3. Logging function with timestamps to `logs/deploy-YYYYMMDD-HHMMSS.log`
4. Error handler with line number reporting
5. `validate_env_vars` function for comprehensive validation
6. Pre-flight checks: Node.js >= 20, npm, pm2, pg_dump
7. Environment loading and validation (7 required vars)
8. Dependency installation (`npm ci --production=false`)
9. Prisma Client generation
10. TypeScript build with verification
11. PostgreSQL backup (pg_dump -Fc -Z 9) to `backups/` directory
12. Backup verification (existence and size > 0)
13. 7-day backup cleanup
14. Prisma migrations (`migrate deploy`)
15. PM2 start/reload with automatic detection
16. Health check (3-second wait, PM2 status verification)
17. Completion message with helpful commands

**ecosystem.config.js features:**
- Name: "sync-gateway"
- Script: "./dist/server.js"
- **Fork mode** (NOT cluster) - required for SSE connections
- Single instance
- Auto-restart enabled
- 512M memory limit
- Logging to `logs/pm2-error.log` and `logs/pm2-out.log`
- 5s kill timeout, 4s restart delay

**Commit:** `d422650` - feat(11-01): add automated deployment script and PM2 configuration

### Task 2: Enhance gateway .env.example and update DEPLOYMENT.md ✅

**Files created/enhanced:**
- `.env.example` (87 lines): Complete environment variable documentation
- `DEPLOYMENT.md` (13KB): AlmaLinux deployment guide

**.env.example enhancements:**
- Organized into 6 sections: SERVER, DATABASE, JWT, SYNC CLIENT, LOGGING, OPTIONAL, CODEGEN
- Documents all 11 environment variables used in gateway source code:
  - **Required:** PORT, NODE_ENV, HOST, DATABASE_URL, JWT_SECRET, JWT_EXPIRES_IN, SYNC_USERNAME, SYNC_PASSWORD_HASH
  - **Optional:** LOG_LEVEL, APP_NAME, SYNC_ENTITIES
  - **Codegen only:** GATEWAY_URL, SYNC_PASSWORD
- Inline comments with generation commands:
  - JWT_SECRET: `openssl rand -hex 32`
  - SYNC_PASSWORD_HASH: `node -e "import('bcryptjs').then(b => console.log(b.hashSync('yourpassword', 10)))"`
- Critical warning: JWT_EXPIRES_IN must be NUMBER (seconds), not string (would be treated as milliseconds)
- Example values and format documentation

**DEPLOYMENT.md updates:**
- **OS changed:** Ubuntu/Debian → AlmaLinux 8/9 (RHEL)
- **Package manager:** `apt` → `dnf`
- **Node.js version:** 18+ → 20+
- **PostgreSQL paths:** `/etc/postgresql/*/main/pg_hba.conf` → `/var/lib/pgsql/data/pg_hba.conf`
- **Nginx paths:** `sites-available/sites-enabled` → `conf.d/`
- **Firewall:** `ufw` → `firewall-cmd`
- **Added:** PM2 requirement and installation steps
- **New section:** "Despliegue Automatizado (Recomendado)" at the top
  - Documents 9-step automated process
  - Prerequisites (env vars configuration)
  - First deployment with `bash deploy.sh`
  - Update workflow (`git pull && bash deploy.sh`)
  - Post-deployment commands (pm2 status, logs, restart)
- **Manual section:** Kept as "Despliegue Manual (Paso a Paso)" for reference
- **Updated troubleshooting:** Added deploy.sh error handling
- **Updated backups:** References automated backup in deploy.sh

**Commit:** `93320b2` - docs(11-01): enhance .env.example and update DEPLOYMENT.md for AlmaLinux

## Verification Results

All verification criteria met:

1. ✅ `deploy.sh` exists with all 15 deployment steps in correct order
2. ✅ `ecosystem.config.js` exists with fork mode (not cluster) and correct script path
3. ✅ `.env.example` documents all 11 env vars found in gateway source code
4. ✅ `DEPLOYMENT.md` references AlmaLinux, not Ubuntu/Debian (16 occurrences)
5. ✅ `DEPLOYMENT.md` has automated deployment section referencing deploy.sh
6. ✅ No .env files with actual secrets created (only .env.example)

## Technical Implementation

### Deployment Script Architecture

The `deploy.sh` script follows a linear, fail-fast architecture:

```
┌─────────────────────────────────────────┐
│ 1. Header (set -euo pipefail)          │
│ 2. Logging & Error Handling Setup      │
├─────────────────────────────────────────┤
│ 3. Pre-flight Checks                   │
│    - Node.js >= 20                      │
│    - npm, pm2, pg_dump available        │
├─────────────────────────────────────────┤
│ 4. Environment Validation               │
│    - Load .env                          │
│    - Validate 7 required vars           │
├─────────────────────────────────────────┤
│ 5. Build Phase                          │
│    - npm ci                             │
│    - prisma generate                    │
│    - npm run build                      │
│    - Verify dist/ exists                │
├─────────────────────────────────────────┤
│ 6. Database Phase                       │
│    - Create backup (pg_dump -Fc -Z 9)  │
│    - Verify backup size > 0             │
│    - Clean old backups (> 7 days)       │
│    - Run migrations                     │
├─────────────────────────────────────────┤
│ 7. PM2 Phase                            │
│    - Detect existing process            │
│    - Start or reload                    │
│    - Save process list                  │
├─────────────────────────────────────────┤
│ 8. Health Check                         │
│    - Sleep 3s                           │
│    - Verify PM2 status == online        │
└─────────────────────────────────────────┘
```

**Error handling:**
- `set -euo pipefail`: Exit on error, undefined var, or pipe failure
- `trap 'handle_error $LINENO' ERR`: Report exact line of failure
- All logs written to both stdout and timestamped file

**Idempotency:**
- Re-running script is safe (PM2 reload instead of start)
- Backup creates new file each time (timestamped)
- Old backups auto-cleaned

### PM2 Configuration Choices

**Why fork mode instead of cluster?**

The gateway uses Server-Sent Events (SSE) for sync progress streaming:

```javascript
// In gateway: SSE endpoint for sync progress
fastify.get('/api/sync/progress/:operationId', async (request, reply) => {
  reply.raw.setHeader('Content-Type', 'text/event-stream')
  // Stream progress events to client
})
```

**Cluster mode problems:**
1. **No sticky sessions:** Client requests could hit different workers
2. **Lost state:** Progress events emitted on worker A wouldn't reach client connected to worker B
3. **Complex workarounds:** Would need Redis pub/sub or shared state

**Fork mode solution:**
- Single instance handles all SSE connections
- 512M memory limit is sufficient for gateway workload
- Auto-restart ensures high availability
- Simpler debugging and log correlation

### Environment Variable Documentation Pattern

**.env.example structure:**

```env
# ===== SECTION NAME =====

# Variable purpose and format
# Generation command (if applicable)
# Example values or common settings
VARIABLE_NAME=default_value
```

**Example:**

```env
# ===== JWT AUTHENTICATION =====

# Secret para firmar tokens JWT
# CRITICAL: Generar uno seguro con: openssl rand -hex 32
# Debe ser el mismo secret que usa el sincronizador para validar tokens
JWT_SECRET=change-me-to-random-64-char-hex-string

# Tiempo de expiración de tokens JWT en SEGUNDOS (not milliseconds!)
# IMPORTANT: Must be a NUMBER, not a string
# Default: 86400 = 24 horas
# Valores comunes: 3600 (1h), 43200 (12h), 86400 (24h), 604800 (7d)
JWT_EXPIRES_IN=86400
```

**Benefits:**
- Self-documenting configuration
- Copy commands reduce setup errors
- Warnings prevent common mistakes (JWT_EXPIRES_IN string issue)
- Grouped by concern (easier to navigate)

## AlmaLinux vs Ubuntu/Debian Differences

| Aspect | Ubuntu/Debian | AlmaLinux (RHEL) |
|--------|---------------|------------------|
| Package manager | `apt` | `dnf` |
| Update system | `apt update && apt upgrade` | `dnf update` |
| PostgreSQL config | `/etc/postgresql/*/main/pg_hba.conf` | `/var/lib/pgsql/data/pg_hba.conf` |
| Nginx config | `sites-available/sites-enabled` | `conf.d/` |
| Firewall | `ufw` | `firewalld` |
| Firewall add service | `ufw allow 80/tcp` | `firewall-cmd --permanent --add-service=http` |
| Firewall enable | `ufw enable` | `firewall-cmd --reload` |
| Node.js repo | `deb.nodesource.com` | `rpm.nodesource.com` |
| PostgreSQL init | Auto-initialized | `postgresql-setup --initdb` |

## Deviations from Plan

None - plan executed exactly as written.

## Risks & Mitigations

| Risk | Impact | Mitigation |
|------|--------|-----------|
| deploy.sh fails mid-migration | Database in unknown state | Automated backup before migration; pg_restore to rollback |
| PM2 process crashes | Gateway downtime | Auto-restart enabled, max 10 restarts |
| Disk fills with backups | Deployment failure | 7-day retention, compressed format (-Z 9) |
| Missing environment variable | Runtime errors | Pre-deployment validation with clear error messages |
| SSH connection drops during deploy | Incomplete deployment | Use `screen` or `tmux` for long-running deploys |

## Next Phase Readiness

**Blockers:** None

**Recommendations for Phase 11 Plan 02 (Sync deployment):**
1. Reuse deploy.sh pattern for objetiva-sync deployment
2. Adjust PM2 config (sync may need cluster mode if no SSE/stateful connections)
3. Different port (sync dashboard on 3000, gateway on 3335)
4. Similar .env.example structure
5. Windows-specific deployment guide may be needed (sync runs on Windows client)

**What's ready:**
- ✅ Deployment automation pattern established
- ✅ PM2 process management template
- ✅ Environment documentation best practices
- ✅ AlmaLinux deployment knowledge

**What's needed for production:**
- [ ] Actual AlmaLinux VPS access for testing
- [ ] DNS configuration (sync-gateway.sanchezrepuestos.com.ar)
- [ ] SSL certificate setup (Let's Encrypt)
- [ ] PostgreSQL database creation
- [ ] Nginx proxy configuration
- [ ] Firewall rules configuration

## Lessons Learned

1. **SSE and cluster mode are incompatible** - Always use fork mode for stateful connections
2. **AlmaLinux != Ubuntu** - Package managers, paths, and system tools differ significantly
3. **Backup before migrate** - pg_dump automation prevents migration disasters
4. **Validate env vars upfront** - Better to fail fast before build/migration
5. **Document generation commands** - Users copy-paste, reducing setup errors

## Files Changed

### Created
- `objetiva-sync-gateway/deploy.sh` (290 lines)
- `objetiva-sync-gateway/ecosystem.config.js` (51 lines)
- `objetiva-sync-gateway/.env.example` (87 lines)
- `objetiva-sync-gateway/DEPLOYMENT.md` (13,306 bytes)

### Modified
None

## Commits

1. `d422650` - feat(11-01): add automated deployment script and PM2 configuration
   - deploy.sh: 15-step deployment automation
   - ecosystem.config.js: PM2 fork mode config

2. `93320b2` - docs(11-01): enhance .env.example and update DEPLOYMENT.md for AlmaLinux
   - .env.example: 11 documented variables
   - DEPLOYMENT.md: AlmaLinux-specific guide with automated deployment section

## Success Metrics

- ✅ Both tasks completed successfully
- ✅ All verification criteria met
- ✅ No deviations from plan
- ✅ 2 atomic commits created
- ✅ Comprehensive documentation updated
- ✅ Ready for Phase 11 Plan 02 (sync deployment)
