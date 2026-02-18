# Dashboard Migration Plan: HTMX → React/shadcn

## Resumen Ejecutivo

Migración completa del panel de administración desde HTMX/EJS a React con shadcn/ui.
El panel legacy se mantiene operativo en `/admin-legacy/` hasta completar la migración.

## Estado Actual

### React Dashboard (Implementado)
- ✅ Layout base con sidebar colapsable
- ✅ Página Overview (stats básicos)
- ✅ Página Metrics (placeholder)
- ✅ Página Records (placeholder)
- ✅ Shared components library (`@objetiva/dashboard`)
- ✅ **Auth/Login Page** (Plan 17-08 completado)
  - LoginPage con diseño moderno
  - useAuth hook para manejo de sesión
  - Soporte user/logout en DashboardLayout
  - Endpoint `/api/auth/session` para verificar sesión
- ✅ **Connections Management** (Plan 17-09 completado)
  - ConnectionsPage con lista de conexiones
  - ConnectionCard con status y acciones
  - ConnectionFormDialog modal (crear/editar)
  - Test de conexión desde card y formulario
  - Activación de conexión
  - Endpoint `/api/connections` JSON

### HTMX Legacy (Por Migrar)
1. ~~**Auth** - Login, Change Password~~ ✅ **COMPLETADO**
2. ~~**Config/Connections** - CRUD conexiones BD, test, activación~~ ✅ **COMPLETADO**
3. **Config/Queries** - CRUD consultas SQL, validación schema, programación
4. **Config/API** - Configuración API gateway
5. **Sync** - Ejecución manual, SSE progress, historial
6. **Scheduler** - Estado, control, próximas ejecuciones
7. **Logs** - Historial completo, filtros, stats, live stream
8. **Retry Queue** - Cola reintentos, procesamiento manual

## Orden de Migración (Lógico)

```
Phase 17-08: Auth (Login)
     ↓
Phase 17-09: Connections (CRUD + Test)
     ↓
Phase 17-10: Queries (CRUD + Validación + Scheduler)
     ↓
Phase 17-11: Sync Manual (SSE Progress)
     ↓
Phase 17-12: Scheduler Control
     ↓
Phase 17-13: Logs Viewer
     ↓
Phase 17-14: Retry Queue
     ↓
Phase 17-15: Polish & Cleanup
```

---

## Plan 17-08: Auth - Login Page ✅ COMPLETADO

**Objetivo**: Página de login moderna con shadcn/ui

**Componentes**:
- `LoginPage.tsx` - Página completa de login
- `LoginForm.tsx` - Formulario con validación
- Auth context/hook para manejo de sesión

**Funcionalidad**:
- Form con usuario/contraseña
- Validación client-side
- Mensajes de error claros
- Redirect después de login
- "Remember me" checkbox (opcional)
- Loading state durante autenticación

**API Endpoints** (ya existen):
- `POST /auth/login`
- `GET /auth/logout`

**Mejoras sobre legacy**:
- Validación en tiempo real
- Better error messaging
- Animaciones de transición
- Dark mode support

---

## Plan 17-09: Connections Management ✅ COMPLETADO

**Objetivo**: CRUD completo de conexiones a bases de datos

**Componentes**:
- `ConnectionsPage.tsx` - Lista de conexiones
- `ConnectionCard.tsx` - Tarjeta individual con acciones
- `ConnectionForm.tsx` - Formulario crear/editar
- `ConnectionTestDialog.tsx` - Modal test conexión
- `AdapterSelect.tsx` - Selector tipo DB (SQL Server, PostgreSQL, MySQL)

**Funcionalidad**:
- Lista todas las conexiones con status
- Crear nueva conexión (form dinámico según adapter)
- Editar conexión existente
- Eliminar conexión (con confirmación)
- Test de conexión (modal con resultado)
- Activar/desactivar conexión
- Mostrar conexión activa destacada

