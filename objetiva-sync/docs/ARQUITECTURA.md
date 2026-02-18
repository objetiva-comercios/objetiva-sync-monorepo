# Arquitectura del Sistema - Objetiva Sync

## Stack Tecnológico

### Backend / Core
- **Runtime**: Node.js v20+
- **Framework**: Fastify 5.x
- **Base de datos local**: SQLite (better-sqlite3) para estado de sincronización
- **ORM/Query**: Drizzle ORM (para SQLite local)
- **Validación**: Zod
- **HTTP Client**: undici (nativo de Node) o axios
- **Scheduler**: node-cron para polling
- **Servicio Windows**: node-windows

### Módulos de Conexión (Data Sources)
- **SQL Server**: mssql
- **PostgreSQL**: pg (para futuro)
- **MySQL**: mysql2 (para futuro)
- **Excel**: exceljs (para futuro)

### Frontend / Dashboard
- **Templating**: EJS
- **Interactividad**: HTMX 2.x
- **CSS**: Tailwind CSS (via CDN)
- **Iconos**: Lucide Icons

### Autenticación
- **Sesiones**: @fastify/session + @fastify/cookie
- **Password hashing**: bcrypt

### Notificaciones
- **Slack**: @slack/webhook
- **Telegram**: node-telegram-bot-api
- **Pushover**: pushover-notifications
- **Webhook genérico**: fetch nativo

### Herramientas de Desarrollo
- **TypeScript**: Obligatorio
- **Linter**: ESLint + @typescript-eslint
- **Formatter**: Prettier
- **Testing**: Vitest
- **Build**: tsup o esbuild

---

## Diagrama de Capas

```
┌─────────────────────────────────────────────────────────────────┐
│                    DASHBOARD (HTMX + EJS)                       │
│  - Configuración de conexiones                                  │
│  - Editor de consultas SQL                                      │
│  - Mapeo visual de campos                                       │
│  - Monitor de sincronizaciones                                  │
│  - Logs y reintentos                                            │
├─────────────────────────────────────────────────────────────────┤
│                    FASTIFY HTTP SERVER                          │
│  - Rutas del dashboard                                          │
│  - API interna para operaciones                                 │
│  - Autenticación de sesión                                      │
├─────────────────────────────────────────────────────────────────┤
│                    SYNC ENGINE                                  │
│  - Orchestrador de sincronización                               │
│  - Cola de reintentos                                           │
│  - Transformación de datos (mapeo)                              │
│  - Batching para envío                                          │
├─────────────────────────────────────────────────────────────────┤
│                    DATA SOURCE ADAPTERS                         │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐           │
│  │ SQL Server│ │PostgreSQL│ │  MySQL   │ │  Excel   │           │
│  │  Adapter  │ │ Adapter  │ │ Adapter  │ │ Adapter  │           │
│  └──────────┘ └──────────┘ └──────────┘ └──────────┘           │
│                    ↑ Implementan IDataSourceAdapter              │
├─────────────────────────────────────────────────────────────────┤
│                    REMOTE API CLIENT                            │
│  - Autenticación JWT                                            │
│  - Envío batch a endpoints                                      │
│  - Manejo de errores y reintentos                               │
├─────────────────────────────────────────────────────────────────┤
│                    STATE STORE (SQLite)                         │
│  - Configuración                                                │
│  - Estado de sincronización                                     │
│  - Cola de reintentos                                           │
│  - Logs de actividad                                            │
├─────────────────────────────────────────────────────────────────┤
│                    NOTIFICATION SERVICE                         │
│  - Slack / Telegram / Pushover / Webhook                        │
└─────────────────────────────────────────────────────────────────┘
```

---

## Estructura del Monorepo

```
/objetiva-sync-monorepo
├── shared/                       # Esquemas Zod compartidos (auto-generados)
│   ├── schemas/
│   │   ├── index.ts              # Re-exporta todos los esquemas
│   │   └── generated/            # Auto-generados desde PostgreSQL
│   │       ├── articulos.schema.ts
│   │       ├── comprobantes_cabecera.schema.ts
│   │       ├── comprobantes_detalle.schema.ts
│   │       └── comprobantes_pagos.schema.ts
│   └── types/
│       └── schema-metadata.ts    # EntityMetadata, ValidationRule
│
├── objetiva-sync/                # Cliente de sincronización (este proyecto)
├── objetiva-sync-gateway/        # API Gateway (PostgreSQL)
└── package.json                  # Workspace root
```

## Esquemas Compartidos

Los esquemas Zod en `shared/schemas/generated/` son **auto-generados** desde PostgreSQL:

```bash
cd objetiva-sync-gateway
npm run regenerate-schemas
```

Ver `shared/README.md` para documentación completa.

## Estructura de Carpetas (objetiva-sync)

