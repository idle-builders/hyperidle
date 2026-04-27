-- L4: Verdict undo + audit duality (Postgres parity of drizzle/0009).
--
-- See drizzle/0009_l4_verdict_undo.sql for the full design rationale.
ALTER TABLE "responses" ADD COLUMN "transition" text NOT NULL DEFAULT 'commit';--> statement-breakpoint
ALTER TABLE "responses" ADD COLUMN "prior_decision" text;--> statement-breakpoint
ALTER TABLE "responses" ADD COLUMN "undoes_response_id" text REFERENCES "responses"("id") ON DELETE RESTRICT;--> statement-breakpoint
ALTER TABLE "responses" ADD COLUMN "undo_window_seconds" integer;--> statement-breakpoint
ALTER TABLE "items" ADD COLUMN "agent_acted_at" text;
