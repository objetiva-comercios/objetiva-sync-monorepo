# Comprobantes Atomizados: Arquitectura de 3 Entidades Independientes

## Descripción General

Los comprobantes en Objetiva Sync se manejan como **3 entidades completamente independientes y atomizadas**:

1. **`comprobante_cabecera`** - Datos generales del comprobante
2. **`comprobante_detalle`** - Líneas de artículos/productos
3. **`comprobante_pago`** - Medios de pago aplicados

Cada entidad:
- Se consulta de forma independiente en el ERP de origen
- Se envía a su propio endpoint en el gateway
- Se almacena en su propia tabla en destino
- Se vincula con las demás mediante **clave compuesta de 3 campos**

## Ventajas del Enfoque Atomizado

### Claridad y Transparencia
- Cada entidad es visible y configurable en la UI
- Se puede ver exactamente qué datos se están enviando
- No hay "magia" oculta de ensamblado

### Depuración y Mantenimiento
- Fácil identificar en qué entidad está fallando la sincronización
- Se puede sincronizar cada entidad de forma independiente
- Los errores son más precisos y fáciles de rastrear

### Flexibilidad
- Diferentes intervalos de sincronización por entidad
- Diferentes configuraciones de campos por entidad
- Se pueden agregar más entidades relacionadas en el futuro

### Separación de Responsabilidades
- El cliente sync solo obtiene y envía datos
- El gateway se encarga de relacionar las entidades
- Cada capa hace una cosa y la hace bien

## Clave Compuesta: Vinculación entre Entidades

Las tres entidades se vinculan mediante **3 campos** que juntos identifican de forma única un comprobante en el ERP de origen:

```typescript
{
  erp_operacion: string,  // ej: "VTA" (Venta), "COM" (Compra)
  erp_formulario: string, // ej: "FC" (Factura), "NC" (Nota de Crédito)
  erp_numero: string      // ej: "00001234"
}
```

### Importante
- Los **3 campos juntos** forman la clave única
- Estos campos son **REQUERIDOS** en las 3 entidades
- El gateway usa estos campos para vincular cabeceras ↔ detalles ↔ pagos

## Estructura de las Entidades

### 1. Comprobante Cabecera

```typescript
interface IComprobanteCabeceraPayload {
  // Clave compuesta (REQUERIDA)
  erp_operacion: string;
  erp_formulario: string;
  erp_numero: string;

  // Identificación
  tipo: string;              // 'FACTURA', 'NOTA_CREDITO', 'REMITO', etc.
  comprobante: string;       // Código único ej: 'A-0001-00001234'
  numero_comprobante?: string;
  erp_id_comprobante?: string;

  // Fecha y período
  fecha: string;             // ISO date (REQUERIDO)
  periodo?: string;

  // Tercero (cliente/proveedor)
  tercero_tipo?: string;
  tercero_nombre?: string;
  tercero_documento?: string;
  tercero_direccion?: string;
  tercero_datos?: Record<string, unknown>;

  // Totales
  subtotal?: number;
  total_impuestos?: number;
  total_descuentos?: number;
  total: number;             // REQUERIDO

  // Metadata
  erp_datos?: Record<string, unknown>;
  observaciones?: string;
}
```

**Endpoint**: `POST /api/comprobantes/batch`

### 2. Comprobante Detalle

```typescript
interface IComprobanteDetallePayload {
  // Clave compuesta (REQUERIDA) - vincula con cabecera
  erp_operacion: string;
  erp_formulario: string;
  erp_numero: string;

  // Orden
  linea_numero?: number;     // 1, 2, 3...

  // Artículo
  codigo_articulo?: string;
  nombre_articulo?: string;

  // Cantidades y precios
  unidades: number;          // REQUERIDO
  precio_unitario?: number;
  subtotal?: number;

  // Impuestos (hasta 3)
  impuesto_1_nombre?: string;
  impuesto_1_porcentaje?: number;
  impuesto_1_monto?: number;
  // ... impuesto_2, impuesto_3

  // Descuento y total
  descuento?: number;
  total: number;             // REQUERIDO

  // Metadata
  erp_datos?: Record<string, unknown>;
}
```

**Endpoint**: `POST /api/comprobantes/detalle/batch`

### 3. Comprobante Pago

