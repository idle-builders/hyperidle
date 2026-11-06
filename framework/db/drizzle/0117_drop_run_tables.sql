-- Run tables move to runner-db. The server DB no longer owns session lifecycle,
-- service connections, or agent run config — the runner process owns them.

-- Drop referencing tables first (outbound FKs to tables being dropped).
DROP TABLE "service_connection_withholds";
--> statement-breakpoint

DROP TABLE "review_sessions";
--> statement-breakpoint

-- The occasion unique index references predecessor_session_id — drop it before
-- dropping the column.
DROP INDEX "task_dispatch_attempts_occasion_uq";
--> statement-breakpoint

-- Drop FK columns that reference the tables being dropped.
-- Dropping a column automatically drops any FK constraint it holds.
ALTER TABLE "task_dispatch_attempts" DROP COLUMN "predecessor_session_id";
--> statement-breakpoint
ALTER TABLE "task_dispatch_attempts" DROP COLUMN "request_id";
--> statement-breakpoint
ALTER TABLE "task_dispatch_attempts" DROP COLUMN "session_id";
--> statement-breakpoint

-- No surviving table now references these as FK targets.
DROP TABLE "sessions";
--> statement-breakpoint
DROP TABLE "agent_session_requests";
--> statement-breakpoint
DROP TABLE "service_connections";
--> statement-breakpoint
DROP TABLE "agent_run_config";
