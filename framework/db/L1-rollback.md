# L1 Thread primitive — Rollback runbook

**Status.** L1a (`drizzle/0007_thread_primitive_l1.sql`,
`drizzle/0008_thread_host_immutability.sql`) is forward-only. The migrations
also write **snapshot tables** (`_l1_snapshot_threads`, `_l1_snapshot_messages`,
`_l1_snapshot_items`, `_l1_snapshot_responses`) that retain the pre-migration
data for **30 days**. This document is the recovery procedure if a critical
defect is discovered after deploy.

> Rolling back is destructive: any data written after L1a goes live is lost.
> Prefer a forward fix unless the corruption is structural.

## Pre-conditions

1. The defect is reproducible and not fixable forward in <2h.
2. The 30-day retention window has not yet expired
   (`SELECT name FROM sqlite_master WHERE name LIKE '_l1_snapshot_%'`).
3. The downstream subscribers (Knowledge Fabric, Harness Adapter) are paused.
4. A full DB backup of the current state exists outside the snapshot tables.

## Rollback steps (SQLite)

The mechanical procedure is:

1. **Pause writers.** Stop the Hono server, the bet-state-machine worker, the
   policy-engine cron, and the routine runner. Drain BullMQ to zero.
2. **Capture a delta backup.** `cp hyperidle.db hyperidle.db.pre-rollback` —
   you may need this if rollback itself fails partway.
3. **Apply rollback SQL** (see template below). The script:
   1. Creates the *pre-L1a* tables (`threads_old`, `messages_old`,
      `responses_old`, `items_old`) from the snapshot tables.
   2. Drops the L1a tables.
   3. Renames the `_old` tables back to `threads` / `messages` / `responses` /
      `items`.
   4. Restores the legacy indexes (`messages_thread_id_idx` etc).
   5. Drops the L1a host-immutability triggers.
4. **Re-baseline drizzle journal.** Edit `framework/db/drizzle/meta/_journal.json`
   to remove the entries for `0007_thread_primitive_l1` and
   `0008_thread_host_immutability` so the migrator does not re-apply them on
   the next start.
5. **Re-point downstream subscribers.** Knowledge Fabric and Harness Adapter
   moved to the new `thread_*` event types in L1a — temporarily roll those
   back to listening on `item_created` + `response_recorded`. The legacy
   parallel emit was kept for one release per plan §13 Risk note.
6. **Restart writers.** Verify `/api/health` and a smoke `POST
   /api/conversations/responses` (the legacy verdict surface that was
   restored).

## Rollback SQL template (SQLite)

```sql
BEGIN IMMEDIATE TRANSACTION;
PRAGMA defer_foreign_keys = ON;
PRAGMA foreign_keys = OFF;

-- Restore from snapshots.
CREATE TABLE threads_old AS SELECT * FROM _l1_snapshot_threads;
CREATE TABLE messages_old AS SELECT * FROM _l1_snapshot_messages;
CREATE TABLE items_old AS SELECT * FROM _l1_snapshot_items;
CREATE TABLE responses_old AS SELECT * FROM _l1_snapshot_responses;

-- Drop L1a tables and triggers.
DROP TRIGGER IF EXISTS threads_host_kind_immutable;
DROP TRIGGER IF EXISTS threads_host_id_immutable;
DROP TABLE messages;
DROP TABLE threads;

-- Promote restored copies.
ALTER TABLE threads_old RENAME TO threads;
ALTER TABLE messages_old RENAME TO messages;
ALTER TABLE items_old RENAME TO items;
ALTER TABLE responses_old RENAME TO responses;

-- Restore legacy indexes (IDs from migration 0003).
CREATE INDEX IF NOT EXISTS messages_thread_id_idx ON messages(thread_id);

PRAGMA foreign_keys = ON;
COMMIT;
```

## Postgres rollback

The PG analogue lives in `drizzle-pg/0006_thread_primitive_l1.sql` and
`drizzle-pg/0007_thread_host_immutability.sql`. The structural mirror of
the SQLite rollback applies; the additional steps are:

1. `DROP TRIGGER threads_host_immutable_trg ON "threads"`.
2. `DROP FUNCTION threads_host_immutable_fn`.
3. The pre-rollback FK constraints on `messages.recipient_id` and
   `responses.{item_id, approver_id}` must be re-created — pull them from
   the SQL header of migration 0003.

## Post-rollback validation queries

```sql
-- The new columns are gone; the old ones return.
PRAGMA table_info(threads);   -- includes `kind`; excludes `host_kind`
PRAGMA table_info(messages);  -- includes `recipient_id`; excludes `type`
SELECT count(*) FROM responses;   -- non-zero (matches the snapshot count)

-- The triggers are gone.
SELECT name FROM sqlite_master WHERE type = 'trigger' AND name LIKE 'threads_host_%';
-- → 0 rows

-- Snapshots are still present (30-day retention) so a second forward
-- attempt has data to project from.
SELECT name FROM sqlite_master WHERE name LIKE '_l1_snapshot_%';
-- → _l1_snapshot_threads, _l1_snapshot_messages, _l1_snapshot_items,
--   _l1_snapshot_responses
```

## Downstream subscribers to re-point

| Subscriber | New (L1a) topic | Rollback to |
|---|---|---|
| Knowledge Fabric | `thread_message_appended` | `item_created` |
| Harness Adapter | `thread_resolved` | `response_recorded` |
| Submenu refresh (web) | `thread_created` on `conversations` | `item_created` on `conversations` |
| ConversationsReview page | `thread:<id>` per-thread topic | (no rollback — page is L1a-only; revert frontend to the previous `MockReviewItem` page if needed) |

## Snapshot retention cleanup (30 days post-deploy)

When 30 days pass without a rollback, drop the snapshot tables to reclaim
space:

```sql
DROP TABLE _l1_snapshot_threads;
DROP TABLE _l1_snapshot_messages;
DROP TABLE _l1_snapshot_items;
DROP TABLE _l1_snapshot_responses;
```

Track this in a follow-up cleanup story; do NOT bake the drop into the
forward migration.
