ALTER TABLE "users" ADD COLUMN "model_id" text;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "model_provider" text;--> statement-breakpoint
-- AH2: Step 1 — backfill harness_type for legacy AI agents that have none.
-- Any AI agent (agentCategory IS NOT NULL) without a harness_type gets 'builtin'
-- (the default; builtin supports the full anthropic+openrouter catalog).
-- Human users (agentCategory IS NULL) are left untouched — they have no harness.
-- Without this backfill, provisioning calls select({harnessType: undefined}) which
-- reverts to the "any adapter" fallback — the silent dead-session path AC3/AC6 eliminate.
UPDATE "users"
SET "harness_type" = 'builtin'
WHERE "agent_category" IS NOT NULL AND "harness_type" IS NULL;--> statement-breakpoint
-- AH2: Step 2 — tier-aware model backfill for ALL existing AI agents.
-- Covers builtin (now set above), claude-code, and any future harness type.
-- All registered harnesses support the anthropic catalog (claude-code is anthropic-only;
-- builtin supports anthropic+openrouter). Backfilling anthropic+sonnet-4-6 is safe
-- for every harness type — the cross-axis validator will catch any incompatible
-- pair on the next PATCH if an operator switches harness.
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
  "agent_category" IS NOT NULL;