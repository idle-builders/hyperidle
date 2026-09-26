-- @lore Opinions arrive only from a plugin or the person, so the storage
-- that held opinions baked into the app goes. Nothing reads any of it at
-- runtime and every install holds it empty:
--   * `configuration_overrides` — a person's edits to plugin defaults; no
--     session ever applied them.
--   * `plugin_configuration_defaults` — defaults a plugin manifest declared;
--     no shipped plugin declares any. Plugin MCP servers are read from the
--     installed plugin folder instead.
--   * the reserved `builtin` plugins row — the owner of baked-in defaults,
--     which no longer exist.
--   * `configuration_default` contributions — never written.
--   * `users.email` — shown on the profile, never used to reach anyone.
--
-- Order: overrides point at defaults, and defaults restrict deleting their
-- plugin, so (1) overrides, (2) defaults, then (3) the `builtin` row can go.

-- 1. a person's overrides of plugin defaults.
DROP TABLE "configuration_overrides";
--> statement-breakpoint

-- 2. the defaults plugins declared.
DROP TABLE "plugin_configuration_defaults";
--> statement-breakpoint

-- 3. the reserved owner of baked-in defaults. Its contributions cascade.
DELETE FROM "plugins" WHERE "id" = 'builtin';
--> statement-breakpoint

-- 4. a contribution kind nothing writes.
ALTER TABLE "plugin_contributions" DROP CONSTRAINT "plugin_contributions_kind_ck";
--> statement-breakpoint
DELETE FROM "plugin_contributions" WHERE "kind" = 'configuration_default';
--> statement-breakpoint
ALTER TABLE "plugin_contributions" ADD CONSTRAINT "plugin_contributions_kind_ck"
	CHECK ("kind" IN ('agent', 'subscription', 'document'));
--> statement-breakpoint

-- 5. a profile email nothing sends to.
ALTER TABLE "users" DROP COLUMN "email";
