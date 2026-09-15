-- hint_progress and knowledge_app_projection.attention_score were retired
-- with the hint dismissal surface and the attention engine. Both are already
-- gone from schema.ts; this migration catches the tables up. Destructive,
-- per house rule: no compat column, no backfill — nothing reads either one.
DROP TABLE IF EXISTS "hint_progress";--> statement-breakpoint
ALTER TABLE "knowledge_app_projection" DROP COLUMN IF EXISTS "attention_score";
