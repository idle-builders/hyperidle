-- 1. every human with no team gets the target of its oldest mechanism='team'
--    edge whose target is an existing teams.id — an older edge's target can
--    be an older team_members id that does not name any team, so it is
--    skipped by construction (the IN clause never matches it), not by a
--    special case. Falls back to the oldest team when no edge matches.
UPDATE "users" SET "team_id" = COALESCE(
	(
		SELECT "oe"."target" FROM "org_edges" "oe"
		WHERE "oe"."from_user_id" = "users"."id" AND "oe"."mechanism" = 'team'
			AND "oe"."target" IN (SELECT "id" FROM "teams")
		ORDER BY "oe"."created_at" ASC
		LIMIT 1
	),
	(SELECT "id" FROM "teams" ORDER BY "created_at" ASC LIMIT 1)
)
WHERE "kind" = 'human' AND "team_id" IS NULL;
--> statement-breakpoint

-- 2. every stored `routine_run` work intent is deleted — its baked request
--    is routine-shaped and no code drains it any more, so nothing left over
--    here has a code path to serve it. The three checks
--    rebuilt below drop 'routine_run' only — they keep 0085's 'thread_turn'
--    rename (not 'assistant_turn', which 0085 already retired).
DELETE FROM "agent_work_intents" WHERE "kind" = 'routine_run';
--> statement-breakpoint

ALTER TABLE "agent_work_intents" DROP CONSTRAINT "agent_work_intents_kind_ck";
--> statement-breakpoint
ALTER TABLE "agent_work_intents" ADD CONSTRAINT "agent_work_intents_kind_ck"
	CHECK ("kind" IN ('thread_turn', 'session_start', 'knowledge_action', 'task_run', 'session_resume', 'subscription_run'));
--> statement-breakpoint

ALTER TABLE "agent_work_intents" DROP CONSTRAINT "agent_work_intents_source_kind_ck";
--> statement-breakpoint
ALTER TABLE "agent_work_intents" ADD CONSTRAINT "agent_work_intents_source_kind_ck"
	CHECK ("source_kind" IN ('thread_message', 'explicit_session_start', 'knowledge_action', 'task_dispatch_attempt', 'review_verdict', 'subscription'));
--> statement-breakpoint

ALTER TABLE "agent_work_intents" DROP CONSTRAINT "agent_work_intents_kind_source_compat_ck";
--> statement-breakpoint
ALTER TABLE "agent_work_intents" ADD CONSTRAINT "agent_work_intents_kind_source_compat_ck"
	CHECK (
		("kind" = 'thread_turn' and "source_kind" = 'thread_message')
		or ("kind" = 'session_start' and "source_kind" = 'explicit_session_start')
		or ("kind" = 'knowledge_action' and "source_kind" = 'knowledge_action')
		or ("kind" = 'task_run' and "source_kind" = 'task_dispatch_attempt')
		or ("kind" = 'session_resume' and "source_kind" = 'review_verdict')
		or ("kind" = 'subscription_run' and "source_kind" = 'subscription')
	);
--> statement-breakpoint

-- 3. history rows only — neither column carries a CHECK, so this is a plain
--    respell, not a constraint change.
UPDATE "sessions" SET "source_kind" = 'subscription' WHERE "source_kind" = 'routine';
--> statement-breakpoint
UPDATE "agent_session_requests" SET "source_kind" = 'subscription' WHERE "source_kind" = 'routine';
--> statement-breakpoint
UPDATE "agent_session_requests" SET "prompt_mode" = 'subscription' WHERE "prompt_mode" = 'routine';
--> statement-breakpoint

-- 4. sessions.routine_id — null, never populated in practice (the
--    scheduler that would have written it never shipped a writer here); the
--    subscription flavour of a session is `source_kind`/`source_id`, not a
--    second FK.
DROP INDEX "sessions_routine_id_idx";
--> statement-breakpoint
ALTER TABLE "sessions" DROP COLUMN "routine_id";
--> statement-breakpoint

-- 5. a team is an id and a name — every column the setup wizard's scaffold
--    tracking and the deleted capacity gate carried goes.
ALTER TABLE "teams"
	DROP COLUMN "phase",
	DROP COLUMN "brief_path",
	DROP COLUMN "architecture_path",
	DROP COLUMN "brand_path",
	DROP COLUMN "principles_path",
	DROP COLUMN "factory_db_path",
	DROP COLUMN "lead_agent_id",
	DROP COLUMN "capacity",
	DROP COLUMN "formed_at";
