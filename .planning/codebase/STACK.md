# Technology Stack

**Analysis Date:** 2026-01-26

## Languages

**Primary:**
- TypeScript 5.7.2 - All source code, configuration files, and build system
- EJS 3.1.10 - Server-side templating for UI dashboard (in `objetiva-sync`)

**Secondary:**
- JavaScript (Node.js) - Runtime execution and scripts

## Runtime

**Environment:**
- Node.js >= 20.0.0 (specified in both package.json files)
- ESM (ES Modules) - Both packages use `"type": "module"`

**Package Manager:**
- npm (package-lock.json present in root)
- Lockfile: Present (`package-lock.json`)

## Frameworks

**Core:**
- Fastify 5.2.0 (`objetiva-sync`) - Web framework for main sync server
- Fastify 4.28.1 (`objetiva-sync-gateway`) - Web framework for API gateway

**UI/Templating:**
- EJS 3.1.10 (`objetiva-sync`) - Server-side rendering for dashboard
- Fastify plugins:
  - `@fastify/cookie` 10.0.1 - Cookie management
  - `@fastify/formbody` 8.0.2 - HTML form parsing
  - `@fastify/session` 11.0.1 - Session management
  - `@fastify/static` 8.0.2 - Static file serving
  - `@fastify/view` 10.0.1 - View engine integration
  - `@fastify/cors` 8.5.0 (`gateway`) - CORS handling
  - `@fastify/jwt` 7.2.4 (`gateway`) - JWT authentication

**Testing:**
- Vitest 2.1.8 (`objetiva-sync`) - Unit and integration test runner
- Vitest config: `vitest.config.ts`

**Build/Dev:**
- tsup 8.3.5 (`objetiva-sync`) - TypeScript bundler (configured for ESM output with type declarations)
- tsx 4.19.2 (both packages) - TypeScript execution for development and scripts
- TypeScript 5.7.2 (both packages) - Language compiler
- tsc (both packages) - TypeScript compiler for gateway builds

## Key Dependencies

**Database & ORM:**
- drizzle-orm 0.36.4 (`objetiva-sync`) - SQLite ORM for local database
- drizzle-kit 0.30.2 (`objetiva-sync`) - Database migration and code generation
- @prisma/client 5.22.0 (`gateway`) - PostgreSQL ORM for remote database
- prisma 5.22.0 (`gateway`) - Database client code generation

**Database Drivers:**
- better-sqlite3 11.7.0 (`objetiva-sync`) - Native SQLite driver with synchronous API
- mssql 11.0.1 (`objetiva-sync`) - SQL Server driver for ERP source connections
- msnodesqlv8 5.1.3 (`objetiva-sync`) - Native SQL Server driver option

**HTTP & Networking:**
- undici 7.2.2 (`objetiva-sync`) - Native HTTP client (replaces node-fetch in Node 18+)
- Used for making requests to remote API endpoints

**Validation & Schemas:**
- zod 3.23.8 (both packages) - TypeScript-first schema validation and type inference

**Security & Authentication:**
- bcrypt 5.1.1 (`objetiva-sync`) - Password hashing for local authentication
- bcryptjs 2.4.3 (`gateway`) - Password hashing for gateway authentication
- uuid 13.0.0 (`objetiva-sync`) - Unique identifier generation

**Logging:**
- pino 9.5.0 (both packages) - High-performance JSON logger
- pino-pretty 12.0.0 (`objetiva-sync`) and 13.0.0 (`gateway`) - Pretty-printed console output for development

**Job Scheduling:**
- node-cron 3.0.3 (`objetiva-sync`) - Cron-based task scheduler for sync intervals

**Development & Linting:**
- ESLint 9.17.0 (`objetiva-sync`) - JavaScript/TypeScript linter
- @typescript-eslint/eslint-plugin 8.18.2 (`objetiva-sync`) - TypeScript-specific rules
- @typescript-eslint/parser 8.18.2 (`objetiva-sync`) - TypeScript parser for ESLint
- Prettier 3.4.2 (`objetiva-sync`) - Code formatter
- globals 15.13.0 (`objetiva-sync`) - Global variables reference

