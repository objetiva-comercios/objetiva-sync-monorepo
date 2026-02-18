# Tareas Pendientes - Objetiva Sync

## Estado General del Proyecto

**Fase actual:** Fase 1 - Core (MVP) ✅ COMPLETADA + Alta Prioridad en Progreso
**Progreso Fase 1:** 100% completado
**Última actualización:** 2026-01-06

---

## ✅ COMPLETADO (2025-12-22)

### Setup y Configuración Inicial
- [x] Leer y analizar documentación completa (objetiva-sync-specs.md)
- [x] Leer documento de setup (1.setup-proyecto-completo-all-ai-models.md)
- [x] Crear estructura completa de documentación en `docs/`
  - [x] AI-RULES.md (reglas y procedimientos)
  - [x] ARQUITECTURA.md (stack, patrones, estructura)
  - [x] DATABASE.md (esquema SQLite completo con 8 tablas)
  - [x] API.md (endpoints dashboard + backend remoto)
  - [x] ACTIVIDAD.md (log de desarrollo)
  - [x] PENDIENTES.md (este archivo)
  - [x] DECISIONES.md (5 decisiones documentadas)
- [x] Crear README.md con documentación principal
- [x] Inicializar proyecto Node.js (`npm init -y`)
- [x] Configurar package.json completo
  - [x] 15 scripts npm
  - [x] 12 dependencias de producción
  - [x] 16 dependencias de desarrollo
  - [x] Metadata y engines
- [x] Instalar todas las dependencias (493 paquetes)
- [x] Crear estructura completa de carpetas (src/, tests/, database/, scripts/, logs/)
- [x] Configurar TypeScript (tsconfig.json con strict mode)
- [x] Configurar ESLint 9 con flat config (eslint.config.js)
- [x] Configurar Prettier (.prettierrc)
- [x] Configurar Drizzle Kit (drizzle.config.ts)
- [x] Crear .env.example con todas las variables
- [x] Crear .gitignore completo
- [x] Inicializar repositorio Git
- [x] Primer commit (32f23b1)

### 1️⃣ Tipos TypeScript Base ✅ COMPLETADO
**Archivos creados:**
- [x] `src/types/index.ts` - Exportaciones centrales
- [x] `src/types/articulo.ts`
  - [x] Interface `IArticuloPayload` con todos los campos según specs
  - [x] Schema Zod `articuloPayloadSchema` para validación
  - [x] Type guard `isArticuloPayload()`
- [x] `src/types/comprobante.ts`
  - [x] Interface `IComprobanteCabeceraPayload` (cabecera + detalles embebidos)
  - [x] Interface `IComprobanteDetallePayload` (líneas)
  - [x] Schemas Zod anidados para validación completa
- [x] `src/types/pago.ts`
  - [x] Interface `IPagoPayload`
  - [x] Schema Zod con validaciones de reglas de negocio
- [x] `src/types/common.ts`
  - [x] 9 enums del sistema (EntityType, SyncStatus, etc.)
  - [x] Tipos base: Result<T>, APIResponse<T>, BatchResult, TestResult

**Commit:** 1cea802
**Tiempo real:** ~2.5 horas

---

## ✅ FASE 1: CORE (MVP) - COMPLETADA (100%)

---

### 2️⃣ Sistema de Configuración y Utilidades ✅ COMPLETADO

#### src/config/
- [x] `src/config/env.ts`
  - [x] Schema Zod para variables de entorno
  - [x] Función `loadEnv()` que valida y carga .env
  - [x] Auto-generación de ENCRYPTION_KEY (32 bytes hex)
  - [x] Auto-generación de SESSION_SECRET (32 bytes hex)
  - [x] Actualización automática del archivo .env
  - [x] Export de objeto config tipado con `requireEnv()`
- [x] `src/config/constants.ts`
  - [x] SYNC_CONFIG (batch sizes, intervalos, timeouts)
  - [x] RETRY_CONFIG (backoff: 1, 5, 15, 30, 60 min)
  - [x] ERROR_CODES (30+ códigos categorizados)
  - [x] 15+ grupos de constantes adicionales
- [x] `src/config/index.ts` - Exportaciones centralizadas

#### src/utils/
- [x] `src/utils/logger.ts`
  - [x] Logger Pino con pretty print en desarrollo
  - [x] JSON logs multi-stream en producción (consola + archivo)
  - [x] Loggers especializados: syncLogger, apiLogger, dbLogger
  - [x] Helpers: logOperationStart/End, logError
- [x] `src/utils/crypto.ts`
  - [x] `encrypt()/decrypt()` - AES-256-GCM con IV y auth tag
  - [x] Key derivation con scrypt para seguridad
  - [x] `hashPassword()/comparePassword()` - bcrypt 12 rounds
  - [x] `encryptJSON()/decryptJSON()` helpers
  - [x] `encryptCredentials()/decryptCredentials()`
