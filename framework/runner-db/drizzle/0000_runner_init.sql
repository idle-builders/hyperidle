-- Runner-db initial schema: run tables and connections tables.
-- No FK to server tables (users/tasks/teams live on the server).
CREATE TABLE "sessions" (
	"id" text PRIMARY KEY NOT NULL,
	"task_id" text,
	"request_id" text,
	"source_kind" text,
	"source_id" text,
	"source_correlation_json" text,
	"agent_id" text NOT NULL,
	"model_tier" text NOT NULL,
	"started_at" text NOT NULL,
	"ended_at" text,
	"state" text NOT NULL,
	"sandbox_snapshot" text,
	"outcome" text,
	"notes" text,
	"harness_session_id" text
);
--> statement-breakpoint
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
	"claim_token" text,
	"session_id" text,
	"termination_reason" text,
	"termination_requested_at" text,
	"termination_requested_by" text,
	"error_code" text,
	"error_message" text,
	"created_at" text NOT NULL,
	"updated_at" text NOT NULL,
	CONSTRAINT "agent_session_requests_correlation_ck" CHECK (
		("status" = 'running' and "session_id" is not null)
		or ("status" = 'claimed' and "claim_token" is not null and "claim_expires_at" is not null)
		or ("status" = 'pending')
		or ("status" in ('completed', 'failed', 'cancelled') and "claim_token" is null and "claim_expires_at" is null)
	),
	CONSTRAINT "agent_session_requests_termination_reason_ck" CHECK ("termination_reason" is null or "termination_reason" in ('user_done', 'user_crashed', 'handoff', 'shutdown'))
);
--> statement-breakpoint
CREATE TABLE "review_sessions" (
	"id" text PRIMARY KEY NOT NULL,
	"review_message_id" text NOT NULL,
	"session_id" text NOT NULL,
	"created_at" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "agent_run_config" (
	"agent_user_id" text PRIMARY KEY NOT NULL,
	"harness_type" text,
	"model_id" text,
	"model_provider" text,
	"max_concurrent_sessions" integer DEFAULT 1 NOT NULL,
	"model_options_json" text,
	"space_path" text,
	"login" text DEFAULT 'owner' NOT NULL,
	CONSTRAINT "agent_run_config_login_ck" CHECK ("login" in ('own', 'owner'))
);
--> statement-breakpoint
CREATE TABLE "service_connections" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"service" text NOT NULL,
	"auth_source" text NOT NULL,
	"encrypted_token" text,
	"server_url" text,
	"health" text DEFAULT 'needs-attention' NOT NULL,
	"last_validated_at" text,
	"created_at" text NOT NULL,
	"updated_at" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "service_connection_withholds" (
	"connection_id" text NOT NULL,
	"agent_user_id" text NOT NULL,
	"created_at" text NOT NULL,
	CONSTRAINT "service_connection_withholds_connection_id_agent_user_id_pk" PRIMARY KEY("connection_id","agent_user_id")
);
--> statement-breakpoint
CREATE TABLE "agent_runner_keys" (
	"agent_id" text PRIMARY KEY NOT NULL,
	"agent_key" text NOT NULL,
	"moved_away" integer DEFAULT 0 NOT NULL,
	"created_at" text NOT NULL,
	"updated_at" text NOT NULL
);
--> statement-breakpoint
ALTER TABLE "service_connection_withholds" ADD CONSTRAINT "service_connection_withholds_connection_id_service_connections_id_fk" FOREIGN KEY ("connection_id") REFERENCES "public"."service_connections"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
CREATE INDEX "sessions_task_id_idx" ON "sessions" USING btree ("task_id");
--> statement-breakpoint
CREATE UNIQUE INDEX "sessions_request_id_uq" ON "sessions" USING btree ("request_id");
--> statement-breakpoint
CREATE INDEX "sessions_source_idx" ON "sessions" USING btree ("source_kind","source_id");
--> statement-breakpoint
CREATE INDEX "sessions_agent_id_idx" ON "sessions" USING btree ("agent_id");
--> statement-breakpoint
CREATE INDEX "sessions_state_idx" ON "sessions" USING btree ("state");
--> statement-breakpoint
CREATE UNIQUE INDEX "agent_session_requests_idempotency_uq" ON "agent_session_requests" USING btree ("source_kind","source_id","idempotency_key");
--> statement-breakpoint
CREATE INDEX "agent_session_requests_status_created_idx" ON "agent_session_requests" USING btree ("status","created_at");
--> statement-breakpoint
CREATE INDEX "agent_session_requests_source_idx" ON "agent_session_requests" USING btree ("source_kind","source_id");
--> statement-breakpoint
CREATE INDEX "agent_session_requests_claim_expires_idx" ON "agent_session_requests" USING btree ("claim_expires_at");
--> statement-breakpoint
CREATE UNIQUE INDEX "review_sessions_review_message_id_uq" ON "review_sessions" USING btree ("review_message_id");
--> statement-breakpoint
CREATE INDEX "review_sessions_session_id_idx" ON "review_sessions" USING btree ("session_id");
--> statement-breakpoint
CREATE UNIQUE INDEX "service_connections_user_service_source_idx" ON "service_connections" USING btree ("user_id","service","auth_source");
--> statement-breakpoint
CREATE INDEX "service_connections_user_idx" ON "service_connections" USING btree ("user_id");
