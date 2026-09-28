-- Remove harnessDisabled key from server_config JSON blob (item 1).
-- config is TEXT; cast to jsonb to use the key-delete operator, cast back to text.
UPDATE server_config
SET config = (config::jsonb - 'harnessDisabled')::text
WHERE config::jsonb ? 'harnessDisabled';
--> statement-breakpoint

-- Drop effectiveness columns from sessions (item 2).
ALTER TABLE sessions DROP COLUMN IF EXISTS effectiveness_score;
--> statement-breakpoint
ALTER TABLE sessions DROP COLUMN IF EXISTS effectiveness_recorded_at;
--> statement-breakpoint
ALTER TABLE sessions DROP COLUMN IF EXISTS effectiveness_recorded_by;
--> statement-breakpoint

-- Drop server_config — no production code reads or writes it any more (item 3).
DROP TABLE IF EXISTS server_config;
