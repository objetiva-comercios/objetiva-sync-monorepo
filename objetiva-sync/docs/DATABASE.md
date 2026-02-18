# Especificación de Base de Datos - Objetiva Sync

## Base de Datos: SQLite

Objetiva Sync utiliza **SQLite** (via `better-sqlite3`) como almacén de estado local. SQLite es ideal para este caso de uso porque:
- No requiere servidor adicional
- Embedded en la aplicación
- Suficiente para el volumen de datos (configuración y logs)
- Fácil backup (un solo archivo)

---

## Esquema Completo

### Tabla: `config`
Configuración general del sincronizador.

```sql
CREATE TABLE config (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL,
    encrypted INTEGER DEFAULT 0,  -- 1 si el valor está encriptado (AES-256-GCM)
    updated_at TEXT DEFAULT CURRENT_TIMESTAMP
);
```

**Valores esperados en `key`:**
- `admin_password_hash` - Hash bcrypt del password del admin
- `remote_api_url` - URL base del backend remoto (ej: `https://api.example.com`)
- `remote_api_credentials` - JSON encriptado `{username, password}` para obtener JWT
- `active_adapter` - Nombre del adaptador activo (ej: `sqlserver`)
- `sync_interval_minutes` - Intervalo de polling (0 = desactivado)
- `batch_size` - Tamaño de lote para envío (default: 100)

**Ejemplo de datos:**
```sql
INSERT INTO config (key, value, encrypted) VALUES
('admin_password_hash', '$2b$12$...', 0),
('remote_api_url', 'https://api.objetiva.com', 0),
('remote_api_credentials', 'encrypted_json_here', 1),
('active_adapter', 'sqlserver', 0),
('sync_interval_minutes', '30', 0),
('batch_size', '100', 0);
```

---

### Tabla: `connection_config`
Configuración de conexión al origen de datos (ERP, SQL Server, etc.)

```sql
CREATE TABLE connection_config (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    adapter_type TEXT NOT NULL,           -- 'sqlserver', 'postgres', 'mysql', 'excel'
    name TEXT NOT NULL,                   -- Nombre descriptivo (ej: "Tango SQL Server")
    config_json TEXT NOT NULL,            -- JSON encriptado con credenciales de conexión
    is_active INTEGER DEFAULT 0,          -- Solo una conexión puede estar activa (1)
    test_status TEXT,                     -- 'success', 'failed', null
    test_message TEXT,                    -- Mensaje del último test
    tested_at TEXT,                       -- Timestamp del último test
    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_connection_config_active ON connection_config(is_active);
```

**Ejemplo de `config_json` para SQL Server:**
```json
{
  "server": "192.168.1.100",
  "port": 1433,
  "database": "ERP_DB",
  "user": "sa",
  "password": "xxx",
  "options": {
    "encrypt": false,
    "trustServerCertificate": true
  }
}
```

---

### Tabla: `queries`
Consultas SQL configuradas para cada entidad (artículos, comprobantes, etc.)

```sql
CREATE TABLE queries (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    entity_type TEXT NOT NULL,            -- 'articulos', 'comprobantes', 'comprobantes_detalle', 'pagos'
    name TEXT NOT NULL,                   -- Nombre descriptivo (ej: "Artículos modificados")
    sql_query TEXT NOT NULL,              -- Query SQL con placeholder :lastSync
    incremental_field TEXT,               -- Campo para sync incremental (ej: "art_modificado")
    incremental_type TEXT,                -- 'date' o 'id'
    join_field TEXT,                      -- Campo para unir con entidad padre (solo detalle/pagos)
    connection_id INTEGER,                -- FK a connection_config.id (null = usar conexión activa)
    is_active INTEGER DEFAULT 1,
    display_order INTEGER DEFAULT 0,      -- Orden de ejecución
    sync_interval INTEGER DEFAULT 1800,   -- Intervalo de sync en segundos
    is_scheduled INTEGER DEFAULT 0,       -- Si está programada en scheduler
    last_test_status TEXT,                -- 'success', 'failed', null
    last_test_at TEXT,
    last_test_row_count INTEGER,          -- Cantidad de filas del último test
    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (connection_id) REFERENCES connection_config(id) ON DELETE SET NULL
);

CREATE INDEX idx_queries_entity_type ON queries(entity_type);
CREATE INDEX idx_queries_active ON queries(is_active);
CREATE INDEX idx_queries_connection ON queries(connection_id);
```

**Multi-Source Support:**
El campo `connection_id` permite que cada query especifique su propia conexión de base de datos. Esto habilita sincronización multi-origen:
- Si `connection_id` es NULL: usa la conexión activa global
- Si `connection_id` tiene valor: usa esa conexión específica

