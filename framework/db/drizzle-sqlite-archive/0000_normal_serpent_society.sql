CREATE TABLE `agent_skills` (
	`agent_id` text NOT NULL,
	`skill_id` text NOT NULL,
	`autonomy_level` integer NOT NULL,
	`success_count` integer DEFAULT 0 NOT NULL,
	`failure_count` integer DEFAULT 0 NOT NULL,
	`last_used_at` text,
	`promoted_at` text,
	PRIMARY KEY(`agent_id`, `skill_id`),
	FOREIGN KEY (`agent_id`) REFERENCES `agents`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `agents` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`soul_prompt_path` text,
	`team_id` text,
	`role` text NOT NULL,
	`skills` text,
	`status` text NOT NULL,
	`max_concurrent_sessions` integer DEFAULT 1 NOT NULL,
	`cost_cap` integer,
	`cost_actual` integer DEFAULT 0,
	`created_at` text NOT NULL,
	FOREIGN KEY (`team_id`) REFERENCES `teams`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `bets` (
	`id` text PRIMARY KEY NOT NULL,
	`product_id` text NOT NULL,
	`team_id` text NOT NULL,
	`pitch` text NOT NULL,
	`appetite` text NOT NULL,
	`done_condition` text,
	`hypothesis` text,
	`status` text NOT NULL,
	`revision_log` text,
	`created_at` text NOT NULL,
	`shipped_at` text,
	FOREIGN KEY (`product_id`) REFERENCES `products`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`team_id`) REFERENCES `teams`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `factory_settings` (
	`key` text PRIMARY KEY NOT NULL,
	`value` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `file_leases` (
	`id` text PRIMARY KEY NOT NULL,
	`agent_id` text NOT NULL,
	`file_path` text NOT NULL,
	`acquired_at` text NOT NULL,
	`released_at` text,
	FOREIGN KEY (`agent_id`) REFERENCES `agents`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `items` (
	`id` text PRIMARY KEY NOT NULL,
	`source_agent_id` text,
	`layer` text,
	`verb` text,
	`kind` text,
	`title` text NOT NULL,
	`body` text,
	`attachments` text,
	`proposed_action` text,
	`options` text,
	`risk_tier` text,
	`attention_score` integer,
	`blocking` integer DEFAULT 0,
	`reasoning` text,
	`cost_estimate` integer,
	`audit_trail` text,
	`thread_id` text NOT NULL,
	`created_at` text NOT NULL,
	FOREIGN KEY (`source_agent_id`) REFERENCES `agents`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`thread_id`) REFERENCES `threads`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `knowledge_edit_log` (
	`id` text PRIMARY KEY NOT NULL,
	`item_id` text NOT NULL,
	`editor` text NOT NULL,
	`field` text NOT NULL,
	`old_value` text,
	`new_value` text,
	`edit_type` text NOT NULL,
	`created_at` text NOT NULL,
	FOREIGN KEY (`item_id`) REFERENCES `knowledge_items`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `knowledge_items` (
	`id` text PRIMARY KEY NOT NULL,
	`layer` text NOT NULL,
	`scope_id` text,
	`kind` text NOT NULL,
	`topic` text,
	`title` text NOT NULL,
	`body` text NOT NULL,
	`format` text NOT NULL,
	`status` text NOT NULL,
	`attention_score` integer,
	`confidence` integer,
	`version` integer DEFAULT 1 NOT NULL,
	`updated_by` text NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	`meta` text
);
--> statement-breakpoint
CREATE INDEX `ki_layer_idx` ON `knowledge_items` (`layer`);--> statement-breakpoint
CREATE INDEX `ki_scope_id_idx` ON `knowledge_items` (`scope_id`);--> statement-breakpoint
CREATE INDEX `ki_kind_idx` ON `knowledge_items` (`kind`);--> statement-breakpoint
CREATE INDEX `ki_topic_idx` ON `knowledge_items` (`topic`);--> statement-breakpoint
CREATE INDEX `ki_status_idx` ON `knowledge_items` (`status`);--> statement-breakpoint
CREATE TABLE `messages` (
	`id` text PRIMARY KEY NOT NULL,
	`sender_id` text NOT NULL,
	`recipient_id` text NOT NULL,
	`thread_id` text NOT NULL,
	`subject` text,
	`body` text NOT NULL,
	`file_leases` text,
	`created_at` text NOT NULL,
	FOREIGN KEY (`sender_id`) REFERENCES `agents`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`recipient_id`) REFERENCES `agents`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`thread_id`) REFERENCES `threads`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `products` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`phase` text NOT NULL,
	`brief_path` text,
	`architecture_path` text,
	`brand_path` text,
	`principles_path` text,
	`factory_db_path` text,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `responses` (
	`id` text PRIMARY KEY NOT NULL,
	`item_id` text NOT NULL,
	`decision` text NOT NULL,
	`inline_anchor` text,
	`edits` text,
	`feedback` text,
	`approver_id` text,
	`view` text,
	`responded_at` text NOT NULL,
	FOREIGN KEY (`item_id`) REFERENCES `items`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `routines` (
	`id` text PRIMARY KEY NOT NULL,
	`owner_agent_id` text NOT NULL,
	`trigger_type` text NOT NULL,
	`trigger_config` text,
	`skill_id` text,
	`done_condition` text,
	`state_key` text,
	`delegation_allowed` integer DEFAULT 0,
	`human_review` integer DEFAULT 0,
	`autonomy_level` integer,
	`silent` integer DEFAULT 0,
	`active` integer DEFAULT 1 NOT NULL,
	`last_run_at` text,
	`next_run_at` text,
	FOREIGN KEY (`owner_agent_id`) REFERENCES `agents`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `sessions` (
	`id` text PRIMARY KEY NOT NULL,
	`task_id` text NOT NULL,
	`agent_id` text NOT NULL,
	`model_tier` text NOT NULL,
	`started_at` text NOT NULL,
	`ended_at` text,
	`state` text NOT NULL,
	`workspace_snapshot` text,
	`cost` integer DEFAULT 0,
	`outcome` text,
	`notes` text,
	FOREIGN KEY (`task_id`) REFERENCES `tasks`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`agent_id`) REFERENCES `agents`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `tasks` (
	`id` text PRIMARY KEY NOT NULL,
	`bet_id` text NOT NULL,
	`product_id` text NOT NULL,
	`team_id` text NOT NULL,
	`owner_agent_id` text,
	`title` text NOT NULL,
	`description` text,
	`done_condition` text,
	`state` text NOT NULL,
	`dependencies` text,
	`artifacts` text,
	`cost_cap` integer,
	`cost_actual` integer DEFAULT 0,
	`durability` text,
	`risk_tier` text,
	`attention_score` integer,
	`cross_team` integer DEFAULT 0,
	`thread_id` text,
	`notes` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`bet_id`) REFERENCES `bets`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`product_id`) REFERENCES `products`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`team_id`) REFERENCES `teams`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`owner_agent_id`) REFERENCES `agents`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`thread_id`) REFERENCES `threads`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `teams` (
	`id` text PRIMARY KEY NOT NULL,
	`product_id` text NOT NULL,
	`members` text,
	`lead_agent_id` text,
	`capacity` integer NOT NULL,
	`active_bets` integer DEFAULT 0 NOT NULL,
	`cost_cap` integer,
	`cost_actual` integer DEFAULT 0,
	`formed_at` text NOT NULL,
	`dissolved_at` text,
	FOREIGN KEY (`product_id`) REFERENCES `products`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `threads` (
	`id` text PRIMARY KEY NOT NULL,
	`kind` text NOT NULL,
	`pinned` integer DEFAULT 0,
	`participants` text,
	`created_at` text NOT NULL
);
