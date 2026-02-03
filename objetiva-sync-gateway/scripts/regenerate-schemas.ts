#!/usr/bin/env node
/**
 * CLI tool for regenerating Prisma and Zod schemas from PostgreSQL
 *
 * Automatically:
 * - Stops gateway if running (to avoid file locks)
 * - Regenerates all schemas
 * - Runs prisma generate
 * - Restarts gateway in background
 *
 * Usage:
 *   npm run regenerate-schemas                    # Full regeneration (automatic gateway restart)
 *   npm run regenerate-schemas -- --dry-run       # Preview changes without writing
 *   npm run regenerate-schemas -- --entity articulos  # Regenerate only one entity
 */

import { config } from 'dotenv';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execSync } from 'node:child_process';
import { regenerateSchemas } from '../src/codegen/index.js';

// Get current directory from import.meta.url
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Load .env from gateway root directory (unless SKIP_DOTENV is set for testing)
if (!process.env.SKIP_DOTENV) {
  config({ path: resolve(__dirname, '..', '.env') });
}

// Parse CLI arguments
const args = process.argv.slice(2);
const dryRun = args.includes('--dry-run');
const entityIndex = args.indexOf('--entity');
const entity = entityIndex !== -1 ? args[entityIndex + 1] : undefined;

// Validate --entity has a value
if (entityIndex !== -1 && !entity) {
  console.error('Error: --entity flag requires a value (e.g., --entity articulos)');
  process.exit(1);
}

/**
 * Stop gateway if running, return true if it was running
 */
function stopGatewayIfRunning(): boolean {
  try {
    const result = execSync('node scripts/kill-gateway-process.mjs', {
      cwd: resolve(__dirname, '..'),
      encoding: 'utf-8',
      stdio: ['pipe', 'pipe', 'pipe']
    });

    // Check exit code via try/catch - if it returns 0, gateway was running
    return true;
  } catch (error: any) {
    // Exit code 1 means gateway was not running
    if (error.status === 1) {
      return false;
    }
    // Other errors should be thrown
    throw error;
  }
}

async function main() {
  console.log('🔄 Schema Regeneration');
  console.log('='.repeat(50) + '\n');

  if (dryRun) {
    console.log('Mode: DRY RUN (preview only)\n');
  }

  if (entity) {
    console.log(`Filter: ${entity} only\n`);
  }

  let gatewayWasRunning = false;

  try {
    // First pass: fetch schemas and compute changes (gateway must be running)
    // This uses skipPrismaGenerate=true to avoid file lock
    const firstPassResult = await regenerateSchemas({
      dryRun,
      entity,
      skipPrismaGenerate: true  // Don't run prisma generate yet
    });

    // If dry-run or no changes, we're done
    if (dryRun || !firstPassResult.hasChanges) {
      if (!firstPassResult.hasChanges) {
        console.log(`\n${'='.repeat(50)}`);
        console.log(`✅ All ${firstPassResult.entitiesChecked} entities are up-to-date`);
        console.log('   No changes detected');
      }
      process.exit(0);
      return;
    }

    // Changes detected - need to run prisma generate
    // Stop gateway if running
    console.log('\nPreparing to generate Prisma client...');
    gatewayWasRunning = stopGatewayIfRunning();

    // Run prisma generate
    console.log('Running prisma generate...\n');
    execSync('npx prisma generate', {
      cwd: resolve(__dirname, '..'),
      stdio: 'inherit'
    });

    console.log(`\n${'='.repeat(50)}`);
    console.log(`✅ Success! All schemas updated`);
    console.log('\n📁 Updated files:');
    console.log('   • Prisma schema (prisma/schema.prisma)');
    console.log('   • Zod schemas (shared/schemas/generated/*.ts)');
    console.log('   • Prisma client (node_modules/.prisma/client/)');

    // tsx watch will auto-restart the gateway when it detects schema.prisma changes
    if (gatewayWasRunning) {
      console.log('\n💡 Gateway will auto-restart (tsx watch mode)');
      console.log('   Wait a few seconds for it to reload...');
    }

    process.exit(0);
  } catch (error) {
    console.error(`\n${'='.repeat(50)}`);
    console.error(`❌ Error: ${error instanceof Error ? error.message : String(error)}`);
    process.exit(1);
  }
}

main();
