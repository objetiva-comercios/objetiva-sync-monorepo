# PITFALLS: v1.2 Setup & Pairing

**Research Focus**: Common mistakes when adding code-based pairing, improved setup wizards with .env generation, and Docker pre-flight validation to an existing Fastify + Docker system.

**Project Context**: Gateway runs in Docker behind Traefik + Tailscale. Sync runs on Windows with npm start. Current auth uses JWT with shared secret in .env. Gateway setup page already rewrites .env files. Password stored plain text in gateway .env.

**Previous Version**: v1.1-rc2 research focused on multi-source sync, auth hardening, and observability. Those pitfalls are archived at end of this document.

---

## v1.2 SPECIFIC PITFALLS

### Part A: Pairing Code Security Pitfalls

---

#### PC-01: Pairing Code Brute-Forceable Without Rate Limiting

**What goes wrong:** A 6-digit or short alphanumeric pairing code has a small search space. Without rate limiting, an attacker on the local network can enumerate all codes in seconds. Even inside Tailscale mesh, lateral movement from a compromised machine is possible.

**Why it happens:** Setup flows feel "internal-only" so rate limiting seems unnecessary. Developers forget that gateway is also reachable from all Tailscale nodes, not just the sync Windows machine.

**Consequences:** Any Tailscale node can impersonate the sync and complete pairing, permanently hijacking the JWT secret.

**Prevention:**
- Apply a strict rate limit on `/api/pairing/claim`: maximum 5 attempts per IP per minute with exponential backoff
- Expire the code after 3 failed attempts (force regeneration)
- Use `@fastify/rate-limit` already in the ecosystem — add to pairing endpoint only
- Log all claim attempts with IP address

**Detection:** Code claim attempts from unexpected IPs; repeated 4xx responses on pairing endpoint.

**Phase:** Pairing code implementation

---

#### PC-02: Pairing Code Stored In-Memory Is Lost on Container Restart

**What goes wrong:** Gateway generates a pairing code and stores it in a `Map` or module-level variable. Docker Compose restarts the container (`restart: unless-stopped`), or Traefik health check triggers a restart. The code disappears. Sync tries to claim it and gets 404. User is confused.

**Why it happens:** In-memory state is the simplest implementation. The `restart: unless-stopped` policy in the existing docker-compose.yml means any crash or OOM triggers a silent restart.

**Consequences:** Pairing fails intermittently. Hard to reproduce. User regenerates code multiple times, each attempt requires another Docker restart cycle to pick up the resulting .env changes.

**Prevention:**
- Persist the active pairing token to a file (`/app/data/pairing.json`) or to the .env file itself as a comment-like marker
- Alternatively: store token in a SQLite file inside the container volume (a `gateway-data` volume, separate from `gateway-logs`)
- Set a short TTL (10-15 minutes) and write it on generation, delete it on successful claim or expiry
- For simplest approach: write `PAIRING_TOKEN=xxx` and `PAIRING_EXPIRES=timestamp` to .env itself — they get cleared after successful pairing

**Detection:** "Pairing code not found" errors immediately after any container restart.

**Phase:** Pairing code implementation

---

#### PC-03: Pairing Code Endpoint Left Open After Pairing Completes

**What goes wrong:** After a successful pairing, the `/api/pairing/generate` and `/api/pairing/claim` endpoints remain available indefinitely. Any future Tailscale node can trigger a new pairing, overwriting the JWT secret.

**Why it happens:** The generate/claim endpoints are added as permanent routes. There is no state machine tracking "paired vs. unpaired."

**Consequences:** Security regression — any operator with Tailscale access can re-pair and get the JWT secret, effectively rotating credentials without authorization.

**Prevention:**
- Add a `GATEWAY_PAIRED=true` flag to .env after successful pairing
- On startup, if `GATEWAY_PAIRED=true`, reject requests to `/api/pairing/generate` with 403
- Make the pairing endpoint require a one-time setup token or restrict it to the setup wizard context
- Document that re-pairing requires explicit reset (delete `GATEWAY_PAIRED` from .env)

**Detection:** Pairing endpoint responding with 200 after gateway is already configured.

**Phase:** Pairing code implementation and setup wizard integration

---

#### PC-04: JWT Secret Generated on Gateway and Transmitted to Sync Without Encryption

