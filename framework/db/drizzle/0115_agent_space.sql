-- An agent's space on its computer and whose program login it uses.
ALTER TABLE "agent_run_config" ADD COLUMN "space_path" text;
--> statement-breakpoint
ALTER TABLE "agent_run_config" ADD COLUMN "login" text DEFAULT 'owner' NOT NULL;
--> statement-breakpoint
ALTER TABLE "agent_run_config" ADD CONSTRAINT "agent_run_config_login_ck" CHECK ("login" in ('own', 'owner'));
