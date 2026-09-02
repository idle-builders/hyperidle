-- One way to attach knowledge to anything.
--
-- Three mechanisms currently say "this knowledge item belongs to that
-- entity": `routines.prompt_knowledge_id` (an FK column), a scope+role
-- reverse lookup for agent identity, and nothing at all for the rest. This
-- replaces them with one slot on `knowledge_items`: `parent_kind` + `parent_id`
-- says where an item hangs, `role` (already present) says where it lands in
-- the session. `prompt` joins the role vocabulary.
--
-- Destructive, per house rule: no compat column, no dual-write, no alias.
-- `routines.prompt_knowledge_id` is dropped in this same migration, so every
-- reader must already be on the parent query by the time this merges.

-- 1. The new columns.
ALTER TABLE "knowledge_items" ADD COLUMN "parent_kind" text;
--> statement-breakpoint
ALTER TABLE "knowledge_items" ADD COLUMN "parent_id" text;
--> statement-breakpoint

-- 2. Constraints and the read index. The full five-value vocabulary ships now
--    even though phase 1 writes only 'routine' and 'agent' — so phase 2 and
--    the nested-knowledge strand never have to reopen this constraint.
ALTER TABLE "knowledge_items" ADD CONSTRAINT "ki_parent_kind_ck"
  CHECK ("parent_kind" IS NULL OR "parent_kind" IN ('knowledge_item', 'task', 'thread', 'routine', 'agent'));
--> statement-breakpoint
ALTER TABLE "knowledge_items" ADD CONSTRAINT "ki_parent_pair_ck"
  CHECK (("parent_kind" IS NULL AND "parent_id" IS NULL) OR ("parent_kind" IS NOT NULL AND "parent_id" IS NOT NULL));
--> statement-breakpoint
CREATE INDEX "ki_parent_idx" ON "knowledge_items" ("parent_kind", "parent_id");
--> statement-breakpoint

-- 3. Open the role vocabulary. Postgres has no "alter check" — drop and
--    recreate is the only spelling.
ALTER TABLE "knowledge_items" DROP CONSTRAINT "ki_role_ck";
--> statement-breakpoint
ALTER TABLE "knowledge_items" ADD CONSTRAINT "ki_role_ck"
  CHECK ("role" IN ('ordinary', 'skill', 'rule', 'agent_file', 'prompt'));
--> statement-breakpoint

-- 4. Refuse to run if a prompt document is shared by more than one routine.
--    `routines.prompt_knowledge_id` has no unique constraint, and step 5's
--    backfill would update the single matching knowledge_items row ONCE,
--    picking its source routine non-deterministically and reporting success —
--    one routine would keep the instruction and the other would silently run
--    on its name. Fail loud instead: nothing is deployed anywhere, so an
--    upgrade may abort rather than guess.
DO $$
DECLARE shared bigint;
BEGIN
  SELECT count(*) INTO shared FROM (
    SELECT prompt_knowledge_id FROM routines
    WHERE prompt_knowledge_id IS NOT NULL
    GROUP BY prompt_knowledge_id HAVING count(*) > 1
  ) d;
  IF shared > 0 THEN
    RAISE EXCEPTION
      '0077: % prompt documents are each shared by more than one routine; a knowledge item hangs off exactly one parent. Give each routine its own prompt document before upgrading.', shared;
  END IF;
END $$;
--> statement-breakpoint

-- 5. Backfill routine prompts. Must run before step 8 — it reads the column
--    being dropped there.
UPDATE "knowledge_items" ki SET "parent_kind" = 'routine', "parent_id" = r."id", "role" = 'prompt'
FROM "routines" r WHERE r."prompt_knowledge_id" = ki."id";
--> statement-breakpoint

-- 6. Backfill agent identities. `role` stays `agent_file`. `scope_kind`/
--    `scope_id` stay exactly as they are — identical reach to today, and
--    scope is stored on the item, never derived from the parent. An
--    `agent_file` that is not user-scoped (a team-scoped one) gets no parent —
--    no production path creates one today (all three writers hard-code
--    scopeKind:"user"), so the population this can't fix is empty.
UPDATE "knowledge_items" SET "parent_kind" = 'agent', "parent_id" = "scope_id"
WHERE "role" = 'agent_file' AND "scope_kind" = 'user' AND "scope_id" IS NOT NULL;
--> statement-breakpoint

-- 7. The singular-slot constraint, after the backfills so it validates what
--    they produced — a second `role='prompt'` row under one routine is
--    rejected, an unlimited population of parentless skills and rules never
--    collides (NULLs are distinct in a unique index).
CREATE UNIQUE INDEX "ki_parent_slot_uq" ON "knowledge_items" ("parent_kind", "parent_id", "role")
  WHERE "role" <> 'ordinary';
--> statement-breakpoint

-- 8. Drop the old shape. This also drops `routines_prompt_knowledge_id_fk`.
ALTER TABLE "routines" DROP COLUMN "prompt_knowledge_id";
