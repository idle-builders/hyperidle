-- 1. the table and its column.
ALTER TABLE "knowledge_items" RENAME TO "documents";
--> statement-breakpoint
ALTER TABLE "documents" RENAME COLUMN "role" TO "slot";
--> statement-breakpoint
ALTER TABLE "documents" RENAME CONSTRAINT "knowledge_items_pkey" TO "documents_pkey";
--> statement-breakpoint

-- 2. constraints and indexes (drop-and-recreate for the checks, rename for the indexes).
ALTER TABLE "documents" DROP CONSTRAINT "ki_role_ck";
--> statement-breakpoint
ALTER TABLE "documents" DROP CONSTRAINT "ki_parent_kind_ck";
--> statement-breakpoint
ALTER TABLE "documents" DROP CONSTRAINT "ki_parent_pair_ck";
--> statement-breakpoint
ALTER INDEX "ki_scope_idx" RENAME TO "doc_scope_idx";
--> statement-breakpoint
ALTER INDEX "ki_status_idx" RENAME TO "doc_status_idx";
--> statement-breakpoint
ALTER INDEX "ki_updated_desc_idx" RENAME TO "doc_updated_desc_idx";
--> statement-breakpoint
ALTER INDEX "ki_role_idx" RENAME TO "doc_slot_idx";
--> statement-breakpoint
ALTER INDEX "ki_parent_idx" RENAME TO "doc_parent_idx";
--> statement-breakpoint
ALTER INDEX "ki_parent_position_idx" RENAME TO "doc_parent_position_idx";
--> statement-breakpoint
ALTER INDEX "ki_parent_slot_uq" RENAME TO "doc_parent_slot_uq";
--> statement-breakpoint

-- 3. the parent-kind value, then the new checks.
UPDATE "documents" SET "parent_kind" = 'document' WHERE "parent_kind" = 'knowledge_item';
--> statement-breakpoint
ALTER TABLE "documents" ADD CONSTRAINT "doc_slot_ck"
  CHECK ("slot" IN ('ordinary','skill','rule','agent_file','prompt'));
--> statement-breakpoint
ALTER TABLE "documents" ADD CONSTRAINT "doc_parent_kind_ck"
  CHECK ("parent_kind" IS NULL OR "parent_kind" IN ('document','task','thread','routine','agent'));
--> statement-breakpoint
ALTER TABLE "documents" ADD CONSTRAINT "doc_parent_pair_ck"
  CHECK (("parent_kind" IS NULL AND "parent_id" IS NULL)
      OR ("parent_kind" IS NOT NULL AND "parent_id" IS NOT NULL));
--> statement-breakpoint

-- 4. fold the projection's two live columns; the projection's scope_id WON on read,
--    so it wins here too (mergeWithProjection: `projection.scopeId ?? item.scopeId`).
--    The four usage columns are added in the same step and start EMPTY — nothing
--    is carried over from relevance_score/citation_count/last_cited_at, whose
--    only writer is the demo seed.
ALTER TABLE "documents" ADD COLUMN "confidence" text;
--> statement-breakpoint
ALTER TABLE "documents" ADD COLUMN "meta" text;
--> statement-breakpoint
ALTER TABLE "documents" ADD COLUMN "read_count" integer NOT NULL DEFAULT 0;
--> statement-breakpoint
ALTER TABLE "documents" ADD COLUMN "last_read_at" text;
--> statement-breakpoint
ALTER TABLE "documents" ADD COLUMN "session_use_count" integer NOT NULL DEFAULT 0;
--> statement-breakpoint
ALTER TABLE "documents" ADD COLUMN "last_used_at" text;
--> statement-breakpoint
CREATE INDEX "doc_last_used_idx" ON "documents" ("last_used_at");
--> statement-breakpoint
UPDATE "documents" d SET "confidence" = p."confidence", "meta" = p."meta"
  FROM "knowledge_app_projection" p WHERE p."knowledge_item_id" = d."id";
--> statement-breakpoint
UPDATE "documents" d SET "scope_id" = p."scope_id"
  FROM "knowledge_app_projection" p
  WHERE p."knowledge_item_id" = d."id" AND p."scope_id" IS NOT NULL;
--> statement-breakpoint