- [x] `src/utils/helpers.ts`
  - [x] 35+ funciones de utilidad
  - [x] Fechas, SQL, arrays, async, strings, formateo, cálculos
  - [x] `sleep()`, `chunk()`, `retry()`, `calculateNextRetry()`
  - [x] `parseSQLPlaceholders()`, `formatDate()`, etc.
- [x] `src/utils/index.ts` - Exportaciones centralizadas

**Commits:** f017e67 (config), 440b4c1 (utils)
**Tiempo real:** ~4 horas

---

### 3️⃣ SQLite Store con Drizzle (Prioridad: ALTA - EN PROGRESO)

#### src/store/schema.ts ✅ COMPLETADO
Implementadas **8 tablas** según DATABASE.md con Drizzle ORM:
- [x] Tabla `config` (key, value, encrypted, updated_at)
- [x] Tabla `connection_config` (id, adapter_type, name, config_json encriptado, is_active, test_status, etc.)
- [x] Tabla `queries` (id, entity_type, name, sql_query, incremental_field, incremental_type, join_field, etc.)
- [x] Tabla `field_mappings` (id, query_id FK CASCADE, source_field, target_field, transform_type, etc.)
- [x] Tabla `sync_state` (id, entity_type UNIQUE, last_sync_value, last_sync_at, total_synced, status, etc.)
- [x] Tabla `retry_queue` (id, entity_type, payload JSON, attempt_count, max_attempts, next_retry_at, status, etc.)
- [x] Tabla `sync_logs` (id, entity_type, sync_type, status, records_fetched, records_sent, duration_ms, etc.)
- [x] Tabla `notification_config` (id, channel_type, name, config_json encriptado, is_enabled, notify_on_*, etc.)
- [x] Creados 12 índices según DATABASE.md
- [x] 1 foreign key con ON DELETE CASCADE
- [x] Tipos inferidos automáticamente (Select/Insert types)

#### src/store/index.ts ✅ COMPLETADO
- [x] Conexión SQLite con better-sqlite3
- [x] Drizzle ORM inicializado con schema
- [x] `initDatabase()` - Creación automática de directorio
- [x] Configuración WAL mode (Write-Ahead Logging)
- [x] Foreign keys habilitadas
- [x] Migration runner integrado
- [x] Funciones de transacciones
- [x] Utilidades de mantenimiento: `vacuumDatabase()`, `analyzeDatabase()`, `getDatabaseStats()`

#### src/store/migrations/ ✅ COMPLETADO
- [x] Generada migración `0000_glorious_jane_foster.sql` (114 líneas DDL)
- [x] Snapshot y journal de migraciones
- [x] Verificado con `npm run db:generate`

**Commit:** 8a69564
**Tiempo real:** ~3 horas

#### src/store/repositories/ ✅ COMPLETADO
Creados **9 repositorios** (8 tablas + index):
- [x] `config-repo.ts` (~100 líneas)
  - [x] `getConfig()`, `setConfig()`, `getAllConfig()`, `deleteConfig()`
  - [x] Lógica de upsert, encriptación opcional
- [x] `connection-config-repo.ts` (~250 líneas)
  - [x] `getActiveConnection()`, `createConnection()`, `updateConnection()`
  - [x] `setActiveConnection()`, `testConnection()`, `deleteConnection()`
  - [x] Encriptación automática de config_json
- [x] `queries-repo.ts` (~200 líneas)
  - [x] `getQuery()`, `getQueriesByEntity()`, `getActiveQueryByEntity()`
  - [x] `createQuery()`, `updateQuery()`, `deleteQuery()`
  - [x] `updateQueryTestStatus()` para tracking de tests
- [x] `field-mappings-repo.ts` (~180 líneas)
  - [x] `getMappingsByQuery()`, `saveMappings()` con transacción
  - [x] Batch upsert (DELETE + INSERT)
- [x] `sync-state-repo.ts` (~190 líneas)
  - [x] `getSyncState()`, `getAllSyncStates()`
  - [x] `markSyncAsRunning()`, `markSyncAsSuccess()`, `markSyncAsError()`
  - [x] Tracking de lastSyncValue y totales
- [x] `retry-queue-repo.ts` (~300 líneas)
  - [x] `addToQueue()`, `getPendingRetries()`, `getRetryQueueItem()`
  - [x] `markAsProcessing()`, `markAsSuccess()`, `incrementAttempt()`
  - [x] `resetRetryItem()`, `deleteRetryItem()`, `deleteFailedItems()`
  - [x] Cálculo automático de nextRetryAt con backoff
