-- A routine's prompt becomes a knowledge document.
--
-- `routines.prompt` was the one instruction in the system with no home in
-- knowledge: it could not be read, edited or reused the way the knowledge it
-- plainly is can be, and a plugin contributing a routine had nothing to
-- contribute its prompt to. The routine now points at a document.
--
-- Every routine that has a prompt gets one, carrying the same text, so nothing
-- an existing routine fires with changes. The document is factory-scoped and
-- ordinary: what makes it a prompt is the routine pointing at it, not a role.
ALTER TABLE "routines" ADD COLUMN "prompt_knowledge_id" text;--> statement-breakpoint

INSERT INTO "knowledge_items" (
	"id", "scope_kind", "scope_id", "topic", "title", "body", "format",
	"status", "version", "role", "updated_by", "created_at", "updated_at"
)
SELECT
	'ki_rp_' || r."id",
	'factory',
	NULL,
	NULL,
	-- Named after the routine so it is findable in the knowledge view.
	COALESCE(NULLIF(r."name", ''), 'Routine') || ' — prompt',
	r."prompt",
	'markdown',
	'active',
	1,
	'ordinary',
	'migration:0068',
	COALESCE(r."created_at", NOW()::text),
	COALESCE(r."created_at", NOW()::text)
FROM "routines" r
WHERE r."prompt" IS NOT NULL AND r."prompt" <> '';--> statement-breakpoint

UPDATE "routines" r
SET "prompt_knowledge_id" = 'ki_rp_' || r."id"
WHERE r."prompt" IS NOT NULL AND r."prompt" <> '';--> statement-breakpoint

-- The projection row every knowledge document carries. `list()` reads it, so a
-- backfilled document without one would be invisible in the knowledge view.
INSERT INTO "knowledge_app_projection" ("id", "knowledge_item_id", "layer", "scope_id")
SELECT 'kp_rp_' || r."id", 'ki_rp_' || r."id", 'L4', NULL
FROM "routines" r
WHERE r."prompt" IS NOT NULL AND r."prompt" <> '';--> statement-breakpoint

ALTER TABLE "routines" ADD CONSTRAINT "routines_prompt_knowledge_id_fk"
	FOREIGN KEY ("prompt_knowledge_id") REFERENCES "knowledge_items"("id")
	ON DELETE SET NULL;--> statement-breakpoint

ALTER TABLE "routines" DROP COLUMN "prompt";