-- 5. BACKFILL THE OWNER. Moves the "whose private note is this" key from
--    `updated_by` to `scope_id`, and existing rows can be `scope_kind='user'`
--    with a NULL or stale `scope_id`: `cascadeScopeNarrowing` set scope_kind
--    alone, `requiresScopeId`
--    excludes `user` (types.ts:184) so PATCH never demanded one,
--    and only POST autofilled it.
--    Without this step those rows would match no subject and vanish for
--    everyone. `updated_by` has SIX observed shapes, so the derivation is a
--    ladder, not one prefix strip:
--      a bare user id (the UI), `user:<id>` (tools/eval/src/seeding.ts:348),
--      `agent:<id>` (write_memory), `session:<id>` (the sandbox writeback),
--      `plugin` (the installer), `demo-seed` (tools/setup/src/demo-world).
--    "Stale" means: names no row in `users`.
UPDATE "documents" SET "scope_id" = substring("updated_by" from 7)
WHERE "scope_kind" = 'user' AND "updated_by" LIKE 'agent:%'
  AND ("scope_id" IS NULL OR "scope_id" NOT IN (SELECT "id" FROM "users"));
--> statement-breakpoint
UPDATE "documents" SET "scope_id" = substring("updated_by" from 6)
WHERE "scope_kind" = 'user' AND "updated_by" LIKE 'user:%'
  AND ("scope_id" IS NULL OR "scope_id" NOT IN (SELECT "id" FROM "users"));
--> statement-breakpoint
UPDATE "documents" d SET "scope_id" = s."agent_id"
FROM "sessions" s
WHERE s."id" = substring(d."updated_by" from 9)
  AND d."scope_kind" = 'user' AND d."updated_by" LIKE 'session:%'
  AND (d."scope_id" IS NULL OR d."scope_id" NOT IN (SELECT "id" FROM "users"));
--> statement-breakpoint
UPDATE "documents" SET "scope_id" = "updated_by"
WHERE "scope_kind" = 'user' AND "updated_by" IN (SELECT "id" FROM "users")
  AND ("scope_id" IS NULL OR "scope_id" NOT IN (SELECT "id" FROM "users"));
--> statement-breakpoint
--    A row still unresolved after the ladder (`updated_by` = 'plugin' or
--    'demo-seed', a deleted user, an unresolvable session) is LEFT EXACTLY AS
--    IT IS, deliberately. Under today's rule such a row is already invisible to
--    every human — `updated_by` equals no viewer id — so leaving it alone is
--    behaviour-preserving. Widening it to `factory` would REVEAL content that
--    is hidden today, which is a visibility increase nobody asked for; there is
--    no RAISE guard for the same reason. The brownfield test asserts the count
--    of survivors rather than demanding zero.

-- 6. the four tables that go.
DROP TABLE "knowledge_app_projection";
--> statement-breakpoint
DROP TABLE "knowledge_conflicts";
--> statement-breakpoint
DROP TABLE "knowledge_access_log";
--> statement-breakpoint
DROP TABLE "knowledge_edit_log";
--> statement-breakpoint

-- 7. the task provenance FK.
ALTER TABLE "tasks" RENAME COLUMN "source_knowledge_item_id" TO "source_document_id";
--> statement-breakpoint
ALTER TABLE "tasks" RENAME CONSTRAINT
  "tasks_source_knowledge_item_id_knowledge_items_id_fk" TO "tasks_source_document_id_documents_id_fk";
--> statement-breakpoint

-- 8. the thread host kind. Same trigger-suspend window migration 0085 steps 7/8 used
--    (`threads_host_immutable_trg`, migration 0007) — this writes host_kind.
ALTER TABLE "threads" DISABLE TRIGGER "threads_host_immutable_trg";
--> statement-breakpoint
UPDATE "threads" SET "host_kind" = 'document' WHERE "host_kind" = 'knowledge_item';
--> statement-breakpoint
ALTER TABLE "threads" ENABLE TRIGGER "threads_host_immutable_trg";
--> statement-breakpoint

-- 9. inline refs stored inside message payloads: {"kind":"knowledge_item","id":…}
--    Guard first: the UPDATE below casts every candidate row's payload to
--    jsonb inside its own WHERE clause, and a single malformed row would
--    abort the whole statement (and this whole migration) with no
--    indication of which row broke it. Raise with the offending id instead.
DO $$
DECLARE
  r RECORD;
