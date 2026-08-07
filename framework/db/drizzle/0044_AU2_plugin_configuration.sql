CREATE TABLE "plugins" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"version" text NOT NULL,
	"state" text NOT NULL,
	"installed_at" text NOT NULL,
	"updated_at" text NOT NULL,
	"disabled_at" text,
	"removed_at" text,
	CONSTRAINT "plugins_state_ck" CHECK ("state" IN ('enabled', 'disabled', 'removed'))
);--> statement-breakpoint
CREATE TABLE "plugin_configuration_defaults" (
	"id" text PRIMARY KEY NOT NULL,
	"plugin_id" text NOT NULL,
	"kind" text NOT NULL,
	"key" text NOT NULL,
	"default_value_json" text NOT NULL,
	"default_version_hash" text NOT NULL,
	"created_at" text NOT NULL,
	"updated_at" text NOT NULL,
	CONSTRAINT "plugin_configuration_defaults_kind_ck" CHECK ("kind" IN ('agent', 'skill', 'routine', 'trigger', 'tool', 'mcp_server', 'harness_descriptor'))
);--> statement-breakpoint
CREATE TABLE "configuration_overrides" (
	"id" text PRIMARY KEY NOT NULL,
	"default_id" text,
	"kind" text NOT NULL,
	"key" text NOT NULL,
	"user_value_json" text NOT NULL,
	"state" text NOT NULL,
	"created_by_user_id" text,
	"created_at" text NOT NULL,
	"updated_at" text NOT NULL,
	CONSTRAINT "configuration_overrides_kind_ck" CHECK ("kind" IN ('agent', 'skill', 'routine', 'trigger', 'tool', 'mcp_server', 'harness_descriptor')),
	CONSTRAINT "configuration_overrides_state_ck" CHECK ("state" IN ('active', 'deleted'))
);--> statement-breakpoint
INSERT INTO "plugins" ("id", "name", "version", "state", "installed_at", "updated_at")
VALUES ('builtin', 'HyperIdle Built-ins', '0', 'enabled', now()::text, now()::text)
ON CONFLICT ("id") DO NOTHING;--> statement-breakpoint
ALTER TABLE "plugin_configuration_defaults" ADD CONSTRAINT "plugin_configuration_defaults_plugin_id_plugins_id_fk" FOREIGN KEY ("plugin_id") REFERENCES "plugins"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "configuration_overrides" ADD CONSTRAINT "configuration_overrides_default_id_plugin_configuration_defaults_id_fk" FOREIGN KEY ("default_id") REFERENCES "plugin_configuration_defaults"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "configuration_overrides" ADD CONSTRAINT "configuration_overrides_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "plugin_config_defaults_plugin_kind_key_uq" ON "plugin_configuration_defaults" USING btree ("plugin_id","kind","key");--> statement-breakpoint
CREATE INDEX "plugin_config_defaults_kind_key_idx" ON "plugin_configuration_defaults" USING btree ("kind","key");--> statement-breakpoint
CREATE UNIQUE INDEX "configuration_overrides_kind_key_uq" ON "configuration_overrides" USING btree ("kind","key");--> statement-breakpoint
CREATE INDEX "configuration_overrides_default_id_idx" ON "configuration_overrides" USING btree ("default_id");
