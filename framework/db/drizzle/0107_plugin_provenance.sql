-- Where a plugin came from and who added it, and who changed what it added.
-- An install made before this has no recorded source: its copied folder (or its name) stands in.

ALTER TABLE "plugins" ADD COLUMN "source_kind" text;
--> statement-breakpoint
ALTER TABLE "plugins" ADD COLUMN "source_address" text;
--> statement-breakpoint
ALTER TABLE "plugins" ADD COLUMN "description" text;
--> statement-breakpoint
ALTER TABLE "plugins" ADD COLUMN "installed_by" text;
--> statement-breakpoint
UPDATE "plugins" SET "source_kind" = 'folder', "source_address" = COALESCE("install_path", "name");
--> statement-breakpoint
ALTER TABLE "plugins" ALTER COLUMN "source_kind" SET NOT NULL;
--> statement-breakpoint
ALTER TABLE "plugins" ALTER COLUMN "source_address" SET NOT NULL;
--> statement-breakpoint
ALTER TABLE "plugins" ADD CONSTRAINT "plugins_source_kind_ck" CHECK ("source_kind" IN ('folder', 'git', 'zip', 'bundled'));
--> statement-breakpoint
ALTER TABLE "plugin_contributions" ADD COLUMN "detached_by" text;
--> statement-breakpoint
-- A document edited before this was kept: its last editor made it the team's.
UPDATE "plugin_contributions" c SET "detached_by" = d."updated_by"
  FROM "documents" d
 WHERE c."kind" = 'document' AND c."detached_at" IS NOT NULL AND d."id" = c."entity_id";
