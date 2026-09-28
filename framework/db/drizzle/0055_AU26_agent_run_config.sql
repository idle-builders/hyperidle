-- Relocate the run-config columns off the two
-- identity tables into agent-orchestration-owned tables.
--
-- Hand-authored incremental migration. This repo's migrations past 0042 are
-- additive SQL files tracked only by meta/_journal.json (see 0043-0054) — the
-- drizzle-kit snapshot chain stopped at 0042, so `drizzle-kit generate`
-- re-detects every 0043+ change as new and its output is NOT usable verbatim.
--
-- WHAT MOVES (9 columns):
--   users: system_prompt, harness_type, model_tier_preference, model_id,
--          model_provider, max_concurrent_sessions  -> agent_run_config
--   teams: default_harness_type, default_model_id, default_model_provider
--          -> team_run_config_defaults
-- WHAT IS DROPPED, NOT MOVED (2 columns):
--   users.system_prompt_path, users.skills — zero production readers repo-wide
--   at the time of the move (seed fixtures only). Deliberately NOT carried
--   across; do not resurrect either as a column on the new table.
-- WHAT STAYS ON users: kind, status, agent_category, role, team_id, plus
--   id/name/email/avatar_url/created_at. `users` remains the single
--   human + agent identity record.
--
-- BACKFILL INVARIANT: for every existing `users` row with
-- kind='ai' the migration inserts exactly one agent_run_config row carrying the
-- current column values VERBATIM — including max_concurrent_sessions, which is
-- never re-defaulted (it is `integer NOT NULL DEFAULT 1` on both sides). For
-- every existing `teams` row, exactly one team_run_config_defaults row, same
-- rule. An agent whose run-config columns are all null must, after this
-- migration, resolve the identical effective config it resolved before —
-- the defaults live in the resolvers, not in the columns, and none of them
-- move. Human users get no agent_run_config row (they never had a run config;
-- `max_concurrent_sessions` on a human row was never read).
--
-- ROLLBACK: forward-only, deliberately. This migration drops 11 columns; there
-- is no down-migration and none is written. `desktop` ships as versioned
-- releases against a local PGlite directory, so a user on the new release
-- cannot roll the app back onto the old schema. The mitigation is the smoke
-- against a real populated local DB, not a reverse migration.

CREATE TABLE "agent_run_config" (
	"agent_user_id" text PRIMARY KEY NOT NULL,
	"system_prompt" text,
	"harness_type" text,
	"model_tier_preference" text,
	"model_id" text,
	"model_provider" text,
	"max_concurrent_sessions" integer DEFAULT 1 NOT NULL
);--> statement-breakpoint

CREATE TABLE "team_run_config_defaults" (
	"team_id" text PRIMARY KEY NOT NULL,
	"default_harness_type" text,
	"default_model_id" text,
	"default_model_provider" text
);--> statement-breakpoint

ALTER TABLE "agent_run_config" ADD CONSTRAINT "agent_run_config_agent_user_id_users_id_fk" FOREIGN KEY ("agent_user_id") REFERENCES "users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint

ALTER TABLE "team_run_config_defaults" ADD CONSTRAINT "team_run_config_defaults_team_id_teams_id_fk" FOREIGN KEY ("team_id") REFERENCES "teams"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint

-- Backfill: one row per ai agent, values verbatim.
INSERT INTO "agent_run_config" ("agent_user_id", "system_prompt", "harness_type", "model_tier_preference", "model_id", "model_provider", "max_concurrent_sessions")
SELECT "id", "system_prompt", "harness_type", "model_tier_preference", "model_id", "model_provider", "max_concurrent_sessions"
FROM "users"
WHERE "kind" = 'ai'
ON CONFLICT ("agent_user_id") DO NOTHING;--> statement-breakpoint

-- Backfill: one row per team, values verbatim.
INSERT INTO "team_run_config_defaults" ("team_id", "default_harness_type", "default_model_id", "default_model_provider")
SELECT "id", "default_harness_type", "default_model_id", "default_model_provider"
FROM "teams"
ON CONFLICT ("team_id") DO NOTHING;--> statement-breakpoint

-- users: the six relocated run-config columns.
ALTER TABLE "users" DROP COLUMN "system_prompt";--> statement-breakpoint
ALTER TABLE "users" DROP COLUMN "harness_type";--> statement-breakpoint
ALTER TABLE "users" DROP COLUMN "model_tier_preference";--> statement-breakpoint
ALTER TABLE "users" DROP COLUMN "model_id";--> statement-breakpoint
ALTER TABLE "users" DROP COLUMN "model_provider";--> statement-breakpoint
ALTER TABLE "users" DROP COLUMN "max_concurrent_sessions";--> statement-breakpoint

-- users: the two dead columns — dropped, not moved.
ALTER TABLE "users" DROP COLUMN "system_prompt_path";--> statement-breakpoint
ALTER TABLE "users" DROP COLUMN "skills";--> statement-breakpoint

-- teams: the three relocated default-run-config columns.
ALTER TABLE "teams" DROP COLUMN "default_harness_type";--> statement-breakpoint
ALTER TABLE "teams" DROP COLUMN "default_model_id";--> statement-breakpoint
ALTER TABLE "teams" DROP COLUMN "default_model_provider";