Ejemplo: "Artículos de SQL Server" (connection_id=1) y "Artículos de PostgreSQL" (connection_id=2)

**Entidades soportadas:**
- `articulos` - Maestro de artículos
- `comprobantes` - Cabeceras de comprobantes
- `comprobantes_detalle` - Líneas/items de comprobantes
- `pagos` - Pagos asociados a comprobantes

**Ejemplo de query para artículos:**
```sql
SELECT
  art_codigo as sku,
  art_nombre as nombre,
  art_precio as precio,
  art_rubro as rubro,
  art_modificado
FROM articulos
WHERE art_modificado > :lastSync
ORDER BY art_modificado ASC
```

**Ejemplo de query para cabeceras de comprobantes:**
```sql
SELECT
  comp_tipo as tipo,
  comp_numero as comprobante,
  comp_fecha as fecha,
  cli_nombre as tercero_nombre,
  cli_cuit as tercero_documento,
  comp_total as total,
  comp_id as erp_id_comprobante,
  comp_modificado
FROM comprobantes
LEFT JOIN clientes ON comp_cliente_id = cli_id
WHERE comp_modificado > :lastSync
ORDER BY comp_modificado ASC
```

**Ejemplo de query para detalle de comprobantes:**
```sql
SELECT
  comp_numero as comprobante,           -- ← Campo de asociación (join_field)
  det_linea as linea_numero,
  art_codigo as codigo_articulo,
  det_descripcion as nombre_articulo,
  det_cantidad as unidades,
  det_precio as precio_unitario,
  det_total as total
FROM comprobantes_detalle
JOIN comprobantes ON det_comp_id = comp_id
WHERE comp_modificado > :lastSync
ORDER BY comp_numero, det_linea
```

**Ejemplo de query para pagos:**
```sql
SELECT
  comp_numero as comprobante,           -- ← Campo de asociación (join_field)
  pago_medio as medio,
  pago_monto as monto,
  pago_tarjeta_marca as tarjeta_marca,
  pago_cuotas as tarjeta_cuotas
FROM comprobantes_pagos
JOIN comprobantes ON pago_comp_id = comp_id
WHERE comp_modificado > :lastSync
```

---

### Tabla: `field_mappings`
Mapeo de campos origen → destino con transformaciones opcionales.

```sql
CREATE TABLE field_mappings (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    query_id INTEGER NOT NULL,            -- FK a queries.id
    source_field TEXT NOT NULL,           -- Nombre del campo en query origen (ej: "art_codigo")
    target_field TEXT NOT NULL,           -- Nombre del campo en API destino (ej: "sku")
    transform_type TEXT,                  -- null, 'uppercase', 'lowercase', 'trim', 'number', 'date'
    default_value TEXT,                   -- Valor por defecto si source es null
    is_required INTEGER DEFAULT 0,        -- 1 si el campo es obligatorio
    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (query_id) REFERENCES queries(id) ON DELETE CASCADE
);

CREATE INDEX idx_field_mappings_query_id ON field_mappings(query_id);
```

**Ejemplo de mapeos para artículos:**
```sql
-- Para query_id = 1 (artículos)
INSERT INTO field_mappings (query_id, source_field, target_field, transform_type, is_required) VALUES
(1, 'sku', 'sku', null, 1),
(1, 'nombre', 'nombre', 'trim', 1),
(1, 'precio', 'precio', 'number', 0),
(1, 'rubro', 'rubro', 'uppercase', 0);
```

**Transformaciones soportadas:**
- `null` - Sin transformación
- `uppercase` - Convertir a mayúsculas
- `lowercase` - Convertir a minúsculas
- `trim` - Eliminar espacios al inicio/fin
- `number` - Convertir a número
- `date` - Convertir a formato ISO 8601

---

### Tabla: `sync_state`
Estado de sincronización por entidad.

```sql
CREATE TABLE sync_state (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    entity_type TEXT NOT NULL UNIQUE,     -- 'articulos', 'comprobantes', 'comprobantes_detalle', 'pagos'
    last_sync_value TEXT,                 -- Último valor sincronizado (fecha ISO o ID)
    last_sync_at TEXT,                    -- Timestamp de última sync exitosa (ISO 8601)
    last_sync_count INTEGER,              -- Registros enviados en última sync
    total_synced INTEGER DEFAULT 0,       -- Total histórico sincronizado
    status TEXT DEFAULT 'idle',           -- 'idle', 'running', 'error'
    error_message TEXT,                   -- Mensaje del último error
    updated_at TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE UNIQUE INDEX idx_sync_state_entity_type ON sync_state(entity_type);
```

