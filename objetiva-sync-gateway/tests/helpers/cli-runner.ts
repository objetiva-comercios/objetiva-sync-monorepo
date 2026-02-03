import { spawn } from 'node:child_process';
import { resolve } from 'node:path';

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

  // Merge process.env with overrides (undefined values remove the key)
  const env = { ...process.env, ...envOverrides };
  for (const [key, value] of Object.entries(envOverrides)) {
    if (value === undefined) delete env[key];
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
