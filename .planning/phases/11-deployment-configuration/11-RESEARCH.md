# Phase 11: Deployment Configuration - Research

**Researched:** 2026-02-04
**Domain:** Node.js production deployment, bash scripting, process management (PM2), database migrations
**Confidence:** HIGH

## Summary

Deployment configuration for Node.js TypeScript applications to production environments involves bash deployment scripts, PM2 process management, automated database migrations, and comprehensive environment variable documentation. The research focused on deployment patterns for two distinct environments: objetiva-sync-gateway (AlmaLinux VPS) and objetiva-sync (Windows with Git Bash).

The standard approach uses bash scripts that perform pre-flight checks, validate environment variables, build TypeScript projects, run database migrations with backups, and start services via PM2. PM2 ecosystem files provide documented, version-controlled process configuration with support for cluster mode, environment variables, and zero-downtime reloads. Database migrations follow tool-specific patterns: Prisma's `migrate deploy` for PostgreSQL and Drizzle's programmatic `migrate()` function for SQLite.

Key findings emphasize fail-fast validation, comprehensive logging, idempotent script design, and the critical importance of backing up databases before migrations. The research identified specific patterns for environment variable validation in bash, PM2 configuration for both Linux and Windows environments, and the necessity of complete .env.example documentation with inline comments explaining each variable's purpose.

**Primary recommendation:** Use bash scripts with `set -euo pipefail` for strict error handling, validate all required environment variables before any build/migration steps, back up databases before migrations, and use PM2 ecosystem.config.js files for documented process management configuration.

## Standard Stack

The established tools for Node.js production deployment:

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| PM2 | Latest | Process manager for Node.js apps | Industry-standard for Node.js process management, supports clustering, zero-downtime reloads, auto-restart on crashes, startup scripts |
| Bash | 4.0+ | Deployment scripting | Universal shell on Linux/macOS, available via Git Bash on Windows, standard for automation |
| pg_dump | Built-in | PostgreSQL backup utility | Official PostgreSQL backup tool, consistent exports, supports custom formats |
| Prisma | 5.22.0 | PostgreSQL ORM/migrations | Code-first migrations, automatic migration tracking, production-ready `migrate deploy` command |
| Drizzle | 0.36.4+ | SQLite ORM/migrations | Programmatic migration API, lightweight, supports both CLI and code-based migrations |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| TypeScript | 5.7+ | Type-safe compilation | All TypeScript projects - compile to JavaScript before deployment |
| dotenv | Latest | Environment variable loading | Loading .env files in Node.js applications |
| node-cron | 3.0.3 | Scheduled tasks | Backup automation, periodic maintenance tasks |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| PM2 | systemd | systemd lacks clustering, zero-downtime reload, and cross-platform support; PM2 is more Node.js-friendly |
| PM2 | Docker + orchestration | Higher complexity, overkill for simple deployments; Docker better for microservices/multi-container apps |
| Bash scripts | Node.js scripts | Bash is more universal for system operations, better for git/build/service commands |
| pg_dump | Third-party backup tools | pg_dump is built-in, consistent, widely documented, no additional dependencies |

**Installation:**
```bash
# PM2 (global installation)
npm install -g pm2

# Project dependencies are already in package.json
npm install
```

## Architecture Patterns

### Recommended Project Structure
```
deployment/
├── deploy-gateway.sh           # Gateway deployment script (AlmaLinux)
├── deploy-sync.sh              # Sync deployment script (Windows/Git Bash)
├── ecosystem.gateway.config.js # PM2 config for gateway
├── ecosystem.sync.config.js    # PM2 config for sync
└── backups/                    # Database backup directory

root/
├── .env.example                # Complete environment template
├── .env                        # Actual environment (gitignored)
└── package.json                # Build scripts
```