- [x] `sync-logs-repo.ts` (~280 líneas)
  - [x] `createLog()`, `updateLog()`, `getLogs()`, `getLogById()`
  - [x] Filtros: entityType, status, dateFrom, dateTo
  - [x] `getRecentLogs()`, `getLogsByEntity()`, `getRecentStats()`
  - [x] `deleteOldLogs()` para limpieza
- [x] `notification-config-repo.ts` (~260 líneas)
  - [x] `getNotification()`, `getAllNotifications()`
  - [x] `getNotificationsForError()`, `getNotificationsForSuccess()`
  - [x] `createNotification()`, `updateNotification()`, `deleteNotification()`
  - [x] `testNotification()`, encriptación de config_json
- [x] `index.ts` - Exports centralizados con namespaces

**Commit:** d30f216
**Tiempo real:** ~10 horas
**Total código:** ~1,970 líneas

---

### 4️⃣ Adaptador SQL Server ✅ COMPLETADO

Creados **5 archivos** con patrón Strategy:

#### src/adapters/types.ts (~110 líneas)
- [x] Interface `IConnectionConfig`, `IQueryParams`, `IQueryResult`
- [x] Interface `IColumnInfo`, `TestResult`
- [x] Interface `IDataSourceAdapter` con 9 métodos:
  - [x] `readonly type`, `readonly displayName`, `readonly isConnected`
  - [x] `getConfigSchema()`, `connect()`, `disconnect()`
  - [x] `testConnection()`, `executeQuery()`
  - [x] `getTables()`, `getColumns()`, `getSampleData()`

#### src/adapters/base-adapter.ts (~310 líneas)
- [x] Clase abstracta `AbstractAdapter implements IDataSourceAdapter`
- [x] Template Method pattern con hooks:
  - [x] `beforeConnect()`, `afterConnect()`
  - [x] `beforeDisconnect()`, `afterDisconnect()`
- [x] Métodos abstractos: `doConnect()`, `doDisconnect()`, `doTestConnection()`, `doExecuteQuery()`
- [x] Logging integrado con contexto del adaptador
- [x] Validación automática con Zod schemas

#### src/adapters/sqlserver/ (~300 líneas)
- [x] `sqlserver-adapter.ts`
  - [x] Clase `SQLServerAdapter extends AbstractAdapter`
  - [x] Schema Zod para config completo
  - [x] Connection pool configurado (min: 1, max: 10)
  - [x] Implementación completa de todos los métodos
  - [x] `executeQuery()` con parámetros tipados
  - [x] `getTables()`, `getColumns()`, `getSampleData()`
  - [x] Soporte encrypt/trustServerCertificate
  - [x] Timeouts configurables
- [x] `index.ts` - Export del adaptador

#### src/adapters/index.ts (~60 líneas)
- [x] Factory pattern: `createAdapter(type)`
- [x] Registry: `ADAPTER_REGISTRY` con SQLServerAdapter
- [x] Helpers: `getAvailableAdapters()`, `isAdapterAvailable()`

**Commit:** 778c179
**Tiempo real:** ~8 horas
**Total código:** ~802 líneas

---

### 5️⃣ Cliente API Remoto ✅ COMPLETADO

Creados **5 archivos** para comunicación con backend remoto:

#### src/api-client/auth.ts (~240 líneas)
- [x] Clase `AuthManager` con JWT tokens
- [x] `login()` - Autenticación inicial con username/password
- [x] `getToken()` - Obtiene token válido (auto-refresh si necesario)
- [x] Auto-refresh 5 minutos antes de expiración
- [x] Protección contra refreshes concurrentes (single promise)
- [x] `hasValidToken()`, `clearTokens()`, `getCurrentToken()`

#### src/api-client/articulos-client.ts (~210 líneas)
- [x] Clase `ArticulosClient` para `/api/articulos/batch`
- [x] `sendBatch()` - Envía hasta 1000 artículos
- [x] `sendMultiple()` - División automática en batches
- [x] `validateBatch()` - Validación Zod antes de enviar
- [x] `testConnection()` - Prueba de conectividad

#### src/api-client/comprobantes-client.ts (~215 líneas)
- [x] Clase `ComprobantesClient` para `/api/comprobantes/batch`
- [x] Validación de estructura anidada (cabecera + detalles)
- [x] Misma estructura que ArticulosClient

#### src/api-client/pagos-client.ts (~200 líneas)
- [x] Clase `PagosClient` para `/api/pagos/batch`
- [x] Validación de asociación con comprobantes
- [x] Misma estructura que ArticulosClient

#### src/api-client/index.ts (~110 líneas)
- [x] Clase `APIClient` - Facade pattern
- [x] Propiedades públicas: `articulos`, `comprobantes`, `pagos`
- [x] `initialize()` - Realiza login inicial
- [x] `testConnection()`, `getToken()`, `logout()`, `getInfo()`

**Commit:** 32dd5ee
**Tiempo real:** ~6 horas
**Total código:** ~1,048 líneas

