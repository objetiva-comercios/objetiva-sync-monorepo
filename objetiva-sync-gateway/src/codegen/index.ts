/**
 * Main orchestrator for schema regeneration
 *
 * Coordinates the full pipeline:
 * 1. Authenticate with gateway
 * 2. Fetch schema metadata from /api/schemas/:entity
 * 3. Generate Prisma and Zod schemas
 * 4. Compute and display diffs
 * 5. Write files (unless --dry-run)
 * 6. Run prisma generate
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { execSync } from 'node:child_process';
import chalk from 'chalk';
import { createSigner } from 'fast-jwt';
import type { RegenerateOptions, RegenerateResult, SchemaResponse, DiffResult } from './types.js';
import { generatePrismaSchema } from './prisma-generator.js';
import { generateZodSchema } from './zod-generator.js';
import { computeDiff, displayDiff, displaySummary } from './diff-display.js';
import { getSyncEntities } from '../config/entities.js';

/**
 * Sign a JWT locally using JWT_SECRET (no /auth/login call needed).
 */
function signLocalToken(): string {
  const jwtSecret = process.env.JWT_SECRET;
  if (!jwtSecret) {
    throw new Error('E002: JWT_SECRET environment variable not set. Required for authentication.');
  }

  const signer = createSigner({ key: jwtSecret, expiresIn: 60000 }); // 60s is plenty for codegen
  return signer({ source: 'codegen', authenticated: true });
}

/**
 * Fetch schema metadata for a single entity
 */
async function fetchSchema(
  gatewayUrl: string,
  token: string,
  entity: string
): Promise<SchemaResponse> {
  console.log(chalk.cyan(`Fetching schema for ${entity}...`));

  const response = await fetch(`${gatewayUrl}/api/schemas/${entity}?force=true`, {
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });

  if (!response.ok) {
    throw new Error(`Failed to fetch schema for ${entity}: ${response.statusText}`);
  }

  return response.json() as Promise<SchemaResponse>;
}

/**
 * Main regeneration orchestrator
 *
 * @param options - Configuration options (dryRun, entity filter)
 * @returns Result summary with change details
 */
