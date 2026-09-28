-- @lore: SQLite FK rebuild — PRAGMA foreign_keys=OFF inside a transaction is a no-op; use PRAGMA defer_foreign_keys=ON
PRAGMA defer_foreign_keys=ON;--> statement-breakpoint
PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_agent_skills` (
	`agent_id` text NOT NULL,
	`skill_id` text NOT NULL,
	`autonomy_level` integer NOT NULL,
	`success_count` integer DEFAULT 0 NOT NULL,
	`failure_count` integer DEFAULT 0 NOT NULL,
	`last_used_at` text,
	`promoted_at` text,
	PRIMARY KEY(`agent_id`, `skill_id`),
	FOREIGN KEY (`agent_id`) REFERENCES `agents`(`id`) ON UPDATE no action ON DELETE restrict
);
--> statement-breakpoint
INSERT INTO `__new_agent_skills`("agent_id", "skill_id", "autonomy_level", "success_count", "failure_count", "last_used_at", "promoted_at") SELECT "agent_id", "skill_id", "autonomy_level", "success_count", "failure_count", "last_used_at", "promoted_at" FROM `agent_skills`;--> statement-breakpoint
DROP TABLE `agent_skills`;--> statement-breakpoint
ALTER TABLE `__new_agent_skills` RENAME TO `agent_skills`;--> statement-breakpoint
CREATE TABLE `__new_agents` (
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
	FOREIGN KEY (`team_id`) REFERENCES `teams`(`id`) ON UPDATE no action ON DELETE restrict
);
--> statement-breakpoint
INSERT INTO `__new_agents`("id", "name", "soul_prompt_path", "team_id", "role", "skills", "status", "max_concurrent_sessions", "cost_cap", "cost_actual", "created_at") SELECT "id", "name", "soul_prompt_path", "team_id", "role", "skills", "status", "max_concurrent_sessions", "cost_cap", "cost_actual", "created_at" FROM `agents`;--> statement-breakpoint
DROP TABLE `agents`;--> statement-breakpoint
ALTER TABLE `__new_agents` RENAME TO `agents`;--> statement-breakpoint
CREATE TABLE `__new_bets` (
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
	FOREIGN KEY (`product_id`) REFERENCES `products`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`team_id`) REFERENCES `teams`(`id`) ON UPDATE no action ON DELETE restrict
);
--> statement-breakpoint
INSERT INTO `__new_bets`("id", "product_id", "team_id", "pitch", "appetite", "done_condition", "hypothesis", "status", "revision_log", "created_at", "shipped_at") SELECT "id", "product_id", "team_id", "pitch", "appetite", "done_condition", "hypothesis", "status", "revision_log", "created_at", "shipped_at" FROM `bets`;--> statement-breakpoint
DROP TABLE `bets`;--> statement-breakpoint
ALTER TABLE `__new_bets` RENAME TO `bets`;--> statement-breakpoint
CREATE INDEX `bets_product_id_idx` ON `bets` (`product_id`);--> statement-breakpoint
CREATE INDEX `bets_status_idx` ON `bets` (`status`);--> statement-breakpoint
CREATE TABLE `__new_file_leases` (
	`id` text PRIMARY KEY NOT NULL,
	`agent_id` text NOT NULL,
	`file_path` text NOT NULL,
	`acquired_at` text NOT NULL,
	`released_at` text,
	FOREIGN KEY (`agent_id`) REFERENCES `agents`(`id`) ON UPDATE no action ON DELETE restrict
);
--> statement-breakpoint
INSERT INTO `__new_file_leases`("id", "agent_id", "file_path", "acquired_at", "released_at") SELECT "id", "agent_id", "file_path", "acquired_at", "released_at" FROM `file_leases`;--> statement-breakpoint
DROP TABLE `file_leases`;--> statement-breakpoint
ALTER TABLE `__new_file_leases` RENAME TO `file_leases`;--> statement-breakpoint
CREATE TABLE `__new_items` (
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
	FOREIGN KEY (`source_agent_id`) REFERENCES `agents`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`thread_id`) REFERENCES `threads`(`id`) ON UPDATE no action ON DELETE restrict
);
--> statement-breakpoint
INSERT INTO `__new_items`("id", "source_agent_id", "layer", "verb", "kind", "title", "body", "attachments", "proposed_action", "options", "risk_tier", "attention_score", "blocking", "reasoning", "cost_estimate", "audit_trail", "thread_id", "created_at") SELECT "id", "source_agent_id", "layer", "verb", "kind", "title", "body", "attachments", "proposed_action", "options", "risk_tier", "attention_score", "blocking", "reasoning", "cost_estimate", "audit_trail", "thread_id", "created_at" FROM `items`;--> statement-breakpoint
DROP TABLE `items`;--> statement-breakpoint
ALTER TABLE `__new_items` RENAME TO `items`;--> statement-breakpoint
CREATE INDEX `items_thread_id_idx` ON `items` (`thread_id`);--> statement-breakpoint
CREATE TABLE `__new_knowledge_conflicts` (
	`id` text PRIMARY KEY NOT NULL,
	`item_id` text NOT NULL,
	`version_base` integer NOT NULL,
	`version_current` integer NOT NULL,
	`proposed_body` text NOT NULL,
	`proposed_meta` text,
	`proposed_by` text NOT NULL,
	`status` text DEFAULT 'open' NOT NULL,
	`resolved_by` text,
	`resolved_at` text,
	`created_at` text NOT NULL,
	FOREIGN KEY (`item_id`) REFERENCES `knowledge_items`(`id`) ON UPDATE no action ON DELETE restrict
);
--> statement-breakpoint
INSERT INTO `__new_knowledge_conflicts`("id", "item_id", "version_base", "version_current", "proposed_body", "proposed_meta", "proposed_by", "status", "resolved_by", "resolved_at", "created_at") SELECT "id", "item_id", "version_base", "version_current", "proposed_body", "proposed_meta", "proposed_by", "status", "resolved_by", "resolved_at", "created_at" FROM `knowledge_conflicts`;--> statement-breakpoint
DROP TABLE `knowledge_conflicts`;--> statement-breakpoint
ALTER TABLE `__new_knowledge_conflicts` RENAME TO `knowledge_conflicts`;--> statement-breakpoint
CREATE TABLE `__new_knowledge_edit_log` (
	`id` text PRIMARY KEY NOT NULL,
	`item_id` text NOT NULL,
	`editor` text NOT NULL,
	`field` text NOT NULL,
	`old_value` text,
	`new_value` text,
	`edit_type` text NOT NULL,
	`created_at` text NOT NULL,
	FOREIGN KEY (`item_id`) REFERENCES `knowledge_items`(`id`) ON UPDATE no action ON DELETE restrict
);
--> statement-breakpoint
INSERT INTO `__new_knowledge_edit_log`("id", "item_id", "editor", "field", "old_value", "new_value", "edit_type", "created_at") SELECT "id", "item_id", "editor", "field", "old_value", "new_value", "edit_type", "created_at" FROM `knowledge_edit_log`;--> statement-breakpoint
DROP TABLE `knowledge_edit_log`;--> statement-breakpoint
ALTER TABLE `__new_knowledge_edit_log` RENAME TO `knowledge_edit_log`;--> statement-breakpoint
CREATE TABLE `__new_messages` (
	`id` text PRIMARY KEY NOT NULL,
	`sender_id` text NOT NULL,
	`recipient_id` text NOT NULL,
	`thread_id` text NOT NULL,
	`subject` text,
	`body` text NOT NULL,
	`file_leases` text,
	`created_at` text NOT NULL,
	FOREIGN KEY (`sender_id`) REFERENCES `agents`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`recipient_id`) REFERENCES `agents`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`thread_id`) REFERENCES `threads`(`id`) ON UPDATE no action ON DELETE restrict
);
--> statement-breakpoint
INSERT INTO `__new_messages`("id", "sender_id", "recipient_id", "thread_id", "subject", "body", "file_leases", "created_at") SELECT "id", "sender_id", "recipient_id", "thread_id", "subject", "body", "file_leases", "created_at" FROM `messages`;--> statement-breakpoint
DROP TABLE `messages`;--> statement-breakpoint
ALTER TABLE `__new_messages` RENAME TO `messages`;--> statement-breakpoint
CREATE INDEX `messages_thread_id_idx` ON `messages` (`thread_id`);--> statement-breakpoint
CREATE TABLE `__new_responses` (
	`id` text PRIMARY KEY NOT NULL,
	`item_id` text NOT NULL,
	`decision` text NOT NULL,
	`inline_anchor` text,
	`edits` text,
	`feedback` text,
	`approver_id` text,
	`view` text,
	`responded_at` text NOT NULL,
	FOREIGN KEY (`item_id`) REFERENCES `items`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
INSERT INTO `__new_responses`("id", "item_id", "decision", "inline_anchor", "edits", "feedback", "approver_id", "view", "responded_at") SELECT "id", "item_id", "decision", "inline_anchor", "edits", "feedback", "approver_id", "view", "responded_at" FROM `responses`;--> statement-breakpoint
DROP TABLE `responses`;--> statement-breakpoint
ALTER TABLE `__new_responses` RENAME TO `responses`;--> statement-breakpoint
CREATE TABLE `__new_routines` (
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
	FOREIGN KEY (`owner_agent_id`) REFERENCES `agents`(`id`) ON UPDATE no action ON DELETE restrict
);
--> statement-breakpoint
INSERT INTO `__new_routines`("id", "owner_agent_id", "trigger_type", "trigger_config", "skill_id", "done_condition", "state_key", "delegation_allowed", "human_review", "autonomy_level", "silent", "active", "last_run_at", "next_run_at") SELECT "id", "owner_agent_id", "trigger_type", "trigger_config", "skill_id", "done_condition", "state_key", "delegation_allowed", "human_review", "autonomy_level", "silent", "active", "last_run_at", "next_run_at" FROM `routines`;--> statement-breakpoint
DROP TABLE `routines`;--> statement-breakpoint
ALTER TABLE `__new_routines` RENAME TO `routines`;--> statement-breakpoint
CREATE TABLE `__new_sessions` (
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
	`trace_id` text,
	FOREIGN KEY (`task_id`) REFERENCES `tasks`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`agent_id`) REFERENCES `agents`(`id`) ON UPDATE no action ON DELETE restrict
);
--> statement-breakpoint
INSERT INTO `__new_sessions`("id", "task_id", "agent_id", "model_tier", "started_at", "ended_at", "state", "workspace_snapshot", "cost", "outcome", "notes", "trace_id") SELECT "id", "task_id", "agent_id", "model_tier", "started_at", "ended_at", "state", "workspace_snapshot", "cost", "outcome", "notes", "trace_id" FROM `sessions`;--> statement-breakpoint
DROP TABLE `sessions`;--> statement-breakpoint
ALTER TABLE `__new_sessions` RENAME TO `sessions`;--> statement-breakpoint
CREATE INDEX `sessions_task_id_idx` ON `sessions` (`task_id`);--> statement-breakpoint
CREATE INDEX `sessions_agent_id_idx` ON `sessions` (`agent_id`);--> statement-breakpoint
CREATE INDEX `sessions_state_idx` ON `sessions` (`state`);--> statement-breakpoint
CREATE TABLE `__new_tasks` (
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
	`audit_trail` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`bet_id`) REFERENCES `bets`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`product_id`) REFERENCES `products`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`team_id`) REFERENCES `teams`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`owner_agent_id`) REFERENCES `agents`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`thread_id`) REFERENCES `threads`(`id`) ON UPDATE no action ON DELETE restrict
);
--> statement-breakpoint
INSERT INTO `__new_tasks`("id", "bet_id", "product_id", "team_id", "owner_agent_id", "title", "description", "done_condition", "state", "dependencies", "artifacts", "cost_cap", "cost_actual", "durability", "risk_tier", "attention_score", "cross_team", "thread_id", "notes", "audit_trail", "created_at", "updated_at") SELECT "id", "bet_id", "product_id", "team_id", "owner_agent_id", "title", "description", "done_condition", "state", "dependencies", "artifacts", "cost_cap", "cost_actual", "durability", "risk_tier", "attention_score", "cross_team", "thread_id", "notes", "audit_trail", "created_at", "updated_at" FROM `tasks`;--> statement-breakpoint
DROP TABLE `tasks`;--> statement-breakpoint
ALTER TABLE `__new_tasks` RENAME TO `tasks`;--> statement-breakpoint
CREATE INDEX `tasks_bet_id_idx` ON `tasks` (`bet_id`);--> statement-breakpoint
CREATE INDEX `tasks_team_id_idx` ON `tasks` (`team_id`);--> statement-breakpoint
CREATE INDEX `tasks_product_id_idx` ON `tasks` (`product_id`);--> statement-breakpoint
CREATE INDEX `tasks_state_idx` ON `tasks` (`state`);--> statement-breakpoint
CREATE TABLE `__new_teams` (
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
	FOREIGN KEY (`product_id`) REFERENCES `products`(`id`) ON UPDATE no action ON DELETE restrict
);
--> statement-breakpoint
INSERT INTO `__new_teams`("id", "product_id", "members", "lead_agent_id", "capacity", "active_bets", "cost_cap", "cost_actual", "formed_at", "dissolved_at") SELECT "id", "product_id", "members", "lead_agent_id", "capacity", "active_bets", "cost_cap", "cost_actual", "formed_at", "dissolved_at" FROM `teams`;--> statement-breakpoint
DROP TABLE `teams`;--> statement-breakpoint
ALTER TABLE `__new_teams` RENAME TO `teams`;--> statement-breakpoint
-- Re-enable foreign_keys at the end of the
-- migration so subsequent connections enforce FKs again. Inside the
-- wrapping BEGIN/COMMIT this is a no-op, but explicit re-enable here
-- documents intent and serves as defence-in-depth if Drizzle's
-- transactional wrapping ever changes.
PRAGMA foreign_keys=ON;