---

### 6️⃣ Motor de Sincronización ✅ COMPLETADO

Creados **6 archivos** que coordinan todo el proceso de sync:

#### src/sync/transformer.ts (~290 líneas)
- [x] `applyMappings()` - Aplica field mappings con transformaciones
- [x] Transformaciones: uppercase, lowercase, trim, number, date
- [x] `validateRequiredFields()` - Valida campos requeridos
- [x] `getMaxFieldValue()` - Obtiene último valor para sync incremental
- [x] `extractFieldValues()` - Extrae valores únicos
- [x] Manejo de valores por defecto y errores

#### src/sync/batch-processor.ts (~330 líneas)
- [x] `processBatches()` - Procesa items en batches con tamaño configurable
- [x] Características:
  - [x] Continuar en error (configurable)
  - [x] Callback de progreso en tiempo real
  - [x] Delay entre batches (rate limiting)
  - [x] Estadísticas: successful/failed/partial batches
- [x] `processBatchWithRetry()` - Reintentos con exponential backoff
- [x] `createSubBatches()`, `calculateBatchStats()`, `mergeBatchResults()`

#### src/sync/retry-queue-manager.ts (~370 líneas)
- [x] Clase `RetryQueueManager`
- [x] `addFailedBatch()` - Agrega batch fallido con metadata
- [x] `processRetries()` - Procesa reintentos pendientes automáticamente
- [x] `retryItem()`, `resetItem()`, `deleteItem()`
- [x] `cleanupSuccessfulItems()` - Limpieza de antiguos
- [x] `getStats()` - Estadísticas de la cola
- [x] Integración completa con RetryQueueRepo
- [x] Backoff: 1, 5, 15, 30, 60 minutos

#### src/sync/sync-engine.ts (~490 líneas)
- [x] Clase `SyncEngine` - Orquestador principal
- [x] `syncArticulos()`, `syncComprobantes()`, `syncPagos()`
- [x] `syncAll()` - Sincroniza todas las entidades en secuencia
- [x] `processRetries()` - Procesa cola de reintentos
- [x] Flujo completo de 10 pasos implementado:
  1. [x] Marca sync como running en SyncState
  2. [x] Crea log inicial en SyncLogs
  3. [x] Obtiene query activa y field mappings
  4. [x] Obtiene lastSyncValue para sync incremental
  5. [x] Ejecuta query en ERP con `adapter.executeQuery()`
  6. [x] Aplica transformaciones con `transformer.applyMappings()`
  7. [x] Envía en batches con `batch-processor.processBatches()`
  8. [x] Actualiza sync state con nuevo lastSyncValue
  9. [x] Actualiza sync log con resultados
  10. [x] Agrega fallos a retry queue
- [x] Soporte de sync incremental vs full sync
- [x] Manejo robusto de errores con rollback

#### src/sync/scheduler.ts (~330 líneas)
- [x] Clase `Scheduler` para programación automática
- [x] `start()` / `stop()` - Control del scheduler
- [x] `addJob()`, `removeJob()`, `enableJob()`, `disableJob()`
- [x] `runJobNow()` - Ejecución manual
- [x] Jobs basados en intervalos (simple para MVP)
- [x] Helpers predefinidos:
  - [x] `createSyncJob()`, `createRetryJob()`
  - [x] `createHourlySyncJobs()`, `createRetryProcessorJob()`
- [x] Tracking de lastRun y nextRun por job

#### src/sync/index.ts (~40 líneas)
- [x] Exports centralizados de todos los componentes
- [x] Tipos, interfaces y clases

**Commit:** 636bdcb
**Tiempo real:** ~10 horas
**Total código:** ~1,948 líneas

---

### 7️⃣ Dashboard Básico con Fastify + HTMX ✅ COMPLETADO

#### Fastify Setup
- [x] `src/index.ts`
  - [x] Inicializar Fastify
  - [x] Registrar plugins (@fastify/cookie, @fastify/session, @fastify/static, @fastify/view)
  - [x] Configurar EJS como view engine
  - [x] Configurar rutas estáticas (/static)
  - [x] Middleware de autenticación
  - [x] Error handler global
  - [x] Iniciar servidor en PORT

#### Autenticación
- [x] `src/services/auth-service.ts`
  - [x] Función `validateCredentials(username, password): Promise<User | null>`
  - [x] Función `changePassword(newPassword): Promise<boolean>`
  - [x] Función `ensureAdminExists(): Promise<void>` - Crear admin en primer inicio
  - [x] Session helpers (getUserFromSession, setUserInSession, clearUserFromSession)
