# Shared Schemas

Esquemas Zod compartidos entre `objetiva-sync` y `objetiva-sync-gateway`, generados automáticamente desde la estructura de PostgreSQL.

## Arquitectura

```
shared/
├── schemas/
│   ├── index.ts                           # Re-exporta todos los esquemas
│   └── generated/                         # Esquemas auto-generados
│       ├── articulos.schema.ts
│       ├── comprobantes_cabecera.schema.ts
│       ├── comprobantes_detalle.schema.ts
│       └── comprobantes_pagos.schema.ts
├── types/
│   ├── index.ts
│   └── schema-metadata.ts                 # Tipos EntityMetadata, ValidationRule
├── package.json
└── tsconfig.json
```

## Principio: PostgreSQL como Fuente de Verdad

Los esquemas en `shared/schemas/generated/` son **auto-generados** desde la introspección de PostgreSQL. Esto garantiza:

1. **Sincronización automática**: Cambios en PostgreSQL se reflejan en los esquemas Zod
2. **Validación consistente**: Gateway y Sync usan exactamente los mismos esquemas
3. **Tipos derivados**: TypeScript infiere tipos desde los esquemas Zod
4. **Metadata para operaciones**: `keyFields`, `systemFields` extraídos de constraints

## Regenerar Esquemas

Cuando se modifican tablas en PostgreSQL (agregar/eliminar columnas, cambiar tipos):

```bash
cd objetiva-sync-gateway
npm run regenerate-schemas
```

Esto ejecuta:
1. Introspección de PostgreSQL (`information_schema`)
2. Generación de esquemas Zod con validaciones
3. Generación de esquema Prisma actualizado
4. Escritura en `shared/schemas/generated/`

## Estructura de un Esquema Generado

```typescript
// Auto-generated from PostgreSQL schema introspection
// DO NOT EDIT - regenerate with: npm run regenerate-schemas
// Generated: 2026-02-06T21:47:30.263Z
// Table: articulos

import { z } from 'zod';
import type { EntityMetadata } from '../../types/schema-metadata.js';

export const articuloSchema = z.object({
  erp_codigo: z.string().min(1, 'Campo requerido'),
  erp_nombre: z.string().min(1, 'Campo requerido'),
  sku: z.string().nullable().optional(),
  // ... más campos
});

export type ArticuloInput = z.infer<typeof articuloSchema>;

export const articuloMetadata: EntityMetadata<readonly ['erp_codigo']> = {
  entity: 'articulo',
  tableName: 'articulos',
  keyFields: ['erp_codigo'] as const,
  systemFields: ['erp_sincronizado', 'erp_fecha_sync', 'actualizado', 'creado'] as const,
  validations: {},
};
```

## EntityMetadata

Cada esquema exporta un objeto `metadata` con información para operaciones dinámicas:

| Campo | Descripción |
|-------|-------------|
| `entity` | Nombre singular (e.g., `'articulo'`) |
| `tableName` | Nombre de tabla PostgreSQL (e.g., `'articulos'`) |
| `keyFields` | Campos de PRIMARY KEY para upsert |
| `systemFields` | Campos gestionados por el sistema (no vienen del cliente) |
| `validations` | Reglas de validación extraídas de comentarios PostgreSQL |

## Claves Primarias

El sistema usa **claves naturales/compuestas** (sin columnas `id` auto-increment):

| Entidad | Primary Key |
|---------|-------------|
| `articulos` | `erp_codigo` |
| `comprobantes_cabecera` | `operacion, formulario, numero` |
| `comprobantes_detalle` | `comprobante_operacion, comprobante_formulario, comprobante_numero, linea_numero` |
| `comprobantes_pagos` | `comprobante_operacion, comprobante_formulario, comprobante_numero, linea_numero` |

## Campos de Auditoría ERP

Todas las tablas incluyen campos para tracking de origen ERP:

| Campo | Tipo | Descripción |
|-------|------|-------------|
| `erp_creado` | `TIMESTAMP` | Fecha de creación en el ERP origen |
| `erp_actualizado` | `TIMESTAMP` | Fecha de última modificación en el ERP origen |
| `erp_sincronizado` | `BOOLEAN` | Flag de sincronización (sistema) |
| `erp_fecha_sync` | `TIMESTAMP` | Última sincronización (sistema) |

## Uso en Proyectos

### En objetiva-sync-gateway

```typescript
import { articuloSchema, articuloMetadata } from '../../../shared/schemas/index.js';

// Validar payload
const result = articuloSchema.safeParse(payload);

// Usar metadata para upsert dinámico
const keyFields = articuloMetadata.keyFields; // ['erp_codigo']
```

### En objetiva-sync

```typescript
import {
  articuloSchema,
  type ArticuloInput
} from '../../../shared/schemas/index.js';

// Validar resultados de query
const validated = articuloSchema.parse(queryResult);
```

## Agregar Validaciones de Negocio

Las validaciones se agregan como **comentarios en PostgreSQL**:

```sql
COMMENT ON COLUMN articulos.precio IS
  'Precio unitario | {"validation": "positive", "example": "99.99"}';
```

Después de agregar comentarios, regenerar esquemas para que se reflejen.

## Modificar Estructura de Tablas

1. Modificar en PostgreSQL:
   ```sql
   ALTER TABLE articulos ADD COLUMN nuevo_campo VARCHAR(100);
   ```

2. Regenerar esquemas:
   ```bash
   cd objetiva-sync-gateway
   npm run regenerate-schemas
   ```

3. Los tipos TypeScript se actualizan automáticamente

## NO Editar Manualmente

Los archivos en `shared/schemas/generated/` tienen el header:

```typescript
// DO NOT EDIT - regenerate with: npm run regenerate-schemas
```

Cualquier edición manual se perderá en la próxima regeneración.
