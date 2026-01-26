-- ============================================
-- MIGRACIÓN: Refactorización de comprobantes_detalle
-- Modelo contable/fiscal argentino con IVA
-- Fecha: 2026-01-14
-- ============================================

-- Paso 1: Agregar nuevos campos específicos de IVA
-- Todos empiezan como NULL para permitir migración de datos existentes

ALTER TABLE "comprobantes_detalle"
  ADD COLUMN IF NOT EXISTS "importe_bruto" DECIMAL(12,2),
  ADD COLUMN IF NOT EXISTS "porc_descuento" DECIMAL(5,2),
  ADD COLUMN IF NOT EXISTS "importe_descuento" DECIMAL(12,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "importe_neto" DECIMAL(12,2),
  ADD COLUMN IF NOT EXISTS "alicuota_iva" DECIMAL(5,2),
  ADD COLUMN IF NOT EXISTS "importe_iva" DECIMAL(12,2),
  ADD COLUMN IF NOT EXISTS "importe_total" DECIMAL(12,2);

-- Paso 2: Migrar datos existentes
-- Calculamos los nuevos valores basados en los campos actuales

-- 2.1: Calcular importe_bruto (unidades × precio_unitario)
-- Si precio_unitario es NULL, usar subtotal / unidades, o total / unidades como fallback
UPDATE "comprobantes_detalle"
SET "importe_bruto" = CASE
  WHEN "precio_unitario" IS NOT NULL THEN "unidades" * "precio_unitario"
  WHEN "subtotal" IS NOT NULL AND "unidades" > 0 THEN "subtotal"
  WHEN "total" IS NOT NULL AND "unidades" > 0 THEN "total"
  ELSE 0
END
WHERE "importe_bruto" IS NULL;

-- 2.2: Migrar descuentos (descuento_monto → importe_descuento, descuento_porcentaje → porc_descuento)
UPDATE "comprobantes_detalle"
SET
  "importe_descuento" = COALESCE("descuento_monto", 0),
  "porc_descuento" = "descuento_porcentaje"
WHERE "importe_descuento" IS NULL OR "porc_descuento" IS NULL;

-- 2.3: Calcular importe_neto (importe_bruto - importe_descuento)
UPDATE "comprobantes_detalle"
SET "importe_neto" = "importe_bruto" - COALESCE("importe_descuento", 0)
WHERE "importe_neto" IS NULL;

-- 2.4: Intentar inferir alícuota de IVA desde impuesto_1
-- Si el nombre contiene "IVA" y hay porcentaje, usar ese
-- Si no, asumir 21% (alícuota más común en Argentina)
UPDATE "comprobantes_detalle"
SET "alicuota_iva" = CASE
  WHEN "impuesto_1_nombre" ILIKE '%IVA%' AND "impuesto_1_porcentaje" IS NOT NULL
    THEN "impuesto_1_porcentaje"
  WHEN "impuesto_1_nombre" ILIKE '%IVA%' AND "impuesto_1_monto" IS NOT NULL AND "importe_neto" > 0
    THEN ROUND(("impuesto_1_monto" / "importe_neto") * 100, 2)
  ELSE 21.00
END
WHERE "alicuota_iva" IS NULL;

-- 2.5: Calcular importe_iva
UPDATE "comprobantes_detalle"
SET "importe_iva" = CASE
  WHEN "impuesto_1_nombre" ILIKE '%IVA%' AND "impuesto_1_monto" IS NOT NULL
    THEN "impuesto_1_monto"
  ELSE ROUND("importe_neto" * ("alicuota_iva" / 100), 2)
END
WHERE "importe_iva" IS NULL;

-- 2.6: Calcular importe_total (importe_neto + importe_iva)
UPDATE "comprobantes_detalle"
SET "importe_total" = "importe_neto" + "importe_iva"
WHERE "importe_total" IS NULL;

-- Paso 3: Hacer que precio_unitario sea NOT NULL
-- Primero, llenar valores NULL con cálculo inverso
UPDATE "comprobantes_detalle"
SET "precio_unitario" = CASE
  WHEN "unidades" > 0 THEN "importe_bruto" / "unidades"
  ELSE 0
END
WHERE "precio_unitario" IS NULL;

-- Ahora sí, aplicar NOT NULL
ALTER TABLE "comprobantes_detalle"
  ALTER COLUMN "precio_unitario" SET NOT NULL;

-- Paso 4: Hacer que los nuevos campos sean NOT NULL
ALTER TABLE "comprobantes_detalle"
  ALTER COLUMN "importe_bruto" SET NOT NULL,
  ALTER COLUMN "importe_descuento" SET NOT NULL,
  ALTER COLUMN "importe_neto" SET NOT NULL,
  ALTER COLUMN "alicuota_iva" SET NOT NULL,
  ALTER COLUMN "importe_iva" SET NOT NULL,
  ALTER COLUMN "importe_total" SET NOT NULL;

-- Paso 5: Agregar constraints de validación
-- Coherencia matemática y reglas de negocio

ALTER TABLE "comprobantes_detalle"
  ADD CONSTRAINT "chk_importe_bruto_non_negative"
    CHECK ("importe_bruto" >= 0),

  ADD CONSTRAINT "chk_importe_neto_non_negative"
    CHECK ("importe_neto" >= 0),

  ADD CONSTRAINT "chk_importe_total_gte_neto"
    CHECK ("importe_total" >= "importe_neto"),

  ADD CONSTRAINT "chk_alicuota_iva_valid"
    CHECK ("alicuota_iva" IN (0, 10.5, 21, 27)),

  ADD CONSTRAINT "chk_descuento_lte_bruto"
    CHECK ("importe_descuento" <= "importe_bruto"),

  ADD CONSTRAINT "chk_porc_descuento_valid"
    CHECK ("porc_descuento" IS NULL OR ("porc_descuento" >= 0 AND "porc_descuento" <= 100));

-- Paso 6: Eliminar campos obsoletos de impuestos genéricos
ALTER TABLE "comprobantes_detalle"
  DROP COLUMN IF EXISTS "impuesto_1_nombre",
  DROP COLUMN IF EXISTS "impuesto_1_porcentaje",
  DROP COLUMN IF EXISTS "impuesto_1_monto",
  DROP COLUMN IF EXISTS "impuesto_2_nombre",
  DROP COLUMN IF EXISTS "impuesto_2_porcentaje",
  DROP COLUMN IF EXISTS "impuesto_2_monto",
  DROP COLUMN IF EXISTS "impuesto_3_nombre",
  DROP COLUMN IF EXISTS "impuesto_3_porcentaje",
  DROP COLUMN IF EXISTS "impuesto_3_monto";

-- Paso 7: Eliminar campos ambiguos
ALTER TABLE "comprobantes_detalle"
  DROP COLUMN IF EXISTS "subtotal",
  DROP COLUMN IF EXISTS "total",
  DROP COLUMN IF EXISTS "descuento_porcentaje",
  DROP COLUMN IF EXISTS "descuento_monto";

-- Paso 8: Comentarios en la tabla para documentación
COMMENT ON COLUMN "comprobantes_detalle"."precio_unitario" IS 'Precio unitario SIN IVA';
COMMENT ON COLUMN "comprobantes_detalle"."importe_bruto" IS 'unidades × precio_unitario';
COMMENT ON COLUMN "comprobantes_detalle"."porc_descuento" IS 'Porcentaje de descuento aplicado (0-100)';
COMMENT ON COLUMN "comprobantes_detalle"."importe_descuento" IS 'Monto del descuento en pesos';
COMMENT ON COLUMN "comprobantes_detalle"."importe_neto" IS 'Base imponible de IVA (importe_bruto - importe_descuento)';
COMMENT ON COLUMN "comprobantes_detalle"."alicuota_iva" IS 'Alícuota IVA aplicable: 0, 10.5, 21 o 27';
COMMENT ON COLUMN "comprobantes_detalle"."importe_iva" IS 'IVA calculado sobre el neto';
COMMENT ON COLUMN "comprobantes_detalle"."importe_total" IS 'Total del ítem (importe_neto + importe_iva)';

-- ============================================
-- FIN DE LA MIGRACIÓN
-- ============================================
