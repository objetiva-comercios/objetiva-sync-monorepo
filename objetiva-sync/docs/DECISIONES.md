# Decisiones Arquitectónicas - Objetiva Sync

## 2025-12-22: Stack Tecnológico Principal

**Contexto**: Necesitamos elegir tecnologías para construir un sincronizador de datos robusto, fácil de desplegar en Windows, y con dashboard web.

**Decisión**:
- **Backend**: Node.js v20+ con Fastify 5.x
- **Base de datos local**: SQLite con better-sqlite3 + Drizzle ORM
- **Frontend**: HTMX 2.x + EJS + Tailwind CSS
- **TypeScript**: Obligatorio en todo el proyecto

**Razón**:
- **Node.js + Fastify**: Performance excelente, ecosystem maduro, fácil despliegue como servicio Windows
- **SQLite**: Sin dependencias externas, backup simple (un archivo), suficiente para el volumen de datos
- **Drizzle ORM**: Type-safe, excelente DX, migraciones automáticas, compatible con SQLite
- **HTMX**: Interactividad sin JavaScript pesado, server-side rendering, simplicidad
- **TypeScript**: Seguridad de tipos, mejor DX, menos errores en runtime

**Alternativas consideradas**:
- PostgreSQL + Prisma: Más robusto pero requiere instalación de PostgreSQL (overhead innecesario)
- React/Vue para frontend: Más complejo, requiere build, HTMX es suficiente para este caso
- Python + FastAPI: Buena opción pero Node.js tiene mejor integración con node-windows

**Trade-offs aceptados**:
- SQLite tiene limitaciones de concurrencia (no relevante para este caso de uso)
- HTMX requiere pensar en server-side rendering (beneficio: menor complejidad)
- Node.js puede ser más memory-intensive que Python (mitigado con buen diseño)

---

## 2025-12-22: Arquitectura de Adaptadores

**Contexto**: Necesitamos soportar múltiples fuentes de datos (SQL Server, PostgreSQL, MySQL, Excel) sin duplicar código.

**Decisión**: Usar patrón **Strategy** con interfaz `IDataSourceAdapter` y clase base abstracta `AbstractAdapter`.

```typescript
interface IDataSourceAdapter {
  connect(config): Promise<void>;
  disconnect(): Promise<void>;
  testConnection(): Promise<Result>;
  executeQuery(sql, params): Promise<QueryResult>;
  getTables(): Promise<string[]>;
  getColumns(table): Promise<Column[]>;
}
```

**Razón**:
- Polimorfismo permite agregar nuevos adaptadores sin modificar código existente (Open/Closed Principle)
- Clase base abstracta reduce duplicación de código común
- Fácil testing con mocks

**Alternativas consideradas**:
- Funciones por adaptador sin interfaz: Menos estructurado, difícil de testear
- Factory pattern + Registry: Más complejo de lo necesario

**Trade-offs aceptados**:
- Requiere que todos los adaptadores implementen toda la interfaz (solución: métodos opcionales o default)

---

## 2025-12-22: Modelo de Sincronización de Comprobantes

**Contexto**: Los comprobantes tienen estructura jerárquica (cabecera + N detalles + N pagos). ¿Cómo sincronizarlos eficientemente?

**Decisión**:
1. Ejecutar 3 queries separadas: cabeceras, detalles, pagos
2. **Ensamblar en memoria** antes de enviar
3. Enviar comprobantes con detalles embebidos en un solo request
4. Enviar pagos por separado
5. Usar campo `join_field` configurable para asociar detalles/pagos con cabeceras

**Razón**:
- API remota espera comprobantes con detalles embebidos → menos requests
- Pagos separados porque pueden ser opcionales
- Ensamblado en memoria es eficiente para volúmenes típicos (< 1000 comprobantes/sync)
- `join_field` configurable permite adaptarse a diferentes esquemas ERP

**Alternativas consideradas**:
- Enviar 3 requests separados al backend: Más requests, más lento
- Una sola query con JOINs gigantes: Complejo, difícil de configurar por usuario
- Streaming: Overcomplicated para volúmenes esperados

**Trade-offs aceptados**:
- Uso de memoria mayor al ensamblar (mitigado con batching)
- Si hay muchos detalles por comprobante, puede ser lento (optimizable con batches más pequeños)

---

## 2025-12-22: Encriptación de Credenciales

**Contexto**: Las credenciales de SQL Server, API remota, etc. se guardan en SQLite. ¿Cómo protegerlas?

