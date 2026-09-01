# Architecture — one way to attach knowledge to anything

Technical shape of `.pipeline/work/knowledge-attachment-slot/plan.md`. Every decision below comes
from that plan; where this document decides something the plan left open, it says so. Disagreements
are in **Concerns** at the end, not folded into the design.

Tier: `mvp` (`pipeline.config.yml`). Smallest change that satisfies the plan.

---

## 1. The slot

`knowledge_items` gets two nullable columns. `framework/db/src/schema.ts:826` is the table;
`framework/db/src/schema.ts:855` is `role`; `framework/db/src/schema.ts:866` is the role CHECK.

```ts
// inside knowledgeItems columns, after `role`
parentKind: text("parent_kind"),
parentId: text("parent_id"),
```

```ts
// inside the table's index/constraint array, after ki_role_ck
index("ki_parent_idx").on(table.parentKind, table.parentId),
check(
  "ki_parent_kind_ck",
  sql`${table.parentKind} IS NULL OR ${table.parentKind} IN ('knowledge_item', 'task', 'thread', 'routine', 'agent')`,
),
check(
  "ki_parent_pair_ck",
  sql`(${table.parentKind} IS NULL AND ${table.parentId} IS NULL) OR (${table.parentKind} IS NOT NULL AND ${table.parentId} IS NOT NULL)`,
),
```

Decisions:

- **Nullable, both.** Most knowledge has no parent. `NULL` is "lives in the knowledge view on its
  own".
- **Full five-value vocabulary now.** Phase 1 writes only `routine` and `agent`. `knowledge_item`,
  `task` and `thread` are declared so phase 2 and the nested-knowledge strand never reopen the
  constraint.
- **`ki_parent_pair_ck`** — half a parent is not a parent. One constraint, and it removes a state
  no reader would know how to interpret.
- **One plain composite index, not partial.** `(parent_kind, parent_id)` serves both hot reads:
  the leading column alone answers "everything parented to a routine/agent" for the later
  all-items-of-a-parent read, and the pair answers "the item parented to X". A partial index on
  `parent_kind IS NOT NULL` would be smaller but could not serve `parent_kind IS NULL`, which is
  exactly the query the nested-knowledge tree needs for its roots.
- **No foreign key, by design.** The column points at five tables. Nothing at the database level
  keeps a parent id honest, and nothing deletes children. §6 is how that is handled.

## 2. Opening `role`

`prompt` joins the vocabulary. Three places, all mechanically linked:

| Place | Change |
|---|---|
| `framework/db/src/schema.ts:866` | CHECK becomes `IN ('ordinary','skill','rule','agent_file','prompt')` |
| `framework/domain-model/src/knowledge.ts:72` | `KNOWLEDGE_ROLES` gains `"prompt"` |
| `layers/core-ui/src/pages/KnowledgeDetail.tsx:253` | `KNOWLEDGE_ROLE_LABEL: Record<KnowledgeRole, string>` gains `prompt: "Prompt"` |

The zod schemas need no edit: `layers/core-api/src/routes/knowledge.ts:214` and `:226` are
`z.enum(KNOWLEDGE_ROLES)` and widen with the tuple. `KNOWLEDGE_ROLE_LABEL` is a total `Record`, so
`npm run check` fails until the label exists — the type system is the gate, no test needed.

Nothing else keys off the four-value list: `visibleToViewer`
(`layers/core-api/knowledge/src/knowledge-repository.ts:617`) and `fetchCapabilityItems`
(`layers/core-api/knowledge/src/session-knowledge-assembler.ts:358`) both spell the set as
`role != 'ordinary'`; §5 fixes the second one, and the first is left alone deliberately (a
user-scoped non-ordinary item is a binding, not a private note — a prompt reads the same way).

## 3. Migration 0077

