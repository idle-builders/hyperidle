-- A review is made of parts (preview, code, image, numbers, text, items) and its sender's flags;
-- a comment points into a part with an anchor. Rewrites what is stored in the old shape, in
-- messages and in the thread history (changes rows that carry a message):
--   review.artifacts, the nine canvas kinds, become review.parts:
--     browser_preview with a web address  → preview
--     code_diff with readable files       → code
--     metrics_moved with headline figures → numbers
--     rendered_in_context with a body     → text, its subject kept
--     anything else                       → text carrying the canvas's own words
--   a plain message's blockId (+ spotLabel) → anchor { id: the message's id, part: blockId, label }
--   a spotLabel alone                       → "On <spot>: " ahead of the text
--   an inline reference to a canvas         → dropped
-- Then drops messages.block_id, and refuses to finish if any old shape survives.

CREATE FUNCTION "m0103_part"(a jsonb, i bigint) RETURNS jsonb LANGUAGE plpgsql AS $$
DECLARE
    k text := COALESCE(a->>'kind', 'canvas');
    p jsonb := CASE WHEN jsonb_typeof(a->'payload') = 'object' THEN a->'payload' ELSE '{}'::jsonb END;
    base jsonb := jsonb_build_object(
        'id', left(COALESCE(NULLIF(btrim(a->>'id'), ''), 'part-' || i), 64),
        'title', left(COALESCE(NULLIF(btrim(a->>'title'), ''), 'Untitled'), 256)
    );
    body text;
BEGIN
    IF k = 'browser_preview' AND jsonb_typeof(p->'url') = 'string' AND p->>'url' ~* '^https?://' THEN
        RETURN base || jsonb_build_object('kind', 'preview', 'label', 'Live preview', 'url', p->>'url');
    END IF;

    IF k = 'code_diff'
        AND jsonb_typeof(p->'files') = 'array'
        AND jsonb_array_length(p->'files') BETWEEN 1 AND 50
        AND (SELECT count(DISTINCT f->>'path') = count(*) FROM jsonb_array_elements(p->'files') f)
        AND NOT EXISTS (
            SELECT 1 FROM jsonb_array_elements(p->'files') f
            WHERE jsonb_typeof(f->'path') IS DISTINCT FROM 'string'
                OR jsonb_typeof(f->'hunks') IS DISTINCT FROM 'array'
                OR jsonb_array_length(f->'hunks') NOT BETWEEN 1 AND 50
                OR EXISTS (
                    SELECT 1 FROM jsonb_array_elements(f->'hunks') h
                    WHERE jsonb_typeof(h->'lines') IS DISTINCT FROM 'array'
                        OR jsonb_array_length(h->'lines') NOT BETWEEN 1 AND 400
                        OR EXISTS (
                            SELECT 1 FROM jsonb_array_elements(h->'lines') l
                            WHERE COALESCE(l->>'kind', '') NOT IN ('add', 'del', 'ctx')
                                OR CASE
                                    WHEN jsonb_typeof(CASE WHEN l->>'kind' = 'del' THEN l->'oldNo' ELSE l->'newNo' END) = 'number'
                                    THEN (CASE WHEN l->>'kind' = 'del' THEN l->>'oldNo' ELSE l->>'newNo' END)::numeric < 1
                                    ELSE true
                                END
                        )
                )
        )
    THEN
        RETURN base || jsonb_build_object('kind', 'code', 'label', 'Code', 'files', (
            SELECT jsonb_agg(jsonb_build_object('path', f->>'path', 'hunks', (
                SELECT jsonb_agg(jsonb_build_object('lines', (
                    SELECT jsonb_agg(jsonb_build_object(
                        'op', CASE l->>'kind' WHEN 'ctx' THEN 'same' ELSE l->>'kind' END,
                        'n', trunc((CASE WHEN l->>'kind' = 'del' THEN l->>'oldNo' ELSE l->>'newNo' END)::numeric)::int,
                        'text', left(COALESCE(l->>'text', ''), 2000)
                    ) ORDER BY li)
                    FROM jsonb_array_elements(h->'lines') WITH ORDINALITY AS ls(l, li)
                )) ORDER BY hi)
                FROM jsonb_array_elements(f->'hunks') WITH ORDINALITY AS hs(h, hi)
            )) ORDER BY fi)
            FROM jsonb_array_elements(p->'files') WITH ORDINALITY AS fs(f, fi)
        ));
    END IF;

    IF k = 'metrics_moved'
        AND jsonb_typeof(p->'headlines') = 'array'
        AND jsonb_array_length(p->'headlines') BETWEEN 1 AND 24
        AND (SELECT count(DISTINCT h->>'label') = count(*) FROM jsonb_array_elements(p->'headlines') h)
        AND NOT EXISTS (
            SELECT 1 FROM jsonb_array_elements(p->'headlines') h
            WHERE jsonb_typeof(h->'label') IS DISTINCT FROM 'string'
                OR btrim(h->>'label') = ''
                OR jsonb_typeof(h->'current') IS DISTINCT FROM 'number'
        )
    THEN
        RETURN base || jsonb_build_object('kind', 'numbers', 'label', 'Numbers', 'figures', (
            SELECT jsonb_agg(
                jsonb_build_object('label', left(h->>'label', 128), 'value', h->>'current')
                || CASE
                    WHEN jsonb_typeof(h->'prior') = 'number' THEN jsonb_build_object(
                        'change',
                        CASE WHEN (h->>'current')::numeric >= (h->>'prior')::numeric THEN '+' ELSE '' END
                            || ((h->>'current')::numeric - (h->>'prior')::numeric)::text
                    )
                    ELSE '{}'::jsonb
                END
                ORDER BY hi)
            FROM jsonb_array_elements(p->'headlines') WITH ORDINALITY AS hs(h, hi)
        ));
    END IF;

    IF k = 'rendered_in_context' AND jsonb_typeof(p->'body') = 'string' AND btrim(p->>'body') <> '' THEN
        RETURN base
            || jsonb_build_object('kind', 'text', 'label', 'Email', 'body', left(p->>'body', 20000))
            || CASE
                WHEN jsonb_typeof(p->'inboxRow'->'subject') = 'string'
                THEN jsonb_build_object('subject', left(p->'inboxRow'->>'subject', 512))
                ELSE '{}'::jsonb
            END;
    END IF;

    body := CASE
        WHEN k = 'outcome_summary' AND jsonb_typeof(p->'achieved') = 'string' AND btrim(p->>'achieved') <> ''
            THEN p->>'achieved'
        WHEN p = '{}'::jsonb THEN 'Nothing was stored with this part.'
        ELSE jsonb_pretty(p)
    END;
    RETURN base || jsonb_build_object(
        'kind', 'text',
        'label', left(initcap(replace(k, '_', ' ')), 64),
        'body', left(body, 20000)
    );
