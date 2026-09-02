# Nested knowledge items — architecture

Technical restatement of `plan.md`. Tier: **mvp**. Rebased onto `origin/main` at
`bed7972d8` (PR #545, the attachment slot) on 2026-09-02.

Read first: `plan.md`, `feasibility.md`, and `critique.md` — an independent critique
returned **FAIL on 7 blockers**, and the five that need a founder decision are listed
in §0. Everything below §0 assumes those five are still open.

## 0. Open decisions — this is not buildable until they are answered

| # | Question | Why it blocks |
|---|---|---|
| D1 | What selects the knowledge an agent receives, once `layer` is gone? | `layer` is the *entire* selection (`fetchAllForLayer` L4/L2/L3 at `session-knowledge-assembler.ts:421-423`), a ranking weight (`computeLayerProximity` `:149`), and the sandbox routing key. Delete it with no replacement and agents receive **nothing**, with only a warn log. |
| D2 | Is team visibility built, or is that AC dropped? | No team-based visibility on knowledge exists today; the only viewer filter is "not user-scoped, or you wrote it" (`knowledge-repository.ts:738-750`). The plan's "a team branch is invisible outside the team" is a new capability. |
| D3 | Does the filename keep its id suffix? | Without it, two siblings sharing a title collide into one file and writeback resolves path→item by first match — silent cross-item body overwrite. With it, moves are detectable by id and need no batch pairing. |
| D4 | Does an agent's new directory create an item, and does a created item inherit its parent's scope? | The watcher never reports directories (`file-watcher.ts:114`), and `handleCreate` sets no scope. The plan's own example — an agent writing `knowledge/pricing/objections.md` — creates a root item and loses the folder, and a file in a team folder is created `factory` and then rejected by invariant 2. |
| D5 | What happens to descendants when a parent's scope narrows later? | Scope is an ordinary editable field (`routes/knowledge.ts:532,551`). Narrowing a parent leaves every descendant wider than it, with no write rejected, and they vanish from the tree for anyone who loses the parent. |

§4, §5 and §7 are written to the recommended answers and are marked where a different
answer changes them.

## 1. What the merged slot already gives us

PR #545 shipped the parent slot; **do not rebuild any of it**. On `main` today
(`framework/db/src/schema.ts:867-897`):

- `parent_kind` + `parent_id`, both nullable, no FK by design (points at five tables).
- `ki_parent_kind_ck` — `knowledge_item | task | thread | routine | agent`. `bet` is
  absent and rejected; BB1 removed it as a primitive.
- `ki_parent_pair_ck` — both or neither.
- `ki_parent_slot_uq` — UNIQUE `(parent_kind, parent_id, role) WHERE role <> 'ordinary'`.
  Tree children are `ordinary`, so a parent holds many. This is why nesting works.
- `ki_parent_idx` — composite `(parent_kind, parent_id)`, non-partial so a
  `parent_kind IS NULL` roots query can use it.
- `KNOWLEDGE_ROLES` gained `prompt`. `SCOPE_KINDS` is now
  `factory | product | practice | team | task | user`.

Already migrated onto it: routine prompts (`parent_kind='routine'`, `role='prompt'`)
and agent identities (`parent_kind='agent'`, `role='agent_file'`).

## 2. What this work adds

Migration `framework/db/drizzle/0078_*.sql` — `0077` is taken. Migrations here are
**full and destructive**: no compat column, no dual read, no alias.

- **Add** `position integer NOT NULL DEFAULT 0` to `knowledge_items`, and an index on
  `(parent_kind, parent_id, position)` for the ordered children read.
- **Drop** `knowledge_items.topic`, and `layer` + `kind` from `knowledge_app_projection`.
- **Reduce** `SCOPE_KINDS` to `factory | team | user`; `SCOPES_REQUIRING_ID` to `team`.
  `scope_kind` has **no CHECK constraint** today (only `ki_role_ck` and the two parent
  checks exist) — so the closed enum is TypeScript-only, the migration must *convert*
  rows, and nothing at the database layer will catch a stray `product` afterwards.

## 3. Tree invariants

Checked **inside the same transaction as the write** that sets a parent. Two reparents
can each observe an acyclic tree and jointly create a cycle; a recursive read that meets
a cycle does not error, it spins.

1. **No cycle** — reject self-parent and reparenting under any descendant. Governs
   `knowledge_item → knowledge_item` chains only.
2. **Scope no wider than the parent's** — order `factory > team > user`. Only evaluated
   when `parent_kind = 'knowledge_item'`. **See D5**: this is stated as a property but,
   as written, guarded only on parent writes.
3. **Depth ≤ 32** — backstop and the CTE recursion limit.

**Walks stop at the first non-`knowledge_item` parent.** There are now four such kinds —
`task`, `thread`, `routine`, `agent`. An item under any of them has no ancestors and
inherits nothing, including scope. The merged migration writes that same invariant into
its own step 6 comment ("scope is stored on the item, never derived from the parent"),
so both strands agree. This is what keeps `item → thread → item` inert: a thread can be
hosted on an item and also parent one, closing a loop no walk ever crosses. Do not add a
write-time check for it.

Violations are refused with a 4xx naming the rule, never recorded and repaired.

## 4. Read contracts

- **Tree read** — recursive CTE from roots (`parent_kind IS NULL`), excluding rows whose
  `parent_kind` is not `knowledge_item`. Depth-bounded at 32.
- **Children** — `parent_id = ? AND parent_kind = 'knowledge_item'`, ordered by
  `position`, then `title`.
- **The parent rule replaces a role filter.** `KnowledgeList.tsx:858` currently filters
  `role !== "skill" && role !== "rule"`, which is why five agent identities and a routine
  prompt render in a "General" group at the bottom of the list today. Excluding
  non-`knowledge_item` parents removes them structurally; delete the role filter rather
  than extending it.
- **Backlinks card** (`routes/knowledge.ts:404`) — replace the `relatedByTopic` query
  with children ∪ siblings.
- **Attention cohort** (`attention-scoring.ts:57`) — `(layer, scope_id, topic, kind)`
  becomes the sibling set. The `(layer, topic, kind)` cross-scope repetition key is
  **deleted**, not approximated.
- **Promotion signature** (`promotion-pipeline.ts:101,128`) — a second, separate
  `(layer, topic, kind)` signature drives the auto-promotion sweep. Remove all three
  fields and it degenerates to empty, matching **every** row: the repetition threshold is
  trivially met and a scheduled sweep mass-promotes the whole store to `validated`. It
  becomes the sibling set too. This is not optional cleanup; leaving it is a live defect.
- **`list({recentByLayers})`** (`knowledge-repository.ts:781-802`, declared
  `routine/src/ports.ts:137`, bound `routine-scheduler-bindings.ts:112`) — no production
  invocation. Delete. **`list({exportable})` does not exist** — it survives only as a
  stale doc comment at `knowledge-repository.ts:674`; delete the comment.

**Visibility (D2).** Team membership lives in `users.team_id`, and `tools/governance/table-owners.json`
gives `users` to the users service and `knowledge_items` to knowledge — one service per
table, reads included. A join inside the knowledge repository fails `npm run lint`. The
viewer's team must arrive as a parameter from the route. The same constraint applies to
§8's parent-existence check: `tasks` is owned by `work`, `threads` by `conversation`, so
"validate existence in the same transaction" cannot span services. Validate existence via
the owning service before opening the write transaction, and accept that a parent deleted
in the microseconds between is a dangling reference — which the no-FK design already
permits and the API-boundary validation was always only best-effort against.

Also unresolved by scope alone: `user`-scoped rows are private **by author**
(`visibleToViewer`), while `agent_file` and `skill` rows are user-scoped and deliberately
not private (`routes/knowledge.ts:386-390`). A subtree filter written on scope kind alone
either hides capability items or leaks private titles.

## 5. Sandbox: materialisation and writeback

**One writable watched tree.** `ZONE_BY_LAYER` (`context.ts:809-813`) and the read-only
`context/` knowledge zones go, with `setContextReadOnly`'s coverage of them
(`:789-806`, called `:967`). Knowledge materialises only into `knowledge/`. Role-carrying
items keep their harness destinations — placement follows `role`, not tree position.

**Shape.** An item with children is a directory holding `index.md`; a leaf is a file.
**D3 decides the filename.** Recommended: keep `toFilename`'s `_${id.slice(0,8)}` suffix
(`context.ts:691-700`). It is the only thing making paths unique, and path→item is the
direction writeback resolves in (`findItemByPath`, `writeback-processor.ts:120-130`,
first match wins). Keeping it also makes a move self-identifying, which §5's move rule
depends on. Do not put the id in front matter: front matter derives as ordinary markdown
blocks (`docs/blocks/definition.md:9`) and would render as visible text.

**Ancestors** of a selected item are materialised even when assembly did not select them,
index only. This obligation belongs at **bake** time, not in `writeContextBundle`, which
is explicitly "ZERO db reads — every byte comes from `bundle`" (`context.ts:934-940`).
`BakedContextKnowledgeItem` (`framework/domain-model/src/work-intent.ts:170-192`) must
carry the parent chain. That is a cross-package contract change and belongs in §9 step 3,
not step 4.

**Writeback** (`writeback-processor.ts`):
- Create inside a directory → parent is that directory's item, `parent_kind='knowledge_item'`.
  **D4** decides whether a new directory creates its own item and what scope a created
  item takes.
- The subdirectory→`kind` inference (`handleCreate:224-232`) is deleted with `kind`, and
  with it `CONTEXT_ASSEMBLY_DIRS`' legacy `knowledge/practices|decisions|failures`
  (`context.ts:714-724`), which exist only to feed it.
- **Move detection.** With D3 answered "keep the suffix", a creation whose filename
  carries a known id **is** a move: reparent, leave the body alone, rewrite the manifest
  path. No batch pairing, and it survives the cases pairing cannot — a directory rename
  emitting N deletions and N creations, or an agent editing a file while moving it.
  If D3 is answered the other way, pairing is the only option and it does not survive
  either case: the debounce is **trailing** (`file-watcher.ts:87-97`), so a batch is
  "everything until the agent goes quiet", and the fallback is not lossless —
  `handleDelete` records a conflict *and drops the manifest entry* (`:308-331`), then
  `handleCreate` makes a second row, orphaning the original with its status, scope and
  history.
- A move is written to `knowledge_edit_log` as `field='parent'`. That is the entire
  review story for moves.

## 6. Deletion census

Derived from the repository on the rebased branch, not from the plan's list. The first
census missed the sites marked **†**; they are the ones that fail silently.

`topic` — `schema.ts`, `framework/api-contract/src/core-api-port.ts`,
`layers/core-api/knowledge/src/{attention-scoring,attention-classifier,attention-service,knowledge-repository,promotion-pipeline,session-knowledge-assembler}.ts`,
`routes/knowledge.ts`, `tool-handlers/src/{ports,tool-definitions}.ts`,
`layers/core-ui/src/{components/KnowledgeTopicGroup.tsx,pages/KnowledgeList.tsx,pages/KnowledgeDetail.tsx,hooks/useKnowledgeItem.ts,fixtures/knowledge-data.ts}`,
`tools/setup/src/{demo-fixture.ts,demo-world/knowledge.ts}`,
`tools/eval/src/scenarios/{assembled-knowledge,create-task}.ts`.
**Grep for `topic` also matches the unrelated WebSocket subscribe topic** in
`ws-*`, `session-stream-*` and `*-gateway` files — do not touch those.

`kind` (knowledge sense) — declared **twice**, `framework/domain-model/src/knowledge.ts`
and `layers/core-api/knowledge/src/types.ts`, with different members. Both die.
Consumers: `KnowledgeRow.tsx`, `useGlobalSearch.ts`, `fixtures/knowledge-data.ts`,
`attention-service.ts:373`, `knowledge-repository.ts:766`, `writeback-processor.ts:14`.

`layer` — `KNOWLEDGE_LAYERS`, `KnowledgeLayer`, `SCOPE_TO_LAYER`, `scopeToLayer`
(`domain-model/src/knowledge.ts`), `ZONE_BY_LAYER`, `computeLayerProximity`,
`fetchAllForLayer`, `KNOWLEDGE_LAYER_SET` (`useGlobalSearch.ts`), `KnowledgeRow.tsx`,
`tools/eval/src/judges.ts`, and:
- † `write_memory`'s **required** `layer` argument and its layer-keyed authorisation gate
  `NON_FACILITATOR_MAX_LAYER` + `FACILITATOR_ROLES` (`tool-definitions.ts:231-266`) — a
  permission check that vanishes with `layer`. §8 must say what replaces it.
- † the `query_practice` tool, whose only filter is `layer === "L3"` (`:170-201`).
- † `routes/search.ts:296` — `layer: row.layer ?? "L0"`, `kind: row.kind ?? "pattern"`.
- † `routines-routes.ts:156` — `layer: "L4"` on a live create path.
- † `core-api-port.ts:531,534,639,645` and `work-intent.ts:176` — cross-package contracts.
- † the L3-vs-L4 `detectLayerContradiction` in `promotion-pipeline.ts`.

`product`/`practice`/`task` scope values — `SCOPE_KINDS`, `SCOPES_REQUIRING_ID`,
`scopeKindToLabel` (`domain-model/src/types.ts`), `SCOPE_PILL_OPTIONS` +
`SCOPE_CREATE_OPTIONS` (`core-ui/src/utils/scope-labels.ts`), the practice branch of
scope-name resolution (`routes/knowledge.ts:136-142`), `computeRoleMatch` +
`communityForRole` (`session-knowledge-assembler.ts`), `role-community-map.ts`,
† `KNOWLEDGE_SCOPES`/`KnowledgeScope` = `["practice","product","factory"]`
(`domain-model/src/knowledge.ts`), † `write_memory`'s
`defaultScopeKind = teamId ? "product" : "factory"` (`tool-definitions.ts:276`), and the
seeded rows in `tools/setup/src/demo-world/knowledge.ts`.

Also: `upsertPluginDocument` / `UpsertPluginDocumentInput` carry the retired "Document"
noun in merged code. Respell in this sweep — we are already touching the vocabulary.

## 7. Migration semantics (`0078`)

One transaction. Ordering matters and the first draft had it wrong.

1. Add `position`.
2. Seed roots — **Product**, **Practices**, **General** — `scope='factory'`, no parent.
3. Create every topic item **first**, under its grouping root, so later steps have
   something to point at. Where the same topic string exists under two groupings (the
   demo world has `pricing` under both product- and practice-scoped rows), each grouping
   gets its own topic item; they are different topics that share a word.
   Seeded roots and topic items are `factory`-scoped — a `team`-scoped topic item would
   break invariant 2 the moment two teams share a topic.
4. `practice` rows → one item per distinct practice under **Practices**, titled by
   `roleLabel`; reparent; scope becomes `factory`. Their topic is **preserved**, not
   discarded: a practice row with a topic gets a topic item under its practice.
5. `product` rows → scope becomes `team`, **`scope_id` unchanged** (already a team id,
   `feasibility.md` finding 1); parent is the topic item under **Product**.
6. Remaining rows → their topic item; `topic IS NULL` → **General**.
7. `task`-scoped rows → `parent_kind='task'`, `parent_id=scope_id`. Bets already became
   root tasks keeping their ids (BB1, `0076`, merged), so the id resolves. Guard it
   anyway with a `RAISE EXCEPTION` on any `scope_id` with no matching task — the merged
   `0077` sets that precedent in its own step 4, and with no FK a dangling parent is
   otherwise silent.
8. **Rows that must not be swept into the tree**: `role != 'ordinary'` items already have
   a parent from `0077` (`routine`/`agent`) and must keep it — step 6 must exclude them,
   or five agent identities and every routine prompt become browsable children of
   **General**. Skills and rules are parentless and stay parentless.
9. Drop `topic`, `layer`, `kind`; convert any residual scope value.

`position` is assigned by `created_at` within each new parent.

**Data the migration does not reach.** `agent_work_intents.baked_request_json`
(`schema.ts:397`) persists baked bundles carrying `layer` and no parent. An intent baked
before `0078` and drained after it routes through `writeBundleKnowledge`'s unknown-zone
branch (`context.ts:914-921`) and is silently skipped. CLAUDE.md rule 2 requires all data
to move in the same change: either drain the queue as a migration step or rewrite the
persisted payloads. Name which, and do it.

## 8. Security

Surfaces this change reaches:

- **State-changing endpoints** — `POST` and `PATCH /api/knowledge` accept a parent. With
  no FK, a caller can set a parent that does not exist or that it cannot see. Closed by
  validating existence through the owning service and visibility for the viewer, before
  the write transaction (§4 explains why not inside it).
- **A permission gate disappears with `layer`.** `write_memory` today refuses to let a
  non-facilitator write above L2. Deleting `layer` deletes that check. Either an
  equivalent restriction rides the tree (which subtrees an agent may write to) or the
  founder accepts that any agent may write anywhere. **This must not be resolved by
  silence** — it is the only authorisation check in the knowledge write path.
- **Agent-authored paths** become parent links. Traversal is already refused
  (`file-watcher.ts` resolves against the sandbox root and skips symlinks); keep both when
  adding directory handling.
- **Scope is not a security boundary.** It exists to keep the tree readable. Do not
  describe it as access control in code, docs or UI, and do not let later work lean on it.

Not touched: credentials, outbound requests, the harness boundary, plugin install.

## 9. Dependency order

One technical task; the sequence is not parallelisable — everything downstream reads the
new column.

1. Migration `0078` + `position`.
2. Repository, invariants, tree and children reads.
3. Bake contract (`BakedContextKnowledgeItem` gains the parent chain) + routes + port.
4. Materialiser + writeback.
5. Interface: tree list, children on detail, Backlinks, delete the role filter.
6. Deletion sweep (§6), demo world, docs.

## 10. Verification

Existing lanes; no new harness.

- **Unit** — invariant rejections (cycle, scope widening, depth 33); `position`
  assignment; move detection including a directory rename producing many changes at once.
- **Service integration** (`*.integration.test.ts`, real DB) — `0078` against seeded demo
  data: no orphans; `product` rows keep `scope_id`; practice rows land under their
  practice item **with their topic preserved**; `role != 'ordinary'` rows keep their
  `0077` parent and do **not** appear under General. Subtree visibility: a team branch is
  absent for a non-member, children included.
- **End-to-end evidence** — a service integration test driving **real files into a real
  sandbox against a real database**: write a nested folder, run writeback, assert the item
  exists with the right parent; then move the file and assert the parent changed and the
  body did not. This is the watcher → writeback → repository wire, and it is the one most
  likely to break silently. It does **not** belong in the harness lane, which has no CI
  job at all and would make an agent's nondeterministic choice part of the assertion.
- **Visual** — replacing a topic-grouped list with a tree is visually novel and
  high-exposure, so `.claude/rules/visual-regression.md` makes founder review of the live
  render the primary gate. Book it before the interface work is called done.

`npm run verify` must pass. Expect the first CI run to be killed mid-test-run without a
summary: the affected slice is large on a branch this wide and it OOMs. Re-run it.

## 11. Documentation made false

`docs/knowledge-architecture/the-five-layers.md` (the L0–L4 model ceases to exist),
`the-canonical-store.md`, `relevance-and-attention.md` (cohort and topic),
`facilitators.md` (practice communities), and any `docs/information-architecture` page
describing the knowledge list as topic-grouped. `/pipeline:write-docs` is not optional
here — these pages describe a model that will be gone.
