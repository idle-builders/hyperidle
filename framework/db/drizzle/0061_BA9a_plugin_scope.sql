ALTER TABLE "plugins" ADD COLUMN "scope_kind" text NOT NULL DEFAULT 'factory';--> statement-breakpoint
ALTER TABLE "plugins" ADD COLUMN "scope_team_id" text;--> statement-breakpoint
ALTER TABLE "plugins" ADD CONSTRAINT "plugins_scope_kind_ck" CHECK ("scope_kind" IN ('factory', 'team'));
