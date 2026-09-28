-- The built-in `bet_decomposition`
-- mechanism is REMOVED entirely, not migrated. Shrinks the `agent_work_intents`
-- kind/source-kind vocabulary from seven kinds to six (bet_decomposition/bet
-- dropped), drops the two `bets` decomposition-lifecycle columns, and drops
-- 'decomposition' from `agent_lifecycle_inbox`'s source_kind vocabulary.
-- Hand-authored incremental migration (this repo's migrations are additive
-- SQL files tracked only by meta/_journal.json — see 0043-0052 — not by a
-- regenerated drizzle-kit snapshot chain past 0042).

ALTER TABLE "bets" DROP COLUMN "decomposition_status";
--> statement-breakpoint
ALTER TABLE "bets" DROP COLUMN "decomposition_blocker_reason";
--> statement-breakpoint

ALTER TABLE "agent_work_intents" DROP CONSTRAINT "agent_work_intents_kind_ck";
--> statement-breakpoint
ALTER TABLE "agent_work_intents" ADD CONSTRAINT "agent_work_intents_kind_ck" CHECK ("kind" IN ('assistant_turn','session_start','knowledge_action','routine_run','task_run','reengagement'));
--> statement-breakpoint

ALTER TABLE "agent_work_intents" DROP CONSTRAINT "agent_work_intents_source_kind_ck";
--> statement-breakpoint
ALTER TABLE "agent_work_intents" ADD CONSTRAINT "agent_work_intents_source_kind_ck" CHECK ("source_kind" IN ('thread_message','explicit_session_start','knowledge_action','routine_run','task_dispatch_attempt','proposed_call'));
--> statement-breakpoint

ALTER TABLE "agent_work_intents" DROP CONSTRAINT "agent_work_intents_kind_source_compat_ck";
--> statement-breakpoint
ALTER TABLE "agent_work_intents" ADD CONSTRAINT "agent_work_intents_kind_source_compat_ck" CHECK (
	("kind" = 'assistant_turn' AND "source_kind" = 'thread_message')
	OR ("kind" = 'session_start' AND "source_kind" = 'explicit_session_start')
	OR ("kind" = 'knowledge_action' AND "source_kind" = 'knowledge_action')
	OR ("kind" = 'routine_run' AND "source_kind" = 'routine_run')
	OR ("kind" = 'task_run' AND "source_kind" = 'task_dispatch_attempt')
	OR ("kind" = 'reengagement' AND "source_kind" = 'proposed_call')
);
--> statement-breakpoint

ALTER TABLE "agent_lifecycle_inbox" DROP CONSTRAINT "agent_lifecycle_inbox_source_kind_ck";
--> statement-breakpoint
ALTER TABLE "agent_lifecycle_inbox" ADD CONSTRAINT "agent_lifecycle_inbox_source_kind_ck" CHECK ("source_kind" IN ('assistant','task','knowledge','routine','proposed_call','explicit_session_start'));
