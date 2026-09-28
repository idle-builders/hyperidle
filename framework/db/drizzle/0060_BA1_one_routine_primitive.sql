-- One routine primitive — the prompt gets its right name, the event
-- trigger gets an indexable column, scope moves off the routine row, and the
-- trigger-rule entity's stored data is deleted. Order matters; each step's
-- reason is stated because a later reader will need it.
--
-- Step 3's three builtin-dedupe INSERTs carry "team_id" —
-- routines.team_id is NOT NULL until step 4 drops it, and the survivor row's
-- own team_id is a valid, non-null value to copy (it is dropped moments
-- later regardless, so which team it names does not matter). Every
-- structural change (RENAME/ADD/DROP COLUMN, ADD/DROP CONSTRAINT, CREATE
-- INDEX) is guarded (IF EXISTS / IF NOT EXISTS, or the DO block for the
-- one RENAME Postgres has no guarded form of) so the file is safe to re-run
-- against a database left mid-migration by a failed attempt.

-- 1. Rename the prompt into its right name. `description` never had a
--    home of its own for a prompt — this IS it. Guarded (not a bare RENAME
--    COLUMN, which has no IF EXISTS): a real deployment may already be
--    mid-migration from a prior failed run of this file, and Postgres has no
--    `RENAME COLUMN IF EXISTS` — this is the one step in the file a
--    catalog-existence guard is required for re-run safety.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = current_schema() AND table_name = 'routines' AND column_name = 'description'
  ) THEN
    ALTER TABLE "routines" RENAME COLUMN "description" TO "prompt";
  END IF;
END $$;--> statement-breakpoint

-- 2. Give the event trigger a real, indexable home. `trigger_config` is
--    plain text, so the `IS JSON OBJECT` guard is load-bearing: one
--    malformed row must not abort the whole migration on the cast. A row
--    that fails the guard keeps event_type = NULL and simply never matches
--    — the safe direction. Requires PostgreSQL 16+ (PGlite ^0.5.4 is PG17,
--    so local/desktop are fine; a self-hosted server pinned below 16 would
--    fail this statement at migrate time).
ALTER TABLE "routines" ADD COLUMN IF NOT EXISTS "event_type" text;--> statement-breakpoint
UPDATE "routines"
SET "event_type" = ("trigger_config"::jsonb ->> 'eventType')
WHERE "trigger_type" = 'event'
  AND "trigger_config" IS NOT NULL
  AND "trigger_config" IS JSON OBJECT;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "routines_event_type_idx" ON "routines" ("event_type")
  WHERE "trigger_type" = 'event' AND "deleted_at" IS NULL;--> statement-breakpoint

-- 3. Collapse each global builtin to one row, keeping its history. The
--    re-point must precede the delete: routine_runs.routine_id is
--    ON DELETE restrict, so a delete before the re-point would fail.
--    Copy-then-repoint-then-delete is used rather than renaming the
--    survivor's id, because the same FK has no ON UPDATE CASCADE and would
--    reject the parent-key update.
INSERT INTO "routines"
  ("id", "name", "team_id", "prompt", "owner_agent_id", "trigger_type", "trigger_config", "event_type",
   "state_key", "human_review", "autonomy_level", "silent", "active", "state", "last_run_at",
   "next_run_at", "deleted_at", "last_run_summary", "created_at", "stub_task_id")
SELECT
  'builtin:portfolio-retro', "name", "team_id", "prompt", "owner_agent_id", "trigger_type", "trigger_config",
  "event_type", "state_key", "human_review", "autonomy_level", "silent", "active", "state",
  "last_run_at", "next_run_at", "deleted_at", "last_run_summary", "created_at", "stub_task_id"
FROM "routines"
WHERE "id" LIKE 'builtin:portfolio-retro:%'
ORDER BY "id" ASC
LIMIT 1
ON CONFLICT ("id") DO NOTHING;--> statement-breakpoint
UPDATE "routine_runs" SET "routine_id" = 'builtin:portfolio-retro'
WHERE "routine_id" LIKE 'builtin:portfolio-retro:%';--> statement-breakpoint
DELETE FROM "routines" WHERE "id" LIKE 'builtin:portfolio-retro:%';--> statement-breakpoint

INSERT INTO "routines"
  ("id", "name", "team_id", "prompt", "owner_agent_id", "trigger_type", "trigger_config", "event_type",
   "state_key", "human_review", "autonomy_level", "silent", "active", "state", "last_run_at",
   "next_run_at", "deleted_at", "last_run_summary", "created_at", "stub_task_id")
