-- Every reason for an agent to act is an inbox row, like a person's: the row names its reason, may
-- have no change (a schedule fires on its own), and is unique per user by its key. The server no
-- longer queues agent runs, so the run side's intent queue goes.
ALTER TABLE "inbox" DROP CONSTRAINT "inbox_pkey";
--> statement-breakpoint
ALTER TABLE "inbox" ADD COLUMN "id" text;
--> statement-breakpoint
ALTER TABLE "inbox" ADD COLUMN "reason" text;
--> statement-breakpoint
ALTER TABLE "inbox" ADD COLUMN "subscription_id" text REFERENCES "subscriptions"("id") ON DELETE CASCADE;
--> statement-breakpoint
ALTER TABLE "inbox" ADD COLUMN "object_id" text;
--> statement-breakpoint
ALTER TABLE "inbox" ADD COLUMN "key" text;
--> statement-breakpoint
ALTER TABLE "inbox" ADD COLUMN "created_at" text;
--> statement-breakpoint
UPDATE "inbox" SET
	"id" = "inbox"."user_id" || ':' || "inbox"."change_id",
	"reason" = 'subscription',
	"object_id" = "changes"."object_id",
	"key" = 'change:' || "inbox"."change_id",
	"created_at" = "changes"."at"
FROM "changes" WHERE "changes"."id" = "inbox"."change_id";
--> statement-breakpoint
DO $$ BEGIN
	IF EXISTS (SELECT 1 FROM "inbox" WHERE "id" IS NULL) THEN
		RAISE EXCEPTION 'inbox rows without a change cannot be converted';
	END IF;
END $$;
--> statement-breakpoint
ALTER TABLE "inbox" ALTER COLUMN "id" SET NOT NULL;
--> statement-breakpoint
ALTER TABLE "inbox" ALTER COLUMN "reason" SET NOT NULL;
--> statement-breakpoint
ALTER TABLE "inbox" ALTER COLUMN "key" SET NOT NULL;
--> statement-breakpoint
ALTER TABLE "inbox" ALTER COLUMN "created_at" SET NOT NULL;
--> statement-breakpoint
ALTER TABLE "inbox" ALTER COLUMN "change_id" DROP NOT NULL;
--> statement-breakpoint
ALTER TABLE "inbox" ADD PRIMARY KEY ("id");
--> statement-breakpoint
CREATE UNIQUE INDEX "inbox_user_key_uq" ON "inbox" ("user_id", "key");
--> statement-breakpoint
CREATE INDEX "inbox_user_unread_idx" ON "inbox" ("user_id", "created_at") WHERE "read_at" IS NULL;
--> statement-breakpoint
ALTER TABLE "inbox" ADD CONSTRAINT "inbox_reason_ck" CHECK ("reason" IN ('subscription', 'message', 'task_run', 'task_stop', 'review_answered'));
--> statement-breakpoint
DROP TABLE "agent_work_intents";
