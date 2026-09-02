-- Nested knowledge items: the tree, and the retirement of topic/kind/layer
-- and the product/practice/task scope values.
--
-- Order matters (architecture.md §7 — an earlier draft had it wrong):
--   1. add `position`.
--   2. seed the three grouping roots (Product, Practices, General).
--   3. topic items for product-scoped rows, under Product.
--   4. one item per practice under Practices; a practice row's own topic is
--      preserved as a topic item under that practice, not discarded.
--   5. product rows: scope -> 'team' (scope_id UNCHANGED — already a team
--      id, feasibility.md finding 1); parent -> their topic item / Product.
--   6. every remaining ordinary row: its topic item, or General.
--   7. task-scoped rows: parent_kind='task', parent_id=scope_id, guarded
--      against a dangling task id (RAISE EXCEPTION, precedent: 0077 §4).
--   8. `role <> 'ordinary'` rows (0077's agent identities / routine prompts)
--      are never touched — every reparenting step above is scoped to
--      `role = 'ordinary'`, so they keep the parent 0077 gave them.
--   9. collapse status onto proposed | active | stale | archived.
--  10. drop topic (kernel) and layer/kind (projection).
--
-- Destructive, per house rule: no compat column, no dual-write, no alias.

-- 1. position: sibling ordering within one parent (or among roots).
ALTER TABLE "knowledge_items" ADD COLUMN "position" integer NOT NULL DEFAULT 0;
--> statement-breakpoint
CREATE INDEX "ki_parent_position_idx" ON "knowledge_items" ("parent_kind", "parent_id", "position");
--> statement-breakpoint

-- 2. The three grouping roots. Factory-scoped, no parent, ordinary role.
INSERT INTO "knowledge_items"
  (id, scope_kind, scope_id, title, body, format, status, version, role, parent_kind, parent_id, position, updated_by, created_at, updated_at)
VALUES
  ('ki-mig-root-product', 'factory', NULL, 'Product', 'Product knowledge.', 'markdown', 'active', 1, 'ordinary', NULL, NULL, 0, 'system', now()::text, now()::text),
  ('ki-mig-root-practices', 'factory', NULL, 'Practices', 'Practice knowledge, one folder per practice.', 'markdown', 'active', 1, 'ordinary', NULL, NULL, 1, 'system', now()::text, now()::text),
  ('ki-mig-root-general', 'factory', NULL, 'General', 'Knowledge with no more specific home.', 'markdown', 'active', 1, 'ordinary', NULL, NULL, 2, 'system', now()::text, now()::text);
--> statement-breakpoint
INSERT INTO "knowledge_app_projection" (id, knowledge_item_id, scope_id)
VALUES
  ('kp-ki-mig-root-product', 'ki-mig-root-product', NULL),
  ('kp-ki-mig-root-practices', 'ki-mig-root-practices', NULL),
  ('kp-ki-mig-root-general', 'ki-mig-root-general', NULL);
--> statement-breakpoint

-- 3. One topic item per distinct topic among product-scoped rows, under Product.
INSERT INTO "knowledge_items"
  (id, scope_kind, scope_id, title, body, format, status, version, role, parent_kind, parent_id, position, updated_by, created_at, updated_at)
SELECT 'ki-mig-topic-product-' || md5(topic), 'factory', NULL, topic, topic, 'markdown', 'active', 1, 'ordinary', 'knowledge_item', 'ki-mig-root-product', 0, 'system', now()::text, now()::text
FROM (SELECT DISTINCT topic FROM knowledge_items WHERE scope_kind = 'product' AND role = 'ordinary' AND parent_kind IS NULL AND topic IS NOT NULL) t;
--> statement-breakpoint
INSERT INTO "knowledge_app_projection" (id, knowledge_item_id, scope_id)
SELECT 'kp-' || id, id, NULL FROM knowledge_items WHERE id LIKE 'ki-mig-topic-product-%';
--> statement-breakpoint

-- 4a. Practice items: one per distinct practice (scope_id), under Practices.
INSERT INTO "knowledge_items"
  (id, scope_kind, scope_id, title, body, format, status, version, role, parent_kind, parent_id, position, updated_by, created_at, updated_at)
SELECT 'ki-mig-practice-' || scope_id, 'factory', NULL,
       initcap(replace(replace(scope_id, '_', ' '), '-', ' ')),
       'Knowledge for the ' || initcap(replace(replace(scope_id, '_', ' '), '-', ' ')) || ' practice.',
       'markdown', 'active', 1, 'ordinary', 'knowledge_item', 'ki-mig-root-practices', 0, 'system', now()::text, now()::text
FROM (SELECT DISTINCT scope_id FROM knowledge_items WHERE scope_kind = 'practice' AND role = 'ordinary' AND parent_kind IS NULL AND scope_id IS NOT NULL) p;
--> statement-breakpoint
INSERT INTO "knowledge_app_projection" (id, knowledge_item_id, scope_id)
SELECT 'kp-' || id, id, NULL FROM knowledge_items WHERE id LIKE 'ki-mig-practice-%';
--> statement-breakpoint

-- 4b. Topic items under each practice — the topic on a practice row is
--     PRESERVED, not discarded.
INSERT INTO "knowledge_items"
  (id, scope_kind, scope_id, title, body, format, status, version, role, parent_kind, parent_id, position, updated_by, created_at, updated_at)
SELECT 'ki-mig-topic-practice-' || scope_id || '-' || md5(topic), 'factory', NULL, topic, topic, 'markdown', 'active', 1, 'ordinary', 'knowledge_item', 'ki-mig-practice-' || scope_id, 0, 'system', now()::text, now()::text
FROM (SELECT DISTINCT scope_id, topic FROM knowledge_items WHERE scope_kind = 'practice' AND role = 'ordinary' AND parent_kind IS NULL AND scope_id IS NOT NULL AND topic IS NOT NULL) pt;
--> statement-breakpoint
INSERT INTO "knowledge_app_projection" (id, knowledge_item_id, scope_id)
SELECT 'kp-' || id, id, NULL FROM knowledge_items WHERE id LIKE 'ki-mig-topic-practice-%';
--> statement-breakpoint

-- 4c. Reparent practice rows: topic-bearing rows go under their practice's
--     topic item; topicless rows go directly under the practice item.
UPDATE "knowledge_items" SET
  scope_kind = 'factory',
  parent_kind = 'knowledge_item',
  parent_id = 'ki-mig-topic-practice-' || scope_id || '-' || md5(topic)
WHERE scope_kind = 'practice' AND role = 'ordinary' AND parent_kind IS NULL AND scope_id IS NOT NULL AND topic IS NOT NULL;
--> statement-breakpoint
UPDATE "knowledge_items" SET
  scope_kind = 'factory',
  parent_kind = 'knowledge_item',
  parent_id = 'ki-mig-practice-' || scope_id
WHERE scope_kind = 'practice' AND role = 'ordinary' AND parent_kind IS NULL AND scope_id IS NOT NULL AND topic IS NULL;
--> statement-breakpoint
-- A practice row with no scope_id at all has nowhere honest to land — refuse
-- rather than silently file it under General, which would say it belongs to
-- no practice, discarding information the row actually carries.
DO $$
DECLARE orphaned bigint;
BEGIN
  SELECT count(*) INTO orphaned FROM knowledge_items
  WHERE scope_kind = 'practice' AND role = 'ordinary' AND parent_kind IS NULL AND scope_id IS NULL;
  IF orphaned > 0 THEN
    RAISE EXCEPTION '0080: % practice-scoped knowledge items have no scope_id (no practice to land under)', orphaned;
  END IF;
END $$;
--> statement-breakpoint

-- 5. Product rows: scope becomes 'team', scope_id UNCHANGED (it is already a
--    team id — feasibility.md finding 1). Parent is the topic item under
--    Product, or Product itself when topicless.
UPDATE "knowledge_items" SET
  scope_kind = 'team',
  parent_kind = 'knowledge_item',
  parent_id = 'ki-mig-topic-product-' || md5(topic)
WHERE scope_kind = 'product' AND role = 'ordinary' AND parent_kind IS NULL AND topic IS NOT NULL;
--> statement-breakpoint
UPDATE "knowledge_items" SET
  scope_kind = 'team',
  parent_kind = 'knowledge_item',
  parent_id = 'ki-mig-root-product'
WHERE scope_kind = 'product' AND role = 'ordinary' AND parent_kind IS NULL AND topic IS NULL;
--> statement-breakpoint

-- 6. Every remaining ordinary row (factory/team/user-scoped already, or any
--    other surviving value): its topic item under General, or General itself.
INSERT INTO "knowledge_items"
  (id, scope_kind, scope_id, title, body, format, status, version, role, parent_kind, parent_id, position, updated_by, created_at, updated_at)
SELECT 'ki-mig-topic-general-' || md5(topic), 'factory', NULL, topic, topic, 'markdown', 'active', 1, 'ordinary', 'knowledge_item', 'ki-mig-root-general', 0, 'system', now()::text, now()::text
FROM (
  SELECT DISTINCT topic FROM knowledge_items
  WHERE role = 'ordinary' AND parent_kind IS NULL AND scope_kind NOT IN ('product', 'practice', 'task') AND topic IS NOT NULL
) g;
--> statement-breakpoint
INSERT INTO "knowledge_app_projection" (id, knowledge_item_id, scope_id)
SELECT 'kp-' || id, id, NULL FROM knowledge_items WHERE id LIKE 'ki-mig-topic-general-%';
--> statement-breakpoint
UPDATE "knowledge_items" SET
  parent_kind = 'knowledge_item',
  parent_id = 'ki-mig-topic-general-' || md5(topic)
WHERE role = 'ordinary' AND parent_kind IS NULL AND scope_kind NOT IN ('product', 'practice', 'task') AND topic IS NOT NULL
  AND id NOT IN ('ki-mig-root-product', 'ki-mig-root-practices', 'ki-mig-root-general');
--> statement-breakpoint
UPDATE "knowledge_items" SET
  parent_kind = 'knowledge_item',
  parent_id = 'ki-mig-root-general'
WHERE role = 'ordinary' AND parent_kind IS NULL AND scope_kind NOT IN ('product', 'practice', 'task') AND topic IS NULL
  AND id NOT IN ('ki-mig-root-product', 'ki-mig-root-practices', 'ki-mig-root-general');
--> statement-breakpoint

-- 7. Task-scoped rows: parent_kind='task', parent_id=scope_id. Bets already
--    became root tasks keeping their ids (BB1, 0076), so the id resolves.
--    Guarded anyway — with no FK a dangling parent is otherwise silent.
DO $$
DECLARE missing bigint;
BEGIN
  SELECT count(*) INTO missing
  FROM knowledge_items ki
  LEFT JOIN tasks t ON t.id = ki.scope_id
  WHERE ki.scope_kind = 'task' AND ki.role = 'ordinary' AND ki.parent_kind IS NULL AND t.id IS NULL;
  IF missing > 0 THEN
    RAISE EXCEPTION '0080: % task-scoped knowledge items reference a task id that does not exist', missing;
  END IF;
END $$;
--> statement-breakpoint
UPDATE "knowledge_items" SET
  scope_kind = 'factory',
  parent_kind = 'task',
  parent_id = scope_id
WHERE scope_kind = 'task' AND role = 'ordinary' AND parent_kind IS NULL;
--> statement-breakpoint

-- 9. Collapse every status onto proposed | active | stale | archived.
UPDATE "knowledge_items" SET status = CASE status
  WHEN 'draft' THEN 'proposed'
  WHEN 'captured' THEN 'proposed'
  WHEN 'provisional' THEN 'proposed'
  WHEN 'validated' THEN 'active'
  WHEN 'active' THEN 'active'
  WHEN 'stale' THEN 'stale'
  WHEN 'archived' THEN 'archived'
  WHEN 'needs_human' THEN 'archived'
  ELSE status
END;
--> statement-breakpoint

-- 10. Drop the retired vocabulary. Dropping a column drops any index defined
--     purely on it (ki_topic_idx, ksf_layer_idx, ksf_kind_idx) with it.
ALTER TABLE "knowledge_items" DROP COLUMN "topic";
--> statement-breakpoint
ALTER TABLE "knowledge_app_projection" DROP COLUMN "layer";
--> statement-breakpoint
ALTER TABLE "knowledge_app_projection" DROP COLUMN "kind";