- [x] `src/dashboard/routes/auth.ts`
  - [x] `GET /` - Redirigir a /login o /dashboard según autenticación
  - [x] `GET /login` - Renderizar login.ejs
  - [x] `POST /auth/login` - Validar credenciales, crear sesión
  - [x] `POST /auth/logout` - Cerrar sesión
  - [x] `GET /change-password` - Vista de cambio de password
  - [x] `POST /auth/change-password` - Cambiar password (primer inicio)

#### Views (EJS)
- [x] `src/dashboard/views/layouts/main.ejs`
  - [x] HTML base con Tailwind CSS (CDN)
  - [x] HTMX 2.0 script (CDN)
  - [x] Lucide icons (CDN)
  - [x] Nav bar con menú
  - [x] Contenedor para alerts con auto-close
  - [x] Slot para contenido
- [x] `src/dashboard/views/partials/nav.ejs` - Menú navegación con active states
- [x] `src/dashboard/views/partials/alert.ejs` - Componente de alertas (4 tipos)
- [x] `src/dashboard/views/auth/login.ejs` - Pantalla de login
- [x] `src/dashboard/views/auth/change-password.ejs` - Cambio de password
- [x] `src/dashboard/views/dashboard/index.ejs`
  - [x] Stats cards (Estado, Última Sync, Consultas, Reintentos)
  - [x] Quick actions (Sync, Queries, Connection)
  - [x] Recent activity placeholder
- [x] `src/dashboard/views/404.ejs` - Página 404 personalizada
- [x] `src/dashboard/views/error.ejs` - Página de error genérica

#### Rutas básicas
- [x] `src/dashboard/routes/dashboard.ts` - Dashboard principal
- [x] `src/dashboard/routes/config.ts`
  - [x] `GET /config` - Redirect a /config/connection
  - [x] `GET /config/connection` - Vista de configuración ERP
  - [x] `GET /config/queries` - Vista de gestión de consultas
  - [x] `GET /config/api` - Vista de configuración API
- [x] `src/dashboard/routes/sync.ts`
  - [x] `GET /sync` - Vista de sincronizaciones
  - [x] `GET /sync/retry-queue` - Vista de cola de reintentos
- [x] `src/dashboard/routes/logs.ts`
  - [x] `GET /logs` - Vista de logs de sincronización
- [x] `src/dashboard/routes/index.ts`
  - [x] Registrar todas las rutas en Fastify
  - [x] Middleware de autenticación en rutas protegidas

#### Middleware
- [x] `src/dashboard/middleware/auth.ts`
  - [x] `requireAuth()` - Verifica autenticación
  - [x] `requireNoPasswordChange()` - Verifica password cambiado

#### CSS y JS estáticos
- [x] `src/dashboard/static/css/custom.css` - Estilos custom, animaciones, scrollbar
- [x] `src/dashboard/static/js/app.js` - Tooltips, clipboard, notifications, validación

#### Type Definitions
- [x] `src/types/fastify.d.ts` - Module augmentation para reply.locals y session

**Commit:** b215109
**Tiempo real:** ~12 horas
**Total código:** ~2,211 líneas (TypeScript + EJS + CSS + JS)

**Notas:**
- Vistas config, sync y logs son placeholders "Próximamente" para MVP
- Funcionalidad completa (formularios, HTMX endpoints) se implementará en Fase 2
- Dashboard funcional con autenticación, navegación y estructura lista para expansión

---

### 8️⃣ Testing Básico (Prioridad: BAJA para MVP)
- [ ] Tests unitarios para utils (crypto, logger)
- [ ] Tests para repositorios (con DB en memoria)
- [ ] Tests de integración para sync-engine
- [ ] Tests para API client (con mocks)

**Estimación:** 6-8 horas
**Dependencias:** Todo lo anterior

---


## 🔴 ALTA PRIORIDAD: Sincronización de Comprobantes Atomizados

### Contexto
En enero 2026 se realizó la migración a arquitectura de comprobantes atomizados (ComprobanteCabecera, ComprobanteDetalle, ComprobantePagos como entidades independientes). Se implementó la arquitectura dual de campos:
- **Campos normalizados** (NOT NULL): `operacion`, `formulario`, `numero` - Clave para relaciones
- **Campos ERP metadata** (NULL): `erp_operacion`, `erp_formulario`, `erp_numero` - Valores originales del ERP para trazabilidad

**Estado actual:**
- ✅ ComprobanteCabecera: Schemas alineados entre objetiva-sync ↔ objetiva-sync-gateway ↔ PostgreSQL
- ⏳ ComprobanteDetalle: Pendiente implementación completa
- ⏳ ComprobantePagos: Pendiente implementación completa

### 9️⃣ ComprobanteCabecera - Implementación Completa ✅ COMPLETADO (2026-01-06)
- [x] Corregir schema Zod en gateway (`shared/schemas/comprobante.ts`)
  - [x] Cambiar campos requeridos de `erp_operacion/erp_formulario/erp_numero` a `operacion/formulario/numero`
  - [x] Marcar todos los campos `erp_*` como opcionales
  - [x] Mantener arquitectura dual de campos
