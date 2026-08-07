-- L20: Add propagation_log table for lifecycle propagation audit + retry.
-- This table was in the SQLite schema but missed during PG migration.

CREATE TABLE IF NOT EXISTS "propagation_log" (
	"id" text PRIMARY KEY NOT NULL,
	"source_level" text NOT NULL,
	"source_id" text NOT NULL,
	"source_event" text NOT NULL,
	"target_level" text NOT NULL,
	"target_id" text NOT NULL,
	"target_transition" text,
	"status" text NOT NULL,
	"failure_reason" text,
	"attempts" integer DEFAULT 1 NOT NULL,
	"created_at" text NOT NULL,
	"applied_at" text
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "propagation_log_source_idx" ON "propagation_log" USING btree ("source_level","source_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "propagation_log_status_idx" ON "propagation_log" USING btree ("status");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "propagation_log_created_at_idx" ON "propagation_log" USING btree ("created_at");
