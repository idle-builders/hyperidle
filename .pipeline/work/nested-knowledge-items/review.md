# Implementation review — nested knowledge items

Independent, cold read of `git diff origin/main...HEAD` (157 files, merge base
`bed7972d8`, HEAD `8d7ea0653`). Depth: full. Nothing was taken on trust from a
builder report, a commit message or a code comment; every finding below cites a
file/line I read or a command I ran.

## Verdict

**NOT DONE.**

Four of the six plan acceptance criteria fail on the shipping path. The tree
never reaches the interface, the human-built tree never reaches the sandbox, the
team-visibility read has no production caller, and three of the five retired
words are still live. The parts that are done — the migration, the transaction
invariants, the status collapse, the gate deletion, the table-ownership
reroute — are done well.

---

## What I ran

| Command | Result |
|---|---|
| `npm run test:full` | **520 files / 5362 tests passed** |
| `npm run test:integration:service` | **310 passed / 1 skipped, 2247 tests passed** |
| `npx vitest --config vitest.integration.config.ts --project service` on the four new integration files | **4 files / 15 tests passed** |
| `npm run knip` | clean (configuration hints only) |
| `npx biome check` on the four most-changed source files | 0 errors, 12 warnings |
| `npx playwright screenshot http://localhost:5173/knowledge` against a live `npm run dev` | rendered (see AC1) |

I did **not** re-run the full `npm run check` / `npm run lint`. The founder's
independent confirmation of exit 0 at `8d7ea0653` is consistent with what I saw
(biome reports only warnings on the changed files), and I have no evidence to
dispute it. Working tree is clean apart from an untracked
`.pipeline/work/nested-knowledge-items/checks-latest.log`.

---

## Acceptance criteria

| # | Criterion | Verdict |
|---|---|---|
| 1 | A tree renders; a parent opens as a knowledge item with its children listed | **FAIL** (children half passes; there is no tree) |
| 2 | Nesting and moving work and the tree keeps up | **FAIL** (API only; no human affordance) |
| 3 | Agent nested folders → same tree; human tree → sandbox directories | **FAIL** (both halves) |
| 4 | A team-scoped branch is invisible outside that team | **FAIL** (implementation has no caller) |
| 5 | A task's knowledge appears on the task, never in the tree | **PARTIAL** (off-tree proven; on-task surface does not exist — plan defers the object) |
| 6 | `topic`/`kind`/`layer`/`product`/`practice` gone from schema, interface, agent tools | **FAIL** (schema passes; interface and agent tools do not) |

| Founder ruling | Verdict |
|---|---|
| Status is exactly `proposed \| active \| stale \| archived`, both enums collapsed, §2 mapping applied to real rows | **PASS** (with a compat shim — B11) |
| Layer-keyed gate deleted with nothing replacing it | **PASS** |
| Agent receives factory + its team + its own, straight off scope | **PASS** |
| Filenames keep the id suffix | **PASS** |
| A new directory creates its item | **PASS** (in the processor) |
| A created item inherits its parent's scope | **FAIL** (B6 — always falls back to `factory` in production) |
| Narrowing a parent cascades | **PASS** |
| The three invariants run inside the write transaction | **PASS** |

---

## BLOCKING

### B1 — AC1: the Knowledge list is flat. There is no tree.

`layers/core-ui/src/pages/KnowledgeList.tsx:27-33` states it outright:

> `@lore nested-knowledge-items: topic grouping … is REMOVED … The Curated tab
> is now a flat sorted list, same rendering shape as Triage. Browsing the actual
> tree (parent/child nesting) lives on the detail page's children list, not here.`

Topic grouping was deleted (`KnowledgeTopicGroup.tsx` gone) and replaced with a
flat `ItemList` (`KnowledgeList.tsx:421`, `:581`). The sidebar fast-nav is flat
too (`layers/core-ui/src/layouts/AppShell.tsx:564-576` — filter, `.slice(0,5)`,
`{id,title}`). I confirmed on the painted output: `/knowledge` renders
Curated/Triage tabs, All/Shared/Team/Private pills and a recency sort bar — no
expander, no indentation, no nesting affordance anywhere.

