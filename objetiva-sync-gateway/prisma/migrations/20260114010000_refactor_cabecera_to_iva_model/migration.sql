-- ============================================
-- MIGRACIÓN: Refactorización de comprobantes_cabecera
-- Modelo contable/fiscal argentino con IVA (coherente con detalle)
-- Fecha: 2026-01-14
-- ============================================

-- Paso 1: Agregar nuevos campos específicos de IVA
-- La cabecera es un RESUMEN de los detalles, no calcula valores propios

ALTER TABLE "comprobantes_cabecera"
  ADD COLUMN IF NOT EXISTS "total_bruto" DECIMAL(12,2),
  ADD COLUMN IF NOT EXISTS "total_neto" DECIMAL(12,2),
  ADD COLUMN IF NOT EXISTS "total_iva" DECIMAL(12,2);

-- Paso 2: Migrar datos existentes
-- Calculamos los nuevos valores basados en los campos actuales

-- 2.1: total_bruto (suma de importes brutos de los ítems)
-- Si no tenemos información, usar subtotal o hacer un cálculo inverso
UPDATE "comprobantes_cabecera"
SET "total_bruto" = CASE
  WHEN "subtotal" IS NOT NULL AND "total_descuentos" IS NOT NULL
    THEN "subtotal" + "total_descuentos"
  WHEN "subtotal" IS NOT NULL
    THEN "subtotal"
  WHEN "total" IS NOT NULL AND "total_impuestos" IS NOT NULL
    THEN "total" - "total_impuestos"
  ELSE 0
END
WHERE "total_bruto" IS NULL;

-- 2.2: total_neto (base imponible = bruto - descuentos)
UPDATE "comprobantes_cabecera"
SET "total_neto" = CASE
  WHEN "subtotal" IS NOT NULL
    THEN "subtotal"
  WHEN "total_bruto" IS NOT NULL
    THEN "total_bruto" - COALESCE("total_descuentos", 0)
  ELSE 0
END
WHERE "total_neto" IS NULL;

-- 2.3: total_iva (suma de IVA de los ítems)
-- Si tenemos total_impuestos, asumimos que es principalmente IVA
UPDATE "comprobantes_cabecera"
SET "total_iva" = CASE
  WHEN "total_impuestos" IS NOT NULL
    THEN "total_impuestos"
  WHEN "total" IS NOT NULL AND "total_neto" IS NOT NULL
    THEN "total" - "total_neto"
  ELSE 0
END
WHERE "total_iva" IS NULL;

-- Paso 3: Hacer que los nuevos campos sean NOT NULL
-- Primero aseguramos que no haya valores NULL
UPDATE "comprobantes_cabecera"
SET
  "total_bruto" = COALESCE("total_bruto", 0),
  "total_neto" = COALESCE("total_neto", 0),
  "total_iva" = COALESCE("total_iva", 0),
  "total_descuentos" = COALESCE("total_descuentos", 0)
WHERE "total_bruto" IS NULL
   OR "total_neto" IS NULL
   OR "total_iva" IS NULL
   OR "total_descuentos" IS NULL;

-- Ahora sí, aplicar NOT NULL
ALTER TABLE "comprobantes_cabecera"
  ALTER COLUMN "total_bruto" SET NOT NULL,
  ALTER COLUMN "total_neto" SET NOT NULL,
  ALTER COLUMN "total_iva" SET NOT NULL,
  ALTER COLUMN "total_descuentos" SET NOT NULL,
  ALTER COLUMN "total_descuentos" SET DEFAULT 0;

-- Paso 4: Agregar constraints de validación
-- Coherencia matemática y reglas de negocio

ALTER TABLE "comprobantes_cabecera"
  ADD CONSTRAINT "chk_cabecera_total_bruto_non_negative"
    CHECK ("total_bruto" >= 0),

  ADD CONSTRAINT "chk_cabecera_total_neto_non_negative"
    CHECK ("total_neto" >= 0),

  ADD CONSTRAINT "chk_cabecera_total_descuentos_lte_bruto"
    CHECK ("total_descuentos" <= "total_bruto"),

  ADD CONSTRAINT "chk_cabecera_cantidad_items_non_negative"
    CHECK ("cantidad_items" >= 0);

-- Paso 5: Eliminar campos obsoletos (ambiguos o genéricos)
ALTER TABLE "comprobantes_cabecera"
  DROP COLUMN IF EXISTS "subtotal",
  DROP COLUMN IF EXISTS "total_impuestos";

-- Paso 6: Comentarios en la tabla para documentación
COMMENT ON COLUMN "comprobantes_cabecera"."total_bruto" IS 'Suma de importes brutos de todos los ítems (SUM(detalle.importe_bruto))';
COMMENT ON COLUMN "comprobantes_cabecera"."total_descuentos" IS 'Suma de descuentos de todos los ítems (SUM(detalle.importe_descuento))';
COMMENT ON COLUMN "comprobantes_cabecera"."total_neto" IS 'Base imponible total (SUM(detalle.importe_neto) = total_bruto - total_descuentos)';
COMMENT ON COLUMN "comprobantes_cabecera"."total_iva" IS 'Total de IVA del comprobante (SUM(detalle.importe_iva))';
COMMENT ON COLUMN "comprobantes_cabecera"."total" IS 'Total final con IVA (SUM(detalle.importe_total) = total_neto + total_iva)';
COMMENT ON COLUMN "comprobantes_cabecera"."cantidad_items" IS 'Cantidad total de líneas del comprobante (COUNT(detalle))';

COMMENT ON TABLE "comprobantes_cabecera" IS 'Cabecera de comprobantes - RESUMEN de detalles. No calcula valores propios, solo totaliza los importes calculados en comprobantes_detalle.';

-- ============================================
-- FIN DE LA MIGRACIÓN
-- ============================================
