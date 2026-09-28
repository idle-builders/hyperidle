-- Server-side credential storage (shared mode)
CREATE TABLE IF NOT EXISTS "server_credentials" (
	"name" text PRIMARY KEY NOT NULL,
	"encrypted_value" text NOT NULL,
	"validation_state" text NOT NULL DEFAULT 'present_untested',
	"last_validated_at" text,
	"updated_at" text NOT NULL
);
--> statement-breakpoint
-- Typed server config
CREATE TABLE IF NOT EXISTS "server_config" (
	"id" text PRIMARY KEY NOT NULL DEFAULT 'default',
	"config" text NOT NULL DEFAULT '{}',
	"updated_at" text NOT NULL
);
--> statement-breakpoint
INSERT INTO "server_config" ("id", "config", "updated_at")
VALUES ('default', '{}', now()::text)
ON CONFLICT ("id") DO NOTHING;
