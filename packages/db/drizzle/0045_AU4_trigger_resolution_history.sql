CREATE TABLE "trigger_resolution_history" (
	"id" text PRIMARY KEY NOT NULL,
	"source_kind" text NOT NULL,
	"source_id" text NOT NULL,
	"stream_id" text NOT NULL,
	"event_type" text NOT NULL,
	"result" text NOT NULL,
	"trigger_key" text,
	"trigger_source" text NOT NULL,
	"chosen_agent_id" text,
	"prompt_source" text,
	"request_id" text,
	"session_id" text,
	"resolution_json" text NOT NULL,
	"created_at" text NOT NULL
);--> statement-breakpoint
ALTER TABLE "trigger_resolution_history" ADD CONSTRAINT "trigger_resolution_history_chosen_agent_id_users_id_fk" FOREIGN KEY ("chosen_agent_id") REFERENCES "users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "trigger_resolution_history" ADD CONSTRAINT "trigger_resolution_history_request_id_agent_session_requests_id_fk" FOREIGN KEY ("request_id") REFERENCES "agent_session_requests"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "trigger_resolution_history_source_idx" ON "trigger_resolution_history" USING btree ("source_kind","source_id");--> statement-breakpoint
CREATE INDEX "trigger_resolution_history_request_idx" ON "trigger_resolution_history" USING btree ("request_id");--> statement-breakpoint
CREATE INDEX "trigger_resolution_history_session_idx" ON "trigger_resolution_history" USING btree ("session_id");
