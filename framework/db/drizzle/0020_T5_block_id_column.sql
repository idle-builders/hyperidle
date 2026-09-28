ALTER TABLE "messages" ADD COLUMN "block_id" text;--> statement-breakpoint
CREATE INDEX "messages_block_id_idx" ON "messages" USING btree ("block_id");--> statement-breakpoint
-- Backfill block_id from existing plain-message JSON payloads.
-- Nullable: only plain messages carry blockId; others remain NULL.
UPDATE "messages"
SET "block_id" = (payload::json->>'blockId')
WHERE "type" = 'plain'
  AND payload::json->>'blockId' IS NOT NULL
  AND "block_id" IS NULL;