export async function regenerateSchemas(options: RegenerateOptions): Promise<RegenerateResult> {
  // Step 1: Pre-flight checks
  const gatewayUrl = process.env.GATEWAY_URL;
  if (!gatewayUrl) {
    throw new Error('E001: GATEWAY_URL environment variable not set. Set it to the gateway base URL (e.g., http://localhost:3001).');
  }

  // Step 2: Sign JWT locally (no /auth/login call needed)
  console.log(chalk.cyan('Signing local JWT token...'));
  const token = signLocalToken();
  console.log(chalk.green('Token signed successfully\n'));

  // Step 3: Determine entities to process
  const allEntities = getSyncEntities();
  let entitiesToProcess: string[];

  if (options.entity) {
    // Validate entity is in the list
    if (!allEntities.includes(options.entity)) {
      throw new Error(`E004: Unknown entity '${options.entity}'. Valid entities: ${allEntities.join(', ')}`);
    }
    entitiesToProcess = [options.entity];
  } else {
    entitiesToProcess = allEntities;
  }

  // Step 4: Fetch all schemas (fail fast on any error)
  const schemas: SchemaResponse[] = [];
  for (const entity of entitiesToProcess) {
    const schema = await fetchSchema(gatewayUrl, token, entity);
    schemas.push(schema);
  }

  console.log(chalk.green(`\nFetched ${schemas.length} schema(s)\n`));

  // Step 5: Generate all content
  console.log(chalk.cyan('Generating Prisma schema...'));
  const prismaSchemaPath = resolve(process.cwd(), 'prisma/schema.prisma');
  const prismaContent = generatePrismaSchema(schemas, prismaSchemaPath);

  console.log(chalk.cyan('Generating Zod schemas...'));
  // Output to monorepo root's shared/ folder (go up one level from gateway)
  const monorepoRoot = resolve(process.cwd(), '..');
  const zodSchemas = schemas.map((schema) => ({
    entity: schema.entity,
    content: generateZodSchema(schema),
    filePath: resolve(monorepoRoot, 'shared/schemas/generated', `${schema.entity}.schema.ts`),
  }));

  // Step 6: Compute all diffs
  console.log(chalk.cyan('Computing diffs...\n'));
  const diffs: DiffResult[] = [];

  // Diff Prisma schema (normalize line endings to avoid CRLF vs LF false positives)
  const oldPrismaContent = existsSync(prismaSchemaPath)
    ? readFileSync(prismaSchemaPath, 'utf-8').replace(/\r\n/g, '\n')
    : '';
  const prismaDiff = computeDiff('prisma/schema.prisma', oldPrismaContent, prismaContent.replace(/\r\n/g, '\n'));
  diffs.push(prismaDiff);

  // Diff each Zod schema
  for (const zodSchema of zodSchemas) {
    const oldZodContent = existsSync(zodSchema.filePath)
      ? readFileSync(zodSchema.filePath, 'utf-8').replace(/\r\n/g, '\n')
      : '';
    const zodDiff = computeDiff(
      `../shared/schemas/generated/${zodSchema.entity}.schema.ts`,
      oldZodContent,
      zodSchema.content.replace(/\r\n/g, '\n')
    );
    diffs.push(zodDiff);
  }

  // Step 7: Display diffs
  for (const diff of diffs) {
    if (diff.hasChanges) {
      displayDiff(diff);
    }
  }
  displaySummary(diffs);

  const hasChanges = diffs.some((d) => d.hasChanges);

  // Step 8: Write files (unless dry-run)
  if (options.dryRun) {
    console.log(chalk.yellow('\n--dry-run: No files were modified.'));
    return {
      hasChanges,
      filesWritten: 0,
      entitiesChecked: schemas.length,
      diffs,
    };
  }

  if (!hasChanges) {
    // No changes, nothing to write
    return {
      hasChanges: false,
      filesWritten: 0,
      entitiesChecked: schemas.length,
      diffs,
    };
  }

  // Collect all pending writes
  const pendingWrites: Array<{ filePath: string; content: string }> = [];

  if (prismaDiff.hasChanges) {
    pendingWrites.push({ filePath: prismaSchemaPath, content: prismaContent });
  }

  for (let i = 0; i < zodSchemas.length; i++) {
    const zodSchema = zodSchemas[i];
    const zodDiff = diffs[i + 1]; // Prisma diff is first, Zod diffs follow
    if (zodDiff.hasChanges) {
      pendingWrites.push({ filePath: zodSchema.filePath, content: zodSchema.content });
    }
  }

  // If skipFileWrites, return pending writes for caller to handle
  if (options.skipFileWrites) {
    return {
      hasChanges,
      filesWritten: 0,
      entitiesChecked: schemas.length,
      diffs,
      pendingWrites,
    };
  }

  // Write files to disk
  console.log(chalk.cyan('\nWriting files...'));
  let filesWritten = 0;

  // Create generated directory in monorepo root's shared/ if it doesn't exist
  const generatedDir = resolve(monorepoRoot, 'shared/schemas/generated');
  if (!existsSync(generatedDir)) {
    mkdirSync(generatedDir, { recursive: true });
  }

  for (const { filePath, content } of pendingWrites) {
    writeFileSync(filePath, content, 'utf-8');
    console.log(chalk.green(`Written: ${filePath}`));
    filesWritten++;
  }

  // Run prisma generate (only if schema.prisma was written and not skipped)
  if (prismaDiff.hasChanges && !options.skipPrismaGenerate) {
    console.log(chalk.cyan('\nRunning prisma generate...'));
    try {
      const output = execSync('npx prisma generate', {
        cwd: process.cwd(),
        encoding: 'utf-8',
      });
      console.log(output);
      console.log(chalk.green('Prisma generate completed successfully'));
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      throw new Error(`E005: prisma generate failed. ${errorMessage}`);
    }
  }

  // Return result
  return {
    hasChanges,
    filesWritten,
    entitiesChecked: schemas.length,
    diffs,
  };
}
