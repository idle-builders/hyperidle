-- Thread primitive migration (Postgres parallel of SQLite 0007).
-- Forward-only. Drops `threads.kind`, `messages.recipient_id/subject/body/file_leases`,
-- and the `responses` table; backfills new columns and projects legacy
-- rows into the new shape; emits `verdict`-typed messages from `responses`.
--
-- Step 1: snapshot tables (rollback artifact, 30-day retention).
CREATE TABLE "_l1_snapshot_threads" AS SELECT * FROM "threads";--> statement-breakpoint
CREATE TABLE "_l1_snapshot_messages" AS SELECT * FROM "messages";--> statement-breakpoint
CREATE TABLE "_l1_snapshot_items" AS SELECT * FROM "items";--> statement-breakpoint
CREATE TABLE "_l1_snapshot_responses" AS SELECT * FROM "responses";--> statement-breakpoint

-- Step 2: drop FK constraints that depend on the columns / table being
-- dropped. PG-only — SQLite folds these into the table-rebuild path.
ALTER TABLE "messages" DROP CONSTRAINT IF EXISTS "messages_recipient_id_agents_id_fk";--> statement-breakpoint
ALTER TABLE "responses" DROP CONSTRAINT IF EXISTS "responses_item_id_items_id_fk";--> statement-breakpoint
ALTER TABLE "responses" DROP CONSTRAINT IF EXISTS "responses_approver_id_agents_id_fk";--> statement-breakpoint

-- Step 3: add new threads columns (nullable while we backfill).
ALTER TABLE "threads" ADD COLUMN "host_kind" text;--> statement-breakpoint
ALTER TABLE "threads" ADD COLUMN "host_id" text;--> statement-breakpoint
ALTER TABLE "threads" ADD COLUMN "initiator_id" text;--> statement-breakpoint
ALTER TABLE "threads" ADD COLUMN "resolved_at" text;--> statement-breakpoint
ALTER TABLE "threads" ADD COLUMN "last_active_at" text;--> statement-breakpoint

-- Step 4: backfill threads.host_kind/host_id/initiator_id/last_active_at
-- per the thread-primitive projection rules. kind='coach' → host_kind='user'+pinned;
-- kind='direct' → host_kind='agent'; kind='post-bet-retro' → host_kind='bet';
-- review/chat → host_kind='task'; everything else → 'task' as fallback.
--
-- The CASE arms mirror the SQLite archive's thread_primitive_l1 migration
-- exactly, including the `items.kind` review/questionnaire branch. Functionally
-- both still default to 'task'; the parity prevents silent drift if either
-- branch is later edited to project elsewhere.
UPDATE "threads" t SET
	"host_kind" = CASE
		WHEN t."kind" = 'coach' THEN 'user'
		WHEN t."kind" = 'direct' THEN 'agent'
		WHEN t."kind" = 'post-bet-retro' THEN 'bet'
		WHEN EXISTS (
			SELECT 1 FROM "items" i
			WHERE i."thread_id" = t."id"
			AND (i."kind" = 'review' OR i."kind" = 'questionnaire')
		) OR t."kind" = 'review' OR t."kind" = 'chat' THEN 'task'
		ELSE 'task'
	END,
	"host_id" = COALESCE(
		(SELECT m."sender_id" FROM "messages" m WHERE m."thread_id" = t."id" ORDER BY m."created_at" LIMIT 1),
		t."id"
	),
	"initiator_id" = COALESCE(
		(SELECT m."sender_id" FROM "messages" m WHERE m."thread_id" = t."id" ORDER BY m."created_at" LIMIT 1),
		'unknown'
	),
	"last_active_at" = COALESCE(
		(SELECT MAX(m."created_at") FROM "messages" m WHERE m."thread_id" = t."id"),
		t."created_at"
	),
	"pinned" = CASE WHEN t."kind" = 'coach' THEN true ELSE COALESCE(t."pinned", false) END,
	"participants" = COALESCE(t."participants", '[]');--> statement-breakpoint

-- Step 5: lock the new columns.
ALTER TABLE "threads" ALTER COLUMN "host_kind" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "threads" ALTER COLUMN "host_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "threads" ALTER COLUMN "initiator_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "threads" ALTER COLUMN "last_active_at" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "threads" ALTER COLUMN "participants" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "threads" ALTER COLUMN "pinned" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "threads" ALTER COLUMN "pinned" SET DEFAULT false;--> statement-breakpoint

-- Step 6: drop the legacy `kind` column from threads.
ALTER TABLE "threads" DROP COLUMN "kind";--> statement-breakpoint

-- Step 7: add new messages columns. `payload` is text (NOT jsonb).
-- client_key is required for idempotency;
-- legacy_item_id ties the row back to its source item for backfill.
ALTER TABLE "messages" ADD COLUMN "type" text;--> statement-breakpoint
ALTER TABLE "messages" ADD COLUMN "payload" text;--> statement-breakpoint
ALTER TABLE "messages" ADD COLUMN "client_key" text;--> statement-breakpoint
ALTER TABLE "messages" ADD COLUMN "deleted_at" text;--> statement-breakpoint
ALTER TABLE "messages" ADD COLUMN "redacted_at" text;--> statement-breakpoint
ALTER TABLE "messages" ADD COLUMN "resolved_at" text;--> statement-breakpoint
ALTER TABLE "messages" ADD COLUMN "legacy_item_id" text;--> statement-breakpoint

