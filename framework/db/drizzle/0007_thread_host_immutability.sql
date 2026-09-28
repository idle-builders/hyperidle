-- Enforce host immutability on the threads table.
--
-- Hard-rule: `host_kind` and `host_id` are
-- immutable post-creation. SQLite parity in `drizzle/0008_thread_host_immutability.sql`.
-- Postgres needs a trigger function plus the trigger itself; SQLite gets
-- away with an inline `RAISE` because its trigger language is in-band SQL.
--
CREATE OR REPLACE FUNCTION threads_host_immutable_fn()
RETURNS trigger AS $$
BEGIN
	IF NEW.host_kind <> OLD.host_kind THEN
		RAISE EXCEPTION 'thread host_kind is immutable';
	END IF;
	IF NEW.host_id <> OLD.host_id THEN
		RAISE EXCEPTION 'thread host_id is immutable';
	END IF;
	RETURN NEW;
END;
$$ LANGUAGE plpgsql;--> statement-breakpoint

DROP TRIGGER IF EXISTS threads_host_immutable_trg ON "threads";--> statement-breakpoint

CREATE TRIGGER threads_host_immutable_trg
BEFORE UPDATE ON "threads"
FOR EACH ROW
EXECUTE FUNCTION threads_host_immutable_fn();