### Pattern 1: Deployment Script Structure
**What:** Bash deployment script with strict error handling, validation, build, migration, and service restart
**When to use:** Every production deployment for both modules
**Example:**
```bash
#!/bin/bash
# Source: Bash scripting best practices 2026
set -euo pipefail

# Logging function
log() {
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] $*"
}

# Error handler
handle_error() {
    log "ERROR: Deployment failed at line $1"
    exit 1
}

trap 'handle_error $LINENO' ERR

# Validation function
validate_env_vars() {
    local required_vars=("$@")
    for var in "${required_vars[@]}"; do
        if [ -z "${!var:-}" ]; then
            log "ERROR: Required environment variable '$var' is not set or empty"
            exit 1
        fi
    done
}

# Pre-flight checks
check_node_version() {
    local required_major=20
    local current_version=$(node -v | sed 's/v//' | cut -d'.' -f1)
    if [ "$current_version" -lt "$required_major" ]; then
        log "ERROR: Node.js version must be >= $required_major (current: $current_version)"
        exit 1
    fi
}

# Main deployment flow
log "Starting deployment..."

# 1. Pre-flight checks
check_node_version
log "✓ Node.js version check passed"

# 2. Load and validate environment
source .env
validate_env_vars DATABASE_URL JWT_SECRET PORT NODE_ENV
log "✓ Environment variables validated"

# 3. Install dependencies
npm ci --production=false
log "✓ Dependencies installed"

# 4. Build TypeScript
npm run build
log "✓ Build completed"

# 5. Database migration with backup
# (specific to database type - see migration patterns)

# 6. Start/reload with PM2
pm2 reload ecosystem.config.js --env production || pm2 start ecosystem.config.js --env production
log "✓ Service started/reloaded"

log "Deployment completed successfully"
```

### Pattern 2: PM2 Ecosystem Configuration
**What:** Declarative PM2 configuration file for process management
**When to use:** All production deployments - version-controlled configuration
**Example:**
```javascript
// Source: PM2 official docs + 2026 best practices
module.exports = {
  apps: [{
    name: 'app-name',
    script: './dist/server.js',
    instances: 'max',              // Use all CPU cores
    exec_mode: 'cluster',          // Enable clustering for performance
    env: {
      NODE_ENV: 'development',
    },
    env_production: {
      NODE_ENV: 'production',
    },
    // Production settings
    max_memory_restart: '1G',      // Restart if memory exceeds 1GB
    min_uptime: '10s',             // Minimum uptime before considering stable
    max_restarts: 10,              // Max restarts within min_uptime
    autorestart: true,             // Auto-restart on crash
    watch: false,                  // Disable file watching in production

    // Logging
    error_file: './logs/pm2-error.log',
    out_file: './logs/pm2-out.log',
    log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
    merge_logs: true,              // Combine logs from cluster instances
  }]
};
```

### Pattern 3: Prisma Migration with Backup (PostgreSQL)
**What:** Deploy Prisma migrations with automatic PostgreSQL backup before schema changes
**When to use:** Gateway deployment (PostgreSQL + Prisma)
**Example:**
```bash
# Source: Prisma official docs + pg_dump best practices
BACKUP_DIR="./backups"
TIMESTAMP=$(date +%Y%m%d-%H%M%S)
BACKUP_FILE="${BACKUP_DIR}/gateway-backup-${TIMESTAMP}.sql"

# Ensure backup directory exists
mkdir -p "$BACKUP_DIR"

# Extract database connection info from DATABASE_URL
# postgresql://user:pass@host:port/dbname
DB_NAME=$(echo "$DATABASE_URL" | sed -n 's/.*\/\([^?]*\).*/\1/p')
DB_HOST=$(echo "$DATABASE_URL" | sed -n 's/.*@\([^:]*\).*/\1/p')
DB_PORT=$(echo "$DATABASE_URL" | sed -n 's/.*:\([0-9]*\)\/\([^?]*\).*/\1/p')
DB_USER=$(echo "$DATABASE_URL" | sed -n 's/.*\/\/\([^:]*\).*/\1/p')

# Backup database with pg_dump
log "Creating database backup..."
PGPASSWORD="${DB_PASS}" pg_dump -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" \
  -Fc -Z 9 -f "$BACKUP_FILE" "$DB_NAME"

if [ ! -f "$BACKUP_FILE" ]; then
    log "ERROR: Backup failed - file not created"
    exit 1
fi

BACKUP_SIZE=$(stat -f%z "$BACKUP_FILE" 2>/dev/null || stat -c%s "$BACKUP_FILE" 2>/dev/null)
log "✓ Backup created: $BACKUP_FILE ($(numfmt --to=iec $BACKUP_SIZE))"

# Run Prisma migrations
log "Running Prisma migrations..."
npx prisma migrate deploy
log "✓ Migrations applied"

# Clean up old backups (keep last 7 days)
find "$BACKUP_DIR" -name "gateway-backup-*.sql" -mtime +7 -delete
log "✓ Old backups cleaned up"
```

### Pattern 4: Drizzle Migration (SQLite)
**What:** Programmatic Drizzle migrations for SQLite during deployment
**When to use:** Sync deployment (SQLite + Drizzle)
**Example:**
```bash
# Source: Drizzle ORM migration docs
# Option 1: Using drizzle-kit CLI
log "Running Drizzle migrations..."
npx drizzle-kit migrate

# Option 2: Programmatic migration (create migrate.ts)
# Then run: tsx migrate.ts
log "Running Drizzle migrations..."
node dist/migrate.js  # If compiled, or tsx src/migrate.ts
log "✓ Migrations applied"
```

