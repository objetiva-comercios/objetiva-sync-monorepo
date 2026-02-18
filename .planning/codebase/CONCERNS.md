# Codebase Concerns

**Analysis Date:** 2026-01-26

## Tech Debt

**Duplicated `entityTypeToTableName()` Function:**
- Issue: La función `entityTypeToTableName()` está duplicada en dos archivos con lógica idéntica
- Files:
  - `C:/Users/sistemas/.proyectos/objetiva-sync-monorepo/objetiva-sync/src/sync/sync-engine.ts` (línea 107)
  - `C:/Users/sistemas/.proyectos/objetiva-sync-monorepo/objetiva-sync/src/dashboard/routes/api/queries.ts` (línea 311)
- Impact: Violación de DRY. Si se agrega una nueva entidad, hay que actualizar ambos archivos. Riesgo de inconsistencia.
- Fix approach:
  1. Crear archivo `objetiva-sync/src/utils/entity-mapping.ts`
  2. Mover la función a ese archivo con exports
  3. Actualizar ambos importadores para usar el módulo compartido
  4. Agregar tests unitarios para el mapeo
- Priority: Medium - funciona pero viola principios de diseño

**Unimplemented Scheduler Restart in Query Configuration:**
- Issue: Scheduler restart is commented out and TODO when query scheduling is toggled
- Files: `C:/Users/sistemas/.proyectos/objetiva-sync-monorepo/objetiva-sync/src/dashboard/routes/api/queries.ts` (line 669)
- Impact: Changes to query scheduling don't take effect until manual server restart. Users may disable/enable queries without realizing the change isn't active.
- Fix approach: Implement `restartScheduler()` function that properly reinitializes the scheduler with updated query configuration. Add integration tests to verify scheduling changes apply immediately.

**Hardcoded Default Credentials in .env File:**
- Issue: .env file checked into repository contains default admin password "cambiar123" and pre-generated security keys
- Files: `C:/Users/sistemas/.proyectos/objetiva-sync-monorepo/objetiva-sync/.env`, `C:/Users/sistemas/.proyectos/objetiva-sync-monorepo/objetiva-sync-gateway/.env`
- Impact: Security risk if .env is ever exposed. Keys are not truly random on first run.
- Fix approach: Use .env.example only for documentation. Ensure .env is in .gitignore. Generate fresh secrets on first deployment, not during development.

**Encryption and Session Keys Generated at Startup:**
- Issue: ENCRYPTION_KEY and SESSION_SECRET are auto-generated at startup if missing and written to .env file
- Files: `C:/Users/sistemas/.proyectos/objetiva-sync-monorepo/objetiva-sync/src/config/env.ts` (lines 92-109)
- Impact: While generating secure keys is good, writing them to .env can cause file conflicts in git. Different instances may generate different keys.
- Fix approach: Use environment variables exclusively. Provide documentation for production deployments to set keys before startup. Implement validation that keys were provided externally.

**Missing Secrets in Repository:**
- Issue: .env files present in git with sensitive data (encryption keys, session secrets, database paths)
- Files: `.env` files in both `objetiva-sync` and `objetiva-sync-gateway` directories
- Impact: Credentials and keys are visible in git history, compromising security even if removed later
- Fix approach: Remove .env files from git immediately. Use .env.example files only. Document required environment variables in README.

## Known Issues

**TODO Comment for Unimplemented Feature:**
- Location: `C:/Users/sistemas/.proyectos/objetiva-sync-monorepo/objetiva-sync/src/dashboard/routes/api/queries.ts` line 669
- Description: Scheduler restart not implemented when query scheduling configuration changes
- Workaround: Manual server restart applies scheduling changes
- Risk: Medium - affects UX but not data integrity

## Security Considerations

**Weak Default Admin Password:**
- Risk: Default password "cambiar123" in .env is weak and documented
- Files: `C:/Users/sistemas/.proyectos/objetiva-sync-monorepo/objetiva-sync/.env` line 15
- Current mitigation: Auth service requires password change on first login (FIRST_LOGIN_REQUIRED flag)
- Recommendations:
  - Generate random strong password on first deployment
  - Force password change on first login without exception
  - Add password strength validation (minimum 12 chars, mix of types)
  - Log failed login attempts for audit trail

