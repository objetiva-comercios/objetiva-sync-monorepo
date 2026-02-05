/**
 * Schema de base de datos SQLite con Drizzle ORM
 * Define las 8 tablas del sistema según DATABASE.md
 */

import { sqliteTable, text, integer, index, uniqueIndex } from 'drizzle-orm/sqlite-core';
import { sql } from 'drizzle-orm';

/**
 * Tabla: config
 * Configuración general del sincronizador
 */
export const config = sqliteTable('config', {
  key: text('key').primaryKey(),
  value: text('value').notNull(),
  encrypted: integer('encrypted', { mode: 'boolean' }).default(false),
  updatedAt: text('updated_at').default(sql`CURRENT_TIMESTAMP`),
});

/**
 * Tabla: connection_config
 * Configuración de conexión al origen de datos (ERP)
 */
export const connectionConfig = sqliteTable(
  'connection_config',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    adapterType: text('adapter_type').notNull(), // 'sqlserver', 'postgres', 'mysql', 'excel'
    name: text('name').notNull(),
    configJson: text('config_json').notNull(), // JSON encriptado con credenciales
    isActive: integer('is_active', { mode: 'boolean' }).default(false),
    testStatus: text('test_status'), // 'success', 'failed', null
    testMessage: text('test_message'),
    testedAt: text('tested_at'),
    createdAt: text('created_at').default(sql`CURRENT_TIMESTAMP`),
    updatedAt: text('updated_at').default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => ({
    activeIdx: index('idx_connection_config_active').on(table.isActive),
  })
);

/**
 * Tabla: queries
 * Consultas SQL configuradas para cada entidad
 */
export const queries = sqliteTable(
  'queries',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    entityType: text('entity_type').notNull(), // 'articulos', 'comprobantes', 'comprobantes_detalle', 'pagos'
    name: text('name').notNull(),
    sqlQuery: text('sql_query').notNull(), // Query SQL con placeholder :lastSync
    incrementalField: text('incremental_field'), // Campo para sync incremental
    incrementalType: text('incremental_type'), // 'date' o 'id'
    joinField: text('join_field'), // Campo de asociación (solo detalle/pagos)
    isActive: integer('is_active', { mode: 'boolean' }).default(true),
    displayOrder: integer('display_order').default(0), // Orden para UI y ejecución
    syncInterval: integer('sync_interval').default(1800), // Intervalo en segundos (30 min default)
    isScheduled: integer('is_scheduled', { mode: 'boolean' }).default(false), // Si está programada en scheduler
    lastTestStatus: text('last_test_status'),
    lastTestAt: text('last_test_at'),
    lastTestRowCount: integer('last_test_row_count'),
    createdAt: text('created_at').default(sql`CURRENT_TIMESTAMP`),
    updatedAt: text('updated_at').default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => ({
    entityTypeIdx: index('idx_queries_entity_type').on(table.entityType),
    activeIdx: index('idx_queries_active').on(table.isActive),
    displayOrderIdx: index('idx_queries_display_order').on(table.displayOrder),
    scheduledIdx: index('idx_queries_scheduled').on(table.isScheduled),
  })
);

/**
 * Tabla: field_mappings - ELIMINADA EN FASE 3
 * Ya no se usa - la validación se hace directamente contra schemas Zod
 * Ver: src/sync/query-validator.ts
 */

/**
 * Tabla: sync_state
 * Estado de sincronización por query (cambiado de entityType a queryId)
 */
export const syncState = sqliteTable(
  'sync_state',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    queryId: integer('query_id')
      .notNull()
      .unique()
      .references(() => queries.id, { onDelete: 'cascade' }), // CAMBIO: ahora es por queryId
    entityType: text('entity_type').notNull(), // Mantener para logs/reporting
    lastSyncValue: text('last_sync_value'), // Último valor sincronizado (fecha ISO o ID)
    lastSyncAt: text('last_sync_at'), // Timestamp de última sync exitosa
    lastSyncCount: integer('last_sync_count'), // Registros enviados en última sync
    totalSynced: integer('total_synced').default(0), // Total histórico sincronizado
    status: text('status').default('idle'), // 'idle', 'running', 'error'
    errorMessage: text('error_message'),
    updatedAt: text('updated_at').default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => ({
    queryIdIdx: uniqueIndex('idx_sync_state_query_id').on(table.queryId),
    entityTypeIdx: index('idx_sync_state_entity_type').on(table.entityType),
  })
);