BEGIN
  FOR r IN SELECT "id", "payload" FROM "messages" WHERE "payload" LIKE '%knowledge_item%' LOOP
    BEGIN
      PERFORM r."payload"::jsonb;
    EXCEPTION WHEN OTHERS THEN
      RAISE EXCEPTION '0086: message % has a malformed payload — cannot rewrite its refs', r."id";
    END;
  END LOOP;
END $$;
--> statement-breakpoint
UPDATE "messages" SET "payload" = jsonb_set(
    "payload"::jsonb, '{refs}',
    (SELECT COALESCE(jsonb_agg(
        CASE WHEN r->>'kind' = 'knowledge_item' THEN jsonb_set(r, '{kind}', '"document"') ELSE r END),
      '[]'::jsonb)
     FROM jsonb_array_elements(("payload"::jsonb)->'refs') r))::text
WHERE "payload"::jsonb ? 'refs'
  AND ("payload"::jsonb)->'refs' @> '[{"kind":"knowledge_item"}]';
--> statement-breakpoint

-- 10. the plugin contribution kind. Constraint name confirmed at
--    framework/db/src/schema.ts:1341-1344; the producing constant is
--    framework/domain-model/src/configuration.ts:23-29.
ALTER TABLE "plugin_contributions" DROP CONSTRAINT "plugin_contributions_kind_ck";
--> statement-breakpoint
UPDATE "plugin_contributions" SET "kind" = 'document' WHERE "kind" = 'knowledge';
--> statement-breakpoint
ALTER TABLE "plugin_contributions" ADD CONSTRAINT "plugin_contributions_kind_ck"
  CHECK ("kind" IN ('agent','routine','document','configuration_default'));
--> statement-breakpoint

-- 11. historical change rows name the renamed task column in their JSON diffs.
UPDATE "changes" SET
  "before" = replace("before", '"sourceKnowledgeItemId"', '"sourceDocumentId"'),
  "after"  = replace("after",  '"sourceKnowledgeItemId"', '"sourceDocumentId"')
WHERE "before" LIKE '%sourceKnowledgeItemId%' OR "after" LIKE '%sourceKnowledgeItemId%';
--> statement-breakpoint

-- 12. a baked bundle written before this migration carries `contextBundle.knowledge`
--     with `role` on each entry; the drain iterates the new shape. Same treatment
--     migration 0080 step 11 gave the same table — fail the row, never rewrite a
--     body. Deviation from the architecture's literal SQL, empirically required:
--     `agent_work_intents_correlation_ck` demands `last_error_code IS NOT NULL`
--     whenever `status='failed'`; the drafted step only set `last_error`, which
--     would have violated that check on every matching row. Mirrors 0080's own
--     shape exactly (`last_error_code`, cleared claim fields, bumped `updated_at`).
--     Guarded the same way step 9 is: the UPDATE's own WHERE casts
--     `baked_request_json` to jsonb, and one malformed row would otherwise
--     abort the whole migration with no indication of which row.
DO $$
DECLARE
  r RECORD;
BEGIN
  FOR r IN
    SELECT "id", "baked_request_json" FROM "agent_work_intents"
    WHERE "status" IN ('pending','claimed')
      AND "baked_request_json" IS NOT NULL
      AND "baked_request_json" LIKE '%contextBundle%'
  LOOP
    BEGIN
      PERFORM r."baked_request_json"::jsonb;
    EXCEPTION WHEN OTHERS THEN
      RAISE EXCEPTION '0086: agent_work_intent % has a malformed baked_request_json — cannot check its contextBundle', r."id";
    END;
  END LOOP;
END $$;
--> statement-breakpoint
UPDATE "agent_work_intents" SET
  "status" = 'failed',
  "claim_token" = NULL,
  "claim_expires_at" = NULL,
  "last_error" = '0086: baked contextBundle predates the document vocabulary; re-emit this intent',
  "last_error_code" = 'STALE_BAKED_CONTEXT',
  "updated_at" = now()::text
WHERE "status" IN ('pending','claimed')
  AND "baked_request_json" IS NOT NULL
  AND ("baked_request_json"::jsonb) -> 'contextBundle' ? 'knowledge';