**Impact:** AC1's first clause ("opens Knowledge, sees a tree") is not
delivered. The second clause is: `ChildrenCard`
(`layers/core-ui/src/pages/KnowledgeDetail.tsx:390-421`) renders the ordered
children `GET /knowledge/:id` now returns
(`layers/core-api/src/routes/knowledge.ts:333-338`).

**Governing:** plan.md "Success looks like" bullet 1. plan.md's "Not in this
item" excludes only drag-to-reorder and *the sidebar navigator's own design* —
not the tree itself.

### B2 — AC1/AC4: the tree read exists and nothing calls it.

`list(db, { tree: { viewerTeamId } })`
(`layers/core-api/knowledge/src/knowledge-repository.ts:982-985, 1059-1067`) and
its `scopeVisibleCondition` (`:946-953`) are the only implementation of the
depth-bounded tree read and of team visibility. I searched the whole repo:

```
rg -n "\btree:\s*\{" layers/ framework/ applications/ tools/
→ knowledge-repository.ts (declaration) + knowledge-tree-reads.integration.test.ts (3 call sites)
rg -n "viewerTeamId" layers/ framework/ applications/ tools/
→ same file + same test, nothing else
```

There is no `/tree` route (`rg -n "tree" layers/core-api/src/routes/knowledge.ts`
returns comments only). The code is reachable **only from its own test**. Under
the standing rule that test-only-reachable code is dead, this is a
green test proving nothing about the product.

### B3 — AC4: `GET /api/knowledge` applies no team filter, and `children` applies none at all.

The list route the interface actually calls uses
`listKnowledgeItems(db, { visibleWithSignals: userId })`
(`layers/core-api/src/routes/knowledge.ts:281`), whose only visibility predicate
is the pre-existing Q2 one — `scope_kind != 'user' OR updatedBy = viewer`
(`knowledge-repository.ts:1035-1046`). Team-scoped rows are returned to
everybody.

Worse, `list(db, { childrenOf: { parentId } })`
(`knowledge-repository.ts:1024-1033`) has **no visibility filter of any kind** —
not the team condition, not `visibleToViewer`. `GET /knowledge/:id` returns that
array verbatim (`routes/knowledge.ts:337`) and `ChildrenCard` renders it. A
non-member opening a factory-scoped parent sees the titles of, and links to,
every team-scoped and every private child underneath it.