Corresponding `migrate.ts`:
```typescript
// Source: Drizzle ORM programmatic migrations
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { migrate } from 'drizzle-orm/better-sqlite3/migrator';
import Database from 'better-sqlite3';

const sqlite = new Database(process.env.DATABASE_PATH || './database/sync.db');
const db = drizzle(sqlite);

async function runMigrations() {
  console.log('Running migrations...');
  await migrate(db, { migrationsFolder: './drizzle' });
  console.log('Migrations completed');
  sqlite.close();
}

runMigrations().catch(err => {
  console.error('Migration failed:', err);
  process.exit(1);
});
```

### Pattern 5: Environment Variable Validation
**What:** Reusable function to validate required environment variables before deployment
**When to use:** All deployment scripts before any build/migration steps
**Example:**
```bash
# Source: Bash env validation best practices 2026
validate_env_vars() {
    local required_vars=("$@")
    local missing_vars=()

    for var in "${required_vars[@]}"; do
        # Check if variable exists and is non-empty
        if [ -z "${!var:-}" ]; then
            missing_vars+=("$var")
        fi
    done

    if [ ${#missing_vars[@]} -gt 0 ]; then
        log "ERROR: The following required environment variables are not set or empty:"
        for var in "${missing_vars[@]}"; do
            log "  - $var"
        done
        log "Please configure .env file with all required variables"
        exit 1
    fi
}

# Usage for gateway
source .env
validate_env_vars DATABASE_URL JWT_SECRET PORT NODE_ENV SYNC_USERNAME SYNC_PASSWORD_HASH

# Usage for sync
source .env
validate_env_vars PORT NODE_ENV DATABASE_PATH ENCRYPTION_KEY SESSION_SECRET
```

### Pattern 6: .env.example Documentation
**What:** Complete environment variable template with inline comments and examples
**When to use:** Both modules - comprehensive documentation for deployment setup
**Example:**
```bash
# Source: .env.example best practices 2026

# =============================================================================
# SERVER CONFIGURATION (Required)
# =============================================================================

# Port number for the application server
# Default: 3000 (sync) or 3335 (gateway)
PORT=3000

# Node environment (development, production, test)
# REQUIRED in production
NODE_ENV=production

# Application name (displayed in dashboard)
APP_NAME=Objetiva Sync

# =============================================================================
# DATABASE CONFIGURATION (Required)
# =============================================================================

# PostgreSQL connection string (gateway only)
# Format: postgresql://user:password@host:port/database
# Example: postgresql://sync_user:securepass@localhost:5432/sync_gateway_db
DATABASE_URL=

# SQLite database path (sync only)
# Relative or absolute path to SQLite database file
# Default: ./database/objetiva-sync.db
DATABASE_PATH=./database/objetiva-sync.db

# =============================================================================
# SECURITY (Required)
# =============================================================================

# JWT secret for authentication tokens (gateway)
# MUST be strong random string (64+ characters recommended)
# Generate with: openssl rand -hex 32
JWT_SECRET=

# JWT token expiration time in seconds (gateway)
# Default: 86400 (24 hours)
JWT_EXPIRES_IN=86400

# Encryption key for sensitive data (sync)
# Auto-generated on first run if not provided
# Generate with: openssl rand -hex 32
ENCRYPTION_KEY=

# Session secret for dashboard authentication (sync)
# Auto-generated on first run if not provided
# Generate with: openssl rand -hex 32
SESSION_SECRET=

# =============================================================================
# AUTHENTICATION (Required for gateway)
# =============================================================================

# Sync client username (gateway)
# Fixed credentials for authenticating sync clients
SYNC_USERNAME=admin

# Sync client password hash (gateway)
# Generate with bcrypt (cost factor 10)
# Example generation: node -e "console.log(require('bcryptjs').hashSync('yourpassword', 10))"
SYNC_PASSWORD_HASH=

# =============================================================================
# LOGGING (Optional - has defaults)
# =============================================================================

# Log level (error, warn, info, debug, trace)
# Default: info
LOG_LEVEL=info

# Log file path (sync only)
# Default: ./logs/sync.log
LOG_FILE=./logs/sync.log

# =============================================================================
# SYNC CONFIGURATION (Optional - configured via dashboard)
# =============================================================================

# Remote API URL (sync - can be preset or configured via dashboard)
# REMOTE_API_URL=https://api.yourgateway.com

# Remote API authentication (sync - can be preset or configured via dashboard)
# REMOTE_API_USERNAME=
# REMOTE_API_PASSWORD=

# Sync interval in minutes (sync - can be preset or configured via dashboard)
# Default: 30
# SYNC_INTERVAL_MINUTES=30

# Batch size for sync operations (sync - can be preset or configured via dashboard)
# Default: 100
# BATCH_SIZE=100

# =============================================================================
# ADMIN ACCESS (Optional - only used on first run)
# =============================================================================

# Initial admin password for dashboard (sync only)
# Only used on first run to create admin user, then can be removed
# MUST be changed after first login
ADMIN_PASSWORD=changeme123
```

