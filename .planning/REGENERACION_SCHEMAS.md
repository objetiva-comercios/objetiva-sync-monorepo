# Regeneracion de Schemas — Documento Tecnico Completo

## Contexto

El sistema objetiva-sync-monorepo tiene **PostgreSQL como fuente de verdad** para la estructura de datos. Cuando se agrega, elimina o modifica una columna en las tablas de PostgreSQL (articulos, comprobantes_cabecera, comprobantes_detalle, comprobantes_pagos), ese cambio debe propagarse en cascada a todo el sistema.

El script `regenerate-schemas` automatiza esta propagacion.

## Arquitectura Distribuida

```
+------------------------------------------+          +------------------------------------------+
|  PC Windows (desarrollo)                 |          |  VPS Linux (produccion)                  |
|                                          |          |                                          |
|  objetiva-sync          (puerto 3334)    |          |  objetiva-sync-gateway   (puerto 3335)   |
|  shared/schemas/        (Zod schemas)    |          |  Docker container                        |
|  prisma/schema.prisma   (Prisma schema)  |          |  PostgreSQL              (fuente verdad) |
|                                          |          |                                          |
|  El monorepo completo vive aca.          |          |  Solo corre la imagen Docker.             |
|  Desde aca se commitea y pushea.         |          |  Se rebuilds desde el repo de GitHub.    |
+------------------------------------------+          +------------------------------------------+
```

