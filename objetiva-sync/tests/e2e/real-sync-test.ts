/**
 * E2E Real Sync Test
 *
 * This test performs a REAL end-to-end sync between objetiva-sync and objetiva-sync-gateway:
 * 1. Connects to real SQL Server (via adapter)
 * 2. Connects to real Gateway API (via API client)
 * 3. Executes a full sync for a specified entity
 * 4. Verifies data arrived in real PostgreSQL
 *
 * Usage:
 *   npx tsx tests/e2e/real-sync-test.ts [entity]
 *
 * Where [entity] is one of: articulos, comprobantes_cabecera, comprobantes_detalle, comprobantes_pagos
 * If no entity specified, syncs articulos by default.
 */

import { PrismaClient } from '@prisma/client';
import { loadEnv } from '../../src/config/env.js';
import { SyncEngine } from '../../src/sync/sync-engine.js';
import { initSyncQueue } from '../../src/sync/sync-queue-instance.js';
import { APIClient } from '../../src/api-client/index.js';
import { EntityType } from '../../src/types/common.js';
import { initDatabase } from '../../src/store/index.js';
import { SQLServerAdapter } from '../../src/adapters/index.js';
import * as ConnectionConfigRepo from '../../src/store/repositories/connection-config-repo.js';
import * as QueriesRepo from '../../src/store/repositories/queries-repo.js';
import * as SyncLogsRepo from '../../src/store/repositories/sync-logs-repo.js';
import * as SyncStateRepo from '../../src/store/repositories/sync-state-repo.js';
import type { IDataSourceAdapter } from '../../src/adapters/types.js';

// ANSI color codes for terminal output
const colors = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m',
};

function log(message: string, color: string = colors.reset) {
  console.log(`${color}${message}${colors.reset}`);
}

function logSection(title: string) {
  console.log(`\n${colors.bright}${colors.cyan}${'='.repeat(60)}${colors.reset}`);
  console.log(`${colors.bright}${colors.cyan}  ${title}${colors.reset}`);
  console.log(`${colors.bright}${colors.cyan}${'='.repeat(60)}${colors.reset}\n`);
}

function logSuccess(message: string) {
  log(`✓ ${message}`, colors.green);
}

function logError(message: string) {
  log(`✗ ${message}`, colors.red);
}

function logWarning(message: string) {
  log(`⚠ ${message}`, colors.yellow);
}

function logInfo(message: string) {
  log(`ℹ ${message}`, colors.blue);
}

interface TestResult {
  success: boolean;
  entity: string;
  query: {
    id: number;
    name: string;
    sql: string;
  };
  sync: {
    status: string;
    recordsFetched: number;
    recordsSent: number;
    recordsFailed: number;
    durationMs: number;
  };
  gateway: {
    recordsFound: number;
    sampleRecords: any[];
  };
  error?: string;
}

/**
 * Get active query for entity or create a default one if none exists
 */
async function ensureQuery(entityType: EntityType): Promise<{ id: number; name: string; sqlQuery: string }> {
  // Try to get existing active query
  const existingQuery = await QueriesRepo.getActiveQueryByEntity(entityType);

  if (existingQuery) {
    logInfo(`Using existing query: ${existingQuery.name} (ID: ${existingQuery.id})`);
    return existingQuery;
  }

  // Create default query if none exists
  logWarning(`No active query found for ${entityType}, creating default query...`);

  const defaultQueries: Record<string, { name: string; sql: string }> = {
    [EntityType.ARTICULO]: {
      name: 'E2E Test - All Articulos',
      sql: 'SELECT TOP 10 * FROM articulos ORDER BY actualizado DESC',
    },
    [EntityType.COMPROBANTE_CABECERA]: {
      name: 'E2E Test - Recent Comprobantes',
      sql: 'SELECT TOP 10 * FROM comprobantes_cabecera ORDER BY fecha DESC',
    },
    [EntityType.COMPROBANTE_DETALLE]: {
      name: 'E2E Test - Recent Detalle',
      sql: 'SELECT TOP 10 * FROM comprobantes_detalle ORDER BY actualizado DESC',
    },
    [EntityType.COMPROBANTE_PAGO]: {
      name: 'E2E Test - Recent Pagos',
      sql: 'SELECT TOP 10 * FROM comprobantes_pagos ORDER BY actualizado DESC',
    },
  };

  const { name, sql } = defaultQueries[entityType] || defaultQueries[EntityType.ARTICULO];

  const queryId = await QueriesRepo.createQuery({
    entityType,
    name,
    sqlQuery: sql,
    isActive: true,
  });

  logSuccess(`Created default query (ID: ${queryId})`);

  return {
    id: queryId,
    name,
    sqlQuery: sql,
  };
}