```
/objetiva-sync
├── src/
│   ├── config/
│   │   ├── index.ts              # Carga de configuración
│   │   ├── env.ts                # Validación de env vars
│   │   └── constants.ts          # Constantes del sistema
│   │
│   ├── adapters/                 # Módulos de fuente de datos
│   │   ├── types.ts              # IDataSourceAdapter interface
│   │   ├── base-adapter.ts       # Clase base abstracta
│   │   ├── sqlserver/
│   │   │   ├── index.ts
│   │   │   └── sqlserver-adapter.ts
│   │   ├── postgres/             # (futuro)
│   │   ├── mysql/                # (futuro)
│   │   └── excel/                # (futuro)
│   │
│   ├── sync/                     # Motor de sincronización
│   │   ├── sync-engine.ts        # Orquestador principal
│   │   ├── transformer.ts        # Aplicar mapeos
│   │   ├── batch-processor.ts    # Agrupar para envío
│   │   ├── retry-queue.ts        # Cola de reintentos
│   │   └── scheduler.ts          # Cron jobs
│   │
│   ├── api-client/               # Cliente del backend remoto
│   │   ├── index.ts
│   │   ├── auth.ts               # Manejo de JWT
│   │   ├── articulos-client.ts
│   │   ├── comprobantes-client.ts
│   │   └── pagos-client.ts
│   │
│   ├── store/                    # SQLite state store
│   │   ├── index.ts
│   │   ├── schema.ts             # Drizzle schema
│   │   ├── migrations/
│   │   └── repositories/
│   │       ├── config-repo.ts
│   │       ├── sync-state-repo.ts
│   │       ├── retry-queue-repo.ts
│   │       └── logs-repo.ts
│   │
│   ├── notifications/            # Servicios de notificación
│   │   ├── index.ts
│   │   ├── types.ts
│   │   ├── slack.ts
│   │   ├── telegram.ts
│   │   ├── pushover.ts
│   │   └── webhook.ts
│   │
│   ├── dashboard/                # UI con HTMX
│   │   ├── routes/
│   │   │   ├── index.ts          # Router principal
│   │   │   ├── auth.ts           # Login/logout
│   │   │   ├── config.ts         # Configuración
│   │   │   ├── queries.ts        # Editor SQL
│   │   │   ├── mappings.ts       # Mapeo de campos
│   │   │   ├── sync.ts           # Operaciones de sync
│   │   │   ├── logs.ts           # Visualización de logs
│   │   │   └── notifications.ts  # Config notificaciones
│   │   ├── views/
│   │   │   ├── layouts/
│   │   │   │   └── main.ejs
│   │   │   ├── partials/
│   │   │   │   ├── nav.ejs
│   │   │   │   ├── alerts.ejs
│   │   │   │   └── ...
│   │   │   ├── auth/
│   │   │   │   └── login.ejs
│   │   │   ├── dashboard/
│   │   │   │   └── index.ejs
│   │   │   ├── config/
│   │   │   │   ├── connection.ejs
│   │   │   │   ├── queries.ejs
│   │   │   │   └── mappings.ejs
│   │   │   ├── sync/
│   │   │   │   ├── status.ejs
│   │   │   │   └── history.ejs
│   │   │   └── logs/
│   │   │       └── index.ejs
│   │   └── static/
│   │       ├── css/
│   │       └── js/
│   │
│   ├── services/                 # Servicios de dominio
│   │   ├── auth-service.ts
│   │   ├── config-service.ts
│   │   └── sync-service.ts
│   │
│   ├── utils/
│   │   ├── logger.ts
│   │   ├── crypto.ts
│   │   └── helpers.ts
│   │
│   ├── types/
│   │   ├── index.ts
│   │   ├── articulo.ts
│   │   ├── comprobante.ts
│   │   └── pago.ts
│   │
│   └── index.ts                  # Entry point
│
├── database/
│   └── objetiva-sync.db          # SQLite database (generado)
│
├── tests/
│   ├── unit/
│   ├── integration/
│   └── fixtures/
│
├── docs/
│   ├── AI-RULES.md
│   ├── ARQUITECTURA.md
│   ├── DATABASE.md
│   ├── API.md
│   ├── ACTIVIDAD.md
│   ├── PENDIENTES.md
│   └── DECISIONES.md
│
├── scripts/
│   ├── install-service.js        # Instalar como servicio Windows
│   ├── uninstall-service.js
│   └── dev.js
│
├── .env.example
├── .gitignore
├── package.json
├── tsconfig.json
├── drizzle.config.ts
└── README.md
```

---

## Patrones y Convenciones

### Naming Conventions

#### Archivos y Carpetas
- **Archivos**: `kebab-case.ts` (ej: `sync-engine.ts`)
- **Carpetas**: `kebab-case` (ej: `api-client/`)

#### Código
- **Variables y funciones**: `camelCase` (ej: `getUserById`)
- **Clases**: `PascalCase` (ej: `SyncEngine`)
- **Constantes**: `UPPER_SNAKE_CASE` (ej: `MAX_RETRIES`)
- **Tipos/Interfaces**: `PascalCase` con prefijo `I` (ej: `IArticuloPayload`)

#### Base de Datos
- **Tablas**: `snake_case` (ej: `sync_state`, `retry_queue`)
- **Columnas**: `snake_case` (ej: `last_sync_at`, `created_at`)

### Manejo de Errores

