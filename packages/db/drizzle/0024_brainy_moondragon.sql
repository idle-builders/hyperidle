ALTER TABLE "routine_runs" ADD COLUMN "session_id" text;--> statement-breakpoint
ALTER TABLE "routine_runs" ADD COLUMN "summary" text;--> statement-breakpoint
ALTER TABLE "routines" ADD COLUMN "deleted_at" text;--> statement-breakpoint
ALTER TABLE "routines" ADD COLUMN "last_run_summary" text;--> statement-breakpoint
ALTER TABLE "routines" ADD COLUMN "cost_cap_per_run_minor" integer;--> statement-breakpoint
ALTER TABLE "routines" ADD COLUMN "created_at" text;--> statement-breakpoint
ALTER TABLE "routines" ADD COLUMN "stub_task_id" text;--> statement-breakpoint
CREATE INDEX "routine_runs_session_id_idx" ON "routine_runs" USING btree ("session_id");--> statement-breakpoint
CREATE INDEX "routines_deleted_at_idx" ON "routines" USING btree ("deleted_at");