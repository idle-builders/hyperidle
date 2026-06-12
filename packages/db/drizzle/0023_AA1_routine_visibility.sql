CREATE TABLE "routine_runs" (
	"id" text PRIMARY KEY NOT NULL,
	"routine_id" text NOT NULL,
	"started_at" text NOT NULL,
	"ended_at" text,
	"outcome" text NOT NULL,
	"cost_minor" integer,
	"cost_currency" text,
	"error_message" text
);
--> statement-breakpoint
ALTER TABLE "routines" ADD COLUMN "name" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "routines" ADD COLUMN "description" text;--> statement-breakpoint
ALTER TABLE "routines" ADD COLUMN "team_id" text NOT NULL;--> statement-breakpoint
ALTER TABLE "routines" ADD COLUMN "state" text DEFAULT 'active' NOT NULL;--> statement-breakpoint
ALTER TABLE "routines" ADD COLUMN "cost_actual_minor" integer;--> statement-breakpoint
ALTER TABLE "routines" ADD COLUMN "cost_actual_currency" text;--> statement-breakpoint
ALTER TABLE "sessions" ADD COLUMN "routine_id" text;--> statement-breakpoint
ALTER TABLE "routine_runs" ADD CONSTRAINT "routine_runs_routine_id_routines_id_fk" FOREIGN KEY ("routine_id") REFERENCES "routines"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "routine_runs_routine_id_idx" ON "routine_runs" USING btree ("routine_id","started_at");--> statement-breakpoint
ALTER TABLE "routines" ADD CONSTRAINT "routines_team_id_teams_id_fk" FOREIGN KEY ("team_id") REFERENCES "teams"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "routines_team_id_idx" ON "routines" USING btree ("team_id");--> statement-breakpoint
CREATE INDEX "sessions_routine_id_idx" ON "sessions" USING btree ("routine_id");