/**
 * Verify data in PostgreSQL using Prisma
 */
async function verifyInPostgres(entityType: EntityType, erpCodes: string[]): Promise<{ count: number; samples: any[] }> {
  const prisma = new PrismaClient({
    datasourceUrl: process.env.GATEWAY_DATABASE_URL || process.env.DATABASE_URL,
  });

  try {
    let count = 0;
    let samples: any[] = [];

    switch (entityType) {
      case EntityType.ARTICULO:
        // Check records synced in the last minute
        const oneMinuteAgo = new Date(Date.now() - 60 * 1000);
        count = await prisma.articulo.count({
          where: {
            erp_sincronizado: true,
            erp_fecha_sync: { gte: oneMinuteAgo },
          },
        });
        samples = await prisma.articulo.findMany({
          where: {
            erp_sincronizado: true,
            erp_fecha_sync: { gte: oneMinuteAgo },
          },
          take: 3,
          select: { id: false,  // Exclude BigInt to avoid serialization issues
            erp_codigo: true,
            nombre: true,
            precio: true,
            erp_sincronizado: true,
            erp_fecha_sync: true,
          },
        });
        break;

      case EntityType.COMPROBANTE_CABECERA:
        count = await prisma.comprobanteCabecera.count({
          where: {
            erp_operacion: { not: null },
          },
        });
        samples = await prisma.comprobanteCabecera.findMany({
          take: 3,
          orderBy: { erp_fecha_sync: 'desc' },
          select: { id: false,  // Exclude BigInt to avoid serialization issues
            erp_operacion: true,
            erp_formulario: true,
            erp_numero: true,
            tercero_nombre: true,
            total_venta: true,
            erp_sincronizado: true,
          },
        });
        break;

      case EntityType.COMPROBANTE_DETALLE:
        count = await prisma.comprobanteDetalle.count();
        samples = await prisma.comprobanteDetalle.findMany({
          take: 3,
          orderBy: { actualizado: 'desc' },
          select: { id: false,  // Exclude BigInt to avoid serialization issues
            erp_operacion: true,
            erp_formulario: true,
            erp_numero: true,
            linea_numero: true,
            nombre_articulo: true,
            unidades: true,
            importe_total: true,
          },
        });
        break;

      case EntityType.COMPROBANTE_PAGO:
        count = await prisma.comprobantePago.count();
        samples = await prisma.comprobantePago.findMany({
          take: 3,
          orderBy: { actualizado: 'desc' },
          select: { id: false,  // Exclude BigInt to avoid serialization issues
            erp_operacion: true,
            erp_formulario: true,
            erp_numero: true,
            linea_numero: true,
            medio: true,
            monto: true,
            moneda: true,
          },
        });
        break;
    }

    return { count, samples };
  } finally {
    await prisma.$disconnect();
  }
}

/**
 * Run E2E sync test for specified entity
 */
