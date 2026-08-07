-- U1: Schema Migration — Products -> Teams + Bet Simplification (PostgreSQL)
-- @lore U1: Hand-written PG migration. PG does NOT auto-update FK references
-- on table rename (unlike SQLite). However, Drizzle-managed FKs are defined
-- in the TypeScript schema, not as DB-level constraints in PG.
-- The migration only renames tables/columns; FK constraints are managed
-- by Drizzle's schema definition.

-- Step 1: Rename old `teams` (agent membership) to `team_members` FIRST
-- so the name `teams` becomes available for the products rename.
ALTER TABLE "teams" RENAME TO "team_members";
--> statement-breakpoint

-- Step 2: Rename `products` to `teams`.
ALTER TABLE "products" RENAME TO "teams";
--> statement-breakpoint

-- Step 3: On bets — drop old team_id (pointed at old teams, now team_members).
-- The 1:1 Product=Team invariant means product_id fully determines the team.
-- Drop the index first, then the column.
DROP INDEX IF EXISTS "bets_product_id_idx";
--> statement-breakpoint
ALTER TABLE "bets" DROP COLUMN "team_id";
--> statement-breakpoint

-- Step 4: On bets — rename product_id to team_id.
ALTER TABLE "bets" RENAME COLUMN "product_id" TO "team_id";
--> statement-breakpoint

-- Step 5: Recreate the index on bets.team_id.
CREATE INDEX "bets_team_id_idx" ON "bets" ("team_id");
--> statement-breakpoint

-- Step 6: On tasks — drop old team_id (pointed at old teams, now team_members).
DROP INDEX IF EXISTS "tasks_team_id_idx";
--> statement-breakpoint
DROP INDEX IF EXISTS "tasks_product_id_idx";
--> statement-breakpoint
ALTER TABLE "tasks" DROP COLUMN "team_id";
--> statement-breakpoint

-- Step 7: On tasks — rename product_id to team_id.
ALTER TABLE "tasks" RENAME COLUMN "product_id" TO "team_id";
--> statement-breakpoint

-- Step 8: Recreate indexes on tasks.
CREATE INDEX "tasks_team_id_idx" ON "tasks" ("team_id");
--> statement-breakpoint

-- Step 9: Bet status migration.
UPDATE "bets" SET "status" = 'draft' WHERE "status" = 'shaped';
--> statement-breakpoint
UPDATE "bets" SET "status" = 'active' WHERE "status" IN ('committed', 'in_progress', 'behind', 'blocked', 'paused', 'review');
--> statement-breakpoint
UPDATE "bets" SET "status" = 'completed' WHERE "status" = 'shipped';
--> statement-breakpoint

-- Step 10: Rename bet columns.
ALTER TABLE "bets" RENAME COLUMN "pitch" TO "description";
--> statement-breakpoint
ALTER TABLE "bets" RENAME COLUMN "shipped_at" TO "completed_at";
--> statement-breakpoint

-- Step 11: Add at_risk boolean column (PG native boolean).
ALTER TABLE "bets" ADD COLUMN "at_risk" boolean DEFAULT false NOT NULL;
--> statement-breakpoint

-- Step 12: Rename team_members.product_id to team_members.team_id
-- (it now references the `teams` table, formerly `products`).
ALTER TABLE "team_members" RENAME COLUMN "product_id" TO "team_id";
--> statement-breakpoint

-- Step 13: Update propagation_log target_level values.
-- @lore U1: Guard with IF EXISTS because the PG migration set does not yet
-- include the add_propagation_log migration (L20). The UPDATE is a no-op if
-- the table does not exist.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'propagation_log') THEN
    UPDATE "propagation_log" SET "target_level" = 'team' WHERE "target_level" = 'product';
  END IF;
END $$;
