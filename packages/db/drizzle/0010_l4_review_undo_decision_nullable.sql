-- L4 review (arch W2 + adversary W2): make `responses.decision` nullable
-- so undo rows can store NULL instead of synthesising a fake `'comment'`
-- decision that pollutes the audit chain. Readers of "current verdict
-- state" MUST filter on `transition='commit'` (see schema.ts @lore).
--
-- L4 review (security MEDIUM + adversary W6 + arch O3): add a partial
-- UNIQUE INDEX on `undoes_response_id` so a single commit can be undone
-- exactly once. Under PG default isolation (and in any race against the
-- IMMEDIATE-transaction read on SQLite that misses), two concurrent undo
-- POSTs against the same commit would both insert; the unique index
-- makes the second one fail. Combined with the route's 404 idempotency
-- mapping, this is true atomic single-undo.
--
-- SQLite cannot DROP NOT NULL in place; we rebuild the responses table.
-- All L4 columns are preserved. Foreign keys are temporarily disabled
-- via PRAGMA legacy_alter_table=ON during the rebuild (single-tx, no
-- cross-table FK fan-out concern here).
PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `responses_new` (
	`id` text PRIMARY KEY NOT NULL,
	`item_id` text NOT NULL,
	`decision` text,
	`inline_anchor` text,
	`edits` text,
	`feedback` text,
	`approver_id` text,
	`view` text,
	`responded_at` text NOT NULL,
	`transition` text DEFAULT 'commit' NOT NULL,
	`prior_decision` text,
	`undoes_response_id` text,
	`undo_window_seconds` integer,
	FOREIGN KEY (`item_id`) REFERENCES `items`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`undoes_response_id`) REFERENCES `responses`(`id`) ON UPDATE no action ON DELETE restrict
);--> statement-breakpoint
INSERT INTO `responses_new` (
	`id`, `item_id`, `decision`, `inline_anchor`, `edits`, `feedback`,
	`approver_id`, `view`, `responded_at`,
	`transition`, `prior_decision`, `undoes_response_id`, `undo_window_seconds`
)
SELECT
	`id`, `item_id`, `decision`, `inline_anchor`, `edits`, `feedback`,
	`approver_id`, `view`, `responded_at`,
	`transition`, `prior_decision`, `undoes_response_id`, `undo_window_seconds`
FROM `responses`;--> statement-breakpoint
DROP TABLE `responses`;--> statement-breakpoint
ALTER TABLE `responses_new` RENAME TO `responses`;--> statement-breakpoint
CREATE UNIQUE INDEX `responses_undoes_response_id_uq`
	ON `responses` (`undoes_response_id`)
	WHERE `undoes_response_id` IS NOT NULL;--> statement-breakpoint
PRAGMA foreign_keys=ON;
