CREATE TABLE "task_snoozes" (
	"user_id" text NOT NULL,
	"task_id" text NOT NULL,
	"snoozed_until" text NOT NULL,
	"created_at" text NOT NULL,
	CONSTRAINT "task_snoozes_user_id_task_id_pk" PRIMARY KEY("user_id","task_id")
);
--> statement-breakpoint
ALTER TABLE "task_snoozes" ADD CONSTRAINT "task_snoozes_task_id_tasks_id_fk" FOREIGN KEY ("task_id") REFERENCES "public"."tasks"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "task_snoozes_user_until_idx" ON "task_snoozes" USING btree ("user_id","snoozed_until");
