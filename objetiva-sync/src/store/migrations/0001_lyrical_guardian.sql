ALTER TABLE `queries` ADD `display_order` integer DEFAULT 0;--> statement-breakpoint
ALTER TABLE `queries` ADD `sync_interval` integer DEFAULT 1800;--> statement-breakpoint
ALTER TABLE `queries` ADD `is_scheduled` integer DEFAULT 0;--> statement-breakpoint
UPDATE `queries` SET `display_order` = `id`;--> statement-breakpoint
CREATE INDEX `idx_queries_display_order` ON `queries` (`display_order`);--> statement-breakpoint
CREATE INDEX `idx_queries_scheduled` ON `queries` (`is_scheduled`);--> statement-breakpoint
ALTER TABLE `sync_state` RENAME TO `sync_state_old`;--> statement-breakpoint
CREATE TABLE `sync_state` (
  `id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
  `query_id` integer NOT NULL UNIQUE,
  `entity_type` text NOT NULL,
  `last_sync_value` text,
  `last_sync_at` text,
  `last_sync_count` integer,
  `total_synced` integer DEFAULT 0,
  `status` text DEFAULT 'idle',
  `error_message` text,
  `updated_at` text DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (`query_id`) REFERENCES `queries`(`id`) ON DELETE CASCADE
);--> statement-breakpoint
INSERT INTO `sync_state` (`query_id`, `entity_type`, `last_sync_value`, `last_sync_at`, `last_sync_count`, `total_synced`, `status`, `error_message`, `updated_at`)
SELECT
  q.`id` as query_id,
  q.`entity_type`,
  COALESCE(s.`last_sync_value`, NULL),
  COALESCE(s.`last_sync_at`, NULL),
  COALESCE(s.`last_sync_count`, 0),
  COALESCE(s.`total_synced`, 0),
  COALESCE(s.`status`, 'idle'),
  s.`error_message`,
  CURRENT_TIMESTAMP
FROM `queries` q
LEFT JOIN `sync_state_old` s ON q.`entity_type` = s.`entity_type`
WHERE q.`is_active` = 1;--> statement-breakpoint
DROP TABLE `sync_state_old`;--> statement-breakpoint
CREATE UNIQUE INDEX `sync_state_query_id_unique` ON `sync_state` (`query_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `idx_sync_state_query_id` ON `sync_state` (`query_id`);--> statement-breakpoint
CREATE INDEX `idx_sync_state_entity_type` ON `sync_state` (`entity_type`);--> statement-breakpoint
ALTER TABLE `sync_logs` ADD `query_id` integer;--> statement-breakpoint
ALTER TABLE `sync_logs` ADD `query_name` text;--> statement-breakpoint
CREATE INDEX `idx_sync_logs_query` ON `sync_logs` (`query_id`);
