-- Drop filesystem_injections first (FK → filesystems), then filesystems.
-- @lore: space folders are filesystem entries, not DB rows — the registry tables have no data to migrate
DROP TABLE IF EXISTS "filesystem_injections";
--> statement-breakpoint
DROP TABLE IF EXISTS "filesystems";