```typescript
interface IComprobantePagoPayload {
  // Clave compuesta (REQUERIDA) - vincula con cabecera
  erp_operacion: string;
  erp_formulario: string;
  erp_numero: string;

  // Datos del pago
  medio: string;             // REQUERIDO - 'EFECTIVO', 'TRANSFERENCIA', etc.
  monto: number;             // REQUERIDO
  moneda?: string;           // 'ARS', 'USD', default 'ARS'

  // Datos adicionales
  fecha_pago?: string;       // Si difiere de la fecha del comprobante
  referencia?: string;       // Número de cheque, transferencia, etc.

  // Metadata
  erp_datos?: Record<string, unknown>;
}
```

**Endpoint**: `POST /api/comprobantes/pagos/batch`

## Configuración de Consultas SQL

Para cada entidad, debes configurar una consulta SQL separada en el dashboard.

### Ejemplo: Consulta de Cabeceras

```sql
SELECT
  operacion AS erp_operacion,
  formulario AS erp_formulario,
  numero AS erp_numero,
  tipo,
  CONCAT(formulario, '-', numero) AS comprobante,
  fecha,
  total,
  razon_social AS tercero_nombre,
  cuit AS tercero_documento
FROM comprobantes
WHERE fecha_modificacion >= :lastSync
ORDER BY fecha_modificacion
```

**Field Mappings**:
- `erp_operacion` → `erp_operacion`
- `erp_formulario` → `erp_formulario`
- `erp_numero` → `erp_numero`
- `comprobante` → `comprobante`
- `fecha` → `fecha`
- `total` → `total`
- ... etc

### Ejemplo: Consulta de Detalles

```sql
SELECT
  c.operacion AS erp_operacion,
  c.formulario AS erp_formulario,
  c.numero AS erp_numero,
  d.linea AS linea_numero,
  d.codigo_articulo,
  d.descripcion AS nombre_articulo,
  d.cantidad AS unidades,
  d.precio_unitario,
  d.total
FROM comprobantes_detalle d
INNER JOIN comprobantes c ON d.comprobante_id = c.id
WHERE c.fecha_modificacion >= :lastSync
ORDER BY c.fecha_modificacion, d.linea
```

### Ejemplo: Consulta de Pagos

```sql
SELECT
  c.operacion AS erp_operacion,
  c.formulario AS erp_formulario,
  c.numero AS erp_numero,
  p.medio_pago AS medio,
  p.monto,
  p.moneda,
  p.referencia
FROM comprobantes_pagos p
INNER JOIN comprobantes c ON p.comprobante_id = c.id
WHERE c.fecha_modificacion >= :lastSync
ORDER BY c.fecha_modificacion
```

## Flujo de Sincronización

### 1. Configuración (Una sola vez)

En el dashboard de Objetiva Sync:

1. **Ir a "Consultas"**
2. **Crear query para `comprobante_cabecera`**:
   - Tipo de Entidad: `comprobante_cabecera`
   - SQL Query: SELECT cabeceras...
   - Field Mappings: mapear campos origen → destino
   - ⚠️ **NO configurar campo Join** (ya no se usa)

3. **Crear query para `comprobante_detalle`**:
   - Tipo de Entidad: `comprobante_detalle`
   - SQL Query: SELECT detalles...
   - Field Mappings: incluir clave compuesta + datos línea

4. **Crear query para `comprobante_pago`**:
   - Tipo de Entidad: `comprobante_pago`
   - SQL Query: SELECT pagos...
   - Field Mappings: incluir clave compuesta + datos pago

### 2. Sincronización Automática

El scheduler ejecuta 3 trabajos independientes:

```typescript
// Cada entidad tiene su propio job
{
  id: "sync-comprobante_cabecera-...",
  entityType: "comprobante_cabecera",
  intervalMinutes: 30
}

{
  id: "sync-comprobante_detalle-...",
  entityType: "comprobante_detalle",
  intervalMinutes: 30
}

{
  id: "sync-comprobante_pago-...",
  entityType: "comprobante_pago",
  intervalMinutes: 30
}
```

### 3. Proceso por Entidad

Para cada entidad, el proceso es idéntico:

1. **Consultar ERP**:
   ```
   SELECT ... WHERE fecha_modificacion >= :lastSync
   ```

