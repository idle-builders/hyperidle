-- An agent's identity becomes a knowledge document.
--
-- `agent_run_config.system_prompt` was the text that becomes the "## Identity"
-- section of the AGENTS.md every session reads — the agent's own instructions,
-- with no home in knowledge. It could not be read, edited or reviewed the way
-- knowledge can, and a plugin contributing an agent had nothing to contribute
-- its identity to.
--
-- It is now an `agent_file` knowledge document bound to the agent, which is what
-- the role has always meant: scope_kind='user' with scope_id = the agent's id.
-- Context assembly already reads exactly that binding.
--
-- Every agent that has a system prompt gets one, carrying the same text, so no
-- agent's identity changes.
INSERT INTO "knowledge_items" (
	"id", "scope_kind", "scope_id", "topic", "title", "body", "format",
	"status", "version", "role", "updated_by", "created_at", "updated_at"
)
SELECT
	'ki_af_' || c."agent_user_id",
	'user',
	c."agent_user_id",
	NULL,
	COALESCE(NULLIF(u."name", ''), 'Agent') || ' — identity',
	c."system_prompt",
	'markdown',
	'active',
	1,
	'agent_file',
	'migration:0069',
	NOW()::text,
	NOW()::text
FROM "agent_run_config" c
JOIN "users" u ON u."id" = c."agent_user_id"
WHERE c."system_prompt" IS NOT NULL AND c."system_prompt" <> '';--> statement-breakpoint

-- The projection row `list()` reads. Without it the identity document would be
-- invisible in the knowledge view it now lives in.
INSERT INTO "knowledge_app_projection" ("id", "knowledge_item_id", "layer", "scope_id")
SELECT 'kp_af_' || c."agent_user_id", 'ki_af_' || c."agent_user_id", NULL, c."agent_user_id"
FROM "agent_run_config" c
WHERE c."system_prompt" IS NOT NULL AND c."system_prompt" <> '';--> statement-breakpoint

ALTER TABLE "agent_run_config" DROP COLUMN "system_prompt";