- **objetiva-sync** corre en Windows local — dashboard de operacion, configuracion de queries, sincronizacion de datos
- **objetiva-sync-gateway** corre dockerizado en un VPS Linux remoto — recibe datos, persiste en PostgreSQL
- **shared/** contiene los schemas Zod compartidos por ambas partes
- **PostgreSQL** es la fuente de verdad — solo accesible a traves del gateway

## Flujo Completo de Regeneracion

```
Tu PC Windows (donde esta el monorepo)
  |
  |  npm run regenerate-schemas
  |  (se ejecuta desde objetiva-sync-gateway/)
  |
  |  FASE 1: INTROSPECCCION
  |  ========================
  |
  +---> Firma JWT localmente con JWT_SECRET (fast-jwt)
  |
  +---> Conecta al gateway remoto via HTTP (JWT auth)
  |     GET /api/schemas/articulos?force=true
  |     GET /api/schemas/comprobantes_cabecera?force=true
  |     GET /api/schemas/comprobantes_detalle?force=true
  |     GET /api/schemas/comprobantes_pagos?force=true
  |
  |     El gateway ejecuta queries contra information_schema de PostgreSQL:
  |     - column_name, data_type, is_nullable, column_default
  |     - column_comment (contiene reglas de validacion de negocio)
  |     - ordinal_position
  |     - constraints (PRIMARY KEY, UNIQUE, FOREIGN KEY, CHECK)
  |
  |     Devuelve: { entity, columns: ColumnMetadata[], constraints: ConstraintMetadata[] }
  |
  |
  |  FASE 2: GENERACION EN MEMORIA
  |  ===============================
  |
  +---> Genera Prisma schema (prisma-generator.ts)
  |     - Mapea tipos PostgreSQL a tipos Prisma (text -> String, integer -> Int, etc.)
  |     - Agrega anotaciones @db.* (Decimal(10,2), Timestamp(6), JsonB, etc.)
  |     - Preserva directivas existentes (@relation, @@index, etc.)
  |     - Genera modelos: Articulo, ComprobanteCabecera, ComprobanteDetalle, ComprobantePagos
  |
  +---> Genera Zod schemas (zod-generator.ts) — uno por entidad
  |     - Mapea tipos PostgreSQL a tipos Zod (text -> z.string(), integer -> z.coerce.number(), etc.)
  |     - Genera validaciones desde column_comment (positive, email, min/max, etc.)
  |     - Detecta campos requeridos (NOT NULL sin default)
  |     - Detecta key fields desde PRIMARY KEY / UNIQUE constraints
  |     - Genera: articuloSchema, ArticuloInput type, articuloMetadata, articuloTableSchema
  |
  +---> Computa diffs contra archivos existentes
  |     - Muestra cambios en consola con colores (campos agregados/eliminados/modificados)
  |     - Muestra resumen estructural (ej: "+2 campos, -1 campo, ~3 tipos cambiados")
  |
  |
  |  FASE 3: ESCRITURA DE ARCHIVOS (local)
  |  =======================================
  |
  +---> Escribe shared/schemas/generated/articulos.schema.ts
  |     Escribe shared/schemas/generated/comprobantes_cabecera.schema.ts
  |     Escribe shared/schemas/generated/comprobantes_detalle.schema.ts
  |     Escribe shared/schemas/generated/comprobantes_pagos.schema.ts
  |
  |     Cada archivo contiene:
  |       - Zod schema (validacion)
  |       - TypeScript type (ArticuloInput, etc.)
  |       - EntityMetadata (keyFields, systemFields, validations)
  |       - TableSchemaMetadata (columnas, constraints completas)
  |
  +---> Escribe objetiva-sync-gateway/prisma/schema.prisma
  |     Modelos Prisma completos con tipos, defaults, indices
  |
  |
  |  FASE 4: PRISMA GENERATE (local)
  |  =================================
  |
  +---> Ejecuta: npx prisma generate
  |     Genera Prisma Client en node_modules/.prisma/client/
  |     (binario para Windows — solo para desarrollo/validacion local)
  |
  |
  |  FASE 5: COMMIT Y DEPLOY
  |  =========================
  |
  +---> git add shared/schemas/generated/ prisma/schema.prisma
  |     git commit -m "chore: regenerate schemas from PostgreSQL"
  |     git push origin main
  |
  |            |
  |            v
  |
  |  VPS Linux (rebuild de imagen Docker)
  |  ======================================
  |
  |  docker compose build
  |    |
  |    +---> Dockerfile Stage 2 (builder):
  |    |     - Compila shared/ (tsc) -> genera .js desde .ts
  |    |     - Ejecuta: npx prisma generate
  |    |       (genera Prisma Client para Linux/debian-openssl-3.0.x)
  |    |     - Compila gateway (tsc) -> genera dist/
  |    |
  |    +---> Dockerfile Stage 3 (runtime):
  |          - Copia Prisma Client pre-compilado desde Stage 2
  |          - Copia schemas compartidos compilados (.js)
  |          - Imagen lista para ejecutar
  |
  |  docker compose up -d
  |    |
  |    +---> docker-entrypoint.sh:
  |          - Ejecuta: npx prisma db push
  |            (sincroniza schema de Prisma con PostgreSQL real)
  |            (crea tablas faltantes, agrega columnas nuevas, ajusta tipos)
  |          - Inicia: node dist/server.js
```

## Que Genera Cada Archivo

### shared/schemas/generated/{entity}.schema.ts

Cada archivo generado contiene 4 exports:

```typescript
// 1. Zod Schema — validacion de datos entrantes
export const articuloSchema = z.object({
  codigo: z.string().min(1, 'Campo requerido'),
  nombre: z.string().nullable().optional(),
  precio: z.coerce.number().nullable().optional(),
  // ... todos los campos de la tabla PostgreSQL
});

// 2. TypeScript Type — inferido del Zod schema
export type ArticuloInput = z.infer<typeof articuloSchema>;

// 3. Entity Metadata — configuracion para upsert/validacion
export const articuloMetadata: EntityMetadata<readonly ['codigo']> = {
  entity: 'articulo',
  tableName: 'articulos',
  keyFields: ['codigo'],           // desde PRIMARY KEY
  systemFields: ['creado', 'actualizado', 'erp_sincronizado', 'erp_fecha_sync'],
  validations: { /* reglas del column_comment */ }
};

