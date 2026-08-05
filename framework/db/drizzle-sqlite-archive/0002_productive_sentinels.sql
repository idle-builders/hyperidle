PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_knowledge_items` (
	`id` text PRIMARY KEY NOT NULL,
	`layer` text NOT NULL,
	`scope_id` text,
	`kind` text NOT NULL,
	`topic` text,
	`title` text NOT NULL,
	`body` text NOT NULL,
	`format` text NOT NULL,
	`status` text NOT NULL,
	`attention_score` real,
	`confidence` real,
	`version` integer DEFAULT 1 NOT NULL,
	`updated_by` text NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	`meta` text
);
--> statement-breakpoint
INSERT INTO `__new_knowledge_items`("id", "layer", "scope_id", "kind", "topic", "title", "body", "format", "status", "attention_score", "confidence", "version", "updated_by", "created_at", "updated_at", "meta") SELECT "id", "layer", "scope_id", "kind", "topic", "title", "body", "format", "status", "attention_score", "confidence", "version", "updated_by", "created_at", "updated_at", "meta" FROM `knowledge_items`;--> statement-breakpoint
DROP TABLE `knowledge_items`;--> statement-breakpoint
ALTER TABLE `__new_knowledge_items` RENAME TO `knowledge_items`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
CREATE INDEX `ki_layer_idx` ON `knowledge_items` (`layer`);--> statement-breakpoint
CREATE INDEX `ki_scope_id_idx` ON `knowledge_items` (`scope_id`);--> statement-breakpoint
CREATE INDEX `ki_kind_idx` ON `knowledge_items` (`kind`);--> statement-breakpoint
CREATE INDEX `ki_topic_idx` ON `knowledge_items` (`topic`);--> statement-breakpoint
CREATE INDEX `ki_status_idx` ON `knowledge_items` (`status`);--> statement-breakpoint
CREATE INDEX `ki_layer_scope_idx` ON `knowledge_items` (`layer`,`scope_id`);--> statement-breakpoint
CREATE INDEX `ki_attention_desc_idx` ON `knowledge_items` (`attention_score`);--> statement-breakpoint
CREATE INDEX `ki_updated_desc_idx` ON `knowledge_items` (`updated_at`);--> statement-breakpoint
ALTER TABLE `knowledge_conflicts` ADD `proposed_meta` text;--> statement-breakpoint
ALTER TABLE `knowledge_conflicts` ADD `resolved_by` text;--> statement-breakpoint
ALTER TABLE `knowledge_conflicts` ADD `resolved_at` text;--> statement-breakpoint
ALTER TABLE `tasks` ADD `audit_trail` text;