**Campos por Adapter**:
- **SQL Server**: host, port, database, user, password, instanceName, encrypt, trustServerCertificate
- **PostgreSQL**: host, port, database, user, password, ssl, sslMode
- **MySQL**: host, port, database, user, password

**API Endpoints** (ya existen):
- `GET /api/connections` - Lista
- `POST /api/connections` - Crear
- `PUT /api/connections/:id` - Actualizar
- `DELETE /api/connections/:id` - Eliminar
- `POST /api/connections/:id/test` - Test
- `POST /api/connections/:id/activate` - Activar

**Mejoras sobre legacy**:
- Formulario dinámico según adapter type
- Validación de campos específicos por adapter
- Status visual de conexión (connected/disconnected)
- Mejor feedback en test de conexión

---

## Plan 17-10: Queries Management (COMPLEJO)

**Objetivo**: CRUD de consultas SQL con validación schema y programación

**Componentes**:
- `QueriesPage.tsx` - Layout master-detail
- `QueryList.tsx` - Lista ordenable de queries
- `QueryEditor.tsx` - Editor principal
- `QueryForm.tsx` - Formulario campos básicos
- `SQLEditor.tsx` - Textarea con syntax highlighting (opcional)
- `IncrementalConfig.tsx` - Config sync incremental
- `SchedulingConfig.tsx` - Config programación
- `ValidationModal.tsx` - Modal resultados validación
- `SchemaReference.tsx` - Panel referencia campos

**Funcionalidad**:
- Lista queries ordenable (drag & drop)
- Crear/editar/eliminar queries
- Selector de entidad (articulo, comprobante_*, etc.)
- Selector de conexión origen
- Editor SQL
- Configuración incremental:
  - Tipo incremento (datetime/none)
  - Campo incremental (dropdown cargado desde query)
  - Mostrar ejemplo `@lastSync`
- Configuración programación:
  - Checkbox "Programar ejecución"
  - Intervalo (1min - 24h)
- Toggle "Query activa"
- **Validación integrada**:
  - Botón "Probar y Validar"
  - Ejecuta query con LIMIT
  - Valida contra schema Zod
  - Muestra campos OK/MISSING/TYPE_ERROR
  - Muestra campos extra (fuera de modelo)
  - Muestra datos de muestra en tabla
- Panel referencia de schema (campos requeridos/opcionales)

**API Endpoints** (ya existen):
- `GET /api/queries` - Lista
- `GET /api/queries/:id` - Detalle
- `POST /api/queries/save` - Crear/actualizar
- `DELETE /api/queries/:id` - Eliminar
- `PUT /api/queries/reorder` - Reordenar
- `POST /api/queries/test` - Test query
- `POST /api/queries/test-and-validate` - Test + validación schema
- `POST /api/queries/get-date-columns` - Detectar campos fecha
- `GET /api/schema-info/:entityType` - Info schema

**Mejoras sobre legacy**:
- Layout master-detail más limpio
- Mejor organización de secciones
- Validación visual más clara
- Estados de loading más informativos

---

## Plan 17-11: Sync Manual (COMPLEJO - SSE)

**Objetivo**: Ejecución de sincronizaciones manuales con progreso real-time

**Componentes**:
- `SyncPage.tsx` - Página principal
- `GatewayStatus.tsx` - Indicador conexión gateway
- `QuerySelection.tsx` - Checkboxes queries a sincronizar
- `SyncConfig.tsx` - Batch size, full/incremental toggle
- `SyncProgress.tsx` - Progreso con SSE
- `SyncResults.tsx` - Resultados después de sync
- `SyncHistory.tsx` - Historial de sincronizaciones
- `SyncStateTable.tsx` - Estado por entidad

**Funcionalidad**:
- Mostrar estado conexión gateway (health check)
- Seleccionar queries a sincronizar (checkboxes)
- Configurar batch size (50-1000)
- Toggle full sync / incremental
- Indicador modo sync actual
- **Ejecución con SSE**:
  - Conectar a `/api/sync/stream?queryIds=...`
  - Mostrar progreso por entidad
  - Barra de progreso animada
  - Tiempo estimado restante
  - Botón cancelar sync
