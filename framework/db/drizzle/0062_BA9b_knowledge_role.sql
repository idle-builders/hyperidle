ALTER TABLE "knowledge_items" ADD COLUMN "role" text NOT NULL DEFAULT 'ordinary';--> statement-breakpoint
ALTER TABLE "knowledge_items" ADD CONSTRAINT "ki_role_ck" CHECK ("role" IN ('ordinary', 'skill', 'rule', 'agent_file'));--> statement-breakpoint
CREATE INDEX "ki_role_idx" ON "knowledge_items" ("role");
