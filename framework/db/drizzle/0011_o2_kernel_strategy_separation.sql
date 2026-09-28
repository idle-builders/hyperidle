-- Kernel/strategy separation.
--
-- Moves strategy-layer signals from the kernel tables to a dedicated
-- knowledge_strategy_fabric extension table (1:1 via UNIQUE FK).
-- Drops cost columns from sessions and artifacts (cost is now a
-- strategy concern tracked at the agent/team level).
-- Drops attentionScore/costEstimate from the items (human-interface) table.

-- 1. Create knowledge_strategy_fabric
CREATE TABLE "knowledge_strategy_fabric" (
    "id" text PRIMARY KEY NOT NULL,
    "knowledge_item_id" text NOT NULL UNIQUE,
    "layer" text,
    "scope_id" text,
    "kind" text,
    "attention_score" text,
    "relevance_score" text,
    "confidence" text,
    "citation_count" integer,
    "last_cited_at" text,
    "meta" text,
    CONSTRAINT "knowledge_strategy_fabric_knowledge_item_id_knowledge_items_id_fk"
        FOREIGN KEY ("knowledge_item_id") REFERENCES "knowledge_items"("id") ON DELETE CASCADE ON UPDATE NO ACTION
);
--> statement-breakpoint
CREATE INDEX "ksf_knowledge_item_id_idx" ON "knowledge_strategy_fabric" USING btree ("knowledge_item_id");
--> statement-breakpoint
CREATE INDEX "ksf_layer_idx" ON "knowledge_strategy_fabric" USING btree ("layer");
--> statement-breakpoint
CREATE INDEX "ksf_kind_idx" ON "knowledge_strategy_fabric" USING btree ("kind");
--> statement-breakpoint

-- 2. Drop strategy columns from knowledge_items.
ALTER TABLE "knowledge_items" DROP COLUMN IF EXISTS "layer";
--> statement-breakpoint
ALTER TABLE "knowledge_items" DROP COLUMN IF EXISTS "scope_id";
--> statement-breakpoint
ALTER TABLE "knowledge_items" DROP COLUMN IF EXISTS "kind";
--> statement-breakpoint
ALTER TABLE "knowledge_items" DROP COLUMN IF EXISTS "attention_score";
--> statement-breakpoint
ALTER TABLE "knowledge_items" DROP COLUMN IF EXISTS "confidence";
--> statement-breakpoint
ALTER TABLE "knowledge_items" DROP COLUMN IF EXISTS "meta";
--> statement-breakpoint
ALTER TABLE "knowledge_items" DROP COLUMN IF EXISTS "relevance_score";
--> statement-breakpoint
ALTER TABLE "knowledge_items" DROP COLUMN IF EXISTS "citation_count";
--> statement-breakpoint
ALTER TABLE "knowledge_items" DROP COLUMN IF EXISTS "last_cited_at";
--> statement-breakpoint

-- 3. Drop cost columns from sessions (cost is a strategy concern).
ALTER TABLE "sessions" DROP COLUMN IF EXISTS "cost";
--> statement-breakpoint
ALTER TABLE "sessions" DROP COLUMN IF EXISTS "cost_minor";
--> statement-breakpoint
ALTER TABLE "sessions" DROP COLUMN IF EXISTS "cost_currency";
--> statement-breakpoint

-- 4. Drop cost columns from artifacts.
ALTER TABLE "artifacts" DROP COLUMN IF EXISTS "cost_money_micros";
--> statement-breakpoint
ALTER TABLE "artifacts" DROP COLUMN IF EXISTS "cost_tokens_input";
--> statement-breakpoint
ALTER TABLE "artifacts" DROP COLUMN IF EXISTS "cost_tokens_output";
--> statement-breakpoint
ALTER TABLE "artifacts" DROP COLUMN IF EXISTS "cost_settled_at";
--> statement-breakpoint

-- 5. Drop attentionScore and costEstimate from the items (human-interface) table.
ALTER TABLE "items" DROP COLUMN IF EXISTS "attention_score";
--> statement-breakpoint
ALTER TABLE "items" DROP COLUMN IF EXISTS "cost_estimate";
--> statement-breakpoint

-- 3b. Drop harness/token columns from sessions.
ALTER TABLE "sessions" DROP COLUMN IF EXISTS "tokens_json";
--> statement-breakpoint
ALTER TABLE "sessions" DROP COLUMN IF EXISTS "trace_id";
--> statement-breakpoint
ALTER TABLE "sessions" DROP COLUMN IF EXISTS "harness_url";
--> statement-breakpoint
ALTER TABLE "sessions" DROP COLUMN IF EXISTS "tokens_input";
--> statement-breakpoint
ALTER TABLE "sessions" DROP COLUMN IF EXISTS "tokens_output";
--> statement-breakpoint

-- 4b. Drop strategy columns from items table.
ALTER TABLE "items" DROP COLUMN IF EXISTS "reversibility";
--> statement-breakpoint
ALTER TABLE "items" DROP COLUMN IF EXISTS "sandbox_result";
--> statement-breakpoint

-- 7. Drop strategy columns from tasks table.
ALTER TABLE "tasks" DROP COLUMN IF EXISTS "durability";
--> statement-breakpoint
ALTER TABLE "tasks" DROP COLUMN IF EXISTS "risk_tier";
--> statement-breakpoint
ALTER TABLE "tasks" DROP COLUMN IF EXISTS "attention_score";
--> statement-breakpoint
ALTER TABLE "tasks" DROP COLUMN IF EXISTS "cross_team";
--> statement-breakpoint

-- 6. Create task_strategy_fabric (tasks strategy signals)
CREATE TABLE IF NOT EXISTS "task_strategy_fabric" (
    "id" text PRIMARY KEY NOT NULL,
    "task_id" text NOT NULL UNIQUE,
    "risk_tier" text,
    CONSTRAINT "task_strategy_fabric_task_id_tasks_id_fk"
        FOREIGN KEY ("task_id") REFERENCES "tasks"("id") ON DELETE CASCADE ON UPDATE NO ACTION
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "tsf_task_id_idx" ON "task_strategy_fabric" USING btree ("task_id");
