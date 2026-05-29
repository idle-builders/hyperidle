CREATE TABLE `knowledge_conflicts` (
	`id` text PRIMARY KEY NOT NULL,
	`item_id` text NOT NULL,
	`version_base` integer NOT NULL,
	`version_current` integer NOT NULL,
	`proposed_body` text NOT NULL,
	`proposed_by` text NOT NULL,
	`status` text DEFAULT 'open' NOT NULL,
	`created_at` text NOT NULL,
	FOREIGN KEY (`item_id`) REFERENCES `knowledge_items`(`id`) ON UPDATE no action ON DELETE no action
);