### Anti-Patterns to Avoid
- **Manual deployment steps not in script:** Every deployment action must be scripted and automated - no "oh, I forgot to run X" situations
- **Deploying without backups:** Never apply database migrations without backing up first
- **Committing .env files:** Only .env.example should be in git, never actual .env with secrets
- **Using `npm install` in production:** Use `npm ci` for reproducible builds based on package-lock.json
- **Deploying TypeScript source:** Always compile to JavaScript and deploy dist/ output
- **Skipping environment validation:** Validate all required env vars exist BEFORE any build/migration steps
- **Running `prisma migrate dev` in production:** Use `prisma migrate deploy` (never `migrate dev`)
- **Using PM2 without ecosystem file:** Always use ecosystem.config.js for documented, version-controlled configuration
- **Silent failures in bash:** Always use `set -euo pipefail` to fail fast and loud

## Don't Hand-Roll

Problems that look simple but have existing solutions:

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Process management | Custom forever/restart scripts | PM2 with ecosystem file | PM2 handles clustering, auto-restart, zero-downtime reload, log management, startup scripts - building this from scratch is complex and error-prone |
| Database backups | Manual pg_dump commands | pg_dump with timestamped files + cleanup | pg_dump is the official PostgreSQL backup tool, supports custom format with compression, handles concurrent access correctly |
| Environment validation | Ad-hoc if statements for each var | Reusable validation function | Single function validates all required vars, provides clear error messages, reduces duplication |
| Migration execution | Manual SQL execution | Prisma `migrate deploy` / Drizzle `migrate()` | These tools track applied migrations, prevent duplicate execution, handle transaction rollback on failure |
| Error handling in bash | Manual exit codes after each command | `set -euo pipefail` + trap handlers | This pattern catches ALL errors automatically, prevents silent failures, provides line numbers for debugging |
| Deployment orchestration | Node.js deployment script | Bash deployment script | Bash is universal for system operations (git, building, service management), better integration with shell commands |

**Key insight:** Deployment scripts deal with file systems, processes, and system services. These operations are bash's native domain. Using bash with modern error handling patterns (set -euo pipefail, trap, validation functions) is more reliable than trying to orchestrate system commands from Node.js.

## Common Pitfalls

### Pitfall 1: Missing Environment Variables Discovered Late
**What goes wrong:** Deployment script builds successfully, runs migrations, starts PM2, but service crashes because required env var is missing
**Why it happens:** Environment validation happens too late or not at all
**How to avoid:** Validate ALL required environment variables as the FIRST step in deployment script, before any build or migration operations
**Warning signs:** PM2 shows service constantly restarting, logs show "undefined" or "cannot read property" errors

### Pitfall 2: Database Migration Failure Without Backup
**What goes wrong:** Migration fails halfway through, database schema is corrupted, no way to recover
**Why it happens:** Migrations run without backup, script doesn't fail fast on backup errors
**How to avoid:** Always backup database before migrations, verify backup file was created successfully with size check, fail deployment if backup fails
**Warning signs:** pg_dump command in script but no verification, or no backup step at all

### Pitfall 3: PM2 Commands Fail Silently on Windows
**What goes wrong:** PM2 commands in deployment script fail with "spawn sh ENOENT" on Windows/Git Bash
**Why it happens:** PM2 requires Unix shell commands, Windows CMD/PowerShell not compatible
**How to avoid:** Ensure deployment script is run in Git Bash (not CMD/PowerShell), verify `sh` is in system PATH, use PM2 ecosystem file instead of command-line flags
**Warning signs:** Script runs but PM2 process doesn't start, "sh not found" errors in logs

### Pitfall 4: TypeScript Source Deployed Instead of Compiled Output
**What goes wrong:** Deployment includes src/ folder, production tries to run .ts files, crashes because TypeScript not installed in production dependencies
**Why it happens:** Deployment script copies entire project instead of just dist/ and necessary files
**How to avoid:** Build TypeScript with `npm run build`, ensure dist/ exists before PM2 start, use .dockerignore/.npmignore patterns if packaging
**Warning signs:** Production server has TypeScript in dependencies, errors about .ts file extensions

