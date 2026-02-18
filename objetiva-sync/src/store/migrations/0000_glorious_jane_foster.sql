CREATE TABLE `config` (
	`key` text PRIMARY KEY NOT NULL,
	`value` text NOT NULL,
	`encrypted` integer DEFAULT false,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP
);
--> statement-breakpoint
CREATE TABLE `connection_config` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`adapter_type` text NOT NULL,
	`name` text NOT NULL,
	`config_json` text NOT NULL,
	`is_active` integer DEFAULT false,
	`test_status` text,
	`test_message` text,
	`tested_at` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP
);
--> statement-breakpoint
CREATE INDEX `idx_connection_config_active` ON `connection_config` (`is_active`);--> statement-breakpoint
CREATE TABLE `field_mappings` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`query_id` integer NOT NULL,
	`source_field` text NOT NULL,
	`target_field` text NOT NULL,
	`transform_type` text,
	`default_value` text,
	`is_required` integer DEFAULT false,
	`created_at` text DEFAULT CURRENT_TIMESTAMP,
	FOREIGN KEY (`query_id`) REFERENCES `queries`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `idx_field_mappings_query_id` ON `field_mappings` (`query_id`);--> statement-breakpoint
CREATE TABLE `notification_config` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`channel_type` text NOT NULL,
	`name` text NOT NULL,
	`config_json` text NOT NULL,
	`is_enabled` integer DEFAULT true,
	`notify_on_success` integer DEFAULT false,
	`notify_on_error` integer DEFAULT true,
	`notify_on_warning` integer DEFAULT true,
	`test_status` text,
	`tested_at` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP
);
--> statement-breakpoint
CREATE INDEX `idx_notification_config_enabled` ON `notification_config` (`is_enabled`);--> statement-breakpoint
CREATE TABLE `queries` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`entity_type` text NOT NULL,
	`name` text NOT NULL,
	`sql_query` text NOT NULL,
	`incremental_field` text,
	`incremental_type` text,
	`join_field` text,
	`is_active` integer DEFAULT true,
	`last_test_status` text,
	`last_test_at` text,
	`last_test_row_count` integer,
	`created_at` text DEFAULT CURRENT_TIMESTAMP,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP
);
--> statement-breakpoint
CREATE INDEX `idx_queries_entity_type` ON `queries` (`entity_type`);--> statement-breakpoint
CREATE INDEX `idx_queries_active` ON `queries` (`is_active`);--> statement-breakpoint
CREATE TABLE `retry_queue` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`entity_type` text NOT NULL,
	`payload` text NOT NULL,
	`attempt_count` integer DEFAULT 0,
	`max_attempts` integer DEFAULT 5,
	`last_error` text,
	`next_retry_at` text,
	`status` text DEFAULT 'pending',
	`created_at` text DEFAULT CURRENT_TIMESTAMP,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP
);
--> statement-breakpoint
CREATE INDEX `idx_retry_queue_status` ON `retry_queue` (`status`);--> statement-breakpoint
CREATE INDEX `idx_retry_queue_next_retry` ON `retry_queue` (`next_retry_at`);--> statement-breakpoint
CREATE TABLE `sync_logs` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`entity_type` text NOT NULL,
	`sync_type` text NOT NULL,
	`status` text NOT NULL,
	`records_fetched` integer DEFAULT 0,
	`records_sent` integer DEFAULT 0,
	`records_failed` integer DEFAULT 0,
	`duration_ms` integer,
	`error_message` text,
	`details` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP
);
--> statement-breakpoint
CREATE INDEX `idx_sync_logs_created` ON `sync_logs` (`created_at`);--> statement-breakpoint
CREATE INDEX `idx_sync_logs_entity` ON `sync_logs` (`entity_type`,`created_at`);--> statement-breakpoint
CREATE INDEX `idx_sync_logs_status` ON `sync_logs` (`status`);--> statement-breakpoint
CREATE TABLE `sync_state` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`entity_type` text NOT NULL,
	`last_sync_value` text,
	`last_sync_at` text,
	`last_sync_count` integer,
	`total_synced` integer DEFAULT 0,
	`status` text DEFAULT 'idle',
	`error_message` text,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP
);
--> statement-breakpoint
CREATE UNIQUE INDEX `sync_state_entity_type_unique` ON `sync_state` (`entity_type`);--> statement-breakpoint
CREATE UNIQUE INDEX `idx_sync_state_entity_type` ON `sync_state` (`entity_type`);