**Nota importante:**
- `comprobantes_detalle` comparte el `last_sync_value` con `comprobantes` ya que se sincronizan juntos
- Se mantiene separado para tracking de contadores (`total_synced`, `last_sync_count`)

**Ejemplo de datos:**
```sql
INSERT INTO sync_state (entity_type, last_sync_value, last_sync_at, total_synced, status) VALUES
('articulos', '2025-12-22T10:30:00Z', '2025-12-22T10:35:00Z', 1250, 'idle'),
('comprobantes', '2025-12-22T10:00:00Z', '2025-12-22T10:33:00Z', 450, 'idle'),
('pagos', '2025-12-22T10:00:00Z', '2025-12-22T10:34:00Z', 780, 'idle');
```

---

### Tabla: `retry_queue`
Cola de reintentos para envíos fallidos.

```sql
CREATE TABLE retry_queue (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    entity_type TEXT NOT NULL,            -- 'articulos', 'comprobantes', 'pagos'
    payload TEXT NOT NULL,                -- JSON del batch a reintentar
    attempt_count INTEGER DEFAULT 0,      -- Intentos realizados
    max_attempts INTEGER DEFAULT 5,       -- Máximo de intentos
    last_error TEXT,                      -- Mensaje del último error
    next_retry_at TEXT,                   -- Timestamp del próximo reintento
    status TEXT DEFAULT 'pending',        -- 'pending', 'processing', 'failed', 'success'
    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_retry_queue_status ON retry_queue(status);
CREATE INDEX idx_retry_queue_next_retry ON retry_queue(next_retry_at);
```

**Backoff exponencial:**
- Intento 1: 1 minuto
- Intento 2: 5 minutos
- Intento 3: 15 minutos
- Intento 4: 30 minutos
- Intento 5: 1 hora
- Después de 5 intentos: `status = 'failed'`

---

### Tabla: `sync_logs`
Historial de todas las sincronizaciones.

```sql
CREATE TABLE sync_logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    entity_type TEXT NOT NULL,            -- 'articulos', 'comprobantes', 'pagos'
    sync_type TEXT NOT NULL,              -- 'incremental', 'full', 'manual', 'retry'
    status TEXT NOT NULL,                 -- 'started', 'success', 'partial', 'failed'
    records_fetched INTEGER DEFAULT 0,    -- Registros obtenidos del origen
    records_sent INTEGER DEFAULT 0,       -- Registros enviados exitosamente
    records_failed INTEGER DEFAULT 0,     -- Registros fallidos
    duration_ms INTEGER,                  -- Duración en milisegundos
    error_message TEXT,                   -- Mensaje de error (si aplica)
    details TEXT,                         -- JSON con detalles adicionales
    created_at TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_sync_logs_created ON sync_logs(created_at DESC);
CREATE INDEX idx_sync_logs_entity ON sync_logs(entity_type, created_at DESC);
CREATE INDEX idx_sync_logs_status ON sync_logs(status);
```

**Ejemplo de datos:**
```sql
INSERT INTO sync_logs (entity_type, sync_type, status, records_fetched, records_sent, duration_ms) VALUES
('articulos', 'incremental', 'success', 150, 150, 2500),
('comprobantes', 'manual', 'success', 45, 45, 3200),
('pagos', 'retry', 'failed', 10, 0, 1500);
```

---

### Tabla: `notification_config`
Configuración de canales de notificación.

```sql
CREATE TABLE notification_config (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    channel_type TEXT NOT NULL,           -- 'slack', 'telegram', 'pushover', 'webhook'
    name TEXT NOT NULL,                   -- Nombre descriptivo
    config_json TEXT NOT NULL,            -- JSON encriptado con credenciales
    is_enabled INTEGER DEFAULT 1,         -- 1 = habilitado, 0 = deshabilitado
    notify_on_success INTEGER DEFAULT 0,  -- Notificar en sincronización exitosa
    notify_on_error INTEGER DEFAULT 1,    -- Notificar en error
    notify_on_warning INTEGER DEFAULT 1,  -- Notificar en advertencia
    test_status TEXT,                     -- 'success', 'failed', null
    tested_at TEXT,                       -- Timestamp del último test
    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_notification_config_enabled ON notification_config(is_enabled);
```

**Ejemplos de `config_json` por tipo:**

**Slack:**
```json
{
  "webhookUrl": "https://hooks.slack.com/services/XXX/YYY/ZZZ"
}
```

**Telegram:**
```json
{
  "botToken": "123456:ABC-DEF1234ghIkl-zyx57W2v1u123ew11",
  "chatId": "123456789"
}
```

