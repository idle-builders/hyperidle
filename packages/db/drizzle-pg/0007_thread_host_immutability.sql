-- L1a step9 (Adv-C4) — enforce host immutability on the threads table.
--
-- Plan §5.1 + concept §4.5.8 hard-rule: `host_kind` and `host_id` are
-- immutable post-creation. SQLite parity in `drizzle/0008_thread_host_immutability.sql`.
-- Postgres needs a trigger function plus the trigger itself; SQLite gets
-- away with an inline `RAISE` because its trigger language is in-band SQL.
--
-- @lore L1 step9: this trigger guards the column at the storage layer so
-- service-layer mutations through Drizzle's `update()` API cannot drift
-- the host without a deliberate migration.

CREATE OR REPLACE FUNCTION threads_host_immutable_fn()
RETURNS trigger AS $$
BEGIN
	IF NEW.host_kind <> OLD.host_kind THEN
		RAISE EXCEPTION 'thread host_kind is immutable (L1 §5.1)';
	END IF;
	IF NEW.host_id <> OLD.host_id THEN
		RAISE EXCEPTION 'thread host_id is immutable (L1 §5.1)';
	END IF;
	RETURN NEW;
END;
$$ LANGUAGE plpgsql;--> statement-breakpoint

DROP TRIGGER IF EXISTS threads_host_immutable_trg ON "threads";--> statement-breakpoint

CREATE TRIGGER threads_host_immutable_trg
BEFORE UPDATE ON "threads"
FOR EACH ROW
EXECUTE FUNCTION threads_host_immutable_fn();
