#!/usr/bin/env node
/**
 * Kill gateway process by port to allow prisma generate to run
 * Only kills if process is listening on port 3335
 */

import { execSync } from 'child_process';
import { platform } from 'os';

const GATEWAY_PORT = 3335;

/**
 * Find PID listening on gateway port (Windows)
 */
function findPidByPortWindows(port) {
  try {
    // Use netstat to find process listening on port
    const output = execSync(`netstat -ano | findstr :${port}`, {
      encoding: 'utf-8',
      stdio: ['pipe', 'pipe', 'pipe']
    });

    // Parse output: TCP    0.0.0.0:3335    0.0.0.0:0    LISTENING    12345
    const lines = output.split('\n');
    for (const line of lines) {
      if (line.includes('LISTENING')) {
        const parts = line.trim().split(/\s+/);
        const pid = parts[parts.length - 1];
        if (pid && /^\d+$/.test(pid)) {
          return parseInt(pid, 10);
        }
      }
    }
  } catch (error) {
    // No process found or command failed
    return null;
  }
  return null;
}

/**
 * Find parent PID of a process (Windows) using PowerShell
 * More reliable than wmic in Git Bash/MINGW environments
 */
function findParentPid(pid) {
  try {
    // Use PowerShell to get parent PID - avoids wmic encoding/escaping issues
    const output = execSync(
      `powershell -NoProfile -Command "(Get-CimInstance Win32_Process -Filter 'ProcessId=${pid}').ParentProcessId"`,
      { encoding: 'utf-8', stdio: ['pipe', 'pipe', 'pipe'] }
    ).trim();
    const parentPid = parseInt(output, 10);
    if (!parentPid || isNaN(parentPid)) return null;

    // Verify parent is a tsx watch process
    try {
      const parentCmd = execSync(
        `powershell -NoProfile -Command "(Get-CimInstance Win32_Process -Filter 'ProcessId=${parentPid}').CommandLine"`,
        { encoding: 'utf-8', stdio: ['pipe', 'pipe', 'pipe'] }
      ).trim();
      if (parentCmd.includes('tsx') && parentCmd.includes('watch')) {
        return parentPid;
      }
    } catch (_) {
      // Parent info not available
    }
  } catch (_) {
    // PowerShell failed
  }
  return null;
}

/**
 * Kill process by PID (Windows)
 */
function killProcessWindows(pid) {
  try {
    execSync(`taskkill /F /PID ${pid}`, { stdio: 'ignore' });
    return true;
  } catch (error) {
    return false;
  }
}

/**
 * Kill process tree: parent tsx watch + gateway child
 * Must kill parent FIRST to prevent it from respawning the child
 */
function killProcessTreeWindows(parentPid, childPid) {
  // Kill parent (tsx watch) first — stops respawn
  killProcessWindows(parentPid);
  sleep(500);
  // Kill child (gateway node) in case it survived
  killProcessWindows(childPid);
  return true;
}

/**
 * Sleep for specified milliseconds
 */
function sleep(ms) {
  const start = Date.now();
  while (Date.now() - start < ms) {
    // Busy wait
  }
}

/**
 * Main function - returns true if gateway was running
 */
function main() {
  if (platform() !== 'win32') {
    console.log('Not Windows - skipping process management\n');
    return false;
  }

  const pid = findPidByPortWindows(GATEWAY_PORT);

  if (!pid) {
    // No process found - safe to continue
    return false;
  }

  // Check if gateway is running under tsx watch — kill both to prevent respawn
  const parentPid = findParentPid(pid);

  if (parentPid) {
    console.log(`Stopping tsx watch (PID ${parentPid}) + gateway (PID ${pid})...`);
    killProcessTreeWindows(parentPid, pid);
  } else {
    console.log(`Stopping gateway (PID ${pid})...`);
    killProcessWindows(pid);
  }

  // Wait for processes to fully terminate and release file handles
  sleep(2000);

  // Verify port is actually free
  const stillRunning = findPidByPortWindows(GATEWAY_PORT);
  if (stillRunning) {
    console.log(`Port still in use by PID ${stillRunning}, force killing...`);
    killProcessWindows(stillRunning);
    sleep(1500);
  }

  console.log('✓ Gateway stopped\n');
  return true;
}

// Export result: was gateway running?
const wasRunning = main();
process.exit(wasRunning ? 0 : 1);
