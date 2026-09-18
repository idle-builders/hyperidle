-- BC3: thread as a module. architecture.md §4. Steps are ordered; a later
-- one depends on an earlier one.

-- 1. a thread gets its own title and a soft delete.
ALTER TABLE "threads" ADD COLUMN "title" text;
--> statement-breakpoint
ALTER TABLE "threads" ADD COLUMN "deleted_at" text;
--> statement-breakpoint

-- 2. a post is its own kind of change (plan.md Confusion 1).
ALTER TABLE "changes" DROP CONSTRAINT "changes_kind_ck";
--> statement-breakpoint
ALTER TABLE "changes" ADD CONSTRAINT "changes_kind_ck"
  CHECK ("kind" in ('created','changed','message'));
--> statement-breakpoint

-- 3. a task that already has a task-hosted thread keeps it. Oldest wins when
--    several exist — nothing forbade a second one, so pick deterministically.
UPDATE "tasks" t SET "thread_id" = (
  SELECT th."id" FROM "threads" th
  WHERE th."host_kind" = 'task' AND th."host_id" = t."id"
  ORDER BY th."created_at" ASC, th."id" ASC LIMIT 1)
WHERE t."thread_id" IS NULL
  AND EXISTS (SELECT 1 FROM "threads" th2
              WHERE th2."host_kind" = 'task' AND th2."host_id" = t."id");
--> statement-breakpoint

-- 4. every remaining task gets one. Deterministic id so a re-run is a no-op.
--    Host is the task's TEAM: a task conversation belongs to the team that owns
--    the task, `host_kind` stays NOT NULL with no new vocabulary, and it matches
--    what `edit_task` passes for a task created after this migration (§3.9).
--
--    INTENDED MEMBERSHIP, stated so it can be re-derived rather than copied:
--    the task's owner agent when it has one, plus the first human by
--    (created_at, id) when one exists. Both, not one. Zero members is legal and
--    produces '[]': the thread is host-scoped ('team'), so anyone signed in can
--    still read it and the first person to post joins it (§3.4). A task nobody
--    owns in a database with no humans is not a dead thread, just an empty one.
WITH seed AS (
  SELECT t."id" AS task_id, t."team_id", t."created_at", t."updated_at",
         t."owner_agent_id",
         (SELECT u."id" FROM "users" u WHERE u."kind" = 'human'
          ORDER BY u."created_at" ASC, u."id" ASC LIMIT 1) AS human_id
  FROM "tasks" t WHERE t."thread_id" IS NULL
)
INSERT INTO "threads"
  ("id","host_kind","host_id","initiator_id","participants","pinned","last_active_at","created_at")
SELECT 'thr-' || s.task_id, 'team', s."team_id",
       COALESCE(s."owner_agent_id", s.human_id, 'system:propagation'),
       COALESCE(
         (SELECT json_agg(m)::text FROM (
            SELECT s."owner_agent_id" AS m WHERE s."owner_agent_id" IS NOT NULL
            UNION
            SELECT s.human_id AS m WHERE s.human_id IS NOT NULL) u),
         '[]'),
       false, s."updated_at", s."created_at"
FROM seed s;
--> statement-breakpoint

UPDATE "tasks" SET "thread_id" = 'thr-' || "id" WHERE "thread_id" IS NULL;
--> statement-breakpoint

-- 5. the column becomes real. Guard first — a silent NULL here is a broken app.
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM "tasks" WHERE "thread_id" IS NULL) THEN
    RAISE EXCEPTION '0085: % tasks still have no thread',
      (SELECT count(*) FROM "tasks" WHERE "thread_id" IS NULL);
  END IF;
END $$;
--> statement-breakpoint
ALTER TABLE "tasks" ALTER COLUMN "thread_id" SET NOT NULL;
--> statement-breakpoint

-- 6. items die, and the pointer at them with it. Destructive, no compat column.
ALTER TABLE "messages" DROP COLUMN "legacy_item_id";
--> statement-breakpoint
DROP TABLE "items";
--> statement-breakpoint

-- 7. no thread is hosted by a task any more. A thread a task now claims is
--    re-hosted onto that task's team; an orphan (no task claims it) onto its
--    initiator, which is always a real identity.
UPDATE "threads" th SET "host_kind" = 'team', "host_id" = t."team_id"
FROM "tasks" t WHERE th."host_kind" = 'task' AND t."thread_id" = th."id";
--> statement-breakpoint
UPDATE "threads" SET "host_kind" = 'user', "host_id" = "initiator_id"
WHERE "host_kind" = 'task';
--> statement-breakpoint
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM "threads" WHERE "host_kind" = 'task') THEN
    RAISE EXCEPTION '0085: threads still hosted by a task';
  END IF;
END $$;
--> statement-breakpoint

-- 8. the intent kind says what it is. Same three constraints 0078 wrote.
UPDATE "agent_work_intents" SET "kind" = 'thread_turn' WHERE "kind" = 'assistant_turn';
--> statement-breakpoint
ALTER TABLE "agent_work_intents" DROP CONSTRAINT "agent_work_intents_kind_ck";
--> statement-breakpoint
ALTER TABLE "agent_work_intents" DROP CONSTRAINT "agent_work_intents_kind_source_compat_ck";
--> statement-breakpoint
ALTER TABLE "agent_work_intents" ADD CONSTRAINT "agent_work_intents_kind_ck"
  CHECK ("kind" in ('thread_turn','session_start','knowledge_action','routine_run','task_run','session_resume'));
--> statement-breakpoint
ALTER TABLE "agent_work_intents" ADD CONSTRAINT "agent_work_intents_kind_source_compat_ck" CHECK (
     ("kind" = 'thread_turn'      and "source_kind" = 'thread_message')
  or ("kind" = 'session_start'    and "source_kind" = 'explicit_session_start')
  or ("kind" = 'knowledge_action' and "source_kind" = 'knowledge_action')
  or ("kind" = 'routine_run'      and "source_kind" = 'routine_run')
  or ("kind" = 'task_run'         and "source_kind" = 'task_dispatch_attempt')
  or ("kind" = 'session_resume'   and "source_kind" = 'review_verdict'));
