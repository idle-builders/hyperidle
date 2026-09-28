-- Add harness URL and token accounting columns to sessions table.
-- All three columns are nullable — existing rows predate these fields.
ALTER TABLE sessions ADD COLUMN harness_url TEXT;
--> statement-breakpoint
ALTER TABLE sessions ADD COLUMN tokens_input INTEGER;
--> statement-breakpoint
ALTER TABLE sessions ADD COLUMN tokens_output INTEGER;
