-- items.layer is write-only dead code. The review-item factory sourced it
-- from knowledgeAppProjection.layer, dropped in 0080, so both its callers
-- could only ever pass null; the create_item tool's own `layer` input had
-- no reader anywhere in the app either. Every producer (review-item-factory,
-- the create_item tool, POST /conversations/items) is removed alongside the
-- column. Destructive, per house rule: no compat column, no dual-write.
ALTER TABLE "items" DROP COLUMN "layer";
