-- Who started a task: a person's page lists what they started, and a person is told when one of
-- them is done or stuck. Read back from the change that created each task.

ALTER TABLE "tasks" ADD COLUMN "started_by" text REFERENCES "users"("id") ON DELETE SET NULL;
--> statement-breakpoint

UPDATE "tasks" SET "started_by" = c."actor"
FROM "changes" c
WHERE c."object" = 'task' AND c."kind" = 'created' AND c."object_id" = "tasks"."id"
	AND EXISTS (SELECT 1 FROM "users" u WHERE u."id" = c."actor");
--> statement-breakpoint

-- What a person is told about is a set of reasons in their own words, each a subscription.
ALTER TABLE "subscriptions" DROP CONSTRAINT "subscriptions_event_ck";
--> statement-breakpoint

ALTER TABLE "subscriptions" ADD CONSTRAINT "subscriptions_event_ck" CHECK ("event" IS NULL OR "event" IN (
	'task.created', 'task.changed',
	'thread.created', 'thread.message', 'thread.changed',
	'document.created', 'document.changed',
	'user.created', 'user.changed',
	'review.raised_for_me', 'mention.of_me', 'started.done_or_stuck', 'followed.changed'
));
--> statement-breakpoint

-- A reason is a person's own, never about one object.
ALTER TABLE "subscriptions" ADD CONSTRAINT "subscriptions_reason_ck" CHECK (
	"object_id" IS NULL OR "event" NOT IN ('review.raised_for_me', 'mention.of_me', 'started.done_or_stuck', 'followed.changed')
);
--> statement-breakpoint

-- People had every object event; they now have the four reasons, on as before.
DELETE FROM "subscriptions" s USING "users" u
WHERE s."user_id" = u."id" AND u."kind" = 'human' AND s."object_id" IS NULL AND s."event" IS NOT NULL;
--> statement-breakpoint

INSERT INTO "subscriptions" ("id", "user_id", "event", "paused", "created_at", "updated_at")
SELECT u."id" || ':' || r."event", u."id", r."event", false, u."created_at", u."created_at"
FROM "users" u
CROSS JOIN (VALUES ('review.raised_for_me'), ('mention.of_me'), ('started.done_or_stuck'), ('followed.changed')) AS r("event")
WHERE u."kind" = 'human';
--> statement-breakpoint

-- A service you connect reaches every agent of yours; a row here keeps it from one of them.
CREATE TABLE "service_connection_withholds" (
	"connection_id" text NOT NULL REFERENCES "service_connections"("id") ON DELETE CASCADE,
	"agent_user_id" text NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
	"created_at" text NOT NULL,
	PRIMARY KEY ("connection_id", "agent_user_id")
);
