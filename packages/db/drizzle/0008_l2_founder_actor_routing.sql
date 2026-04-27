-- L2: Founder/actor routing (docs/work-packages/TRACK-L.md L2,
-- .plan-L2.md §3.3).
--
-- Adds the `actors` table (CEO + CPO identity), routing columns on
-- `threads` (`routed_to_actor_id`, `domain_tag`), and an append-only
-- `thread_routing_audit` table that records every reassignment. The
-- two well-known rows (`actor:ceo`, `actor:cpo`) are inserted by
-- `seed.ts` (idempotent via `onConflictDoNothing`).
CREATE TABLE `actors` (
	`id` text PRIMARY KEY NOT NULL,
	`role` text NOT NULL,
	`domain_tags` text DEFAULT '[]' NOT NULL,
	`created_at` text NOT NULL
);--> statement-breakpoint
ALTER TABLE `threads` ADD `routed_to_actor_id` text REFERENCES actors(id) ON DELETE RESTRICT;--> statement-breakpoint
ALTER TABLE `threads` ADD `domain_tag` text;--> statement-breakpoint
CREATE TABLE `thread_routing_audit` (
	`id` text PRIMARY KEY NOT NULL,
	`thread_id` text NOT NULL,
	`from_actor_id` text,
	`to_actor_id` text,
	`reason` text NOT NULL,
	`changed_by` text NOT NULL,
	`at` text NOT NULL,
	FOREIGN KEY (`thread_id`) REFERENCES `threads`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`from_actor_id`) REFERENCES `actors`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`to_actor_id`) REFERENCES `actors`(`id`) ON UPDATE no action ON DELETE restrict
);--> statement-breakpoint
CREATE INDEX `tra_thread_idx` ON `thread_routing_audit` (`thread_id`);--> statement-breakpoint
CREATE INDEX `tra_at_idx` ON `thread_routing_audit` (`at`);