**Decisión**: Usar **AES-256-GCM** con clave derivada de variable de entorno `ENCRYPTION_KEY`.

**Razón**:
- AES-256-GCM: Estándar de la industria, authenticated encryption
- Variable de entorno: Fácil de rotar, no está en código
- Si no existe `ENCRYPTION_KEY`, se genera automáticamente y se guarda en `.env`

**Alternativas consideradas**:
- Hash con bcrypt: No reversible, no sirve para credenciales que necesitamos usar
- Almacenar en texto plano: Inaceptable
- Windows DPAPI: Específico de Windows, menos portable

**Trade-offs aceptados**:
- Si se pierde `ENCRYPTION_KEY`, los datos son irrecuperables (solución: backup de .env)
- Clave en .env es vulnerable si alguien accede al filesystem (mitigado con permisos de archivo)

---

## 2025-12-22: Manejo de Reintentos

**Contexto**: Los envíos al backend pueden fallar por errores de red, timeout, etc.

**Decisión**: Implementar **cola de reintentos** con backoff exponencial:
- Intento 1: 1 minuto
- Intento 2: 5 minutos
- Intento 3: 15 minutos
- Intento 4: 30 minutos
- Intento 5: 1 hora
- Después de 5 intentos: marcar como `failed` y notificar

**Razón**:
- Backoff exponencial reduce carga en el servidor durante fallos
- 5 intentos es balance entre persistencia y evitar loops infinitos
- Cola persistente en SQLite asegura que no se pierdan datos en reinicio

**Alternativas consideradas**:
- Reintentos inmediatos: Puede sobrecargar servidor fallando
- Sin reintentos: Pérdida de datos
- Reintentos infinitos: Puede llenar disco con datos fallidos

**Trade-offs aceptados**:
- Si el backend está caído por más de 1h, los datos quedan en `failed` (solución: UI para reintentar manualmente)
- Cola puede crecer si hay fallos continuos (mitigado con límite de 5 intentos)

---

---

## 2026-02-06: EntityType vs TableName - Mapeo Obligatorio

**Contexto**: Bug crítico donde la validación de queries contra schemas del Gateway fallaba silenciosamente. El UI mostraba "Validación Fallida" y "Query válida!" simultáneamente.

**Root Cause Identificado**:
- `EntityType` usa forma singular: `articulo`, `comprobante_cabecera`
- PostgreSQL usa nombres de tabla en plural: `articulos`, `comprobantes_cabecera`
- El endpoint `/api/schemas/:tableName` del Gateway espera el nombre de tabla, no el EntityType
- El código en `queries.ts` pasaba `entityType` directamente sin conversión

**Decisión**: Establecer como convención obligatoria la conversión explícita de EntityType a TableName cuando se comunica con el Gateway.

**Implementación**:
```typescript
function entityTypeToTableName(entityType: string): string {
  const mapping: Record<string, string> = {
    'articulo': 'articulos',
    'comprobante_cabecera': 'comprobantes_cabecera',
    'comprobante_detalle': 'comprobantes_detalle',
    'comprobante_pago': 'comprobantes_pagos',
  };
  return mapping[entityType] || entityType;
}
```

**Archivos Modificados**:
- `objetiva-sync/src/dashboard/routes/api/queries.ts`: Agregada función y actualización de llamadas a `validateQueryAgainstSchema()`

**Razón**:
- El Gateway es la fuente de verdad para schemas (deriva de PostgreSQL)
- PostgreSQL define tablas en plural por convención SQL estándar
- EntityType se mantiene en singular para compatibilidad con código existente del sync engine
- El mapeo explícito previene bugs silenciosos de "schema not found"

**Trade-offs aceptados**:
- Función duplicada en `sync-engine.ts` y `queries.ts` (deuda técnica documentada en CONCERNS.md)
- Mapeo hardcodeado en lugar de dinámico (aceptable dado el número fijo de entidades)

**Refactoring Recomendado (Futuro)**:
1. Crear `objetiva-sync/src/utils/entity-mapping.ts` con:
   - `entityTypeToTableName(entityType: string): string`
   - `tableNameToEntityType(tableName: string): string` (inverso)
   - `ENTITY_TABLE_MAPPING` constante exportada
2. Actualizar imports en:
   - `sync-engine.ts`
   - `queries.ts`
3. Agregar tests unitarios en `tests/utils/entity-mapping.test.ts`

---

*Las decisiones se irán documentando a medida que se tomen durante el desarrollo*
