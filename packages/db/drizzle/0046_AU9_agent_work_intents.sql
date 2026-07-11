CREATE TABLE "agent_work_intents" (
	"id" text PRIMARY KEY NOT NULL,
	"kind" text NOT NULL,
	"source_kind" text NOT NULL,
	"source_id" text NOT NULL,
	"actor_id" text,
	"idempotency_key" text NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"claim_token" text,
	"claim_expires_at" text,
	"request_id" text REFERENCES "agent_session_requests"("id"),
	"attempts" integer DEFAULT 0 NOT NULL,
	"last_error" text,
	"created_at" text NOT NULL,
	"updated_at" text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX "agent_work_intents_identity_uq" ON "agent_work_intents" USING btree ("kind", "source_id", "idempotency_key");
--> statement-breakpoint
CREATE INDEX "agent_work_intents_status_created_idx" ON "agent_work_intents" USING btree ("status", "created_at");
--> statement-breakpoint
CREATE INDEX "agent_work_intents_claim_expires_idx" ON "agent_work_intents" USING btree ("claim_expires_at");
--> statement-breakpoint
CREATE TABLE "explicit_session_starts" (
	"id" text PRIMARY KEY NOT NULL,
	"task_id" text NOT NULL REFERENCES "tasks"("id"),
	"requested_agent_id" text NOT NULL,
	"requested_model_tier" text NOT NULL,
	"requested_by" text NOT NULL REFERENCES "users"("id"),
	"idempotency_key" text NOT NULL,
	"status" text DEFAULT 'requested' NOT NULL,
	"request_id" text REFERENCES "agent_session_requests"("id"),
	"session_id" text REFERENCES "sessions"("id"),
	"failure_code" text,
	"created_at" text NOT NULL,
	"updated_at" text NOT NULL,
	CONSTRAINT "explicit_session_starts_model_tier_ck" CHECK ("requested_model_tier" in ('reasoning','workhorse','fast')),
	CONSTRAINT "explicit_session_starts_status_ck" CHECK ("status" in ('requested','admitted','failed','cancelled'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX "explicit_session_starts_requester_key_uq" ON "explicit_session_starts" USING btree ("requested_by", "idempotency_key");
--> statement-breakpoint
CREATE INDEX "explicit_session_starts_status_idx" ON "explicit_session_starts" USING btree ("status", "created_at");
