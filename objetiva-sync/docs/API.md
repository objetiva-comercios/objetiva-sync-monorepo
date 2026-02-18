# Documentación de API - Objetiva Sync

## APIs del Sistema

Este documento cubre dos tipos de APIs:
1. **API Interna del Dashboard** - Endpoints del dashboard HTMX para configuración y monitoreo
2. **API Remota (Backend)** - Endpoints del backend centralizado donde se envían los datos

---

## 1. API INTERNA DEL DASHBOARD

Base URL: `http://localhost:3000`

### Convenciones Generales
- Formato de respuesta: JSON (para endpoints AJAX) o HTML (para HTMX)
- Autenticación: Sesión con cookie HTTP-only
- Métodos: GET, POST, PUT, DELETE

---

### Autenticación

#### POST /auth/login
Login de administrador.

**Body:**
```json
{
  "username": "admin",
  "password": "tu_password"
}
```

**Response (success):**
```json
{
  "success": true,
  "message": "Login exitoso"
}
```

**Response (error):**
```json
{
  "success": false,
  "error": "Credenciales inválidas"
}
```

#### POST /auth/logout
Cerrar sesión.

**Response:**
```json
{
  "success": true,
  "message": "Sesión cerrada"
}
```

---

### Configuración

#### GET /api/config
Obtener configuración general del sistema.

**Response:**
```json
{
  "success": true,
  "data": {
    "remote_api_url": "https://api.objetiva.com",
    "active_adapter": "sqlserver",
    "sync_interval_minutes": 30,
    "batch_size": 100
  }
}
```

#### PUT /api/config
Actualizar configuración general.

**Body:**
```json
{
  "remote_api_url": "https://api.objetiva.com",
  "remote_api_username": "user",
  "remote_api_password": "pass",
  "sync_interval_minutes": 30,
  "batch_size": 100
}
```

**Response:**
```json
{
  "success": true,
  "message": "Configuración actualizada"
}
```

---

### Conexiones

#### GET /api/connections
Listar todas las conexiones configuradas.

**Response:**
```json
{
  "success": true,
  "data": [
    {
      "id": 1,
      "adapter_type": "sqlserver",
      "name": "Tango SQL Server",
      "is_active": 1,
      "test_status": "success",
      "tested_at": "2025-12-22T10:30:00Z"
    }
  ]
}
```

#### POST /api/connections
Crear nueva conexión.

**Body:**
```json
{
  "adapter_type": "sqlserver",
  "name": "Mi ERP",
  "config": {
    "server": "192.168.1.100",
    "port": 1433,
    "database": "ERP_DB",
    "user": "sa",
    "password": "password"
  }
}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "id": 1
  },
  "message": "Conexión creada"
}
```

#### POST /api/connections/:id/test
Probar conexión.

**Response:**
```json
{
  "success": true,
  "message": "Conexión exitosa",
  "details": {
    "server": "SQL Server 2019",
    "database": "ERP_DB"
  }
}
```

#### PUT /api/connections/:id/activate
Activar una conexión (desactiva las demás).

**Response:**
```json
{
  "success": true,
  "message": "Conexión activada"
}
```

#### DELETE /api/connections/:id
Eliminar conexión.

**Response:**
```json
{
  "success": true,
  "message": "Conexión eliminada"
}
```

---

### Queries

#### GET /api/queries
Listar todas las queries configuradas.

**Query params:**
- `entity_type` (opcional): Filtrar por tipo de entidad

**Response:**
```json
{
  "success": true,
  "data": [
    {
      "id": 1,
      "entity_type": "articulos",
      "name": "Artículos modificados",
      "sql_query": "SELECT...",
      "incremental_field": "art_modificado",
      "incremental_type": "date",
      "is_active": 1,
      "last_test_status": "success",
      "last_test_row_count": 150
    }
  ]
}
```

#### POST /api/queries
Crear nueva query.

**Body:**
```json
{
  "entity_type": "articulos",
  "name": "Artículos modificados",
  "sql_query": "SELECT art_codigo as sku, art_nombre as nombre FROM articulos WHERE art_modificado > :lastSync",
  "incremental_field": "art_modificado",
  "incremental_type": "date",
  "connectionId": 2
}
```

**Parámetros:**
| Campo | Tipo | Requerido | Descripción |
|-------|------|-----------|-------------|
| entity_type | string | Sí | Tipo de entidad: 'articulo', 'comprobante_cabecera', etc. |
| name | string | Sí | Nombre descriptivo de la query |
| sql_query | string | Sí | Query SQL con placeholder `:lastSync` |
| incremental_field | string | No | Campo para sync incremental |
| incremental_type | string | No | 'datetime' para campos de fecha |
| connectionId | number | No | ID de conexión específica (null = conexión activa) |

