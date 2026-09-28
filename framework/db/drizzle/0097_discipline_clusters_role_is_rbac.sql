-- A discipline clusters knowledge to a craft; role becomes RBAC only.
--
-- Two new columns (users.discipline, documents.discipline) take over the
-- "craft" job `role`/`mechanism` used to carry alongside access control.
-- Order:
--   1. add both columns.
--   2. move every craft off `role` onto `discipline`, per value (an AI
--      agent's craft, the person's own agent's dead "assistant" trace, a
--      human's craft — Maya's `operations` included).
--   3. `org_edges.mechanism`: same rename, "function" -> "discipline".
--   4. recover the discipline a leftover `scope_id` still names on a
--      factory-scoped, practice-origin row, then clear scope_id on every
--      factory row that still has one (practice-origin or task-origin) —
--      migration 0080 rewrote scope_kind to 'factory' in two places but
--      never cleared scope_id in either, leaving both invisible to the
--      factory fetch (`scope_kind='factory' AND scope_id IS NULL`). A CHECK
--      constraint then forbids the shape from returning.
--   5. forbid an `agent_file` document with no agent parent — the schema's
--      own comment already said this; nothing enforced it.
--
-- Destructive, per house rule: no compat column, no dual-write, no alias.

-- 1. the two columns.
ALTER TABLE "users" ADD COLUMN "discipline" text;
--> statement-breakpoint
ALTER TABLE "documents" ADD COLUMN "discipline" text;
--> statement-breakpoint

-- 2a. an AI agent's craft moves to discipline; role collapses to 'agent'.
--     Excludes the rows step 2b/existing 'agent'/'system' rows already hold
--     the right shape for.
UPDATE "users" SET "discipline" = "role", "role" = 'agent'
WHERE "kind" = 'ai' AND "role" NOT IN ('agent', 'system', 'assistant');
--> statement-breakpoint

-- 2b. the person's own agent: BC7 already dissolved "assistant" as a
--     concept — a person's agent is identified by `owner_user_id`, and the
--     string is the last trace of something gone. No discipline: it never
--     had a craft, only a dead label.
UPDATE "users" SET "role" = 'agent'
WHERE "kind" = 'ai' AND "role" = 'assistant';
--> statement-breakpoint

-- 2c. a human's craft moves to discipline; role collapses to 'member'.
--     Catches the demo world's Maya, whose role is 'operations'.
UPDATE "users" SET "discipline" = "role", "role" = 'member'
WHERE "kind" = 'human' AND "role" NOT IN ('founder', 'member');
--> statement-breakpoint

-- Guard: role must now hold only the four RBAC values.
DO $$
DECLARE stray bigint;
BEGIN
	SELECT count(*) INTO stray FROM "users" WHERE "role" NOT IN ('founder', 'member', 'agent', 'system');
	IF stray > 0 THEN
		RAISE EXCEPTION '0097: % users rows still carry a role outside founder|member|agent|system', stray;
	END IF;
END $$;
--> statement-breakpoint

-- 3. org_edges: same concept, same rename.
UPDATE "org_edges" SET "mechanism" = 'discipline' WHERE "mechanism" = 'function';
--> statement-breakpoint

