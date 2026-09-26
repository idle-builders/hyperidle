-- @lore A plugin installs per team, independently. Until now a plugin was
-- one `plugins` row keyed by its manifest name, whatever scope it was
-- installed for, so a second team's install moved the plugin away from the
-- first team and deactivated that team's agents. Now each install is its
-- own row and the row id is the install id: the manifest name for a
-- factory install, `<name>@<teamId>` for a team install. A manifest name
-- never contains `@`, so the two forms cannot collide; `builtin` stays
-- `builtin`. `plugins.name` stays the manifest name.
--
-- Order: (1) the two child foreign keys follow a renamed id (ON UPDATE
-- CASCADE; contributions keep ON DELETE cascade, defaults keep restrict),
-- (2) every team install takes its install id — child `plugin_id` values
-- follow by cascade; child primary keys that embed the old id stay unique
-- and are not rewritten, a reinstall upserts on (plugin_id, kind, key),
-- (3) one install per plugin, scope and team.

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
