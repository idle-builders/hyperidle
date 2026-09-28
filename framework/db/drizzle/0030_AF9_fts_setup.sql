-- AF9 Task 3a: FTS setup migration.
ALTER TABLE "knowledge_items"
ADD COLUMN IF NOT EXISTS "fts_vector" tsvector
GENERATED ALWAYS AS (
	to_tsvector('english', coalesce(title, '') || ' ' || coalesce(body, ''))
) STORED;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "knowledge_items_fts_idx"
ON "knowledge_items" USING gin("fts_vector");