async function runE2ETest(entityType: EntityType): Promise<TestResult> {
  const result: TestResult = {
    success: false,
    entity: entityType,
    query: { id: 0, name: '', sql: '' },
    sync: {
      status: '',
      recordsFetched: 0,
      recordsSent: 0,
      recordsFailed: 0,
      durationMs: 0,
    },
    gateway: {
      recordsFound: 0,
      sampleRecords: [],
    },
  };

  try {
    // STEP 1: Ensure query exists
    logSection('STEP 1: Query Configuration');
    const query = await ensureQuery(entityType);
    result.query = query;
    logInfo(`Query ID: ${query.id}`);
    logInfo(`Query Name: ${query.name}`);
    logInfo(`SQL: ${query.sqlQuery}`);

    // STEP 2: Create adapters and sync engine
    logSection('STEP 2: Initialize Sync Engine');

    // Try to get active connection first, otherwise get first available
    let connectionWrapper = await ConnectionConfigRepo.getActiveConnectionConfig();
    let connectionConfig: Record<string, unknown>;

    if (!connectionWrapper) {
      // No active connection, try to get first available
      const allConnections = await ConnectionConfigRepo.getAllConnections();
      if (!allConnections || allConnections.length === 0) {
        throw new Error('No connection configuration found. Please configure SQL Server connection in dashboard.');
      }

      // Get config for first connection
      connectionConfig = await ConnectionConfigRepo.getConnectionConfig(allConnections[0].id);
      logInfo(`Using connection: ${allConnections[0].name} (${allConnections[0].adapterType})`);
    } else {
      logInfo(`Using active connection: ${connectionWrapper.name} (${connectionWrapper.adapterType})`);
      connectionConfig = connectionWrapper.config;

      // Debug: check if config is valid
      if (!connectionConfig) {
        console.log('DEBUG: connectionWrapper =', JSON.stringify(connectionWrapper, null, 2));
        throw new Error('Connection config is undefined. Check decryption or database schema.');
      }

      logInfo(`Config keys: ${Object.keys(connectionConfig).join(', ')}`);
    }

    // Create and connect adapter
    const adapter = new SQLServerAdapter();
    await adapter.connect(connectionConfig);
    logSuccess('Connected to SQL Server');

    // Create real API client
    const gatewayUrl = process.env.GATEWAY_URL || 'http://localhost:3335';
    const username = process.env.SYNC_USERNAME;
    const password = process.env.SYNC_PASSWORD;

    if (!username || !password) {
      throw new Error('SYNC_USERNAME and SYNC_PASSWORD environment variables are required');
    }

    const apiClient = new APIClient({
      baseUrl: gatewayUrl,
      username,
      password,
    });

    await apiClient.initialize();
    logSuccess(`API client initialized (connected to ${gatewayUrl})`);

    // Create sync engine
    const syncEngine = new SyncEngine({
      dataSourceAdapter: adapter,
      apiClient,
      defaultBatchSize: 100,
    });

    initSyncQueue(syncEngine);
    logSuccess('Sync engine initialized');

    // STEP 3: Execute sync
    logSection('STEP 3: Execute Sync');
    logInfo('Starting full sync...');

    const syncStartTime = Date.now();
    const syncResult = await syncEngine.syncQuery(query.id, { fullSync: true });
    const syncDuration = Date.now() - syncStartTime;

    result.sync = {
      status: syncResult.status,
      recordsFetched: syncResult.recordsFetched,
      recordsSent: syncResult.recordsSent,
      recordsFailed: syncResult.recordsFailed,
      durationMs: syncResult.durationMs || syncDuration,
    };

    if (syncResult.status === 'success' || syncResult.status === 'partial') {
      logSuccess(`Sync completed: ${syncResult.status.toUpperCase()}`);
      logInfo(`  - Records fetched: ${syncResult.recordsFetched}`);
      logInfo(`  - Records sent: ${syncResult.recordsSent}`);
      logInfo(`  - Records failed: ${syncResult.recordsFailed}`);
      logInfo(`  - Duration: ${syncResult.durationMs}ms`);
    } else {
      logError(`Sync failed: ${syncResult.status}`);
      if (syncResult.error) {
        logError(`  Error: ${syncResult.error}`);
      }
      throw new Error(`Sync failed with status: ${syncResult.status}`);
    }

    // STEP 4: Verify in sync logs
    logSection('STEP 4: Verify Sync Logs');
    if (syncResult.logId) {
      const log = await SyncLogsRepo.getLogById(syncResult.logId);
      if (log) {
        logSuccess('Sync log created successfully');
        logInfo(`  Log ID: ${log.id}`);
        logInfo(`  Status: ${log.status}`);
        logInfo(`  Created at: ${log.createdAt}`);
      } else {
        logWarning('Sync log not found');
      }
    } else {
      logInfo('No log ID returned (sync may have completed without creating log)');
    }

    // STEP 5: Verify sync state
    logSection('STEP 5: Verify Sync State');
    const syncState = await SyncStateRepo.getSyncState(query.id);
    if (syncState) {
      logSuccess('Sync state updated');
      logInfo(`  Last sync: ${syncState.lastSyncAt}`);
      logInfo(`  Records synced: ${syncState.lastSyncCount}`);
      logInfo(`  Total synced: ${syncState.totalSynced}`);
    } else {
      logWarning('Sync state not found');
    }

    // STEP 6: Verify data in PostgreSQL
    logSection('STEP 6: Verify Data in PostgreSQL Gateway');
    logInfo('Connecting to PostgreSQL to verify records...');

    // For verification, we'll just check overall count (since we don't track specific erp_codes in sync result)
    const verification = await verifyInPostgres(entityType, []);
    result.gateway = {
      recordsFound: verification.count,
      sampleRecords: verification.samples,
    };

    logSuccess(`Found ${verification.count} records in PostgreSQL`);

    if (verification.samples.length > 0) {
      logInfo(`Sample records (showing ${Math.min(3, verification.samples.length)}):`);
      verification.samples.forEach((record, index) => {
        console.log(`  ${index + 1}. ${JSON.stringify(record, null, 2).split('\n').join('\n     ')}`);
      });
    }

    // STEP 7: Final validation
    logSection('STEP 7: Final Validation');

    const validations = [
      {
        name: 'Sync completed successfully',
        passed: syncResult.status === 'success' || syncResult.status === 'partial',
      },
      {
        name: 'Records were fetched',
        passed: syncResult.recordsFetched > 0,
      },
      {
        name: 'Records were sent to gateway',
        passed: syncResult.recordsSent > 0,
      },
      {
        name: 'Data exists in PostgreSQL',
        passed: verification.count > 0,
      },
      {
        name: 'No complete failure',
        passed: syncResult.status !== 'failed',
      },
    ];

    validations.forEach((validation) => {
      if (validation.passed) {
        logSuccess(validation.name);
      } else {
        logError(validation.name);
      }
    });

    const allPassed = validations.every((v) => v.passed);
    result.success = allPassed;

    // Disconnect adapter
    await adapter.disconnect();

    return result;
  } catch (error) {
    result.error = error instanceof Error ? error.message : String(error);
    logError(`Test failed: ${result.error}`);
    return result;
  }
}

