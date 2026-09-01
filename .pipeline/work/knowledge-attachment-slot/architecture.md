# Architecture — one way to attach knowledge to anything

Technical shape of `.pipeline/work/knowledge-attachment-slot/plan.md`. Every decision below comes
from that plan; where this document decides something the plan left open, it says so. Disagreements
are in **Concerns** at the end, not folded into the design.

Tier: `mvp` (`pipeline.config.yml`). Smallest change that satisfies the plan.

Revision 2. The first version's anti-leak mechanism rested on `layer IS NULL`; §5 explains why that
was wrong and what replaces it. §8 is rewritten against the plan's governing model (plan
`176-248`), which supersedes the navigation rules the first version designed to.

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
uniqueIndex("ki_parent_slot_uq")
  .on(table.parentKind, table.parentId, table.role)
  .where(sql`${table.role} <> 'ordinary'`),
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

- **Nullable, both.** Most knowledge has no parent.
- **Full five-value vocabulary now.** Phase 1 writes only `routine` and `agent`. `knowledge_item`,
  `task` and `thread` are declared so phase 2 and the nested-knowledge strand never reopen the
  constraint.
- **`ki_parent_pair_ck`** — half a parent is not a parent.
- **`ki_parent_slot_uq` makes the singular slot real, not asserted.** A routine has exactly one
  prompt and an agent exactly one identity; without this index that is a sentence in a plan, not a
  property of the data. Partial indexes are already used in this schema
  (`routines_event_type_idx`, `framework/db/src/schema.ts:629-631`), so the spelling is proven here.
  Two things make it correct rather than over-tight: Postgres treats NULLs as distinct in a unique
  index by default, so the unlimited population of unparented skills and rules never collides; and
  `role <> 'ordinary'` leaves a parent free to hold many ordinary children, which is exactly what
  the nested-knowledge tree and phase 2 need.
- **One plain composite index for the reads.** `(parent_kind, parent_id)` serves both hot paths: the
  leading column alone answers "everything under this parent", the pair answers "the item parented
  to X", and it still serves `parent_kind IS NULL` — the query the nested-knowledge tree needs for
  its roots, which a partial index could not answer.
- **No foreign key, by design.** The column points at five tables. Nothing at the database level
  keeps a parent id honest and nothing deletes children; §6 is how that is handled.

## 2. Opening `role` — and closing it to editing

`prompt` joins the vocabulary:

| Place | Change |
|---|---|
| `framework/db/src/schema.ts:866` | CHECK becomes `IN ('ordinary','skill','rule','agent_file','prompt')` |
| `framework/domain-model/src/knowledge.ts:72` | `KNOWLEDGE_ROLES` gains `"prompt"` |
| `layers/core-ui/src/pages/KnowledgeDetail.tsx:253` | `KNOWLEDGE_ROLE_LABEL: Record<KnowledgeRole, string>` gains `prompt: "Prompt"` |

The create schema needs no edit — `layers/core-api/src/routes/knowledge.ts:214` is
`z.enum(KNOWLEDGE_ROLES)` and widens with the tuple. `KNOWLEDGE_ROLE_LABEL` is a total `Record`, so
`npm run check` fails until the label exists; the type system is the gate, no test needed. The map
survives the role-selector removal below — the skills and rules list uses it for its row tag.

**Role becomes create-only** (plan `212-221`). It is set by whatever creates the thing and is never
edited on the document afterwards. Four removals, all in the update path:

- `KERNEL_EDITABLE_FIELDS` (`layers/core-api/knowledge/src/knowledge-repository.ts:306-315`) drops
  `"role"`, and the `@lore` above it that argues role should ride the editable set is replaced by
  the reason it no longer does.
- `UpdateKnowledgeItemInput.role` (`knowledge-repository.ts:111-112`) is deleted.
- `updateKnowledgeSchema.role` (`layers/core-api/src/routes/knowledge.ts:226`) is deleted. `z.object`
  strips unknown keys, so a PATCH carrying `role` is ignored rather than rejected — the test asserts
  the role is *unchanged*, not that the request 400s.
- The role row in the knowledge content view (`layers/core-ui/src/pages/KnowledgeDetail.tsx:656`,
  the save handler at `:750-775`, the `knowledge-role-row` block at `:1171-1195`, and the
  `roleError` state and its alert at `:658`, `:1008-1015`) is deleted, along with its test
  `layers/core-ui/src/pages/__tests__/KnowledgeDetail.role.test.tsx`.
  `layers/core-api/src/routes/__tests__/knowledge.role.integration.test.ts` keeps its
  create-with-role cases and loses its PATCH-role cases.

