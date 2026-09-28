-- Belonging is a column on the agent row — a team, a person, or
-- neither, never two. Humans satisfy the check trivially (their
-- owner_user_id is always null); today no agent has an owner at all, so the
-- constraint is safe against every existing row.
ALTER TABLE "users" ADD COLUMN "owner_user_id" text;
--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_owner_user_id_users_id_fk"
  FOREIGN KEY ("owner_user_id") REFERENCES "users"("id") ON DELETE SET NULL;
--> statement-breakpoint
-- Write down the link the `ast-<userId>` id string was already making.
UPDATE "users" a
SET "owner_user_id" = substring(a."id" from 5)
WHERE a."id" LIKE 'ast-%'
  AND a."kind" = 'ai'
  AND a."team_id" IS NULL
  AND EXISTS (SELECT 1 FROM "users" h
              WHERE h."id" = substring(a."id" from 5) AND h."kind" = 'human');
--> statement-breakpoint
-- A team, a person, or neither — never two. Humans satisfy this trivially.
ALTER TABLE "users" ADD CONSTRAINT "users_belonging_ck"
  CHECK ("owner_user_id" IS NULL OR ("kind" = 'ai' AND "team_id" IS NULL));
