-- the `changes` table — the event log `edit_task` (and, later, every
-- other object's edit action) appends one row to, in the same transaction as
-- the write. Not an audit control, no gate; the source for subscriptions and
-- the UI stream once every object's edit action feeds it.
--
-- `tasks.audit_trail` is dropped in the same migration: nothing reads it
-- (every writer is re-pointed or deleted in this change), and the `changes`
-- table is its replacement. Destructive, per house rule: no compat column,
-- no dual-write.
CREATE TABLE "changes" (
	"id" text PRIMARY KEY NOT NULL,
	"object" text NOT NULL,
	"object_id" text NOT NULL,
	"kind" text NOT NULL,
	"actor" text NOT NULL REFERENCES "users"("id") ON DELETE RESTRICT,
	"before" text,
	"after" text NOT NULL,
	"at" text NOT NULL,
	CONSTRAINT "changes_object_ck" CHECK ("object" in ('task','thread','document','user')),
	CONSTRAINT "changes_kind_ck" CHECK ("kind" in ('created','changed'))
);
--> statement-breakpoint
CREATE INDEX "changes_object_idx" ON "changes" ("object","object_id","at");
--> statement-breakpoint
CREATE INDEX "changes_at_idx" ON "changes" ("at");
--> statement-breakpoint
ALTER TABLE "tasks" DROP COLUMN "audit_trail";
