-- BA2 return half — the verdict reaches the agent in its own session.
--
-- Three facts have to survive the session that produced them, because the
-- human decides after that session has already ended:
--
--   1. Which native session to resume. Each harness assigns its own id
--      (claude's is one we assign at start). Without it there is nothing to
--      resume and the agent can never be brought back.
--   2. Which review a gate actually caused. Only such a review may clear an
--      action; an earlier attempt registered on every submit_review, so
--      approving an ordinary design review granted a bypass.
--   3. That "session_resume" is a kind of agent work, so the verdict travels
--      the same durable intent queue as every other handoff from a domain
--      write to the agent runtime.

ALTER TABLE "sessions" ADD COLUMN "harness_session_id" text;--> statement-breakpoint

CREATE TABLE "gate_reviews" (
	"id" text PRIMARY KEY NOT NULL,
	"review_message_id" text NOT NULL,
	"session_id" text NOT NULL,
	"rule_id" text NOT NULL,
	"tool_name" text NOT NULL,
	"created_at" text NOT NULL,
	CONSTRAINT "gate_reviews_review_message_id_uq" UNIQUE("review_message_id")
);--> statement-breakpoint

CREATE INDEX "gate_reviews_session_id_idx" ON "gate_reviews" USING btree ("session_id");--> statement-breakpoint

ALTER TABLE "agent_work_intents" DROP CONSTRAINT "agent_work_intents_kind_ck";--> statement-breakpoint
ALTER TABLE "agent_work_intents" DROP CONSTRAINT "agent_work_intents_source_kind_ck";--> statement-breakpoint
ALTER TABLE "agent_work_intents" DROP CONSTRAINT "agent_work_intents_kind_source_compat_ck";--> statement-breakpoint
ALTER TABLE "agent_work_intents" ADD CONSTRAINT "agent_work_intents_kind_ck" CHECK ("agent_work_intents"."kind" in ('assistant_turn','session_start','knowledge_action','routine_run','task_run','session_resume'));--> statement-breakpoint
ALTER TABLE "agent_work_intents" ADD CONSTRAINT "agent_work_intents_source_kind_ck" CHECK ("agent_work_intents"."source_kind" in ('thread_message','explicit_session_start','knowledge_action','routine_run','task_dispatch_attempt','gate_review'));--> statement-breakpoint
ALTER TABLE "agent_work_intents" ADD CONSTRAINT "agent_work_intents_kind_source_compat_ck" CHECK (
		("agent_work_intents"."kind" = 'assistant_turn' and "agent_work_intents"."source_kind" = 'thread_message')
		or ("agent_work_intents"."kind" = 'session_start' and "agent_work_intents"."source_kind" = 'explicit_session_start')
		or ("agent_work_intents"."kind" = 'knowledge_action' and "agent_work_intents"."source_kind" = 'knowledge_action')
		or ("agent_work_intents"."kind" = 'routine_run' and "agent_work_intents"."source_kind" = 'routine_run')
		or ("agent_work_intents"."kind" = 'task_run' and "agent_work_intents"."source_kind" = 'task_dispatch_attempt')
		or ("agent_work_intents"."kind" = 'session_resume' and "agent_work_intents"."source_kind" = 'gate_review')
	);