### Pitfall 5: Zero-Downtime Reload Not Working
**What goes wrong:** Using `pm2 restart` instead of `pm2 reload` causes downtime during deployment
**Why it happens:** Not understanding difference between restart (kills all instances) vs reload (graceful reload in cluster mode)
**How to avoid:** Use `pm2 reload ecosystem.config.js` for deployments, ensure cluster mode enabled in ecosystem config, use `pm2 start` only for first deployment
**Warning signs:** Brief service interruption during every deployment, dropped connections

### Pitfall 6: Incomplete .env.example Documentation
**What goes wrong:** Fresh deployment fails because required env var not documented in .env.example, deployer doesn't know what to set
**Why it happens:** .env.example not kept in sync with code changes, no inline comments explaining variables
**How to avoid:** Every new env var added to code must be added to .env.example with comment, review .env.example before phase completion
**Warning signs:** Support questions asking "what should I set for X?", deployment failures on fresh setups

### Pitfall 7: Prisma Generate Not Run Before Start
**What goes wrong:** PM2 starts service, Prisma Client not generated, crashes with "Cannot find module '@prisma/client'"
**Why it happens:** Deployment script runs `npm run build` but not `prisma generate`
**How to avoid:** Run `npx prisma generate` after `npm ci` and before `npm run build`, or add `postinstall` script in package.json
**Warning signs:** Works locally (where Prisma Client was generated during dev) but fails on fresh deployment

### Pitfall 8: Bash Script Works on Linux but Fails on Git Bash (Windows)
**What goes wrong:** Script uses Linux-specific commands or paths, fails on Windows environment
**Why it happens:** Commands like `stat -f%z` (BSD/macOS) vs `stat -c%s` (Linux), path separators, sed syntax differences
**How to avoid:** Use portable commands, provide fallbacks (e.g., `stat -f%z "$file" 2>/dev/null || stat -c%s "$file"`), test script on both environments
**Warning signs:** Script works perfectly on AlmaLinux gateway but fails on Windows sync deployment

## Code Examples

Verified patterns from official sources:

### PM2 Startup Configuration
```bash
# Source: PM2 official docs - https://pm2.keymetrics.io/docs/usage/startup/

# Generate startup script (run as user that will run PM2)
pm2 startup

# This outputs a command to run as sudo, example:
# sudo env PATH=$PATH:/usr/bin pm2 startup systemd -u syncgateway --hp /home/syncgateway

# Run the generated command
sudo env PATH=$PATH:/usr/bin pm2 startup systemd -u syncgateway --hp /home/syncgateway

# Start your app with PM2
pm2 start ecosystem.config.js --env production

# Save current PM2 process list
pm2 save

# Now PM2 will auto-start your app on server reboot
```