**Type Definitions:**
- @types/node 22.10.2 (both packages) - Node.js type definitions
- @types/bcrypt 5.0.2 (`objetiva-sync`) - bcrypt types
- @types/better-sqlite3 7.6.12 (`objetiva-sync`) - better-sqlite3 types
- @types/ejs 3.1.5 (`objetiva-sync`) - EJS template types
- @types/mssql 9.1.5 (`objetiva-sync`) - MSSQL types
- @types/node-cron 3.0.11 (`objetiva-sync`) - node-cron types
- @types/bcryptjs 2.4.6 (`gateway`) - bcryptjs types
- @types/uuid 10.0.0 (`objetiva-sync`) - UUID types

**Utilities:**
- dotenv 16.4.7 (`objetiva-sync`) - Environment variable loading from .env files

## Configuration

**Environment:**
- `.env` files for configuration (present in both `objetiva-sync` and `objetiva-sync-gateway`)
- `.env.example` - Template for required variables
- `.env.test` - Test environment configuration
- Environment variables control:
  - Server ports (PORT)
  - Node environment (NODE_ENV: development/production/test)
  - Database connections and credentials
  - API authentication (JWT_SECRET, SYNC_USERNAME, SYNC_PASSWORD_HASH)
  - Logging levels (LOG_LEVEL) and output files (LOG_FILE)
  - Application name and configuration

**Build:**
- TypeScript configuration:
  - `C:/Users/sistemas/.proyectos/objetiva-sync-monorepo/objetiva-sync/tsconfig.json` - Strict mode enabled, ES2022 target, ESM modules
  - Path alias: `@/*` maps to `./src/*`
  - Drizzle config: `C:/Users/sistemas/.proyectos/objetiva-sync-monorepo/objetiva-sync/drizzle.config.ts` - SQLite dialect, migrations in `./src/store/migrations`
  - Vitest config: `C:/Users/sistemas/.proyectos/objetiva-sync-monorepo/objetiva-sync/vitest.config.ts`
  - ESLint config: `C:/Users/sistemas/.proyectos/objetiva-sync-monorepo/objetiva-sync/eslint.config.js`

## Database Configuration

**objetiva-sync (Local):**
- Type: SQLite
- Path: `./database/objetiva-sync.db` (relative to project root)
- Connection method: better-sqlite3 (synchronous native driver)
- ORM: Drizzle ORM
- Schema location: `C:/Users/sistemas/.proyectos/objetiva-sync-monorepo/objetiva-sync/src/store/schema.ts`
- Migrations: `C:/Users/sistemas/.proyectos/objetiva-sync-monorepo/objetiva-sync/src/store/migrations/`

**objetiva-sync-gateway (Remote):**
- Type: PostgreSQL
- Connection string: Environment variable `DATABASE_URL`
- Example: `postgresql://user:password@localhost:5432/objetiva_db`
- ORM: Prisma
- Schema location: `C:/Users/sistemas/.proyectos/objetiva-sync-monorepo/objetiva-sync-gateway/prisma/schema.prisma`

## Platform Requirements

**Development:**
- Node.js 20.0.0 or higher
- npm (bundled with Node.js)
- For SQL Server connections: Windows ODBC drivers or SQL Native Client
- TypeScript knowledge for source code modification

**Production:**
- Node.js 20.0.0 or higher runtime
- SQLite 3.x (included with better-sqlite3)
- PostgreSQL database (for gateway receiving synced data)
- Environment variables configured
- Optional: SQL Server, PostgreSQL, MySQL sources (configurable per connection)

## Key Scripts

**objektiva-sync:**
```bash
npm run dev              # Start development server with auto-reload
npm run build            # Build to dist/ with ESM and type declarations
npm run start            # Run production build
npm run db:generate      # Generate Drizzle migrations
npm run db:migrate       # Apply migrations to SQLite
npm run db:studio        # Open Drizzle Studio UI
npm run test             # Run Vitest tests
npm run test:coverage    # Generate coverage report
npm run lint             # Run ESLint
npm run format           # Format with Prettier
npm run service:install  # Install Windows service
npm run service:uninstall # Uninstall Windows service
```

**objektiva-sync-gateway:**
```bash
npm run dev              # Start development server with auto-reload
npm run build            # Build TypeScript to dist/
npm run start            # Run production build
npm run prisma:generate  # Generate Prisma Client
npm run prisma:push      # Push schema to PostgreSQL
npm run prisma:migrate   # Create migration
npm run prisma:studio    # Open Prisma Studio UI
```

---

*Stack analysis: 2026-01-26*