**Pushover:**
```json
{
  "userKey": "uQiRzpo4DXghDmr9QzzfQu27cmVRsG",
  "appToken": "azGDORePK8gMaC0QOYAMyEEuzJnyUi"
}
```

**Webhook genérico:**
```json
{
  "url": "https://mi-server.com/webhook",
  "method": "POST",
  "headers": {
    "Authorization": "Bearer token123"
  }
}
```

---

## Queries Comunes

### Obtener configuración activa

```sql
SELECT * FROM config;
```

### Obtener conexión activa

```sql
SELECT * FROM connection_config WHERE is_active = 1 LIMIT 1;
```

### Obtener último estado de sync

```sql
SELECT * FROM sync_state WHERE entity_type = 'articulos';
```

### Logs de las últimas 24 horas

```sql
SELECT *
FROM sync_logs
WHERE created_at > datetime('now', '-1 day')
ORDER BY created_at DESC;
```

### Items pendientes en retry queue

```sql
SELECT *
FROM retry_queue
WHERE status = 'pending'
  AND next_retry_at <= datetime('now')
ORDER BY next_retry_at ASC;
```

### Estadísticas de sincronización

```sql
SELECT
  entity_type,
  COUNT(*) as total_syncs,
  SUM(records_sent) as total_records,
  SUM(CASE WHEN status = 'success' THEN 1 ELSE 0 END) as successful_syncs,
  SUM(CASE WHEN status = 'failed' THEN 1 ELSE 0 END) as failed_syncs,
  AVG(duration_ms) as avg_duration_ms
FROM sync_logs
WHERE created_at > datetime('now', '-7 days')
GROUP BY entity_type;
```

---

## Migraciones con Drizzle

Las migraciones se gestionarán con **Drizzle Kit**:

```bash
# Generar migración
npm run db:generate

# Aplicar migraciones
npm run db:migrate

# Ver DB en navegador
npm run db:studio
```

Drizzle generará automáticamente las migraciones basadas en el schema definido en `src/store/schema.ts`.

---

## Backup y Mantenimiento

### Backup

El archivo `database/objetiva-sync.db` puede copiarse directamente:

```bash
# Backup manual
cp database/objetiva-sync.db database/backup/objetiva-sync-$(date +%Y%m%d).db

# Backup automático (agregar a scripts)
```

### Vacuum (optimización)

```sql
-- Compactar base de datos
VACUUM;

-- Analizar para optimizar queries
ANALYZE;
```

### Limpieza de logs antiguos

```sql
-- Eliminar logs de más de 90 días
DELETE FROM sync_logs
WHERE created_at < datetime('now', '-90 days');

-- Eliminar retry queue completados de más de 30 días
DELETE FROM retry_queue
WHERE status IN ('success', 'failed')
  AND updated_at < datetime('now', '-30 days');
```

---

## Seguridad

### Encriptación de Datos Sensibles

Los siguientes campos se encriptan con **AES-256-GCM**:
- `config.value` (cuando `encrypted = 1`)
- `connection_config.config_json`
- `notification_config.config_json`

**Clave de encriptación:**
- Variable de entorno `ENCRYPTION_KEY`
- Se genera automáticamente al primer inicio si no existe
- Se guarda en `.env`

**IMPORTANTE:** No perder el `ENCRYPTION_KEY` o los datos encriptados serán irrecuperables.

---

## Índices y Performance

Todos los índices ya están especificados en las definiciones de tablas arriba. Resumen:

- `idx_connection_config_active` - Búsqueda de conexión activa
- `idx_queries_entity_type` - Búsqueda por tipo de entidad
- `idx_queries_active` - Filtro de queries activas
- `idx_field_mappings_query_id` - Join con queries
- `idx_sync_state_entity_type` - Unique constraint y búsqueda
- `idx_retry_queue_status` - Filtro por estado
- `idx_retry_queue_next_retry` - Job de reintentos
- `idx_sync_logs_created` - Logs ordenados por fecha
- `idx_sync_logs_entity` - Logs por entidad y fecha
- `idx_sync_logs_status` - Filtro por estado
- `idx_notification_config_enabled` - Filtro de canales habilitados

---

## Tamaño Estimado

Para un comercio típico:
- **Config y conexiones**: < 1 KB
- **Queries y mapeos**: < 10 KB
- **Sync state**: < 1 KB
- **Retry queue**: Variable (típicamente < 100 KB)
- **Sync logs** (1 año): ~1-5 MB
- **Total estimado**: 5-10 MB

El archivo SQLite puede crecer, pero se puede mantener con limpieza periódica de logs antiguos.
