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
