CREATE TABLE `agent_skills` (
	`agent_id` text NOT NULL,
	`skill_id` text NOT NULL,
	`autonomy_level` text NOT NULL,
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
	`skills` text NOT NULL,
	`status` text NOT NULL,
	`max_concurrent_sessions` integer DEFAULT 1 NOT NULL,
	`cost_cap` real DEFAULT 0 NOT NULL,
	`cost_actual` real DEFAULT 0 NOT NULL,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `bets` (
	`id` text PRIMARY KEY NOT NULL,
	`product_id` text NOT NULL,
	`team_id` text NOT NULL,
	`pitch` text NOT NULL,
	`appetite` text NOT NULL,
	`done_condition` text NOT NULL,
	`hypothesis` text NOT NULL,
	`status` text NOT NULL,
	`revision_log` text NOT NULL,
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
	`source_agent_id` text NOT NULL,
	`layer` text NOT NULL,
	`verb` text NOT NULL,
	`kind` text NOT NULL,
	`title` text NOT NULL,
	`body` text NOT NULL,
	`attachments` text NOT NULL,
	`proposed_action` text NOT NULL,
	`options` text NOT NULL,
	`risk_tier` text NOT NULL,
	`attention_score` real DEFAULT 0 NOT NULL,
	`blocking` integer DEFAULT false NOT NULL,
	`reasoning` text NOT NULL,
	`cost_estimate` real,
	`audit_trail` text NOT NULL,
	`thread_id` text,
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
	`scope_id` text NOT NULL,
	`kind` text NOT NULL,
	`topic` text NOT NULL,
	`title` text NOT NULL,
	`body` text NOT NULL,
	`format` text NOT NULL,
	`status` text NOT NULL,
	`attention_score` real DEFAULT 0 NOT NULL,
	`confidence` real DEFAULT 0.5 NOT NULL,
	`version` integer DEFAULT 1 NOT NULL,
	`updated_by` text NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	`meta` text
);
--> statement-breakpoint
CREATE INDEX `idx_ki_layer_scope` ON `knowledge_items` (`layer`,`scope_id`);--> statement-breakpoint
CREATE INDEX `idx_ki_kind` ON `knowledge_items` (`kind`);--> statement-breakpoint
CREATE INDEX `idx_ki_topic` ON `knowledge_items` (`topic`);--> statement-breakpoint
CREATE INDEX `idx_ki_status` ON `knowledge_items` (`status`);--> statement-breakpoint
CREATE INDEX `idx_ki_attention` ON `knowledge_items` (`attention_score`);--> statement-breakpoint
CREATE TABLE `messages` (
	`id` text PRIMARY KEY NOT NULL,
	`sender_id` text NOT NULL,
	`recipient_id` text NOT NULL,
	`thread_id` text NOT NULL,
	`subject` text NOT NULL,
	`body` text NOT NULL,
	`file_leases` text NOT NULL,
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
	`approver_id` text NOT NULL,
	`view` text NOT NULL,
	`responded_at` text NOT NULL,
	FOREIGN KEY (`item_id`) REFERENCES `items`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`approver_id`) REFERENCES `agents`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `routines` (
	`id` text PRIMARY KEY NOT NULL,
	`owner_agent_id` text NOT NULL,
	`trigger_type` text NOT NULL,
	`trigger_config` text NOT NULL,
	`skill_id` text NOT NULL,
	`done_condition` text NOT NULL,
	`state_key` text NOT NULL,
	`delegation_allowed` integer DEFAULT false NOT NULL,
	`human_review` integer DEFAULT false NOT NULL,
	`autonomy_level` text NOT NULL,
	`silent` integer DEFAULT false NOT NULL,
	`active` integer DEFAULT true NOT NULL,
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
	`workspace_snapshot` text NOT NULL,
	`cost` real DEFAULT 0 NOT NULL,
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
	`owner_agent_id` text NOT NULL,
	`title` text NOT NULL,
	`description` text NOT NULL,
	`done_condition` text NOT NULL,
	`state` text NOT NULL,
	`dependencies` text NOT NULL,
	`artifacts` text NOT NULL,
	`cost_cap` real DEFAULT 0 NOT NULL,
	`cost_actual` real DEFAULT 0 NOT NULL,
	`durability` text NOT NULL,
	`risk_tier` text NOT NULL,
	`attention_score` real DEFAULT 0 NOT NULL,
	`cross_team` integer DEFAULT false NOT NULL,
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
	`members` text NOT NULL,
	`lead_agent_id` text,
	`capacity` integer DEFAULT 3 NOT NULL,
	`active_bets` integer DEFAULT 0 NOT NULL,
	`cost_cap` real DEFAULT 0 NOT NULL,
	`cost_actual` real DEFAULT 0 NOT NULL,
	`formed_at` text NOT NULL,
	`dissolved_at` text,
	FOREIGN KEY (`product_id`) REFERENCES `products`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `threads` (
	`id` text PRIMARY KEY NOT NULL,
	`kind` text NOT NULL,
	`pinned` integer DEFAULT false NOT NULL,
	`participants` text NOT NULL,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE VIRTUAL TABLE IF NOT EXISTS knowledge_items_fts USING fts5(title, body);
--> statement-breakpoint
CREATE TRIGGER IF NOT EXISTS ki_fts_insert AFTER INSERT ON knowledge_items BEGIN
	INSERT INTO knowledge_items_fts(rowid, title, body) VALUES (NEW.rowid, NEW.title, NEW.body);
END;
--> statement-breakpoint
CREATE TRIGGER IF NOT EXISTS ki_fts_update AFTER UPDATE ON knowledge_items BEGIN
	UPDATE knowledge_items_fts SET title = NEW.title, body = NEW.body WHERE rowid = OLD.rowid;
END;
--> statement-breakpoint
CREATE TRIGGER IF NOT EXISTS ki_fts_delete AFTER DELETE ON knowledge_items BEGIN
	DELETE FROM knowledge_items_fts WHERE rowid = OLD.rowid;
END;
