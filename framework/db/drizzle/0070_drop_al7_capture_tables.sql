-- Drop capture machinery tables and update agent_work_intents constraints.
--
-- Removes the three tables that backed the trust-first two-session review
-- workflow (proposed_calls, tailored_grants, operation_outcomes). No production
-- path writes to them; the capture machinery is dead code.
--
-- Also narrows the agent_work_intents kind/sourceKind CHECK constraints to
-- remove the now-dead 'reengagement'/'proposed_call' entries.

-- Historical rows first: the narrowed CHECK constraints below are rejected by
-- Postgres if any existing row already violates them, so a database that ever
-- recorded a reengagement intent could not run this migration at all. These
-- rows belong to the deleted machinery and have no meaning without it.
DELETE FROM "agent_work_intents" WHERE "kind" = 'reengagement' OR "source_kind" = 'proposed_call';--> statement-breakpoint
ALTER TABLE "agent_work_intents" DROP CONSTRAINT IF EXISTS "agent_work_intents_kind_ck";--> statement-breakpoint
ALTER TABLE "agent_work_intents" DROP CONSTRAINT IF EXISTS "agent_work_intents_source_kind_ck";--> statement-breakpoint
ALTER TABLE "agent_work_intents" DROP CONSTRAINT IF EXISTS "agent_work_intents_kind_source_compat_ck";--> statement-breakpoint
ALTER TABLE "agent_work_intents" ADD CONSTRAINT "agent_work_intents_kind_ck" CHECK ("agent_work_intents"."kind" in ('assistant_turn','session_start','knowledge_action','routine_run','task_run'));--> statement-breakpoint
ALTER TABLE "agent_work_intents" ADD CONSTRAINT "agent_work_intents_source_kind_ck" CHECK ("agent_work_intents"."source_kind" in ('thread_message','explicit_session_start','knowledge_action','routine_run','task_dispatch_attempt'));--> statement-breakpoint
ALTER TABLE "agent_work_intents" ADD CONSTRAINT "agent_work_intents_kind_source_compat_ck" CHECK (
		("agent_work_intents"."kind" = 'assistant_turn' and "agent_work_intents"."source_kind" = 'thread_message')
		or ("agent_work_intents"."kind" = 'session_start' and "agent_work_intents"."source_kind" = 'explicit_session_start')
		or ("agent_work_intents"."kind" = 'knowledge_action' and "agent_work_intents"."source_kind" = 'knowledge_action')
		or ("agent_work_intents"."kind" = 'routine_run' and "agent_work_intents"."source_kind" = 'routine_run')
		or ("agent_work_intents"."kind" = 'task_run' and "agent_work_intents"."source_kind" = 'task_dispatch_attempt')
	);--> statement-breakpoint
DROP TABLE IF EXISTS "operation_outcomes";--> statement-breakpoint
DROP TABLE IF EXISTS "tailored_grants";--> statement-breakpoint
DROP TABLE IF EXISTS "proposed_calls";
