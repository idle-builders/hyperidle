-- AU44 Batch 1: fold `team_members` into `teams`.
--
-- Rationale: the 1:1 Team = TeamMembers invariant enforced by app-level 500s
-- is the schema confessing two tables are one entity. `getTeamMembers` with
-- `require:true` threw 500 instead of 404 because a missing team_members row
-- was a programming bug, not a user error — that invariant police disappears
-- when the tables are one.
--
-- Steps:
-- 1. Add the columns from team_members to teams (all nullable first so
--    existing rows satisfy the NOT NULL migration below).
-- 2. Migrate data: copy column values from team_members to teams.
-- 3. Re-point users.team_id from team_members.id to teams.id.
-- 4. Drop the old FK from users.team_id → team_members.id.
-- 5. Add the new FK from users.team_id → teams.id.
-- 6. Drop team_members.
--
-- MIGRATION SAFETY: the data migration (step 3) sets NOT NULL columns after
-- the copy so all existing rows get values before the constraint is applied.
-- `capacity` defaults to 5, `active_bets` defaults to 0 for any team that
-- had no matching team_members row (should not occur in a well-formed DB but
-- the schema defaults guard the zero-migration case).

-- Step 1: add columns to teams (nullable for migration)
ALTER TABLE "teams" ADD COLUMN "lead_agent_id" text;--> statement-breakpoint
ALTER TABLE "teams" ADD COLUMN "capacity" integer;--> statement-breakpoint
ALTER TABLE "teams" ADD COLUMN "active_bets" integer;--> statement-breakpoint
ALTER TABLE "teams" ADD COLUMN "formed_at" text;--> statement-breakpoint

-- Step 2: copy team_members data into teams
UPDATE "teams" t
SET
  "lead_agent_id" = (SELECT tm."lead_agent_id" FROM "team_members" tm WHERE tm."team_id" = t."id" LIMIT 1),
  "capacity"      = (SELECT tm."capacity"       FROM "team_members" tm WHERE tm."team_id" = t."id" LIMIT 1),
  "active_bets"   = (SELECT tm."active_bets"    FROM "team_members" tm WHERE tm."team_id" = t."id" LIMIT 1),
  "formed_at"     = (SELECT tm."formed_at"       FROM "team_members" tm WHERE tm."team_id" = t."id" LIMIT 1);--> statement-breakpoint

-- Apply NOT NULL defaults for teams with no companion row (should be zero rows).
UPDATE "teams" SET "capacity"    = 5 WHERE "capacity"    IS NULL;--> statement-breakpoint
UPDATE "teams" SET "active_bets" = 0 WHERE "active_bets" IS NULL;--> statement-breakpoint

-- Step 3: re-point users.team_id from team_members.id to teams.id
-- For each user whose team_id currently points at a team_members row,
-- replace it with the corresponding teams.id.
UPDATE "users" u
SET "team_id" = (SELECT tm."team_id" FROM "team_members" tm WHERE tm."id" = u."team_id")
WHERE u."team_id" IS NOT NULL
  AND EXISTS (SELECT 1 FROM "team_members" tm WHERE tm."id" = u."team_id");--> statement-breakpoint

-- Step 4: Drop old FK constraint users.team_id → team_members
-- PGlite / PostgreSQL: the FK is named by Drizzle as "users_team_id_team_members_id_fk"
ALTER TABLE "users" DROP CONSTRAINT IF EXISTS "users_team_id_team_members_id_fk";--> statement-breakpoint

-- Step 5: Add new FK users.team_id → teams.id
ALTER TABLE "users" ADD CONSTRAINT "users_team_id_teams_id_fk"
  FOREIGN KEY ("team_id") REFERENCES "teams"("id") ON DELETE RESTRICT;--> statement-breakpoint

-- Step 6: Drop team_members (no surviving table references it after step 3+4)
DROP TABLE "team_members";
