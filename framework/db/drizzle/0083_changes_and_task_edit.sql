-- the `changes` table — the event log an object's edit action appends one
-- row to, in the same transaction as the write. Not an audit control, no
-- gate; the source for subscriptions and the UI stream.
--
-- `tasks.audit_trail` is dropped in the same migration: nothing reads it, and
-- the `changes` table takes its place. Destructive, per house rule: no compat column,
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
