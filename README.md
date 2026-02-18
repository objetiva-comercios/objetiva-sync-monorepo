# Objetiva Sync Monorepo

Sistema de sincronización de datos empresariales que extrae información desde ERPs (SQL Server, PostgreSQL) y la centraliza en un gateway PostgreSQL para analítica y reporting.

## Descripción General

**Objetiva Sync** es una solución de ETL (Extract-Transform-Load) diseñada para sincronizar datos de artículos, comprobantes y pagos desde sistemas de gestión hacia una base de datos centralizada. Implementa un modelo de sincronización pull-based con validación de esquemas en tiempo real.

### Arquitectura

```
┌─────────────────────┐    HTTP/JWT     ┌──────────────────────┐
│   objetiva-sync     │ ──────────────► │  objetiva-sync-gateway│
│   (Extractor)       │                 │  (API Gateway)        │
├─────────────────────┤                 ├──────────────────────┤
│ • Adapters SQL      │                 │ • Fastify API        │
│ • Dashboard HTMX    │                 │ • Prisma ORM         │
│ • Scheduler         │                 │ • Zod Validation     │
│ • SQLite State      │                 │ • PostgreSQL         │
└─────────────────────┘                 └──────────────────────┘
         │                                        │
         ▼                                        ▼
   ┌───────────┐                          ┌────────────┐
   │ SQL Server│                          │ PostgreSQL │
   │   (ERP)   │                          │  (Destino) │
   └───────────┘                          └────────────┘
```

## Módulos

### objetiva-sync

Motor de extracción y sincronización. Conecta con fuentes de datos (SQL Server, PostgreSQL, Excel), aplica transformaciones y envía lotes al gateway.

**Características:**
- Dashboard web para configuración y monitoreo
- Scheduler con cron configurable
- Cola de reintentos con backoff exponencial
- Validación de queries contra esquema del gateway
- Sincronización incremental con protección de clock skew

### objetiva-sync-gateway

API REST que recibe datos sincronizados y los persiste en PostgreSQL.

**Características:**
- Autenticación JWT compartida
- Endpoint de esquemas para validación remota
- Regeneración automática de Prisma/Zod desde PostgreSQL
- Dashboard de monitoreo en tiempo real
- Ingesta en lotes optimizada

### shared

Esquemas compartidos (Zod) generados automáticamente desde PostgreSQL.

## Requisitos

- **Node.js** v20 o superior
- **PostgreSQL** 14+ (gateway)
- **SQL Server** o fuente compatible (sync)
- **npm** v9+

## Instalación

### 1. Clonar el repositorio

```bash
git clone <repo-url>
cd objetiva-sync-monorepo
```

### 2. Instalar dependencias (raíz del monorepo)

```bash
npm install
```

### 3. Configurar el Gateway

```bash
cd objetiva-sync-gateway
cp .env.example .env
# Editar .env con credenciales de PostgreSQL
npm run dev
```

Acceder a `http://localhost:3335/setup` para configuración guiada.

### 4. Configurar Sync

```bash
cd objetiva-sync
cp .env.example .env
# Editar .env con JWT_SECRET igual al gateway
npm run dev
```

Acceder a `http://localhost:3000` para el dashboard.

## Variables de Entorno

### objetiva-sync-gateway

| Variable | Descripción | Ejemplo |
|----------|-------------|---------|
| `DATABASE_URL` | Conexión PostgreSQL | `postgresql://user:pass@host:5432/db` |
| `JWT_SECRET` | Secret compartido para JWT | `<string-seguro-32-chars>` |
| `PORT` | Puerto del servidor | `3335` |

### objetiva-sync

| Variable | Descripción | Ejemplo |
|----------|-------------|---------|
| `GATEWAY_URL` | URL del gateway | `http://gateway:3335` |
| `JWT_SECRET` | Debe coincidir con el gateway | `<mismo-secret>` |
| `SYNC_USERNAME` | Usuario para auth | `admin` |
| `SYNC_PASSWORD` | Password para auth | `<password-seguro>` |
| `PORT` | Puerto del dashboard | `3000` |

## Comandos Principales

### En objetiva-sync

```bash
npm run dev          # Desarrollo con hot-reload
npm run build        # Compilar TypeScript
npm run start        # Producción
npm run test         # Ejecutar tests
npm run db:migrate   # Migraciones SQLite
```

### En objetiva-sync-gateway

```bash
npm run dev                   # Desarrollo
npm run build                 # Compilar
npm run start                 # Producción
npm run regenerate-schemas    # Regenerar Zod/Prisma desde PostgreSQL
npm run prisma:push           # Aplicar schema a PostgreSQL
npm run prisma:studio         # Explorador visual de DB
```

## Entidades Sincronizadas

