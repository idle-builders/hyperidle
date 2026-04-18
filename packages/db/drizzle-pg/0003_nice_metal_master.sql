ALTER TABLE "agent_skills" DROP CONSTRAINT "agent_skills_agent_id_agents_id_fk";
--> statement-breakpoint
ALTER TABLE "agents" DROP CONSTRAINT "agents_team_id_teams_id_fk";
--> statement-breakpoint
ALTER TABLE "bets" DROP CONSTRAINT "bets_product_id_products_id_fk";
--> statement-breakpoint
ALTER TABLE "bets" DROP CONSTRAINT "bets_team_id_teams_id_fk";
--> statement-breakpoint
ALTER TABLE "file_leases" DROP CONSTRAINT "file_leases_agent_id_agents_id_fk";
--> statement-breakpoint
ALTER TABLE "items" DROP CONSTRAINT "items_source_agent_id_agents_id_fk";
--> statement-breakpoint
ALTER TABLE "items" DROP CONSTRAINT "items_thread_id_threads_id_fk";
--> statement-breakpoint
ALTER TABLE "knowledge_conflicts" DROP CONSTRAINT "knowledge_conflicts_item_id_knowledge_items_id_fk";
--> statement-breakpoint
ALTER TABLE "knowledge_edit_log" DROP CONSTRAINT "knowledge_edit_log_item_id_knowledge_items_id_fk";
--> statement-breakpoint
ALTER TABLE "messages" DROP CONSTRAINT "messages_sender_id_agents_id_fk";
--> statement-breakpoint
ALTER TABLE "messages" DROP CONSTRAINT "messages_recipient_id_agents_id_fk";
--> statement-breakpoint
ALTER TABLE "messages" DROP CONSTRAINT "messages_thread_id_threads_id_fk";
--> statement-breakpoint
ALTER TABLE "responses" DROP CONSTRAINT "responses_item_id_items_id_fk";
--> statement-breakpoint
ALTER TABLE "routines" DROP CONSTRAINT "routines_owner_agent_id_agents_id_fk";
--> statement-breakpoint
ALTER TABLE "sessions" DROP CONSTRAINT "sessions_task_id_tasks_id_fk";
--> statement-breakpoint
ALTER TABLE "sessions" DROP CONSTRAINT "sessions_agent_id_agents_id_fk";
--> statement-breakpoint
ALTER TABLE "tasks" DROP CONSTRAINT "tasks_bet_id_bets_id_fk";
--> statement-breakpoint
ALTER TABLE "tasks" DROP CONSTRAINT "tasks_product_id_products_id_fk";
--> statement-breakpoint
ALTER TABLE "tasks" DROP CONSTRAINT "tasks_team_id_teams_id_fk";
--> statement-breakpoint
ALTER TABLE "tasks" DROP CONSTRAINT "tasks_owner_agent_id_agents_id_fk";
--> statement-breakpoint
ALTER TABLE "tasks" DROP CONSTRAINT "tasks_thread_id_threads_id_fk";
--> statement-breakpoint
ALTER TABLE "teams" DROP CONSTRAINT "teams_product_id_products_id_fk";
--> statement-breakpoint
-- Coerce existing 0/1 integer values to true/false. Drizzle generated a naive
-- `SET DATA TYPE boolean` that would fail on existing rows; the explicit
-- `USING CASE` preserves data per the I3 plan §3.8 (adversary finding).
ALTER TABLE "items" ALTER COLUMN "blocking" DROP DEFAULT;--> statement-breakpoint
ALTER TABLE "items" ALTER COLUMN "blocking" SET DATA TYPE boolean USING CASE WHEN "blocking" = 0 THEN false ELSE true END;--> statement-breakpoint
ALTER TABLE "items" ALTER COLUMN "blocking" SET DEFAULT false;--> statement-breakpoint
ALTER TABLE "routines" ALTER COLUMN "delegation_allowed" DROP DEFAULT;--> statement-breakpoint
ALTER TABLE "routines" ALTER COLUMN "delegation_allowed" SET DATA TYPE boolean USING CASE WHEN "delegation_allowed" = 0 THEN false ELSE true END;--> statement-breakpoint
ALTER TABLE "routines" ALTER COLUMN "delegation_allowed" SET DEFAULT false;--> statement-breakpoint
ALTER TABLE "routines" ALTER COLUMN "human_review" DROP DEFAULT;--> statement-breakpoint
ALTER TABLE "routines" ALTER COLUMN "human_review" SET DATA TYPE boolean USING CASE WHEN "human_review" = 0 THEN false ELSE true END;--> statement-breakpoint
ALTER TABLE "routines" ALTER COLUMN "human_review" SET DEFAULT false;--> statement-breakpoint
ALTER TABLE "routines" ALTER COLUMN "silent" DROP DEFAULT;--> statement-breakpoint
ALTER TABLE "routines" ALTER COLUMN "silent" SET DATA TYPE boolean USING CASE WHEN "silent" = 0 THEN false ELSE true END;--> statement-breakpoint
ALTER TABLE "routines" ALTER COLUMN "silent" SET DEFAULT false;--> statement-breakpoint
ALTER TABLE "routines" ALTER COLUMN "active" DROP DEFAULT;--> statement-breakpoint
ALTER TABLE "routines" ALTER COLUMN "active" SET DATA TYPE boolean USING CASE WHEN "active" = 0 THEN false ELSE true END;--> statement-breakpoint
ALTER TABLE "routines" ALTER COLUMN "active" SET DEFAULT true;--> statement-breakpoint
ALTER TABLE "tasks" ALTER COLUMN "cross_team" DROP DEFAULT;--> statement-breakpoint
ALTER TABLE "tasks" ALTER COLUMN "cross_team" SET DATA TYPE boolean USING CASE WHEN "cross_team" = 0 THEN false ELSE true END;--> statement-breakpoint
ALTER TABLE "tasks" ALTER COLUMN "cross_team" SET DEFAULT false;--> statement-breakpoint
ALTER TABLE "threads" ALTER COLUMN "pinned" DROP DEFAULT;--> statement-breakpoint
ALTER TABLE "threads" ALTER COLUMN "pinned" SET DATA TYPE boolean USING CASE WHEN "pinned" = 0 THEN false ELSE true END;--> statement-breakpoint
ALTER TABLE "threads" ALTER COLUMN "pinned" SET DEFAULT false;--> statement-breakpoint
ALTER TABLE "agent_skills" ADD CONSTRAINT "agent_skills_agent_id_agents_id_fk" FOREIGN KEY ("agent_id") REFERENCES "public"."agents"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agents" ADD CONSTRAINT "agents_team_id_teams_id_fk" FOREIGN KEY ("team_id") REFERENCES "public"."teams"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bets" ADD CONSTRAINT "bets_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bets" ADD CONSTRAINT "bets_team_id_teams_id_fk" FOREIGN KEY ("team_id") REFERENCES "public"."teams"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "file_leases" ADD CONSTRAINT "file_leases_agent_id_agents_id_fk" FOREIGN KEY ("agent_id") REFERENCES "public"."agents"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "items" ADD CONSTRAINT "items_source_agent_id_agents_id_fk" FOREIGN KEY ("source_agent_id") REFERENCES "public"."agents"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "items" ADD CONSTRAINT "items_thread_id_threads_id_fk" FOREIGN KEY ("thread_id") REFERENCES "public"."threads"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "knowledge_conflicts" ADD CONSTRAINT "knowledge_conflicts_item_id_knowledge_items_id_fk" FOREIGN KEY ("item_id") REFERENCES "public"."knowledge_items"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "knowledge_edit_log" ADD CONSTRAINT "knowledge_edit_log_item_id_knowledge_items_id_fk" FOREIGN KEY ("item_id") REFERENCES "public"."knowledge_items"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "messages" ADD CONSTRAINT "messages_sender_id_agents_id_fk" FOREIGN KEY ("sender_id") REFERENCES "public"."agents"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "messages" ADD CONSTRAINT "messages_recipient_id_agents_id_fk" FOREIGN KEY ("recipient_id") REFERENCES "public"."agents"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "messages" ADD CONSTRAINT "messages_thread_id_threads_id_fk" FOREIGN KEY ("thread_id") REFERENCES "public"."threads"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "responses" ADD CONSTRAINT "responses_item_id_items_id_fk" FOREIGN KEY ("item_id") REFERENCES "public"."items"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "routines" ADD CONSTRAINT "routines_owner_agent_id_agents_id_fk" FOREIGN KEY ("owner_agent_id") REFERENCES "public"."agents"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_task_id_tasks_id_fk" FOREIGN KEY ("task_id") REFERENCES "public"."tasks"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_agent_id_agents_id_fk" FOREIGN KEY ("agent_id") REFERENCES "public"."agents"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_bet_id_bets_id_fk" FOREIGN KEY ("bet_id") REFERENCES "public"."bets"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_team_id_teams_id_fk" FOREIGN KEY ("team_id") REFERENCES "public"."teams"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_owner_agent_id_agents_id_fk" FOREIGN KEY ("owner_agent_id") REFERENCES "public"."agents"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_thread_id_threads_id_fk" FOREIGN KEY ("thread_id") REFERENCES "public"."threads"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "teams" ADD CONSTRAINT "teams_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "bets_product_id_idx" ON "bets" USING btree ("product_id");--> statement-breakpoint
CREATE INDEX "bets_status_idx" ON "bets" USING btree ("status");--> statement-breakpoint
CREATE INDEX "items_thread_id_idx" ON "items" USING btree ("thread_id");--> statement-breakpoint
CREATE INDEX "messages_thread_id_idx" ON "messages" USING btree ("thread_id");--> statement-breakpoint
CREATE INDEX "sessions_task_id_idx" ON "sessions" USING btree ("task_id");--> statement-breakpoint
CREATE INDEX "sessions_agent_id_idx" ON "sessions" USING btree ("agent_id");--> statement-breakpoint
CREATE INDEX "sessions_state_idx" ON "sessions" USING btree ("state");--> statement-breakpoint
CREATE INDEX "tasks_bet_id_idx" ON "tasks" USING btree ("bet_id");--> statement-breakpoint
CREATE INDEX "tasks_team_id_idx" ON "tasks" USING btree ("team_id");--> statement-breakpoint
CREATE INDEX "tasks_product_id_idx" ON "tasks" USING btree ("product_id");--> statement-breakpoint
CREATE INDEX "tasks_state_idx" ON "tasks" USING btree ("state");