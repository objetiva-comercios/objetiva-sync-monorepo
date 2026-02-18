-- Migration: Remove field_mappings table and reset queries
-- Phase 3 of query simplification - eliminating field_mappings complexity

-- 1. Drop field_mappings table (no longer needed - using direct validation)
DROP TABLE IF EXISTS `field_mappings`;--> statement-breakpoint

-- 2. Delete all existing queries (users will recreate with new simplified system)
DELETE FROM `queries`;--> statement-breakpoint

-- 3. Reset sync_state since all queries are deleted
DELETE FROM `sync_state`;--> statement-breakpoint

-- 4. Clean up any related sync_logs (optional - keeps history clean)
-- Note: Keeping sync_logs for historical data, just clearing query references
UPDATE `sync_logs` SET `query_id` = NULL, `query_name` = '[Query Deleted]' WHERE `query_id` IS NOT NULL;
