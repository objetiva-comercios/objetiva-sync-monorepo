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

  // Print yellow summary line
  console.log(
    chalk.yellow(
      `Added: ${diff.summary.added}, Removed: ${diff.summary.removed}`
    )
  );

  // Print each hunk
  for (const hunk of diff.hunks) {
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
 * Display overall summary of all diffs
 *
 * @param diffs - Array of all diff results
 */
export function displaySummary(diffs: DiffResult[]): void {
  // Count files with changes
  const filesChanged = diffs.filter((d) => d.hasChanges).length;

  if (filesChanged === 0) {
    console.log(chalk.green('\nNo changes detected'));
    return;
  }

  // Sum up all additions and deletions
  const totalAdded = diffs.reduce((sum, d) => sum + d.summary.added, 0);
  const totalRemoved = diffs.reduce((sum, d) => sum + d.summary.removed, 0);

  console.log(
    chalk.bold(
      `\n${filesChanged} file(s) changed, ${totalAdded} addition(s), ${totalRemoved} deletion(s)`
    )
  );
}
