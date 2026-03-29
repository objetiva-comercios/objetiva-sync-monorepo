#!/usr/bin/env node
/**
 * CLI tool for regenerating Prisma and Zod schemas from PostgreSQL
 *
 * Runs from monorepo root against a remote dockerized gateway.
 * No process-killing or DLL dependencies — the gateway runs on a separate
 * Linux server (Docker), so Windows file-locking is not a concern.
 *
 * Flow:
 * 1. Load env vars from root .env
 * 2. Check prerequisites (env vars, gateway health, PostgreSQL connection)
 * 3. chdir to gateway dir so codegen resolves paths correctly
 * 4. Call regenerateSchemas() — fetches schemas, generates content, writes files
 * 5. Run prisma generate (updates Prisma Client for local type checking)
 *
 * Usage:
 *   npm run regenerate-schemas                        # Full regeneration
 *   npm run regenerate-schemas:dry-run               # Preview changes without writing
 *   npm run regenerate-schemas -- --entity articulos # Regenerate only one entity
 */

import { config } from 'dotenv';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execSync } from 'node:child_process';
import { regenerateSchemas } from '../objetiva-sync-gateway/src/codegen/index.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Load .env from monorepo root (per D-02)
if (!process.env.SKIP_DOTENV) {
  config({ path: resolve(__dirname, '..', '.env') });
}

// Parse CLI arguments
const args = process.argv.slice(2);
const dryRun = args.includes('--dry-run');
const entityIndex = args.indexOf('--entity');
const entity = entityIndex !== -1 ? args[entityIndex + 1] : undefined;

if (entityIndex !== -1 && !entity) {
  console.error('Error: --entity flag requires a value (e.g., --entity articulos)');
  process.exit(1);
}

const REQUIRED_ENV_VARS = ['GATEWAY_URL', 'JWT_SECRET'] as const;

async function checkPrerequisites(): Promise<void> {
  console.log('Checking prerequisites...\n');

  // 1. Check required environment variables
  const missingVars: string[] = [];
  for (const varName of REQUIRED_ENV_VARS) {
    if (!process.env[varName]) {
      missingVars.push(varName);
    }
  }

  if (missingVars.length > 0) {
    for (const varName of missingVars) {
      console.error(`Error: ${varName} is not set. Add it to .env at the monorepo root.`);
    }
    process.exit(1);
  }
  console.log('  ✓ Environment variables configured');

  // 2. Check gateway is reachable
  const gatewayUrl = process.env.GATEWAY_URL!;
  try {
    const healthResponse = await fetch(`${gatewayUrl}/health`, {
      signal: AbortSignal.timeout(5000)
    });

    if (!healthResponse.ok) {
      throw new Error(`Health check returned ${healthResponse.status}`);
    }

    const health = await healthResponse.json() as { status: string; database?: string };
    console.log(`  ✓ Gateway running at ${gatewayUrl}`);

    if (health.database === 'disconnected') {
      console.error('\n❌ Gateway cannot connect to PostgreSQL database.');
      process.exit(1);
    }
    console.log('  ✓ PostgreSQL connected');
  } catch (error: any) {
    if (error.name === 'TimeoutError' || error.cause?.code === 'ECONNREFUSED') {
      console.error(`Error: Cannot reach gateway at ${gatewayUrl}. Is it running?`);
    } else {
      console.error(`Error: Cannot reach gateway at ${gatewayUrl}. Is it running?`);
    }
    process.exit(1);
  }

  console.log('');
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

  await checkPrerequisites();

  // Change CWD to gateway dir so regenerateSchemas() resolves paths correctly.
  // codegen/index.ts uses process.cwd() for prismaSchemaPath and monorepoRoot:
  //   const prismaSchemaPath = resolve(process.cwd(), 'prisma/schema.prisma');
  //   const monorepoRoot = resolve(process.cwd(), '..');
  const gatewayDir = resolve(__dirname, '..', 'objetiva-sync-gateway');
  process.chdir(gatewayDir);

  try {
    // Call regenerateSchemas() — handles fetching, generating, diffing, and writing files.
    // skipPrismaGenerate: true because we run prisma generate separately below
    // with stdio: 'inherit' for real-time output. Per D-03 and D-08.
    const result = await regenerateSchemas({
      dryRun,
      entity,
      skipPrismaGenerate: true,
    });

    if (dryRun) {
      console.log('\nDry-run complete. No files written.');
      process.exit(0);
      return;
    }

    if (!result.hasChanges) {
      console.log(`\n${'='.repeat(50)}`);
      console.log('No changes detected.');
      process.exit(0);
      return;
    }

    // Run prisma generate as final step (per D-03, D-08 — simple single call, no retry)
    console.log('\nRunning prisma generate...\n');
    execSync('npx prisma generate', { cwd: gatewayDir, stdio: 'inherit' });

    console.log(`\n${'='.repeat(50)}`);
    console.log('✅ All schemas updated');
    process.exit(0);
  } catch (error) {
    console.error(`\n❌ Error: ${error instanceof Error ? error.message : String(error)}`);
    process.exit(1);
  }
}

main();