- [x] Actualizar Prisma schema (`prisma/schema.prisma`)
  - [x] Usar camelCase en Prisma con `@map()` a snake_case en DB
  - [x] Agregar ambos sets de campos (normalizados + ERP metadata)
  - [x] Actualizar índice único con `operacion/formulario/numero`
- [x] Renombrar `ComprobantePago` → `ComprobantePagos` (plural) en todo el código
- [x] Actualizar servicio de ingestión en gateway (`src/services/ingestion.ts`)
  - [x] Mapear correctamente campos snake_case (Zod) → camelCase (Prisma)
  - [x] Usar clave compuesta `operacion/formulario/numero` para búsquedas
- [x] Actualizar field schemas en objetiva-sync (`src/dashboard/routes/api/mappings.ts`)
  - [x] Reemplazar lista hardcoded con arquitectura dual correcta
  - [x] Marcar campos requeridos: `operacion`, `formulario`, `numero`
- [x] Compilar y desplegar gateway exitosamente
- [x] Commit de cambios en ambos repositorios

**Commits:**
- objetiva-sync: `945085e` - Fix: Actualizar field schemas para arquitectura dual de campos
- objetiva-sync-gateway: Desplegado en VPS puerto 3335

**Tiempo real:** ~8 horas
**Fecha:** 2026-01-06

---

### 🔟 ComprobanteDetalle - Implementación Completa (PENDIENTE)
Aplicar el mismo proceso realizado para ComprobanteCabecera:

#### Configuración de Query y Mappings
- [ ] Crear query SQL en objetiva-sync para extraer detalles desde ERP
  - [ ] Definir campos a extraer (linea_numero, articulo_id, codigo_articulo, etc.)
  - [ ] Configurar campo incremental (si aplica)
  - [ ] Configurar relación con cabecera vía `operacion/formulario/numero`
- [ ] Configurar field mappings en dashboard
  - [ ] Mapear campos ERP → `operacion`, `formulario`, `numero` (REQUERIDOS)
  - [ ] Mapear valores originales → `erp_operacion`, `erp_formulario`, `erp_numero` (OPCIONALES)
  - [ ] Mapear resto de campos: `linea_numero`, `articulo_id`, `codigo_articulo`, `nombre_articulo`, etc.
  - [ ] Configurar transformaciones necesarias

#### Testing y Validación
- [ ] Ejecutar query de prueba desde dashboard
- [ ] Validar estructura de datos obtenidos
- [ ] Probar sincronización manual desde UI
- [ ] Verificar datos lleguen correctamente a gateway
  - [ ] Revisar logs de gateway para validación exitosa
  - [ ] Confirmar que Zod valida correctamente la estructura
- [ ] Verificar inserción en PostgreSQL
  - [ ] Validar que `operacion/formulario/numero` coincidan con cabecera
  - [ ] Validar que `comprobante_id` se vincule automáticamente (si corresponde)
  - [ ] Verificar todos los campos se guarden correctamente

**Estimación:** 3-4 horas
**Dependencias:** ComprobanteCabecera completado ✅
**Prioridad:** ALTA

---

### 1️⃣1️⃣ ComprobantePagos - Implementación Completa (PENDIENTE)
Aplicar el mismo proceso realizado para ComprobanteCabecera:

#### Configuración de Query y Mappings
- [ ] Crear query SQL en objetiva-sync para extraer pagos desde ERP
  - [ ] Definir campos a extraer (linea_numero, metodo_pago, monto, moneda, etc.)
  - [ ] Configurar campo incremental (si aplica)
  - [ ] Configurar relación con cabecera vía `operacion/formulario/numero`
- [ ] Configurar field mappings en dashboard
  - [ ] Mapear campos ERP → `operacion`, `formulario`, `numero` (REQUERIDOS)
  - [ ] Mapear valores originales → `erp_operacion`, `erp_formulario`, `erp_numero` (OPCIONALES)
  - [ ] Mapear resto de campos: `linea_numero`, `metodo_pago`, `monto`, `moneda`, etc.
  - [ ] Mapear campos opcionales de tarjeta: `tarjeta_marca`, `tarjeta_cuotas`, `tarjeta_recargo`
  - [ ] Mapear campos opcionales de cheque: `cheque_fecha_diferida`
  - [ ] Configurar transformaciones necesarias

#### Testing y Validación
- [ ] Ejecutar query de prueba desde dashboard
- [ ] Validar estructura de datos obtenidos
- [ ] Probar sincronización manual desde UI
- [ ] Verificar datos lleguen correctamente a gateway
  - [ ] Revisar logs de gateway para validación exitosa
  - [ ] Confirmar que Zod valida correctamente la estructura