2. **Transformar datos**:
   ```
   Aplicar field mappings
   Validar con schema Zod
   ```

3. **Enviar en batches**:
   ```
   POST /api/comprobantes/batch         (cabeceras)
   POST /api/comprobantes/detalle/batch (detalles)
   POST /api/comprobantes/pagos/batch   (pagos)
   ```

4. **Gateway procesa**:
   - Recibe cada entidad por separado
   - Las relaciona usando `erp_operacion + erp_formulario + erp_numero`
   - Inserta/actualiza en tablas correspondientes

## Esquema de Base de Datos (Gateway)

El gateway mantiene 3 tablas separadas:

### comprobantes_cabecera
```sql
CREATE TABLE comprobantes_cabecera (
  id BIGINT PRIMARY KEY,

  -- Claves de vinculación
  erp_operacion TEXT NOT NULL,
  erp_formulario TEXT NOT NULL,
  erp_numero TEXT NOT NULL,

  -- Datos del comprobante
  operacion TEXT NOT NULL,
  formulario TEXT NOT NULL,
  numero TEXT NOT NULL,
  fecha TIMESTAMP NOT NULL,
  total NUMERIC(12,2) NOT NULL,
  -- ... otros campos

  -- Índice para búsquedas por clave compuesta
  UNIQUE INDEX idx_comprobante_erp (erp_operacion, erp_formulario, erp_numero)
);
```

### comprobantes_detalle
```sql
CREATE TABLE comprobantes_detalle (
  id BIGINT PRIMARY KEY,

  -- Claves de vinculación (FK virtual)
  erp_operacion TEXT NOT NULL,
  erp_formulario TEXT NOT NULL,
  erp_numero TEXT NOT NULL,

  -- Datos de la línea
  linea_numero INTEGER DEFAULT 1,
  codigo_articulo TEXT,
  unidades NUMERIC(10,3) NOT NULL,
  total NUMERIC(12,2) NOT NULL,
  -- ... otros campos

  -- Índice para vincular con cabecera
  INDEX idx_detalle_comprobante (erp_operacion, erp_formulario, erp_numero)
);
```

### comprobantes_pagos
```sql
CREATE TABLE comprobantes_pagos (
  id BIGINT PRIMARY KEY,

  -- Claves de vinculación (FK virtual)
  erp_operacion TEXT NOT NULL,
  erp_formulario TEXT NOT NULL,
  erp_numero TEXT NOT NULL,

  -- Datos del pago
  medio TEXT NOT NULL,
  monto NUMERIC(12,2) NOT NULL,
  moneda TEXT DEFAULT 'ARS',
  -- ... otros campos

  -- Índice para vincular con cabecera
  INDEX idx_pago_comprobante (erp_operacion, erp_formulario, erp_numero)
);
```

## Consultas en el Gateway

Para obtener un comprobante completo con detalles y pagos:

```sql
-- Cabecera
SELECT * FROM comprobantes_cabecera
WHERE erp_operacion = 'VTA'
  AND erp_formulario = 'FC'
  AND erp_numero = '00001234';

-- Detalles (líneas)
SELECT * FROM comprobantes_detalle
WHERE erp_operacion = 'VTA'
  AND erp_formulario = 'FC'
  AND erp_numero = '00001234'
ORDER BY linea_numero;

-- Pagos
SELECT * FROM comprobantes_pagos
WHERE erp_operacion = 'VTA'
  AND erp_formulario = 'FC'
  AND erp_numero = '00001234';
```

O con JOIN:

```sql
SELECT
  c.*,
  d.linea_numero,
  d.codigo_articulo,
  d.unidades,
  p.medio,
  p.monto
FROM comprobantes_cabecera c
LEFT JOIN comprobantes_detalle d
  ON c.erp_operacion = d.erp_operacion
  AND c.erp_formulario = d.erp_formulario
  AND c.erp_numero = d.erp_numero
LEFT JOIN comprobantes_pagos p
  ON c.erp_operacion = p.erp_operacion
  AND c.erp_formulario = p.erp_formulario
  AND c.erp_numero = p.erp_numero
WHERE c.erp_operacion = 'VTA'
  AND c.erp_formulario = 'FC'
  AND c.erp_numero = '00001234';
```

## Casos de Uso Comunes

