# Sincronización Incremental - Guía de Configuración

## ¿Qué es la Sincronización Incremental?

La sincronización incremental es un mecanismo que permite sincronizar únicamente los registros que han sido modificados desde la última sincronización exitosa, en lugar de transferir todos los registros cada vez. Esto reduce drásticamente el tiempo de sincronización y el consumo de recursos cuando se trabaja con grandes volúmenes de datos.

## ¿Cómo Funciona?

### Primera Sincronización

La primera vez que se ejecuta una sincronización para una query específica, siempre se realiza una **sincronización completa** porque no existe un timestamp almacenado. El sistema obtiene todos los registros que cumplan con los criterios de la query.

### Sincronizaciones Subsecuentes

Después de una sincronización exitosa:

1. El sistema almacena el valor máximo del campo incremental (`lastSyncValue`) para esa query
2. En la siguiente sincronización, este valor se pasa como parámetro `@lastSync` a la query SQL
3. La query filtra únicamente los registros modificados después de ese valor
4. Al finalizar exitosamente, se actualiza el `lastSyncValue` con el nuevo valor máximo

### Protección contra Clock Skew

Para evitar la pérdida de registros debido a diferencias de reloj entre servidores (clock skew), el sistema implementa una ventana de traslape de **5 minutos**:

- El timestamp almacenado se reduce en 5 minutos antes de pasarlo a la query
- Esto garantiza que se capturen registros modificados durante la ventana de sincronización anterior
- Los duplicados son seguros porque el gateway usa operaciones de `upsert` (inserción o actualización)
- El procesamiento es idempotente: ejecutar la misma sincronización múltiples veces produce el mismo resultado

## Configuración de Queries para Sincronización Incremental

### Campo Incremental

Cada query debe tener configurado un `incrementalField` que indique la columna que rastrea las modificaciones:

- **Para timestamps:** `fecha_modificacion`, `updated_at`, `fecha_actualizacion`
- **Para IDs auto-incrementales:** `id`, `codigo`, `numero`

**Importante:** Si el `incrementalField` está vacío, la query **siempre ejecutará una sincronización completa**.

### Uso del Parámetro @lastSync

La query SQL debe incluir una cláusula `WHERE` que utilice el parámetro `@lastSync`:

```sql
-- Ejemplo con timestamp
SELECT
  id,
  codigo,
  descripcion,
  fecha_modificacion
FROM articulos
WHERE fecha_modificacion > @lastSync

-- Ejemplo con ID autoincremental
SELECT
  id,
  numero,
  fecha,
  total
FROM comprobantes_cabecera
WHERE id > @lastSync
```

**Notas críticas:**

- El nombre del parámetro debe ser **exactamente** `@lastSync` (case-sensitive)
- El operador debe ser `>` (mayor que), no `>=` (mayor o igual) para evitar duplicados del último registro
- El campo en el `WHERE` debe coincidir con el `incrementalField` configurado

### Tipos de Campos Incrementales Soportados

1. **Timestamps (ISO 8601):** `fecha_modificacion DATETIME`, `updated_at DATETIME`
   - Se comparan lexicográficamente
   - Formato: `2026-02-04T10:30:00.000Z`

2. **IDs numéricos:** `id INT`, `codigo BIGINT`
   - Se comparan numéricamente usando `Math.max()`
   - El sistema detecta automáticamente si los valores son numéricos

## Sincronización Completa (Override)

Para forzar una sincronización completa que ignore los timestamps almacenados:

1. En el dashboard, marca la casilla **"Sincronización Completa"** antes de iniciar la sincronización
2. Esto pasa `fullSync=true` al motor de sincronización
3. El sistema ignora el `lastSyncValue` almacenado y ejecuta la query sin el parámetro `@lastSync`
4. Obtiene **todos** los registros, no solo los modificados

**Casos de uso:**

- Después de cambios en el schema de la base de datos
- Después de correcciones masivas de datos en el ERP
- Para validar la integridad de los datos sincronizados
- Cuando se sospecha de pérdida de datos por clock skew extremo

## Comportamiento en Caso de Fallo

Si una sincronización falla por cualquier motivo:

1. Los timestamps **NO se actualizan**
2. El `lastSyncValue` permanece en el valor de la última sincronización **exitosa**
3. La siguiente sincronización intentará re-sincronizar desde ese punto
4. **No hay pérdida de datos** gracias al procesamiento idempotente

### Ejemplo de Recuperación

```
Sync 1: Success → lastSyncValue = 2026-02-04T10:00:00Z
Sync 2: Failure → lastSyncValue = 2026-02-04T10:00:00Z (sin cambios)
Sync 3: Success → Obtiene registros desde 2026-02-04T09:55:00Z (con overlap)
                → lastSyncValue = 2026-02-04T11:00:00Z (actualizado)
```

## Dashboard - Indicadores Visuales

### Badge de Tipo de Sincronización

En el dashboard, cada sincronización muestra un badge:

- **INCREMENTAL** (verde): Sincronización incremental basada en `lastSyncValue`
- **COMPLETA** (amarillo): Sincronización completa (checkbox marcado o sin timestamp previo)

### Tabla "Estado por Entidad"

Muestra el estado actual de cada query configurada:

- **Última Sincronización:** Timestamp de la última sync exitosa
- **Último Valor:** El `lastSyncValue` almacenado (para debugging)
- **Total Sincronizados:** Cantidad total de registros sincronizados exitosamente
- **Estado:** IDLE | RUNNING | ERROR

### Tabla "Historial de Sincronización"

Muestra el historial de ejecuciones recientes:

- **Tipo:** INCREMENTAL o COMPLETA
- **Registros Obtenidos:** Cantidad de registros retornados por la query SQL
- **Registros Enviados:** Cantidad de registros procesados exitosamente
- **Duración:** Tiempo total de ejecución

## Mejores Prácticas

1. **Siempre indexa el campo incremental** en tu base de datos ERP para consultas rápidas
2. **Usa timestamps cuando sea posible** en lugar de IDs para capturar actualizaciones y no solo inserciones
3. **Ejecuta sincronización completa periódicamente** (ej: una vez por semana) para validar integridad
4. **Monitorea el campo "Registros Obtenidos"** en el historial - valores anormalmente altos pueden indicar problemas de clock skew
5. **No modifies el campo incremental manualmente** en registros ya sincronizados
6. **Prueba tu query SQL** en "Configuración → Queries → Probar Query" antes de activarla

## Troubleshooting

### Problema: "Muchos registros duplicados en cada sync"

**Causa:** Query no incluye `WHERE @lastSync` o usa `>=` en lugar de `>`

**Solución:** Verifica que tu query incluya `WHERE campo_incremental > @lastSync`

### Problema: "Faltan registros modificados"

**Causa:** Clock skew mayor a 5 minutos entre servidores

**Solución:**
1. Ejecuta una sincronización completa para recuperar datos
2. Sincroniza los relojes de los servidores (NTP)
3. Considera aumentar la ventana de overlap en el código si el problema persiste

### Problema: "Siempre ejecuta sync completa"

**Causa:** `incrementalField` no configurado o vacío

**Solución:** En "Configuración → Queries", edita la query y configura el campo incremental

### Problema: "Error: parámetro @lastSync no encontrado"

**Causa:** Nombre de parámetro incorrecto en la query SQL

**Solución:** El parámetro debe llamarse **exactamente** `@lastSync` (case-sensitive)