**Credentials in Database Connections:**
- Risk: SQL Server and Gateway credentials are stored in database and encrypted with ENCRYPTION_KEY
- Files: `C:/Users/sistemas/.proyectos/objetiva-sync-monorepo/objetiva-sync/src/adapters/sqlserver/sqlserver-adapter.ts`, `C:/Users/sistemas/.proyectos/objetiva-sync-monorepo/objetiva-sync/src/store/repositories/connection-config-repo.ts`
- Current mitigation: Passwords encrypted with bcrypt/AES before storage
- Recommendations:
  - Add audit logging for credential access
  - Implement credential rotation mechanism
  - Add field-level encryption in database schema

**Default Session Secret Generation:**
- Risk: SESSION_SECRET auto-generated if missing, may be predictable across instances
- Files: `C:/Users/sistemas/.proyectos/objetiva-sync-monorepo/objetiva-sync/src/config/env.ts` (lines 103-109)
- Current mitigation: Uses `crypto.randomBytes()`
- Recommendations:
  - Use a cryptographically secure PRNG consistently
  - Document that this should be explicitly set in production
  - Add warning if auto-generated in production environment

**No Input Validation on Dashboard API Routes:**
- Risk: Dashboard API endpoints accept user input without comprehensive validation
- Files: `C:/Users/sistemas/.proyectos/objetiva-sync-monorepo/objetiva-sync/src/dashboard/routes/api/*.ts`
- Current mitigation: Partial validation in some endpoints, Zod schema validation for env
- Recommendations:
  - Add comprehensive Zod schemas for all API request bodies
  - Validate and sanitize all query parameters
  - Implement rate limiting on authentication endpoints
  - Add CSRF protection for state-changing operations

**SQL Injection Risk in Query Builder:**
- Risk: Dynamic SQL queries from user-defined queries could be vulnerable
- Files: `C:/Users/sistemas/.proyectos/objetiva-sync-monorepo/objetiva-sync/src/sync/query-validator.ts`
- Current mitigation: Uses parameterized queries via mssql driver
- Recommendations:
  - Add SQL injection detection/prevention layer
  - Whitelist allowed SQL functions
  - Log all executed queries for audit
  - Implement query preview before execution

**No HTTPS Enforcement:**
- Risk: Dashboard and API communicate over potentially unencrypted connections
- Files: All Fastify server configuration in `C:/Users/sistemas/.proyectos/objetiva-sync-monorepo/objetiva-sync/src/index.ts`
- Current mitigation: None detected
- Recommendations:
  - Enforce HTTPS in production
  - Use HSTS headers
  - Implement reverse proxy with SSL/TLS termination
  - Add secure cookie flags (HttpOnly, Secure, SameSite)

## Performance Bottlenecks

**Large Log File Operations Without Pagination:**
- Problem: `deleteAllLogs()` loads entire sync_logs table into memory before deletion
- Files: `C:/Users/sistemas/.proyectos/objetiva-sync-monorepo/objetiva-sync/src/store/repositories/sync-logs-repo.ts` (line 343)
- Cause: `db.select().from(syncLogs)` fetches all records to count them, then deletes all
- Current capacity: SQLite can handle millions of rows but memory usage grows linearly
- Improvement path: Use direct SQL DELETE without SELECT, count via COUNT(*) query, implement pagination for large deletions

**Inefficient Log Retrieval by Status:**
- Problem: `countByStatus()` fetches ALL logs then counts in memory
- Files: `C:/Users/sistemas/.proyectos/objetiva-sync-monorepo/objetiva-sync/src/store/repositories/sync-logs-repo.ts` (line 362)
- Cause: Using `.length` property on result array instead of SQL COUNT
- Impact: O(n) memory/time instead of O(1)
- Improvement path: Implement SQL-level COUNT aggregation with WHERE clauses

**Missing Database Indexes:**
- Problem: Frequent queries on status, timestamp, entity type fields have no indexes
- Files: `C:/Users/sistemas/.proyectos/objetiva-sync-monorepo/objetiva-sync/src/store/schema.ts`
- Current capacity: Works fine until logs table exceeds 100k+ rows
- Scaling path: Add indexes on commonly filtered columns (status, createdAt, entityType, syncType)

