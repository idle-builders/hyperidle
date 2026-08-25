-- The harness options an agent's model runs with, stored once as part of
-- configuring that agent rather than chosen per message.
--
-- Nullable with no default and no backfill: every agent configured before this
-- column existed reads as "no options" and runs exactly as it did before. The
-- stored object is sparse — only a value moved away from the harness's own
-- default is written, so an absent key means "whatever the harness does".
ALTER TABLE "agent_run_config" ADD COLUMN "model_options_json" text;