| Entidad | Descripción | Campos Clave |
|---------|-------------|--------------|
| `articulos` | Productos del catálogo | codigo, descripcion, precio, stock |
| `comprobantes_cabecera` | Cabecera de facturas/notas | numero, fecha, cliente, total |
| `comprobantes_detalle` | Líneas de comprobantes | articulo, cantidad, precio_unitario |
| `comprobantes_pagos` | Pagos asociados | forma_pago, monto, fecha |

## Flujo de Sincronización

1. **Scheduler** dispara sincronización según cron configurado
2. **Sync** ejecuta queries SQL contra el ERP
3. **Validador** verifica datos contra esquemas del gateway
4. **BatchProcessor** agrupa registros en lotes
5. **APIClient** envía lotes al gateway con JWT
6. **Gateway** valida con Zod e inserta con Prisma
7. **RetryQueue** reintenta fallos con backoff exponencial

## Sincronización Incremental

El sistema soporta sincronización incremental basada en timestamps:

- Cada entidad mantiene su último timestamp sincronizado
- Las queries filtran por `fecha_modificacion > @lastSync`
- Se aplica overlap de 5 minutos para protección de clock skew
- Opción de "sync completo" disponible en dashboard

## Regeneración de Esquemas

Cuando se modifican tablas en PostgreSQL:

```bash
cd objetiva-sync-gateway
npm run regenerate-schemas
```

Esto actualiza automáticamente:
- `prisma/schema.prisma` - Modelo Prisma
- `shared/schemas/generated/*.ts` - Esquemas Zod

## Tests

```bash
# Ejecutar todos los tests de integración
npm run test

# Tests con coverage
npm run test:coverage
```

El proyecto incluye 79+ tests de integración cubriendo:
- Pipeline completo de sincronización
- Validación de esquemas
- Manejo de errores y reintentos
- Queries multi-origen

## Despliegue

### PM2 (Recomendado)

```bash
# Gateway
cd objetiva-sync-gateway
pm2 start npm --name "gateway" -- run start

# Sync
cd objetiva-sync
pm2 start npm --name "sync" -- run start
```

**Nota:** El gateway debe usar `fork` mode (no cluster) por compatibilidad con SSE.

### Archivos de Configuración

- `objetiva-sync-gateway/ecosystem.config.cjs` - Config PM2 gateway
- `objetiva-sync/ecosystem.config.cjs` - Config PM2 sync

## Monitoreo

### Dashboard Gateway
`http://gateway:3335/status` - Estado del sistema, métricas, últimas sincronizaciones.

### Dashboard Sync
`http://sync:3000` - Configuración de queries, logs en tiempo real, operaciones manuales.

## Estructura del Monorepo

```
objetiva-sync-monorepo/
├── objetiva-sync/           # Motor de extracción
│   ├── src/
│   │   ├── adapters/        # Conectores de bases de datos
│   │   ├── dashboard/       # UI HTMX + EJS
│   │   ├── sync/            # Motor de sincronización
│   │   ├── store/           # SQLite + Drizzle
│   │   └── services/        # Lógica de negocio
│   └── tests/               # Tests de integración
│
├── objetiva-sync-gateway/   # API Gateway
│   ├── src/
│   │   ├── routes/          # Endpoints Fastify
│   │   ├── codegen/         # Generadores de esquemas
│   │   └── lib/             # Utilidades
│   ├── prisma/              # Schema Prisma
│   └── tests/               # Tests
│
├── shared/                  # Código compartido
│   └── schemas/             # Esquemas Zod generados
│
└── .planning/               # Documentación de proyecto
    ├── PROJECT.md           # Estado del proyecto
    ├── ROADMAP.md           # Fases de desarrollo
    └── phases/              # Planes por fase
```

## Documentación Adicional

- [`objetiva-sync/docs/ARQUITECTURA.md`](./objetiva-sync/docs/ARQUITECTURA.md) - Arquitectura detallada
- [`objetiva-sync/docs/API.md`](./objetiva-sync/docs/API.md) - Documentación de endpoints
- [`objetiva-sync/docs/DATABASE.md`](./objetiva-sync/docs/DATABASE.md) - Esquemas de base de datos
- [`objetiva-sync-gateway/SETUP.md`](./objetiva-sync-gateway/SETUP.md) - Guía de configuración del gateway

## Stack Tecnológico

| Componente | Tecnología |
|------------|------------|
| Runtime | Node.js v20+ |
| Lenguaje | TypeScript 5.x |
| Framework API | Fastify 5.x |
| ORM Gateway | Prisma |
| ORM Sync | Drizzle |
| Validación | Zod |
| Frontend | HTMX + EJS + Tailwind CSS |
| Auth | JWT (jsonwebtoken) |
| DB Destino | PostgreSQL 14+ |
| DB Local | SQLite |
| Process Manager | PM2 |

## Versiones

| Versión | Estado | Descripción |
|---------|--------|-------------|
| v1.0 | Completado | Schema-driven sync con validación |
| v1.1-rc | Completado | Timeout fix, sync incremental, PM2 |
| v1.1-rc2 | En desarrollo | Multi-source, dashboard moderno |

## Licencia

ISC
