-- Artifacts become knowledge items.
--
-- An artifact was a receipt: id, producing_task_id, kind, label, preview_json,
-- created_at. No body, no status, no version, no scope, no history. It could not
-- exist without a task, was never edited, and its whole content lived in a JSON
-- preview column. A knowledge item is the same thing at a later stage of being
-- kept, and since the attachment slot landed (0077) it can hang off a task or a
-- thread, which is the one thing an artifact had that a knowledge item did not.
--
-- So the second table goes. Produced content is a knowledge item whose parent is
-- the task or the conversation that produced it. The WORD "artifact" survives as
-- the name for produced content, and the create_artifact tool keeps its name by
-- founder call, but nothing stores one any more.
--
-- EXISTING ROWS ARE DROPPED, NOT CONVERTED. Founder call. An artifact's content
-- lived in an untyped preview blob whose shape varied by kind; converting those
-- into markdown bodies is content-migration work this change deliberately does
-- not do. AM5 set the same pre-alpha precedent when incompatible preview shapes
-- were dropped rather than migrated.
--
-- Threads hosted on an artifact lose their host, so they go with it, and their
-- children go with them. threads.host_kind/host_id is an unconstrained
-- polymorphic pair with no FK, so nothing would have stopped those rows from
-- pointing at a table that no longer exists; they would simply have stopped
-- resolving, silently, which is worse than being gone.
--
-- threads.id has THREE inbound foreign keys, all ON DELETE RESTRICT, and every
-- one of them has to be cleared before the thread row can go: `messages`
-- (schema.ts, notNull), `items` (notNull) and `tasks.thread_id` (nullable).
-- Clearing only messages would let a single `items` row — a proposal or review
-- posted in an artifact's discussion — abort the DELETE with a foreign-key
-- violation AFTER the messages were already gone, leaving a destructive
-- migration half applied. Order matters: children first, then the parent.
DELETE FROM items WHERE thread_id IN (SELECT id FROM threads WHERE host_kind = 'artifact');
--> statement-breakpoint
DELETE FROM messages WHERE thread_id IN (SELECT id FROM threads WHERE host_kind = 'artifact');
--> statement-breakpoint
UPDATE tasks SET thread_id = NULL WHERE thread_id IN (SELECT id FROM threads WHERE host_kind = 'artifact');
--> statement-breakpoint
DELETE FROM threads WHERE host_kind = 'artifact';
--> statement-breakpoint
DROP TABLE IF EXISTS artifacts;
--> statement-breakpoint
-- tasks.artifacts is dead, and unrelated to the table above: a text column
-- holding a JSON array of handoff filenames, named the same by accident.
-- Verified before dropping. Nothing writes it (the only production task INSERT
-- never sets it) and nothing reads it (the row is selected with *, so the column
-- rode along into a client type field no UI ever touched). The handoff filename
-- array it was named for never travelled through here at all; it lives in the
-- thread message payload.
ALTER TABLE tasks DROP COLUMN IF EXISTS artifacts;