END $$;
--> statement-breakpoint

CREATE FUNCTION "m0103_review"(r jsonb) RETURNS jsonb LANGUAGE sql AS $$
    SELECT (r - 'artifacts') || CASE
        WHEN jsonb_array_length(r->'artifacts') > 0 THEN jsonb_build_object('parts', (
            SELECT jsonb_agg("m0103_part"(a, ai) ORDER BY ai)
            FROM jsonb_array_elements(r->'artifacts') WITH ORDINALITY AS x(a, ai)
        ))
        ELSE '{}'::jsonb
    END
$$;
--> statement-breakpoint

CREATE FUNCTION "m0103_canvas_refs"(m jsonb) RETURNS boolean LANGUAGE sql AS $$
    SELECT jsonb_typeof(m->'refs') = 'array'
        AND EXISTS (SELECT 1 FROM jsonb_array_elements(m->'refs') x WHERE x->>'kind' = 'artifact')
$$;
--> statement-breakpoint

CREATE FUNCTION "m0103_plain"(m jsonb, message_id text) RETURNS jsonb LANGUAGE plpgsql AS $$
DECLARE
    out jsonb := m - 'blockId' - 'spotLabel';
BEGIN
    IF "m0103_canvas_refs"(m) THEN
        out := (out - 'refs') || COALESCE((
            SELECT jsonb_build_object('refs', jsonb_agg(x ORDER BY xi))
            FROM jsonb_array_elements(m->'refs') WITH ORDINALITY AS rs(x, xi)
            WHERE x->>'kind' IS DISTINCT FROM 'artifact'
            HAVING count(*) > 0
        ), '{}'::jsonb);
    END IF;
    IF btrim(COALESCE(m->>'blockId', '')) <> '' THEN
        out := out || jsonb_build_object('anchor', jsonb_build_object(
            'id', left(message_id, 64),
            'part', left(m->>'blockId', 64),
            'label', left(COALESCE(NULLIF(btrim(m->>'spotLabel'), ''), m->>'blockId'), 128)
        ));
    ELSIF btrim(COALESCE(m->>'spotLabel', '')) <> '' THEN
        out := jsonb_set(out, '{text}', to_jsonb('On ' || (m->>'spotLabel') || ': ' || COALESCE(m->>'text', '')));
    END IF;
    RETURN out;