-- 4. Every factory-scoped row must have scope_id NULL — `SCOPES_REQUIRING_ID`
--    (`@hyperidle/domain-model`) is exactly `{team}`; `user` legitimately
--    carries one too (the agent it is bound to), but `factory` never does.
--    Migration 0080 broke that in TWO places, neither ever clearing
--    scope_id afterwards:
--      - §4c rewrote a practice-scoped row's scope_kind to 'factory' and
--        reparented it under its practice folder (parent_kind='document');
--        scope_id still holds the old PRACTICE NAME.
--      - §7 rewrote a task-scoped row's scope_kind to 'factory' and
--        reparented it under its task (parent_kind='task'); scope_id still
--        holds the old TASK ID — not a craft, so it carries no discipline
--        meaning, and the task it named is already `parent_id`.
--    The factory fetch (`scope_kind='factory' AND scope_id IS NULL`) has
--    silently skipped every one of these rows since 0080 shipped: on any
--    upgraded database, a former practice document AND a task's own
--    postmortem/retro reach no agent at all.
--
--    `parent_kind = 'document'` is what tells the two apart — it is the one
--    thing 0080 set differently between its two paths, and it is a shape
--    only this migration's leftover can have (no legitimate write path
--    ever puts a scope_id on a factory row). Discipline is derived first,
--    for the practice-origin rows only, then scope_id is cleared on every
--    remaining factory row in a second statement — two statements, not one,
--    is what "derive before destroy" requires here: the second statement's
--    WHERE must still see the scope_id the first one reads.
--
--    Deliberately NOT a walk of the id-shaped 'ki-mig-practice-*'/
--    'ki-mig-topic-practice-*' tree 0080 built (0080 §4a/4b): that tree only
--    reaches rows nested under the specific folders 0080 happened to
--    create, while scope_id sits on the affected rows themselves — reading
--    it directly finds every stale row regardless of where 0080 filed it
--    (including the task-writeback rows the tree walk never touched at
--    all), and it does not hand a folder's identity down onto children who
--    never asked for one (discipline is explicit only, never inherited from
--    a parent — this task's own interview). The folders/topic items 0080
--    created for the practice tree were themselves inserted with scope_id
--    NULL, so they are untouched here and keep discipline NULL — same as
--    any other unlabelled factory document. A fresh install has no factory
--    row with a scope_id and is unaffected.
UPDATE "documents" SET "discipline" = "scope_id"
WHERE "scope_kind" = 'factory' AND "scope_id" IS NOT NULL AND "parent_kind" = 'document';
--> statement-breakpoint
UPDATE "documents" SET "scope_id" = NULL
WHERE "scope_kind" = 'factory' AND "scope_id" IS NOT NULL;
--> statement-breakpoint

-- Guard: no factory-scoped row may carry a scope_id after the statement
-- above. Expected to pass against every real database — guarded anyway so a
-- violation names its row count instead of a bare constraint-violation error.
DO $$
DECLARE stray bigint;
BEGIN
	SELECT count(*) INTO stray FROM "documents" WHERE "scope_kind" = 'factory' AND "scope_id" IS NOT NULL;
	IF stray > 0 THEN
		RAISE EXCEPTION '0097: % factory documents still carry a scope_id', stray;
	END IF;
END $$;
--> statement-breakpoint

-- "factory implies scope_id IS NULL" made unrepresentable, not just true
-- today — this is exactly the shape 0080 broke silently for months; a CHECK
-- means the next writer that forgets to clear scope_id fails loudly instead
-- of quietly starving an agent of its own knowledge again. `team` still
-- requires a scope_id (`SCOPES_REQUIRING_ID`) and `user` still legitimately
-- carries one (the bound agent's id) — this constraint touches neither.
ALTER TABLE "documents" ADD CONSTRAINT "doc_factory_scope_id_ck"
	CHECK ("scope_kind" <> 'factory' OR "scope_id" IS NULL);
--> statement-breakpoint

-- 5. Close the unbound agent_file hole. The slot comment already says
--    agent_file is "only for the bound agent" — nothing enforced it, and
--    the writer materialised an unbound one into knowledge/rules. Nothing
--    creates one today (a hole, not live rot), so this is expected to pass
--    against every real database; guarded anyway so a violation names its
--    row count instead of a bare constraint-violation error.
DO $$
DECLARE unbound bigint;
BEGIN
	SELECT count(*) INTO unbound
	FROM "documents"
	WHERE "slot" = 'agent_file' AND ("parent_kind" IS DISTINCT FROM 'agent');
	IF unbound > 0 THEN
		RAISE EXCEPTION '0097: % agent_file documents have no agent parent', unbound;
	END IF;
END $$;
--> statement-breakpoint
-- `parent_kind = 'agent'` alone would not reject a NULL parent_kind — a
-- Postgres CHECK passes when its expression evaluates to NULL, and NULL is
-- exactly the unbound shape this exists to forbid. The explicit
-- `IS NOT NULL` forces that row to FALSE instead of silently passing.
ALTER TABLE "documents" ADD CONSTRAINT "doc_agent_file_parent_ck"
	CHECK ("slot" <> 'agent_file' OR ("parent_kind" IS NOT NULL AND "parent_kind" = 'agent'));
