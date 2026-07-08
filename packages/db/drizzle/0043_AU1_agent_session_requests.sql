ALTER TABLE "sessions" DROP CONSTRAINT IF EXISTS "sessions_task_id_tasks_id_fk";--> statement-breakpoint
ALTER TABLE "sessions" ALTER COLUMN "task_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "sessions" ADD COLUMN "request_id" text;--> statement-breakpoint
ALTER TABLE "sessions" ADD COLUMN "source_kind" text;--> statement-breakpoint
ALTER TABLE "sessions" ADD COLUMN "source_id" text;--> statement-breakpoint
ALTER TABLE "sessions" ADD COLUMN "source_correlation_json" text;--> statement-breakpoint
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_task_id_tasks_id_fk" FOREIGN KEY ("task_id") REFERENCES "tasks"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE TABLE "agent_session_requests" (
	"id" text PRIMARY KEY NOT NULL,
	"source_kind" text NOT NULL,
	"source_id" text NOT NULL,
	"stream_id" text NOT NULL,
	"task_id" text,
	"agent_id" text NOT NULL,
	"team_id" text,
	"user_id" text,
	"prompt_mode" text NOT NULL,
	"payload_json" text,
	"source_correlation_json" text NOT NULL,
	"idempotency_key" text NOT NULL,
	"status" text NOT NULL,
	"claimed_by" text,
	"claimed_at" text,
	"claim_expires_at" text,
	"session_id" text,
	"error_code" text,
	"error_message" text,
	"created_at" text NOT NULL,
	"updated_at" text NOT NULL
);--> statement-breakpoint
ALTER TABLE "agent_session_requests" ADD CONSTRAINT "agent_session_requests_task_id_tasks_id_fk" FOREIGN KEY ("task_id") REFERENCES "tasks"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_session_requests" ADD CONSTRAINT "agent_session_requests_agent_id_users_id_fk" FOREIGN KEY ("agent_id") REFERENCES "users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_session_requests" ADD CONSTRAINT "agent_session_requests_team_id_teams_id_fk" FOREIGN KEY ("team_id") REFERENCES "teams"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_session_requests" ADD CONSTRAINT "agent_session_requests_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "agent_session_requests_idempotency_uq" ON "agent_session_requests" USING btree ("source_kind","source_id","idempotency_key");--> statement-breakpoint
CREATE INDEX "agent_session_requests_status_created_idx" ON "agent_session_requests" USING btree ("status","created_at");--> statement-breakpoint
CREATE INDEX "agent_session_requests_source_idx" ON "agent_session_requests" USING btree ("source_kind","source_id");--> statement-breakpoint
CREATE INDEX "agent_session_requests_claim_expires_idx" ON "agent_session_requests" USING btree ("claim_expires_at");--> statement-breakpoint
CREATE INDEX "sessions_request_id_idx" ON "sessions" USING btree ("request_id");--> statement-breakpoint
CREATE INDEX "sessions_source_idx" ON "sessions" USING btree ("source_kind","source_id");
