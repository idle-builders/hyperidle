-- (a) an additive `baked_request_json` column
-- carrying the emit-time-resolved request a migrated family's resolver
-- produces; (b) the
-- `superseded` status value + its correlation shape. Hand-authored incremental
-- migration (this repo's migrations are additive SQL files tracked only by
-- meta/_journal.json — see 0043-0050 — not by a regenerated drizzle-kit
-- snapshot chain past 0042).

ALTER TABLE "agent_work_intents" ADD COLUMN "baked_request_json" text;
--> statement-breakpoint

ALTER TABLE "agent_work_intents" DROP CONSTRAINT "agent_work_intents_status_ck";
--> statement-breakpoint
ALTER TABLE "agent_work_intents" ADD CONSTRAINT "agent_work_intents_status_ck" CHECK ("status" IN ('pending','claimed','handed_off','failed','superseded'));
--> statement-breakpoint

ALTER TABLE "agent_work_intents" DROP CONSTRAINT "agent_work_intents_correlation_ck";
--> statement-breakpoint
ALTER TABLE "agent_work_intents" ADD CONSTRAINT "agent_work_intents_correlation_ck" CHECK (
	("status" = 'pending' AND "claim_token" IS NULL AND "claim_expires_at" IS NULL AND "request_id" IS NULL)
	OR ("status" = 'claimed' AND "claim_token" IS NOT NULL AND "claim_expires_at" IS NOT NULL AND "request_id" IS NULL)
	OR ("status" = 'handed_off' AND "request_id" IS NOT NULL)
	OR ("status" = 'failed' AND "last_error_code" IS NOT NULL)
	OR ("status" = 'superseded' AND "claim_token" IS NULL AND "claim_expires_at" IS NULL AND "request_id" IS NULL)
);