END $$;
--> statement-breakpoint

CREATE FUNCTION "m0103_old"(type text, m jsonb) RETURNS boolean LANGUAGE sql AS $$
    SELECT COALESCE(
        (type = 'review' AND m ? 'artifacts')
        OR (type = 'plain' AND (m ?| array['blockId', 'spotLabel'] OR "m0103_canvas_refs"(m))),
        false
    )
$$;
--> statement-breakpoint

UPDATE "messages"
SET "payload" = "m0103_review"("payload"::jsonb)::text
WHERE "type" = 'review' AND jsonb_typeof("payload"::jsonb -> 'artifacts') = 'array';
--> statement-breakpoint

UPDATE "messages"
SET "payload" = "m0103_plain"("payload"::jsonb, "id")::text
WHERE "type" = 'plain' AND "m0103_old"('plain', "payload"::jsonb);
--> statement-breakpoint

UPDATE "changes"
SET "after" = (("after"::jsonb - 'blockId') || jsonb_build_object('payload', CASE
    WHEN "after"::jsonb ->> 'type' = 'review' AND jsonb_typeof("after"::jsonb -> 'payload' -> 'artifacts') = 'array'
        THEN "m0103_review"("after"::jsonb -> 'payload')
    WHEN "after"::jsonb ->> 'type' = 'plain' AND "m0103_old"('plain', "after"::jsonb -> 'payload')
        THEN "m0103_plain"("after"::jsonb -> 'payload', "after"::jsonb ->> 'messageId')
    ELSE "after"::jsonb -> 'payload'
END))::text
WHERE "object" = 'thread' AND "kind" = 'message' AND "after"::jsonb ? 'payload';
--> statement-breakpoint

UPDATE "changes"
SET "before" = jsonb_set("before"::jsonb, '{payload}', CASE
    WHEN "before"::jsonb ->> 'type' = 'review' AND jsonb_typeof("before"::jsonb -> 'payload' -> 'artifacts') = 'array'
        THEN "m0103_review"("before"::jsonb -> 'payload')
    WHEN "before"::jsonb ->> 'type' = 'plain'
        THEN "m0103_plain"("before"::jsonb -> 'payload', "before"::jsonb ->> 'messageId')
    ELSE "before"::jsonb -> 'payload'
END)::text
WHERE "object" = 'thread'
    AND "kind" = 'message'
    AND "before" IS NOT NULL
    AND "m0103_old"("before"::jsonb ->> 'type', "before"::jsonb -> 'payload');
--> statement-breakpoint

DROP INDEX IF EXISTS "messages_block_id_idx";
--> statement-breakpoint

ALTER TABLE "messages" DROP COLUMN "block_id";
--> statement-breakpoint

DO $$
DECLARE bad_count int;
BEGIN
    SELECT COUNT(*) INTO bad_count FROM "messages" WHERE "m0103_old"("type", "payload"::jsonb);
    IF bad_count > 0 THEN
        RAISE EXCEPTION 'Migration 0103: % message(s) still carry a review canvas, a block anchor or a canvas reference — aborting', bad_count;
    END IF;

    SELECT COUNT(*) INTO bad_count
    FROM "changes"
    WHERE "object" = 'thread'
        AND "kind" = 'message'
        AND (
            "after"::jsonb ? 'blockId'
            OR "m0103_old"("after"::jsonb ->> 'type', "after"::jsonb -> 'payload')
            OR ("before" IS NOT NULL AND "m0103_old"("before"::jsonb ->> 'type', "before"::jsonb -> 'payload'))
        );
    IF bad_count > 0 THEN
        RAISE EXCEPTION 'Migration 0103: % thread history row(s) still carry a review canvas, a block anchor or a canvas reference — aborting', bad_count;
    END IF;
END $$;
--> statement-breakpoint

DROP FUNCTION "m0103_old"(text, jsonb);
--> statement-breakpoint
DROP FUNCTION "m0103_plain"(jsonb, text);
--> statement-breakpoint
DROP FUNCTION "m0103_canvas_refs"(jsonb);
--> statement-breakpoint
DROP FUNCTION "m0103_review"(jsonb);
--> statement-breakpoint
DROP FUNCTION "m0103_part"(jsonb, bigint);
