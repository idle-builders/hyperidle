ALTER TABLE "users" ADD COLUMN "model_id" text;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "model_provider" text;--> statement-breakpoint
-- AH2: Tier-aware backfill for existing AI agents.
-- Only backfill agents that are not claude-code (builtin supports the full catalog).
-- Agents with no harnessType use the default builtin path.
-- Tier → catalog model mapping: reasoning→opus-4-8, workhorse→sonnet-4-6, fast→haiku-4-5.
-- Agents with null modelTierPreference get the workhorse default (sonnet-4-6).
-- Human users (agentCategory IS NULL) are left with null model_id (no per-agent model).
UPDATE "users"
SET
  "model_id" = CASE
    WHEN "model_tier_preference" = 'reasoning' THEN 'claude-opus-4-8'
    WHEN "model_tier_preference" = 'fast' THEN 'claude-haiku-4-5'
    ELSE 'claude-sonnet-4-6'
  END,
  "model_provider" = 'anthropic'
WHERE
  "agent_category" IS NOT NULL
  AND ("harness_type" IS NULL OR "harness_type" = 'builtin');