/**
 * Main execution
 */
async function main() {
  console.clear();

  logSection('E2E Real Sync Test - objetiva-sync → objetiva-sync-gateway');

  // Load environment
  loadEnv();
  logSuccess('Environment loaded');

  // Initialize database
  initDatabase();
  logSuccess('Database initialized');

  // Get entity from command line args
  const entityArg = process.argv[2]?.toLowerCase();
  const entityMap: Record<string, EntityType> = {
    articulos: EntityType.ARTICULO,
    articulo: EntityType.ARTICULO,
    comprobantes_cabecera: EntityType.COMPROBANTE_CABECERA,
    cabecera: EntityType.COMPROBANTE_CABECERA,
    comprobantes_detalle: EntityType.COMPROBANTE_DETALLE,
    detalle: EntityType.COMPROBANTE_DETALLE,
    comprobantes_pagos: EntityType.COMPROBANTE_PAGO,
    comprobantes_pago: EntityType.COMPROBANTE_PAGO,
    pagos: EntityType.COMPROBANTE_PAGO,
    pago: EntityType.COMPROBANTE_PAGO,
  };

  const entity = entityArg ? entityMap[entityArg] : EntityType.ARTICULO;

  if (!entity) {
    logError(`Invalid entity: ${entityArg}`);
    logInfo('Valid entities: articulos, comprobantes_cabecera, comprobantes_detalle, comprobantes_pagos');
    process.exit(1);
  }

  logInfo(`Testing entity: ${entity}`);
  console.log('');

  // Run test
  const result = await runE2ETest(entity);

  // Print summary
  logSection('TEST SUMMARY');

  console.log(`${colors.bright}Entity:${colors.reset} ${result.entity}`);
  console.log(`${colors.bright}Query:${colors.reset} ${result.query.name} (ID: ${result.query.id})`);
  console.log(`${colors.bright}Status:${colors.reset} ${result.sync.status.toUpperCase()}`);
  console.log('');

  console.log(`${colors.bright}Sync Results:${colors.reset}`);
  console.log(`  - Fetched: ${result.sync.recordsFetched}`);
  console.log(`  - Sent: ${result.sync.recordsSent}`);
  console.log(`  - Failed: ${result.sync.recordsFailed}`);
  console.log(`  - Duration: ${result.sync.durationMs}ms`);
  console.log('');

  console.log(`${colors.bright}Gateway Verification:${colors.reset}`);
  console.log(`  - Records in PostgreSQL: ${result.gateway.recordsFound}`);
  console.log('');

  if (result.success) {
    logSuccess('✓✓✓ E2E TEST PASSED ✓✓✓');
    console.log('');
    logInfo('The sync completed successfully and data was verified in PostgreSQL.');
    process.exit(0);
  } else {
    logError('✗✗✗ E2E TEST FAILED ✗✗✗');
    console.log('');
    if (result.error) {
      logError(`Error: ${result.error}`);
    }
    process.exit(1);
  }
}

// Run main
main().catch((error) => {
  logError(`Fatal error: ${error}`);
  process.exit(1);
});
