-- First-time hint progress tracking
CREATE TABLE IF NOT EXISTS "hint_progress" (
	"user_id" text NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
	"hint_id" text NOT NULL,
	"seen_at" text NOT NULL,
	PRIMARY KEY("user_id", "hint_id")
);