- Resultados detallados por entidad
- Tabla estado por entidad (última sync, registros, status)
- Historial últimas 15 sincronizaciones
- Botón limpiar historial

**Hooks personalizados**:
- `useSyncStream()` - Maneja SSE connection
- `useGatewayHealth()` - Health check polling

**API Endpoints** (ya existen):
- `GET /api/sync/gateway-health`
- `GET /api/sync/available-queries`
- `GET /api/sync/stream` - SSE endpoint
- `POST /api/sync/cancel`
- `GET /api/sync/current-status`
- `GET /api/sync/sync-state`
- `GET /api/sync/history`
- `DELETE /api/sync/history`

**Mejoras sobre legacy**:
- Mejor visualización de progreso
- Estados más claros
- Animaciones más suaves
- Reconexión automática SSE si se pierde

---

## Plan 17-12: Scheduler Control

**Objetivo**: Control del scheduler de sincronizaciones automáticas

**Componentes**:
- `SchedulerPage.tsx` - Página principal
- `SchedulerStatus.tsx` - Estado actual (running/stopped)
- `ScheduledQueries.tsx` - Lista queries programadas
- `NextExecutions.tsx` - Próximas ejecuciones

**Funcionalidad**:
- Mostrar estado scheduler (running/stopped/error)
- Botón reiniciar scheduler
- Botón detener scheduler
- Lista queries programadas con:
  - Nombre query
  - Intervalo configurado
  - Última ejecución
  - Próxima ejecución
  - Status (scheduled/disabled)
- Panel informativo "Cómo funciona"

**API Endpoints** (ya existen):
- `GET /api/scheduler/status`
- `POST /api/scheduler/restart`
- `POST /api/scheduler/stop`

**Mejoras sobre legacy**:
- Timeline visual de próximas ejecuciones
- Mejor feedback en acciones
- Status más detallado

---

## Plan 17-13: Logs Viewer

**Objetivo**: Visor de logs con filtros y live stream

**Componentes**:
- `LogsPage.tsx` - Página principal
- `LogsStats.tsx` - Cards estadísticas (total, success, failed, sent)
- `LogsFilters.tsx` - Panel filtros
- `LogsTable.tsx` - Tabla paginada
- `LogDetailModal.tsx` - Modal detalle log
- `LiveIndicator.tsx` - Indicador stream activo

**Funcionalidad**:
- Stats cards (total 24h, exitosas, fallidas, registros enviados)
- Filtros:
  - Tipo entidad
  - Tipo sync (full/incremental/manual)
  - Estado (success/failed/partial)
  - Rango fechas
- Tabla logs con:
  - Fecha/hora
  - Query
  - Tipo sync
  - Registros (fetched/sent/failed)
  - Duración
  - Estado
- Paginación
- Ver detalles (modal con errores completos)
- Eliminar todos los logs (doble confirmación)
- Live stream indicator (opcional: SSE para nuevos logs)

**API Endpoints** (ya existen):
- `GET /api/logs/stats`
- `GET /api/logs/list`
- `GET /api/logs/:id/details`
- `DELETE /api/logs/all`

**Mejoras sobre legacy**:
- Paginación real (no solo limit)
- Filtros más intuitivos
- Mejor visualización de errores
- Export a CSV (opcional)

---

## Plan 17-14: Retry Queue

**Objetivo**: Gestión de cola de reintentos de records fallidos

**Componentes**:
- `RetryQueuePage.tsx` - Página principal
- `RetryQueueStats.tsx` - Stats de cola
- `RetryQueueTable.tsx` - Tabla de items
- `RetryItemActions.tsx` - Acciones por item

**Funcionalidad**:
- Stats: items pendientes, por entidad, antiguedad
- Tabla items con:
  - Entidad
  - Record ID
  - Error
  - Intentos
  - Última vez
  - Acciones (reintentar/descartar)
