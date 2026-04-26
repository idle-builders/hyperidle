-- L1: per-pair autonomy audit (docs/plans/L1.md Decision 3).
--
-- Adds two columns to `agent_skills` for write-attribution and creates a
-- new `agent_skill_autonomy_audit` table that records every level change.
-- The migration UPDATEs existing rows off the `1970-01-01` sentinel
-- inside the same transaction so app code never sees the sentinel value.
ALTER TABLE `agent_skills` ADD `updated_at` text DEFAULT '1970-01-01T00:00:00.000Z' NOT NULL;--> statement-breakpoint
ALTER TABLE `agent_skills` ADD `updated_by` text;--> statement-breakpoint
UPDATE `agent_skills` SET `updated_at` = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE `updated_at` = '1970-01-01T00:00:00.000Z';--> statement-breakpoint
CREATE TABLE `agent_skill_autonomy_audit` (
	`id` text PRIMARY KEY NOT NULL,
	`agent_id` text NOT NULL,
	`skill_id` text NOT NULL,
	`from_level` integer,
	`to_level` integer NOT NULL,
	`rationale` text,
	`changed_by` text NOT NULL,
	`changed_at` text NOT NULL,
	FOREIGN KEY (`agent_id`) REFERENCES `agents`(`id`) ON UPDATE no action ON DELETE restrict
);--> statement-breakpoint
CREATE INDEX `asaa_agent_idx` ON `agent_skill_autonomy_audit` (`agent_id`);--> statement-breakpoint
CREATE INDEX `asaa_pair_idx` ON `agent_skill_autonomy_audit` (`agent_id`,`skill_id`);--> statement-breakpoint
CREATE INDEX `asaa_changed_at_desc_idx` ON `agent_skill_autonomy_audit` (`changed_at`);
