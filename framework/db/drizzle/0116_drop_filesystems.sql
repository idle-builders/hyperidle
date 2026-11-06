-- Drop filesystem_injections first (FK → filesystems), then filesystems.
-- @lore: folders are now space symlinks — no DB rows for them, so the registry tables are dropped clean
DROP TABLE IF EXISTS "filesystem_injections";
--> statement-breakpoint
DROP TABLE IF EXISTS "filesystems";