```typescript
// Usar clases de error personalizadas
export class AppError extends Error {
  constructor(
    public statusCode: number,
    public message: string,
    public isOperational = true
  ) {
    super(message);
  }
}

// Middleware global de manejo de errores en Fastify
fastify.setErrorHandler((error, request, reply) => {
  // Log error
  fastify.log.error(error);

  // Responder al cliente
  reply.status(error.statusCode || 500).send({
    success: false,
    error: {
      message: error.message,
      code: error.code
    }
  });
});
```

### Respuestas de API (Dashboard interno)

**Formato estándar de respuesta exitosa:**
```json
{
  "success": true,
  "data": { ... },
  "message": "Operación exitosa"
}
```

**Formato estándar de error:**
```json
{
  "success": false,
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Descripción del error",
    "details": { ... }
  }
}
```

### Validación de Datos

```typescript
// Usar Zod para validación
import { z } from 'zod';

const articuloSchema = z.object({
  sku: z.string().min(1),
  nombre: z.string().min(3).max(500),
  precio: z.number().positive().optional(),
  objeto: z.string(),
});

// Validar en rutas de Fastify
fastify.post('/api/articulos', {
  schema: {
    body: articuloSchema
  }
}, async (request, reply) => {
  // El body ya está validado
  const articulo = request.body;
  // ...
});
```

### Base de Datos

#### Conexión SQLite
```typescript
import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';

const sqlite = new Database('./database/objetiva-sync.db');
const db = drizzle(sqlite);
```

#### Queries Parametrizadas
```typescript
// ✅ BIEN - Usando Drizzle ORM
const configs = await db.select()
  .from(configTable)
  .where(eq(configTable.key, 'admin_password_hash'));

// ✅ BIEN - Query parametrizada con better-sqlite3
const stmt = sqlite.prepare('SELECT * FROM config WHERE key = ?');
const result = stmt.get('admin_password_hash');
```

### Seguridad

- **Variables sensibles**: SIEMPRE en variables de entorno
- **Encriptación**: AES-256-GCM para credenciales en SQLite
- **Password hashing**: bcrypt con cost 12
- **Sesiones**: HTTP-only cookies
- **Queries SQL**: Solo SELECT permitidos (validación en backend)

---

## Flujos de Trabajo Críticos

### 1. Sincronización de Artículos
1. Obtener última sync desde `sync_state`
2. Ejecutar query configurada con placeholder `:lastSync`
3. Aplicar mapeos de campos (transformaciones)
4. Agrupar en batches (default: 100)
5. Enviar a `POST /api/articulos/batch`
6. Actualizar `sync_state` y `sync_logs`
7. Manejar errores → `retry_queue`

### 2. Sincronización de Comprobantes
1. Obtener última sync de comprobantes
2. Ejecutar query de CABECERAS
3. Ejecutar query de DETALLES (filtrado por cabeceras)
4. Ejecutar query de PAGOS (filtrado por cabeceras)
5. **Ensamblar** estructura completa (cabecera + detalles embebidos)
6. Enviar comprobantes con detalles: `POST /api/comprobantes/batch`
7. Enviar pagos por separado: `POST /api/comprobantes/pagos/batch`
8. Actualizar estado y logs

### 3. Cola de Reintentos
1. Job de cron revisa `retry_queue` cada 5 minutos
2. Filtra items con `next_retry_at <= NOW`
3. Reintenta envío con backoff exponencial (1min, 5min, 15min, 30min, 1h)
4. Máximo 5 intentos
5. Después de 5 intentos → marcar como `failed`
6. Notificar errores críticos

---

## Configuración Inicial

### Variables de Entorno (.env)

```bash
# Server
PORT=3000
NODE_ENV=production

# Seguridad
ENCRYPTION_KEY=             # Se genera automáticamente si no existe
SESSION_SECRET=             # Se genera automáticamente si no existe

# Admin inicial (solo primer inicio)
ADMIN_PASSWORD=cambiar123   # Se elimina después del primer login

# Logging
LOG_LEVEL=info              # debug, info, warn, error
LOG_FILE=./logs/sync.log
```

### Comandos NPM

```json
{
  "scripts": {
    "dev": "tsx watch src/index.ts",
    "build": "tsup src/index.ts --format cjs --dts",
    "start": "node dist/index.js",
    "service:install": "node scripts/install-service.js",
    "service:uninstall": "node scripts/uninstall-service.js",
    "db:generate": "drizzle-kit generate",
    "db:migrate": "drizzle-kit migrate",
    "db:studio": "drizzle-kit studio",
    "test": "vitest",
    "test:coverage": "vitest --coverage",
    "lint": "eslint src/",
    "format": "prettier --write src/"
  }
}
```

---

## Recursos Adicionales

- [DATABASE.md](./DATABASE.md) - Especificación completa de base de datos SQLite
- [API.md](./API.md) - Documentación de endpoints del dashboard y backend remoto
- [README.md](../README.md) - Documentación del proyecto
- [objetiva-sync-specs.md](../objetiva-sync-specs.md) - Especificaciones completas del sistema
