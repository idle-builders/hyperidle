-- 1. guard: an event routine whose event_type this migration cannot map
--    must stop the migration, not silently drop the trigger.
DO $$
DECLARE unmapped bigint;
BEGIN
	SELECT count(*) INTO unmapped FROM "routines"
	WHERE "deleted_at" IS NULL AND "trigger_type" = 'event'
		AND "event_type" NOT IN ('task_state_changed', 'thread_created', 'thread_message_appended', 'thread_resolved', 'thread_reopened');
	IF unmapped > 0 THEN
		RAISE EXCEPTION '0089: % live event routines have no subscription event mapping', unmapped;
	END IF;
END $$;
--> statement-breakpoint

-- 2. the subscription rows.
INSERT INTO "subscriptions" ("id", "user_id", "event", "schedule", "paused", "next_run_at", "created_at", "updated_at")
SELECT
	"id",
	"owner_agent_id",
	CASE WHEN "trigger_type" = 'event' THEN
		CASE "event_type"
			WHEN 'task_state_changed' THEN 'task.changed'
			WHEN 'thread_created' THEN 'thread.created'
			WHEN 'thread_message_appended' THEN 'thread.message'
			WHEN 'thread_resolved' THEN 'thread.changed'
			WHEN 'thread_reopened' THEN 'thread.changed'
		END
	END,
	CASE WHEN "trigger_type" = 'calendar' THEN ("trigger_config"::json)->>'cron' END,
	("state" <> 'active' OR NOT "active"),
	"next_run_at",
	COALESCE("created_at", "last_run_at", now()::text),
	COALESCE("created_at", "last_run_at", now()::text)
FROM "routines"
WHERE "deleted_at" IS NULL AND "trigger_type" IN ('event', 'calendar');
--> statement-breakpoint

-- 3. prompt documents: a migrated routine's prompt re-parents to the
--    subscription it became (same id); an unmigrated routine's prompt
--    (deleted, or a trigger type with no subscription analogue) has nowhere
--    honest to land and is deleted outright — a routine's prompt is
--    worthless without the trigger it belonged to.
UPDATE "documents" SET "parent_kind" = 'subscription'
WHERE "parent_kind" = 'routine' AND "parent_id" IN (SELECT "id" FROM "subscriptions");
--> statement-breakpoint
DELETE FROM "documents"
WHERE "parent_kind" = 'routine' AND "parent_id" NOT IN (SELECT "id" FROM "subscriptions");
--> statement-breakpoint

-- 4. the three plugin-provenance kind columns respell 'routine' to
--    'subscription' — a subscription is what a plugin contributes/configures
--    now.
ALTER TABLE "plugin_contributions" DROP CONSTRAINT "plugin_contributions_kind_ck";
--> statement-breakpoint
UPDATE "plugin_contributions" SET "kind" = 'subscription' WHERE "kind" = 'routine';
--> statement-breakpoint
ALTER TABLE "plugin_contributions" ADD CONSTRAINT "plugin_contributions_kind_ck"
	CHECK ("kind" IN ('agent', 'subscription', 'document', 'configuration_default'));
--> statement-breakpoint

ALTER TABLE "plugin_configuration_defaults" DROP CONSTRAINT "plugin_configuration_defaults_kind_ck";
--> statement-breakpoint
UPDATE "plugin_configuration_defaults" SET "kind" = 'subscription' WHERE "kind" = 'routine';
--> statement-breakpoint
ALTER TABLE "plugin_configuration_defaults" ADD CONSTRAINT "plugin_configuration_defaults_kind_ck"
	CHECK ("kind" IN ('agent', 'skill', 'subscription', 'tool', 'mcp_server', 'harness_descriptor'));
--> statement-breakpoint

ALTER TABLE "configuration_overrides" DROP CONSTRAINT "configuration_overrides_kind_ck";
--> statement-breakpoint
UPDATE "configuration_overrides" SET "kind" = 'subscription' WHERE "kind" = 'routine';
--> statement-breakpoint
ALTER TABLE "configuration_overrides" ADD CONSTRAINT "configuration_overrides_kind_ck"
	CHECK ("kind" IN ('agent', 'skill', 'subscription', 'tool', 'mcp_server', 'harness_descriptor'));
--> statement-breakpoint

-- 5. the old tables drop — routine_runs first (its FK references routines).
DROP TABLE "routine_runs";
--> statement-breakpoint
DROP TABLE "routines";
--> statement-breakpoint
DROP TABLE "notification_queue";
--> statement-breakpoint

-- 6. the document parent-kind check loses routine — every remaining
--    routine-parented document was re-parented or deleted in step 3.
ALTER TABLE "documents" DROP CONSTRAINT "doc_parent_kind_ck";
--> statement-breakpoint
ALTER TABLE "documents" ADD CONSTRAINT "doc_parent_kind_ck"
	CHECK ("parent_kind" IS NULL OR "parent_kind" IN ('document', 'task', 'thread', 'agent', 'subscription'));
