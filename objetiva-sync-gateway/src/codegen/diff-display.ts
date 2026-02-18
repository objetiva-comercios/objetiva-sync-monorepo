/**
 * Diff computation and colored display utilities
 *
 * Uses the `diff` library to compute structured patches and `chalk` to
 * render colored output showing additions (green), deletions (red),
 * and context (white).
 */

import { structuredPatch } from 'diff';
import chalk from 'chalk';
import type { DiffResult } from './types.js';

/**
 * Compute a structured diff between old and new file content
 *
 * @param fileName - Name/path of the file being diffed
 * @param oldContent - Original file content
 * @param newContent - New file content
 * @returns DiffResult with hunks and summary statistics
 */
export function computeDiff(
  fileName: string,
  oldContent: string,
  newContent: string
): DiffResult {
  // Use structuredPatch with 3 lines of context
  const patch = structuredPatch(
    fileName,
    fileName,
    oldContent,
    newContent,
    undefined,
    undefined,
    { context: 3 }
  );

  // Count added and removed lines from hunks
  let added = 0;
  let removed = 0;

  for (const hunk of patch.hunks) {
    for (const line of hunk.lines) {
      if (line.startsWith('+') && !line.startsWith('+++')) {
        added++;
      } else if (line.startsWith('-') && !line.startsWith('---')) {
        removed++;
      }
    }
  }

  const hasChanges = added > 0 || removed > 0;

  return {
    fileName,
    hasChanges,
    summary: { added, removed },
    hunks: patch.hunks,
  };
}

/**
 * Check if a diff line is just noise (timestamp, import, export, etc.)
 */
function isNoiseLine(line: string): boolean {
  const trimmed = line.substring(1).trim(); // Remove +/- prefix

  // Filter timestamp changes
  if (trimmed.startsWith('// Generated:')) {
    return true;
  }

  // Filter import/export statements (not structural changes)
  if (trimmed.startsWith('import ') || trimmed.startsWith('export type ')) {
    return true;
  }

  return false;
}

/**
 * Display a colored diff to the console
 *
 * @param diff - The diff result to display
 */
export function displayDiff(diff: DiffResult): void {
  // If no changes, return early
  if (!diff.hasChanges) {
    return;
  }

  // Print bold filename header
  console.log(chalk.bold(`\n${diff.fileName}`));

  // Filter out noise lines and count real changes
  let realAdded = 0;
  let realRemoved = 0;
  const filteredHunks: typeof diff.hunks = [];

  for (const hunk of diff.hunks) {
    const filteredLines: string[] = [];
    let hasRealChanges = false;

    for (const line of hunk.lines) {
      // Skip noise lines
      if ((line.startsWith('+') || line.startsWith('-')) && isNoiseLine(line)) {
        continue;
      }

      filteredLines.push(line);

      // Count real changes
      if (line.startsWith('+') && !line.startsWith('+++')) {
        realAdded++;
        hasRealChanges = true;
      } else if (line.startsWith('-') && !line.startsWith('---')) {
        realRemoved++;
        hasRealChanges = true;
      }
    }

    // Only include hunks with real changes
    if (hasRealChanges) {
      filteredHunks.push({
        ...hunk,
        lines: filteredLines,
      });
    }
  }

  // If all changes were noise, skip this file
  if (realAdded === 0 && realRemoved === 0) {
    return;
  }

  // Print yellow summary line (only real changes)
  console.log(
    chalk.yellow(
      `Added: ${realAdded}, Removed: ${realRemoved}`
    )
  );

  // Print each filtered hunk
  for (const hunk of filteredHunks) {
    // Cyan @@ markers for hunk headers
    console.log(
      chalk.cyan(
        `@@ -${hunk.oldStart},${hunk.oldLines} +${hunk.newStart},${hunk.newLines} @@`
      )
    );

    // Print lines with appropriate colors
    for (const line of hunk.lines) {
      if (line.startsWith('+') && !line.startsWith('+++')) {
        // Green for additions
        console.log(chalk.green(line));
      } else if (line.startsWith('-') && !line.startsWith('---')) {
        // Red for deletions
        console.log(chalk.red(line));
      } else {
        // White for context
        console.log(line);
      }
    }
  }
}