SELECT
  'builtin:knowledge-decay', "name", "team_id", "prompt", "owner_agent_id", "trigger_type", "trigger_config",
  "event_type", "state_key", "human_review", "autonomy_level", "silent", "active", "state",
  "last_run_at", "next_run_at", "deleted_at", "last_run_summary", "created_at", "stub_task_id"
FROM "routines"
WHERE "id" LIKE 'builtin:knowledge-decay:%'
ORDER BY "id" ASC
LIMIT 1
ON CONFLICT ("id") DO NOTHING;--> statement-breakpoint
UPDATE "routine_runs" SET "routine_id" = 'builtin:knowledge-decay'
WHERE "routine_id" LIKE 'builtin:knowledge-decay:%';--> statement-breakpoint
DELETE FROM "routines" WHERE "id" LIKE 'builtin:knowledge-decay:%';--> statement-breakpoint

INSERT INTO "routines"
  ("id", "name", "team_id", "prompt", "owner_agent_id", "trigger_type", "trigger_config", "event_type",
   "state_key", "human_review", "autonomy_level", "silent", "active", "state", "last_run_at",
   "next_run_at", "deleted_at", "last_run_summary", "created_at", "stub_task_id")
SELECT
  'builtin:knowledge-promotion', "name", "team_id", "prompt", "owner_agent_id", "trigger_type",
  "trigger_config", "event_type", "state_key", "human_review", "autonomy_level", "silent",
  "active", "state", "last_run_at", "next_run_at", "deleted_at", "last_run_summary", "created_at",
  "stub_task_id"
FROM "routines"
WHERE "id" LIKE 'builtin:knowledge-promotion:%'
ORDER BY "id" ASC
LIMIT 1
ON CONFLICT ("id") DO NOTHING;--> statement-breakpoint
UPDATE "routine_runs" SET "routine_id" = 'builtin:knowledge-promotion'
WHERE "routine_id" LIKE 'builtin:knowledge-promotion:%';--> statement-breakpoint
DELETE FROM "routines" WHERE "id" LIKE 'builtin:knowledge-promotion:%';--> statement-breakpoint

-- 4. Drop the routine's own scope. The FK's name has been stable and
--    unique since it was created in 0023_AA1_routine_visibility.sql and
--    never renamed — a direct named DROP CONSTRAINT, not a catalog lookup.
ALTER TABLE "routines" DROP CONSTRAINT IF EXISTS "routines_team_id_teams_id_fk";--> statement-breakpoint
DROP INDEX IF EXISTS "routines_team_id_idx";--> statement-breakpoint
ALTER TABLE "routines" DROP COLUMN IF EXISTS "team_id";--> statement-breakpoint

-- 5. Drop what never worked.
ALTER TABLE "routines" DROP COLUMN IF EXISTS "skill_id";--> statement-breakpoint
ALTER TABLE "routines" DROP COLUMN IF EXISTS "done_condition";--> statement-breakpoint
ALTER TABLE "routines" DROP COLUMN IF EXISTS "delegation_allowed";--> statement-breakpoint

-- 6. Delete the trigger data, then narrow the vocabulary. Deleting
--    first is required — re-adding the narrowed constraint over surviving
--    rows fails.
DELETE FROM "configuration_overrides" WHERE "kind" = 'trigger';--> statement-breakpoint
DELETE FROM "plugin_configuration_defaults" WHERE "kind" = 'trigger';--> statement-breakpoint
ALTER TABLE "plugin_configuration_defaults" DROP CONSTRAINT IF EXISTS "plugin_configuration_defaults_kind_ck";--> statement-breakpoint
ALTER TABLE "plugin_configuration_defaults" ADD CONSTRAINT "plugin_configuration_defaults_kind_ck"
  CHECK ("kind" IN ('agent', 'skill', 'routine', 'tool', 'mcp_server', 'harness_descriptor'));--> statement-breakpoint
ALTER TABLE "configuration_overrides" DROP CONSTRAINT IF EXISTS "configuration_overrides_kind_ck";--> statement-breakpoint
ALTER TABLE "configuration_overrides" ADD CONSTRAINT "configuration_overrides_kind_ck"
  CHECK ("kind" IN ('agent', 'skill', 'routine', 'tool', 'mcp_server', 'harness_descriptor'));
