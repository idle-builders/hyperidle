-- The plugin service owns a registry of what each plugin contributed.
--
-- Provenance was recorded seven ways: `users.plugin_id`, `routines.plugin_id`,
-- `plugin_configuration_defaults.plugin_id`, `knowledge_items.topic =
-- 'plugin:<id>'`, `knowledge_items.updated_by = 'plugin:<id>'`, a `<pluginId>/`
-- prefix inside a configuration key, and one-way hashed row ids. Each covered a
-- different subset, so no surface could answer "what did this plugin
-- contribute", and the lifecycle operations disagreed with one another. Two of
-- the seven were never read at all.
--
-- One table answers it now. `users.plugin_id` and `routines.plugin_id` are
-- dropped: they were provenance the plugin service owns, sitting in tables it
-- does not. `knowledge_items.topic` is freed to mean what it says.
CREATE TABLE "plugin_contributions" (
	"id" text PRIMARY KEY NOT NULL,
	"plugin_id" text NOT NULL REFERENCES "plugins"("id") ON DELETE cascade,
	"kind" text NOT NULL,
	"entity_id" text NOT NULL,
	"detached_at" text,
	"created_at" text NOT NULL,
	CONSTRAINT "plugin_contributions_kind_ck"
		CHECK ("kind" IN ('agent', 'routine', 'knowledge', 'configuration_default'))
);--> statement-breakpoint

CREATE UNIQUE INDEX "plugin_contributions_plugin_kind_entity_uq"
	ON "plugin_contributions" ("plugin_id", "kind", "entity_id");--> statement-breakpoint
CREATE INDEX "plugin_contributions_plugin_idx"
	ON "plugin_contributions" ("plugin_id");--> statement-breakpoint
CREATE INDEX "plugin_contributions_entity_idx"
	ON "plugin_contributions" ("kind", "entity_id");--> statement-breakpoint

-- Backfill: every agent a plugin materialised.
INSERT INTO "plugin_contributions" ("id", "plugin_id", "kind", "entity_id", "detached_at", "created_at")
SELECT 'pc_a_' || u."id", u."plugin_id", 'agent', u."id", NULL, NOW()::text
FROM "users" u
JOIN "plugins" p ON p."id" = u."plugin_id"
WHERE u."plugin_id" IS NOT NULL;--> statement-breakpoint

-- Every routine a plugin materialised.
INSERT INTO "plugin_contributions" ("id", "plugin_id", "kind", "entity_id", "detached_at", "created_at")
SELECT 'pc_r_' || r."id", r."plugin_id", 'routine', r."id", NULL, NOW()::text
FROM "routines" r
JOIN "plugins" p ON p."id" = r."plugin_id"
WHERE r."plugin_id" IS NOT NULL;--> statement-breakpoint

-- Every knowledge document a plugin contributed. `topic = 'plugin:<id>'` was the
-- marker; `updated_by <> 'plugin:<id>'` was the separate, never-read signal that
-- a person had edited it. Both fold in here, the second as `detached_at`.
INSERT INTO "plugin_contributions" ("id", "plugin_id", "kind", "entity_id", "detached_at", "created_at")
SELECT
	'pc_k_' || k."id",
	substring(k."topic" from 8),
	'knowledge',
	k."id",
	CASE WHEN k."updated_by" = k."topic" THEN NULL ELSE k."updated_at" END,
	NOW()::text
FROM "knowledge_items" k
JOIN "plugins" p ON p."id" = substring(k."topic" from 8)
WHERE k."topic" LIKE 'plugin:%';--> statement-breakpoint

-- Every configuration default a plugin seeded.
INSERT INTO "plugin_contributions" ("id", "plugin_id", "kind", "entity_id", "detached_at", "created_at")
SELECT 'pc_c_' || d."id", d."plugin_id", 'configuration_default', d."id", NULL, NOW()::text
FROM "plugin_configuration_defaults" d;--> statement-breakpoint

-- The topic said "this came from a plugin". The registry says it now, so the
-- field goes back to meaning a topic. Contributed documents keep no topic
-- rather than a fake one.
UPDATE "knowledge_items" SET "topic" = NULL WHERE "topic" LIKE 'plugin:%';--> statement-breakpoint

-- `updated_by` said "a plugin last wrote this", which leaked into the knowledge
-- view as a raw `plugin:<id>` author string. The registry carries it, so the
-- field goes back to naming a person.
UPDATE "knowledge_items" SET "updated_by" = 'plugin' WHERE "updated_by" LIKE 'plugin:%';--> statement-breakpoint

ALTER TABLE "users" DROP COLUMN "plugin_id";--> statement-breakpoint
ALTER TABLE "routines" DROP COLUMN "plugin_id";
