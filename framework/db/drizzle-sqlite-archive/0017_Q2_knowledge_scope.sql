ALTER TABLE `knowledge_items` ADD `scope_kind` text NOT NULL DEFAULT 'factory';
--> statement-breakpoint
ALTER TABLE `knowledge_items` ADD `scope_id` text;
--> statement-breakpoint
CREATE INDEX `ki_scope_idx` ON `knowledge_items` (`scope_kind`,`scope_id`);
