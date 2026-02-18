# End-to-End Real Sync Tests

Pruebas de integración **reales** entre `objetiva-sync` y `objetiva-sync-gateway` que verifican el flujo completo de sincronización con conexiones reales a SQL Server y PostgreSQL.

## Qué hacen estas pruebas

Las pruebas E2E ejecutan un flujo completo real:

1. **Conectan con SQL Server real** - usando el adapter configurado
2. **Ejecutan consulta SQL** - toma una consulta activa o crea una por defecto
3. **Sincronizan datos** - envía registros al gateway a través del API client real
4. **Verifican en PostgreSQL** - confirma que los datos llegaron correctamente
5. **Validan logs y estado** - verifica que sync_logs y sync_state se actualizaron

**Diferencia con tests de integración normales:**
- Tests normales (`tests/integration/`) usan **mocks** (API client mock, adapter mock, test DB)
- Tests E2E (`tests/e2e/`) usan **servicios reales** (SQL Server real, Gateway real, PostgreSQL real)

## Pre-requisitos

Antes de ejecutar las pruebas E2E, asegúrate de tener:

### 1. objetiva-sync-gateway corriendo

```bash
cd objetiva-sync-gateway
npm run dev
```

El gateway debe estar escuchando en `http://localhost:3335` (puerto configurado en `GATEWAY_URL`)

### 2. PostgreSQL corriendo

El gateway debe tener conexión activa a PostgreSQL. Verifica `DATABASE_URL` en `.env` del gateway.

### 3. SQL Server accesible

El sync debe tener conexión configurada a SQL Server:
- Configuración guardada en SQLite (`sync.db` → tabla `connection_config`)
- O puedes configurarla a través del dashboard web

### 4. Variables de entorno

En `objetiva-sync/.env`:

```env
# Gateway connection
GATEWAY_URL=http://localhost:3335
SYNC_USERNAME=admin
SYNC_PASSWORD=your-password

# JWT authentication
JWT_SECRET=your-shared-secret

# Optional: Direct PostgreSQL access for verification
GATEWAY_DATABASE_URL=postgresql://user:password@localhost:5432/dbname
```

## Ejecución

### Opción 1: Scripts npm (recomendado)

```bash
# Test de articulos (por defecto)
npm run test:e2e

# Test de cada entidad específica
npm run test:e2e:articulos
npm run test:e2e:cabecera
npm run test:e2e:detalle
npm run test:e2e:pagos
```

### Opción 2: Ejecución directa

```bash
# Articulos (por defecto)
npx tsx tests/e2e/real-sync-test.ts

# Entidad específica
npx tsx tests/e2e/real-sync-test.ts articulos
npx tsx tests/e2e/real-sync-test.ts comprobantes_cabecera
npx tsx tests/e2e/real-sync-test.ts comprobantes_detalle
npx tsx tests/e2e/real-sync-test.ts comprobantes_pagos
```

## Qué esperar

### Salida exitosa

```
==============================================================
  E2E Real Sync Test - objetiva-sync → objetiva-sync-gateway
==============================================================

✓ Environment loaded
ℹ Testing entity: articulos

==============================================================
  STEP 1: Query Configuration
==============================================================

ℹ Using existing query: Todos los articulos (ID: 1)
ℹ Query ID: 1
ℹ Query Name: Todos los articulos
ℹ SQL: SELECT * FROM articulos

==============================================================
  STEP 2: Initialize Sync Engine
==============================================================

✓ Connected to SQL Server
✓ API client created (will connect to real gateway)
✓ Sync engine initialized

==============================================================
  STEP 3: Execute Sync
==============================================================

ℹ Starting full sync...
✓ Sync completed: SUCCESS
ℹ   - Records fetched: 1247
ℹ   - Records sent: 1247
ℹ   - Records failed: 0
ℹ   - Duration: 8523ms

==============================================================
  STEP 4: Verify Sync Logs
==============================================================

✓ Sync log created successfully
ℹ   Log ID: 42
ℹ   Status: success
ℹ   Created at: 2026-02-02T18:30:00.000Z

==============================================================
  STEP 5: Verify Sync State
==============================================================

✓ Sync state updated
ℹ   Last sync: 2026-02-02T18:30:00.000Z
ℹ   Records synced: 1247
ℹ   Total synced: 5823

==============================================================
  STEP 6: Verify Data in PostgreSQL Gateway
==============================================================

ℹ Connecting to PostgreSQL to verify records...
✓ Found 1247 records in PostgreSQL
ℹ Sample records (showing 3):
  1. {
       "id": "1234567890",
       "erp_codigo": "ART-001",
       "nombre": "Producto de prueba",
       "precio": "15000.00",
       "erp_sincronizado": true,
       "erp_fecha_sync": "2026-02-02T18:30:00.000Z"
     }
  ...

==============================================================
  STEP 7: Final Validation
==============================================================

✓ Sync completed successfully
✓ Records were fetched
✓ Records were sent to gateway
✓ Data exists in PostgreSQL
✓ No complete failure

==============================================================
  TEST SUMMARY
==============================================================

Entity: articulos
Query: Todos los articulos (ID: 1)
Status: SUCCESS

Sync Results:
  - Fetched: 1247
  - Sent: 1247
  - Failed: 0
  - Duration: 8523ms

Gateway Verification:
  - Records in PostgreSQL: 1247

✓✓✓ E2E TEST PASSED ✓✓✓

ℹ The sync completed successfully and data was verified in PostgreSQL.
```

