import { spawn } from 'node:child_process';
import { resolve } from 'node:path';
import { readFileSync } from 'node:fs';

export interface CliResult {
  exitCode: number;
  stdout: string;
  stderr: string;
  duration: number;
}

/**
 * Parse .env file content into key-value pairs
 */
function parseEnvFile(content: string): Record<string, string> {
  const result: Record<string, string> = {};
  const lines = content.split('\n');

  for (const line of lines) {
    const trimmed = line.trim();
    // Skip comments and empty lines
    if (!trimmed || trimmed.startsWith('#')) continue;

    // Parse KEY=VALUE
    const match = trimmed.match(/^([^=]+)=(.*)$/);
    if (match) {
      const key = match[1].trim();
      let value = match[2].trim();

      // Remove quotes if present
      if ((value.startsWith('"') && value.endsWith('"')) ||
          (value.startsWith("'") && value.endsWith("'"))) {
        value = value.slice(1, -1);
      }

      result[key] = value;
    }
  }

  return result;
}

export async function runRegenerateSchemas(
  args: string[] = [],
  envOverrides: Record<string, string | undefined> = {}
): Promise<CliResult> {
  const startTime = Date.now();
  const cliPath = resolve(__dirname, '../../scripts/regenerate-schemas.ts');
  const gatewayRoot = resolve(__dirname, '../..');

  // For error tests (with undefined overrides), we need to pass a complete env
  // that prevents the CLI from loading .env file
  const hasUndefinedOverrides = Object.values(envOverrides).some(v => v === undefined);

  let env = { ...process.env };

  if (hasUndefinedOverrides) {
    // Tell CLI to skip loading .env file
    env.SKIP_DOTENV = 'true';

    // Load .env.test explicitly to get all required vars (except the ones being tested)
    const envTestPath = resolve(gatewayRoot, '.env.test');
    try {
      const envTestContent = readFileSync(envTestPath, 'utf-8');
      const envTestVars = parseEnvFile(envTestContent);

      // Merge .env.test vars into env (lower priority than process.env)
      env = { ...envTestVars, ...env };
    } catch (error) {
      // If .env.test doesn't exist, continue with process.env
    }
  }

  // Apply overrides (undefined values remove the key)
  for (const [key, value] of Object.entries(envOverrides)) {
    if (value === undefined) {
      delete env[key];
    } else {
      env[key] = value;
    }
  }

  return new Promise((resolve, reject) => {
    const child = spawn('npx', ['tsx', cliPath, ...args], {
      cwd: gatewayRoot,
      env,
      stdio: ['pipe', 'pipe', 'pipe'],
      shell: true  // Required for Windows
    });

    let stdout = '';
    let stderr = '';

    child.stdout?.on('data', (data) => { stdout += data.toString(); });
    child.stderr?.on('data', (data) => { stderr += data.toString(); });

    child.on('close', (code) => {
      resolve({
        exitCode: code ?? -1,
        stdout,
        stderr,
        duration: Date.now() - startTime
      });
    });

    child.on('error', reject);
  });
}