// 4. Table Schema Metadata — metadata completa de columnas
export const articuloTableSchema: TableSchemaMetadata = {
  entity: 'articulos',
  columns: [ /* ColumnMetadata[] desde PostgreSQL */ ],
  constraints: [ /* ConstraintMetadata[] */ ]
};
```

### prisma/schema.prisma

```prisma
model Articulo {
  codigo      String    @id @db.Text
  nombre      String?   @db.Text
  precio      Decimal?  @db.Decimal(10, 2)
  creado      DateTime? @default(now()) @db.Timestamp(6)
  actualizado DateTime? @default(now()) @updatedAt @db.Timestamp(6)
  // ... todos los campos
  @@map("articulos")
  @@index([activo], map: "idx_articulos_activo")
}
```

## Cascada de Impacto

Cuando se regeneran los schemas, impacta en todos estos consumidores:

```
shared/schemas/generated/*.schema.ts  (AUTO-GENERADO)
  |
  +---> Gateway: routes/articulos.ts
  |     Valida batches entrantes con Zod antes de ingestar
  |     const { articulos } = ArticuloBatchSchema.parse(request.body)
  |
  +---> Gateway: routes/comprobantes.ts
  |     Valida batches de cabeceras, detalles y pagos
  |
  +---> Gateway: services/ingestion.ts
  |     Usa tipos TypeScript (ArticuloInput, etc.) para type safety en upsert
  |
  +---> Sync: services/schema-cache.ts
  |     Carga TableSchemaMetadata para lookup de columnas
  |
  +---> Sync: sync/query-validator.ts
  |     Valida campos requeridos y tipos cuando el operador testea una query SQL
  |
  +---> Sync: sync/schema-validator.ts
  |     Validacion con sugerencias "Did you mean?" (Levenshtein distance)
  |
  +---> Sync: dashboard/routes/api/queries.ts
  |     POST /api/queries/save -> bloquea si la query no cumple el schema
  |     POST /api/queries/test-and-validate -> doble validacion (Zod + schema)
  |
  +---> Sync: dashboard UI
        Muestra errores de validacion campo por campo con detalle


prisma/schema.prisma  (AUTO-GENERADO)
  |
  +---> prisma generate -> Prisma Client (node_modules/.prisma/client/)
  |     |
  |     +---> Gateway: lib/prisma.ts -> PrismaClient singleton
  |     +---> Gateway: ingestion.ts -> prisma.articulo.findMany/create/update
  |     +---> Gateway: health.ts -> prisma.$queryRaw (health check)
  |
  +---> prisma db push -> Sincroniza schema con PostgreSQL real
        Crea tablas faltantes, agrega columnas, ajusta tipos
```

### Archivos NO auto-generados (actualizacion manual):

```
objetiva-sync/src/types/articulos.ts         -> IArticuloPayload (interface manual)
objetiva-sync/src/types/comprobantes-*.ts    -> IComprobante*Payload (interfaces manuales)
```

Estos tipos representan lo que el sync ENVIA al gateway. Si PostgreSQL agrega un campo nuevo, estos archivos deben actualizarse manualmente para incluirlo.

## Archivos Involucrados

### Generadores (en objetiva-sync-gateway/)

| Archivo | Funcion |
|---------|---------|
| `scripts/regenerate-schemas.ts` | Orquestador CLI principal — maneja el flujo completo |
| `src/codegen/index.ts` | Funcion `regenerateSchemas()` — fetch + compute + write |
| `src/codegen/prisma-generator.ts` | Convierte ColumnMetadata -> modelo Prisma |
| `src/codegen/zod-generator.ts` | Convierte ColumnMetadata -> schema Zod + metadata |
| `src/codegen/diff-display.ts` | Muestra diffs con colores en consola |
| `src/services/introspection.ts` | Introspecciona PostgreSQL via information_schema |
| `src/routes/schemas.ts` | Endpoint GET /api/schemas/:entity |

### Schemas Compartidos (en shared/)

| Archivo | Funcion |
|---------|---------|
| `schemas/index.ts` | Re-exporta todos los schemas + getTableSchema() |
| `schemas/generated/articulos.schema.ts` | Schema Zod + metadata de articulos |
| `schemas/generated/comprobantes_cabecera.schema.ts` | Schema Zod + metadata de cabeceras |
| `schemas/generated/comprobantes_detalle.schema.ts` | Schema Zod + metadata de detalles |
| `schemas/generated/comprobantes_pagos.schema.ts` | Schema Zod + metadata de pagos |
| `types/schema-metadata.ts` | Tipos TypeScript (ColumnMetadata, TableSchemaMetadata, etc.) |

### Consumidores en Gateway (en objetiva-sync-gateway/)

| Archivo | Que consume |
|---------|-------------|
| `src/routes/articulos.ts` | articuloSchema (validacion Zod) |
| `src/routes/comprobantes.ts` | comprobantesCabeceraSchema, comprobantesDetalleSchema, comprobantesPagoSchema |
| `src/services/ingestion.ts` | ArticuloInput, ComprobantesCabeceraInput, etc. (tipos) |
| `src/lib/prisma.ts` | PrismaClient (generado por prisma generate) |

### Consumidores en Sync (en objetiva-sync/)

| Archivo | Que consume |
|---------|-------------|
| `src/services/schema-cache.ts` | getTableSchema(), tableSchemas, TableSchemaMetadata |
| `src/sync/query-validator.ts` | schemaCache (campos requeridos, tipos) |
| `src/sync/schema-validator.ts` | schemaCache (validacion con sugerencias) |
| `src/dashboard/routes/api/queries.ts` | Ambos validadores (save + test-and-validate) |

## Mapeo de Tipos: PostgreSQL -> Prisma -> Zod

| PostgreSQL | Prisma | Zod |
|------------|--------|-----|
| `text`, `varchar`, `char` | `String @db.Text` | `z.string()` |
| `integer`, `int4` | `Int` | `z.coerce.number().transform(n => Math.trunc(n))` |
| `bigint`, `int8` | `BigInt` | `z.coerce.number()` |
| `decimal`, `numeric` | `Decimal @db.Decimal(p,s)` | `z.coerce.number()` |
| `boolean` | `Boolean` | `z.boolean()` |
| `timestamp`, `timestamptz` | `DateTime @db.Timestamp(6)` | `z.coerce.date()` |
| `date` | `DateTime @db.Date` | `z.coerce.date()` |
| `jsonb` | `Json @db.JsonB` | `z.record(z.unknown())` |
| `text[]` | `String[] @db.Text` | `z.array(z.string())` |

## Configuracion Requerida

Para que el script funcione en la arquitectura distribuida:

```env
# En objetiva-sync-gateway/.env (local, para el script)
GATEWAY_URL=http://sync-gateway.sanchezrepuestos.com.ar
JWT_SECRET=<debe coincidir con el JWT_SECRET del gateway remoto>
```

El script firma un JWT localmente con `JWT_SECRET` usando `fast-jwt` y lo envia en el header `Authorization: Bearer <token>` a los endpoints del gateway.

## Comandos

```bash
# Regeneracion completa (interactivo, muestra diffs)
cd objetiva-sync-gateway
npm run regenerate-schemas

# Solo preview de cambios sin escribir archivos
npm run regenerate-schemas:dry-run

# Regenerar solo una entidad
npm run regenerate-schemas -- --entity articulos
```

## Cuando Ejecutar

Ejecutar `npm run regenerate-schemas` cuando:

1. Se agrega una columna nueva a una tabla de PostgreSQL
2. Se elimina una columna existente
3. Se cambia el tipo de una columna
4. Se modifica un constraint (PRIMARY KEY, UNIQUE, NOT NULL)
5. Se actualiza un COMMENT ON COLUMN (reglas de validacion de negocio)
6. Se crea una tabla nueva de entidad

Despues de ejecutar:
1. Revisar los diffs mostrados en consola
2. Verificar que los archivos generados son correctos
3. Actualizar manualmente `objetiva-sync/src/types/*.ts` si hay campos nuevos
4. `git commit` + `git push`
5. Rebuild de la imagen Docker en el VPS
6. `docker compose up -d` (prisma db push corre automaticamente)

---
*Documento creado: 2026-03-28 — Milestone v1.3*
