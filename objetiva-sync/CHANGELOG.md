# Changelog - Objetiva Sync

Todos los cambios notables en este proyecto serán documentados en este archivo.

El formato está basado en [Keep a Changelog](https://keepachangelog.com/es-ES/1.0.0/),
y este proyecto adhiere a [Semantic Versioning](https://semver.org/lang/es/).

## [1.1.0] - 2025-12-28

### Agregado
- **Sistema de Almacenamiento de Lotes por Archivo** - Los lotes de sincronización ahora se guardan en archivos JSON individuales en lugar de en la base de datos
  - Nuevo módulo `src/utils/batch-storage.ts` con funciones completas de gestión de archivos
  - Estructura de archivos: `./database/logs/{log_id}/batch_{N}.json`
  - Cada archivo contiene: número de lote, registros, conteo y timestamp

- **Paginación Completa en Modal de Logs** - Los usuarios pueden navegar entre todos los lotes de una sincronización
  - Botones "Anterior" y "Siguiente" en el modal
  - Indicador de "Lote X de Y" con conteo de registros
  - Tabla mostrando TODOS los campos de cada registro
  - Numeración global de registros (no solo por lote)

- **Nuevos Endpoints API**:
  - `GET /api/logs/:id/batch/:batchNumber` - Obtener lote específico
  - `GET /api/logs/:id/batches/count` - Contar total de lotes
  - `GET /api/logs/:id/details?batch=N` - Ver detalles con paginación

- **Documentación Completa**:
  - `docs/BATCH-STORAGE.md` - Documentación técnica completa (700+ líneas)
  - Actualizado `docs/ACTIVIDAD.md` con registro detallado

### Modificado
- **src/sync/batch-processor.ts**:
  - Agregado guardado automático de lotes después de procesarlos
  - Nuevas opciones: `logId` y `saveBatches` en `BatchProcessorOptions`
  - Manejo de errores sin detener la sincronización

- **src/sync/sync-engine.ts**:
  - Habilitado `saveBatches: true` en opciones de batch
  - Removido `sampleRecords` del metadata guardado en BD
  - Agregado indicador `batchesStoredInFiles: true`

- **src/dashboard/routes/api/logs.ts**:
  - Endpoint de detalles ahora soporta parámetro `?batch=N`
  - Modal renderiza con paginación y navegación dinámica
  - JavaScript para navegación con HTMX sin recarga de página

### Eliminado
- Campo `sampleRecords` en metadata de `sync_logs` (ahora en archivos)

### Corregido
- **Problema**: Solo se mostraban 100 registros en logs aunque se transfirieran 1000+
- **Solución**: Sistema de archivos permite ver TODOS los registros con paginación

### Rendimiento
- Base de datos ya no se sobrecarga con miles de registros en campo JSON
- Archivos JSON organizados jerárquicamente por `log_id`
- Carga bajo demanda de lotes (solo se lee el lote actual)

### Seguridad
- Validación de parámetros `batch` para evitar acceso fuera de rango
- Manejo seguro de archivos con verificación de existencia

---

## [1.0.0] - 2025-12-22

### Agregado
- Setup inicial completo del proyecto Objetiva Sync
- Arquitectura de tres capas (Presentación, Negocio, Datos)
- Dashboard interno con Fastify + EJS + HTMX + Tailwind
- Sistema de sincronización con adaptadores ERP
- Base de datos SQLite con Drizzle ORM
- Sistema de autenticación con bcrypt
- Logging con Pino
- Scheduler con node-cron
- Documentación técnica completa
- Scripts npm para desarrollo y producción

### Características Principales
- Sincronización de Artículos, Comprobantes y Pagos
- Sistema de field mappings dinámico
- Procesamiento por lotes (batch processing)
- Gestión de errores y reintentos
- Dashboard web responsive
- API REST interna
- Configuración por entorno (.env)

---

**Formato de versiones**: [MAJOR.MINOR.PATCH]
- **MAJOR**: Cambios incompatibles en la API
- **MINOR**: Nuevas funcionalidades compatibles
- **PATCH**: Correcciones de bugs compatibles
