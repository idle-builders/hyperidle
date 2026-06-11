ALTER TABLE "notification_queue" ADD COLUMN "type_key" text;--> statement-breakpoint
ALTER TABLE "notification_queue" ADD COLUMN "urgency" text;--> statement-breakpoint
ALTER TABLE "notification_queue" ADD COLUMN "source_link" text;--> statement-breakpoint
ALTER TABLE "notification_queue" ADD COLUMN "seen_at" text;--> statement-breakpoint
ALTER TABLE "notification_queue" ADD COLUMN "read_at" text;--> statement-breakpoint
CREATE INDEX "nq_inapp_idx" ON "notification_queue" USING btree ("read_at","created_at");