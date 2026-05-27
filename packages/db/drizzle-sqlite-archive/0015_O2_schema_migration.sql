CREATE TABLE `knowledge_strategy_fabric` (
	`id` text PRIMARY KEY NOT NULL,
	`knowledge_item_id` text NOT NULL UNIQUE REFERENCES `knowledge_items`(`id`) ON DELETE CASCADE,
	`layer` text,
	`scope_id` text,
	`kind` text,
	`attention_score` text,
	`relevance_score` text,
	`confidence` text,
	`citation_count` integer,
	`last_cited_at` text,
	`meta` text
);
--> statement-breakpoint
CREATE INDEX `ksf_knowledge_item_id_idx` ON `knowledge_strategy_fabric` (`knowledge_item_id`);
--> statement-breakpoint
CREATE INDEX `ksf_layer_idx` ON `knowledge_strategy_fabric` (`layer`);
--> statement-breakpoint
CREATE INDEX `ksf_kind_idx` ON `knowledge_strategy_fabric` (`kind`);
--> statement-breakpoint
CREATE TABLE `task_strategy_fabric` (
	`id` text PRIMARY KEY NOT NULL,
	`task_id` text NOT NULL UNIQUE REFERENCES `tasks`(`id`) ON DELETE CASCADE
);
--> statement-breakpoint
CREATE INDEX `tsf_task_id_idx` ON `task_strategy_fabric` (`task_id`);
--> statement-breakpoint
DROP INDEX IF EXISTS `ki_layer_idx`;
--> statement-breakpoint
DROP INDEX IF EXISTS `ki_scope_id_idx`;
--> statement-breakpoint
DROP INDEX IF EXISTS `ki_kind_idx`;
--> statement-breakpoint
DROP INDEX IF EXISTS `ki_layer_scope_idx`;
--> statement-breakpoint
DROP INDEX IF EXISTS `ki_attention_desc_idx`;
--> statement-breakpoint
ALTER TABLE `knowledge_items` DROP COLUMN `layer`;
--> statement-breakpoint
ALTER TABLE `knowledge_items` DROP COLUMN `scope_id`;
--> statement-breakpoint
ALTER TABLE `knowledge_items` DROP COLUMN `kind`;
--> statement-breakpoint
ALTER TABLE `knowledge_items` DROP COLUMN `attention_score`;
--> statement-breakpoint
ALTER TABLE `knowledge_items` DROP COLUMN `relevance_score`;
--> statement-breakpoint
ALTER TABLE `knowledge_items` DROP COLUMN `citation_count`;
--> statement-breakpoint
ALTER TABLE `knowledge_items` DROP COLUMN `last_cited_at`;
--> statement-breakpoint
ALTER TABLE `knowledge_items` DROP COLUMN `confidence`;
--> statement-breakpoint
ALTER TABLE `knowledge_items` DROP COLUMN `meta`;
--> statement-breakpoint
ALTER TABLE `tasks` DROP COLUMN `durability`;
--> statement-breakpoint
ALTER TABLE `tasks` DROP COLUMN `risk_tier`;
--> statement-breakpoint
ALTER TABLE `tasks` DROP COLUMN `attention_score`;
--> statement-breakpoint
ALTER TABLE `tasks` DROP COLUMN `cross_team`;
--> statement-breakpoint
ALTER TABLE `sessions` DROP COLUMN `cost`;
--> statement-breakpoint
ALTER TABLE `sessions` DROP COLUMN `cost_minor`;
--> statement-breakpoint
ALTER TABLE `sessions` DROP COLUMN `cost_currency`;
--> statement-breakpoint
ALTER TABLE `sessions` DROP COLUMN `tokens_json`;
--> statement-breakpoint
ALTER TABLE `sessions` DROP COLUMN `trace_id`;
--> statement-breakpoint
ALTER TABLE `sessions` DROP COLUMN `harness_url`;
--> statement-breakpoint
ALTER TABLE `sessions` DROP COLUMN `tokens_input`;
--> statement-breakpoint
ALTER TABLE `sessions` DROP COLUMN `tokens_output`;
--> statement-breakpoint
ALTER TABLE `items` DROP COLUMN `attention_score`;
--> statement-breakpoint
ALTER TABLE `items` DROP COLUMN `reversibility`;
--> statement-breakpoint
ALTER TABLE `items` DROP COLUMN `sandbox_result`;
--> statement-breakpoint
ALTER TABLE `items` DROP COLUMN `cost_estimate`;
--> statement-breakpoint
ALTER TABLE `artifacts` DROP COLUMN `cost_money_micros`;
--> statement-breakpoint
ALTER TABLE `artifacts` DROP COLUMN `cost_tokens_input`;
--> statement-breakpoint
ALTER TABLE `artifacts` DROP COLUMN `cost_tokens_output`;
--> statement-breakpoint
ALTER TABLE `artifacts` DROP COLUMN `cost_settled_at`;
