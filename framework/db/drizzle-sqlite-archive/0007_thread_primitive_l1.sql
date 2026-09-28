-- L1a — Thread primitive migration (plan §5.3).
-- Forward-only. Drops `threads.kind`, `messages.recipient_id/subject/body/file_leases`,
-- and the `responses` table; backfills new columns and projects legacy
-- rows into the new shape; emits `verdict`-typed messages from `responses`.

PRAGMA defer_foreign_keys=ON;--> statement-breakpoint
PRAGMA foreign_keys=OFF;--> statement-breakpoint

-- Step 1: snapshot tables (rollback artifact, 30-day retention per plan §5.3).
CREATE TABLE `_l1_snapshot_threads` AS SELECT * FROM `threads`;--> statement-breakpoint
CREATE TABLE `_l1_snapshot_messages` AS SELECT * FROM `messages`;--> statement-breakpoint
CREATE TABLE `_l1_snapshot_items` AS SELECT * FROM `items`;--> statement-breakpoint
CREATE TABLE `_l1_snapshot_responses` AS SELECT * FROM `responses`;--> statement-breakpoint

-- Steps 2-5: rebuild `threads` with new columns. Backfill projection rules
-- per docs/human-interface-layer/thread-primitive.md: kind='coach' → host_kind='user'+pinned; kind='direct' →
-- host_kind='agent'; kind='post-bet-retro' → host_kind='bet'; kind='review'
-- /'chat' → host_kind from referencing item/task; everything else → 'task'
-- with id derived from the thread id (best-effort fallback).
CREATE TABLE `__new_threads` (
	`id` text PRIMARY KEY NOT NULL,
	`host_kind` text NOT NULL,
	`host_id` text NOT NULL,
	`initiator_id` text NOT NULL,
	`participants` text NOT NULL,
	`pinned` integer DEFAULT 0 NOT NULL,
	`resolved_at` text,
	`last_active_at` text NOT NULL,
	`created_at` text NOT NULL
);--> statement-breakpoint

INSERT INTO `__new_threads` (
	`id`, `host_kind`, `host_id`, `initiator_id`, `participants`,
	`pinned`, `resolved_at`, `last_active_at`, `created_at`
)
SELECT
	t.id,
	CASE
		WHEN t.kind = 'coach' THEN 'user'
		WHEN t.kind = 'direct' THEN 'agent'
		WHEN t.kind = 'post-bet-retro' THEN 'bet'
		WHEN i.kind = 'review' OR i.kind = 'questionnaire' OR t.kind = 'review' OR t.kind = 'chat' THEN 'task'
		ELSE 'task'
	END AS host_kind,
	-- host_id: legacy threads have no explicit host. Fall back to the thread id
	-- so the column has a deterministic non-null value; downstream code that
	-- migrates these threads can rewrite the host_id explicitly.
	COALESCE((SELECT m.sender_id FROM messages m WHERE m.thread_id = t.id ORDER BY m.created_at LIMIT 1), t.id) AS host_id,
	COALESCE((SELECT m.sender_id FROM messages m WHERE m.thread_id = t.id ORDER BY m.created_at LIMIT 1), 'unknown') AS initiator_id,
	COALESCE(t.participants, '[]') AS participants,
	CASE WHEN t.kind = 'coach' THEN 1 ELSE COALESCE(t.pinned, 0) END AS pinned,
	NULL AS resolved_at,
	COALESCE((SELECT MAX(m.created_at) FROM messages m WHERE m.thread_id = t.id), t.created_at) AS last_active_at,
	t.created_at
FROM threads t
LEFT JOIN items i ON i.thread_id = t.id;--> statement-breakpoint

DROP TABLE `threads`;--> statement-breakpoint
ALTER TABLE `__new_threads` RENAME TO `threads`;--> statement-breakpoint

-- Step 6: rebuild `messages` with new columns. Project legacy rows:
-- - if a `items` row references the same thread with kind='review' →
--   type='review', payload={title,reasoning,artifactRef}, legacy_item_id
-- - else → type='plain', payload={text:'<subject>\n\n<body>'}.
CREATE TABLE `__new_messages` (
	`id` text PRIMARY KEY NOT NULL,
	`sender_id` text NOT NULL,
	`thread_id` text NOT NULL,
	`type` text NOT NULL,
	`payload` text NOT NULL,
	`client_key` text NOT NULL,
	`deleted_at` text,
	`redacted_at` text,
	`resolved_at` text,
	`created_at` text NOT NULL,
	`legacy_item_id` text,
	FOREIGN KEY (`sender_id`) REFERENCES `agents`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`thread_id`) REFERENCES `threads`(`id`) ON UPDATE no action ON DELETE restrict
);--> statement-breakpoint

