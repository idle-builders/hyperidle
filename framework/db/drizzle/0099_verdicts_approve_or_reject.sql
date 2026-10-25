-- A verdict on a review is approve or reject; asking for a change is a comment.
-- Rewrites every stored verdict decision outside that pair, in messages and in
-- the thread history (changes rows that carry a verdict message):
--   approve-with-comments → approve (note kept)
--   edit                  → approve (note kept)
--   request-changes       → reject, note kept, or "Changes requested." when it had none
-- Then refuses to finish if any other decision survives.

UPDATE "messages"
SET "payload" = jsonb_set("payload"::jsonb, '{decision}', '"approve"')::text
WHERE "type" = 'verdict'
  AND "payload"::jsonb ->> 'decision' IN ('approve-with-comments', 'edit');
--> statement-breakpoint

UPDATE "messages"
SET "payload" = (
    "payload"::jsonb
    || jsonb_build_object(
        'decision', 'reject',
        'note', COALESCE(NULLIF(btrim("payload"::jsonb ->> 'note'), ''), 'Changes requested.')
    )
)::text
WHERE "type" = 'verdict'
  AND "payload"::jsonb ->> 'decision' = 'request-changes';
--> statement-breakpoint

UPDATE "changes"
SET "after" = jsonb_set("after"::jsonb, '{payload,decision}', '"approve"')::text
WHERE "object" = 'thread'
  AND "kind" = 'message'
  AND "after"::jsonb ->> 'type' = 'verdict'
  AND "after"::jsonb -> 'payload' ->> 'decision' IN ('approve-with-comments', 'edit');
--> statement-breakpoint

UPDATE "changes"
SET "after" = jsonb_set(
    "after"::jsonb,
    '{payload}',
    ("after"::jsonb -> 'payload')
    || jsonb_build_object(
        'decision', 'reject',
        'note', COALESCE(NULLIF(btrim("after"::jsonb -> 'payload' ->> 'note'), ''), 'Changes requested.')
    )
)::text
WHERE "object" = 'thread'
  AND "kind" = 'message'
  AND "after"::jsonb ->> 'type' = 'verdict'
  AND "after"::jsonb -> 'payload' ->> 'decision' = 'request-changes';
--> statement-breakpoint

UPDATE "changes"
SET "before" = jsonb_set("before"::jsonb, '{payload,decision}', '"approve"')::text
WHERE "object" = 'thread'
  AND "kind" = 'message'
  AND "before" IS NOT NULL
  AND "before"::jsonb ->> 'type' = 'verdict'
  AND "before"::jsonb -> 'payload' ->> 'decision' IN ('approve-with-comments', 'edit');
--> statement-breakpoint

UPDATE "changes"
SET "before" = jsonb_set(
    "before"::jsonb,
    '{payload}',
    ("before"::jsonb -> 'payload')
    || jsonb_build_object(
        'decision', 'reject',
        'note', COALESCE(NULLIF(btrim("before"::jsonb -> 'payload' ->> 'note'), ''), 'Changes requested.')
    )
)::text
WHERE "object" = 'thread'
  AND "kind" = 'message'
  AND "before" IS NOT NULL
  AND "before"::jsonb ->> 'type' = 'verdict'
  AND "before"::jsonb -> 'payload' ->> 'decision' = 'request-changes';
--> statement-breakpoint

DO $$
DECLARE bad_count int;
BEGIN
    SELECT COUNT(*) INTO bad_count
    FROM "messages"
    WHERE "type" = 'verdict'
      AND "payload"::jsonb ? 'decision'
      AND "payload"::jsonb ->> 'decision' NOT IN ('approve', 'reject');
    IF bad_count > 0 THEN
        RAISE EXCEPTION 'Migration 0099: % verdict message(s) still carry a decision other than approve or reject — aborting', bad_count;
    END IF;

    SELECT COUNT(*) INTO bad_count
    FROM "changes"
    WHERE "object" = 'thread'
      AND "kind" = 'message'
      AND (
        ("after"::jsonb ->> 'type' = 'verdict'
          AND "after"::jsonb -> 'payload' ? 'decision'
          AND "after"::jsonb -> 'payload' ->> 'decision' NOT IN ('approve', 'reject'))
        OR ("before" IS NOT NULL
          AND "before"::jsonb ->> 'type' = 'verdict'
          AND "before"::jsonb -> 'payload' ? 'decision'
          AND "before"::jsonb -> 'payload' ->> 'decision' NOT IN ('approve', 'reject'))
      );
    IF bad_count > 0 THEN
        RAISE EXCEPTION 'Migration 0099: % thread history row(s) still carry a verdict decision other than approve or reject — aborting', bad_count;
    END IF;
END $$;
