# Coding Conventions

**Analysis Date:** 2026-01-26

## Naming Patterns

**Files:**
- kebab-case for filenames: `config-repo.ts`, `batch-processor.ts`, `sync-engine.ts`
- Type definition files: `types.ts`, `common.ts` for shared types
- Adapter files follow pattern: `[source]-adapter.ts` (e.g., `sqlserver-adapter.ts`)
- API client files: `[entity]-client.ts` (e.g., `articulos-client.ts`, `comprobantes-cabecera-client.ts`)
- Repository files: `[entity]-repo.ts` (e.g., `config-repo.ts`, `queries-repo.ts`)
- Service files: `[service]-service.ts` (e.g., `auth-service.ts`)
- Test files: `*.test.ts` or `*.spec.ts` (same name as source, in `__tests__` or `tests/` directory)

**Functions:**
- camelCase for all function names: `createTestDb()`, `initDatabase()`, `applyMappings()`
- Private methods use prefix underscore: `_isConnected`, `_checkToken()`
- Factory/builder functions: `createLogger()`, `createModuleLogger()`
- Async functions use standard naming (no async prefix): `login()`, `executeQuery()`
- Helper functions use descriptive verbs: `parseDate()`, `sanitizeSQL()`, `truncate()`

**Variables:**
- camelCase for all variable names: `accessToken`, `tokenExpiresAt`, `mockAuthManager`
- Constants are UPPER_SNAKE_CASE: `REFRESH_MARGIN_MS`, `LOG_LEVEL`
- Private instance variables: `private field: Type`
- Unused parameters: prefix with underscore `_param` (ESLint rule: `argsIgnorePattern: '^_'`)
- Unused variables: prefix with underscore `_unused` (ESLint rule: `varsIgnorePattern: '^_'`)
- Boolean variables use `is/has/should` prefix: `isConnected`, `isRefreshing`, `hasValidToken()`

**Types:**
- PascalCase for interfaces: `AuthManager`, `BatchResult`, `IQueryResult`, `IConnectionConfig`
- Interfaces with data contracts prefixed with `I`: `IArticuloPayload`, `IComprobanteCabeceraPayload`
- Type aliases: PascalCase for complex types, lowercase for primitives: `type BatchProcessorFn<T>`
- Enum values: PascalCase: `EntityType.ARTICULO`, `LogStatus.SUCCESS`
- Generic type parameters: Single uppercase letters or descriptive: `<T>`, `<TResult>`

## Code Style

**Formatting:**
- Tool: Prettier (v3.4.2)
- File: `.prettierrc` in `C:/Users/sistemas/.proyectos/objetiva-sync-monorepo/objetiva-sync/.prettierrc`
- Line width: 100 characters (`printWidth: 100`)
- Tab width: 2 spaces (`tabWidth: 2`)
- No tabs (`useTabs: false`)
- Semicolons required (`semi: true`)
- Single quotes (`singleQuote: true`)
- Trailing commas in ES5 (`trailingComma: 'es5'`)
- Arrow function parentheses: always required (`arrowParens: 'always'`)
- Line endings: LF (`endOfLine: 'lf'`)

**Linting:**
- Tool: ESLint (v9.17.0) with TypeScript support
- Config file: `C:/Users/sistemas/.proyectos/objetiva-sync-monorepo/objetiva-sync/eslint.config.js`
- Base: JS recommended + TypeScript ESLint recommended rules

**Key Rules:**
```javascript
'@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }]
'@typescript-eslint/explicit-function-return-type': 'off'
'@typescript-eslint/no-explicit-any': 'warn'
'@typescript-eslint/no-non-null-assertion': 'warn'
'no-console': ['warn', { allow: ['warn', 'error'] }]  // console.log is warned
```

## Import Organization

**Order:**
1. External packages and node standard library: `import fs from 'fs'`, `import { fetch } from 'undici'`
2. Type imports: `import type { IQueryResult } from './types.js'`
3. Local modules: `import { logger } from '../utils/logger.js'`
4. Style and other imports

**Path Aliases:**
- `@/*`: resolves to `./src/*`
- Example: `import { logger } from '@/utils/logger.js'`
- Configured in `tsconfig.json`: `"@/*": ["./src/*"]`

**Module Extensions:**
- Always use `.js` extensions in import paths (even though source is `.ts`): `from './config/index.js'`
- This is required for ESM module resolution with TypeScript

## Error Handling

**Patterns:**
- Try-catch blocks with typed error checking: `if (error instanceof Error) { error.message }`
- Unknown error type handling: `const errorMessage = error instanceof Error ? error.message : String(error)`
- Never silently fail; always log errors using logger helpers
- Use logger.error() with context object: `logger.error({ error, context }, 'Message')`
- Error messages include context brackets: `[${this.type}] Error message`

**Error Propagation:**
```typescript
try {
  // operation
} catch (error) {
  logger.error(error, `[Context] Operation failed`);
  throw error;  // Always re-throw after logging
}
```

**Custom Errors:**
- Use standard Error class with message: `throw new Error('descriptive message')`
- Include context in error message: `throw new Error(\`No hay conexión activa. Ejecutar connect() primero.\`)`

## Logging

**Framework:** Pino (v9.5.0) with pino-pretty for development