**Batch Processing Without Rate Limiting:**
- Problem: `processBatches()` can send batches as fast as possible to remote API
- Files: `C:/Users/sistemas/.proyectos/objetiva-sync-monorepo/objetiva-sync/src/sync/batch-processor.ts`
- Current capacity: May overwhelm external API or network
- Improvement path: Leverage existing `delayBetweenBatches` option, add adaptive backoff based on response times

**Synchronous Database Operations in Handlers:**
- Problem: Better-sqlite3 uses synchronous operations which block event loop
- Files: All repository files in `C:/Users/sistemas/.proyectos/objetiva-sync-monorepo/objetiva-sync/src/store/repositories/`
- Current capacity: Fine for small datasets, becomes bottleneck with large datasets or concurrent requests
- Scaling path: Consider migration to async SQLite driver or worker threads for heavy operations

## Fragile Areas

**SyncEngine Coordination Complexity:**
- Files: `C:/Users/sistemas/.proyectos/objetiva-sync-monorepo/objetiva-sync/src/sync/sync-engine.ts` (1208 lines)
- Why fragile: Manages multiple adapters, API clients, retry queues, state managers, and batch processors. Single point of failure for entire sync pipeline.
- Safe modification: Add comprehensive logging at each stage, implement circuit breaker pattern for adapter failures, add dry-run mode for testing changes
- Test coverage: Only metadata sync tests exist, query-based sync integration test exists but limited

**Scheduler-SyncQueue Integration:**
- Files: `C:/Users/sistemas/.proyectos/objetiva-sync-monorepo/objetiva-sync/src/sync/scheduler.ts`, `C:/Users/sistemas/.proyectos/objetiva-sync-monorepo/objetiva-sync/src/sync/sync-queue.ts`
- Why fragile: Scheduler triggers sync operations but changes to scheduling don't restart scheduler. Multiple timers could queue duplicate work.
- Safe modification: Add explicit scheduler stop/start methods, implement exclusive lock on schedule updates, add queue deduplication
- Test coverage: Scheduler has no unit tests

**Database Connection Pooling:**
- Files: `C:/Users/sistemas/.proyectos/objetiva-sync-monorepo/objetiva-sync/src/adapters/sqlserver/sqlserver-adapter.ts` (lines 100-150)
- Why fragile: Connection pool created per adapter instance, no resource limits, could exhaust system connections
- Safe modification: Implement singleton pattern for connection pools, add max connection limits, add connection health checks
- Test coverage: No specific tests for connection pool behavior

**Retry Queue Without Deadletter Queue:**
- Files: `C:/Users/sistemas/.proyectos/objetiva-sync-monorepo/objetiva-sync/src/sync/retry-queue-manager.ts`
- Why fragile: Items that exceed max attempts are removed without being archived, data loss potential
- Safe modification: Implement deadletter queue table, add archival before deletion, implement manual replay mechanism
- Test coverage: No tests for exhausted retry scenarios

**API Client Token Management:**
- Files: `C:/Users/sistemas/.proyectos/objetiva-sync-monorepo/objetiva-sync/src/api-client/auth.ts` (lines 105-120)
- Why fragile: Manual `isRefreshing` flag could get stuck if refresh throws error during concurrent requests
- Safe modification: Use Promise-based locking or async queue library, add timeout for refresh operations, add fallback to re-login
- Test coverage: Token refresh tested but concurrent refresh edge cases untested

## Scaling Limits

**SQLite Single-File Database:**
- Current capacity: ~100MB-1GB for logs before performance degrades
- Limit: SQLite has WAL mode write limit of ~1GB for safety
- Problem: No automatic cleanup of old logs, retention policy not enforced
- Scaling path: Implement log rotation/archival, add configurable retention periods, migrate to PostgreSQL for multi-instance deployments

**In-Memory State Management:**
- Current capacity: Single SyncStateManager holds state for entire application
- Limit: No persistence across restarts, no coordination across multiple instances
- Scaling path: Persist state to database, implement distributed state management for multiple sync nodes

