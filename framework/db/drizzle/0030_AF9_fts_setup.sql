-- AF9 Task 3a: FTS setup migration.
-- @lore AF9: This DDL is the SAME as setupFts() in packages/server/src/app-runtime/fts.ts.
-- The two must stay in lockstep — fts.ts remains the single source of the column
-- definition; this migration is a copy so the migrator-built path (tests, CLI,
-- desktop) has the column without a runtime call. Both sides are idempotent.
ALTER TABLE "knowledge_items"
ADD COLUMN IF NOT EXISTS "fts_vector" tsvector
GENERATED ALWAYS AS (
	to_tsvector('english', coalesce(title, '') || ' ' || coalesce(body, ''))
) STORED;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "knowledge_items_fts_idx"
ON "knowledge_items" USING gin("fts_vector");
