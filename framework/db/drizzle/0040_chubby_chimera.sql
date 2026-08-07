CREATE TABLE "filesystem_injections" (
	"agent_user_id" text NOT NULL,
	"filesystem_id" text NOT NULL,
	"created_at" text NOT NULL,
	CONSTRAINT "filesystem_injections_agent_user_id_filesystem_id_pk" PRIMARY KEY("agent_user_id","filesystem_id")
);
--> statement-breakpoint
CREATE TABLE "filesystems" (
	"id" text PRIMARY KEY NOT NULL,
	"team_id" text NOT NULL,
	"source" text NOT NULL,
	"kind" text NOT NULL,
	"connection_id" text,
	"resource_ref" text NOT NULL,
	"writeback" text NOT NULL,
	"state" text DEFAULT 'attached' NOT NULL,
	"created_at" text NOT NULL
);
--> statement-breakpoint
ALTER TABLE "filesystem_injections" ADD CONSTRAINT "filesystem_injections_agent_user_id_users_id_fk" FOREIGN KEY ("agent_user_id") REFERENCES "users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "filesystem_injections" ADD CONSTRAINT "filesystem_injections_filesystem_id_filesystems_id_fk" FOREIGN KEY ("filesystem_id") REFERENCES "filesystems"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "filesystems" ADD CONSTRAINT "filesystems_team_id_teams_id_fk" FOREIGN KEY ("team_id") REFERENCES "teams"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "filesystem_injections_agent_user_idx" ON "filesystem_injections" USING btree ("agent_user_id");--> statement-breakpoint
CREATE INDEX "filesystem_injections_filesystem_idx" ON "filesystem_injections" USING btree ("filesystem_id");--> statement-breakpoint
CREATE INDEX "filesystems_team_idx" ON "filesystems" USING btree ("team_id");