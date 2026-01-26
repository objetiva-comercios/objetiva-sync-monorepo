-- Migration: Require normalized fields in comprobantes
-- Date: 2026-01-11
-- Description: Make erp_operacion, erp_formulario, erp_numero required (NOT NULL) in all comprobante tables

-- IMPORTANTE: Esta migración asume que todos los datos existentes serán eliminados antes de aplicar
-- Si necesitas mantener datos existentes, primero actualiza los valores NULL antes de ejecutar

-- ============================================
-- comprobantes_cabecera
-- ============================================
ALTER TABLE "comprobantes_cabecera"
  ALTER COLUMN "erp_operacion" SET NOT NULL,
  ALTER COLUMN "erp_formulario" SET NOT NULL,
  ALTER COLUMN "erp_numero" SET NOT NULL;

-- ============================================
-- comprobantes_detalle
-- ============================================
ALTER TABLE "comprobantes_detalle"
  ALTER COLUMN "erp_operacion" SET NOT NULL,
  ALTER COLUMN "erp_formulario" SET NOT NULL,
  ALTER COLUMN "erp_numero" SET NOT NULL;

-- ============================================
-- comprobantes_pagos
-- ============================================
ALTER TABLE "comprobantes_pagos"
  ALTER COLUMN "erp_operacion" SET NOT NULL,
  ALTER COLUMN "erp_formulario" SET NOT NULL,
  ALTER COLUMN "erp_numero" SET NOT NULL;
