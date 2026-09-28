-- P3: Server-side credential storage (shared mode)
CREATE TABLE IF NOT EXISTS `server_credentials` (
	`name` text PRIMARY KEY NOT NULL,
	`encrypted_value` text NOT NULL,
	`validation_state` text NOT NULL DEFAULT 'present_untested',
	`last_validated_at` text,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
-- P3: Typed server config (replaces factorySettings for new structured config)
CREATE TABLE IF NOT EXISTS `server_config` (
	`id` text PRIMARY KEY NOT NULL DEFAULT 'default',
	`config` text NOT NULL DEFAULT '{}',
	`updated_at` text NOT NULL
);
--> statement-breakpoint
-- Seed the default config row (idempotent)
INSERT OR IGNORE INTO `server_config` (`id`, `config`, `updated_at`)
VALUES ('default', '{}', datetime('now'));
