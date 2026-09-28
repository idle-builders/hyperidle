-- Enforce host immutability on the threads table.
--
-- Hard-rule: `host_kind` and `host_id` are
-- immutable post-creation. The routes don't expose a PATCH endpoint
-- for these fields, but service-layer writes can mutate the threads row via
-- Drizzle's `update()` API. A SQLite trigger raises an error if a future
-- code path drifts the host. Forward-only.
--
CREATE TRIGGER IF NOT EXISTS threads_host_kind_immutable
BEFORE UPDATE OF host_kind ON threads
FOR EACH ROW
WHEN OLD.host_kind <> NEW.host_kind
BEGIN
	SELECT RAISE(ABORT, 'thread host_kind is immutable');
END;--> statement-breakpoint

CREATE TRIGGER IF NOT EXISTS threads_host_id_immutable
BEFORE UPDATE OF host_id ON threads
FOR EACH ROW
WHEN OLD.host_id <> NEW.host_id
BEGIN
	SELECT RAISE(ABORT, 'thread host_id is immutable');
END;
