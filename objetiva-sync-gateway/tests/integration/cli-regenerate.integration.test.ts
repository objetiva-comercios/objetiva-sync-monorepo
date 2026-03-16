/**
 * CLI Regenerate Schemas E2E Tests (Phase 6)
 *
 * Verifies the complete CLI pipeline against a running gateway:
 * - Authentication with gateway
 * - Schema fetching from /api/schemas
 * - Diff display (--dry-run)
 * - File writing (full run)
 * - prisma generate execution
 * - Error code handling (E001-E003)
 *
 * PREREQUISITE: Gateway must be running at GATEWAY_URL before tests execute
 */

import { describe, it, expect, beforeAll } from 'vitest';
import { config } from 'dotenv';
import { resolve } from 'node:path';
import { existsSync, readFileSync } from 'node:fs';
import { runRegenerateSchemas } from '../helpers/cli-runner.js';

// Load test environment
config({ path: resolve(__dirname, '../../.env.test') });

describe('CLI Regenerate Schemas E2E', { sequential: true }, () => {

  beforeAll(async () => {
    // Verify gateway is accessible before running tests
    const gatewayUrl = process.env.GATEWAY_URL;
    if (!gatewayUrl) {
      throw new Error('GATEWAY_URL not set in .env.test');
    }

    try {
      const response = await fetch(`${gatewayUrl}/health`, {
        signal: AbortSignal.timeout(5000)
      });

      if (!response.ok) {
        throw new Error(`Gateway health check returned ${response.status}`);
      }
    } catch (error) {
      throw new Error(
        `Gateway not accessible at ${gatewayUrl}. ` +
        `Start gateway first: cd objetiva-sync-gateway && npm run dev\n` +
        `Error: ${error}`
      );
    }
  });

  describe('Success Paths', () => {

    it('should authenticate and display diffs with --dry-run', async () => {
      const result = await runRegenerateSchemas(['--dry-run']);

      // Verify successful local token signing
      expect(result.stdout).toContain('Signing local JWT token');
      expect(result.stdout).toContain('Token signed successfully');

      // Verify schema fetching
      expect(result.stdout).toContain('Fetching schema');
      expect(result.stdout).toMatch(/Fetched \d+ schema\(s\)/);

      // Verify diff computation
      expect(result.stdout).toContain('Computing diffs');

      // Verify dry-run message
      expect(result.stdout).toContain('--dry-run: No files were modified');

      // Verify exit code
      expect(result.exitCode).toBe(0);
    }, 30000); // 30s timeout for network operations

    it('should fetch schemas for specific entity with --entity flag', async () => {
      const result = await runRegenerateSchemas(['--dry-run', '--entity', 'articulos']);

      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain('Filter: articulos only');
      expect(result.stdout).toContain('Fetching schema for articulos');
      expect(result.stdout).toContain('Fetched 1 schema(s)');
    }, 30000);

    it('should write files and run prisma generate on full run', async () => {
      // Note: This test modifies real files - it will write to prisma/schema.prisma
      // The CLI handles gateway stop/restart automatically
      const result = await runRegenerateSchemas(['--entity', 'articulos']);

      // Verify authentication and fetching
      expect(result.stdout).toContain('Token signed successfully');
      expect(result.stdout).toContain('Fetched 1 schema(s)');

      // Should either show changes written OR "are up-to-date" if no changes
      const hasChanges = result.stdout.includes('Success! All schemas updated');
      const noChanges = result.stdout.includes('are up-to-date');

      expect(hasChanges || noChanges).toBe(true);

      // If changes were made, verify prisma generate ran
      if (hasChanges) {
        // Check for prisma generate output (may be in stdout or child process output)
        expect(
          result.stdout.includes('prisma generate') ||
          result.stdout.includes('Generated Prisma Client')
        ).toBe(true);
      }

      expect(result.exitCode).toBe(0);

      // Verify Prisma schema file exists
      const schemaPath = resolve(__dirname, '../../prisma/schema.prisma');
      expect(existsSync(schemaPath)).toBe(true);

      // Verify schema contains articulos model (PascalCase in Prisma)
      const schemaContent = readFileSync(schemaPath, 'utf-8');
      expect(schemaContent).toContain('model Articulo');
    }, 60000); // 60s timeout for full regeneration + prisma generate
  });

  describe('Error Scenarios', () => {

    it('should fail when GATEWAY_URL is missing', async () => {
      const result = await runRegenerateSchemas(['--dry-run'], {
        GATEWAY_URL: undefined
      });

      expect(result.exitCode).toBe(1);
      // Error format: "Missing required environment variables: GATEWAY_URL"
      expect(result.stdout + result.stderr).toMatch(/Missing required|GATEWAY_URL/i);
    }, 10000);

    it('should fail when JWT_SECRET is missing', async () => {
      const result = await runRegenerateSchemas(['--dry-run'], {
        JWT_SECRET: undefined
      });

      expect(result.exitCode).toBe(1);
      // Error format: "Missing required environment variables: JWT_SECRET"
      expect(result.stdout + result.stderr).toMatch(/Missing required|JWT_SECRET/i);
    }, 10000);

    it('should fail when entity is invalid', async () => {
      const result = await runRegenerateSchemas(['--dry-run', '--entity', 'invalid_entity']);

      expect(result.exitCode).toBe(1);
      // Verify CLI fails - may show various error messages depending on gateway state
      expect(result.stdout + result.stderr).toMatch(/Error|failed|not running|invalid/i);
    }, 15000);
  });
});
