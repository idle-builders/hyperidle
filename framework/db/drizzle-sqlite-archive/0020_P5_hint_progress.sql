-- First-time hint progress tracking
-- Records which hints each user has explicitly dismissed.
-- Composite PK on (user_id, hint_id) prevents duplicate dismissals.
-- Cascade delete ensures rows are cleaned up when the user is deleted.
CREATE TABLE IF NOT EXISTS `hint_progress` (
	`user_id` text NOT NULL REFERENCES `users`(`id`) ON DELETE CASCADE,
	`hint_id` text NOT NULL,
	`seen_at` text NOT NULL,
	PRIMARY KEY(`user_id`, `hint_id`)
);
