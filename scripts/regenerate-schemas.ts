#!/usr/bin/env node
/**
 * CLI tool for regenerating Prisma and Zod schemas from PostgreSQL
 *
 * Runs from monorepo root against a remote dockerized gateway.
 * No process-killing or DLL dependencies — the gateway runs on a separate
 * Linux server (Docker), so Windows file-locking is not a concern.
 *
 * Authentication is automatic after initial pairing:
 * 1. Auto-discover gateway URL from gateway's own .env (GATEWAY_PUBLIC_URL)
 * 2. Request a JWT token from gateway via POST /api/setup/token (same as dashboard)
 * 3. No manual .env configuration needed at monorepo root
 *
 * Fallback: manual GATEWAY_URL + JWT_SECRET in monorepo root .env still works.
 *
 * Usage:
 *   npm run regenerate-schemas                        # Full regeneration
 *   npm run regenerate-schemas:dry-run               # Preview changes without writing
 *   npm run regenerate-schemas -- --entity articulos # Regenerate only one entity
 */

import { config } from 'dotenv';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execSync, execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { regenerateSchemas } from '../objetiva-sync-gateway/src/codegen/index.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const monorepoRoot = resolve(__dirname, '..');
const gatewayDir = resolve(monorepoRoot, 'objetiva-sync-gateway');

// Load .env from monorepo root if it exists (legacy support)
if (!process.env.SKIP_DOTENV) {
  config({ path: resolve(monorepoRoot, '.env') });
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

/**
 * Parse GATEWAY_PUBLIC_URL from an .env file content string.
 */
function parseGatewayUrl(content: string): string | null {
  const match = content.match(/^GATEWAY_PUBLIC_URL=["']?([^"'\s\r\n]+)["']?/m);
  return match?.[1] ?? null;
}

/**
 * Auto-discover gateway URL from the gateway's configuration.
 * The setup wizard writes GATEWAY_PUBLIC_URL during initial configuration.
 *
 * Search order:
 * 1. objetiva-sync-gateway/data/.env (Docker named volume bind-mounted to host)
 * 2. objetiva-sync-gateway/.env (local dev or VPS sparse-checkout)
 * 3. Docker container data/.env (read via docker exec — production VPS)
 */
function discoverGatewayUrl(): string | null {
  // Try host filesystem first
  const envPaths = [
    resolve(gatewayDir, 'data', '.env'),
    resolve(gatewayDir, '.env'),
  ];

  for (const envPath of envPaths) {
    if (!existsSync(envPath)) continue;

    try {
      const content = readFileSync(envPath, 'utf-8');
      const url = parseGatewayUrl(content);
      if (url) return url;
    } catch {
      // Can't read file, try next
    }
  }

  // Try reading from Docker container (production: config lives in named volume)
  try {
    const content = execFileSync('docker', [
      'exec', 'sync-gateway', 'cat', '/app/objetiva-sync-gateway/data/.env'
    ], { encoding: 'utf-8', timeout: 5000 });
    const url = parseGatewayUrl(content);
    if (url) return url;
  } catch {
    // Docker not available or container not running, skip
  }

  return null;
}

/**
 * Request a JWT token from the gateway via POST /api/setup/token.
 * This is the same unauthenticated endpoint the dashboard uses.
 * It works because we're an authorized operator with access to the gateway.
 */
async function requestGatewayToken(gatewayUrl: string): Promise<string> {
  const response = await fetch(`${gatewayUrl}/api/setup/token`, {
    method: 'POST',
    signal: AbortSignal.timeout(5000),
  });

  if (!response.ok) {
    throw new Error(`Gateway returned ${response.status} for token request`);
  }

  const body = await response.json() as { success: boolean; token?: string };
  if (!body.success || !body.token) {
    throw new Error('Gateway returned invalid token response');
  }

  return body.token;
}

/**
 * Resolve GATEWAY_URL and authentication token.
 *
 * Priority:
 * 1. Auto-discover from gateway .env + request token from gateway (zero-config)
 * 2. Manual GATEWAY_URL + JWT_SECRET from monorepo root .env (legacy)
 */
async function resolveAuth(): Promise<void> {
  // If GATEWAY_URL is already set (manual .env or env var), use legacy flow
  if (process.env.GATEWAY_URL && process.env.JWT_SECRET) {
    console.log('  ✓ Using manual configuration (GATEWAY_URL + JWT_SECRET from .env)');
    return;
  }

  // Auto-discovery: find gateway URL from gateway's own config
  console.log('  Auto-discovering gateway configuration...');

  const discoveredUrl = process.env.GATEWAY_URL || discoverGatewayUrl();
  if (!discoveredUrl) {
    console.error('\nError: Could not find gateway URL.');
    console.error('Options:');
    console.error('  1. Run this from a machine with objetiva-sync-gateway/ present');
    console.error('  2. Set GATEWAY_URL in .env at monorepo root');
    process.exit(1);
  }

  // Normalize URL (strip trailing slash)
  const gatewayUrl = discoveredUrl.replace(/\/+$/, '');
  process.env.GATEWAY_URL = gatewayUrl;
  console.log(`  ✓ Gateway URL: ${gatewayUrl}`);

  // Request token from gateway (zero-config auth)
  try {
    const token = await requestGatewayToken(gatewayUrl);
    process.env.JWT_TOKEN = token;
    console.log('  ✓ Token obtained from gateway (auto-authenticated)');
  } catch (error: any) {
    if (process.env.JWT_SECRET) {
      // Fallback: can still sign locally
      console.log('  ⚠ Could not get token from gateway, using local JWT_SECRET');
      return;
    }
    console.error(`\nError: Cannot authenticate with gateway at ${gatewayUrl}`);
    console.error(`  ${error.message}`);
    console.error('\nIs the gateway running? Try: curl ' + gatewayUrl + '/health');
    process.exit(1);
  }
}

async function checkPrerequisites(): Promise<void> {
  console.log('Checking prerequisites...\n');

  // 1. Resolve gateway URL and authentication
  await resolveAuth();

  // 2. Check gateway is reachable and healthy
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
  process.chdir(gatewayDir);

  try {
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

    // Run prisma generate as final step
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
