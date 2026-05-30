-- U1: Schema Migration — Products -> Teams + Bet Simplification
-- @lore U1: Hand-written migration. Drizzle generates destructive drop-and-recreate
-- for table/column renames. ALTER TABLE RENAME is safe in SQLite 3.25+
-- (better-sqlite3 bundles 3.45+). FK references update automatically when
-- PRAGMA foreign_keys = ON.
--
-- @lore U1 migration collision: bets.team_id has a FOREIGN KEY constraint in the
-- pre-U1 schema (references `teams`(id)). SQLite DROP COLUMN cannot remove FK-referenced
-- columns. Instead we use the standard SQLite table-rebuild pattern (CREATE NEW + INSERT
-- SELECT + DROP OLD + RENAME NEW) for bets and tasks to drop the old team_id column.
-- Same applies to tasks.team_id which also has a FK constraint.

-- Step 1: Rename old `teams` (agent membership) to `team_members` FIRST
-- so the name `teams` becomes available for the products rename.
ALTER TABLE `teams` RENAME TO `team_members`;
--> statement-breakpoint

-- Step 2: Rename `products` to `teams`.
ALTER TABLE `products` RENAME TO `teams`;
--> statement-breakpoint

-- Step 3: Drop old bets.team_id (FK-constrained column → must rebuild table).
-- @lore U1: PRAGMA foreign_keys=OFF is a NO-OP inside a transaction (Drizzle uses one).
-- PRAGMA defer_foreign_keys=ON defers FK checks until COMMIT — safe for table rebuilds.
-- See migration 0005 for the established pattern.
PRAGMA defer_foreign_keys=ON;
--> statement-breakpoint
PRAGMA foreign_keys=OFF;
--> statement-breakpoint
-- Step 9 (bet status migration) is folded into the INSERT SELECT below.
-- Step 10 (rename pitch→description, shipped_at→completed_at) also folded in.
-- Step 11 (add at_risk) added in new table definition.
CREATE TABLE `__new_bets` (
    `id` text PRIMARY KEY NOT NULL,
    `team_id` text NOT NULL REFERENCES `teams`(`id`) ON UPDATE no action ON DELETE restrict,
    `description` text NOT NULL DEFAULT '',
    `appetite` text,
    `done_condition` text,
    `hypothesis` text,
    `status` text NOT NULL DEFAULT 'draft',
    `revision_log` text,
    `created_at` text NOT NULL,
    `completed_at` text,
    `cost_appetite_minor` integer,
    `cost_appetite_currency` text,
    `cost_actual_minor` integer,
    `cost_actual_currency` text,
    `tokens_actual_json` text,
    `at_risk` integer NOT NULL DEFAULT 0
);
--> statement-breakpoint
INSERT INTO `__new_bets`
    (`id`, `team_id`, `description`, `appetite`, `done_condition`, `hypothesis`,
     `status`, `revision_log`, `created_at`, `completed_at`,
     `cost_appetite_minor`, `cost_appetite_currency`,
     `cost_actual_minor`, `cost_actual_currency`, `tokens_actual_json`, `at_risk`)
SELECT
    `id`,
    `product_id` AS `team_id`,
    COALESCE(`pitch`, '') AS `description`,
    `appetite`,
    `done_condition`,
    `hypothesis`,
    CASE
        WHEN `status` = 'shaped'                                                        THEN 'draft'
        WHEN `status` IN ('committed','in_progress','behind','blocked','paused','review') THEN 'active'
        WHEN `status` = 'shipped'                                                       THEN 'completed'
        ELSE `status`
    END AS `status`,
    `revision_log`,
    `created_at`,
    `shipped_at` AS `completed_at`,
    `cost_appetite_minor`,
    `cost_appetite_currency`,
    `cost_actual_minor`,
    `cost_actual_currency`,
    `tokens_actual_json`,
    0 AS `at_risk`
FROM `bets`;
--> statement-breakpoint
DROP TABLE `bets`;
--> statement-breakpoint
ALTER TABLE `__new_bets` RENAME TO `bets`;
--> statement-breakpoint

-- Step 5: Recreate indexes on bets (team_id and status).
CREATE INDEX `bets_team_id_idx` ON `bets` (`team_id`);
--> statement-breakpoint
CREATE INDEX `bets_status_idx` ON `bets` (`status`);
--> statement-breakpoint

-- Step 6: Drop old tasks.team_id (FK-constrained column → must rebuild table).
-- @lore U1: tasks columns after O2 (0015): id, bet_id, product_id, team_id,
-- owner_agent_id, title, description, done_condition, state, dependencies,
-- artifacts, cost_cap, cost_actual, thread_id, notes, audit_trail, created_at, updated_at.
-- O2 dropped: durability, risk_tier, attention_score, cross_team.
CREATE TABLE `__new_tasks` (
    `id` text PRIMARY KEY NOT NULL,
    `bet_id` text NOT NULL REFERENCES `bets`(`id`) ON UPDATE no action ON DELETE restrict,
    `team_id` text NOT NULL REFERENCES `teams`(`id`) ON UPDATE no action ON DELETE restrict,
    `owner_agent_id` text REFERENCES `users`(`id`) ON UPDATE no action ON DELETE set null,
    `title` text NOT NULL,
    `description` text,
    `done_condition` text,
    `state` text NOT NULL DEFAULT 'proposed',
    `dependencies` text,
    `artifacts` text,
    `cost_cap` integer,
    `cost_actual` integer,
    `thread_id` text REFERENCES `threads`(`id`) ON UPDATE no action ON DELETE set null,
    `notes` text,
    `audit_trail` text,
    `created_at` text NOT NULL,
    `updated_at` text NOT NULL
);
--> statement-breakpoint
INSERT INTO `__new_tasks`
    (`id`, `bet_id`, `team_id`, `owner_agent_id`, `title`, `description`, `done_condition`,
     `state`, `dependencies`, `artifacts`, `cost_cap`, `cost_actual`,
     `thread_id`, `notes`, `audit_trail`, `created_at`, `updated_at`)
SELECT
    `id`, `bet_id`,
    `product_id` AS `team_id`,
    `owner_agent_id`, `title`, `description`, `done_condition`,
    `state`, `dependencies`, `artifacts`, `cost_cap`, `cost_actual`,
    `thread_id`, `notes`, `audit_trail`, `created_at`, `updated_at`
FROM `tasks`;
--> statement-breakpoint
DROP TABLE `tasks`;
--> statement-breakpoint
ALTER TABLE `__new_tasks` RENAME TO `tasks`;
--> statement-breakpoint

-- Step 8: Recreate indexes on tasks.
-- @lore U1: tasks_state_idx was deliberately dropped in migration 0006
-- (state has too few distinct values to be selective). Do NOT recreate it.
CREATE INDEX `tasks_bet_id_idx` ON `tasks` (`bet_id`);
--> statement-breakpoint
CREATE INDEX `tasks_team_id_idx` ON `tasks` (`team_id`);
--> statement-breakpoint

-- Step 12: Rename team_members.product_id to team_id
-- team_members.product_id has NO FK constraint (the referenced table `products`
-- was renamed to `teams` in step 2), so ALTER COLUMN RENAME works here.
ALTER TABLE `team_members` RENAME COLUMN `product_id` TO `team_id`;
--> statement-breakpoint

-- Step 13: Update propagation_log target_level values.
UPDATE `propagation_log` SET `target_level` = 'team' WHERE `target_level` = 'product';
--> statement-breakpoint

-- Re-enable FK enforcement.
PRAGMA foreign_keys=ON;
