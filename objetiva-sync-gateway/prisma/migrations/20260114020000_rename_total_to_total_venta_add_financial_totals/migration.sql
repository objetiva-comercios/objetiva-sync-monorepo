-- ============================================
-- MIGRACIÓN: Separación de Totales Fiscales y Financieros
-- Renombra 'total' a 'total_venta' y agrega campos financieros
-- Fecha: 2026-01-14
-- ============================================

-- Paso 1: Renombrar 'total' a 'total_venta'
-- Este campo representa el total FISCAL (venta) = total_neto + total_iva
ALTER TABLE "comprobantes_cabecera"
  RENAME COLUMN "total" TO "total_venta";

-- Paso 2: Agregar campos financieros (cobro)
-- Estos campos representan el total COBRADO incluyendo intereses
ALTER TABLE "comprobantes_cabecera"
  ADD COLUMN IF NOT EXISTS "total_intereses_financieros" DECIMAL(12,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "total_cobrado" DECIMAL(12,2);

-- Paso 3: Migrar datos existentes
-- total_cobrado inicialmente es igual a total_venta (sin intereses)
UPDATE "comprobantes_cabecera"
SET "total_cobrado" = "total_venta"
WHERE "total_cobrado" IS NULL;

-- Paso 4: Comentarios en la tabla para documentación
COMMENT ON COLUMN "comprobantes_cabecera"."total_venta" IS 'Total de venta con IVA (SUM(detalle.importe_total) = total_neto + total_iva) - FISCAL';
COMMENT ON COLUMN "comprobantes_cabecera"."total_intereses_financieros" IS 'Total de intereses financieros cobrados (SUM(pagos.interes_financiero)) - FINANCIERO';
COMMENT ON COLUMN "comprobantes_cabecera"."total_cobrado" IS 'Total cobrado incluyendo intereses (total_venta + total_intereses_financieros) - FINANCIERO';

COMMENT ON TABLE "comprobantes_cabecera" IS 'Cabecera de comprobantes - Separa TOTALES FISCALES (venta) de TOTALES FINANCIEROS (cobro). RESUMEN de detalles y pagos.';

-- ============================================
-- FIN DE LA MIGRACIÓN
-- ============================================