### Comprobante sin Detalles
Ejemplo: Un recibo que solo registra el pago, sin artículos.

```typescript
// Solo enviar cabecera y pagos
cabecera: {
  erp_operacion: 'VTA',
  erp_formulario: 'RC',
  erp_numero: '00005678',
  tipo: 'RECIBO',
  total: 1000.00
}

pagos: [{
  erp_operacion: 'VTA',
  erp_formulario: 'RC',
  erp_numero: '00005678',
  medio: 'TRANSFERENCIA',
  monto: 1000.00
}]

// NO enviar detalles (query de detalles no devuelve nada)
```

### Comprobante sin Pagos
Ejemplo: Una factura a cuenta corriente.

```typescript
// Enviar cabecera y detalles, pero no pagos
cabecera: { ... }
detalles: [{ ... }, { ... }]
// NO enviar pagos
```

### Comprobante Completo
Ejemplo: Factura con artículos y pago en efectivo.

```typescript
// Enviar las 3 entidades
cabecera: { ... }
detalles: [{ ... }, { ... }]
pagos: [{ ... }]
```

## Monitoreo y Depuración

### Logs por Entidad

Cada entidad genera sus propios logs:

```
[2025-12-30] INFO: [SyncEngine] Sincronizando comprobante_cabecera...
[2025-12-30] INFO: [SyncEngine] ✅ 150 cabeceras enviadas

[2025-12-30] INFO: [SyncEngine] Sincronizando comprobante_detalle...
[2025-12-30] INFO: [SyncEngine] ✅ 523 detalles enviados

[2025-12-30] INFO: [SyncEngine] Sincronizando comprobante_pago...
[2025-12-30] INFO: [SyncEngine] ✅ 98 pagos enviados
```

### Dashboard: Sync State

El estado de sincronización se rastrea por separado:

- `comprobante_cabecera`: Última sincronización, registros procesados
- `comprobante_detalle`: Última sincronización, registros procesados
- `comprobante_pago`: Última sincronización, registros procesados

### Errores Comunes

**Error**: `Validación fallida: erp_operacion es requerido`

**Solución**: Asegurarse de que la query SQL devuelva los 3 campos de la clave compuesta.

---

**Error**: `Comprobante no encontrado en gateway`

**Solución**: Verificar que la cabecera se haya sincronizado primero. Los detalles/pagos dependen de que exista la cabecera.

---

**Error**: `Campos de vinculación no coinciden`

**Solución**: Los valores de `erp_operacion`, `erp_formulario`, `erp_numero` deben ser **exactamente iguales** en cabecera, detalles y pagos.

## Migración desde Enfoque Ensamblado

Si estás migrando desde el enfoque anterior (ensamblado):

### Antes (Ensamblado)
```typescript
// 1 entidad con detalles embebidos
{
  tipo: 'FC',
  comprobante: 'A-0001-00001234',
  total: 1000,
  detalles: [
    { unidades: 1, total: 500 },
    { unidades: 2, total: 500 }
  ]
}
```

### Ahora (Atomizado)
```typescript
// 3 entidades separadas

// Cabecera
{
  erp_operacion: 'VTA',
  erp_formulario: 'FC',
  erp_numero: '00001234',
  tipo: 'FC',
  total: 1000
}

// Detalle 1
{
  erp_operacion: 'VTA',
  erp_formulario: 'FC',
  erp_numero: '00001234',
  linea_numero: 1,
  unidades: 1,
  total: 500
}

// Detalle 2
{
  erp_operacion: 'VTA',
  erp_formulario: 'FC',
  erp_numero: '00001234',
  linea_numero: 2,
  unidades: 2,
  total: 500
}
```

## Conclusión

El enfoque atomizado proporciona:

- ✅ **Claridad**: Cada entidad es visible y configurable
- ✅ **Simplicidad**: No hay lógica oculta de ensamblado
- ✅ **Flexibilidad**: Se puede sincronizar cada entidad independientemente
- ✅ **Mantenibilidad**: Fácil de depurar y extender
- ✅ **Escalabilidad**: Se pueden agregar más entidades relacionadas

La separación de responsabilidades es clara:
- **Sync Client**: Obtiene y envía datos
- **Gateway**: Relaciona y almacena entidades
- **Cada capa hace lo que mejor sabe hacer**
