ALTER TABLE `agents` ADD `cost_cap_minor` integer;--> statement-breakpoint
ALTER TABLE `agents` ADD `cost_cap_currency` text;--> statement-breakpoint
ALTER TABLE `teams` ADD `cost_cap_minor` integer;--> statement-breakpoint
ALTER TABLE `teams` ADD `cost_cap_currency` text;--> statement-breakpoint
ALTER TABLE `bets` ADD `cost_appetite_minor` integer;--> statement-breakpoint
ALTER TABLE `bets` ADD `cost_appetite_currency` text;--> statement-breakpoint
ALTER TABLE `bets` ADD `cost_actual_minor` integer;--> statement-breakpoint
ALTER TABLE `bets` ADD `cost_actual_currency` text;--> statement-breakpoint
ALTER TABLE `bets` ADD `tokens_actual_json` text;--> statement-breakpoint
ALTER TABLE `sessions` ADD `cost_minor` integer;--> statement-breakpoint
ALTER TABLE `sessions` ADD `cost_currency` text;--> statement-breakpoint
ALTER TABLE `sessions` ADD `tokens_json` text;--> statement-breakpoint
CREATE TABLE `bets_new` (
	`id` text PRIMARY KEY NOT NULL,
	`product_id` text NOT NULL,
	`team_id` text NOT NULL,
	`pitch` text NOT NULL,
	`appetite` text,
	`done_condition` text,
	`hypothesis` text,
	`status` text NOT NULL,
	`revision_log` text,
	`created_at` text NOT NULL,
	`shipped_at` text,
	`cost_appetite_minor` integer,
	`cost_appetite_currency` text,
	`cost_actual_minor` integer,
	`cost_actual_currency` text,
	`tokens_actual_json` text,
	FOREIGN KEY (`product_id`) REFERENCES `products`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`team_id`) REFERENCES `teams`(`id`) ON UPDATE no action ON DELETE restrict
);--> statement-breakpoint
INSERT INTO `bets_new` SELECT `id`, `product_id`, `team_id`, `pitch`, `appetite`, `done_condition`, `hypothesis`, `status`, `revision_log`, `created_at`, `shipped_at`, `cost_appetite_minor`, `cost_appetite_currency`, `cost_actual_minor`, `cost_actual_currency`, `tokens_actual_json` FROM `bets`;--> statement-breakpoint
DROP TABLE `bets`;--> statement-breakpoint
ALTER TABLE `bets_new` RENAME TO `bets`;--> statement-breakpoint
CREATE INDEX `bets_product_id_idx` ON `bets` (`product_id`);--> statement-breakpoint
CREATE INDEX `bets_status_idx` ON `bets` (`status`);--> statement-breakpoint
-- Backfill: copy existing session costs into cost_minor so the L17 spend
-- aggregation (which prefers cost_minor over cost) reflects pre-migration data.
UPDATE `sessions` SET `cost_minor` = `cost` WHERE `cost` IS NOT NULL AND `cost` > 0;--> statement-breakpoint
-- Backfill: copy existing agent cost caps into cost_cap_minor.
UPDATE `agents` SET `cost_cap_minor` = `cost_cap` WHERE `cost_cap` IS NOT NULL;--> statement-breakpoint
-- Backfill: copy existing team cost caps into cost_cap_minor.
UPDATE `teams` SET `cost_cap_minor` = `cost_cap` WHERE `cost_cap` IS NOT NULL;