**Multi-Source Support:**
El parámetro `connectionId` permite especificar qué conexión de base de datos usar para esta query:
- Omitir o enviar `null`: usa la conexión activa global
- Enviar ID de conexión: usa esa conexión específica

**Response:**
```json
{
  "success": true,
  "data": {
    "id": 1
  },
  "message": "Query creada"
}
```

#### POST /api/queries/:id/test
Probar query con datos reales.

**Body:**
```json
{
  "lastSync": "2025-01-01T00:00:00Z"
}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "rows": [
      { "sku": "SKU001", "nombre": "Producto 1" },
      { "sku": "SKU002", "nombre": "Producto 2" }
    ],
    "rowCount": 2,
    "executionTimeMs": 125
  }
}
```

---

### Mapeos de Campos

#### GET /api/mappings
Listar mapeos de campos.

**Query params:**
- `query_id` (requerido): ID de la query

**Response:**
```json
{
  "success": true,
  "data": [
    {
      "id": 1,
      "query_id": 1,
      "source_field": "sku",
      "target_field": "sku",
      "transform_type": null,
      "is_required": 1
    },
    {
      "id": 2,
      "query_id": 1,
      "source_field": "nombre",
      "target_field": "nombre",
      "transform_type": "trim",
      "is_required": 1
    }
  ]
}
```

#### POST /api/mappings/batch
Crear/actualizar mapeos en batch.

**Body:**
```json
{
  "query_id": 1,
  "mappings": [
    {
      "source_field": "sku",
      "target_field": "sku",
      "is_required": 1
    },
    {
      "source_field": "nombre",
      "target_field": "nombre",
      "transform_type": "trim",
      "is_required": 1
    }
  ]
}
```

**Response:**
```json
{
  "success": true,
  "message": "Mapeos guardados"
}
```

---

### Sincronización

#### POST /api/sync/manual
Ejecutar sincronización manual.

**Body:**
```json
{
  "entity_type": "articulos",  // o "all" para todas
  "full_sync": false,           // true para full sync
  "from_date": null             // Solo si full_sync = true
}
```

**Response:**
```json
{
  "success": true,
  "message": "Sincronización iniciada",
  "data": {
    "job_id": "sync_123456"
  }
}
```

#### GET /api/sync/status
Obtener estado actual de sincronizaciones.

**Response:**
```json
{
  "success": true,
  "data": {
    "articulos": {
      "status": "idle",
      "last_sync_at": "2025-12-22T10:30:00Z",
      "last_sync_count": 150,
      "total_synced": 12500
    },
    "comprobantes": {
      "status": "running",
      "last_sync_at": "2025-12-22T09:00:00Z",
      "last_sync_count": 45,
      "total_synced": 8900
    }
  }
}
```

#### GET /api/sync/logs
Obtener historial de sincronizaciones.

**Query params:**
- `entity_type` (opcional): Filtrar por entidad
- `status` (opcional): Filtrar por estado
- `limit` (default: 50): Cantidad de registros
- `offset` (default: 0): Offset para paginación

**Response:**
```json
{
  "success": true,
  "data": {
    "logs": [
      {
        "id": 1,
        "entity_type": "articulos",
        "sync_type": "incremental",
        "status": "success",
        "records_fetched": 150,
        "records_sent": 150,
        "records_failed": 0,
        "duration_ms": 2500,
        "created_at": "2025-12-22T10:30:00Z"
      }
    ],
    "total": 1250,
    "limit": 50,
    "offset": 0
  }
}
```

---

### Cola de Reintentos

#### GET /api/retry-queue
Listar items en cola de reintentos.

**Query params:**
- `status` (opcional): 'pending', 'processing', 'failed', 'success'

**Response:**
```json
{
  "success": true,
  "data": [
    {
      "id": 1,
      "entity_type": "articulos",
      "attempt_count": 2,
      "max_attempts": 5,
      "last_error": "Network timeout",
      "next_retry_at": "2025-12-22T11:00:00Z",
      "status": "pending",
      "created_at": "2025-12-22T10:45:00Z"
    }
  ]
}
```

#### POST /api/retry-queue/:id/retry
Reintentar un item específico ahora.

**Response:**
```json
{
  "success": true,
  "message": "Reintento programado"
}
```

#### DELETE /api/retry-queue/:id
Descartar un item de la cola.

**Response:**
```json
{
  "success": true,
  "message": "Item descartado"
}
```

---

### Notificaciones

#### GET /api/notifications
Listar canales de notificación configurados.

**Response:**
```json
{
  "success": true,
  "data": [
    {
      "id": 1,
      "channel_type": "slack",
      "name": "Canal de Slack Principal",
      "is_enabled": 1,
      "notify_on_success": 0,
      "notify_on_error": 1,
      "notify_on_warning": 1
    }
  ]
}
```

#### POST /api/notifications
Crear canal de notificación.