- [ ] Verificar inserción en PostgreSQL
  - [ ] Validar que `operacion/formulario/numero` coincidan con cabecera
  - [ ] Validar que `comprobante_id` se vincule automáticamente (si corresponde)
  - [ ] Verificar todos los campos se guarden correctamente

**Estimación:** 3-4 horas
**Dependencias:** ComprobanteCabecera completado ✅
**Prioridad:** ALTA

---

### 1️⃣2️⃣ Estrategia de Debugging Gateway (PENDIENTE)
Implementar herramientas para tener "ojos en el otro extremo" de la sincronización y facilitar debugging.

#### Opción A: Endpoint de Inspección
- [ ] Crear endpoint `/api/debug/recent-requests` en gateway
  - [ ] Almacenar últimas N requests con body completo
  - [ ] Timestamp, origen, entity_type
  - [ ] Resultado de validación (success/errors)
  - [ ] Metadata de procesamiento
- [ ] Crear vista en objetiva-sync dashboard
  - [ ] Tabla con requests recientes
  - [ ] Expandir row para ver body completo
  - [ ] Filtrar por entity_type
  - [ ] Auto-refresh cada 5 segundos

#### Opción B: WebSocket Real-Time
- [ ] Implementar WebSocket en gateway
  - [ ] Emitir evento por cada request recibida
  - [ ] Enviar validación results en tiempo real
- [ ] Cliente WebSocket en objetiva-sync
  - [ ] Conectar durante sincronización manual
  - [ ] Mostrar eventos en tiempo real en UI

#### Opción C: Logs Estructurados Queryables
- [ ] Implementar endpoint `/api/debug/logs` en gateway
  - [ ] Consultar logs estructurados del gateway
  - [ ] Filtros: dateFrom, dateTo, level, entity_type
  - [ ] Paginación
- [ ] Crear vista de logs remotos en dashboard
  - [ ] Similar a logs locales pero consultando gateway
  - [ ] Correlación de logs locales + remotos
  - [ ] Timeline unificado

#### Decisión y Implementación
- [ ] Analizar opciones y decidir estrategia (o combinación)
- [ ] Implementar opción seleccionada
- [ ] Integrar en flujo de sincronización manual
- [ ] Documentar uso en AI-RULES.md

**Estimación:** 4-6 horas
**Prioridad:** MEDIA
**Beneficio:** Facilita enormemente el debugging de issues de sincronización

---

## 🟡 FASE 2: DASHBOARD COMPLETO (0% completado)

### Editor de Queries
- [ ] Vista con CodeMirror o similar (vía CDN)
- [ ] Syntax highlighting de SQL
- [ ] Botón "Probar query" con preview de resultados
- [ ] Selector de campo incremental
- [ ] Selector de campo join (para detalle/pagos)
- [ ] Guardar query

### Mapeo Visual de Campos
- [ ] Vista con dos columnas (origen → destino)
- [ ] Dropdown de campos origen (obtenidos del test de query)
- [ ] Lista de campos destino (según entity_type)
- [ ] Selector de transformación por campo
- [ ] Input de valor por defecto
- [ ] Indicador de campos requeridos
- [ ] Botón "Auto-mapear" (por similitud de nombres)
- [ ] Preview de transformación

### Logs Avanzados
- [ ] Vista con tabla paginada
- [ ] Filtros por entidad, estado, fecha
- [ ] Expandir row para ver detalles completos
- [ ] Gráficos de estadísticas (Chart.js vía CDN)

### Cola de Reintentos
- [ ] Vista de items pendientes
- [ ] Acciones por item (reintentar, descartar, ver payload)
- [ ] Filtro por estado
- [ ] Contador de intentos y próximo retry

**Estimación:** 15-20 horas

---

## 🟢 FASE 3: PRODUCCIÓN (0% completado)

### Polling Automático
- [ ] Implementar `src/sync/scheduler.ts` completo
- [ ] Configuración de intervalo desde config
- [ ] Iniciar/detener desde dashboard
- [ ] Indicador de próxima sync programada

### Notificaciones
- [ ] `src/notifications/slack.ts` - Envío a Slack webhook
- [ ] `src/notifications/telegram.ts` - Telegram bot API
- [ ] `src/notifications/pushover.ts` - Pushover API
- [ ] `src/notifications/webhook.ts` - Webhook genérico HTTP
- [ ] `src/notifications/index.ts` - NotificationManager que envía a canales habilitados
- [ ] Integrar en sync-engine para notificar errores/éxitos
- [ ] Vista de configuración de notificaciones en dashboard
- [ ] Test de notificación desde UI

### Servicio Windows
- [ ] `scripts/install-service.js` - Usar node-windows para instalar
- [ ] `scripts/uninstall-service.js` - Desinstalar servicio
- [ ] Documentación de instalación

