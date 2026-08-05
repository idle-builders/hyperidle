CREATE TABLE "artifacts" (
	"id" text PRIMARY KEY NOT NULL,
	"producing_task_id" text NOT NULL,
	"kind" text NOT NULL,
	"preview_json" text,
	"cost_money_micros" bigint,
	"cost_tokens_input" bigint,
	"cost_tokens_output" bigint,
	"cost_settled_at" text,
	"created_at" text NOT NULL
);
--> statement-breakpoint
ALTER TABLE "artifacts" ADD CONSTRAINT "artifacts_producing_task_id_tasks_id_fk" FOREIGN KEY ("producing_task_id") REFERENCES "tasks"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "artifacts_producing_task_id_idx" ON "artifacts" USING btree ("producing_task_id");--> statement-breakpoint
CREATE INDEX "artifacts_created_at_idx" ON "artifacts" USING btree ("created_at");
