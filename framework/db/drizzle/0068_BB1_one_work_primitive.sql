-- BB1: bets and tasks become one recursive task.
--
-- Every bet becomes a ROOT task (parent_task_id IS NULL) and its tasks become
-- that root's children. Nothing is kept alongside the new shape: `bets` is
-- dropped in this same migration, per the project's destructive-migration rule.
--
-- A bet KEEPS ITS OWN ID as the root task. It is the same piece of work under a
-- new primitive, so it keeps its identity — which means nothing that referenced
-- a bet by id has to be rewritten: knowledge scopes, threads and the app
-- projection all still point at the right row, and a bookmarked URL still
-- resolves. Only the KIND strings change ('bet' -> 'task'). Step 2 asserts the
-- id spaces do not collide rather than assuming it.
--
-- Order matters. The root tasks must exist before `tasks.parent_task_id` can
-- point at them, and `tasks.bet_id` must still exist while it is being read to
-- find each task's new parent. So: add columns, insert roots, rewire children,
-- flip the kind strings, then drop.

-- 1. The new columns. `parent_task_id` is nullable — that IS the root marker.
--
-- `bet_id` must lose its NOT NULL first: the root tasks inserted in step 3 have
-- no bet (they ARE the bets), and the column is still present at that point
-- because step 4 reads it to find each child's new parent.
ALTER TABLE tasks ALTER COLUMN bet_id DROP NOT NULL;
--> statement-breakpoint
ALTER TABLE tasks ADD COLUMN parent_task_id text;
--> statement-breakpoint
ALTER TABLE tasks ADD COLUMN tokens_actual_json text;
--> statement-breakpoint
ALTER TABLE tasks ADD COLUMN source_knowledge_item_id text;
--> statement-breakpoint
ALTER TABLE tasks ADD COLUMN completed_at text;
--> statement-breakpoint
ALTER TABLE tasks ADD COLUMN outcome_summary text;
--> statement-breakpoint

-- 2. Refuse to run if a bet id already names a task. Both are UUIDs, so this
--    cannot happen in practice — but "cannot happen" is not a reason to
--    overwrite a row, and the alternative to checking is silent data loss.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM bets b JOIN tasks t ON t.id = b.id) THEN
    RAISE EXCEPTION 'BB1: a bet id collides with an existing task id';
  END IF;
END $$;
--> statement-breakpoint

-- 3. Every bet becomes a root task, keeping its id.
--
-- `title` is the one lossy field: bets have no title column, and the API derived
-- a display string from the description's first meaningful line. That derivation
-- happens here, ONCE, and then the helper is deleted — every task from now on
-- has a real title. Reproduced from `deriveTitle` (bet-title.ts): first
-- non-empty line, strip leading markdown heading markers, truncate to 60 chars,
-- fall back to the id.
--
-- State mapping (bet status -> task state), per BB1 plan §3:
--   draft -> proposed | active -> in_progress | completed -> done | killed -> killed
--
-- Outcome verdict mapping: the bet vocabulary is cut, so its four values fold
-- into the surviving task vocabulary. `inconclusive` has no honest equivalent —
-- it becomes NULL (not evaluated) rather than being forced into a verdict it
-- does not mean.
--
-- `revision_log` folds into `notes`: tasks already carry `audit_trail` for
-- structured transitions, and the bet's revision prose is the same kind of thing
-- a task's notes hold. Nothing is discarded.
INSERT INTO tasks (
  id, parent_task_id, team_id, owner_agent_id, title, description, done_condition,
  state, dependencies, artifacts, thread_id, notes, audit_trail,
  outcome_verdict, outcome_summary, outcome_recorded_at, outcome_recorded_by,
  tokens_actual_json, source_knowledge_item_id, completed_at,
  created_at, updated_at
)
SELECT
  b.id,
  NULL,
  b.team_id,
  NULL,
  COALESCE(
    NULLIF(
      LEFT(
        regexp_replace(
          (regexp_match(b.description, '(?n)^[[:space:]]*(\S.*)$'))[1],
          '^#{1,6}[[:space:]]+', ''
        ),
        60
      ),
      ''
    ),
    b.id
  ),
  b.description,
  b.done_condition,
  CASE b.status
    WHEN 'draft'     THEN 'proposed'
    WHEN 'active'    THEN 'in_progress'
    WHEN 'completed' THEN 'done'
    WHEN 'killed'    THEN 'killed'
  END,
  NULL,
  NULL,
  NULL,
  b.revision_log,
  NULL,
  CASE b.outcome_verdict
    WHEN 'validated' THEN 'met'
    WHEN 'partial'   THEN 'partially_met'
    WHEN 'refuted'   THEN 'not_met'
    ELSE NULL
  END,
  b.outcome_summary,
  b.outcome_recorded_at,
  b.outcome_recorded_by,
  b.tokens_actual_json,
  b.source_knowledge_item_id,
  b.completed_at,
  b.created_at,
  b.created_at
