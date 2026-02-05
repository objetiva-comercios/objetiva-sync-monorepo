#!/usr/bin/env node
/**
 * CLI tool for regenerating Prisma and Zod schemas from PostgreSQL
 *
 * Flow:
 * 1. Fetch schema metadata from running gateway (gateway must be alive)
 * 2. Generate content in-memory, compute diffs (no file writes yet)
 * 3. Kill gateway + tsx watch (prevents DLL lock + file-change respawn)
 * 4. Write all files to disk
 * 5. Run prisma generate (DLL is now unlocked)
 *
 * Usage:
 *   npm run regenerate-schemas                    # Full regeneration
 *   npm run regenerate-schemas -- --dry-run       # Preview changes without writing
 *   npm run regenerate-schemas -- --entity articulos  # Regenerate only one entity
 */

import { config } from 'dotenv';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execSync } from 'node:child_process';
import { writeFileSync, existsSync, mkdirSync, accessSync, constants } from 'node:fs';
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

const GATEWAY_CWD = resolve(__dirname, '..');
const DLL_PATH = resolve(GATEWAY_CWD, '..', 'node_modules', '.prisma', 'client', 'query_engine-windows.dll.node');

/**
 * Stop gateway if running, return true if it was running
 */
function stopGatewayIfRunning(): boolean {
  try {
    execSync('node scripts/kill-gateway-process.mjs', {
      cwd: GATEWAY_CWD,
      encoding: 'utf-8',
      stdio: 'inherit'
    });
    // Exit code 0 means gateway was running and was stopped
    return true;
  } catch (error: any) {
    // Exit code 1 means gateway was not running
    if (error.status === 1) {
      return false;
    }
    // Other errors — log warning but don't abort
    console.warn(`  Warning: kill script exited with code ${error.status}`);
    return false;
  }
}

/**
 * Check if the Prisma DLL file is writable (not locked by another process)
 */
function isDllUnlocked(): boolean {
  if (!existsSync(DLL_PATH)) return true;
  try {
    accessSync(DLL_PATH, constants.W_OK);
    return true;
  } catch {
    return false;
  }
}

/**
 * Busy-wait sleep
 */
function sleep(ms: number): void {
  const start = Date.now();
  while (Date.now() - start < ms) { /* wait */ }
}

/**
 * Wait for DLL to be unlocked, killing any remaining gateway processes
 */
function waitForDllUnlock(maxRetries = 5, intervalMs = 2000): void {
  for (let i = 0; i < maxRetries; i++) {
    if (isDllUnlocked()) return;

    console.log(`  DLL still locked, retrying (${i + 1}/${maxRetries})...`);

    // Try to kill any remaining process on the port
    try {
      execSync('node scripts/kill-gateway-process.mjs', {
        cwd: GATEWAY_CWD,
        encoding: 'utf-8',
        stdio: 'pipe'
      });
    } catch {
      // Ignore — process may already be dead
    }

    sleep(intervalMs);
  }

  if (!isDllUnlocked()) {
    throw new Error(
      'E006: Prisma query engine DLL is locked by another process. ' +
      'Close any running gateway instances and try again.'
    );
  }
}

/**
 * Run prisma generate with retry on EPERM
 */
function runPrismaGenerate(): void {
  const maxAttempts = 3;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      execSync('npx prisma generate', {
        cwd: GATEWAY_CWD,
        stdio: 'inherit'
      });
      return; // Success
    } catch (error: any) {
      const msg = String(error.stderr || error.stdout || error.message || '');
      if (msg.includes('EPERM') && attempt < maxAttempts) {
        console.log(`\n  EPERM on attempt ${attempt}/${maxAttempts}, waiting for DLL release...`);
        waitForDllUnlock(3, 2000);
        continue;
      }
      throw error;
    }
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

  try {
    // ── Phase 1: Fetch + compute (gateway must be alive) ──
    // skipFileWrites=true → compute diffs and content in memory, don't touch disk
    // skipPrismaGenerate=true → don't run prisma generate yet
    const result = await regenerateSchemas({
      dryRun,
      entity,
      skipPrismaGenerate: true,
      skipFileWrites: true
    });

    // If dry-run, we're done (regenerateSchemas already displayed diffs)
    if (dryRun) {
      process.exit(0);
      return;
    }

    // If no changes, we're done
    if (!result.hasChanges) {
      console.log(`\n${'='.repeat(50)}`);
      console.log(`✅ All ${result.entitiesChecked} entities are up-to-date`);
      console.log('   No changes detected');
      process.exit(0);
      return;
    }

    // ── Phase 2: Kill gateway BEFORE writing any files ──
    // tsx watch monitors prisma/ and shared/schemas/ — writing files would trigger
    // an immediate gateway restart, locking the Prisma DLL before prisma generate runs
    console.log('\nStopping gateway before writing files...');
    const gatewayWasRunning = stopGatewayIfRunning();

    // Verify DLL is unlocked
    if (!isDllUnlocked()) {
      console.log('  Waiting for Prisma DLL to be released...');
      waitForDllUnlock();
    }

    // ── Phase 3: Write files (safe — no tsx watch to respawn) ──
    const pendingWrites = result.pendingWrites || [];
    console.log('\nWriting files...');

    // Create generated directory if needed
    const generatedDir = resolve(GATEWAY_CWD, 'shared/schemas/generated');
    if (!existsSync(generatedDir)) {
      mkdirSync(generatedDir, { recursive: true });
    }

    for (const { filePath, content } of pendingWrites) {
      writeFileSync(filePath, content, 'utf-8');
      console.log(`  Written: ${filePath}`);
    }

    // ── Phase 4: Run prisma generate (DLL is unlocked) ──
    console.log('\nRunning prisma generate...\n');
    runPrismaGenerate();

    console.log(`\n${'='.repeat(50)}`);
    console.log(`✅ Success! All schemas updated`);
    console.log('\n📁 Updated files:');
    console.log('   • Prisma schema (prisma/schema.prisma)');
    console.log('   • Zod schemas (shared/schemas/generated/*.ts)');
    console.log('   • Prisma client (node_modules/.prisma/client/)');

    if (gatewayWasRunning) {
      console.log('\n⚠️  Gateway was stopped for Prisma generation.');
      console.log('   Restart it with: npm run dev');
    }

    process.exit(0);
  } catch (error) {
    console.error(`\n${'='.repeat(50)}`);
    console.error(`❌ Error: ${error instanceof Error ? error.message : String(error)}`);
    process.exit(1);
  }
}

main();