### Complete Gateway Deployment Script
```bash
#!/bin/bash
# Deployment script for objetiva-sync-gateway (AlmaLinux)
# Source: Compiled from research best practices

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

# Configuration
BACKUP_DIR="./backups"
LOG_FILE="./logs/deploy-$(date +%Y%m%d-%H%M%S).log"

# Ensure log directory exists
mkdir -p "$(dirname "$LOG_FILE")"

# Logging function
log() {
    local msg="[$(date '+%Y-%m-%d %H:%M:%S')] $*"
    echo "$msg" | tee -a "$LOG_FILE"
}

# Error handler
handle_error() {
    log "ERROR: Deployment failed at line $1"
    exit 1
}

trap 'handle_error $LINENO' ERR

# Validation function
validate_env_vars() {
    local required_vars=("$@")
    local missing_vars=()

    for var in "${required_vars[@]}"; do
        if [ -z "${!var:-}" ]; then
            missing_vars+=("$var")
        fi
    done

    if [ ${#missing_vars[@]} -gt 0 ]; then
        log "ERROR: Missing required environment variables:"
        for var in "${missing_vars[@]}"; do
            log "  - $var"
        done
        exit 1
    fi
}

# Pre-flight checks
check_node_version() {
    local required_major=20
    local current_version=$(node -v | sed 's/v//' | cut -d'.' -f1)
    if [ "$current_version" -lt "$required_major" ]; then
        log "ERROR: Node.js version must be >= $required_major (current: $current_version)"
        exit 1
    fi
    log "✓ Node.js version: $(node -v)"
}

check_dependencies() {
    command -v npm >/dev/null 2>&1 || { log "ERROR: npm not found"; exit 1; }
    command -v pm2 >/dev/null 2>&1 || { log "ERROR: pm2 not found (install with: npm install -g pm2)"; exit 1; }
    command -v pg_dump >/dev/null 2>&1 || { log "ERROR: pg_dump not found (PostgreSQL client tools required)"; exit 1; }
    log "✓ Dependencies available"
}

# Main deployment
log "=== Gateway Deployment Started ==="

# 1. Pre-flight checks
log "Step 1: Pre-flight checks"
check_node_version
check_dependencies

# 2. Load and validate environment
log "Step 2: Environment validation"
if [ ! -f .env ]; then
    log "ERROR: .env file not found"
    exit 1
fi
source .env
validate_env_vars DATABASE_URL JWT_SECRET PORT NODE_ENV SYNC_USERNAME SYNC_PASSWORD_HASH
log "✓ Environment variables validated"

# 3. Install dependencies
log "Step 3: Installing dependencies"
npm ci --production=false
log "✓ Dependencies installed"

# 4. Generate Prisma Client
log "Step 4: Generating Prisma Client"
npx prisma generate
log "✓ Prisma Client generated"

# 5. Build TypeScript
log "Step 5: Building application"
npm run build
if [ ! -d dist ]; then
    log "ERROR: Build failed - dist/ directory not found"
    exit 1
fi
log "✓ Build completed"

# 6. Database backup
log "Step 6: Creating database backup"
mkdir -p "$BACKUP_DIR"
TIMESTAMP=$(date +%Y%m%d-%H%M%S)
BACKUP_FILE="${BACKUP_DIR}/gateway-backup-${TIMESTAMP}.sql"

# Extract DB info from DATABASE_URL
DB_NAME=$(echo "$DATABASE_URL" | sed -n 's/.*\/\([^?]*\).*/\1/p')
DB_HOST=$(echo "$DATABASE_URL" | sed -n 's/.*@\([^:]*\).*/\1/p')
DB_PORT=$(echo "$DATABASE_URL" | sed -n 's/.*:\([0-9]*\)\/\([^?]*\).*/\1/p')
DB_USER=$(echo "$DATABASE_URL" | sed -n 's/.*\/\/\([^:]*\).*/\1/p')
DB_PASS=$(echo "$DATABASE_URL" | sed -n 's/.*:\/\/[^:]*:\([^@]*\)@.*/\1/p')

PGPASSWORD="${DB_PASS}" pg_dump -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" \
    -Fc -Z 9 -f "$BACKUP_FILE" "$DB_NAME"

if [ ! -f "$BACKUP_FILE" ]; then
    log "ERROR: Backup failed - file not created"
    exit 1
fi

BACKUP_SIZE=$(stat -c%s "$BACKUP_FILE" 2>/dev/null || stat -f%z "$BACKUP_FILE" 2>/dev/null)
log "✓ Backup created: $BACKUP_FILE (${BACKUP_SIZE} bytes)"

# 7. Run migrations
log "Step 7: Running database migrations"
npx prisma migrate deploy
log "✓ Migrations applied"

# 8. Start/reload with PM2
log "Step 8: Starting/reloading service"
if pm2 describe sync-gateway >/dev/null 2>&1; then
    pm2 reload ecosystem.config.js --env production
    log "✓ Service reloaded"
else
    pm2 start ecosystem.config.js --env production
    log "✓ Service started"
fi

# 9. Verify service is running
sleep 2
if pm2 describe sync-gateway | grep -q "online"; then
    log "✓ Service is online"
else
    log "WARNING: Service may not be running correctly"
    pm2 logs sync-gateway --lines 20
fi

# 10. Cleanup old backups (keep last 7 days)
find "$BACKUP_DIR" -name "gateway-backup-*.sql" -mtime +7 -delete 2>/dev/null || true
log "✓ Old backups cleaned up"

log "=== Gateway Deployment Completed Successfully ==="
log "View logs: pm2 logs sync-gateway"
log "Check status: pm2 status"
```