**Body:**
```json
{
  "channel_type": "slack",
  "name": "Mi Canal",
  "config": {
    "webhookUrl": "https://hooks.slack.com/services/XXX"
  },
  "notify_on_error": 1,
  "notify_on_warning": 1
}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "id": 1
  },
  "message": "Canal creado"
}
```

#### POST /api/notifications/:id/test
Enviar notificación de prueba.

**Response:**
```json
{
  "success": true,
  "message": "Notificación enviada exitosamente"
}
```

---

## 2. API REMOTA (BACKEND)

Esta es la API del backend centralizado donde Objetiva Sync envía los datos.

Base URL: Configurada en el sistema (ej: `https://api.objetiva.com`)

### Autenticación

#### POST /api/auth/login
Obtener token JWT.

**Body:**
```json
{
  "username": "comercio_123",
  "password": "password"
}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
    "expiresIn": 3600
  }
}
```

**El token debe incluirse en todos los requests posteriores:**
```
Authorization: Bearer {token}
```

---

### Artículos

#### POST /api/articulos/batch
Enviar batch de artículos.

**Headers:**
```
Authorization: Bearer {token}
Content-Type: application/json
```

**Body:**
```json
{
  "articulos": [
    {
      "sku": "SKU001",
      "nombre": "Producto 1",
      "objeto": "producto",
      "precio": 1250.50,
      "rubro": "ELECTRONICA"
    },
    {
      "sku": "SKU002",
      "nombre": "Producto 2",
      "objeto": "producto",
      "precio": 850.00
    }
  ]
}
```

**Response (success):**
```json
{
  "success": true,
  "inserted": 1,
  "updated": 1,
  "errors": []
}
```

**Response (con errores parciales):**
```json
{
  "success": false,
  "inserted": 1,
  "updated": 0,
  "errors": [
    {
      "index": 1,
      "identifier": "SKU002",
      "error": "Campo 'objeto' es requerido",
      "code": "VALIDATION_ERROR"
    }
  ]
}
```

---

### Comprobantes

#### POST /api/comprobantes/batch
Enviar batch de comprobantes (con detalles embebidos).

**Headers:**
```
Authorization: Bearer {token}
Content-Type: application/json
```

**Body:**
```json
{
  "comprobantes": [
    {
      "tipo": "FACTURA",
      "comprobante": "A-0001-00001234",
      "fecha": "2025-12-22T10:30:00Z",
      "tercero_nombre": "Cliente SA",
      "tercero_documento": "30-12345678-9",
      "total": 1210.00,
      "detalles": [
        {
          "linea_numero": 1,
          "codigo_articulo": "SKU001",
          "nombre_articulo": "Producto 1",
          "unidades": 2,
          "precio_unitario": 500.00,
          "total": 1000.00
        },
        {
          "linea_numero": 2,
          "codigo_articulo": "SKU002",
          "nombre_articulo": "Producto 2",
          "unidades": 1,
          "precio_unitario": 210.00,
          "total": 210.00
        }
      ]
    }
  ]
}
```

**Response:**
```json
{
  "success": true,
  "inserted": 1,
  "updated": 0,
  "detalles_inserted": 2,
  "errors": []
}
```

---

### Pagos

#### POST /api/comprobantes/pagos/batch
Enviar batch de pagos (separados de comprobantes).

**Headers:**
```
Authorization: Bearer {token}
Content-Type: application/json
```

**Body:**
```json
{
  "pagos": [
    {
      "comprobante": "A-0001-00001234",
      "medio": "EFECTIVO",
      "monto": 500.00,
      "moneda": "ARS"
    },
    {
      "comprobante": "A-0001-00001234",
      "medio": "TARJETA",
      "monto": 710.00,
      "moneda": "ARS",
      "tarjeta_marca": "VISA",
      "tarjeta_cuotas": 3
    }
  ]
}
```

**Response:**
```json
{
  "success": true,
  "inserted": 2,
  "updated": 0,
  "errors": []
}
```

---

## Códigos de Error Comunes

### API Interna (Dashboard)
- `400` - Bad Request (validación fallida)
- `401` - No autenticado
- `403` - No autorizado
- `404` - Recurso no encontrado
- `500` - Error interno del servidor

### API Remota (Backend)
- `400` - Validación fallida
- `401` - Token inválido o expirado
- `403` - Sin permisos
- `409` - Conflicto (ej: duplicado)
- `422` - Errores de validación con detalles
- `500` - Error del servidor
- `503` - Servicio no disponible

---

## Rate Limiting

**API Remota:**
- Límite: 100 requests por minuto
- Header de respuesta: `X-RateLimit-Remaining`
- Si se excede: `429 Too Many Requests`

**Recomendación:** Objetiva Sync maneja automáticamente el rate limiting con reintentos y backoff exponencial.

---

*Este documento se actualizará a medida que se implementen nuevos endpoints*
