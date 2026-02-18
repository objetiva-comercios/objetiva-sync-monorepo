/**
 * Utilidades para almacenar y recuperar lotes de sincronización
 */

import { promises as fs } from 'fs';
import path from 'path';
import { logger } from './logger.js';

const LOGS_DIR = './database/logs';

/**
 * Interfaz para un lote guardado
 */
export interface BatchData {
  batchNumber: number;
  records: any[];
  recordCount: number;
  timestamp: string;
}

/**
 * Asegura que existe el directorio para un log
 */
async function ensureLogDirectory(logId: number): Promise<string> {
  const logDir = path.join(LOGS_DIR, logId.toString());
  await fs.mkdir(logDir, { recursive: true });
  return logDir;
}

/**
 * Guarda un lote de registros en un archivo JSON
 */
export async function saveBatch(
  logId: number,
  batchNumber: number,
  records: any[]
): Promise<string> {
  try {
    const logDir = await ensureLogDirectory(logId);
    const filename = `batch_${batchNumber}.json`;
    const filepath = path.join(logDir, filename);

    const batchData: BatchData = {
      batchNumber,
      records,
      recordCount: records.length,
      timestamp: new Date().toISOString(),
    };

    await fs.writeFile(filepath, JSON.stringify(batchData, null, 2), 'utf-8');

    logger.debug(
      { logId, batchNumber, recordCount: records.length, filepath },
      'Lote guardado en archivo'
    );

    return filepath;
  } catch (error) {
    logger.error({ error, logId, batchNumber }, 'Error al guardar lote');
    throw error;
  }
}

/**
 * Lee un lote específico
 */
export async function readBatch(logId: number, batchNumber: number): Promise<BatchData | null> {
  try {
    const filepath = path.join(LOGS_DIR, logId.toString(), `batch_${batchNumber}.json`);
    const content = await fs.readFile(filepath, 'utf-8');
    return JSON.parse(content) as BatchData;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      return null;
    }
    logger.error({ error, logId, batchNumber }, 'Error al leer lote');
    throw error;
  }
}

/**
 * Obtiene todos los lotes de un log
 */
export async function getAllBatches(logId: number): Promise<BatchData[]> {
  try {
    const logDir = path.join(LOGS_DIR, logId.toString());

    // Verificar si el directorio existe
    try {
      await fs.access(logDir);
    } catch {
      return [];
    }

    const files = await fs.readdir(logDir);
    const batchFiles = files.filter((f) => f.startsWith('batch_') && f.endsWith('.json'));

    const batches: BatchData[] = [];
    for (const file of batchFiles) {
      const content = await fs.readFile(path.join(logDir, file), 'utf-8');
      batches.push(JSON.parse(content) as BatchData);
    }

    // Ordenar por número de lote
    batches.sort((a, b) => a.batchNumber - b.batchNumber);

    return batches;
  } catch (error) {
    logger.error({ error, logId }, 'Error al obtener todos los lotes');
    throw error;
  }
}

/**
 * Cuenta cuántos lotes tiene un log
 */
export async function countBatches(logId: number): Promise<number> {
  try {
    const logDir = path.join(LOGS_DIR, logId.toString());

    try {
      await fs.access(logDir);
    } catch {
      return 0;
    }

    const files = await fs.readdir(logDir);
    return files.filter((f) => f.startsWith('batch_') && f.endsWith('.json')).length;
  } catch (error) {
    logger.error({ error, logId }, 'Error al contar lotes');
    return 0;
  }
}

/**
 * Elimina todos los lotes de un log
 */
export async function deleteBatches(logId: number): Promise<number> {
  try {
    const logDir = path.join(LOGS_DIR, logId.toString());

    try {
      await fs.access(logDir);
    } catch {
      return 0;
    }

    const files = await fs.readdir(logDir);
    const batchFiles = files.filter((f) => f.startsWith('batch_') && f.endsWith('.json'));

    for (const file of batchFiles) {
      await fs.unlink(path.join(logDir, file));
    }

    // Intentar eliminar el directorio (solo si está vacío)
    try {
      await fs.rmdir(logDir);
    } catch {
      // Ignorar si no se puede eliminar (puede tener otros archivos)
    }

    logger.info({ logId, deletedCount: batchFiles.length }, 'Lotes eliminados');
    return batchFiles.length;
  } catch (error) {
    logger.error({ error, logId }, 'Error al eliminar lotes');
    throw error;
  }
}

/**
 * Obtiene metadata de todos los lotes de un log (sin cargar los registros)
 */
export async function getBatchesMetadata(logId: number): Promise<
  Array<{
    batchNumber: number;
    recordCount: number;
    timestamp: string;
  }>
> {
  try {
    const batches = await getAllBatches(logId);
    return batches.map((b) => ({
      batchNumber: b.batchNumber,
      recordCount: b.recordCount,
      timestamp: b.timestamp,
    }));
  } catch (error) {
    logger.error({ error, logId }, 'Error al obtener metadata de lotes');
    return [];
  }
}
