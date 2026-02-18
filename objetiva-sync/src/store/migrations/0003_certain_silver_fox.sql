-- Note: DROP TABLE field_mappings removed (table was already dropped in earlier migration)
-- Note: DROP INDEX sync_state_query_id_unique removed (index doesn't exist in this schema version)
DROP INDEX IF EXISTS `idx_sync_state_query_id`;--> statement-breakpoint
ALTER TABLE `sync_state` ADD `source_id` text DEFAULT 'default' NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX `idx_sync_state_query_source` ON `sync_state` (`query_id`,`source_id`);