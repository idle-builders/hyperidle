-- L7: pause_checkpoint column on sessions (PostgreSQL parity).
-- Mirrors drizzle/0012_l7_session_pause_checkpoint.sql.
ALTER TABLE "sessions" ADD COLUMN "pause_checkpoint" text;
