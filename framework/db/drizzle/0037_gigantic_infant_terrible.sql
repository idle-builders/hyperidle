-- Drop v1 kernel-executor tables (pre-implementation, no prod rows).
-- Replaces staged_operations → proposed_calls; operation_outcomes FK renamed; adds tailored_grants.
DROP TABLE IF EXISTS "operation_outcomes";
--> statement-breakpoint
DROP TABLE IF EXISTS "staged_operations";
--> statement-breakpoint
CREATE TABLE "operation_outcomes" (
	"proposed_call_id" text PRIMARY KEY NOT NULL,
	"status" text NOT NULL,
	"receipt" text,
	"error" text,
	"executed_at" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "proposed_calls" (
	"id" text PRIMARY KEY NOT NULL,
	"review_message_id" text NOT NULL,
	"subject_thread_id" text NOT NULL,
	"artifact_id" text NOT NULL,
	"origin_session_id" text NOT NULL,
	"tool_id" text NOT NULL,
	"args" text NOT NULL,
	"identity_hash" text NOT NULL,
	"reversibility" text NOT NULL,
	"status" text DEFAULT 'captured' NOT NULL,
	"staged_by_agent_id" text NOT NULL,
	"created_at" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "tailored_grants" (
	"proposed_call_id" text PRIMARY KEY NOT NULL,
	"task_scope" text NOT NULL,
	"agent_scope" text NOT NULL,
	"approved_tool_id" text NOT NULL,
	"approved_args" text NOT NULL,
	"arg_pinned" boolean DEFAULT false NOT NULL,
	"identity_hash" text,
	"consumed" boolean DEFAULT false NOT NULL,
	"retry_count" integer DEFAULT 0 NOT NULL,
	"minted_at" text NOT NULL,
	"consumed_at" text
);
--> statement-breakpoint
ALTER TABLE "operation_outcomes" ADD CONSTRAINT "operation_outcomes_proposed_call_id_proposed_calls_id_fk" FOREIGN KEY ("proposed_call_id") REFERENCES "proposed_calls"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "proposed_calls" ADD CONSTRAINT "proposed_calls_review_message_id_messages_id_fk" FOREIGN KEY ("review_message_id") REFERENCES "messages"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "proposed_calls" ADD CONSTRAINT "proposed_calls_subject_thread_id_threads_id_fk" FOREIGN KEY ("subject_thread_id") REFERENCES "threads"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "proposed_calls" ADD CONSTRAINT "proposed_calls_artifact_id_artifacts_id_fk" FOREIGN KEY ("artifact_id") REFERENCES "artifacts"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "proposed_calls" ADD CONSTRAINT "proposed_calls_staged_by_agent_id_users_id_fk" FOREIGN KEY ("staged_by_agent_id") REFERENCES "users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tailored_grants" ADD CONSTRAINT "tailored_grants_proposed_call_id_proposed_calls_id_fk" FOREIGN KEY ("proposed_call_id") REFERENCES "proposed_calls"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "proposed_calls_review_msg_idx" ON "proposed_calls" USING btree ("review_message_id","status");--> statement-breakpoint
CREATE INDEX "proposed_calls_subject_idx" ON "proposed_calls" USING btree ("subject_thread_id");--> statement-breakpoint
CREATE INDEX "proposed_calls_artifact_idx" ON "proposed_calls" USING btree ("artifact_id");--> statement-breakpoint
CREATE UNIQUE INDEX "proposed_calls_capture_uq" ON "proposed_calls" USING btree ("origin_session_id","identity_hash");--> statement-breakpoint
CREATE INDEX "grant_match_idx" ON "tailored_grants" USING btree ("task_scope","agent_scope","approved_tool_id","consumed");