-- Artifacts become knowledge items.
--
-- An artifact was a receipt: id, producing_task_id, kind, label, preview_json,
-- created_at. No body, no status, no version, no scope, no history. It could not
-- exist without a task, was never edited, and its whole content lived in a JSON
-- preview column. A knowledge item is the same thing at a later stage of being
-- kept — and since the attachment slot landed (0077) it can hang off a task or a
-- thread, which is the one thing an artifact had that a knowledge item did not.
--
-- So the second table goes. Produced content is a knowledge item whose parent is
-- the task or the conversation that produced it. The WORD "artifact" survives as
-- the name for produced content — the `create_artifact` tool keeps its name, by
-- founder call — but nothing stores one any more.
--
-- EXISTING ROWS ARE DROPPED, NOT CONVERTED. Founder call. An artifact's content
-- lived in an untyped preview blob whose shape varied by kind; converting those
-- into markdown bodies is content-migration work this change deliberately does
-- not do. AM5 set the same pre-alpha precedent when incompatible preview shapes
-- were dropped rather than migrated.

-- 1. Threads hosted on an artifact lose their host.
--
-- `threads.host_kind`/`host_id` is an unconstrained polymorphic pair with no FK,
-- so nothing would have stopped these rows from pointing at a table that no
-- longer exists — they would simply have stopped resolving, silently, which is
-- worse than being gone. Their host is being deleted, so they go with it, and
-- their messages go with them.
DELETE FROM messages
WHERE thread_id IN (SELECT id FROM threads WHERE host_kind = 'artifact');

DELETE FROM threads WHERE host_kind = 'artifact';

-- 2. The table itself.
--
-- `producing_task_id` is NOT NULL with ON DELETE RESTRICT, which guards deletes
-- of the referenced task row; dropping the referencing table removes the
-- constraint with it.
DROP TABLE IF EXISTS artifacts;

-- 3. `tasks.artifacts` — dead, and unrelated to the table above.
--
-- A text column holding a JSON array of handoff filenames, named the same as the
-- artifacts table by accident. Verified before dropping: nothing writes it (the
-- only production task INSERT never sets it) and nothing reads it (the row is
-- selected with `*`, so the column rode along into a client type field no UI ever
-- touched). The handoff filename array it was named for never travelled through
-- here at all — it lives in the thread message payload.
ALTER TABLE tasks DROP COLUMN IF EXISTS artifacts;
