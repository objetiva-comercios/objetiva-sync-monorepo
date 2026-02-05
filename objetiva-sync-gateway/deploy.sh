#!/bin/bash
set -euo pipefail

#####################################################################
# Objetiva Sync Gateway - Automated Deployment Script for AlmaLinux
#####################################################################
# Purpose: Unattended, repeatable deployment with:
# - Pre-flight checks (Node.js, npm, pm2, pg_dump)
# - Environment validation
# - PostgreSQL backup before migrations
# - Prisma Client generation
# - TypeScript build
# - Database migration
# - PM2 process management
# - Health check
#####################################################################

# Change to script directory
cd "$(dirname "$0")"
SCRIPT_DIR="$(pwd)"

# Create logs directory
mkdir -p logs

# Log file with timestamp
LOG_FILE="logs/deploy-$(date +%Y%m%d-%H%M%S).log"

#####################################################################
# LOGGING
#####################################################################

log() {
  local msg="[$(date '+%Y-%m-%d %H:%M:%S')] $*"
  echo "$msg" | tee -a "$LOG_FILE"
}

#####################################################################
# ERROR HANDLING
#####################################################################

handle_error() {
  local line_number=$1
  log "ERROR: Deployment failed at line $line_number"
  log "Check log file: $LOG_FILE"
  exit 1
}

trap 'handle_error $LINENO' ERR

#####################################################################
# ENVIRONMENT VALIDATION
#####################################################################