**Governing:** plan.md "Success looks like" bullet 4; architecture.md §0 D2
("Built, same rule on the human read path"); architecture.md §4 ("a team-scoped
branch is invisible outside that team, **children included**").

### B4 — AC3: a human-built tree does not arrive in the sandbox as directories.

`writeOrdinaryItem` (`layers/agent-orchestration/run-orchestration/src/context.ts:794-806`)
walks `item.parentChain` to create the ancestor directories. `parentChain` has
**no producer anywhere in production**:

```
rg -n "parentChain" layers/core-api/ framework/api-contract/ layers/agent-orchestration/src/
→ exit 1, zero matches
```

The only writer is `toBakedContextKnowledgeItems`
(`framework/domain-model/src/work-intent.ts:264`) doing `item.parentChain ?? []`,
fed by rows from `assembleSessionKnowledge` that carry no such field. So the
chain is permanently `[]` and every ordinary item is written flat into
`knowledge/`.

The repo's own end-to-end integration test says so. `context-bundle-sandbox-byte-parity.integration.test.ts:238-246`
drives the real assembler → real bake → real sandbox against a real DB and
asserts:

```
expect(newKnowledgeFiles).toEqual([
  "Factory-wide_practice_item-i12.md",
  "The_agent_s_own_note_item-i12.md",
  "Team-scoped_product_knowledge_item-i12.md",
].sort());
```

— three files, no directories. And `context-bundle-consumption.test.ts:156-157`
records the intent explicitly: *"every ordinary item (empty parentChain here)
materialises flat into knowledge/."*

Architecture §9 step 3 named this as its own task ("Bake contract
(`BakedContextKnowledgeItem` gains the parent chain)"). The **field** landed;
the **value** never did.

### B5 — AC3: an agent writing inside an already-materialised folder mints a duplicate folder item.

Two manifests describe the same file, `.fabric/manifest.json`, and they disagree:

- writer — `context.ts:671-676`: `ManifestEntry = { version, source_path, format }`
- reader — `writeback-processor.ts:93-107`: `ManifestEntry = { version, source_path, format, scopeKind: string }`

They are separate structural types in separate packages, so TypeScript never
compares them.

`writeBundleKnowledge` writes a manifest entry only for **leaf items**
(`context.ts:899-945`). Directories created by `writeOrdinaryItem` get none.
`ensureDirectoryChainItem` (`writeback-processor.ts:216-259`) resolves a parent
directory purely through `findItemByPath(manifest, dirRelativePath)` — a lookup
that will always miss for a materialised directory — and on a miss it **creates a
new knowledge item** for it.

So on a real session: an agent adds `knowledge/Product/Pricing/note.md` inside a
directory pair the materialiser wrote from the real tree; writeback creates a
brand-new "Product" item and a brand-new "Pricing" item under it, and parents the
note under the duplicate. It does not join the tree it was handed. AC3's first
clause — "produces **that same** tree" — fails.

(The title also does not round-trip: the materialiser slugifies via
`toSkillDirName(ancestor.title)` (`context.ts:797`); writeback re-titles from
`path.basename(dirRelativePath)` (`writeback-processor.ts:243`).)

### B6 — D4: a created item does not inherit its parent's scope in production, and the test for it cannot fail.

Because the materialiser never writes `scopeKind` into a manifest entry (B5),
`existing.entry.scopeKind` is `undefined` for every real entry, and
`ensureDirectoryChainItem`'s `parent?.scopeKind ?? "factory"`
(`writeback-processor.ts:230`) plus `handleCreate`'s
`const scopeKind = parent?.scopeKind ?? "factory"`
(`writeback-processor.ts:396`) both resolve to `"factory"`. A file an agent
creates inside a team-scoped folder is created **factory-scoped** — a silent
scope widening, and a second breach of AC4 from the write side.

The end-to-end test's assertion for this is inert:

```ts
// nested-knowledge-writeback.integration.test.ts:164
expect(childItem[0]?.scopeKind).toBe(pricingFolderItem[0]?.scopeKind);
```

The test's own stub writer defaults `scopeKind: input.scopeKind ?? "factory"`
(`:71`), and both rows in that test are created in the same fresh sandbox, so
both are `"factory"`. The assertion reads `"factory" === "factory"` and would
still pass with scope propagation deleted entirely.

### B7 — the end-to-end evidence proves the middle of the wire, not the wire.

Architecture §10 required "a service integration test driving real files into a
real sandbox against a real database … This is the **watcher → writeback →
repository** wire, and it is the one most likely to break silently."

`layers/agent-orchestration/run-orchestration/src/__tests__/nested-knowledge-writeback.integration.test.ts`
delivers real files, a real temp sandbox, a real PGlite database and the real
`createWritebackProcessor()`. It passes (I ran it). But:

- **The watcher is absent.** Every change event is hand-written as a literal
  (`:144`, `:180-186`, `:205-216`, …). `file-watcher.ts` — including the
  directory reporting this item changed at `file-watcher.ts:114` — is never
  invoked.
- **The repository is replaced.** `makeRealDbKnowledgeWriter` (`:59-118`) is a
  hand-rolled Drizzle adapter written inside the test file. It bypasses
  `knowledge-repository.ts` entirely: no `assertParentInvariants`, no
  `nextPositionForParent`, no edit-log row, no `reparent()` transaction, no
  route, no port. The header calls it "a deliberate, discretionary test-only
  seam"; the effect is that the two ends of the named wire are stand-ins.

Combined with B4/B5/B6, this test is precisely why three production defects on
the same path shipped green.

### B8 — AC6: `topic` is still in a live agent tool.

`layers/agent-orchestration/tool-handlers/src/tool-definitions.ts:1076-1080`:

```ts
const splitKnowledgeItemSchema = z.object({
	title: z.string().min(1),
	body: z.string().min(1),
	topic: z.string().optional(),
});
```

and `layers/agent-orchestration/tool-handlers/src/ports.ts:496-502` still
declares `readonly topic?: string`. The api-contract on the other side of the
seam **removed** it (`framework/api-contract/src/core-api-port.ts`, `newItems`
lost `topic?: string`), so a `topic` an agent supplies is now accepted by the
schema and silently discarded. AC6 names agent tools explicitly.

Same tool's description (`:1098`) still says "each new item starts in **draft**"
— a status that no longer exists.

### B9 — AC6: `kind`, `topic`, `layer`, `practice`, `product` are still in the interface.

- `layers/core-ui/src/pages/KnowledgeDetail.tsx:1131-1134` renders a **"Kind"**
  row in the Metadata card. Against real API data `item.kind` is now always
  undefined, so the shipping detail page shows a permanent `Kind —` row for a
  vocabulary that was deleted.
- `KnowledgeDetail.tsx:896` still emits a breadcrumb segment from `item.topic`.
- `KnowledgeDetail.tsx:292-296` still computes `byTopic` related items.
- `layers/core-ui/src/fixtures/knowledge-data.ts` — a **production** file by
  CLAUDE.md's own world rule (no `__` segment, under `layers/`) — still carries
  `layer: string`, `kind: string`, `topic: string` and `scope: "practice"` /
  `"product"` on every row (`:28-31`, `:82`, `:139-145`, `:182-188` …). The diff
  only widened the types from the deleted unions to `string`. That is the
  definition of deprecating rather than deleting.
- `framework/domain-model/src/knowledge.ts:22-23` still exports
  `KNOWLEDGE_TOPIC_HEALTHS` / `KnowledgeTopicHealth`, alive only for that
  fixture's `deriveTopicHealth` and a test.

### B10 — in-flight `agent_work_intents.baked_request_json` crashes on drain.

Architecture §7 named this and gave a direct instruction: *"CLAUDE.md rule 2
requires all data to move in the same change: either drain the queue as a
migration step or rewrite the persisted payloads. **Name which, and do it.**"*
Neither was done — `git diff origin/main...HEAD | rg baked_request_json` matches
only the architecture document itself.

`layers/agent-orchestration/session-requests/src/service.ts:563-566` parses the
stored payload with a raw cast and no re-bake:

```ts
return JSON.parse(intent.bakedRequestJson) as BakedWorkIntentRequest;
```

A row persisted before this branch has knowledge items with `layer` and **no**
`parentChain`. `writeBundleKnowledge` now falls through to
`writeOrdinaryItem` unconditionally (`context.ts:938`), whose first statement is
`for (const ancestor of item.parentChain)` (`:797`) — `TypeError: undefined is
not iterable`. Context assembly for that intent dies.

The pre-change behaviour for the same drift was a `logger.warn` and a skip
(`context.ts:924-931`, deleted in this diff). The upgrade path got strictly
worse than architecture §7 predicted.

### B11 — a status compat shim survives a destructive migration.

`layers/agent-orchestration/tool-handlers/src/tool-definitions.ts:879-905`:

```ts
const LEGACY_STATUS_TO_CURRENT: Readonly<Record<string, KnowledgeStatus>> = {
	draft: "proposed", captured: "proposed", provisional: "proposed",
	proposed: "proposed", validated: "active", active: "active",
	stale: "stale", archived: "archived", needs_human: "archived",
};
```

plus the CAS comment at `:944-947` explaining that `fromStatus: row.status`
passes the **literal legacy value** so an "unmigrated `captured` row" compares
correctly. Migration `0078` step 9
(`framework/db/drizzle/0078_nested_knowledge_items.sql:171-181`) converts every
row; there is no unmigrated read. This is handling for a state that cannot
occur.

**Governing:** CLAUDE.md ABSOLUTE RULE 2 — "no compat layer, alias, shim,
dual-write or dead code left behind". Small to remove; blocking by the letter of
a rule the project calls non-negotiable.

### B12 — an illegal move returns 500, and the accompanying edit is already committed.

`reparent()` throws plain `Error`s: `"…would create a cycle"`,
`"…is wider than parent scope…"`, `"…would exceed the maximum of 32"`,
`"…parent knowledge item X does not exist"`
(`knowledge-repository.ts:110-131`). `PATCH /knowledge/:id` catches only
`VersionConflictError` and `ItemDeletedError`
(`layers/core-api/src/routes/knowledge.ts:508-524`) and rethrows. The global
handler (`layers/core-api/src/middleware/error-handler.ts`) maps none of those
messages — no `"not found"` substring, no mapped `name` — so the caller gets
**500 `{"error":"Internal server error"}`**.

Architecture §3: *"Violations are refused with a **4xx naming the rule**."*
plan.md: *"A move that breaks one of the three rules is refused outright and
reported back."* Neither holds.

Compounding it: the route runs `updateKnowledgeItem(...)` **before**
`reparentKnowledgeItem(...)` (`routes/knowledge.ts:487-506`), in two separate
transactions. A PATCH that changes the title and an illegal parent together
commits the title change and bumps the version, then 500s. The refusal is
partial, which is exactly the "recorded and repaired" outcome the plan rejects.

No test covers the HTTP path for a rejected move — the invariant tests call
`create`/`reparent` directly.

### B13 — parent existence is never validated at the API boundary.

plan.md states this as the accepted cost of the polymorphic parent:

> *"Accepted cost: the parent is no longer a plain foreign key, so existence is
> validated at the API boundary."*

Architecture §8 repeats it for `POST`/`PATCH /api/knowledge` and prescribes
"validating existence through the owning service … before the write
transaction".

Neither route does. `POST` checks only pairing
(`routes/knowledge.ts:381-387`); `PATCH` checks only pairing and null-symmetry
(`:469-484`). `assertParentInvariants` validates existence **only** when
`parentKind === 'knowledge_item'` (`knowledge-repository.ts:404`, `:513`). A
caller may write `parentKind: 'task'` with any string and it is stored.
`work`/`conversation`/`routine`/`agent` are never consulted.

### B14 — the item id leaks into code outside `.pipeline/**`.

166 occurrences of `nested-knowledge-items` outside `.pipeline/**` in non-markdown
files. 132 are `@lore` tags (exempt under the standing rule). **34 are not**,
including five in production files:

- `tools/repo-gates/src/design-profile-census.ts:44`
- `layers/core-ui/src/pages/knowledge/ScopeChangeDialog.tsx:51`
- `layers/core-ui/src/ds/status-mapping.ts:31`
- `layers/core-ui/src/pages/KnowledgeDetail.tsx:1201`
- `layers/core-ui/src/hooks/useKnowledgeItem.ts:36`

and 29 in test headers and `describe(...)` strings (e.g.
`knowledge-tree-invariants.integration.test.ts:29`,
`migration-0078-nested-knowledge-brownfield.integration.test.ts:90`,
`nested-knowledge-writeback.integration.test.ts:131`). The migration **filename**
also carries it: `framework/db/drizzle/0078_nested_knowledge_items.sql`.

Reproduce:
`rg -n "nested-knowledge-items" --glob '!.pipeline/**' -g '!*.md' . | rg -v "@lore"`

### B15 — AC2: no human can nest or move a knowledge item.

`rg -n "parentId|parentKind" layers/core-ui/src --glob '!__tests__'` returns four
hits, all read-side filters (`AppShell.tsx:558-571`, `KnowledgeList.tsx:127`,
`:694-696`). There is no parent picker on the create page, no "Move" action on
the detail page, no drop target, no breadcrumb-based reparent. The capability
exists on `PATCH /knowledge/:id` and is exercised only by tests and by writeback.

plan.md AC2 is "**A person** can nest and move knowledge items, and the tree
keeps up." The "Not in this item" list excludes drag-to-*reorder*, which is a
different thing from nesting and moving at all.

### B16 — the visual gate architecture §10 booked was never run.

Architecture §10: *"replacing a topic-grouped list with a tree is visually novel
and high-exposure, so `.claude/rules/visual-regression.md` makes founder review
of the live render the primary gate. **Book it before the interface work is
called done.**"* `.pipeline/work/nested-knowledge-items/` contains no design or
review artifact, and no `plans/nested-knowledge-items/` folder exists. The rule's
own non-negotiable — "Never claim a UI change is done without looking at the
painted output" — is unmet for a change that rewrote `KnowledgeList.tsx`
(370 lines), `KnowledgeDetail.tsx` and deleted `KnowledgeTopicGroup.tsx`.

---

## NON-BLOCKING DEFECTS

### N1 — `position` is never assigned in the migration.

Architecture §7 closes with *"`position` is assigned by `created_at` within each
new parent."* `0078` adds the column with `DEFAULT 0`
(`0078_nested_knowledge_items.sql:24`) and never runs an assignment. Every
migrated row is `position = 0`; ordering falls through to `title`
(`knowledge-repository.ts:1032`, `:1065`). The brownfield test asserts only that
the column exists (`migration-0078-…test.ts:305-309`).

### N2 — the migration does not convert residual scope values.

`0078` step 10's stated job includes "convert any residual scope value"
(architecture §7). The SQL drops the three columns and stops
(`0078_…sql:184-190`). Every reparenting step is scoped to `role = 'ordinary'`
(correctly — that is what protects `0077`'s rows), so any `skill`/`rule`/
`prompt`/`agent_file` row carrying `product`/`practice`/`task` scope survives
with a scope kind TypeScript no longer admits. `scope_kind` has no CHECK
constraint, so nothing catches it. The population is probably empty today; the
guard the migration uses elsewhere (`RAISE EXCEPTION`) is the honest way to prove
it.

### N3 — the triage badge and the triage list now disagree.

`list({visibleWithSignals})` gained `parentIsKnowledgeItemOrRoot()`
(`knowledge-repository.ts:1045`); `count({triageVisible})` did not
(`:1126-1138`). After `0078` every former task-scoped row is `parent_kind='task'`
and every `captured`/`draft` row is `proposed`, so such rows now increment the
sidebar badge while appearing in neither Triage nor Curated — a count the user
cannot clear. That is the exact class of bug the `role = 'ordinary'` filter on
the same function was added to close (`:1115-1119`).

### N4 — invariant 2 is still breachable from the child's own scope edit.

D5 closed the parent side (`cascadeScopeNarrowing`,
`knowledge-repository.ts:159-195`, called at `:719-721`). The child side is open:
`update()` accepts `scopeKind` through `KERNEL_EDITABLE_FIELDS`
(`:573-581`) and never checks the item's own new scope against its parent's. A
`PATCH {scopeKind: "factory"}` on a `team`-scoped child of a `team`-scoped parent
produces a factory-visible node under an invisible one. `reparent()` checks this;
`update()` does not.

### N5 — the cross-scope repetition signal was approximated, not deleted.

plan.md: *"The cross-scope repetition signal is deleted rather than approximated;
without `topic` there is no honest version of it."* Architecture §4 repeats it
verbatim. `layers/core-api/knowledge/src/attention-scoring.ts:48`, `:66-68`,
`:89-97` keep it, re-keyed on `(parentKind, parentId)`. Contained (nothing
renders an attention score) but it is the opposite of the approved decision.

### N6 — two identical status enums where the architecture said one.

Architecture §2: *"Both enums collapse into one."* `KNOWLEDGE_STATUSES`
(`framework/domain-model/src/knowledge.ts:11`) and `KERNEL_KNOWLEDGE_STATUSES`
(`framework/domain-model/src/types.ts:60`) are now two exported constants with
byte-identical members and two type aliases over them.

### N7 — dead topic vocabulary kept alive by a test.

`deriveTopicHealth` and `MOCK_KNOWLEDGE_ITEMS`
(`layers/core-ui/src/fixtures/knowledge-data.ts:282`, `:72`) have no production
reader other than `KnowledgeDetail`'s fixture fallback.
`layers/core-ui/src/__tests__/knowledge-data.test.ts:10-17, 53, 61` asserts on
`scope === "practice"` — a value AC6 deletes. Test-only-reachable code is dead
code by the project's own standing rule.

### N8 — a live eval prompt still asks the agent about L2/L3/L4.

`tools/eval/src/scenarios/assembled-knowledge.ts:41-43` and `:58` instruct the
agent to *"Note which knowledge layer each came from (L2, L3, or L4)"* against a
context assembled from a store where layers no longer exist. The seeding in the
same file was migrated to `team`/`factory`; the prompt was not. Comments at
`:63`, `:72`, `:80` are stale for the same reason.

### N9 — stale comments describing deleted behaviour.

- `framework/domain-model/src/types.ts:144` — "maps scope_kind → layer via `scopeToLayer()`".
- `knowledge-repository.ts:1111`, `:1117` — "draft + needs_human" (the code reads `proposed`).
- `layers/core-ui/src/shell/Sidebar.tsx:113` — "draft + needs_human".
- `tools/setup/src/demo-world/knowledge.ts:116`, `:207` — "Product scope (L2)", "Practice scope (L3)".
- `tool-definitions.ts:1098` — `split_knowledge` "starts in draft".

---

## FOLLOW-UP / NOTES

- **AC5's on-task half.** There is no surface anywhere that lists a task's
  knowledge children (`rg -ni knowledge layers/core-ui/src/pages/WorkTaskPage.tsx`
  finds only a header comment). plan.md defers *what that object is* to the
  artifact/knowledge strand, so I read the display surface as out of scope here —
  but the AC as written is not fully met, and that is the founder's call, not
  mine.
- **`factory` scope with a non-null `scope_id`.** `0078` step 7 sets
  `scope_kind='factory'` on task-scoped rows while leaving `scope_id` = the task
  id (`0078_…sql:163-167`). It happens to keep those rows out of every agent's
  bundle, because `fetchOrdinaryItemsByScope(db,"factory",null)` requires
  `scope_id IS NULL` (`session-knowledge-assembler.ts:250`). That is a lucky
  interaction, not a stated invariant; a later reader will not know it is load
  bearing.
- **`0078` status conversion uses `ELSE status`** (`:180`), so an unrecognised
  status survives unchanged. All nine known values are mapped, and `status` has
  no CHECK constraint to catch a straggler either way.

---

## What is genuinely good

Reported in full, because it is a large share of the change and it holds up.

- **Migration `0078` is correct on every risk that was called out.** I read the
  SQL line by line and ran the brownfield test, which builds its pre-state from
  the **real** migrations 0..77 and then applies the real `0078`
  (`migration-0078-nested-knowledge-brownfield.integration.test.ts:47-58`). Every
  reparenting step is scoped to `role = 'ordinary'` and `parent_kind IS NULL`
  (`0078_…sql:48, 61, 72, 84, 90, 113, 119, 129, 138, 144, 167`), so `0077`'s
  agent identities (`role='agent_file'`) and routine prompts (`role='prompt'`,
  set at `0077…sql:66`) keep the parent they were given — asserted at
  `…test.ts:280-285`. `product` rows keep `scope_id` (`:109-113`, asserted
  `:223-227`). Practice rows keep their topic as an item beneath their practice
  (`:69-84`, asserted `:238-243`). The task backfill is guarded with a
  `RAISE EXCEPTION` (`:151-161`), and a practice row with no `scope_id` is
  refused rather than dumped in General (`:95-103`) — a good call the
  architecture did not ask for.
- **The three invariants really do run inside the write transaction.**
  `assertParentInvariants` takes the `tx` executor and is called from inside
  `db.transaction` in both `create` (`knowledge-repository.ts:398-406`) and
  `reparent` (`:495-519`); `reparent` additionally runs at
  `{ isolationLevel: "serializable" }` (`:554`). The concurrency argument in
  architecture §3 is honoured, not just cited.
- **The table-ownership crossing is closed.** `writeback-processor.ts` no longer
  touches `knowledgeItems`/`knowledgeEditLog` anywhere — the only occurrences left
  are in `@lore` comments explaining the removal. The move now rides
  `reparentKnowledgeItem` on the api-contract seam
  (`framework/api-contract/src/core-api-port.ts`, `ReparentKnowledgeItemRequest`).
  I scanned every changed non-knowledge production file for the five
  knowledge-owned tables; nothing crosses.
- **The layer-keyed gate is gone with nothing behind it.**
  `NON_FACILITATOR_MAX_LAYER`, `FACILITATOR_ROLES` and the role lookup are
  deleted outright (`tool-definitions.ts`, removed at the old `:231-266`), with a
  comment recording it as a decision. `query_practice` is deleted, its port
  method `search` with it.
- **D1 is exactly what the founder said.** `assembleSessionKnowledge`
  (`session-knowledge-assembler.ts:364-391`) fetches factory + team + own by
  scope, with a team-less agent getting no team items rather than every team's.
- **The promotion-sweep degeneration is genuinely fixed**, not papered over — the
  `(layer, topic, kind)` signature becomes the sibling set
  (`promotion-pipeline.ts:94-135`), which is what stops a scheduled sweep
  mass-promoting the store.
- **The status collapse is complete at the data layer** — both enums, the
  transition table (`tool-definitions.ts:906-911`), the route default, the
  writeback default, the UI mapping, and a real data conversion in `0078`.
- **The frozen red-phase tests were not bent.** I diffed all eight files
  `9766c84b9..HEAD`. Seven contain only `@ts-expect-error` removals and removal
  of the dead `layer: null` argument. The eighth
  (`nested-knowledge-writeback.integration.test.ts`) has a stub-shape update
  (`scopeKind`/`parentKind`/`parentId`/`reparentKnowledgeItem`, projection insert)
  and one **added** test. No assertion was weakened, none deleted. The founder's
  own check was right.
- **`CreateKnowledgeItemInput.layer` really is gone** (commit `9a94cd41c`), and I
  found no second field of that kind on the create/update inputs.
- **Both suites are green and I ran them**, not read a report: 5362 unit/component
  tests and 2247 service-integration tests.

---

## Escalations for the orchestrator

1. **B1/B15 are scope questions, not bugs.** The plan's ACs ask for a tree in the
   interface and a human nest/move affordance. The implementation delivered the
   data model and the detail-page children list and stopped. Either the ACs are
   met by building those surfaces, or the founder amends the ACs explicitly.
   Neither is mine to decide, and a silent cut is not available.
2. **B4/B5/B6 are one shape of defect** — the bake contract and the sandbox
   manifest are each missing exactly one field the other end already expects
   (`parentChain`, `scopeKind`), plus a missing manifest entry per directory.
   They should be fixed together, and B7 should be fixed with them, or the next
   green will be as hollow as this one.
3. **B16 needs the founder personally.** No agent can substitute for the live-render
   review the architecture booked.