-- Step 8: backfill messages.type/payload/client_key. If a sibling `items`
-- row references the same thread with kind='review'/'questionnaire', use
-- that as the message type and structure the payload accordingly. Else
-- default to type='plain' and collapse subject+body into payload.text.
UPDATE "messages" m SET
	"type" = CASE
		WHEN i."id" IS NOT NULL AND i."kind" = 'review' THEN 'review'
		WHEN i."id" IS NOT NULL AND i."kind" = 'questionnaire' THEN 'questionnaire'
		ELSE 'plain'
	END,
	"payload" = CASE
		WHEN i."id" IS NOT NULL AND i."kind" = 'review' THEN
			json_build_object(
				'title', COALESCE(i."title", ''),
				'reasoning', json_build_array(COALESCE(i."body", '')),
				'artifactRef', json_build_object('id', COALESCE(i."id", ''), 'kind', 'text_diff')
			)::text
		WHEN i."id" IS NOT NULL AND i."kind" = 'questionnaire' THEN
			json_build_object(
				'title', COALESCE(i."title", ''),
				'question', COALESCE(i."body", ''),
				'options', json_build_array()
			)::text
		ELSE
			json_build_object(
				'text', COALESCE(m."subject", '') || CASE WHEN m."subject" IS NOT NULL AND m."subject" <> '' THEN E'\n\n' ELSE '' END || COALESCE(m."body", '')
			)::text
	END,
	"client_key" = '__l1_legacy_' || m."id",
	"legacy_item_id" = i."id"
FROM "messages" m2
LEFT JOIN "items" i ON i."thread_id" = m2."thread_id"
WHERE m."id" = m2."id";--> statement-breakpoint

ALTER TABLE "messages" ALTER COLUMN "type" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "messages" ALTER COLUMN "payload" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "messages" ALTER COLUMN "client_key" SET NOT NULL;--> statement-breakpoint

-- Step 9: drop legacy message columns.
ALTER TABLE "messages" DROP COLUMN IF EXISTS "recipient_id";--> statement-breakpoint
ALTER TABLE "messages" DROP COLUMN IF EXISTS "subject";--> statement-breakpoint
ALTER TABLE "messages" DROP COLUMN IF EXISTS "body";--> statement-breakpoint
ALTER TABLE "messages" DROP COLUMN IF EXISTS "file_leases";--> statement-breakpoint

-- Step 10: backfill verdict-typed messages from `responses`. Type-backfill
-- (step 8) MUST run before this — verdicts target the just-projected review
-- message id. Only insert verdicts whose approver maps to an existing agent
-- (the legacy `responses.approver_id` had no FK; fall back to the source
-- review message's sender, which IS an agent).
INSERT INTO "messages" (
	"id", "sender_id", "thread_id", "type", "payload",
	"client_key", "created_at", "legacy_item_id"
)
SELECT
	'verdict-' || r."id",
	COALESCE(r."approver_id", (SELECT m."sender_id" FROM "messages" m WHERE m."legacy_item_id" = r."item_id" AND m."type" = 'review' LIMIT 1)),
	(SELECT m."thread_id" FROM "messages" m WHERE m."legacy_item_id" = r."item_id" AND m."type" = 'review' LIMIT 1),
	'verdict',
	json_build_object(
		'decision', r."decision",
		'resolvesMessageId', (SELECT m."id" FROM "messages" m WHERE m."legacy_item_id" = r."item_id" AND m."type" = 'review' LIMIT 1),
		'note', COALESCE(r."feedback", '')
	)::text,
	'__l1_migrate_' || r."id",
	r."responded_at",
	r."item_id"
FROM "responses" r
WHERE EXISTS (
	SELECT 1 FROM "messages" m WHERE m."legacy_item_id" = r."item_id" AND m."type" = 'review'
)
AND COALESCE(r."approver_id", (SELECT m2."sender_id" FROM "messages" m2 WHERE m2."legacy_item_id" = r."item_id" AND m2."type" = 'review' LIMIT 1)) IN (SELECT "id" FROM "agents");--> statement-breakpoint

-- Step 11: mark the source review messages and their threads as resolved.
UPDATE "messages" SET "resolved_at" = (
	SELECT r."responded_at" FROM "responses" r WHERE r."item_id" = "messages"."legacy_item_id" LIMIT 1
)
WHERE "messages"."type" = 'review' AND "messages"."legacy_item_id" IS NOT NULL AND EXISTS (
	SELECT 1 FROM "responses" r2 WHERE r2."item_id" = "messages"."legacy_item_id"
);--> statement-breakpoint

UPDATE "threads" SET "resolved_at" = sub."max_responded_at"
FROM (
	SELECT m."thread_id" AS thread_id, MAX(r."responded_at") AS max_responded_at
	FROM "responses" r
	JOIN "messages" m ON m."legacy_item_id" = r."item_id" AND m."type" = 'review'
	GROUP BY m."thread_id"
) sub
WHERE "threads"."id" = sub.thread_id;--> statement-breakpoint

-- Step 12: drop the legacy `responses` table.
DROP TABLE "responses";--> statement-breakpoint

-- Step 13: indexes. The legacy `messages_thread_id_idx` already exists from
-- migration 0003 — drop and recreate as composite (thread_id, created_at)
-- to match the schema.
DROP INDEX IF EXISTS "messages_thread_id_idx";--> statement-breakpoint
CREATE INDEX "messages_thread_id_idx" ON "messages" USING btree ("thread_id", "created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "messages_idempotency_uq" ON "messages" USING btree ("thread_id", "sender_id", "client_key");--> statement-breakpoint
CREATE INDEX "messages_unresolved_idx" ON "messages" USING btree ("thread_id", "resolved_at");--> statement-breakpoint
CREATE INDEX "threads_host_idx" ON "threads" USING btree ("host_kind", "host_id", "last_active_at");--> statement-breakpoint
CREATE INDEX "threads_initiator_idx" ON "threads" USING btree ("initiator_id", "last_active_at");
