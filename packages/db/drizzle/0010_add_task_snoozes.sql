CREATE TABLE `task_snoozes` (
	`user_id` text NOT NULL,
	`task_id` text NOT NULL,
	`snoozed_until` text NOT NULL,
	`created_at` text NOT NULL,
	PRIMARY KEY(`user_id`, `task_id`),
	FOREIGN KEY (`task_id`) REFERENCES `tasks`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `task_snoozes_user_until_idx` ON `task_snoozes` (`user_id`,`snoozed_until`);