**What goes wrong:** The pairing flow has gateway generate the JWT secret and return it in the pairing claim response. Sync reads it over HTTP (Tailscale handles encryption at the network layer, but the response body is plain JSON). This is fine functionally, but the secret could be logged by intermediaries.

**Why it happens:** The simplest implementation returns `{ jwtSecret: "..." }` in the claim response JSON. Pino logger on both ends may log request/response bodies in debug mode.

**Consequences:** JWT secret leaks in log files on either side. On the sync (Windows) side, logs may be stored in user-accessible locations.

**Prevention:**
- Ensure LOG_LEVEL is `info` in production (not `debug` or `trace`) — both services already log at `info` by default
- Never log the pairing response body, even in debug mode; add explicit redaction: `logger.debug({ action: 'pairing-claimed' }, 'Pairing successful')` (no body)
- After receiving the secret, sync should immediately write it to .env and clear it from memory

**Detection:** Check pino log output in debug mode for JWT secret presence.

**Phase:** Pairing code claim response implementation

---

### Part B: .env File Write Pitfalls

---

#### ENV-01: Concurrent .env Writes Corrupt the File

**What goes wrong:** The existing setup routes already write to .env (`save-jwt-secret`, `verify-tables`, `set-password`, `change-password`). If two setup wizard steps are clicked rapidly, or if the sync side is polling the gateway while the wizard is saving, concurrent `fs.readFile` + `fs.writeFile` sequences interleave and corrupt the file.

**Why it happens:** The current pattern is: read entire file → regex replace → write entire file. This is not atomic. Two concurrent requests can both read the file, both apply their regex, and write different results, with one overwriting the other's change.

**Consequences:** .env file loses a variable. Container restarts with missing config. Could cause `DATABASE_URL` to disappear, breaking all sync.

**Prevention:**
- Add a module-level async mutex for all .env write operations (use the `async-mutex` npm package, or implement a simple promise-based queue)
- Write to a `.env.tmp` file first, then `fs.rename()` for atomic replacement (rename is atomic on same filesystem)
- Pattern:
  ```typescript
  // In a shared env-writer.ts module
  let writeLock = Promise.resolve();
  export function writeEnv(updates: Record<string, string>) {
    writeLock = writeLock.then(() => _writeEnvImpl(updates));
    return writeLock;
  }
  ```
- Both setup.ts and auth.ts already write .env — centralize in a single utility

**Detection:** .env file missing variables after setup wizard use. Validate by reading .env immediately after write and checking all expected keys are present.

**Phase:** Setup wizard .env generation implementation

---

#### ENV-02: .env Write Succeeds But Docker Container Reads Stale Environment

**What goes wrong:** The setup wizard writes to .env. The UI shows "success." The user does not restart the container. The running container process still has the OLD environment variables in memory from startup. `process.env.JWT_SECRET` does not update until container restart. Auth fails.

**Why it happens:** Node.js (and all processes) read environment variables at startup. `process.env` is a snapshot, not a live view. Writing to the .env file does not update the running process's environment.

**Consequences:** User configures everything correctly through the wizard but cannot authenticate. Support nightmare — everything looks right, nothing works.

**Prevention:**
- After EVERY .env write, the API response MUST include `{ success: true, requiresRestart: true, message: "Reinicia el contenedor: docker compose restart sync-gateway" }`
- The setup wizard UI must prominently show a restart-required banner that persists until dismissed
- Add a `GET /api/setup/needs-restart` endpoint that compares current `process.env` values with .env file values — if they differ, return `{ needsRestart: true }`
- The pre-flight checker should include "restart required" detection as a check item

**Detection warning:** The existing setup UI already has this issue — `set-password` response says "reiniciar el servidor" but only in the success message text, not as a blocking UI element.

**Phase:** Setup wizard and pre-flight check implementation

**Existing exposure:** Current `/api/setup/set-password` already has this behavior — the password change takes effect only after restart. The planned wizard must not repeat this as a subtle note.

---

#### ENV-03: docker compose restart vs docker compose up Does Not Apply .env Changes

**What goes wrong:** User follows the wizard instruction to "restart the container" using `docker compose restart`. This command stops and starts the container but does NOT re-read the `env_file:` directive from docker-compose.yml. Environment variables from .env are injected at container creation time, not at restart time. The container restarts with the OLD environment.