- Botón procesar toda la cola
- Botón limpiar cola

**API Endpoints** (ya existen):
- `GET /api/retry-queue`
- `POST /api/retry-queue/process`
- `POST /api/retry-queue/:id/retry`
- `DELETE /api/retry-queue/:id`
- `DELETE /api/retry-queue`

---

## Plan 17-15: Polish & Cleanup

**Objetivo**: Pulido final y eliminación panel legacy

**Tareas**:
1. Revisión UX completa de todas las páginas
2. Consistencia visual (colores, espaciados, tipografía)
3. Responsive design check (mobile/tablet/desktop)
4. Dark mode testing
5. Performance audit (bundle size, lazy loading)
6. Accessibility check (aria labels, keyboard nav)
7. Actualizar navegación/sidebar con todas las rutas
8. Actualizar README con nueva estructura
9. Documentar componentes principales
10. Gate: Verificación usuario que legacy se puede eliminar
11. Eliminar rutas/views HTMX legacy
12. Cleanup dependencias no usadas (htmx, daisyui legacy)

---

## Shared Components (Reutilizables)

Durante la migración, crear en `@objetiva/dashboard`:

### UI Components
- `DataTable` - Tabla con sorting, paginación
- `StatusBadge` - Badge de estado (success/error/warning)
- `EmptyState` - Estado vacío con acción
- `LoadingState` - Skeleton/spinner
- `ConfirmDialog` - Diálogo confirmación
- `EntityIcon` - Iconos por tipo entidad

### Form Components
- `FormField` - Field con label, error, description
- `ConnectionFields` - Campos dinámicos por adapter
- `IntervalSelect` - Selector de intervalo tiempo

### Layout Components
- `PageHeader` - Header consistente con título y acciones
- `StatsCard` - Card de estadística
- `FilterPanel` - Panel de filtros colapsable

### Hooks
- `useToast` - Notificaciones toast
- `useConfirm` - Confirmación antes de acción
- `useSSE` - Server-Sent Events genérico
- `usePagination` - Paginación client-side
- `useFilters` - Manejo filtros URL

---

## Estimación de Esfuerzo

| Plan | Complejidad | Componentes | Estimado |
|------|-------------|-------------|----------|
| 17-08 Auth | Baja | 3 | 1 sesión |
| 17-09 Connections | Media | 5 | 1-2 sesiones |
| 17-10 Queries | **Alta** | 8+ | 2-3 sesiones |
| 17-11 Sync | **Alta** | 8+ | 2-3 sesiones |
| 17-12 Scheduler | Baja | 4 | 1 sesión |
| 17-13 Logs | Media | 6 | 1-2 sesiones |
| 17-14 Retry Queue | Baja | 4 | 1 sesión |
| 17-15 Polish | Media | N/A | 1-2 sesiones |

**Total estimado**: 10-15 sesiones de trabajo

---

## Criterios de Aceptación por Plan

Cada plan se considera completo cuando:

1. ✅ Todos los componentes implementados
2. ✅ Funcionalidad completa igual o mejor que legacy
3. ✅ Sin errores TypeScript
4. ✅ Funciona en desarrollo (vite dev)
5. ✅ Build production exitoso
6. ✅ Usuario puede realizar todas las acciones del flujo
7. ✅ Responsive básico (desktop + tablet)

---

## Notas Técnicas

### Stack
- React 18 + TypeScript
- shadcn/ui (Radix primitives)
- Tailwind CSS 4
- React Router (ya configurado)
- TanStack Query (para data fetching, opcional)

### Estructura Archivos
```
objetiva-sync/src/dashboard-react/
├── components/
│   ├── auth/
│   ├── connections/
│   ├── queries/
│   ├── sync/
│   ├── scheduler/
│   ├── logs/
│   └── retry-queue/
├── hooks/
├── pages/
├── lib/
└── types/
```

### APIs
Todas las APIs ya existen en el backend Fastify.
Solo se necesita crear fetchers/hooks en React.
