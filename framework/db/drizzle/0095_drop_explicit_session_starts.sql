-- @lore No producer ever emits a `session_start`/`knowledge_action` work
-- intent (nothing calls `createSessionRequest`/the explicit-session-start
-- route outside a test, and no `knowledge_action` resolver ever existed) —
-- both kinds and the `explicit_session_starts` table they alone fed are
-- dead. Zero deployments means no row needs preserving.
--
-- Order: (1) delete any stray rows of either dead kind, (2) rebuild the
-- three `agent_work_intents` CHECK constraints down to the four live kinds,
-- (3) drop `explicit_session_starts` outright.

-- 1. stray rows of either dead kind (none expected — no producer exists).
DELETE FROM "agent_work_intents" WHERE "kind" IN ('session_start', 'knowledge_action');
--> statement-breakpoint

ALTER TABLE "agent_work_intents" DROP CONSTRAINT "agent_work_intents_kind_ck";
--> statement-breakpoint
ALTER TABLE "agent_work_intents" ADD CONSTRAINT "agent_work_intents_kind_ck"
	CHECK ("kind" IN ('thread_turn', 'task_run', 'session_resume', 'subscription_run'));
--> statement-breakpoint

ALTER TABLE "agent_work_intents" DROP CONSTRAINT "agent_work_intents_source_kind_ck";
--> statement-breakpoint
ALTER TABLE "agent_work_intents" ADD CONSTRAINT "agent_work_intents_source_kind_ck"
	CHECK ("source_kind" IN ('thread_message', 'task_dispatch_attempt', 'review_verdict', 'subscription'));
--> statement-breakpoint

ALTER TABLE "agent_work_intents" DROP CONSTRAINT "agent_work_intents_kind_source_compat_ck";
--> statement-breakpoint
ALTER TABLE "agent_work_intents" ADD CONSTRAINT "agent_work_intents_kind_source_compat_ck"
	CHECK (
		("kind" = 'thread_turn' and "source_kind" = 'thread_message')
		or ("kind" = 'task_run' and "source_kind" = 'task_dispatch_attempt')
		or ("kind" = 'session_resume' and "source_kind" = 'review_verdict')
		or ("kind" = 'subscription_run' and "source_kind" = 'subscription')
	);
--> statement-breakpoint

-- 3. the explicit-session-start table itself — no other table references it
--    outward (its own FKs to tasks/users/agent_session_requests/sessions go
--    with it).
DROP TABLE "explicit_session_starts";
