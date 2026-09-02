-- BA2 — the agent asks, a human clears.
--
-- Interception is removed. There is no rule list, nothing matches a tool call,
-- and nothing is blocked: the agent elects to ask, using the review product it
-- already has. `action_rules` therefore has no consumer and goes with it.
--
-- What the loop still needs is the return path. Two facts have to outlive the
-- session that produced them, because the human decides after that session has
-- already ended:
--
--   1. Which native session to resume. Each harness assigns its own id (claude's
--      is one we assign at start). Without it there is nothing to resume.
--   2. Which session filed which review, so a verdict knows what to bring back.
--
-- And "session_resume" joins the intent kinds so a verdict travels the same
-- durable queue as every other handoff from a domain write to the agent runtime.

DROP TABLE IF EXISTS "action_rules";--> statement-breakpoint

ALTER TABLE "sessions" ADD COLUMN "harness_session_id" text;--> statement-breakpoint

CREATE TABLE "review_sessions" (
	"id" text PRIMARY KEY NOT NULL,
	"review_message_id" text NOT NULL,
	"session_id" text NOT NULL,
	"created_at" text NOT NULL,
	CONSTRAINT "review_sessions_review_message_id_uq" UNIQUE("review_message_id")
);--> statement-breakpoint

CREATE INDEX "review_sessions_session_id_idx" ON "review_sessions" USING btree ("session_id");--> statement-breakpoint

ALTER TABLE "agent_work_intents" DROP CONSTRAINT "agent_work_intents_kind_ck";--> statement-breakpoint
ALTER TABLE "agent_work_intents" DROP CONSTRAINT "agent_work_intents_source_kind_ck";--> statement-breakpoint
ALTER TABLE "agent_work_intents" DROP CONSTRAINT "agent_work_intents_kind_source_compat_ck";--> statement-breakpoint
ALTER TABLE "agent_work_intents" ADD CONSTRAINT "agent_work_intents_kind_ck" CHECK ("agent_work_intents"."kind" in ('assistant_turn','session_start','knowledge_action','routine_run','task_run','session_resume'));--> statement-breakpoint
ALTER TABLE "agent_work_intents" ADD CONSTRAINT "agent_work_intents_source_kind_ck" CHECK ("agent_work_intents"."source_kind" in ('thread_message','explicit_session_start','knowledge_action','routine_run','task_dispatch_attempt','review_verdict'));--> statement-breakpoint
ALTER TABLE "agent_work_intents" ADD CONSTRAINT "agent_work_intents_kind_source_compat_ck" CHECK (
		("agent_work_intents"."kind" = 'assistant_turn' and "agent_work_intents"."source_kind" = 'thread_message')
		or ("agent_work_intents"."kind" = 'session_start' and "agent_work_intents"."source_kind" = 'explicit_session_start')
		or ("agent_work_intents"."kind" = 'knowledge_action' and "agent_work_intents"."source_kind" = 'knowledge_action')
		or ("agent_work_intents"."kind" = 'routine_run' and "agent_work_intents"."source_kind" = 'routine_run')
		or ("agent_work_intents"."kind" = 'task_run' and "agent_work_intents"."source_kind" = 'task_dispatch_attempt')
		or ("agent_work_intents"."kind" = 'session_resume' and "agent_work_intents"."source_kind" = 'review_verdict')
	);
