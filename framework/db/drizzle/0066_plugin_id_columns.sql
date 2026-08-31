-- BA9d: add plugin_id to routines and users so disable/enable/remove can
-- target the materialised rows a plugin install created, without a full
-- table scan or a join back to plugin_configuration_defaults.
--
-- Nullable with no default and no backfill: rows that predate this column
-- (all non-plugin-installed rows) read as NULL, which the cleanup WHERE
-- clauses treat as "not owned by any plugin" — correct behaviour.
ALTER TABLE "routines" ADD COLUMN "plugin_id" text;
--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "plugin_id" text;
