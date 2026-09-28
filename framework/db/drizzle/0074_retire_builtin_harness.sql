-- The built-in harness is gone. Agents configured to run on it point at an
-- adapter that does not exist, so admission would find nothing to select and
-- the session would fail with "no eligible harness".
--
-- They move to codex. Their model moves to
-- NULL along with it, deliberately: a built-in agent's model_id is a gateway
-- model id ("deepseek/deepseek-v4-flash", "claude-haiku-4-5") that codex cannot
-- serve, and handing it over as `--model` would fail every run in a way that
-- looks like the agent is broken. NULL means "the harness's own default", which
-- is the honest answer to "what should this agent run now?" — the person who
-- configured it picked a model for a different harness, and only they can pick
-- the replacement.
--
-- model_options_json goes too: the options were declared by the old model, and
-- carrying them onto a codex model that never declared them would send flags
-- the binary rejects.
UPDATE "agent_run_config"
SET "harness_type" = 'codex',
    "model_id" = NULL,
    "model_provider" = NULL,
    "model_options_json" = NULL
WHERE "harness_type" = 'builtin';
