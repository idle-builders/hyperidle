CREATE TABLE "knowledge_conflicts" (
	"id" text PRIMARY KEY NOT NULL,
	"item_id" text NOT NULL,
	"version_base" integer NOT NULL,
	"version_current" integer NOT NULL,
	"proposed_body" text NOT NULL,
	"proposed_meta" text,
	"proposed_by" text NOT NULL,
	"status" text DEFAULT 'open' NOT NULL,
	"resolved_by" text,
	"resolved_at" text,
	"created_at" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "notification_queue" (
	"id" text PRIMARY KEY NOT NULL,
	"event_type" text NOT NULL,
	"subject_id" text,
	"severity" text NOT NULL,
	"title" text NOT NULL,
	"body" text,
	"reason" text NOT NULL,
	"channel" text,
	"status" text NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"last_error" text,
	"created_at" text NOT NULL,
	"sent_at" text,
	"claimed_at" text
);
--> statement-breakpoint
ALTER TABLE "knowledge_items" ALTER COLUMN "attention_score" SET DATA TYPE real;--> statement-breakpoint
ALTER TABLE "knowledge_items" ALTER COLUMN "confidence" SET DATA TYPE real;--> statement-breakpoint
ALTER TABLE "tasks" ADD COLUMN "audit_trail" text;--> statement-breakpoint
ALTER TABLE "knowledge_conflicts" ADD CONSTRAINT "knowledge_conflicts_item_id_knowledge_items_id_fk" FOREIGN KEY ("item_id") REFERENCES "knowledge_items"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "nq_status_created_idx" ON "notification_queue" USING btree ("status","created_at");--> statement-breakpoint
CREATE INDEX "nq_severity_idx" ON "notification_queue" USING btree ("severity");--> statement-breakpoint
CREATE INDEX "ki_layer_scope_idx" ON "knowledge_items" USING btree ("layer","scope_id");--> statement-breakpoint
CREATE INDEX "ki_attention_desc_idx" ON "knowledge_items" USING btree ("attention_score");--> statement-breakpoint
CREATE INDEX "ki_updated_desc_idx" ON "knowledge_items" USING btree ("updated_at");