This reverses BA9e's mechanism while keeping what it found: the plugin was the only writer of
`role`, which made plugins a privileged author. The answer is now that every creator writes a role
through its own list (§8), not that everyone can rewrite one afterwards. The consequence, accepted:
an ordinary note cannot be promoted into a skill any more — you create a skill from the skills list.

## 3. Migration 0077

Main is at `framework/db/drizzle/0076_BB1_one_work_primitive.sql`. Take
`0077_one_attachment_slot.sql` and add the matching `meta/_journal.json` entry (`idx: 77`,
`version: "7"`, `when` strictly greater than 0076's `1785693604000`, `breakpoints: true`). These
migrations are hand-written — `db:generate` cannot produce a backfill — so the journal row is
hand-added too, as 0068 and 0076 were.

Steps, in this order:

1. `ALTER TABLE "knowledge_items" ADD COLUMN "parent_kind" text;` and `"parent_id" text;`
2. `ADD CONSTRAINT "ki_parent_kind_ck"`, `ADD CONSTRAINT "ki_parent_pair_ck"`,
   `CREATE INDEX "ki_parent_idx" ON "knowledge_items" ("parent_kind", "parent_id");`
3. `ALTER TABLE "knowledge_items" DROP CONSTRAINT "ki_role_ck";` then re-add it with the five
   values. Postgres has no "alter check"; drop and recreate is the only spelling.
4. **Backfill routine prompts.** `UPDATE "knowledge_items" ki SET "parent_kind" = 'routine',
   "parent_id" = r."id", "role" = 'prompt' FROM "routines" r WHERE r."prompt_knowledge_id" = ki."id";`
   Must run before step 7 — it reads the column being dropped.
5. **Backfill agent identities.** `UPDATE "knowledge_items" SET "parent_kind" = 'agent',
   "parent_id" = "scope_id" WHERE "role" = 'agent_file' AND "scope_kind" = 'user' AND "scope_id" IS
   NOT NULL;` `role` stays `agent_file`. `scope_kind`/`scope_id` stay exactly as they are —
   identical reach to today, and the plan is explicit that scope is stored on the item, never
   derived from the parent (plan `151-174`). An `agent_file` that is not user-scoped gets no parent;
   §4 and Concern 1 say what that means.
6. `CREATE UNIQUE INDEX "ki_parent_slot_uq" ON "knowledge_items" ("parent_kind", "parent_id",
   "role") WHERE "role" <> 'ordinary';` **After** the backfills, deliberately: if the data cannot
   satisfy the singular-slot property the migration fails loudly here instead of binding a shared
   document to an arbitrary parent. See Concern 3.
7. `ALTER TABLE "routines" DROP COLUMN "prompt_knowledge_id";` — this drops
   `routines_prompt_knowledge_id_fk` with it.

No edit-log rows are written (0068 wrote none either — a migration is not a person's edit) and
`updated_at` is left alone.

**There is no layer step.** The first version of this document nulled the projection layer on prompt
documents to keep them out of the sandbox. §5 explains why that mechanism is gone.

Destructive, per the house rule: no compat column, no dual-write, no alias. The moment step 7 lands,
every reader in §4 must already be on the parent query, so the migration and the code in §4 and §7
ship in one merge.

## 4. Read paths

One predicate, three readers over it, all inside `@hyperidle/knowledge` — the service that owns the
table (`tools/governance/table-owners.json:10`).

New exports from `layers/core-api/knowledge/src/knowledge-repository.ts`, re-exported through
`layers/core-api/knowledge/src/index.ts`:

```ts
/** The item in a parent's named slot — a routine's prompt, an agent's identity. */
export async function getParentedItem(
  db: HyperIdleDb,
  input: {
    readonly parentKind: KnowledgeParentKind;
    readonly parentId: string;
    readonly role: KnowledgeRole;
    readonly status?: "active";
  },
): Promise<KnowledgeItem | null>;

/** The same slot for many parents at once — one query for a list screen. */
export async function listParentedItemIds(
  db: HyperIdleDb,
  input: {
    readonly parentKind: KnowledgeParentKind;
    readonly parentIds: readonly string[];
    readonly role: KnowledgeRole;
    readonly status?: "active";
  },
): Promise<Map<string, string>>; // parentId -> knowledge item id

/** Every item under one parent, whatever its role — feeds the archive-on-delete path. */
export async function listItemIdsByParent(
  db: HyperIdleDb,
  input: { readonly parentKind: KnowledgeParentKind; readonly parentId: string },
): Promise<readonly string[]>;
```

`KnowledgeParentKind` is a new closed tuple + type next to `KNOWLEDGE_ROLES` in
`framework/domain-model/src/knowledge.ts`:
`export const KNOWLEDGE_PARENT_KINDS = ["knowledge_item","task","thread","routine","agent"] as const;`
It mirrors the DB CHECK the way `KNOWLEDGE_ROLES` mirrors `ki_role_ck`.

Parent + role together is the singular-slot query: parent says where it hangs, role says where it
lands. Parent alone cannot express "the prompt of this routine" (plan `41-43`).

Then:

- **`getAgentIdentity`** (`knowledge-repository.ts:1317`) — signature unchanged; the predicate
  becomes `parentKind='agent' AND parentId=<agentId> AND role='agent_file' AND status='active'`,
  implemented as `(await getParentedItem(db, {...}))?.body ?? null`. The
  `scopeKind='user' AND scopeId=<agentId>` predicate is deleted: that is the mechanism being retired.
- **`getAgentIdentityIds`** (`knowledge-repository.ts:1339`) — signature unchanged
  (`agentIds -> Map<agentId, itemId>`), implemented as `listParentedItemIds` keyed on `parentId`.
  Its three callers (`layers/core-api/src/routes/agent-profile.ts:148`,
  `layers/core-api/src/routes/agents.ts:188` and `:391`) are untouched.
- **Routine prompt** — `layers/core-api/routine/src/routine-service.ts:545` reaches the document
  through `routine.promptKnowledgeId` and the injected `getKnowledgeBody` port. The pointer is gone,
  so the port changes shape:

  ```ts
  // layers/core-api/routine/src/ports.ts:279 and routine-service.ts:419
  /** The routine's instruction, read from the knowledge document parented to it. */
  getRoutinePrompt(db: HyperIdleDb, routineId: string): Promise<string | null>;
  ```

  `getKnowledgeBody` is deleted (no other caller). The port is **required**, not optional —
  `ports.ts:270-276` records the exact failure an optional port produced before: two call sites
  never wired `getAgentIdentity`, compiled clean, and baked nothing. The resolver call becomes
  `const routinePrompt = await deps.getRoutinePrompt(db, routine.id);` and everything downstream
  (the ranker's `taskDescription`, `contextBundle.routine.prompt`) is unchanged.

  Wired in `layers/core-api/src/services/routine-scheduler-bindings.ts:165` as
  `getRoutinePrompt: async (db, routineId) => (await getParentedItem(db, { parentKind: "routine", parentId: routineId, role: "prompt" }))?.body ?? null`.
  No status filter: today's read has none, and a manually archived prompt should keep behaving as it
  does today.

  A required port breaks two tests that build exhaustive `RoutineSchedulerPorts` bags —
  `layers/core-api/routine/src/__tests__/routine-scheduler-completeness.integration.test.ts:74` and
  `routine-transition-constraint.integration.test.ts:70`. Both get the port. That is the guard
  working, not collateral damage.

- **`agentBindingId`** (`framework/domain-model/src/work-intent.ts:249`) — becomes the parent, not
  the scope:

  ```ts
  agentBindingId: item.parentKind === "agent" ? item.parentId : null,
  ```

  `SessionKnowledgeItemLike` (`work-intent.ts:209`) gains `readonly parentKind: string | null` and
  `readonly parentId: string | null` — required properties, nullable values, the same rule its own
  doc comment already states for `role`/`scopeId`, because both are kernel columns present on every
  row — and **drops `scopeId`**, which had no other reader in that file.

  `layers/agent-orchestration/run-orchestration/src/context.ts:892-897` needs no logic change:
  `=== agentId` still means "my identity, already delivered as the AGENTS.md `## Identity` section",
  a non-null other id still means "not mine", `null` still means "unbound, applies to every
  session". The BA9f `@lore` at `context.ts:846-853` is reworded to say the binding is the parent.

  **One semantic flips, and it is deliberate.** Today an `agent_file` at team scope derives
  `agentBindingId = <teamId>`, which matches no agent, so it is skipped everywhere. Under the parent
  derivation it has no parent, which means unbound — and an unbound agent file is written into every
  session in reach (`context.ts:899-905`, BA9b's stated intent). So a team-scoped `agent_file` goes
  from silently inert to broadly delivered. The backfill cannot fix this: a team-scoped row names no
  agent, so there is no parent to give it. Only the now-removed role selector (§2) could ever have
  created one, so the population is whatever exists today and can grow no further. The brownfield
  test pins the behaviour rather than leaving it to be discovered; Concern 4 flags it for the founder.

## 5. Two guards keep a prompt out of the sandbox

`prompt` lands as the run's instruction (plan `85`). It must never also be written into the
sandbox as a file. Both guards are on `role`, and neither involves `layer`.

1. **The capability fetch takes an allowlist.** `fetchCapabilityItems`
   (`layers/core-api/knowledge/src/session-knowledge-assembler.ts:334`, predicate at `:359`) selects
   `ne(role, 'ordinary')`. Under the widened vocabulary that sweeps in every routine prompt in
   reach. It becomes `inArray(knowledgeItems.role, ["skill", "rule", "agent_file"])` — the roles
   that materialise, named. A role added later is excluded by default instead of included by
   default, which is the safe direction for a set that decides what reaches an agent.
2. **`writeBundleKnowledge` refuses a prompt outright.** In
   `layers/agent-orchestration/run-orchestration/src/context.ts:865` (the `for` loop over the
   bundle), before the `skill` branch: `if (role === "prompt") continue;`. Not defensive
   duplication — it is the second, independent guard, and it is the one that holds no matter how an
   item reached the bundle. Without it, a prompt that arrives through the layer path falls into the
   trailing `role === 'ordinary'` branch (`context.ts:909`) and is written as a knowledge file.

**Why not `layer IS NULL`.** The first version of this document kept prompts out of the layer fetch
by giving them a null projection layer. That mechanism is unbuildable and unsafe, for three separate
reasons, all verified:

- `upsertPluginDocument` derives the layer unconditionally from scope — `layer:
  scopeToLayer(input.scopeKind)` (`knowledge-repository.ts:1412`) — and takes no layer input, so the
  plugin-install path cannot express "no layer" at all.
- `update()` re-derives it: `...(nextScopeKind ? { layer: scopeToLayer(nextScopeKind) } : {})`
  (`knowledge-repository.ts:425-432`). Any scope change on a prompt restores its layer, and the
  scope-change affordance is reachable from the knowledge content view.
- The nested-knowledge strand is deleting the `layer` column outright (plan `137-139`). Building a
  correctness guarantee on a column scheduled for removal hands that strand a regression it did not
  cause.

Layer is derived in several places, enforced in none, and is on its way out. Role is the column this
mechanism is actually about. The two guards above cost two lines and depend on nothing else.

Consequence, stated plainly because it is a behaviour change: a routine prompt is no longer written
into `knowledge/` in every session in its scope. It lands as the run's instruction only. That is what
the plan's role table says `prompt` means.

## 6. Deleting a parent archives its knowledge

**Archive, and the API already exists** (plan `271-287`). A hard delete is impossible:
`knowledge_edit_log` (`framework/db/src/schema.ts:878`), `knowledge_access_log` (`:908`) and
`knowledge_conflicts` (`:926`) hold `onDelete: "restrict"` FKs on `knowledge_items.id`, deliberately,
so an agent can never wipe its own authored history. `setKnowledgeStatus(exec, ids, "archived")` is
the operation, already exported (`knowledge-repository.ts:1441`) and already called from the routine
DELETE route (`layers/core-api/src/routes/routines-routes.ts:345`). **No new write function.** The
only new piece is the read that finds the ids: `listItemIdsByParent` from §4.

**Seam: route composition. No new port, no new package crossing.** The routine and users services may
not write `knowledge_items`; the composition root already meets both services and already does
exactly this today.

- `layers/core-api/src/routes/routines-routes.ts` DELETE `/:id` — the `existing.promptKnowledgeId`
  branch becomes
  `await setKnowledgeStatus(db, await listItemIdsByParent(db, { parentKind: "routine", parentId: routineId }), "archived");`
- `layers/core-api/src/routes/agents.ts` DELETE `/:id` (`:404-422`) — the same two lines with
  `parentKind: "agent", parentId: id`, after `updateUser(db, id, { status: "retired" })`. That file
  already imports `@hyperidle/knowledge` (`agents.ts:30`).

`setKnowledgeStatus` on an empty array returns immediately (`knowledge-repository.ts:1446`), so a
parent with no knowledge needs no branch.

Archived items reach no session (`session-knowledge-assembler.ts:304`) and drop out of the knowledge
surfaces, which is the intent. There is no un-archive path in the UI; the plan accepts that
(`289-291`).

## 7. Write paths — every binding writer, none missed

Three call sites write a binding today. The first version of this document named one. All three are
listed here, and each has a mechanical guard so a fourth cannot be added silently.

**a. Routine prompt, `layers/core-api/src/routes/routines-routes.ts`.** BA9f's rule survives:
`prompt` stays the field a caller writes, and the text lands in a knowledge document. Only the
direction of the link flips — the document names the routine.

- `createRoutinePromptDocument` (`:159`) takes `routineId` and passes
  `parentKind: "routine", parentId: routineId, role: "prompt"`. Scope logic untouched (team-scoped
  when the owner agent has a team, factory otherwise — the BA9g `@lore` at `:158-163` still holds).
  It keeps passing its derived `layer`; §5 means the layer no longer decides anything.
- `POST /` (`:282-303`) — order flips. `insertRoutine` first (it no longer carries
  `promptKnowledgeId`), then create the document if `body.prompt`. Side benefit worth keeping: today
  an invalid cron returns 400 *after* the prompt document was created, orphaning it; the new order
  cannot. The 201 body is the routine row, so it loses `promptKnowledgeId` and gains `prompt`,
  matching what GET (`:401`) and PATCH (`:514`) already return.
- `PATCH /:id` (`:473-486`) — `existing.promptKnowledgeId` becomes
  `await getParentedItem(db, { parentKind: "routine", parentId: routineId, role: "prompt" })`.
  Found → `updateKnowledgeItem(db, doc.id, { body, updatedBy }, doc.version)` as today. Not found and
  a non-empty prompt → create with the parent. `updates.promptKnowledgeId` disappears.
- `readRoutinePrompt` (`:142`) takes `routineId` and reads through `getParentedItem`; both response
  sites pass the routine id.
- DELETE `/:id` — §6.

**b. Agent identity, three writers, and this is B1's lesson.**

- `upsertAgentIdentity` (`knowledge-repository.ts:1275`) adds `parentKind: "agent", parentId:
  input.agentId` to its insert values. `scopeKind: "user"`, `scopeId: agentId`, `role: "agent_file"`
  and the `layer: null` projection all stay — identical reach. Its callers
  (`layers/core-api/src/routes/users.ts:70`, `org.ts:279` and `:317`, `teams-routes.ts`, and
  `layers/core-api/org/src/scaffold-agents.ts:192` through its existing port) need no change.
- **`layers/core-api/src/routes/plugins.ts:417-427` writes a plugin agent's identity through
  `upsertPluginDocument` with `scopeKind: "user", scopeId: dbId, role: "agent_file"` and no parent.**
  It must pass `parentKind: "agent", parentId: dbId`. Left alone, every plugin-installed agent
  resolves to a null identity the moment §4 retires the scope predicate — no `## Identity` in
  AGENTS.md, `identityKnowledgeId: null` on the agent page.
- **`tools/setup/src/demo-fixture.ts:103-138` inserts identity documents directly** with the same
  scope-based binding and no parent. It runs *after* migrations, so step 5 cannot repair it. It must
  write `parentKind: "agent", parentId: agentUserId` on the kernel insert.

  Guard: `UpsertPluginDocumentInput` (`knowledge-repository.ts:1229`) gains
  `parentKind: KnowledgeParentKind | null` and `parentId: string | null` as **required properties
  with nullable values** — not optional. All three call sites (`plugins.ts:388` skills,
  `:417` identity, `:444` routine prompt) are then named by `npm run check`, and the skills call
  site says `null` out loud. `CreateKnowledgeItemInput` (`:43`) keeps them optional, because there
  "no parent" is the ordinary case and every caller would otherwise write `null` as noise.

  Second guard, and the one that catches the demo fixture: `tools/setup/src/__tests__/factory-and-demo.integration.test.ts:196-205`
  and `tools/setup/src/__tests__/X3-agent-config-bootstrap.integration.test.ts` both assert the
  identity through the **retired** predicate (`k.scope_kind = 'user' AND k.scope_id = u.id AND
  k.role = 'agent_file'`). As written they stay green while the app is broken. Both move to
  `k.parent_kind = 'agent' AND k.parent_id = u.id AND k.role = 'agent_file'`, which turns a missing
  parent red.

**c. Plugin routine prompt, `layers/core-api/src/routes/plugins.ts:437-470`.** Same flip as (a):
`insertRoutine` first, then `upsertPluginDocument` with the deterministic id `ki_rp_${routineDbId}`,
`parentKind: "routine", parentId: routineDbId`, and `role: "prompt"` (it is `"ordinary"` today at
`:454`). Contribution recording is unchanged.

**Column removal**, mechanically forced by the type system once the schema column is gone
(`npm run check` names every one): `framework/db/src/schema.ts:565-568`, `routine-service.ts`'s
`insertRoutine` input and `RoutinePatch`, and the route call sites above. Existing tests that assert
on `promptKnowledgeId` (`routines.prompt-document.integration.test.ts`,
`BA9g-routine-delete-cleanup.integration.test.ts`, `BA9g-routine-prompt-scope.integration.test.ts`,
`update-routine.integration.test.ts`, `routine-scheduler-baked-emit.integration.test.ts`,
`routine-run-resolver.integration.test.ts`) are rewritten to assert the same behaviour through the
parent query — they are the behaviour spec, not casualties.

**The parent fields are exposed over HTTP, and that is accepted.** `GET /api/knowledge`
(`layers/core-api/src/routes/knowledge.ts:345-350`) spreads the kernel row, and `GET /:id` returns
it, so `parentKind`/`parentId` appear in both responses the moment the column exists. No filtering
code is written: they are kernel fields like `role` and `scopeKind`, both already exposed, and
nested knowledge needs them. What phase 1 does *not* add is any way to **set** them over HTTP — the
create schema (`:184-215`) gains no parent fields, because every parented item in this phase is
created by a server-side writer that knows its parent.

## 8. UI — lists own create and delete, the content view owns read and update

Built against the plan's governing model (`176-248`): each type is reached from its own list, where
it is created and deleted; clicking through opens the ordinary knowledge content view to read and
edit the body; there is no bespoke editor per type; and human, agent and plugin have identical power.

Phase 1 builds one list — skills and rules — plus the removals that make it the way in.

**New:** `layers/core-ui/src/settings/SettingsSkillsAndRules.tsx` +
`SettingsSkillsAndRules.stories.tsx` (every custom component carries a story,
`.claude/rules/visual-regression.md`). It follows `SettingsFilesystems.tsx` (183 lines, `apiFetch`,
local state, `Tag`, honest empty and error states) rather than the split-pane `SettingsAgents`.

- **List** — reads the existing `GET /api/knowledge`, filters to `role === "skill" || role === "rule"`,
  sorted by title. No new endpoint and no server-side role filter: the knowledge list and this list
  read the same payload and want opposite halves of it. Each row shows title and a `Tag` from
  `KNOWLEDGE_ROLE_LABEL`, and clicking navigates to `/knowledge/:id` — the real content view.
- **Create** — an inline row: a title field and a Skill/Rule choice. `POST /api/knowledge` with
  `{ title, body: "", format: "markdown", status: "active", scopeKind: "factory", role, updatedBy }`,
  then navigate to `/knowledge/:id` so the person writes the body in the content view. Two details
  that are not obvious: `status` must be passed explicitly because the route defaults to `"draft"`
  (`layers/core-api/src/routes/knowledge.ts:477`) and only `active` items reach a session; and the
  route already accepts `role` on create (`:214`), so **no endpoint changes**.
- **Delete** — `POST /api/knowledge/:id/archive` (`layers/core-api/src/routes/knowledge.ts:677`),
  then refetch. Archive is what delete means everywhere in this system (§6). No endpoint changes.

This is what makes removing the role selector safe: creating a skill is now a first-class human act
rather than something only a plugin could do.

**Registered** in `layers/core-ui/src/pages/SettingsPage.tsx` group 2, immediately after
`settings-section-agents`, as `<section id="settings-section-skills"
data-testid="settings-section-skills">` with `<SectionTitle>Skills & rules</SectionTitle>`.

**Removed from the knowledge navigation, in the same change:**

- `layers/core-ui/src/pages/KnowledgeList.tsx` — `ApiKnowledgeItem` (`:140`) gains `role?: string`
  (already in the payload, just undeclared), and the `allItems` memo (`:845`) drops `skill` and
  `rule` before the triage/curated split, so both tabs and the topic grouping are covered.
- `layers/core-ui/src/layouts/AppShell.tsx:552-560` — the sidebar fast-nav `useFetch` generic is
  declared as `items: ReadonlyArray<{ id: string; title: string }>`, so it needs the **type widened**
  with `role?: string` before the filter compiles; then the same two roles drop out before
  `.slice(0, 5)`.

**Not in this phase:** the routines, agents and tasks lists (they exist already, and giving each its
create/delete parity is not this phase's work); the full agent section in the nav; hiding parented
items from the knowledge list. Rule 2 of the governing model says the knowledge list eventually shows
general knowledge only — items with a role or a parent leave it. Phase 1 removes the two that have a
new home (skill, rule). `prompt` and `agent_file` items stay until the nested-knowledge strand
implements the tree rules against the parent column this phase creates (plan `239-242`); a routine
prompt has been visible in the knowledge view since 0068, so nothing regresses in the meantime.

## 9. Dependency order

Validation before implementation, per `CLAUDE.md`. Each increment writes its failing tests first.
Increments 1-3 are ordered **steps of one merge**, not separately shippable: the migration drops
`routines.prompt_knowledge_id`, so the readers must move in the same change (destructive-migration
rule). The branch is red between them; that is expected.

**1. The slot exists.**
Red first: `framework/db/src/__tests__/migration-0077-brownfield.integration.test.ts`, modelled on
`migration-0076-brownfield.integration.test.ts` — pre-state produced by running the **real**
migrations 0..76 against a populated PGlite, never hand-rolled DDL (that test's own `@lore` records
why). The pre-state covers, deliberately, the awkward rows and not just the happy one:

| Seeded before 0077 | Asserted after |
|---|---|
| routine with a prompt document | `parent_kind='routine'`, `parent_id=<routineId>`, `role='prompt'` |
| an **already-archived** prompt document | same parent + role, `status` still `archived` |
| a **plugin-installed** prompt (deterministic `ki_rp_*` id) | same parent + role, contribution row untouched |
| agent with an identity | `parent_kind='agent'`, `parent_id=<agentId>`, `role='agent_file'`, `scope_kind='user'` and `scope_id` **unchanged** |
| an `agent_file` at **team** scope | no parent — and §4's flip is pinned here |
| a **human** user's `agent_file`, if the fixture has one | `parent_kind='agent'` (see Concern 5) |
| — | `routines` has no `prompt_knowledge_id` column |
| — | `parent_kind` of `knowledge_item`, `task` and `thread` are **accepted** (the three unused values are real, not decoration) |
| — | `parent_kind='bet'` rejected; `parent_kind` set with `parent_id` NULL rejected; `role='prompt'` accepted |
| — | a second `role='prompt'` row under one routine is rejected by `ki_parent_slot_uq`; two parentless skills are **not** |

Plus a row in `framework/db/src/__tests__/indexes.integration.test.ts` for `ki_parent_idx`.
Then: schema columns/constraints/indexes, `KNOWLEDGE_PARENT_KINDS`, `KNOWLEDGE_ROLES` widening,
`KNOWLEDGE_ROLE_LABEL` label, migration 0077 + journal row.

**2. Knowledge reads and writes by parent.**
Red first: knowledge-service integration — `getParentedItem`/`listParentedItemIds` find items by
parent and role and ignore scope; `listItemIdsByParent` returns every role under a parent and
nothing else; `getAgentIdentity`/`getAgentIdentityIds` resolve an identity that has a parent but a
*different* scope than today (the test that proves the reverse lookup is gone); `upsertAgentIdentity`
writes the parent.
Then: the three new functions, the two reimplemented readers, `CreateKnowledgeItemInput`,
`UpsertPluginDocumentInput` (required-nullable), `upsertAgentIdentity`, the barrel.

**3. The pointer column dies, and every binding writer moves.**
Red first: routes integration — `POST /api/routines` with a prompt produces a document parented to
the routine and returns `prompt` in its 201 body; GET and PATCH round-trip the text; PATCH on a
routine with no prompt creates one; DELETE archives it; `DELETE /api/agents/:id` archives the
identity; **a plugin install produces both a parented prompt and a parented identity**; and the two
bootstrap tests (`factory-and-demo.integration.test.ts:196-205`,
`X3-agent-config-bootstrap.integration.test.ts`) rewritten onto the parent predicate. Plus
routine-resolver integration: the baked bundle carries the instruction with no pointer column in play.
Then: the `getRoutinePrompt` port and its three wiring sites, the four routine route handlers,
`plugins.ts` (both writers), `demo-fixture.ts`, the schema/type removals, the rewritten tests.

**4. Nothing leaks into a session.**
Red first: assembler integration — a routine prompt in reach does **not** appear in
`assembleSessionKnowledge`'s output while its skills, rules and identity still do. Unit — a `prompt`
item handed directly to `writeBundleKnowledge` writes no file (the second guard, tested
independently of the first); `toBakedContextKnowledgeItems` derives `agentBindingId` from
`parentKind`/`parentId` (rewrite of `framework/domain-model/src/__tests__/ba9b-knowledge-roles.test.ts`);
`writeBundleKnowledge` still skips this agent's own identity and still writes a parentless agent file
(`ba9b-capability-materialisation.test.ts` fixtures move from `scopeId` to the parent fields).
Then: the allowlist, the `prompt` guard, the `agentBindingId` derivation, `SessionKnowledgeItemLike`,
the `@lore` rewordings.

**5. Skills and rules get a home, and role stops being editable.**
Red first: component tests — `SettingsSkillsAndRules` lists skill and rule rows and links each to
`/knowledge/:id`; create posts `role` and `status:"active"` and navigates to the new item; delete
posts to `/archive` and the row leaves; `KnowledgeList` renders no `skill` or `rule` item; the
sidebar list renders none either; the knowledge content view has no role control. Route integration:
a PATCH carrying `role` leaves the role unchanged.
Then: the component and its story, the `SettingsPage` section, the two nav filters (with the
AppShell type widening), and the four role-removal edits from §2 including deleting
`KnowledgeDetail.role.test.tsx` and trimming `knowledge.role.integration.test.ts`.
Checkpoint: founder looks at the live render before this is called done — it is new UI, and it now
carries create and delete rather than only a list.

**Verification lanes.** `npm run check` and `npm run lint` after every increment;
`npm run test:integration:service` for 1-4; `npm run test:full` for the unit and component work;
`npm run verify` before the PR.

## 10. Which acceptance criteria are tests and which are not

| Criterion | Enforced by |
|---|---|
| Parent vocabulary is exactly five values; all five accepted, a sixth rejected | DB CHECK — asserted both ways in the 0077 brownfield test (a constraint is not a type; the honest lane is a DB integration test) |
| A parent kind without an id is rejected | DB CHECK, same test |
| A parent has at most one item per named role | `ki_parent_slot_uq` — asserted by a rejected second insert, and by the migration itself failing if existing data violates it |
| `prompt` is a legal role | DB CHECK, same test |
| Every role has a reader-facing label | Type system — `Record<KnowledgeRole, string>` fails `npm run check` |
| Every `upsertPluginDocument` caller states its parent | Type system — required-nullable input fields name all three call sites |
| `routines.prompt_knowledge_id` has no readers left | Type system — the column is gone from the schema, so `npm run check` names every stale reference. No grep guard, no lint rule |
| The demo fixture writes the parent | Runtime — the two bootstrap tests, once moved onto the parent predicate |
| Backfill preserves reach and identity, including the awkward rows | Runtime — 0077 brownfield integration test |
| Identity and prompt resolve by parent | Runtime — knowledge + routes + resolver integration tests |
| Deleting a parent archives its knowledge | Runtime — routes integration tests |
| A prompt never reaches a session sandbox | Runtime — assembler integration (guard 1) **and** a `writeBundleKnowledge` unit test (guard 2), tested separately so neither guard can hide the other's absence |
| Role cannot be edited after creation | Runtime — route integration (PATCH leaves it unchanged) + the deleted UI control |
| Skills and rules are listed, creatable and deletable in settings, and absent from knowledge nav | Runtime — component tests |
| The parent-kind tuple mirrors the DB CHECK | Neither — a two-line diff review challenges. Not worth a guard at this size |

No work-package ids appear in any of the code, per house rule; `@lore` tags are the exception and
carry them as they already do.

## 11. Out of scope (named so nobody builds them)

The knowledge tree and its display rules (nested-knowledge strand, building against the column this
phase creates); role and scope search filtering
(`.pipeline/work/knowledge-role-scope-filtering/`); artifacts, task descriptions and thread parents
beyond declaring the enum values; `handleCreate` giving agent-written files a parent (phase 2);
create/delete parity on the routines, agents and tasks lists; the full agent section in the nav;
setting a parent over HTTP.

## 12. Concerns

Decisions I am carrying out as written, that a reviewer should see stated:

1. **A team-scoped `agent_file` changes behaviour.** §4 details it: silently inert today, delivered
   to every session in the team after. No backfill can fix it (the row names no agent), the
   role-selector removal means no new ones can be created, and the brownfield test pins whatever
   happens. If the founder wants those rows archived instead, that is a one-line addition to the
   migration and I would rather be told than guess.
2. **An ordinary note can no longer be promoted to a skill.** That follows directly from role
   becoming create-only, and it is the price of closing the two defects the critique found. Worth
   confirming nobody relies on the promotion path today.
3. **A shared prompt document now fails the migration instead of binding arbitrarily.**
   `routines.prompt_knowledge_id` never had a unique constraint. No production path creates two
   routines pointing at one document, but if one exists, `ki_parent_slot_uq` (step 6) aborts the
   migration. That is the right failure — a human decides which routine owns it — but it is an
   upgrade that stops rather than one that silently proceeds.
4. **An agent's delete door is a soft retire.** `DELETE /api/agents/:id` sets `status='retired'`.
   Archiving the identity there is the same act, but nothing un-archives it if the agent comes back
   through PATCH, and there is no un-archive path in the UI (the plan accepts that generally).
5. **The migration labels a human user's `agent_file` as `parent_kind='agent'`.** `scope_kind='user'`
   does not distinguish an agent from a person, and there is no way to tell from inside knowledge's
   own vocabulary — reading `users` from the knowledge service is the boundary that
   `visibleToViewer`'s `@lore` (`knowledge-repository.ts:610-613`) already refuses to cross.
   Cosmetic today: nothing reads `parent_kind='agent'` except identity resolution, which looks up an
   agent id it already has. It would matter if a future surface listed "all agents with an identity"
   off the parent column.
6. **`getRoutinePrompt` is a required port.** One more thing to wire at each construction site, and
   it breaks two exhaustive port-bag tests. Chosen over an optional port because `ports.ts:270-276`
   records the exact bug an optional one caused before — two sites wired nothing, compiled clean,
   and baked no identity. A routine silently running with no instruction is the same failure.