### Complete Sync Deployment Script (Windows/Git Bash)
```bash
#!/bin/bash
# Deployment script for objetiva-sync (Windows with Git Bash)
# Source: Compiled from research best practices

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

LOG_FILE="./logs/deploy-$(date +%Y%m%d-%H%M%S).log"

mkdir -p "$(dirname "$LOG_FILE")"

log() {
    local msg="[$(date '+%Y-%m-%d %H:%M:%S')] $*"
    echo "$msg" | tee -a "$LOG_FILE"
}

handle_error() {
    log "ERROR: Deployment failed at line $1"
    exit 1
}

trap 'handle_error $LINENO' ERR

validate_env_vars() {
    local required_vars=("$@")
    local missing_vars=()

    for var in "${required_vars[@]}"; do
        if [ -z "${!var:-}" ]; then
            missing_vars+=("$var")
        fi
    done

    if [ ${#missing_vars[@]} -gt 0 ]; then
        log "ERROR: Missing required environment variables:"
        for var in "${missing_vars[@]}"; do
            log "  - $var"
        done
        exit 1
    fi
}

check_node_version() {
    local required_major=20
    local current_version=$(node -v | sed 's/v//' | cut -d'.' -f1)
    if [ "$current_version" -lt "$required_major" ]; then
        log "ERROR: Node.js version must be >= $required_major (current: $current_version)"
        exit 1
    fi
    log "✓ Node.js version: $(node -v)"
}

check_dependencies() {
    command -v npm >/dev/null 2>&1 || { log "ERROR: npm not found"; exit 1; }
    command -v pm2 >/dev/null 2>&1 || { log "ERROR: pm2 not found (install with: npm install -g pm2)"; exit 1; }
    log "✓ Dependencies available"
}

log "=== Sync Deployment Started ==="

# 1. Pre-flight checks
log "Step 1: Pre-flight checks"
check_node_version
check_dependencies

# 2. Load and validate environment
log "Step 2: Environment validation"
if [ ! -f .env ]; then
    log "ERROR: .env file not found"
    exit 1
fi
source .env
validate_env_vars PORT NODE_ENV DATABASE_PATH
log "✓ Environment variables validated"

# 3. Install dependencies
log "Step 3: Installing dependencies"
npm ci --production=false
log "✓ Dependencies installed"

# 4. Build TypeScript
log "Step 4: Building application"
npm run build
if [ ! -d dist ]; then
    log "ERROR: Build failed - dist/ directory not found"
    exit 1
fi
log "✓ Build completed"

# 5. Run Drizzle migrations
log "Step 5: Running database migrations"
# Ensure database directory exists
mkdir -p "$(dirname "$DATABASE_PATH")"
# Run migrations via drizzle-kit
npx drizzle-kit migrate
log "✓ Migrations applied"

# 6. Start/reload with PM2
log "Step 6: Starting/reloading service"
if pm2 describe objetiva-sync >/dev/null 2>&1; then
    pm2 reload ecosystem.config.js --env production
    log "✓ Service reloaded"
else
    pm2 start ecosystem.config.js --env production
    log "✓ Service started"
fi

# 7. Verify service is running
sleep 2
if pm2 describe objetiva-sync | grep -q "online"; then
    log "✓ Service is online"
else
    log "WARNING: Service may not be running correctly"
    pm2 logs objetiva-sync --lines 20
fi

log "=== Sync Deployment Completed Successfully ==="
log "View logs: pm2 logs objetiva-sync"
log "Check status: pm2 status"
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Manual deployment steps | Fully automated bash scripts | 2020-2024 | Eliminates human error, enables CI/CD, reproducible deployments |
| forever/nodemon in production | PM2 with ecosystem files | 2018-2022 | Better process management, clustering, zero-downtime deploys |
| Command-line PM2 flags | PM2 ecosystem.config.js | 2020+ | Version-controlled config, documented settings, multi-env support |
| `npm install` in production | `npm ci` in production | 2018+ | Reproducible builds, faster installs, lockfile enforcement |
| Manual error checking in bash | `set -euo pipefail` + trap | 2020+ | Automatic error detection, fail-fast, better debugging |
| .env files with no documentation | .env.example with inline comments | 2022+ | Self-documenting, easier onboarding, fewer deployment errors |
| `prisma migrate dev` in production | `prisma migrate deploy` | 2021+ (Prisma Migrate GA) | Production-safe migrations, no schema drift prompts |
| Running .ts files in production | Compile to .js with tsc/tsup | Always best practice | Faster startup, smaller deployments, no runtime TypeScript dependencies |

**Deprecated/outdated:**
- **forever, nodemon for production:** Replaced by PM2 - these tools lack clustering, zero-downtime reload, and production-grade monitoring
- **Global PM2 settings via CLI:** Use ecosystem files instead for version-controlled, documented configuration
- **pm2 deploy system:** Many teams moved to dedicated CI/CD pipelines (GitHub Actions, GitLab CI) that call deployment scripts
- **Running migrations manually:** Always automate migrations in deployment scripts with backup step

## Open Questions

1. **Backup retention policy for sync module (SQLite)**
   - What we know: Gateway uses pg_dump with 7-day retention
   - What's unclear: SQLite backup strategy for sync module (copy database file? How often? Retention period?)
   - Recommendation: Implement timestamped SQLite file copies before migrations, same 7-day retention as gateway

2. **PM2 log rotation configuration**
   - What we know: PM2 has built-in log rotation capabilities
   - What's unclear: Should we configure max log size, rotation frequency?
   - Recommendation: Configure in ecosystem.config.js with max_size (e.g., 10M) and retain (e.g., 7 days), or use pm2-logrotate module

3. **Health check integration in deployment**
   - What we know: Both modules have health endpoints
   - What's unclear: Should deployment script verify health endpoint before considering deployment successful?
   - Recommendation: Add health check verification as final deployment step (curl health endpoint, check status code)

4. **Rollback strategy**
   - What we know: PM2 doesn't have built-in rollback, database migrations are forward-only
   - What's unclear: What's the process if deployment succeeds but service is broken?
   - Recommendation: Document manual rollback process (restore DB backup, git checkout previous version, redeploy), consider keeping previous dist/ as dist.backup/

## Sources

### Primary (HIGH confidence)
- [PM2 Official Documentation - Deployment](https://pm2.keymetrics.io/docs/usage/deployment/) - PM2 deployment system
- [PM2 Official Documentation - Ecosystem File](https://pm2.keymetrics.io/docs/usage/application-declaration/) - Ecosystem configuration
- [Prisma Official Documentation - Deploy Database Changes](https://www.prisma.io/docs/orm/prisma-client/deployment/deploy-database-changes-with-prisma-migrate) - Prisma migrate deploy
- [Drizzle ORM Documentation - Migrate](https://orm.drizzle.team/docs/drizzle-kit-migrate) - Drizzle migrations
- [Drizzle ORM Documentation - Migrations](https://orm.drizzle.team/docs/migrations) - Drizzle migration patterns
- [PostgreSQL Official Documentation - pg_dump](https://www.postgresql.org/docs/current/app-pgdump.html) - pg_dump backup tool

### Secondary (MEDIUM confidence)
- [Better Stack Community - PM2 Guide (2026)](https://betterstack.com/community/guides/scaling-nodejs/pm2-guide/) - Verified PM2 best practices
- [PM2 Ecosystem Setup Guide for Node.js/NestJS (Jan 2026)](https://medium.com/@zulfikarditya/pm2-ecosystem-setup-guide-for-node-js-nestjs-45b0eee8629a) - Recent ecosystem patterns
- [CubePath - Node.js Application Deployment with PM2 (Jan 2026)](https://cubepath.com/docs/application-deployment/node-js-application-deployment-with-pm2) - Comprehensive production guide
- [OneUptime Blog - PostgreSQL pg_dump Backup (Jan 2026)](https://oneuptime.com/blog/post/2026-01-21-postgresql-pg-dump-backup/view) - pg_dump script examples
- [Medium - Best Practices for Environment Variable Files in SDLC](https://blog.stackademic.com/best-practices-with-environment-variable-files-env-in-sdlc-25806194d438) - .env.example patterns
- [LinuxSimply - Check If Environment Variable Exists in Bash](https://linuxsimply.com/bash-scripting-tutorial/conditional-statements/if/environment-variable-exists/) - Bash validation patterns
- [Medium - Best Practices in Bash Scripting 2025](https://medium.com/@prasanna.a1.usage/best-practices-we-need-to-follow-in-bash-scripting-in-2025-cebcdf254768) - Modern bash practices
- [MoldStud - Error Handling in Bash Scripts](https://moldstud.com/articles/p-best-practices-and-techniques-for-error-handling-in-bash-scripts) - Error handling patterns

### Tertiary (LOW confidence)
- [GitHub Unitech/pm2 Issue #3579](https://github.com/Unitech/pm2/issues/3579) - PM2 Windows compatibility discussions
- [Drizzle Team Discussion - Production Migrations](https://www.answeroverflow.com/m/1350232374750871772) - Community migration patterns
- [GitHub Gist - Node Version Check Script](https://gist.github.com/jamesmcintyre/fe9a74a603d36ffd534a1c69171994d9) - Pre-flight check examples

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH - Official documentation for PM2, Prisma, Drizzle, pg_dump verified
- Architecture: HIGH - Patterns compiled from official docs and verified 2026 sources
- Pitfalls: HIGH - Based on common issues documented in official discussions and recent guides

**Research date:** 2026-02-04
**Valid until:** 2026-03-04 (30 days for stable deployment tooling)
