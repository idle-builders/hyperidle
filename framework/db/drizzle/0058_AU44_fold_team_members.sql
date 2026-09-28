-- AU44 Batch 1: fold `team_members` into `teams`.
--
-- Rationale: the 1:1 Team = TeamMembers invariant enforced by app-level 500s
-- is the schema confessing two tables are one entity. `getTeamMembers` with
-- `require:true` threw 500 instead of 404 because a missing team_members row
-- was a programming bug, not a user error — that invariant police disappears
-- when the tables are one.
--
-- Steps:
-- 1. Add the columns from team_members to teams.
--    `capacity` and `active_bets` use NOT NULL DEFAULT so they match the
--    schema definition and any pre-migration team row immediately has a value.
-- 2. Migrate data: copy column values from team_members to teams
--    (overrides the defaults for teams that had a companion row).
-- 3. Drop the old FK from users.team_id → team_members dynamically.
--    The constraint name varies by database history: it is
--    "agents_team_id_teams_id_fk" when the tables were named agents/teams
--    before the U1 rename, but must not be hardcoded.
-- 4. Re-point users.team_id from team_members.id to teams.id.
-- 5. Add the new FK from users.team_id → teams.id.
-- 6. Drop team_members.

-- Step 1: add columns to teams with correct types matching schema declaration.
-- `capacity` and `active_bets` are NOT NULL with defaults so migrated rows
-- immediately satisfy the constraint without a separate UPDATE + NOT NULL pass.
ALTER TABLE "teams" ADD COLUMN "lead_agent_id" text;--> statement-breakpoint
ALTER TABLE "teams" ADD COLUMN "capacity" integer NOT NULL DEFAULT 5;--> statement-breakpoint
ALTER TABLE "teams" ADD COLUMN "active_bets" integer NOT NULL DEFAULT 0;--> statement-breakpoint
ALTER TABLE "teams" ADD COLUMN "formed_at" text;--> statement-breakpoint

-- Step 2: copy team_members data into teams (overrides the defaults above)
UPDATE "teams" t
SET
  "lead_agent_id" = (SELECT tm."lead_agent_id" FROM "team_members" tm WHERE tm."team_id" = t."id" LIMIT 1),
  "capacity"      = COALESCE((SELECT tm."capacity"    FROM "team_members" tm WHERE tm."team_id" = t."id" LIMIT 1), 5),
  "active_bets"   = COALESCE((SELECT tm."active_bets" FROM "team_members" tm WHERE tm."team_id" = t."id" LIMIT 1), 0),
  "formed_at"     = (SELECT tm."formed_at"     FROM "team_members" tm WHERE tm."team_id" = t."id" LIMIT 1);--> statement-breakpoint

-- Step 3: Drop old FK constraint users.team_id → team_members BEFORE re-pointing.
-- The constraint name varies by database history (e.g. "agents_team_id_teams_id_fk"
-- when the tables were named agents/teams before U1 renamed them). Query the
-- catalog for the FK whose referencing table is "users" and referenced table
-- is "team_members", then drop whatever name is there.
DO $$
DECLARE
    cname text;
BEGIN
    SELECT con.conname INTO cname
    FROM pg_constraint con
    JOIN pg_class src ON src.oid = con.conrelid
    JOIN pg_class ref ON ref.oid = con.confrelid
    WHERE src.relname = 'users'
      AND ref.relname = 'team_members'
      AND con.contype = 'f'
    LIMIT 1;
    IF cname IS NOT NULL THEN
        EXECUTE format('ALTER TABLE users DROP CONSTRAINT %I', cname);
    END IF;
END $$;--> statement-breakpoint

-- Step 4: re-point users.team_id from team_members.id to teams.id.
-- For each user whose team_id currently points at a team_members row,
-- replace it with the corresponding teams.id.
-- Safe to run now: the FK to team_members was dropped in step 3.
UPDATE "users" u
SET "team_id" = (SELECT tm."team_id" FROM "team_members" tm WHERE tm."id" = u."team_id")
WHERE u."team_id" IS NOT NULL
  AND EXISTS (SELECT 1 FROM "team_members" tm WHERE tm."id" = u."team_id");--> statement-breakpoint

-- Step 5: Add new FK users.team_id → teams.id
ALTER TABLE "users" ADD CONSTRAINT "users_team_id_teams_id_fk"
  FOREIGN KEY ("team_id") REFERENCES "teams"("id") ON DELETE RESTRICT;--> statement-breakpoint

-- Step 6: Drop team_members (no surviving constraint references it after step 3)
DROP TABLE "team_members";
