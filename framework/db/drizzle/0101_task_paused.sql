-- A person pauses a task and every part of it not done: "hold" lets the agents finish what they
-- are doing and then wait; "stopped" stops the running sessions at once. The state stays as it
-- was, so lifting the pause picks the work up there. Starting again after a stop sends each agent
-- back to the part it was working on: a "restart" dispatch, which may happen once per stop, so it
-- is left out of the one-dispatch-per-occasion index.

ALTER TABLE "tasks" ADD COLUMN "paused" text;
--> statement-breakpoint

ALTER TABLE "tasks" ADD CONSTRAINT "tasks_paused_ck" CHECK ("paused" IS NULL OR "paused" IN ('hold','stopped'));
--> statement-breakpoint

ALTER TABLE "task_dispatch_attempts" DROP CONSTRAINT "task_dispatch_attempts_occasion_ck";
--> statement-breakpoint

ALTER TABLE "task_dispatch_attempts" ADD CONSTRAINT "task_dispatch_attempts_occasion_ck" CHECK ("occasion" IN ('accepted','retry','owner_handoff','restart'));
--> statement-breakpoint

DROP INDEX "task_dispatch_attempts_occasion_uq";
--> statement-breakpoint

CREATE UNIQUE INDEX "task_dispatch_attempts_occasion_uq" ON "task_dispatch_attempts" ("task_id","occasion",COALESCE("predecessor_session_id",''),"agent_id") WHERE "occasion" <> 'restart';
