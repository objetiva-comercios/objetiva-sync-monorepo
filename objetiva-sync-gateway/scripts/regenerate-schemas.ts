#!/usr/bin/env node
/**
 * CLI tool for regenerating Prisma and Zod schemas from PostgreSQL
 *
 * Usage:
 *   npm run regenerate-schemas
 *   npm run regenerate-schemas -- --dry-run
 *   npm run regenerate-schemas -- --entity articulos
 *   npm run regenerate-schemas -- --dry-run --entity articulos
 */

import { config } from 'dotenv';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { regenerateSchemas } from '../src/codegen/index.js';

// Get current directory from import.meta.url
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Load .env from gateway root directory
config({ path: resolve(__dirname, '..', '.env') });

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

async function main() {
  console.log('Schema Regeneration Tool');
  console.log('========================\n');

  if (dryRun) {
    console.log('Mode: DRY RUN (no files will be modified)\n');
  }

  if (entity) {
    console.log(`Entity filter: ${entity}\n`);
  }

  try {
    const result = await regenerateSchemas({ dryRun, entity });

    if (result.hasChanges) {
      console.log(`\nRegeneration complete. ${result.filesWritten} file(s) updated.`);
    } else {
      console.log(`\nValidated ${result.entitiesChecked} entities, no changes needed.`);
    }

    process.exit(0);
  } catch (error) {
    console.error(`\n${error instanceof Error ? error.message : String(error)}`);
    process.exit(1);
  }
}

main();