INSERT INTO `__new_messages` (
	`id`, `sender_id`, `thread_id`, `type`, `payload`,
	`client_key`, `deleted_at`, `redacted_at`, `resolved_at`,
	`created_at`, `legacy_item_id`
)
SELECT
	m.id,
	m.sender_id,
	m.thread_id,
	CASE
		WHEN i.id IS NOT NULL AND i.kind = 'review' THEN 'review'
		WHEN i.id IS NOT NULL AND i.kind = 'questionnaire' THEN 'questionnaire'
		ELSE 'plain'
	END AS type,
	CASE
		WHEN i.id IS NOT NULL AND i.kind = 'review' THEN
			json_object(
				'title', COALESCE(i.title, ''),
				'reasoning', json_array(COALESCE(i.body, '')),
				'artifactRef', json_object('id', COALESCE(i.id, ''), 'kind', 'text_diff')
			)
		WHEN i.id IS NOT NULL AND i.kind = 'questionnaire' THEN
			json_object(
				'title', COALESCE(i.title, ''),
				'question', COALESCE(i.body, ''),
				'options', json_array()
			)
		ELSE
			json_object('text', COALESCE(m.subject, '') || CASE WHEN m.subject IS NOT NULL AND m.subject <> '' THEN char(10) || char(10) ELSE '' END || COALESCE(m.body, ''))
	END AS payload,
	'__l1_legacy_' || m.id AS client_key,
	NULL AS deleted_at,
	NULL AS redacted_at,
	NULL AS resolved_at,
	m.created_at,
	i.id AS legacy_item_id
FROM messages m
LEFT JOIN items i ON i.thread_id = m.thread_id;--> statement-breakpoint

DROP TABLE `messages`;--> statement-breakpoint
ALTER TABLE `__new_messages` RENAME TO `messages`;--> statement-breakpoint

-- Step 7: backfill verdict-typed messages from `responses`. For each
-- responses row r, find the messages row with legacy_item_id = r.item_id
-- and type='review'; insert a new verdict row that resolves it; mark the
-- review's resolved_at = r.responded_at; mark the thread.resolved_at.
INSERT INTO `messages` (
	`id`, `sender_id`, `thread_id`, `type`, `payload`,
	`client_key`, `created_at`, `legacy_item_id`
)
SELECT
	'verdict-' || r.id,
	COALESCE(r.approver_id, (SELECT m.sender_id FROM messages m WHERE m.legacy_item_id = r.item_id AND m.type = 'review' LIMIT 1)),
	(SELECT m.thread_id FROM messages m WHERE m.legacy_item_id = r.item_id AND m.type = 'review' LIMIT 1),
	'verdict',
	json_object(
		'decision', r.decision,
		'resolvesMessageId', (SELECT m.id FROM messages m WHERE m.legacy_item_id = r.item_id AND m.type = 'review' LIMIT 1),
		'note', COALESCE(r.feedback, '')
	),
	'__l1_migrate_' || r.id,
	r.responded_at,
	r.item_id
FROM responses r
WHERE EXISTS (
	SELECT 1 FROM messages m WHERE m.legacy_item_id = r.item_id AND m.type = 'review'
)
AND COALESCE(r.approver_id, (SELECT m2.sender_id FROM messages m2 WHERE m2.legacy_item_id = r.item_id AND m2.type = 'review' LIMIT 1)) IN (SELECT id FROM agents);--> statement-breakpoint

UPDATE `messages` SET `resolved_at` = (
	SELECT r.responded_at FROM responses r WHERE r.item_id = messages.legacy_item_id LIMIT 1
)
WHERE messages.type = 'review' AND messages.legacy_item_id IS NOT NULL AND EXISTS (
	SELECT 1 FROM responses r2 WHERE r2.item_id = messages.legacy_item_id
);--> statement-breakpoint

UPDATE `threads` SET `resolved_at` = (
	SELECT MAX(r.responded_at)
	FROM responses r
	JOIN messages m ON m.legacy_item_id = r.item_id AND m.type = 'review'
	WHERE m.thread_id = threads.id
)
WHERE EXISTS (
	SELECT 1 FROM responses r3
	JOIN messages m3 ON m3.legacy_item_id = r3.item_id AND m3.type = 'review'
	WHERE m3.thread_id = threads.id
);--> statement-breakpoint

-- Step 8: indexes.
CREATE INDEX `threads_host_idx` ON `threads` (`host_kind`, `host_id`, `last_active_at`);--> statement-breakpoint
CREATE INDEX `threads_initiator_idx` ON `threads` (`initiator_id`, `last_active_at`);--> statement-breakpoint
CREATE INDEX `messages_thread_id_idx` ON `messages` (`thread_id`, `created_at`);--> statement-breakpoint
CREATE UNIQUE INDEX `messages_idempotency_uq` ON `messages` (`thread_id`, `sender_id`, `client_key`);--> statement-breakpoint
CREATE INDEX `messages_unresolved_idx` ON `messages` (`thread_id`, `resolved_at`);--> statement-breakpoint

-- Step 11: drop the legacy `responses` table (column drops were folded
-- into the table rebuilds above on SQLite).
DROP TABLE `responses`;--> statement-breakpoint

PRAGMA foreign_keys=ON;
