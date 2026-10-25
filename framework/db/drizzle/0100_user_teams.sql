-- A user's teams become a set: a person may be in several teams, an agent in
-- exactly one. Moves every users.team_id into user_teams, puts every owned
-- agent in its owner's team, refuses to finish if a user lost its team or an
-- agent ends up in other than one team, then drops users.team_id and the
-- users_belonging_ck check that kept owned agents teamless.

CREATE TABLE "user_teams" (
	"user_id" text NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
	"team_id" text NOT NULL REFERENCES "teams"("id") ON DELETE RESTRICT,
	PRIMARY KEY ("user_id", "team_id")
);
--> statement-breakpoint

CREATE INDEX "user_teams_team_idx" ON "user_teams" ("team_id");
--> statement-breakpoint

INSERT INTO "user_teams" ("user_id", "team_id")
SELECT "id", "team_id" FROM "users" WHERE "team_id" IS NOT NULL;
--> statement-breakpoint

INSERT INTO "user_teams" ("user_id", "team_id")
SELECT "agent"."id", "owner"."team_id"
FROM "users" AS "agent"
JOIN "users" AS "owner" ON "owner"."id" = "agent"."owner_user_id"
WHERE "owner"."team_id" IS NOT NULL
ON CONFLICT DO NOTHING;
--> statement-breakpoint

DO $$
DECLARE bad_count int;
BEGIN
    SELECT COUNT(*) INTO bad_count
    FROM "users" AS "u"
    WHERE "u"."team_id" IS NOT NULL
      AND NOT EXISTS (
        SELECT 1 FROM "user_teams" AS "ut"
        WHERE "ut"."user_id" = "u"."id" AND "ut"."team_id" = "u"."team_id"
      );
    IF bad_count > 0 THEN
        RAISE EXCEPTION 'Migration 0100: % user(s) lost their team — aborting', bad_count;
    END IF;

    SELECT COUNT(*) INTO bad_count
    FROM "users" AS "a"
    JOIN "users" AS "o" ON "o"."id" = "a"."owner_user_id"
    WHERE "o"."team_id" IS NOT NULL
      AND NOT EXISTS (
        SELECT 1 FROM "user_teams" AS "ut"
        WHERE "ut"."user_id" = "a"."id" AND "ut"."team_id" = "o"."team_id"
      );
    IF bad_count > 0 THEN
        RAISE EXCEPTION 'Migration 0100: % owned agent(s) are not in their owner''s team — aborting', bad_count;
    END IF;

    SELECT COUNT(*) INTO bad_count
    FROM (
        SELECT "ut"."user_id"
        FROM "user_teams" AS "ut"
        JOIN "users" AS "u" ON "u"."id" = "ut"."user_id"
        WHERE "u"."kind" = 'ai'
        GROUP BY "ut"."user_id"
        HAVING COUNT(*) <> 1
    ) AS "many";
    IF bad_count > 0 THEN
        RAISE EXCEPTION 'Migration 0100: % agent(s) are in more than one team — aborting', bad_count;
    END IF;
END $$;
--> statement-breakpoint

ALTER TABLE "users" DROP CONSTRAINT "users_belonging_ck";
--> statement-breakpoint

ALTER TABLE "users" DROP COLUMN "team_id";
