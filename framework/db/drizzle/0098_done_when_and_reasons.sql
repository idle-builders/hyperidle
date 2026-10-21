-- Replace done_condition (free text) + needs_review (boolean) with:
--   done_when  — JSON array of DoneWhenLine objects, NOT NULL default '[]'
--   reasons    — JSON array of Reason objects, NOT NULL default '[]'
--
-- Backfill order:
--   1. Add done_when and reasons (default '[]').
--   2. Backfill done_when from done_condition / needs_review.
--   3. Guard: no done_condition survives the migration without a done_when entry.
--   4. Drop done_condition and needs_review.

-- 1. add the two new columns.
ALTER TABLE "tasks" ADD COLUMN "done_when" text NOT NULL DEFAULT '[]';
--> statement-breakpoint
ALTER TABLE "tasks" ADD COLUMN "reasons" text NOT NULL DEFAULT '[]';
--> statement-breakpoint

-- 2a. A non-empty done_condition becomes one check line.
--     state: "met" when the task is done, else "open".
--     id: derived from task id, stable across re-runs.
UPDATE "tasks"
SET "done_when" = json_build_array(
    json_build_object(
        'id',    concat('dw-', "id"),
        'what',  "done_condition",
        'by',    'check',
        'state', CASE WHEN "state" = 'done' THEN 'met' ELSE 'open' END,
        'how',   NULL
    )
)::text
WHERE "done_condition" IS NOT NULL AND "done_condition" != '';
--> statement-breakpoint

-- 2b. needs_review = true adds a review line (in addition to any check line already written).
--     We append into existing done_when JSON.
UPDATE "tasks"
SET "done_when" = (
    SELECT json_agg(e)::text
    FROM (
        SELECT e FROM json_array_elements(
            CASE
                WHEN "done_when" = '[]' THEN '[]'::json
                ELSE "done_when"::json
            END
        ) e
        UNION ALL
        SELECT json_build_object(
            'id',    concat('dw-rev-', "id"),
            'what',  'A person looked at it before it counts as done.',
            'by',    'review',
            'state', CASE WHEN "state" = 'done' THEN 'met' ELSE 'open' END,
            'how',   NULL
        )
    ) sub
)
WHERE "needs_review" = TRUE;
--> statement-breakpoint

-- 3. Guard: any task that had a non-empty done_condition must now have a done_when entry.
DO $$
DECLARE bad_count int;
BEGIN
    SELECT COUNT(*) INTO bad_count
    FROM "tasks"
    WHERE "done_condition" IS NOT NULL
      AND "done_condition" != ''
      AND ("done_when" = '[]' OR "done_when" IS NULL);
    IF bad_count > 0 THEN
        RAISE EXCEPTION 'Migration 0098: % task(s) with a non-empty done_condition would lose it — aborting', bad_count;
    END IF;
END $$;
--> statement-breakpoint

-- 4. drop old columns.
ALTER TABLE "tasks" DROP COLUMN "done_condition";
--> statement-breakpoint
ALTER TABLE "tasks" DROP COLUMN "needs_review";
