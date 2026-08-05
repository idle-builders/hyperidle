-- L22: Three relevance signals as first-class data
-- Adds knowledge_access_log table and new columns on knowledge_items.

CREATE TABLE `knowledge_access_log` (
	`id` text PRIMARY KEY NOT NULL,
	`item_id` text NOT NULL REFERENCES `knowledge_items`(`id`) ON DELETE RESTRICT,
	`accessor_kind` text NOT NULL,
	`accessor_id` text NOT NULL,
	`accessed_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `kal_item_accessed_idx` ON `knowledge_access_log` (`item_id`,`accessed_at`);
--> statement-breakpoint
ALTER TABLE `knowledge_items` ADD `relevance_score` real;
--> statement-breakpoint
ALTER TABLE `knowledge_items` ADD `citation_count` integer;
--> statement-breakpoint
ALTER TABLE `knowledge_items` ADD `last_cited_at` text;
