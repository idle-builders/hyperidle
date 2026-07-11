ALTER TABLE "agent_work_intents" RENAME COLUMN "actor_id" TO "requested_by";
--> statement-breakpoint
ALTER TABLE "agent_session_requests" ADD COLUMN "claim_token" text;
--> statement-breakpoint
ALTER TABLE "agent_session_requests" ADD COLUMN "termination_reason" text;
--> statement-breakpoint
ALTER TABLE "agent_session_requests" ADD COLUMN "termination_requested_at" text;
--> statement-breakpoint
ALTER TABLE "agent_session_requests" ADD COLUMN "termination_requested_by" text;
--> statement-breakpoint
DROP INDEX IF EXISTS "sessions_request_id_idx";
--> statement-breakpoint
CREATE UNIQUE INDEX "sessions_request_id_uq" ON "sessions" ("request_id") WHERE "request_id" IS NOT NULL;
--> statement-breakpoint
ALTER TABLE "agent_session_requests" ADD CONSTRAINT "agent_session_requests_correlation_ck" CHECK (("status" = 'running' AND "session_id" IS NOT NULL) OR "status" <> 'running');
--> statement-breakpoint
ALTER TABLE "agent_work_intents" ADD CONSTRAINT "agent_work_intents_kind_ck" CHECK ("kind" IN ('assistant','assistant_turn','session_start','knowledge_action','routine_run','bet_decomposition','task_run','task_dispatch','reengagement'));
--> statement-breakpoint
ALTER TABLE "agent_work_intents" ADD CONSTRAINT "agent_work_intents_source_kind_ck" CHECK ("source_kind" IN ('thread_message','explicit_session_start','knowledge_action','routine_run','bet','task_dispatch_attempt','proposed_call','assistant'));
--> statement-breakpoint
ALTER TABLE "agent_work_intents" ADD CONSTRAINT "agent_work_intents_status_ck" CHECK ("status" IN ('pending','claimed','handed_off','failed'));
--> statement-breakpoint
ALTER TABLE "agent_work_intents" ADD CONSTRAINT "agent_work_intents_correlation_ck" CHECK ("request_id" IS NULL OR "status" = 'handed_off');
--> statement-breakpoint
ALTER TABLE "agent_work_intents" ADD COLUMN "last_error_code" text;
--> statement-breakpoint
ALTER TABLE "explicit_session_starts" DROP CONSTRAINT "explicit_session_starts_status_ck";
--> statement-breakpoint
ALTER TABLE "explicit_session_starts" ADD CONSTRAINT "explicit_session_starts_status_ck" CHECK ("status" IN ('requested','admitted','completed','failed','cancelled'));
--> statement-breakpoint
ALTER TABLE "explicit_session_starts" ADD CONSTRAINT "explicit_session_starts_correlation_ck" CHECK (("status" = 'requested' AND "request_id" IS NULL AND "session_id" IS NULL AND "failure_code" IS NULL) OR ("status" IN ('admitted','completed') AND "request_id" IS NOT NULL AND "session_id" IS NOT NULL) OR ("status" = 'failed' AND "failure_code" IS NOT NULL) OR ("status" = 'cancelled' AND "request_id" IS NOT NULL));
--> statement-breakpoint
CREATE TABLE "task_dispatch_attempts" (
 "id" text PRIMARY KEY NOT NULL, "task_id" text NOT NULL REFERENCES "tasks"("id"),
 "occasion" text NOT NULL, "agent_id" text NOT NULL REFERENCES "users"("id"),
 "predecessor_session_id" text REFERENCES "sessions"("id"), "ordinal" integer NOT NULL,
 "status" text DEFAULT 'requested' NOT NULL, "request_id" text REFERENCES "agent_session_requests"("id"),
 "session_id" text REFERENCES "sessions"("id"), "created_at" text NOT NULL, "updated_at" text NOT NULL,
 CONSTRAINT "task_dispatch_attempts_occasion_ck" CHECK ("occasion" IN ('accepted','retry','owner_handoff')),
 CONSTRAINT "task_dispatch_attempts_status_ck" CHECK ("status" IN ('requested','running','completed','failed','cancelled'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX "task_dispatch_attempts_task_ordinal_uq" ON "task_dispatch_attempts" ("task_id","ordinal");
--> statement-breakpoint
CREATE UNIQUE INDEX "task_dispatch_attempts_occasion_uq" ON "task_dispatch_attempts" ("task_id","occasion",COALESCE("predecessor_session_id",''),"agent_id");
--> statement-breakpoint
CREATE INDEX "task_dispatch_attempts_status_idx" ON "task_dispatch_attempts" ("status","created_at");
--> statement-breakpoint
CREATE TABLE "agent_lifecycle_inbox" (
 "request_id" text PRIMARY KEY NOT NULL,
 "source_kind" text NOT NULL, "source_id" text NOT NULL, "state" text NOT NULL,
 "session_id" text, "failure_code" text, "occurred_at" text NOT NULL, "projected_at" text,
 "claim_token" text, "claim_expires_at" text, "attempts" integer DEFAULT 0 NOT NULL, "last_error" text,
 CONSTRAINT "agent_lifecycle_inbox_state_ck" CHECK ("state" IN ('completed','failed','cancelled'))
);
--> statement-breakpoint
ALTER TABLE "agent_lifecycle_inbox" ADD CONSTRAINT "agent_lifecycle_inbox_request_id_agent_session_requests_id_fk" FOREIGN KEY ("request_id") REFERENCES "agent_session_requests"("id") ON DELETE RESTRICT;
--> statement-breakpoint
ALTER TABLE "agent_lifecycle_inbox" ADD CONSTRAINT "agent_lifecycle_inbox_source_kind_ck" CHECK ("source_kind" IN ('assistant','task','knowledge','routine','decomposition','proposed_call','explicit_session_start'));
--> statement-breakpoint
ALTER TABLE "agent_lifecycle_inbox" ADD CONSTRAINT "agent_lifecycle_inbox_claim_ck" CHECK (("claim_token" IS NULL AND "claim_expires_at" IS NULL) OR ("claim_token" IS NOT NULL AND "claim_expires_at" IS NOT NULL));
--> statement-breakpoint
CREATE INDEX "agent_lifecycle_inbox_projection_idx" ON "agent_lifecycle_inbox" ("projected_at","occurred_at");
--> statement-breakpoint
CREATE INDEX "agent_work_intents_terminal_retention_idx" ON "agent_work_intents" ("updated_at") WHERE "status" IN ('handed_off','failed');
