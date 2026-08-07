CREATE TABLE "filesystem_captures" (
	"id" text PRIMARY KEY NOT NULL,
	"session_id" text NOT NULL,
	"filesystem_id" text NOT NULL,
	"writeback" text NOT NULL,
	"capture_path" text NOT NULL,
	"commit_sha" text,
	"created_at" text NOT NULL
);
--> statement-breakpoint
ALTER TABLE "filesystem_captures" ADD CONSTRAINT "filesystem_captures_session_id_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "sessions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "filesystem_captures" ADD CONSTRAINT "filesystem_captures_filesystem_id_filesystems_id_fk" FOREIGN KEY ("filesystem_id") REFERENCES "filesystems"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "filesystem_captures_session_idx" ON "filesystem_captures" USING btree ("session_id");--> statement-breakpoint
CREATE INDEX "filesystem_captures_filesystem_idx" ON "filesystem_captures" USING btree ("filesystem_id");