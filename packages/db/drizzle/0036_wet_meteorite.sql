CREATE TABLE "operation_outcomes" (
	"staged_operation_id" text PRIMARY KEY NOT NULL,
	"status" text NOT NULL,
	"payload" text,
	"error" text,
	"executed_at" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "staged_operations" (
	"id" text PRIMARY KEY NOT NULL,
	"review_message_id" text NOT NULL,
	"subject_thread_id" text NOT NULL,
	"artifact_id" text NOT NULL,
	"consequence_id" text NOT NULL,
	"capability_tool" text NOT NULL,
	"capability_harness_type" text,
	"operation" text NOT NULL,
	"params" text NOT NULL,
	"idempotency_key" text NOT NULL,
	"reversibility" text NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"staged_by_agent_id" text NOT NULL,
	"created_at" text NOT NULL
);
--> statement-breakpoint
ALTER TABLE "operation_outcomes" ADD CONSTRAINT "operation_outcomes_staged_operation_id_staged_operations_id_fk" FOREIGN KEY ("staged_operation_id") REFERENCES "staged_operations"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "staged_operations" ADD CONSTRAINT "staged_operations_review_message_id_messages_id_fk" FOREIGN KEY ("review_message_id") REFERENCES "messages"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "staged_operations" ADD CONSTRAINT "staged_operations_subject_thread_id_threads_id_fk" FOREIGN KEY ("subject_thread_id") REFERENCES "threads"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "staged_operations" ADD CONSTRAINT "staged_operations_artifact_id_artifacts_id_fk" FOREIGN KEY ("artifact_id") REFERENCES "artifacts"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "staged_operations" ADD CONSTRAINT "staged_operations_staged_by_agent_id_users_id_fk" FOREIGN KEY ("staged_by_agent_id") REFERENCES "users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "staged_ops_review_msg_idx" ON "staged_operations" USING btree ("review_message_id","status");--> statement-breakpoint
CREATE INDEX "staged_ops_subject_idx" ON "staged_operations" USING btree ("subject_thread_id");--> statement-breakpoint
CREATE INDEX "staged_ops_artifact_idx" ON "staged_operations" USING btree ("artifact_id");--> statement-breakpoint
CREATE UNIQUE INDEX "staged_ops_idempotency_uq" ON "staged_operations" USING btree ("idempotency_key");