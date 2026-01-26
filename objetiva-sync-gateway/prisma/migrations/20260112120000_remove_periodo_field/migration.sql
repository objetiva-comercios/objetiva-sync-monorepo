-- Migration: Remove periodo field from comprobantes_cabecera
-- Date: 2026-01-12
-- Description:
--   1. Drop index idx_comprobantes_cabecera_periodo
--   2. Drop column periodo from comprobantes_cabecera
--
-- IMPORTANTE: Este campo ya no es necesario y no se usa en los schemas

-- ============================================
-- comprobantes_cabecera
-- ============================================

-- Paso 1: Eliminar índice sobre periodo
DROP INDEX IF EXISTS "idx_comprobantes_cabecera_periodo";

-- Paso 2: Eliminar columna periodo
ALTER TABLE "comprobantes_cabecera"
  DROP COLUMN IF EXISTS "periodo";
