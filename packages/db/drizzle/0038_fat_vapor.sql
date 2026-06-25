CREATE TABLE "surface_adoptions" (
	"id" text PRIMARY KEY NOT NULL,
	"team_id" text NOT NULL,
	"tool" text NOT NULL,
	"kind" text NOT NULL,
	"surface_id" text NOT NULL,
	"pinned_version" text NOT NULL,
	"provenance" text NOT NULL,
	"trust_tier" text NOT NULL,
	"adopted_by" text NOT NULL,
	"created_at" text NOT NULL,
	"updated_at" text NOT NULL
);
--> statement-breakpoint
ALTER TABLE "tailored_grants" ALTER COLUMN "arg_pinned" SET DATA TYPE boolean;--> statement-breakpoint
ALTER TABLE "tailored_grants" ALTER COLUMN "consumed" SET DATA TYPE boolean;--> statement-breakpoint
ALTER TABLE "surface_adoptions" ADD CONSTRAINT "surface_adoptions_team_id_teams_id_fk" FOREIGN KEY ("team_id") REFERENCES "teams"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "surface_adoptions" ADD CONSTRAINT "surface_adoptions_adopted_by_users_id_fk" FOREIGN KEY ("adopted_by") REFERENCES "users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "surface_adoptions_team_situation_idx" ON "surface_adoptions" USING btree ("team_id","tool","kind");--> statement-breakpoint
CREATE INDEX "surface_adoptions_team_idx" ON "surface_adoptions" USING btree ("team_id");