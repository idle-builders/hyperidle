-- Repair agents pinned to a harness type no adapter registers under.
--
-- The demo world seeded `agent_run_config.harness_type = 'claude'`, but the
-- Claude Code adapter registers as 'claude-code'. Selection compares the
-- string for exact equality, so those agents could never be selected: every
-- run failed at admission with NoEligibleHarnessError, and — until the
-- diagnosis change that ships alongside this — recorded no reason at all.
--
-- Fixing the seed only helps databases created after it. Any database already
-- carrying the value stays broken, so the rows are repaired here.
--
-- 'claude' is not a near-synonym being normalised; it is a value the
-- vocabulary never contained. Anything else outside the vocabulary is left
-- alone: a value we cannot confidently map is a decision for whoever set it,
-- not a silent rewrite.
UPDATE agent_run_config
SET harness_type = 'claude-code'
WHERE harness_type = 'claude';