Main is at `framework/db/drizzle/0076_BB1_one_work_primitive.sql`. Take
`0077_one_attachment_slot.sql` and add the matching `meta/_journal.json` entry (`idx: 77`,
`version: "7"`, `when` strictly greater than 0076's `1785693604000`, `breakpoints: true`). These
migrations are hand-written — `db:generate` cannot produce the backfill — so the journal row is
hand-added too, exactly as 0068 and 0076 were.

Steps, in this order:

1. `ALTER TABLE "knowledge_items" ADD COLUMN "parent_kind" text;` and `"parent_id" text;`
2. `ADD CONSTRAINT "ki_parent_kind_ck"`, `ADD CONSTRAINT "ki_parent_pair_ck"`,
   `CREATE INDEX "ki_parent_idx" ON "knowledge_items" ("parent_kind", "parent_id");`
3. `ALTER TABLE "knowledge_items" DROP CONSTRAINT "ki_role_ck";` then re-add it with the five
   values. (Postgres has no "alter check"; drop and recreate is the only spelling.)
4. **Backfill routine prompts.** `UPDATE "knowledge_items" ki SET "parent_kind" = 'routine',
   "parent_id" = r."id", "role" = 'prompt' FROM "routines" r WHERE r."prompt_knowledge_id" = ki."id";`
   Must run before step 7 — it reads the column being dropped.
5. **Clear the layer on those projection rows.** `UPDATE "knowledge_app_projection" SET "layer" = NULL
   WHERE "knowledge_item_id" IN (SELECT "prompt_knowledge_id" FROM "routines" WHERE
   "prompt_knowledge_id" IS NOT NULL);` A prompt lands as the run's instruction, not as a
   `knowledge/` file. §5 is why this is load-bearing rather than tidiness. Same order constraint as
   step 4.
6. **Backfill agent identities.** `UPDATE "knowledge_items" SET "parent_kind" = 'agent',
   "parent_id" = "scope_id" WHERE "role" = 'agent_file' AND "scope_kind" = 'user' AND "scope_id" IS
   NOT NULL;` `role` stays `agent_file`. `scope_kind`/`scope_id` stay exactly as they are —
   identical reach to today, and the plan is explicit that scope is stored on the item, never
   derived from the parent. An unbound `agent_file` (no user scope) is untouched and stays
   parentless, which is what it is.
7. `ALTER TABLE "routines" DROP COLUMN "prompt_knowledge_id";` — this drops
   `routines_prompt_knowledge_id_fk` with it.

No edit-log rows are written (0068 wrote none either — a migration is not a person's edit), and
`updated_at` is left alone.

Destructive, per the house rule: no compat column, no dual-write, no alias. The moment step 7 lands,
every reader in §4 must already be on the parent query, so the migration and the code in §4 and §7
ship in one merge.

## 4. Read paths

One predicate, three named readers over it, all inside `@hyperidle/knowledge` (the service that owns
the table).

New exports from `layers/core-api/knowledge/src/knowledge-repository.ts`, re-exported through
`layers/core-api/knowledge/src/index.ts`:

```ts
export async function getParentedItem(
  db: HyperIdleDb,
  input: {
    readonly parentKind: KnowledgeParentKind;
    readonly parentId: string;
    readonly role: KnowledgeRole;
    readonly status?: "active";
  },
): Promise<KnowledgeItem | null>;

export async function listParentedItemIds(
  db: HyperIdleDb,
  input: {
    readonly parentKind: KnowledgeParentKind;
    readonly parentIds: readonly string[];
    readonly role: KnowledgeRole;
    readonly status?: "active";
  },
): Promise<Map<string, string>>; // parentId -> knowledge item id

export async function archiveParented(
  exec: WriteExecutor,
  input: { readonly parentKind: KnowledgeParentKind; readonly parentId: string },
): Promise<void>;
```

`KnowledgeParentKind` is a new closed tuple + type next to `KNOWLEDGE_ROLES` in
`framework/domain-model/src/knowledge.ts`:
`export const KNOWLEDGE_PARENT_KINDS = ["knowledge_item","task","thread","routine","agent"] as const;`
It mirrors the DB CHECK, the way `KNOWLEDGE_ROLES` mirrors `ki_role_ck`.

Parent + role together is the singular-slot query: parent says where it hangs, role says which slot.
Parent alone cannot express "the prompt of this routine" — that is the plan's whole reason for
keeping two axes.

Then:

- **`getAgentIdentity`** (`knowledge-repository.ts:1317`) — body unchanged in signature, predicate
  becomes `parentKind='agent' AND parentId=<agentId> AND role='agent_file' AND status='active'`.
  Implemented as `(await getParentedItem(db, {...}))?.body ?? null`. The
  `scopeKind='user' AND scopeId=<agentId>` predicate is deleted: that is the mechanism being
  retired.
- **`getAgentIdentityIds`** (`knowledge-repository.ts:1339`) — same signature
  (`agentIds -> Map<agentId, itemId>`), implemented as `listParentedItemIds` with
  `parentKind:'agent', role:'agent_file', status:'active'`, keyed on `parentId` instead of
  `scopeId`. Its three callers (`layers/core-api/src/routes/agent-profile.ts:148`,
  `layers/core-api/src/routes/agents.ts:188` and `:391`) are untouched.
- **Routine prompt** — `layers/core-api/routine/src/routine-service.ts:545` currently reaches the
  document through `routine.promptKnowledgeId` and the injected `getKnowledgeBody` port. The pointer
  is gone, so the port changes shape:

  ```ts
  // layers/core-api/routine/src/ports.ts and routine-service.ts's own deps interface
  /** The routine's instruction, read from the knowledge document parented to it. */
  getRoutinePrompt(db: HyperIdleDb, routineId: string): Promise<string | null>;
  ```

  `getKnowledgeBody` is deleted (no other caller). The port is **required**, not optional —
  `ports.ts:270-276` records the exact failure an optional port produced before: two call sites
  never wired `getAgentIdentity`, compiled clean, and baked nothing. The resolver call becomes
  `const routinePrompt = await deps.getRoutinePrompt(db, routine.id);`, and everything downstream
  (the ranker's `taskDescription`, `contextBundle.routine.prompt`) is unchanged.

  Wired in `layers/core-api/src/services/routine-scheduler-bindings.ts:165` (which today closes over
  `get as getKnowledgeItem`) as
  `getRoutinePrompt: async (db, routineId) => (await getParentedItem(db, { parentKind: "routine", parentId: routineId, role: "prompt" }))?.body ?? null`.
  No status filter here: today's read has none, and a manually archived prompt should keep behaving
  as it does today.

- **`agentBindingId`** (`framework/domain-model/src/work-intent.ts:249`) — becomes the parent, not
  the scope:

  ```ts
  agentBindingId: item.parentKind === "agent" ? item.parentId : null,
  ```

  `SessionKnowledgeItemLike` (`work-intent.ts:209`) gains `readonly parentKind: string | null` and
  `readonly parentId: string | null` (required properties, nullable values — the same rule its own
  doc comment already states for `role`/`scopeId`, because both are kernel columns present on every
  row) and **drops `scopeId`**, which had no other reader in that file. `BakedContextKnowledgeItem`
  keeps `agentBindingId` unchanged in shape; only its meaning is restated in the doc comment: the
  agent this item hangs off.

  `layers/agent-orchestration/run-orchestration/src/context.ts:892-897` needs no logic change —
  `=== agentId` still means "this is my identity, already delivered as the AGENTS.md `## Identity`
  section, do not write it twice", a non-null other id still means "not mine", and `null` still
  means "unbound, applies to every session". The BA9f `@lore` at `context.ts:846-853` is reworded
  to say the binding is the parent.

## 5. Session assembly — two things that would leak

Both are consequences of `prompt` becoming a role. Neither is optional polish; without them a
routine's instruction is materialised into every session in its scope as a file.

1. **Capability fetch.** `fetchCapabilityItems`
   (`layers/core-api/knowledge/src/session-knowledge-assembler.ts:334`, predicate at `:359`) selects
   `role != 'ordinary'`. Under the new vocabulary that sweeps in every routine prompt in reach.
   It becomes an explicit allowlist — `inArray(knowledgeItems.role, ["skill", "rule", "agent_file"])`
   — which is what "capability" has always meant.
2. **A prompt has no layer.** `fetchAllForLayer`
   (`session-knowledge-assembler.ts:279`, the paged `list()` call at `:288`) pages through `list({ layer, scopeId, limit, offset })`,
   and `list()` has no role predicate by design
   (`knowledge-repository.ts:512-522`). Prompt documents carry a real projection layer today (0068
   wrote `L4`; `createRoutinePromptDocument` writes `L2`/`L4`), so they would keep arriving through
   the layer fetch and fall through `writeBundleKnowledge`'s ordinary branch into `knowledge/`.
   Fixed at the source rather than in the query: **a prompt document's projection layer is `NULL`**
   — migration step 5 for existing rows, `layer: null` on the two write paths in §7. This is exactly
   how `agent_file` already behaves (`upsertAgentIdentity` writes `layer: null`,
   `knowledge-repository.ts:1307`): invisible to the layer fetch, delivered by role instead. A null
   layer does not hide the item from the knowledge view — `list({visibleWithSignals})` LEFT JOINs
   the projection and has no layer predicate (`knowledge-repository.ts:730-738`).

   Filtering `role='ordinary'` inside `fetchAllForLayer` was the alternative and is rejected: the
   fetch is paginated with a limit, so any post-fetch filter silently shortens pages, and pushing a
   role predicate into `listBase` would also drop practice/product-scoped skills that reach a
   session through the layer path today.

Consequence, stated plainly because it is a behaviour change: after this, a routine prompt is no
longer written into `knowledge/` in every session in its scope. It lands as the run's instruction
only. That is what the plan's role table says `prompt` means.

`writeBundleKnowledge` (`context.ts:858`) needs no `prompt` branch — no prompt item can reach the
bundle once the two changes above are in.

## 6. The ownership constraint

**Seam: route composition. No new port, no new package crossing.**

The routine service and the users service may not write `knowledge_items` — `tools/governance/table-owners.json:10`
assigns that table to `knowledge`, and BA9g convicted this exact shape ("a table-ownership violation
wearing a column", `framework/db/src/schema.ts:1246`). The composition root already meets both
services, and already does this today: `layers/core-api/src/routes/routines-routes.ts:345` archives
the prompt document from the DELETE route by calling knowledge's own `setKnowledgeStatus`. The
cascade keeps that shape and generalises it.

- `layers/core-api/src/routes/routines-routes.ts` DELETE `/:id` — replace the
  `existing.promptKnowledgeId` branch with
  `await archiveParented(db, { parentKind: "routine", parentId: routineId });`
- `layers/core-api/src/routes/agents.ts` DELETE `/:id` (`agents.ts:404-422`) — after
  `updateUser(db, id, { status: "retired" })`, add
  `await archiveParented(db, { parentKind: "agent", parentId: id });`
  That file already imports `@hyperidle/knowledge` (`agents.ts:30`).

**"Delete" means archive, and it has to.** `knowledge_edit_log` (`schema.ts:878`),
`knowledge_access_log` (`schema.ts:908`) and `knowledge_conflicts` (`schema.ts:926`) all hold
`onDelete: "restrict"` foreign keys on `knowledge_items.id` — a hard `DELETE` aborts at the
database. `archiveParented` sets `status='archived'`, which is what the routine DELETE route already
means by deleting a prompt, and what plugin uninstall already means by forgetting a contribution
(`layers/core-api/src/routes/plugins.ts:494`). An archived item reaches no session
(`session-knowledge-assembler.ts:304`).

An injected port was the plan's other option. It is not needed: both delete doors are already in the
composition root, and adding a port would mean the routine/users packages naming a knowledge
operation they do not otherwise need.

## 7. The routine prompt write path

BA9f's rule survives unchanged: **`prompt` stays the field a caller writes** on
`POST /api/routines` and `PATCH /api/routines/:id`, and the text lands in a knowledge document. Only
the direction of the link flips — the document now names the routine instead of the routine naming
the document.

`layers/core-api/src/routes/routines-routes.ts`:

- `createRoutinePromptDocument` (`:159`) takes `routineId` and passes
  `parentKind: "routine", parentId: routineId, role: "prompt", layer: null` to
  `createKnowledgeItem`. Scope logic is untouched — team-scoped when the owner agent has a team,
  factory otherwise (the BA9g `@lore` at `:158-163` still holds).
- `POST /` (`:282-303`) — order flips. `insertRoutine` first (it no longer carries
  `promptKnowledgeId`), then create the document if `body.prompt`. Side benefit worth keeping: today
  an invalid cron returns 400 *after* the prompt document was created, orphaning it; the new order
  cannot.
- `PATCH /:id` (`:473-486`) — `existing.promptKnowledgeId` becomes
  `await getParentedItem(db, { parentKind: "routine", parentId: routineId, role: "prompt" })`.
  Found → `updateKnowledgeItem(db, doc.id, { body, updatedBy }, doc.version)` as today. Not found and
  a non-empty prompt → create with the parent. `updates.promptKnowledgeId` disappears.
- `readRoutinePrompt` (`:142`) takes `routineId` and reads through `getParentedItem`. Both response
  sites (`:401`, `:514`) pass the routine id.

`layers/core-api/src/routes/plugins.ts:437-470` — same flip: `insertRoutine` first, then
`upsertPluginDocument` with the deterministic id `ki_rp_${routineDbId}` and
`parentKind: "routine", parentId: routineDbId, role: "prompt"` (it is `role: "ordinary"` today at
`:454`). `UpsertPluginDocumentInput` (`knowledge-repository.ts:1230`) gains the two parent fields.
Contribution recording is unchanged — the prompt document is still a `knowledge` contribution.

`layers/core-api/knowledge/src/knowledge-repository.ts`:

- `CreateKnowledgeItemInput` (`:43`) gains `parentKind?: KnowledgeParentKind` and
  `parentId?: string | null`; `create` (`:230`) writes them onto the kernel row alongside `role`.
- `upsertAgentIdentity` (`:1275`) adds `parentKind: "agent", parentId: input.agentId` to its insert
  values. `scopeKind: "user"`, `scopeId: agentId`, `role: "agent_file"` and the `layer: null`
  projection all stay — the identity keeps identical reach, and the new-agent path
  (`layers/core-api/org/src/scaffold-agents.ts:192` through its existing port) needs no change.
- The HTTP create/update schemas (`layers/core-api/src/routes/knowledge.ts:184`, `:216`) do **not**
  gain parent fields, and `GET /api/knowledge` does not expose them. Nothing in phase 1 creates a
  parented item over HTTP or renders a parent. Nested knowledge adds that surface when it needs it.

Column removal, mechanically forced by the type system once the schema column is gone
(`npm run check` names every one): `framework/db/src/schema.ts:565-568`, `routine-service.ts`'s
`insertRoutine` input and `RoutinePatch`, and the two route call sites above. Existing tests that
assert on `promptKnowledgeId` (`routines.prompt-document.integration.test.ts`,
`BA9g-routine-delete-cleanup.integration.test.ts`, `BA9g-routine-prompt-scope.integration.test.ts`,
`update-routine.integration.test.ts`, `routine-scheduler-baked-emit.integration.test.ts`,
`routine-run-resolver.integration.test.ts`) are rewritten to assert the same behaviour through the
parent query — they are the behaviour spec, not casualties.

## 8. UI — a home for skills and rules

The only new UI in this phase. A list, not an agent section.

**New:** `layers/core-ui/src/settings/SettingsSkillsAndRules.tsx` +
`SettingsSkillsAndRules.stories.tsx` (every custom component carries a story —
`.claude/rules/visual-regression.md`). It follows `SettingsFilesystems.tsx` (183 lines, `apiFetch`,
local state, `Tag`, honest empty and error states) rather than the split-pane `SettingsAgents`.

- Reads the existing `GET /api/knowledge`. No new endpoint, no server-side role filter: the knowledge
  list and this list read the same payload and want opposite halves of it.
- Filters client-side to `role === "skill" || role === "rule"`, sorted by title.
- Each row: title, a `Tag` reading `Skill` / `Rule`, and the scope label. Clicking navigates to
  `/knowledge/:id` — the real knowledge view, not a bespoke editor.
- Empty state says there are none; it never invents rows.

**Registered** in `layers/core-ui/src/pages/SettingsPage.tsx` group 2, immediately after the
`settings-section-agents` section, as `<section id="settings-section-skills"
data-testid="settings-section-skills">` with `<SectionTitle>Skills & rules</SectionTitle>`.

**Removed from the knowledge navigation, in the same change:**

- `layers/core-ui/src/pages/KnowledgeList.tsx` — `ApiKnowledgeItem` (`:140`) gains `role?: string`
  (the field is already in the payload, just undeclared), and the `allItems` memo (`:845`) drops
  `skill` and `rule` before the triage/curated split so both tabs and the topic grouping are covered.
- `layers/core-ui/src/layouts/AppShell.tsx:549-562` — the sidebar fast-nav list drops the same two
  roles before `.slice(0, 5)`.

**Not in this phase:** items with a parent (`prompt`, `agent_file`) stay in the knowledge navigation.
Hiding is parent-driven and belongs to the nested-knowledge strand, which builds its tree rules
against the column this phase creates. A routine prompt has been visible in the knowledge view since
0068; nothing regresses.

## 9. Dependency order

Validation before implementation, per `CLAUDE.md`. Each increment writes its failing tests first.
Increments 1-3 are ordered **steps of one merge**, not separately shippable: the migration drops
`routines.prompt_knowledge_id`, so the readers must move in the same change (destructive-migration
rule). The branch is red between them; that is expected.

**1. The slot exists.**
Red first: `framework/db/src/__tests__/migration-0077-brownfield.integration.test.ts`, modelled on
`migration-0076-brownfield.integration.test.ts` — pre-state produced by running the **real**
migrations 0..76 against a populated PGlite, never hand-rolled DDL (that test's own `@lore` records
why). It seeds a routine with a prompt document and an agent with an identity, applies 0077, then
asserts: the prompt document has `parent_kind='routine'`, `parent_id=<routineId>`, `role='prompt'`
and a NULL projection layer; the identity has `parent_kind='agent'`, `parent_id=<agentId>`,
`role='agent_file'`, `scope_kind='user'`, `scope_id=<agentId>` unchanged; `routines` has no
`prompt_knowledge_id` column; an insert with `parent_kind='bet'` is rejected; an insert with
`parent_kind` set and `parent_id` NULL is rejected; an insert with `role='prompt'` is accepted.
Plus a row in `framework/db/src/__tests__/indexes.integration.test.ts` for `ki_parent_idx`.
Then: schema columns/constraints/index, `KNOWLEDGE_PARENT_KINDS`, `KNOWLEDGE_ROLES` widening,
`KNOWLEDGE_ROLE_LABEL` label, migration 0077 + journal row.

**2. Knowledge reads and writes by parent.**
Red first: knowledge-service integration tests — `getParentedItem`/`listParentedItemIds` find items
by parent and role and ignore scope; `archiveParented` archives every item under a parent and
nothing else; `getAgentIdentity`/`getAgentIdentityIds` resolve an identity that has a parent but a
*different* scope than today (this is the test that proves the reverse-lookup is gone);
`upsertAgentIdentity` writes the parent.
Then: the three new functions, the two reimplemented readers, `create`/`CreateKnowledgeItemInput`,
`upsertAgentIdentity`, `UpsertPluginDocumentInput`, the barrel.

**3. The pointer column dies.**
Red first: routes integration — `POST /api/routines` with a prompt produces a document parented to
the routine; `GET` and `PATCH` round-trip the prompt text; `PATCH` on a routine with no prompt
creates one; `DELETE /api/routines/:id` archives the prompt; `DELETE /api/agents/:id` archives the
identity; a plugin install produces a parented prompt document. Plus routine-resolver integration:
the baked bundle carries the routine's instruction with no pointer column in play.
Then: `getRoutinePrompt` port (required) and its wiring, the four route handlers, `plugins.ts`, the
schema/type removals, the rewritten existing tests.

**4. Nothing leaks into a session.**
Red first: assembler integration — a routine prompt in reach does **not** appear in
`assembleSessionKnowledge`'s output for that agent's session, while its skills, rules and identity
still do. Unit — `toBakedContextKnowledgeItems` derives `agentBindingId` from `parentKind`/`parentId`
(rewrite of `framework/domain-model/src/__tests__/ba9b-knowledge-roles.test.ts`), and
`writeBundleKnowledge` still skips this agent's own identity and still writes an unbound agent file
(`ba9b-capability-materialisation.test.ts` fixtures move from `scopeId` to the parent fields).
Then: the capability allowlist, the `agentBindingId` derivation, `SessionKnowledgeItemLike`, the
`@lore` rewordings.

**5. Skills and rules get a home.**
Red first: component tests — `SettingsSkillsAndRules` renders skill and rule rows from a stubbed
`/api/knowledge` payload and links each to `/knowledge/:id`; `KnowledgeList` does not render a
`skill` or `rule` item; the sidebar list does not either.
Then: the component, its story, the `SettingsPage` section, the two nav filters.
Checkpoint: founder looks at the live render before this is called done (it is new UI, even though
it reuses an existing settings pattern).

**Verification lanes.** `npm run check` and `npm run lint` after every increment;
`npm run test:integration:service` for 1-4; `npm run test:full` for the unit and component work;
`npm run verify` before the PR.

## 10. Which acceptance criteria are tests and which are not

| Criterion | Enforced by |
|---|---|
| Parent vocabulary is exactly five values; a sixth is rejected | DB CHECK — asserted by a rejected insert in the 0077 brownfield test (a constraint is not a type; the honest lane is a DB integration test) |
| A parent kind without an id is rejected | DB CHECK, same test |
| `prompt` is a legal role | DB CHECK, same test |
| Every role has a reader-facing label | Type system — `Record<KnowledgeRole, string>` fails `npm run check` |
| `routines.prompt_knowledge_id` has no readers left | Type system — the column is gone from the schema, so `npm run check` names every stale reference. No grep guard, no lint rule |
| Backfill preserves reach and identity | Runtime — 0077 brownfield integration test |
| Identity and prompt resolve by parent | Runtime — knowledge + routes + resolver integration tests |
| Deleting a parent archives its knowledge | Runtime — routes integration tests |
| A prompt never reaches a session sandbox | Runtime — assembler integration + `writeBundleKnowledge` unit |
| Skills and rules are listed in settings and absent from knowledge nav | Runtime — component tests |
| The parent-kind tuple mirrors the DB CHECK | Neither — a two-line diff review challenges. Not worth a guard at this size |

No work-package ids appear in any of the code, per house rule; `@lore` tags are the exception and
carry them as they already do.

## 11. Out of scope (named so nobody builds them)

The knowledge tree and its display rules (nested-knowledge strand, building against the column this
phase creates); role and scope search filtering
(`.pipeline/work/knowledge-role-scope-filtering/`); artifacts, task descriptions and thread parents
beyond declaring the enum values; `handleCreate` giving agent-written files a parent (phase 2); an
agent section in the nav; exposing `parentKind`/`parentId` over HTTP.

## 12. Concerns

Design decisions I am carrying out as written but that a builder or reviewer should see stated:

1. **"Deleted" is archived.** The plan says a parent's knowledge is deleted with it. The three audit
   tables hold `RESTRICT` FKs on `knowledge_items.id`, so a hard delete aborts at the database. I
   read "deleted" as "archived", which is what the routine DELETE route already does today and what
   makes an item reach nobody. If the founder meant rows physically gone, that is a different piece
   of work (archiving the audit trail first) and it is not this one.
2. **An agent's delete door is a soft retire.** `DELETE /api/agents/:id` sets `status='retired'`.
   Archiving the identity there is the same act, but nothing un-archives it if an agent is brought
   back through `PATCH`. A person can unarchive it from the knowledge view; there is no automatic
   path. Low stakes, but it is a real asymmetry the routine path does not have either.
3. **A shared prompt document would bind to one routine.** `routines.prompt_knowledge_id` never had
   a unique constraint. No production path creates two routines pointing at one document, so the
   backfill is deterministic in practice — but if one exists, `UPDATE ... FROM` picks arbitrarily
   and the other routine silently loses its prompt. Accepted rather than guarded, because the parent
   column makes the single-owner rule real going forward.
4. **Routine prompts stop being materialised as knowledge files.** Today they carry a layer and land
   in `knowledge/` in every session in scope, on top of being the instruction. After this they are
   the instruction only. That follows directly from the plan's "role says where it lands", but it is
   a behaviour change and not merely a refactor.
5. **`getRoutinePrompt` is a required port.** One more thing to wire at every construction site. I
   chose it over an optional port because `ports.ts:270-276` records the exact bug an optional one
   caused before — two sites wired nothing, compiled clean, and baked no identity. A routine
   silently running with no instruction is the same failure.