**Why it happens:** This is a well-known Docker Compose behavior (confirmed in Docker docs). `docker compose restart` only restarts the process inside the existing container. `docker compose up` recreates the container and re-reads env_file.

**Consequences:** User restarts container per instruction. Nothing changes. Repeats the process multiple times. Eventually gives up or accidentally uses `up --force-recreate` and it works.

**Prevention:**
- All user-facing instructions in the wizard MUST specify the correct command: `docker compose up -d --force-recreate sync-gateway` (NOT `docker compose restart`)
- The pre-flight checker documentation should explain this distinction
- In the "restart required" banner (see ENV-02), show the exact command with copy button
- Add this to the deployment documentation

**Detection:** Container restarts but JWT_SECRET or SYNC_PASSWORD still show old values. Check with `docker exec sync-gateway env | grep JWT_SECRET`.

**Phase:** Setup wizard restart instructions, pre-flight documentation

**External source:** Docker Compose docs confirm: "Changes to compose.yml configuration are not reflected after running the restart command. For env_file changes, use `docker compose up --force-recreate`."

---

#### ENV-04: .env Values with Special Characters Break Regex Replacement

**What goes wrong:** The existing .env write code uses `envContent.replace(/JWT_SECRET=.*/g, ...)`. If the new JWT_SECRET value contains regex special characters (it won't — hex is safe), or if a user sets a password containing `$`, `\`, or backticks, the regex replacement interprets them as replacement pattern metacharacters and corrupts the value.

**Why it happens:** `String.replace()` in JavaScript interprets `$` in the replacement string as a special pattern (`$&`, `$1`, etc.). A password like `pass$word` becomes `password` after replacement.

**Actual current exposure in codebase:** `auth.ts` line 271: `envContent.replace(/SYNC_PASSWORD=.*/g, \`SYNC_PASSWORD=${newPassword}\`)`. If `newPassword` contains `$`, this silently truncates the value.

**Consequences:** Password is set to a different value than what the user typed. Authentication silently fails. No error is shown.

**Prevention:**
- Use a raw string replacement helper that escapes `$` in replacement strings:
  ```typescript
  function safeEnvReplace(content: string, key: string, value: string): string {
    // Escape $ to prevent String.replace() metacharacter interpretation
    const safeValue = value.replace(/\$/g, '$$$$');
    return content.replace(new RegExp(`^${key}=.*$`, 'm'), `${key}=${safeValue}`);
  }
  ```
- Or use a proper .env parser/writer library like `dotenv-flow` or write a line-by-line parser
- Add a test with passwords containing `$`, `\`, and other special characters

**Detection:** Set password to `test$123`, restart, attempt login — it will fail.

**Phase:** .env writer utility implementation (applies to all setup and auth routes)

---

#### ENV-05: .env File Generated with Wrong Path When CWD Differs

**What goes wrong:** All .env writes use `path.join(process.cwd(), '.env')`. Inside Docker, `process.cwd()` is the working directory set in the Dockerfile (`WORKDIR /app/objetiva-sync-gateway`). If the Dockerfile WORKDIR ever changes, or if the container is started from a different working directory, the .env is written to the wrong location — or fails silently because the file doesn't exist at that path.

**Why it happens:** Relative path assumption. The current codebase consistently uses `process.cwd()` for the .env path, which works correctly in the current Docker setup, but is fragile.

**Consequences:** Setup wizard writes to a non-existent .env path. On restart, the container reads the actual .env from the original location (unchanged). Configuration appears to not save.

**Prevention:**
- Use `import.meta.url` or `__dirname`-equivalent to resolve .env path relative to the module file, not CWD
- Or add an explicit `ENV_FILE_PATH` environment variable that overrides the default
- Add a startup check: verify the .env file exists at the expected path and log a warning if it doesn't
- For the wizard: return the absolute path used in the success response so user can verify

**Detection:** Run `docker exec sync-gateway ls -la /app/objetiva-sync-gateway/.env` to verify the file exists and has been modified recently.

**Phase:** .env writer utility implementation

---

### Part C: Docker Pre-Flight Validation Pitfalls

---

#### PF-01: Pre-Flight Check Tests Connection But Not What Container Will See

**What goes wrong:** The pre-flight check runs a Prisma connection test inside the Node.js process. It succeeds because the test uses the DATABASE_URL from the current `process.env` (set at container start). But the validation is checking whether the current running config works — not whether the new .env values the user just wrote will work after restart.

**Why it happens:** Pre-flight is implemented as "does the gateway work right now?" rather than "will the gateway work with the pending .env changes?"

**Consequences:** Pre-flight shows all green. User restarts container. New .env value has a typo in DATABASE_URL. Container fails to start. Pre-flight gave false confidence.

**Prevention:**
- Pre-flight should have two modes:
  1. **Current state check**: validates running process.env (useful for health monitoring)
  2. **Pending config check**: reads .env file, parses it, and validates the PENDING values (useful before restart)
- The setup wizard pre-flight should use mode 2 — "validate what will happen after restart"
- For DATABASE_URL validation in mode 2: create a temporary Prisma client with the .env file value (not process.env) and test it

**Detection:** Wizard shows "all checks pass" followed by container startup failure.

**Phase:** Pre-flight check implementation

---

#### PF-02: Pre-Flight Tailscale Reachability Check Is Not Bidirectional

**What goes wrong:** The pre-flight check validates that the gateway can reach PostgreSQL. It does not validate that the SYNC machine (Windows, running npm start) can reach the gateway's Tailscale IP. The wizard is running on the gateway side; it cannot test the path from sync to itself.

**Why it happens:** Pre-flight naturally tests what the gateway can reach. Testing the reverse path requires a probe from the sync side, which adds complexity.

**Consequences:** Gateway pre-flight passes. User declares setup complete. Sync starts and gets connection refused to gateway. The Tailscale IP used in GATEWAY_URL is wrong (e.g., using the public domain instead of the Tailscale IP, or vice versa).

**Prevention:**
- Add a `/api/health/ping` endpoint to the gateway that simply returns `{ ok: true, timestamp: ... }`
- On the SYNC side, add a "Test Gateway Connection" button in its own setup page that calls this endpoint and shows latency
- The sync pre-flight is where the bidirectional check belongs
- Document clearly: "gateway pre-flight validates server-side; sync side must run its own connection test"

**Detection:** Gateway health check passes; sync shows "ECONNREFUSED" on first sync attempt.

**Phase:** Pre-flight check design, sync-side setup page

---

#### PF-03: Pre-Flight Validates Tables That May Not Exist Yet

**What goes wrong:** Pre-flight includes a table existence check (already in the current setup wizard). It queries `pg_tables` for the 4 required tables. If migrations haven't been run yet, this fails and blocks setup completion. Users who set up a fresh PostgreSQL instance cannot proceed.

**Why it happens:** The check was designed for an already-migrated database. The v1.2 wizard may attract new users setting up from scratch.

**Consequences:** User sets up PostgreSQL, runs wizard, gets "missing tables" error. Has no idea what migrations to run or how. Setup abandonment.

**Prevention:**
- When table check fails, the wizard must show actionable next steps:
  - Show the exact `docker exec` command to run Prisma migrations: `docker exec sync-gateway npx prisma migrate deploy`
  - Or add a "Run Migrations Now" button that triggers `prisma migrate deploy` from within the wizard API (with a warning and confirmation)
- The pre-flight check result for missing tables should be "WARNING: action required" not "FAIL: blocked"
- Document the database setup as a prerequisite in the wizard step description

**Detection:** "Missing tables" error on fresh PostgreSQL install.

**Phase:** Pre-flight table validation UX

---

#### PF-04: Pre-Flight Success Does Not Account for Container Memory Limits

**What goes wrong:** The docker-compose.yml sets `mem_limit: 512m`. During heavy sync operations, the gateway may hit this limit and be OOM-killed, then restarted. The pre-flight checker has no visibility into memory pressure. After a "successful" setup, the first large sync (100K+ records) kills the container.

**Why it happens:** Memory limits are a deployment concern, not an application concern. Pre-flight typically checks connectivity and config, not resource headroom.

**Consequences:** Setup passes. First real sync triggers OOM restart. Sync gets 502 from Traefik mid-operation. Confusing error.

**Prevention:**
- Add a lightweight memory check to pre-flight: read `/proc/meminfo` (Linux inside container) and warn if available < 200MB
- The pre-flight should be a soft warning, not a blocker: "Container has 512MB limit. Large syncs (>50K records) may cause OOM. Consider increasing mem_limit."
- Add `mem_limit` to the generated docker-compose.yml with a comment explaining the tradeoff
- This is a LOW priority check — include only if pre-flight is comprehensive

**Detection:** Container OOM events visible in `docker stats` and `docker logs`.

**Phase:** Pre-flight check (optional enhancement)

---

### Part D: Integration Pitfalls (Connecting the Features Together)

---

#### INT-01: Setup Wizard Rewrites JWT Secret Without Invalidating Existing Sync Session

**What goes wrong:** The setup wizard allows changing the JWT secret. The sync Windows service is currently running with a valid token signed by the OLD secret. After the wizard rotates the secret and the gateway restarts, the sync's cached token is invalid. The sync does not know to re-authenticate. Sync retries with 401s until the auth manager's next scheduled refresh.

**Why it happens:** JWT secret rotation is a gateway-only event. The sync has no notification mechanism. The AuthManager only refreshes the token proactively when it's near expiration, not when the server's secret changes.

**Consequences:** Up to 24 hours of broken sync if JWT_EXPIRES_IN is set to 86400. AuthManager will retry login on 401, so it eventually self-heals, but only if the `login()` fallback path is triggered. Existing v1.1-rc2 auth code does handle 401 → re-login, but only during batch send, not during idle periods.

**Prevention:**
- The wizard's JWT secret rotation step must show a clear warning: "Changing the JWT secret will require sync to re-authenticate. This happens automatically on the next sync attempt."
- The AuthManager already handles 401 → login() fallback — document this as the recovery path
- Consider adding a `/api/auth/invalidate-all` endpoint that forces all token holders to re-login (useful for emergency rotation)
- Do NOT silently rotate the secret; require explicit user confirmation

**Detection:** After secret rotation, sync logs show `TOKEN_INVALID` errors followed by `Login exitoso` (automatic recovery).

**Phase:** Setup wizard JWT secret step, auth integration

---

#### INT-02: Pairing Code Does Not Survive the "Generate .env, Restart, Claim" Cycle

**What goes wrong:** The intended flow is: (1) gateway generates pairing code, (2) user enters code in sync, (3) sync claims code from gateway and receives JWT secret, (4) sync saves JWT secret to its own .env, (5) gateway has already written JWT secret to its .env, (6) gateway restarts to pick up the new env. But in step 6, after the restart, the pairing claim endpoint may have already processed the claim and the pairing token is consumed. If sync didn't complete step 4 before the restart, it retries step 3 and gets "token not found."

**Why it happens:** The pairing is a two-phase operation: gateway writes config + restarts, sync claims. The restart breaks the in-memory token (see PC-02). The timing between write-then-restart and claim is a race condition.

**Consequences:** Pairing fails at the last step. User sees "pairing code expired or not found" after a successful gateway restart. Must start over.

**Prevention:**
- Decouple the "claim" from the "restart": the claim should succeed and return the JWT secret BEFORE the gateway restarts
- Flow: sync claims → gateway responds with JWT secret → sync saves to its .env → THEN user triggers gateway restart (manual step, not automatic)
- Do NOT auto-restart the gateway as part of pairing; make restart an explicit separate step in the wizard
- Persist the claim result to disk (see PC-02) so the token survives restart in case of retry

**Phase:** Pairing flow design

---

#### INT-03: Sync Windows Service vs npm start — Different .env Loading Behaviors

**What goes wrong:** The sync runs on Windows. In development, it uses `npm start`. In production deployment as a Windows service, the working directory and environment loading may differ. The dotenv library loads `.env` from `process.cwd()` which for a Windows service may be `C:\Windows\System32` or the service binary location, not the project directory.

**Why it happens:** Windows services run with the SYSTEM account in a different working directory. `dotenv` uses `process.cwd()` by default.

**Consequences:** Sync Windows service starts but cannot find its .env. All env vars are undefined. Gateway URL, JWT secret, credentials — all missing. Silent failures.

**Prevention:**
- Pass `--env-file` path explicitly when starting: `node --env-file=C:\projects\objetiva-sync\.env dist/index.js` (Node 20+ built-in support)
- Or in the dotenv call: `dotenv.config({ path: path.join(import.meta.dirname, '..', '.env') })`
- Add a startup validation that checks all required env vars are loaded and logs each one's presence (not value) at startup
- Document the Windows service installation with the explicit env file path requirement

**Detection:** Sync service starts (process is running) but all connections fail with "undefined" in error messages (baseUrl: undefined).

**Phase:** Sync-side setup and Windows service deployment

---

#### INT-04: Traefik Routes Gateway Before .env Configuration Is Complete

**What goes wrong:** The gateway starts in Docker with Traefik labels. Traefik immediately begins routing public traffic to `sync-gateway.sanchezrepuestos.com.ar`. The `/setup` endpoint is unauthenticated and reachable from the internet. Anyone who discovers the domain before setup is complete can access the setup wizard.

**Why it happens:** The gateway serves `/setup` with no authentication by design (pre-configuration access). Traefik routes all traffic once the container is healthy. The health check passes (Fastify starts up fine) even before setup is complete.

**Consequences:** Security exposure window between deployment and setup completion. An attacker who discovers the gateway URL during this window can configure their own JWT secret, effectively owning the gateway.

**Prevention:**
- Add a setup token: generate a random one-time token at first startup (written to logs only), require it to access `/setup` on the first visit
- Or: restrict `/setup` to Tailscale IP ranges only (add Traefik middleware for IP whitelist)
- Or: make the setup UI require a "setup password" derived from the hostname or a pre-shared secret
- Simplest viable: log `SETUP TOKEN: [token]` on first startup, require it in the setup form — this token is visible only in the container logs (operator must have server access)
- Document the exposure window in deployment instructions

**Detection:** `/setup` endpoint reachable via public domain with no authentication required.

**Phase:** Setup wizard security model, deployment guide

---

#### INT-05: Pre-Flight Incorrectly Reports Success When JWT_SECRET Still Has Default Value

**What goes wrong:** The existing status endpoint already checks for the default JWT_SECRET value (`change-this-secret-in-production...`). But the pre-flight checker may not include this validation. If a user skips the JWT configuration step, the pre-flight still shows green for connectivity checks, and setup appears complete with the default (insecure) secret.

**Why it happens:** Pre-flight checks connectivity (database, tables, network). It may not check configuration values for semantic correctness beyond "is the variable set?"

**Consequences:** Gateway runs with the default JWT secret. Any sync instance that also uses the default secret will successfully authenticate. This is a security regression, not a functional failure — it works but is insecure.

**Prevention:**
- Pre-flight MUST include configuration checks as first-class checks:
  - `JWT_SECRET` is not the default value AND is at least 32 characters
  - `SYNC_PASSWORD` is not `change-me`
  - `DATABASE_URL` is not the placeholder value
- These should be BLOCKING checks (not warnings) — pre-flight must not show "all good" with placeholder values

**Detection:** `docker exec sync-gateway env | grep JWT_SECRET` shows the default value.

**Phase:** Pre-flight check implementation

---

### Part E: Cross-Cutting Pitfalls

---

#### XC-01: No Rollback Path If Setup Wizard Corrupts .env

**What goes wrong:** The setup wizard writes multiple values to .env in sequence. If a write fails midway (disk full, permissions error), or if the user closes the browser window mid-wizard, the .env may be in a partially updated state — e.g., JWT_SECRET changed but DATABASE_URL not yet updated.

**Why it happens:** Each setup step writes independently. There is no transactional .env update.

**Consequences:** Container is in an inconsistent configuration state. The original .env (from deployment) and the wizard-modified .env are both partially valid. Hard to diagnose without reading the file directly.

**Prevention:**
- Implement a "generate complete .env" approach: collect ALL settings in the wizard, then write the entire .env in a single operation at the end (not one variable at a time per step)
- Keep a `.env.backup` before any write operation: `fs.copyFile('.env', '.env.backup')` before `fs.writeFile('.env', ...)`
- Show users the generated .env content before writing (preview step), and allow them to download/copy it manually as a fallback

**Detection:** Check `.env.backup` existence; compare with current `.env`.

**Phase:** Setup wizard architecture design

---

#### XC-02: Setup Wizard Breaks Existing Authenticated Sessions Mid-Reconfiguration

**What goes wrong:** The setup wizard is currently unauthenticated (intended for initial setup). But if used for reconfiguration, an existing sync session is actively running while the wizard changes the password. The running sync session's next login attempt uses the old password. The change-password flow in auth.ts already requires authentication, so this is more of a wizard UX issue than a code bug.

**Why it happens:** The wizard was designed for first-time setup, not for reconfiguration of a live system. The distinction between initial setup and reconfiguration is not enforced.

**Consequences:** Sync operator uses the wizard to change password. Sync is mid-operation. The next token refresh or login fails silently. Sync stops working. Operator doesn't realize the wizard changed the password.

**Prevention:**
- If `GATEWAY_PAIRED=true` (already paired), show the wizard in "reconfiguration" mode with prominent warnings: "Changing credentials will interrupt active sync operations"
- Require an explicit "I understand" confirmation for credential changes on already-paired systems
- Do not expose the password change flow in the initial setup wizard at all — make it a separate "settings" page

**Detection:** Sync stops after wizard use; logs show auth failures.

**Phase:** Setup wizard UX design (reconfiguration vs. initial setup distinction)

---

#### XC-03: Plain Text Password Stored in .env Is Visible to Anyone with File Access

**What goes wrong:** `SYNC_PASSWORD` is stored plain text in the gateway .env. The .env file is mounted into the Docker container via `env_file: .env`. On the VPS, anyone with SSH access to the host user can `cat /path/to/objetiva-sync-gateway/.env` and see the password. This also means the .env backup (XC-01) contains the plain text password.

**Why it happens:** The design decision was to use plain text for simplicity (noted as a known limitation in PROJECT.md). The timing-safe comparison in auth.ts uses `crypto.timingSafeEqual` on the plain text value.

**Consequences:** Credential exposure to anyone with VPS filesystem access. The password also travels in HTTP request bodies (over Tailscale, which is encrypted at the network level) but logged in plain text if log level is debug.

**Prevention for v1.2:**
- This is a known design decision from v1.1-rc2, accepted as "simplicity over security for internal tool"
- Minimum mitigation: ensure the .env file has restrictive permissions (`chmod 600 .env`)
- If upgrading to bcrypt in v1.2, the setup wizard's set-password API must hash before storing
- Do not regress: if the pairing flow generates a new password, make sure it stores hashed not plain text
- Add a comment in the .env.example documenting the plain text limitation and planned bcrypt migration path

**Detection:** `stat -c %a /path/to/.env` — should return 600, not 644.

**Phase:** Setup wizard (document known limitation, implement permission enforcement)

---

## SUMMARY TABLE: v1.2 Pitfalls

| ID | Pitfall | Severity | Phase | Quick Prevention |
|----|---------|----------|-------|------------------|
| PC-01 | Pairing code brute-forceable | HIGH | Pairing impl | Rate limit to 5 attempts/min |
| PC-02 | Pairing code lost on restart | HIGH | Pairing impl | Persist to file or .env |
| PC-03 | Pairing endpoint left open | HIGH | Pairing impl | GATEWAY_PAIRED flag |
| PC-04 | JWT secret logged | MEDIUM | Pairing impl | Redact claim response from logs |
| ENV-01 | Concurrent .env writes corrupt | HIGH | Setup wizard | Async mutex + atomic rename |
| ENV-02 | .env write visible only after restart | HIGH | All .env writes | requiresRestart in every response |
| ENV-03 | docker restart vs docker up --force-recreate | HIGH | Setup wizard UX | Show exact correct command |
| ENV-04 | Special chars break regex replace | HIGH | .env writer | Escape $ in replacement |
| ENV-05 | Wrong .env path if CWD differs | MEDIUM | .env writer | Absolute path from module |
| PF-01 | Pre-flight tests current not pending config | HIGH | Pre-flight impl | Pending config validation mode |
| PF-02 | Pre-flight not bidirectional | MEDIUM | Pre-flight design | Sync-side connection test |
| PF-03 | Pre-flight blocks on missing tables | MEDIUM | Pre-flight UX | Show migration command |
| PF-04 | No memory limit check | LOW | Pre-flight (optional) | /proc/meminfo check |
| INT-01 | JWT rotation breaks running sync | MEDIUM | Wizard JWT step | Warn before rotation |
| INT-02 | Pairing race with restart | HIGH | Pairing flow design | Claim before restart |
| INT-03 | Windows service CWD issue | MEDIUM | Sync deployment | Explicit --env-file path |
| INT-04 | Setup exposed via Traefik before config | HIGH | Security model | Setup token or IP restriction |
| INT-05 | Pre-flight passes with default secret | HIGH | Pre-flight impl | Check for placeholder values |
| XC-01 | No .env rollback path | MEDIUM | Wizard architecture | Backup + single-write strategy |
| XC-02 | Wizard breaks live sessions | MEDIUM | Wizard UX design | Reconfiguration mode with warnings |
| XC-03 | Plain text password in .env | MEDIUM | Known limitation | 600 permissions, document |

---

## PHASE-SPECIFIC WARNINGS

| Phase Topic | Likely Pitfall | Mitigation |
|-------------|---------------|------------|
| Pairing code generation | PC-02, INT-02 | Persist token; decouple claim from restart |
| Pairing code claim | PC-01, PC-03 | Rate limit; paired flag |
| Setup wizard .env writing | ENV-01, ENV-04 | Mutex + $ escaping in safeEnvReplace() |
| Setup wizard UX | ENV-02, ENV-03 | Explicit restart command, requiresRestart flag |
| Pre-flight implementation | PF-01, INT-05 | Two modes (current + pending); check placeholders |
| Gateway deployment | INT-04 | Setup token for public exposure window |
| Windows sync deployment | INT-03 | Document explicit --env-file path |
| JWT secret configuration | INT-01 | Warn before rotation; auto-heal documented |

---

## SOURCES

- Docker Compose docs: [`docker compose restart` does not re-read `env_file`](https://docs.docker.com/reference/cli/docker/compose/restart/)
- Docker Compose docs: [`docker compose up --force-recreate` for env_file changes](https://docs.docker.com/reference/cli/docker/compose/up/)
- Docker Community Forums: [Updating ENV variables without losing data](https://forums.docker.com/t/how-to-update-environment-variables-on-running-container-without-losing-data/138995)
- GitHub Issue: [Add ability to reload env_file for a specific container](https://github.com/docker/compose/issues/4140) — closed WONTFIX; confirmed restart does not re-read env_file
- Rate limiting for brute force: [How to Handle Rate Limiting and Brute-Force Attacks in Node.js APIs](https://www.ionicframeworks.com/2025/09/how-to-handle-rate-limiting-and-brute.html)
- JWT token pitfalls: [JWT Token Lifecycle Management](https://skycloak.io/blog/jwt-token-lifecycle-management-expiration-refresh-revocation-strategies/)
- Tailscale HTTP security: [Tailscale serve HTTP vs HTTPS issue](https://github.com/tailscale/tailscale/issues/18381)
- Setup endpoint security: [Unauthenticated endpoint exposure patterns](https://www.secpod.com/blog/cve-2025-61884-unauthenticated-data-exposure-in-oracle-e-business-suite/)
- Codebase analysis: `objetiva-sync-gateway/src/routes/setup.ts` — existing .env write pattern
- Codebase analysis: `objetiva-sync-gateway/src/routes/auth.ts` — existing regex replace on .env (ENV-04 exposure confirmed at line 271)
- Codebase analysis: `objetiva-sync-gateway/docker-compose.yml` — `restart: unless-stopped` confirms PC-02 scenario
- Node.js dotenv: [dotenv does not update running process.env](https://github.com/motdotla/dotenv) — confirmed ENV-02

---

## PRESERVED: v1.1-rc2 Pitfall Index

The following pitfall IDs from v1.1-rc2 remain relevant to the broader project and are archived for reference. Full text in the v1.1-rc2 PITFALLS document.

| ID | Pitfall | Still Relevant In v1.2? |
|----|---------|------------------------|
| AS-01 | Removing security while simplifying | YES — pairing must not weaken JWT |
| AS-04 | Setup complexity from hash generation | YES — plain text password is the existing workaround |
| AS-05 | JWT secret mismatch | YES — core pairing problem this feature solves |
| CC-01 | Breaking existing tests | YES — all phases |
| CC-05 | Documentation lags implementation | YES — wizard instructions must be accurate |

---

**Document Version**: 3.0 (v1.2 Setup & Pairing)
**Last Updated**: 2026-03-04
**Research Type**: Project Research — Pitfalls Dimension (v1.2 features)
**Confidence**: HIGH for ENV-01 through ENV-05 (codebase-confirmed); HIGH for INT-02, INT-04; MEDIUM for PC-01 through PC-04 (ecosystem-verified patterns)