### Posibles errores

#### Error: Gateway no disponible

```
✗ Failed to connect to gateway at http://localhost:3335
```

**Solución:** Asegúrate de que `objetiva-sync-gateway` esté corriendo:
```bash
cd objetiva-sync-gateway
npm run dev
```

#### Error: SQL Server no conecta

```
✗ Failed to connect to SQL Server: ConnectionError...
```

**Solución:**
1. Verifica la configuración de conexión en el dashboard
2. Comprueba que SQL Server esté accesible desde tu máquina
3. Verifica credenciales y permisos

#### Error: No active query found

```
⚠ No active query found for articulos, creating default query...
✓ Created default query (ID: 5)
```

**Nota:** Esto NO es un error. El script crea automáticamente una consulta por defecto si no existe ninguna activa. Puedes crear consultas personalizadas en el dashboard antes de ejecutar las pruebas.

#### Error: Autenticación fallida

```
✗ Authentication failed: Invalid credentials
```

**Solución:** Verifica `SYNC_USERNAME` y `SYNC_PASSWORD` en `.env` coincidan con las credenciales del gateway.

## Flujo de datos

```
┌─────────────┐         ┌──────────────┐         ┌─────────────┐
│             │         │              │         │             │
│ SQL Server  │◄────────┤ objetiva-    │────────►│  Gateway    │
│             │  Query  │   sync       │  HTTP   │             │
│   (ERP)     │         │              │  POST   │   (API)     │
│             │         │              │         │             │
└─────────────┘         └──────────────┘         └─────────────┘
                               │                         │
                               │ Writes logs/state       │ Writes data
                               ▼                         ▼
                        ┌──────────────┐         ┌─────────────┐
                        │   SQLite     │         │ PostgreSQL  │
                        │  (sync.db)   │         │  (gateway)  │
                        └──────────────┘         └─────────────┘
                                                         ▲
                                                         │
                                                  E2E test verifies
```

## Uso recomendado

### Antes de cerrar un milestone

Ejecuta todas las entidades para validar el sistema completo:

```bash
npm run test:e2e:articulos
npm run test:e2e:cabecera
npm run test:e2e:detalle
npm run test:e2e:pagos
```

### Después de cambios en el gateway

Ejecuta la entidad afectada para validar compatibilidad:

```bash
npm run test:e2e:articulos
```

### Debugging de problemas de sincronización

Ejecuta el test E2E para reproducir el problema en ambiente controlado:

```bash
npm run test:e2e:articulos
```

El test imprime información detallada en cada paso para diagnosticar dónde falla.

## Limitaciones

1. **Requiere servicios corriendo** - No puede ejecutarse sin gateway y SQL Server activos
2. **Modifica datos reales** - Los registros sincronizados se guardan en PostgreSQL real
3. **Dependiente de datos en SQL Server** - Si SQL Server no tiene datos, el test puede fallar
4. **No es idempotente** - Ejecutar múltiples veces puede crear registros duplicados (dependiendo de tus queries)

## Comparación con integration tests

| Característica | Integration Tests | E2E Tests |
|----------------|-------------------|-----------|
| **API Client** | Mock | Real |
| **Data Source** | Mock adapter | SQL Server real |
| **Database** | In-memory SQLite | SQLite + PostgreSQL reales |
| **Gateway** | No required | Debe estar corriendo |
| **Speed** | Rápido (~100ms) | Lento (~5-10s) |
| **Isolation** | Completo | Dependiente de servicios |
| **Use case** | Development/CI | Pre-deployment validation |

## Próximos pasos

Después de ejecutar las pruebas E2E exitosamente:

1. **Verificar logs en dashboard** - Abre `http://localhost:3334` para ver los sync logs
2. **Verificar datos en PostgreSQL** - Conecta a PostgreSQL y consulta las tablas directamente
3. **Ejecutar queries de validación** - Compara datos en SQL Server vs PostgreSQL
4. **Cerrar el milestone** - Si todos los tests pasan, el sistema está listo para producción

## Troubleshooting

### Test muy lento

Si el test tarda >30 segundos:
- Reduce el tamaño de los datos en tu query SQL (usa `TOP 10` o `LIMIT 10`)
- Verifica la performance de red entre sync y gateway
- Revisa logs de gateway para ver si hay cuellos de botella

### Datos no llegan a PostgreSQL

Si el sync reporta éxito pero no hay datos en PostgreSQL:
- Verifica logs del gateway en consola
- Revisa errores de validación Zod
- Comprueba que los schemas Prisma estén actualizados
- Verifica que `erp_sincronizado = true` en los registros

### Memory leaks en pruebas repetidas

Si ejecutas el test múltiples veces y se queda sin memoria:
- Reinicia el gateway entre ejecuciones
- Verifica que Prisma Client se desconecta correctamente
- Revisa conexiones a SQL Server que no se cierran

---

**Nota:** Estos tests son parte del **Phase 5: Integration Testing & Hardening** del proyecto v1.0. Se crearon para validar el sistema completo antes del cierre del milestone.
