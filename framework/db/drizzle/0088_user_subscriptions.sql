-- 1. the row: exactly one of event/schedule, a closed event vocabulary, a
--    schedule's next run only makes sense when it has a schedule.
CREATE TABLE "subscriptions" (
	"id" text PRIMARY KEY,
	"user_id" text NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
	"event" text,
	"schedule" text,
	"paused" boolean NOT NULL DEFAULT false,
	"next_run_at" text,
	"created_at" text NOT NULL,
	"updated_at" text NOT NULL,
	CONSTRAINT "subscriptions_trigger_ck" CHECK (("event" IS NULL) <> ("schedule" IS NULL)),
	CONSTRAINT "subscriptions_event_ck" CHECK ("event" IS NULL OR "event" IN (
		'task.created', 'task.changed',
		'thread.created', 'thread.message', 'thread.changed',
		'document.created', 'document.changed',
		'user.created', 'user.changed'
	)),
	CONSTRAINT "subscriptions_next_run_ck" CHECK ("next_run_at" IS NULL OR "schedule" IS NOT NULL)
);
--> statement-breakpoint
CREATE INDEX "subscriptions_user_idx" ON "subscriptions" ("user_id");
--> statement-breakpoint
CREATE INDEX "subscriptions_event_idx" ON "subscriptions" ("event") WHERE "event" IS NOT NULL;
--> statement-breakpoint

-- 2. a person's inbox row: a pointer at a change they have not yet seen or
--    read, never the change's content — the UI renders the change row itself.
CREATE TABLE "inbox" (
	"user_id" text NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
	"change_id" text NOT NULL REFERENCES "changes"("id") ON DELETE CASCADE,
	"seen_at" text,
	"read_at" text,
	PRIMARY KEY ("user_id", "change_id")
);
--> statement-breakpoint

-- 3. F1: a health note on an agent — a crash count, or null for a healthy
--    row. Written by the same session-ended reaction that used to write a
--    notification-queue row; lands as a `user.changed` change row instead.
ALTER TABLE "users" ADD COLUMN "health" text;
--> statement-breakpoint

-- 4. the subscription wake gets its own work-intent kind/source-kind pair,
--    beside the routine pair it will eventually replace. Widen, don't
--    replace — the routine pairing stays until the cut-over migration
--    retires it.
ALTER TABLE "agent_work_intents" DROP CONSTRAINT "agent_work_intents_kind_ck";
--> statement-breakpoint
ALTER TABLE "agent_work_intents" DROP CONSTRAINT "agent_work_intents_source_kind_ck";
--> statement-breakpoint
ALTER TABLE "agent_work_intents" DROP CONSTRAINT "agent_work_intents_kind_source_compat_ck";
--> statement-breakpoint
ALTER TABLE "agent_work_intents" ADD CONSTRAINT "agent_work_intents_kind_ck"
	CHECK ("kind" in ('thread_turn','session_start','knowledge_action','routine_run','task_run','session_resume','subscription_run'));
--> statement-breakpoint
ALTER TABLE "agent_work_intents" ADD CONSTRAINT "agent_work_intents_source_kind_ck"
	CHECK ("source_kind" in ('thread_message','explicit_session_start','knowledge_action','routine_run','task_dispatch_attempt','review_verdict','subscription'));
--> statement-breakpoint
ALTER TABLE "agent_work_intents" ADD CONSTRAINT "agent_work_intents_kind_source_compat_ck" CHECK (
	   ("kind" = 'thread_turn'      and "source_kind" = 'thread_message')
	or ("kind" = 'session_start'    and "source_kind" = 'explicit_session_start')
	or ("kind" = 'knowledge_action' and "source_kind" = 'knowledge_action')
	or ("kind" = 'routine_run'      and "source_kind" = 'routine_run')
	or ("kind" = 'task_run'         and "source_kind" = 'task_dispatch_attempt')
	or ("kind" = 'session_resume'   and "source_kind" = 'review_verdict')
	or ("kind" = 'subscription_run' and "source_kind" = 'subscription')
);
--> statement-breakpoint

-- 5. a subscription's prompt document is parented to it, the same way a
--    routine's is today — beside `routine`, not instead of it, until the
--    cut-over migration retires that member.
ALTER TABLE "documents" DROP CONSTRAINT "doc_parent_kind_ck";
--> statement-breakpoint
ALTER TABLE "documents" ADD CONSTRAINT "doc_parent_kind_ck"
	CHECK ("parent_kind" IS NULL OR "parent_kind" IN ('document', 'task', 'thread', 'routine', 'agent', 'subscription'));
