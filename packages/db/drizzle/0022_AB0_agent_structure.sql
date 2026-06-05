-- AB0: Add agent_category to users and functions to teams
ALTER TABLE "users" ADD COLUMN "agent_category" text;--> statement-breakpoint
ALTER TABLE "teams" ADD COLUMN "functions" text;