### Robustez
- [ ] Manejo de edge cases (queries vacíos, conexión perdida, etc.)
- [ ] Validaciones exhaustivas
- [ ] Logs detallados de errores
- [ ] Graceful shutdown
- [ ] Health check endpoint

### Testing
- [ ] Coverage mínimo 70%
- [ ] Tests de integración completos
- [ ] Tests E2E del dashboard (opcional)

**Estimación:** 20-25 horas

---

## 🔵 FASE 4: EXTENSIBILIDAD (0% completado)

### Adaptadores Adicionales
- [ ] Adaptador PostgreSQL (`src/adapters/postgres/`)
- [ ] Adaptador MySQL (`src/adapters/mysql/`)
- [ ] Adaptador Excel (`src/adapters/excel/`)

### Mejoras de UI
- [ ] Diseño responsive mejorado
- [ ] Dark mode
- [ ] Mejores gráficos y estadísticas
- [ ] Exportación de logs a CSV

### Métricas Avanzadas
- [ ] Dashboard de métricas en tiempo real
- [ ] Histórico de performance
- [ ] Alertas configurables

**Estimación:** 30+ horas

---

## 📊 RESUMEN DE PROGRESO

### Completado: 100% ✅
- ✅ Documentación completa (8 archivos)
- ✅ Setup de proyecto (package.json, configs)
- ✅ Configuración de herramientas (TS, ESLint, Prettier, Drizzle)
- ✅ Estructura de carpetas completa
- ✅ Git inicializado (11 commits)
- ✅ Tipos TypeScript (5 archivos, ~700 líneas)
- ✅ Sistema de configuración (3 archivos, ~430 líneas)
- ✅ Módulo de utilidades (4 archivos, ~750 líneas)
- ✅ Database schema SQLite (8 tablas, 12 índices, migraciones)
- ✅ **Repositorios SQLite (9 archivos, ~1,970 líneas)**
- ✅ **Adaptador SQL Server (5 archivos, ~802 líneas)**
- ✅ **Cliente API Remoto (5 archivos, ~1,048 líneas)**
- ✅ **Motor de sincronización (6 archivos, ~1,948 líneas)**
- ✅ **Dashboard básico con Fastify + HTMX (25 archivos, ~2,211 líneas)**
- ✅ **ComprobanteCabecera - Alineación de schemas y arquitectura dual (2026-01-06)**

### Pendiente (Opcional):
- ⏳ Testing básico (opcional para MVP) - 6-8h

### Alta Prioridad:
- 🔴 ComprobanteDetalle - Configuración completa de query y mappings - 3-4h
- 🔴 ComprobantePagos - Configuración completa de query y mappings - 3-4h
- 🟡 Estrategia de debugging gateway - 4-6h

---

## 🎯 PRÓXIMOS PASOS INMEDIATOS (Orden sugerido)

1. ✅ ~~Crear tipos TypeScript base~~ (src/types/) - **COMPLETADO** (commit 1cea802)
2. ✅ ~~Implementar config y utilidades~~ (src/config/, src/utils/) - **COMPLETADO** (commits f017e67, 440b4c1)
3. ✅ ~~Crear schema de Drizzle~~ (src/store/schema.ts) - **COMPLETADO** (commit 8a69564)
4. ✅ ~~Implementar repositorios~~ (src/store/repositories/) - **COMPLETADO** (commit d30f216)
5. ✅ ~~Crear adaptador SQL Server~~ (src/adapters/sqlserver/) - **COMPLETADO** (commit 778c179)
6. ✅ ~~Implementar API client~~ (src/api-client/) - **COMPLETADO** (commit 32dd5ee)
7. ✅ ~~Crear motor de sync~~ (src/sync/) - **COMPLETADO** (commit 636bdcb)
8. ✅ ~~Desarrollar dashboard básico~~ (src/dashboard/) - **COMPLETADO** (commit b215109)
9. ✅ ~~Alinear schemas ComprobanteCabecera~~ - **COMPLETADO** (commit 945085e, 2026-01-06)
10. **🎯 Implementar ComprobanteDetalle** - Configurar query y mappings - 3-4h
11. **🎯 Implementar ComprobantePagos** - Configurar query y mappings - 3-4h
12. **🎯 Estrategia de debugging gateway** - Implementar monitoring - 4-6h

**Total estimado Fase 1 MVP:** 47-60 horas
**Completado hasta ahora:** ~63.5 horas (12 commits, ~10,879 líneas de código + alineación schemas)
**Pendiente alta prioridad:** ~10-14 horas (ComprobanteDetalle + ComprobantePagos + Debugging)

**Siguiente:** Completar sincronización de entidades atomizadas antes de continuar con Fase 2

---

**Última actualización:** 2026-01-06