**Hardcoded Retry Limits:**
- Current capacity: Default max 3 retries per batch, no exponential backoff with ceiling
- Limit: Fixed retry count doesn't adapt to transient vs permanent failures
- Scaling path: Implement smart retry classification, add circuit breaker per destination, add exponential backoff with jitter

**Single Scheduler Instance:**
- Current capacity: node-cron can handle 50-100 concurrent jobs
- Limit: No job queue distribution, single point of failure
- Scaling path: Implement job distribution to worker processes, add Redis-backed scheduler for distributed deployments

## Fragile Dependencies at Risk

**mssql Driver Version:**
- Risk: Using mssql 11.0.1, no active maintenance timeline tracked
- Impact: New SQL Server features not supported, security patches may lag
- Migration plan: Monitor for EOL, prepare upgrade path to newer major versions

**better-sqlite3 Native Binding:**
- Risk: Native addon dependency, may have platform compatibility issues
- Impact: Installation failures on unusual platforms, binary compatibility across Node versions
- Mitigation: Pre-built binaries provided by npm, test on target platforms before deployment

**Fastify Middleware Ecosystem:**
- Risk: Multiple plugin versions (@fastify/cookie 10.0.1, @fastify/session 11.0.1, @fastify/static 8.0.2)
- Impact: Security vulnerabilities in dependencies, API changes in minor versions
- Monitoring: Regular npm audit, automated dependency updates with testing

## Test Coverage Gaps

**Missing Unit Tests for Core Sync Operations:**
- What's not tested: Individual adapter methods, error handling in batch processor, retry logic
- Files: `C:/Users/sistemas/.proyectos/objetiva-sync-monorepo/objetiva-sync/src/adapters/`, `C:/Users/sistemas/.proyectos/objetiva-sync-monorepo/objetiva-sync/src/sync/batch-processor.ts`, `C:/Users/sistemas/.proyectos/objetiva-sync-monorepo/objetiva-sync/src/sync/retry-queue-manager.ts`
- Test coverage: 4 test files for 66 source files (~6% coverage)
- Risk: Medium - critical path untested, regressions undetected
- Priority: High - add unit tests for batch processing, retry logic, and adapter connection management

**Missing Tests for Dashboard API Routes:**
- What's not tested: All dashboard endpoints in `C:/Users/sistemas/.proyectos/objetiva-sync-monorepo/objetiva-sync/src/dashboard/routes/api/`
- Files: `queries.ts`, `sync.ts`, `connections.ts`, `config.ts`, `logs.ts`, `retry-queue.ts`, `schema-info.ts`
- Test coverage: 0% of dashboard code tested
- Risk: High - users can misconfigure system without validation
- Priority: High - add endpoint tests with authentication, validation, error cases

**Missing Tests for Authentication Flow:**
- What's not tested: Login, password change, admin user creation, session management
- Files: `C:/Users/sistemas/.proyectos/objetiva-sync-monorepo/objetiva-sync/src/services/auth-service.ts`, `C:/Users/sistemas/.proyectos/objetiva-sync-monorepo/objetiva-sync/src/dashboard/routes/auth.ts`
- Risk: Medium - security-critical path untested
- Priority: High - add tests for valid/invalid credentials, password policies, session expiration

**Missing Tests for Database Operations:**
- What's not tested: Connection failures, transaction rollbacks, concurrent writes
- Files: All repository files in `C:/Users/sistemas/.proyectos/objetiva-sync-monorepo/objetiva-sync/src/store/repositories/`
- Risk: Medium - data corruption scenarios untested
- Priority: Medium - add repository tests with mocked database

**Missing Error Path Testing:**
- What's not tested: Network failures, timeout handling, partial batch failures, malformed responses
- Coverage: Error cases exist but not tested systematically
- Risk: High - production errors unknown until they occur
- Priority: High - add error scenario tests, timeout tests, network fault injection tests

**Missing Performance/Load Tests:**
- What's not tested: Behavior with large datasets (10k+ records), concurrent sync operations, database under load
- Risk: High - scaling limits unknown
- Priority: Medium - add load tests with realistic data volumes

---

*Concerns audit: 2026-01-26*
