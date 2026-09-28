-- 1. the child foreign keys follow a renamed plugin id.
ALTER TABLE "plugin_contributions" DROP CONSTRAINT "plugin_contributions_plugin_id_fkey";
--> statement-breakpoint
ALTER TABLE "plugin_contributions" ADD CONSTRAINT "plugin_contributions_plugin_id_plugins_id_fk"
	FOREIGN KEY ("plugin_id") REFERENCES "plugins"("id") ON DELETE cascade ON UPDATE cascade;
--> statement-breakpoint
ALTER TABLE "plugin_configuration_defaults" DROP CONSTRAINT "plugin_configuration_defaults_plugin_id_plugins_id_fk";
--> statement-breakpoint
ALTER TABLE "plugin_configuration_defaults" ADD CONSTRAINT "plugin_configuration_defaults_plugin_id_plugins_id_fk"
	FOREIGN KEY ("plugin_id") REFERENCES "plugins"("id") ON DELETE restrict ON UPDATE cascade;
--> statement-breakpoint

-- 2. a team install's id becomes `<name>@<teamId>`. A team row with no team
--    id has no install id to take and keeps its own.
UPDATE "plugins" SET "id" = "id" || '@' || "scope_team_id"
WHERE "scope_kind" = 'team' AND "scope_team_id" IS NOT NULL;
--> statement-breakpoint

-- 3. one install per plugin, scope and team.
CREATE UNIQUE INDEX "plugins_name_scope_uq" ON "plugins" ("name", "scope_kind", "scope_team_id");
