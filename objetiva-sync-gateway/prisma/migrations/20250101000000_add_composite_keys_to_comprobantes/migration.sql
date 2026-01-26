-- AddComprobantesCompositeKeys
-- Agrega campos de clave compuesta para vincular entidades atomizadas

-- ============================================
-- COMPROBANTES_CABECERA: Agregar clave compuesta
-- ============================================
ALTER TABLE "comprobantes_cabecera"
  ADD COLUMN IF NOT EXISTS "erp_operacion" TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS "erp_formulario" TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS "erp_numero" TEXT NOT NULL DEFAULT '';

-- Crear índice único para la clave compuesta
CREATE UNIQUE INDEX IF NOT EXISTS "idx_comprobante_erp_unique"
  ON "comprobantes_cabecera"("erp_operacion", "erp_formulario", "erp_numero");

-- ============================================
-- COMPROBANTES_DETALLE: Agregar clave compuesta
-- ============================================
ALTER TABLE "comprobantes_detalle"
  ADD COLUMN IF NOT EXISTS "erp_operacion" TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS "erp_formulario" TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS "erp_numero" TEXT NOT NULL DEFAULT '';

-- Hacer comprobanteId opcional (puede vincularse después)
ALTER TABLE "comprobantes_detalle"
  ALTER COLUMN "comprobante_id" DROP NOT NULL;

-- Crear índice para buscar por clave compuesta
CREATE INDEX IF NOT EXISTS "idx_detalle_erp_comprobante"
  ON "comprobantes_detalle"("erp_operacion", "erp_formulario", "erp_numero");

-- ============================================
-- COMPROBANTES_PAGOS: Agregar clave compuesta
-- ============================================
ALTER TABLE "comprobantes_pagos"
  ADD COLUMN IF NOT EXISTS "erp_operacion" TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS "erp_formulario" TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS "erp_numero" TEXT NOT NULL DEFAULT '';

-- Hacer comprobanteId opcional (puede vincularse después)
ALTER TABLE "comprobantes_pagos"
  ALTER COLUMN "comprobante_id" DROP NOT NULL;

-- Crear índice para buscar por clave compuesta
CREATE INDEX IF NOT EXISTS "idx_pago_erp_comprobante"
  ON "comprobantes_pagos"("erp_operacion", "erp_formulario", "erp_numero");

-- ============================================
-- NOTA IMPORTANTE
-- ============================================
-- Los valores DEFAULT '' son temporales para permitir agregar las columnas NOT NULL
-- Los sistemas ERP deben proporcionar estos valores en todas las inserciones futuras
-- Ejemplo de clave compuesta:
--   erp_operacion = 'VTA' (Ventas) o 'COM' (Compras)
--   erp_formulario = 'FC' (Factura) o 'NC' (Nota de Crédito)
--   erp_numero = '00001234' (número del comprobante en el ERP)