**Patterns:**
- Import logger as singleton: `import { logger } from '@/utils/logger.js'`
- Create module-specific loggers: `const log = createModuleLogger('auth-service')`
- Log methods available: `logger.info()`, `logger.warn()`, `logger.error()`, `logger.debug()`

**Log Levels:**
- Test environment: `silent` (disabled unless `ENABLE_TEST_LOGS` env var set)
- Development: `pino-pretty` with colorize, readable timestamps, single line false
- Production: JSON logs to both stdout and file (path from `LOG_FILE` env var)

**Helper Functions:**
```typescript
// Operation tracking
logOperationStart('operationName', { detail: 'value' })
logOperationEnd(context, success, { recordsFetched: 100 })

// Sync-specific logging
syncLogger.start(entityType, syncType)
syncLogger.end(context, { success, recordsFetched, recordsFailed })
syncLogger.progress(entityType, message, { detail: 'value' })

// API-specific logging
apiLogger.request(method, url, { detail: 'value' })
apiLogger.response(method, url, statusCode, durationMs, { detail: 'value' })

// Database-specific logging
dbLogger.query(operation, tableName, { detail: 'value' })

// Development-only logging
devLog('Development message only', { data: 'object' })
```

**Log Data Format:**
- First parameter: object with structured data or plain message
- Second parameter: human-readable message with context
- Example: `logger.info({ entityType: 'ARTICULO', recordCount: 5 }, '[Sync] Processing 5 articles')`

## Comments

**When to Comment:**
- JSDoc comments for all exported functions and classes (see below)
- Comments for complex business logic or non-obvious algorithms
- Comments explaining "why" not "what" the code does
- Comments on TODO/FIXME for unfinished work (searchable with grep)

**JSDoc/TSDoc:**
- Required for all public functions and classes
- Format: `/** ... */` multi-line comments
- Example:
```typescript
/**
 * Obtiene un token válido (refresca si es necesario)
 * @returns {Promise<string>} Access token válido
 */
async getToken(): Promise<string> {
```

- Include parameter descriptions for complex types
- Include return type documentation
- Use Spanish in comments (this codebase is predominantly Spanish)

**Comment Example from Codebase:**
```typescript
/**
 * Refresca el access token usando el refresh token
 */
private async refreshAccessToken(): Promise<string> {
```

## Function Design

**Size:**
- Functions should be single responsibility
- Typical functions 20-100 lines
- Complex operations like `connect()` may reach 30-40 lines including logging/validation

**Parameters:**
- 1-3 parameters preferred
- Use object destructuring for multiple related params: `{ batchSize, continueOnError }`
- Use interfaces for complex options: `options: BatchProcessorOptions`
- Never use positional params for optional values (use options object)

**Return Values:**
- Explicit return types required on all non-arrow functions
- Arrow functions may infer return type: `const fn = (x: string) => x.length`
- Use union types for multiple return paths: `Promise<TestResult>`
- Return objects over multiple return values: `{ success: boolean; message?: string }`

**Async/Await:**
- Prefer async/await over .then() chains
- Always await Promises in try-catch blocks
- Use `Promise<Type>` return type annotations

## EntityType to TableName Mapping

**Convención Crítica:**
El sistema usa valores de `EntityType` en singular para identificación interna, pero PostgreSQL usa nombres de tabla en plural.

**Mapeo Requerido:**
```typescript
// EntityType (singular) → PostgreSQL Table Name (plural)
'articulo'             → 'articulos'
'comprobante_cabecera' → 'comprobantes_cabecera'
'comprobante_detalle'  → 'comprobantes_detalle'
'comprobante_pago'     → 'comprobantes_pagos'
```

**Implementación Actual:**
- Función `entityTypeToTableName()` en `sync-engine.ts` (línea 107)
- Función `entityTypeToTableName()` en `queries.ts` (línea 311) - **duplicada**

**Uso Obligatorio:**
Al comunicarse con el Gateway para operaciones de schema (validación, regeneración), **siempre** usar el nombre de tabla (plural), no el EntityType (singular).

```typescript
// ✅ CORRECTO - usar tableName
const validation = await validateQueryAgainstSchema(rows, entityTypeToTableName(entityType));

// ❌ INCORRECTO - NO usar entityType directamente
const validation = await validateQueryAgainstSchema(rows, entityType);
```

**Nota:** Este patrón fue identificado como causa de bug crítico donde la validación de queries fallaba silenciosamente porque el Gateway no encontraba el schema `articulo` (esperaba `articulos`).

---

## Module Design

**Exports:**
- Named exports for all public functions: `export function funcName() {}`
- Named exports for all types: `export interface IType {}`
- Default exports only for singleton instances: `export default logger`
- Keep related functions/types in same file

**Barrel Files:**
- Use `index.ts` to re-export public APIs
- Example: `C:/Users/sistemas/.proyectos/objetiva-sync-monorepo/objetiva-sync/src/api-client/index.ts`
- Barrel files export from sibling modules, not nested modules

**Example Structure:**
```typescript
// auth.ts - Private implementation details
class AuthManager { /* private */ }

// index.ts - Public API
export { AuthManager } from './auth.js'
export type { LoginResponse } from './auth.js'
```

---

*Convention analysis: 2026-01-26*