/**
 * Tabla: retry_queue
 * Cola de reintentos para envíos fallidos
 */
export const retryQueue = sqliteTable(
  'retry_queue',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    entityType: text('entity_type').notNull(),
    payload: text('payload').notNull(), // JSON del batch a reintentar
    attemptCount: integer('attempt_count').default(0),
    maxAttempts: integer('max_attempts').default(5),
    lastError: text('last_error'),
    nextRetryAt: text('next_retry_at'),
    status: text('status').default('pending'), // 'pending', 'processing', 'failed', 'success'
    createdAt: text('created_at').default(sql`CURRENT_TIMESTAMP`),
    updatedAt: text('updated_at').default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => ({
    statusIdx: index('idx_retry_queue_status').on(table.status),
    nextRetryIdx: index('idx_retry_queue_next_retry').on(table.nextRetryAt),
  })
);

/**
 * Tabla: sync_logs
 * Historial de sincronizaciones
 */
export const syncLogs = sqliteTable(
  'sync_logs',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    queryId: integer('query_id'), // ID de la query ejecutada
    queryName: text('query_name'), // Nombre de la query para logs
    entityType: text('entity_type').notNull(), // Mantener para compatibilidad
    syncType: text('sync_type').notNull(), // 'incremental', 'full', 'manual', 'retry'
    status: text('status').notNull(), // 'started', 'success', 'partial', 'failed'
    recordsFetched: integer('records_fetched').default(0),
    recordsSent: integer('records_sent').default(0),
    recordsFailed: integer('records_failed').default(0),
    durationMs: integer('duration_ms'),
    errorMessage: text('error_message'),
    details: text('details'), // JSON con detalles adicionales
    createdAt: text('created_at').default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => ({
    createdIdx: index('idx_sync_logs_created').on(table.createdAt),
    queryIdx: index('idx_sync_logs_query').on(table.queryId),
    entityIdx: index('idx_sync_logs_entity').on(table.entityType, table.createdAt),
    statusIdx: index('idx_sync_logs_status').on(table.status),
  })
);

/**
 * Tabla: notification_config
 * Configuración de canales de notificación
 */
export const notificationConfig = sqliteTable(
  'notification_config',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    channelType: text('channel_type').notNull(), // 'slack', 'telegram', 'pushover', 'webhook'
    name: text('name').notNull(),
    configJson: text('config_json').notNull(), // JSON encriptado con credenciales
    isEnabled: integer('is_enabled', { mode: 'boolean' }).default(true),
    notifyOnSuccess: integer('notify_on_success', { mode: 'boolean' }).default(false),
    notifyOnError: integer('notify_on_error', { mode: 'boolean' }).default(true),
    notifyOnWarning: integer('notify_on_warning', { mode: 'boolean' }).default(true),
    testStatus: text('test_status'),
    testedAt: text('tested_at'),
    createdAt: text('created_at').default(sql`CURRENT_TIMESTAMP`),
    updatedAt: text('updated_at').default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => ({
    enabledIdx: index('idx_notification_config_enabled').on(table.isEnabled),
  })
);

/**
 * Tipos inferidos de las tablas para TypeScript
 */
export type Config = typeof config.$inferSelect;
export type NewConfig = typeof config.$inferInsert;

export type ConnectionConfig = typeof connectionConfig.$inferSelect;
export type NewConnectionConfig = typeof connectionConfig.$inferInsert;

export type Query = typeof queries.$inferSelect;
export type NewQuery = typeof queries.$inferInsert;

export type SyncState = typeof syncState.$inferSelect;
export type NewSyncState = typeof syncState.$inferInsert;

export type RetryQueueItem = typeof retryQueue.$inferSelect;
export type NewRetryQueueItem = typeof retryQueue.$inferInsert;

export type SyncLog = typeof syncLogs.$inferSelect;
export type NewSyncLog = typeof syncLogs.$inferInsert;

export type NotificationConfig = typeof notificationConfig.$inferSelect;
export type NewNotificationConfig = typeof notificationConfig.$inferInsert;
