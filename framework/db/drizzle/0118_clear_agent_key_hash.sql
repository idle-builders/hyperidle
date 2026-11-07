-- After the runner-program split, the runner only auto-takes agents whose
-- key_hash is NULL (no runner holds them yet). Existing deployments that ran
-- the in-process runner have key_hash populated for every AI agent. Clear it
-- so the new standalone runner can claim them on first start.

UPDATE "users" SET "key_hash" = NULL WHERE "kind" = 'ai';
