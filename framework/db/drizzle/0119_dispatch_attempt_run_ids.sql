-- Restore request_id and session_id on task_dispatch_attempts as plain text.
-- Migration 0117 dropped them as FK columns (the FK targets moved to runner-db).
-- The plan keeps them as plain ids so the server can track which runner session
-- worked each attempt without a cross-database link.
ALTER TABLE "task_dispatch_attempts" ADD COLUMN "request_id" text;
--> statement-breakpoint
ALTER TABLE "task_dispatch_attempts" ADD COLUMN "session_id" text;
