-- Team default-runner and global team.
-- - teams gains is_global (one per company, everyone is in it; the oldest team is global).
-- - user_teams gains is_default_runner (one per team; the first person to join that team).
-- - plugins.scope_kind loses 'factory'; factory installs are deleted along with their contributions.

-- Add is_global to teams
ALTER TABLE "teams" ADD COLUMN "is_global" boolean NOT NULL DEFAULT false;
--> statement-breakpoint

-- The oldest team (by created_at then id) is the company-wide team.
-- @lore: global team = oldest by creation order; nothing stores an explicit company name, the first team IS the company
UPDATE "teams"
SET "is_global" = TRUE
WHERE "id" = (SELECT "id" FROM "teams" ORDER BY "created_at", "id" LIMIT 1);
--> statement-breakpoint

-- Add is_default_runner to user_teams (false for all existing rows; backfilled below)
ALTER TABLE "user_teams" ADD COLUMN "is_default_runner" boolean NOT NULL DEFAULT false;
--> statement-breakpoint

-- Every person joins the global team (idempotent — skips if already a member)
INSERT INTO "user_teams" ("user_id", "team_id")
SELECT u."id", t."id"
FROM "users" u, "teams" t
WHERE u."kind" = 'human' AND t."is_global" = TRUE
ON CONFLICT DO NOTHING;
--> statement-breakpoint

-- Set the default runner for each team: the person with the earliest created_at (then id).
-- For the global team this is the founder; for other teams it is whoever joined first.
WITH first_per_team AS (
    SELECT DISTINCT ON (ut."team_id")
        ut."user_id",
        ut."team_id"
    FROM "user_teams" ut
    JOIN "users" u ON u."id" = ut."user_id"
    WHERE u."kind" = 'human'
    ORDER BY ut."team_id", u."created_at", u."id"
)
UPDATE "user_teams"
SET "is_default_runner" = TRUE
FROM first_per_team
WHERE "user_teams"."user_id" = first_per_team."user_id"
  AND "user_teams"."team_id" = first_per_team."team_id";
--> statement-breakpoint

-- Unique: at most one default runner per team
CREATE UNIQUE INDEX "user_teams_default_runner_uq" ON "user_teams" ("team_id")
WHERE "is_default_runner" = TRUE;
--> statement-breakpoint

-- ── Plugins: delete factory-scope installs ───────────────────────────────────

-- Delete factory-contributed subscriptions.
DELETE FROM "subscriptions"
WHERE "id" IN (
    SELECT pc."entity_id"
    FROM "plugin_contributions" pc
    JOIN "plugins" p ON p."id" = pc."plugin_id"
    WHERE p."scope_kind" = 'factory'
      AND pc."kind" = 'subscription'
);
--> statement-breakpoint

-- Delete factory-contributed documents.
DELETE FROM "documents"
WHERE "id" IN (
    SELECT pc."entity_id"
    FROM "plugin_contributions" pc
    JOIN "plugins" p ON p."id" = pc."plugin_id"
    WHERE p."scope_kind" = 'factory'
      AND pc."kind" = 'document'
);
--> statement-breakpoint

-- Delete factory-contributed agents (users).
-- If changes.actor (ON DELETE RESTRICT) blocks a row, the migration fails rather than silently skipping.
DELETE FROM "users"
WHERE "id" IN (
    SELECT pc."entity_id"
    FROM "plugin_contributions" pc
    JOIN "plugins" p ON p."id" = pc."plugin_id"
    WHERE p."scope_kind" = 'factory'
      AND pc."kind" = 'agent'
);
--> statement-breakpoint

-- Delete factory-scope plugin installs; ON DELETE CASCADE removes their plugin_contributions rows.
DELETE FROM "plugins" WHERE "scope_kind" = 'factory';
--> statement-breakpoint

-- Drop the old scope_kind check and replace it with the team-only version
ALTER TABLE "plugins" DROP CONSTRAINT "plugins_scope_kind_ck";
--> statement-breakpoint

ALTER TABLE "plugins" ADD CONSTRAINT "plugins_scope_kind_ck" CHECK ("scope_kind" IN ('team'));
--> statement-breakpoint

ALTER TABLE "plugins" ALTER COLUMN "scope_kind" SET DEFAULT 'team';
--> statement-breakpoint

-- scope_team_id is now always set for the remaining team-scope installs; enforce it.
ALTER TABLE "plugins" ALTER COLUMN "scope_team_id" SET NOT NULL;
