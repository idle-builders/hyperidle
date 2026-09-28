-- Purge strategy agent category and soft-delete builtin routines.
--
-- 1. Soft-delete all builtin routine rows. `routine_runs.routineId` references
--    `routines.id` with ON DELETE RESTRICT, so any install where a retro ever
--    ran cannot hard-delete them. The product's own soft-delete column pair
--    (`active`, `deleted_at`) is the product's soft-delete column pair.
--
-- 2. Migrate every `strategy` agent-category row to `individual`. The five
--    seeded facilitators are the normal case; any agent created via the API
--    with a strategy-category catalog role is also covered. The row count
--    is unchanged (no deletes) — `users.id` is referenced with RESTRICT from
--    `items.sourceAgentId` and `routines.ownerAgentId`, so a delete fails on
--    any install where a retro or knowledge item was created by these agents.

UPDATE routines
SET active = false,
    deleted_at = NOW()
WHERE id LIKE 'builtin:%'
  AND deleted_at IS NULL;
--> statement-breakpoint
UPDATE users
SET agent_category = 'individual'
WHERE agent_category = 'strategy';
