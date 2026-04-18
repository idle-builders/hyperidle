-- @lore I3 review O1: drop `tasks_state_idx`. The state column has very
-- low cardinality (~8 distinct values across the lifecycle), so the
-- index doesn't help selectivity meaningfully — full scan on a few-
-- hundred-row table is sub-ms. The dependency-watcher's `state='hold'`
-- predicate is selective enough on its own when combined with the
-- LIKE filter on `dependencies`. Removing the index reduces write
-- amplification on the busiest table.
DROP INDEX IF EXISTS "tasks_state_idx";
