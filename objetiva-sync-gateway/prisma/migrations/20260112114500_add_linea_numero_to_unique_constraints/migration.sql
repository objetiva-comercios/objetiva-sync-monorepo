-- Migration: Add linea_numero to unique constraints
-- Date: 2026-01-12
-- Description:
--   1. Make linea_numero NOT NULL (remove DEFAULT) in both tables
--   2. Add unique constraint including linea_numero to prevent line overwrites
--   3. Ensures each detail/payment line is uniquely identified

-- IMPORTANTE: Las tablas deben estar vacías o con datos válidos en linea_numero
-- El usuario confirmó que truncó todas las tablas de comprobantes

-- ============================================
-- comprobantes_detalle
-- ============================================

-- Paso 1: Hacer linea_numero NOT NULL
ALTER TABLE "comprobantes_detalle"
  ALTER COLUMN "linea_numero" SET NOT NULL,
  ALTER COLUMN "linea_numero" DROP DEFAULT;

-- Paso 2: El constraint único ya existe en la tabla según la estructura proporcionada
-- comprobantes_detalle_natural_key UNIQUE (comprobante_operacion, comprobante_formulario, comprobante_numero, linea_numero)
-- No es necesario recrearlo si ya existe, pero lo verificamos y creamos si no existe

-- Verificar y crear constraint si no existe
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'comprobantes_detalle_natural_key'
  ) THEN
    ALTER TABLE "comprobantes_detalle"
      ADD CONSTRAINT "comprobantes_detalle_natural_key"
      UNIQUE ("comprobante_operacion", "comprobante_formulario", "comprobante_numero", "linea_numero");
  END IF;
END $$;

-- ============================================
-- comprobantes_pagos
-- ============================================

-- Paso 1: Agregar columna linea_numero si no existe
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'comprobantes_pagos' AND column_name = 'linea_numero'
  ) THEN
    ALTER TABLE "comprobantes_pagos"
      ADD COLUMN "linea_numero" INTEGER NOT NULL DEFAULT 1;
  END IF;
END $$;

-- Paso 2: Hacer linea_numero NOT NULL y quitar DEFAULT
ALTER TABLE "comprobantes_pagos"
  ALTER COLUMN "linea_numero" SET NOT NULL,
  ALTER COLUMN "linea_numero" DROP DEFAULT;

-- Paso 2: Crear constraint único que incluye linea_numero
-- Primero eliminar cualquier constraint anterior que no incluya linea_numero
DO $$
BEGIN
  -- Eliminar constraint viejo si existe (sin linea_numero)
  IF EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'comprobantes_pagos_operacion_formulario_numero_key'
  ) THEN
    ALTER TABLE "comprobantes_pagos"
      DROP CONSTRAINT "comprobantes_pagos_operacion_formulario_numero_key";
  END IF;
END $$;

-- Crear nuevo constraint único que incluye linea_numero
ALTER TABLE "comprobantes_pagos"
  ADD CONSTRAINT "comprobantes_pagos_natural_key"
  UNIQUE ("comprobante_operacion", "comprobante_formulario", "comprobante_numero", "linea_numero");

-- ============================================
-- Verificación
-- ============================================

-- Los siguientes índices ayudan a validar que los constraints están activos:
-- comprobantes_detalle: comprobantes_detalle_natural_key
-- comprobantes_pagos: comprobantes_pagos_natural_key