FROM bets b;
--> statement-breakpoint

-- 4. Existing tasks become children of the root their bet turned into. Because
--    the root kept the bet's id, the parent id IS the old bet id.
UPDATE tasks SET parent_task_id = bet_id WHERE bet_id IS NOT NULL;
--> statement-breakpoint

-- 5. The kind strings. Ids are unchanged, so this is the whole rewire.
UPDATE knowledge_items SET scope_kind = 'task' WHERE scope_kind = 'bet';
--> statement-breakpoint

-- A thread's host is immutable at the database level (trigger
-- `threads_host_immutable_trg`, migration 0007). That invariant is not being
-- broken here — the thread is about the same piece of work, and only the name of
-- the primitive changed. Migration 0007's own note calls a migration the
-- sanctioned way through: the host "cannot drift ... without a deliberate
-- migration". Suspend the trigger for this one statement and restore it
-- immediately, so every other path stays guarded.
ALTER TABLE threads DISABLE TRIGGER threads_host_immutable_trg;
--> statement-breakpoint
UPDATE threads SET host_kind = 'task' WHERE host_kind = 'bet';
--> statement-breakpoint
ALTER TABLE threads ENABLE TRIGGER threads_host_immutable_trg;
--> statement-breakpoint

-- 6. Assert the migration did not silently lose anything, BEFORE the
--    irreversible drops. A migration that passes its own test but corrupts a
--    real database is the failure mode this guards.
DO $$
DECLARE
  bet_count bigint;
  root_count bigint;
  orphan_count bigint;
BEGIN
  SELECT count(*) INTO bet_count FROM bets;
  SELECT count(*) INTO root_count FROM tasks WHERE parent_task_id IS NULL;
  IF bet_count <> root_count THEN
    RAISE EXCEPTION 'BB1: % bets produced % root tasks', bet_count, root_count;
  END IF;

  -- Every task that had a bet must now have a parent that exists.
  SELECT count(*) INTO orphan_count
  FROM tasks t
  WHERE t.bet_id IS NOT NULL
    AND NOT EXISTS (SELECT 1 FROM tasks p WHERE p.id = t.parent_task_id);
  IF orphan_count > 0 THEN
    RAISE EXCEPTION 'BB1: % tasks have no parent after backfill', orphan_count;
  END IF;

  -- No task may be its own parent.
  IF EXISTS (SELECT 1 FROM tasks WHERE parent_task_id = id) THEN
    RAISE EXCEPTION 'BB1: a task is its own parent';
  END IF;
END $$;
--> statement-breakpoint

-- 7. Drop the old shape. No compat layer, no alias, no dual-write.
ALTER TABLE tasks DROP CONSTRAINT IF EXISTS tasks_bet_id_bets_id_fk;
--> statement-breakpoint
DROP INDEX IF EXISTS tasks_bet_id_idx;
--> statement-breakpoint
ALTER TABLE tasks DROP COLUMN bet_id;
--> statement-breakpoint
DROP TABLE bets;
--> statement-breakpoint

-- 8. The stored WIP tally goes with the commit ceremony that maintained it. The
--    limit itself survives on `teams.capacity`, counted live against
--    `state = 'in_progress'`.
ALTER TABLE teams DROP COLUMN active_bets;
--> statement-breakpoint

-- 9. Constraints and indexes for the new shape.
ALTER TABLE tasks ADD CONSTRAINT tasks_parent_task_id_tasks_id_fk
  FOREIGN KEY (parent_task_id) REFERENCES tasks(id) ON DELETE RESTRICT;
--> statement-breakpoint
ALTER TABLE tasks ADD CONSTRAINT tasks_source_knowledge_item_id_knowledge_items_id_fk
  FOREIGN KEY (source_knowledge_item_id) REFERENCES knowledge_items(id) ON DELETE RESTRICT;
--> statement-breakpoint
CREATE INDEX tasks_parent_task_id_idx ON tasks (parent_task_id);
