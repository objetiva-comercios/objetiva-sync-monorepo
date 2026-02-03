import { spawn } from 'node:child_process';
import { resolve } from 'node:path';
import { existsSync, renameSync } from 'node:fs';

export interface CliResult {
  exitCode: number;
  stdout: string;
  stderr: string;
  duration: number;
}

export async function runRegenerateSchemas(
  args: string[] = [],
  envOverrides: Record<string, string | undefined> = {}
): Promise<CliResult> {
  const startTime = Date.now();
  const cliPath = resolve(__dirname, '../../scripts/regenerate-schemas.ts');
  const gatewayRoot = resolve(__dirname, '../..');
  const envPath = resolve(gatewayRoot, '.env');
  const envBackupPath = resolve(gatewayRoot, '.env.cli-test-backup');

  // Check if we need to temporarily hide .env file
  // (when testing error scenarios with missing env vars)
  const hasUndefinedOverrides = Object.values(envOverrides).some(v => v === undefined);
  let envWasRenamed = false;

  try {
    if (hasUndefinedOverrides && existsSync(envPath)) {
      // Temporarily rename .env so CLI can't load it
      renameSync(envPath, envBackupPath);
      envWasRenamed = true;
    }

    // Merge process.env with overrides (undefined values remove the key)
    const env = { ...process.env, ...envOverrides };
    for (const [key, value] of Object.entries(envOverrides)) {
      if (value === undefined) delete env[key];
    }

    return await new Promise((resolve, reject) => {
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
  } finally {
    // Always restore .env if we renamed it
    if (envWasRenamed && existsSync(envBackupPath)) {
      renameSync(envBackupPath, envPath);
    }
  }
}
