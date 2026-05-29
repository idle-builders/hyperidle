-- P2: Rename agents -> users, add kind/email/avatar_url columns
-- @lore P2: Hand-written migration for rename. Drizzle generates destructive drop-and-recreate
-- for renames. ALTER TABLE RENAME is safe in SQLite 3.25+ (better-sqlite3 bundles 3.45+).
-- FK references to agents are updated automatically by SQLite when PRAGMA foreign_keys = ON.
-- Drizzle migrator requires statement-breakpoint comments between statements.
ALTER TABLE `agents` RENAME TO `users`;
--> statement-breakpoint
ALTER TABLE `users` ADD COLUMN `kind` text NOT NULL DEFAULT 'ai';
--> statement-breakpoint
ALTER TABLE `users` ADD COLUMN `email` text;
--> statement-breakpoint
ALTER TABLE `users` ADD COLUMN `avatar_url` text;
--> statement-breakpoint
-- Rename agent_skills -> user_skills
ALTER TABLE `agent_skills` RENAME TO `user_skills`;
--> statement-breakpoint
-- @lore P2: architecture critique finding - agent_id column must be renamed to user_id.
-- SQLite 3.25+ supports ALTER TABLE RENAME COLUMN. better-sqlite3 bundles 3.45+.
ALTER TABLE `user_skills` RENAME COLUMN `agent_id` TO `user_id`;
--> statement-breakpoint
-- Create org_edges table
CREATE TABLE `org_edges` (
  `id` text PRIMARY KEY NOT NULL,
  `from_user_id` text NOT NULL REFERENCES `users`(`id`) ON DELETE CASCADE,
  `mechanism` text NOT NULL,
  `target` text NOT NULL,
  `created_at` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `org_edges_unique` ON `org_edges` (`from_user_id`, `mechanism`, `target`);
--> statement-breakpoint
CREATE INDEX `org_edges_from_user_idx` ON `org_edges` (`from_user_id`);
