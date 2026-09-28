-- Three relevance signals as first-class data
-- Adds knowledge_access_log table and new columns on knowledge_items.

CREATE TABLE "knowledge_access_log" (
	"id" text PRIMARY KEY NOT NULL,
	"item_id" text NOT NULL,
	"accessor_kind" text NOT NULL,
	"accessor_id" text NOT NULL,
	"accessed_at" text NOT NULL,
	CONSTRAINT "knowledge_access_log_item_id_knowledge_items_id_fk" FOREIGN KEY ("item_id") REFERENCES "knowledge_items"("id") ON DELETE RESTRICT ON UPDATE NO ACTION
);
--> statement-breakpoint
CREATE INDEX "kal_item_accessed_idx" ON "knowledge_access_log" USING btree ("item_id","accessed_at");
--> statement-breakpoint
ALTER TABLE "knowledge_items" ADD COLUMN "relevance_score" real;
--> statement-breakpoint
ALTER TABLE "knowledge_items" ADD COLUMN "citation_count" integer;
--> statement-breakpoint
ALTER TABLE "knowledge_items" ADD COLUMN "last_cited_at" text;
