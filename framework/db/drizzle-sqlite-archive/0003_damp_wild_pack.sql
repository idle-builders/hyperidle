CREATE TABLE `notification_queue` (
	`id` text PRIMARY KEY NOT NULL,
	`event_type` text NOT NULL,
	`subject_id` text,
	`severity` text NOT NULL,
	`title` text NOT NULL,
	`body` text,
	`reason` text NOT NULL,
	`channel` text,
	`status` text NOT NULL,
	`attempts` integer DEFAULT 0 NOT NULL,
	`last_error` text,
	`created_at` text NOT NULL,
	`sent_at` text,
	`claimed_at` text
);
--> statement-breakpoint
CREATE INDEX `nq_status_created_idx` ON `notification_queue` (`status`,`created_at`);--> statement-breakpoint
CREATE INDEX `nq_severity_idx` ON `notification_queue` (`severity`);