/**
 * Extract structural changes from a diff (columns added/removed)
 */
function extractStructuralChanges(diff: DiffResult): { added: string[]; removed: string[] } {
  const added: string[] = [];
  const removed: string[] = [];

  for (const hunk of diff.hunks) {
    for (const line of hunk.lines) {
      // Skip noise lines
      if (isNoiseLine(line)) {
        continue;
      }

      // Look for column additions/removals (lines with field definitions)
      const trimmed = line.substring(1).trim();

      // Prisma schema: "field_name Type"
      // Zod schema: "field_name: z.type()"
      const isPrismaField = /^\w+\s+\w+(\?|\[|\s)/.test(trimmed);
      const isZodField = /^\w+:\s+z\./.test(trimmed);

      if (isPrismaField || isZodField) {
        // Extract field name
        const fieldName = trimmed.split(/[\s:]/)[0];

        if (line.startsWith('+')) {
          added.push(fieldName);
        } else if (line.startsWith('-')) {
          removed.push(fieldName);
        }
      }
    }
  }

  // Remove duplicates (same field in Prisma and Zod)
  return {
    added: [...new Set(added)],
    removed: [...new Set(removed)],
  };
}

/**
 * Display human-friendly structural summary
 */
export function displayStructuralSummary(diffs: DiffResult[]): void {
  console.log(chalk.bold('\n📊 Schema Changes Summary:'));

  // Group by entity (look for .generated.ts files for Zod schemas)
  const entityChanges = new Map<string, { added: string[]; removed: string[] }>();

  for (const diff of diffs) {
    // Skip if no real changes
    if (!diff.hasChanges) {
      continue;
    }

    // Extract entity name from filename
    let entityName: string | null = null;

    if (diff.fileName.includes('prisma/schema.prisma')) {
      // For Prisma file, we can't easily extract per-entity, skip
      continue;
    } else if (diff.fileName.includes('.generated.ts')) {
      // Extract from "shared/schemas/generated/articulos.generated.ts"
      const match = diff.fileName.match(/([^/]+)\.generated\.ts$/);
      if (match) {
        entityName = match[1];
      }
    }

    if (entityName) {
      const changes = extractStructuralChanges(diff);
      if (changes.added.length > 0 || changes.removed.length > 0) {
        entityChanges.set(entityName, changes);
      }
    }
  }

  if (entityChanges.size === 0) {
    console.log(chalk.gray('  No structural changes detected\n'));
    return;
  }

  // Display changes per entity
  for (const [entity, changes] of entityChanges) {
    console.log(chalk.cyan(`\n  ${entity}:`));

    if (changes.added.length > 0) {
      console.log(chalk.green(`    + Added columns: ${changes.added.join(', ')}`));
    }

    if (changes.removed.length > 0) {
      console.log(chalk.red(`    - Removed columns: ${changes.removed.join(', ')}`));
    }
  }

  console.log('');
}

/**
 * Display overall summary of all diffs
 *
 * @param diffs - Array of all diff results
 */
export function displaySummary(diffs: DiffResult[]): void {
  // Count files with real changes (filtering noise)
  let filesChanged = 0;
  let totalAdded = 0;
  let totalRemoved = 0;

  for (const diff of diffs) {
    if (!diff.hasChanges) {
      continue;
    }

    // Count only non-noise lines
    let realAdded = 0;
    let realRemoved = 0;

    for (const hunk of diff.hunks) {
      for (const line of hunk.lines) {
        if (line.startsWith('+') && !line.startsWith('+++') && !isNoiseLine(line)) {
          realAdded++;
        } else if (line.startsWith('-') && !line.startsWith('---') && !isNoiseLine(line)) {
          realRemoved++;
        }
      }
    }

    if (realAdded > 0 || realRemoved > 0) {
      filesChanged++;
      totalAdded += realAdded;
      totalRemoved += realRemoved;
    }
  }

  if (filesChanged === 0) {
    console.log(chalk.green('\n✓ No changes detected'));
    return;
  }

  console.log(
    chalk.bold(
      `\n${filesChanged} file(s) changed, ${totalAdded} addition(s), ${totalRemoved} deletion(s)`
    )
  );

  // Display structural summary
  displayStructuralSummary(diffs);
}