validate_env_vars() {
  local missing_vars=()

  for var_name in "$@"; do
    if [[ -z "${!var_name:-}" ]]; then
      missing_vars+=("$var_name")
    fi
  done

  if [[ ${#missing_vars[@]} -gt 0 ]]; then
    log "ERROR: Missing required environment variables:"
    for var in "${missing_vars[@]}"; do
      log "  - $var"
    done
    log ""
    log "Please configure these variables in .env file"
    exit 1
  fi
}

#####################################################################
# PRE-FLIGHT CHECKS
#####################################################################

log "===== DEPLOYMENT START ====="
log "Script directory: $SCRIPT_DIR"
log ""

log "Step 1/15: Pre-flight checks"

# Check Node.js version
if ! command -v node &> /dev/null; then
  log "ERROR: Node.js is not installed"
  log "Install with: sudo dnf module install nodejs:20"
  exit 1
fi

NODE_VERSION=$(node -v | sed 's/v//;s/\..*//')
if [[ $NODE_VERSION -lt 20 ]]; then
  log "ERROR: Node.js version must be >= 20 (found: $(node -v))"
  log "Install with: sudo dnf module install nodejs:20"
  exit 1
fi
log "✓ Node.js $(node -v)"

# Check npm
if ! command -v npm &> /dev/null; then
  log "ERROR: npm is not installed"
  exit 1
fi
log "✓ npm $(npm -v)"

# Check PM2
if ! command -v pm2 &> /dev/null; then
  log "ERROR: PM2 is not installed"
  log "Install with: sudo npm install -g pm2"
  exit 1
fi
log "✓ PM2 $(pm2 -v)"

# Check pg_dump
if ! command -v pg_dump &> /dev/null; then
  log "ERROR: pg_dump is not installed"
  log "Install PostgreSQL client tools with: sudo dnf install postgresql"
  exit 1
fi
log "✓ pg_dump available"

log ""

#####################################################################
# LOAD AND VALIDATE ENVIRONMENT
#####################################################################

log "Step 2/15: Load and validate environment variables"

if [[ ! -f .env ]]; then
  log "ERROR: .env file not found"
  log "Create .env from .env.example and configure all variables"
  exit 1
fi

# Load environment variables
set -a
source .env
set +a

log "✓ Loaded .env file"

# Validate required variables
validate_env_vars \
  DATABASE_URL \
  JWT_SECRET \
  PORT \
  NODE_ENV \
  HOST \
  SYNC_USERNAME \
  SYNC_PASSWORD_HASH

log "✓ All required environment variables are set"
log ""

#####################################################################
# INSTALL DEPENDENCIES
#####################################################################

log "Step 3/15: Install dependencies"
npm ci --production=false
log "✓ Dependencies installed"
log ""

#####################################################################
# GENERATE PRISMA CLIENT
#####################################################################

log "Step 4/15: Generate Prisma Client"
npx prisma generate
log "✓ Prisma Client generated"
log ""

#####################################################################
# BUILD TYPESCRIPT
#####################################################################

log "Step 5/15: Build TypeScript"
npm run build

if [[ ! -d dist ]]; then
  log "ERROR: Build failed - dist/ directory not found"
  exit 1
fi

log "✓ TypeScript compiled to dist/"
log ""

#####################################################################
# DATABASE BACKUP
#####################################################################

log "Step 6/15: Backup PostgreSQL database"

# Create backups directory
mkdir -p backups

# Extract database connection details from DATABASE_URL
# Format: postgresql://user:password@host:port/database
DB_USER=$(echo "$DATABASE_URL" | sed -n 's|.*://\([^:]*\):.*|\1|p')
DB_PASSWORD=$(echo "$DATABASE_URL" | sed -n 's|.*://[^:]*:\([^@]*\)@.*|\1|p')
DB_HOST=$(echo "$DATABASE_URL" | sed -n 's|.*@\([^:]*\):.*|\1|p')
DB_PORT=$(echo "$DATABASE_URL" | sed -n 's|.*:\([0-9]*\)/.*|\1|p')
DB_NAME=$(echo "$DATABASE_URL" | sed -n 's|.*/\([^?]*\).*|\1|p')

BACKUP_FILE="backups/gateway-backup-$(date +%Y%m%d-%H%M%S).dump"

log "Creating backup: $BACKUP_FILE"

# Run pg_dump with custom format and compression
PGPASSWORD="$DB_PASSWORD" pg_dump \
  -h "$DB_HOST" \
  -p "$DB_PORT" \
  -U "$DB_USER" \
  -d "$DB_NAME" \
  -Fc \
  -Z 9 \
  -f "$BACKUP_FILE"

# Verify backup was created
if [[ ! -f "$BACKUP_FILE" ]]; then
  log "ERROR: Backup file was not created"
  exit 1
fi

BACKUP_SIZE=$(stat -f%z "$BACKUP_FILE" 2>/dev/null || stat -c%s "$BACKUP_FILE" 2>/dev/null)
if [[ $BACKUP_SIZE -eq 0 ]]; then
  log "ERROR: Backup file is empty"
  exit 1
fi

log "✓ Backup created: $BACKUP_FILE ($(numfmt --to=iec-i --suffix=B $BACKUP_SIZE 2>/dev/null || echo "$BACKUP_SIZE bytes"))"

# Clean up old backups (keep last 7 days)
log "Cleaning up backups older than 7 days..."
find backups/ -name "gateway-backup-*.dump" -mtime +7 -delete 2>/dev/null || true
log "✓ Old backups cleaned up"
log ""

#####################################################################
# RUN PRISMA MIGRATIONS
#####################################################################

log "Step 7/15: Run Prisma migrations"
npx prisma migrate deploy
log "✓ Database migrations applied"
log ""

#####################################################################
# START/RELOAD PM2
#####################################################################

log "Step 8/15: Start/reload PM2 process"

# Check if process already exists
if pm2 describe sync-gateway &> /dev/null; then
  log "Process exists, reloading..."
  pm2 reload ecosystem.config.js --env production
  log "✓ PM2 process reloaded"
else
  log "Process not found, starting..."
  pm2 start ecosystem.config.js --env production
  log "✓ PM2 process started"
fi

# Save PM2 process list
pm2 save
log "✓ PM2 process list saved"
log ""

#####################################################################
# HEALTH CHECK
#####################################################################

log "Step 9/15: Health check"
log "Waiting 3 seconds for service to start..."
sleep 3

# Check if PM2 process is online
PM2_STATUS=$(pm2 describe sync-gateway 2>/dev/null | grep -o 'status.*online' || echo "")

if [[ -z "$PM2_STATUS" ]]; then
  log "WARNING: PM2 process is not online"
  log "Check logs with: pm2 logs sync-gateway"
  exit 1
fi

log "✓ PM2 process is online"
log ""

#####################################################################
# COMPLETION
#####################################################################

log "===== DEPLOYMENT COMPLETED SUCCESSFULLY ====="
log ""
log "Gateway is running on http://$HOST:$PORT"
log ""
log "Useful commands:"
log "  pm2 status            - View process status"
log "  pm2 logs sync-gateway - View real-time logs"
log "  pm2 restart sync-gateway - Restart the process"
log "  pm2 stop sync-gateway    - Stop the process"
log ""
log "Log file: $LOG_FILE"
