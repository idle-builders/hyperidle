-- S1: Per-user authentication tables
CREATE TABLE IF NOT EXISTS `login_sessions` (
  `id` text PRIMARY KEY NOT NULL,
  `user_id` text NOT NULL REFERENCES `users`(`id`) ON DELETE CASCADE,
  `token_hash` text NOT NULL UNIQUE,
  `expires_at` text NOT NULL,
  `created_at` text NOT NULL,
  `revoked_at` text
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `login_sessions_user_id_idx` ON `login_sessions` (`user_id`);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `login_sessions_token_hash_idx` ON `login_sessions` (`token_hash`);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `invite_codes` (
  `id` text PRIMARY KEY NOT NULL,
  `code` text NOT NULL UNIQUE,
  `created_by` text NOT NULL REFERENCES `users`(`id`) ON DELETE RESTRICT,
  `claimed_by` text REFERENCES `users`(`id`) ON DELETE SET NULL,
  `role` text NOT NULL DEFAULT 'member',
  `expires_at` text NOT NULL,
  `created_at` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS `invite_codes_code_uq` ON `invite_codes` (`code`);
