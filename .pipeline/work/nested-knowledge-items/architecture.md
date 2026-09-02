# Nested knowledge items — architecture

Technical restatement of `plan.md`. Tier: **mvp**. Nothing here creates scope; every
obligation traces to a plan line or a founder-approved amendment.

Read first: `plan.md` (what and how), `feasibility.md` (two reconciliation findings
that corrected the migration).

## 1. Obligations

| Plan success line | Implementation obligation |
|---|---|
| Tree in the interface; a parent opens as a knowledge item with children listed | `parentId`/`parentKind`/`position` on `knowledge_items`; children query; `GET /api/knowledge` returns tree-shaped data; `KnowledgeList` renders a tree; `KnowledgeDetail` lists children |
| Nest and move knowledge items; the tree keeps up | `PATCH /api/knowledge/:id` accepts a parent change; the three invariants (§3) enforced in the write transaction; move recorded in `knowledge_edit_log` |
| Agent-created folders produce the same tree, and vice versa | Materialiser writes directories + `index.md`; writeback derives parent from directory; move pairing in the writeback batch |
| A team branch is invisible outside the team | Scope filter applied to the whole subtree read, not per row |
| Task knowledge appears on the task, never the tree | Tree queries exclude non-`knowledge_item` `parentKind`; task surface lists its own |
| `topic`/`kind`/`layer`/`product`/`practice` gone from schema, interface, agent tools | §6 deletion census + migration `0070` |

## 2. Schema

Migration `framework/db/drizzle/0070_*.sql` (next free number; `0069` is the last).
Migrations here are **full and destructive** — no compat column, no dual read.

`knowledge_items` gains:
- `parent_id text` — nullable; NULL means root.
- `parent_kind text` — nullable; `'knowledge_item' | 'task' | 'thread'`; NOT NULL exactly when `parent_id` is set (CHECK).
- `position integer NOT NULL DEFAULT 0`.
- Index on `(parent_kind, parent_id, position)`.

**No foreign key on `parent_id`.** It is polymorphic; existence is validated at the
API boundary. Precedent and rationale: `org_edges` (`schema.ts`, polymorphic
`target`). This is a founder-accepted trade recorded in `plan.md`.

`knowledge_items` loses `topic`. `knowledge_app_projection` loses `layer` and `kind`.
`SCOPE_KINDS` (`framework/domain-model/src/types.ts`) reduces to
`factory | team | user`; `SCOPES_REQUIRING_ID` reduces to `team`.

## 3. Tree invariants

All three are checked **inside the same transaction as the write** that sets a
parent. Concurrency is the reason, not tidiness: two reparents can each observe an
acyclic tree and jointly create a cycle, and a recursive read that meets a cycle
does not error, it spins. (The task-hierarchy strand hit the same race and reports
the same conclusion.)

1. **No cycle.** Reject self-parent and reparenting under any descendant. Governs
   `item → item` chains only.
2. **Scope no wider than the parent's.** Order is `factory > team > user`. Only
   evaluated when `parentKind = 'knowledge_item'`.
3. **Depth ≤ 32.** Backstop, also the recursion limit in the CTEs.

**Walks stop at the first non-item parent.** A task- or thread-parented knowledge item
has no ancestors and inherits nothing, including scope. This is what makes
`knowledge item → thread → knowledge item` inert: a thread can be hosted on a knowledge item
(`threads.host_kind`/`host_id`) and also parent one, closing a loop in the wider
graph that no walk ever crosses. Do not add a write-time check for it — the loop is
legal and the case is real.

Violations are refused with a 4xx naming the rule. They are never recorded and
repaired.

## 4. Read contracts

- **Tree read** — a recursive CTE from the roots a viewer can see, filtered by scope
  during the walk so an invisible parent removes its whole subtree. Excludes rows
  whose `parent_kind` is not `knowledge_item`.
- **Children of a knowledge item** — `parent_id = ? AND parent_kind = 'knowledge_item'`, ordered
  by `position`, then `title`.
- **Backlinks card** (`GET /api/knowledge/:id`, `layers/core-api/src/routes/knowledge.ts:396`)
  — replace the `relatedByTopic` query with children ∪ siblings. The card's label is
  design's call, not this knowledge item's.
- **Sweep cohort** (`layers/core-api/knowledge/src/attention-scoring.ts:57`) — the
  `(layer, scope_id, topic, kind)` cohort key becomes the sibling set. The
  `(layer, topic, kind)` cross-scope repetition key is **deleted**, not approximated.
- **Delete outright, no callers:** `list({exportable})` and
  `list({recentByLayers})` / `listRecentByLayers` (declared in
  `layers/core-api/routine/src/ports.ts:137`, bound in
  `layers/core-api/src/services/routine-scheduler-bindings.ts:112`, invoked nowhere).

## 5. Sandbox: materialisation and writeback

**One writable watched tree.** `ZONE_BY_LAYER`
(`layers/agent-orchestration/run-orchestration/src/context.ts:808`) and the read-only
`context/` knowledge zones are deleted, along with `setContextReadOnly`'s coverage of
them. Knowledge materialises only into `knowledge/`, which the watcher already
watches. Role-carrying items (`skill`, `rule`, `agent_file`) keep their existing
harness destinations — `writeSkillItem` and the `knowledge/rules` writes are
unchanged, because placement there follows `role`, not tree position.

**Shape.** A knowledge item with children is a directory holding `index.md` with its own
body; a leaf is `<title>.md`. Filenames are human titles only — `toFilename`
(`context.ts:691`) drops its id suffix. Identity lives in the manifest, which already
maps item id → `source_path`. Do not put the id in front matter: front matter derives
as ordinary markdown blocks today (`docs/blocks/definition.md`) and would render as
visible text.

Ancestors of a selected item are materialised even when assembly did not select them
— index only, no children — so every path is complete.

**Writeback** (`writeback-processor.ts`):
- Create inside a directory → parent is that directory's knowledge item, `parentKind = 'knowledge_item'`.
- The subdirectory→`kind` inference (`handleCreate`, :224-232) is deleted with `kind`.
- **Move pairing.** The watcher batches on a 500ms debounce
  (`file-watcher.ts`), so both halves of a move arrive in one batch. When a batch
  contains exactly one deletion whose path the manifest knows and exactly one creation
  at an unknown path, treat it as a move: update `parent_id`/`parent_kind`, leave the
  body untouched, rewrite the manifest path. Any other combination falls back to
  today's behaviour — a deletion opens a `knowledge_conflicts` row for review
  (`handleDelete`, :308) and nothing is lost.
- A move is written to `knowledge_edit_log` as `field = 'parent'` with old and new
  values. That is the whole review story for moves; do not add a second path.

## 6. Deletion census

Derived from the repository, not from the plan's list.

`topic` — `framework/db/src/schema.ts`, `framework/api-contract/src/core-api-port.ts`,
`layers/core-api/knowledge/src/{attention-scoring,attention-classifier,attention-service,knowledge-repository,promotion-pipeline,session-knowledge-assembler}.ts`,
`layers/core-api/src/routes/knowledge.ts`,
`layers/agent-orchestration/tool-handlers/src/{ports,tool-definitions}.ts`,
`layers/core-ui/src/{components/KnowledgeTopicGroup.tsx,pages/KnowledgeList.tsx,pages/KnowledgeDetail.tsx,hooks/useKnowledgeItem.ts,fixtures/knowledge-data.ts}`,
`tools/setup/src/{demo-fixture.ts,demo-world/knowledge.ts}`,
`tools/eval/src/scenarios/{assembled-knowledge,create-task}.ts`.
Grep for `topic` also matches the unrelated WebSocket subscribe topic in
`ws-*`/`session-stream-*`/`*-gateway` files — **do not touch those.**

`kind` (knowledge sense) — declared **twice**: `framework/domain-model/src/knowledge.ts`
and `layers/core-api/knowledge/src/types.ts`. Both die. Consumers:
`KnowledgeRow.tsx`, `useGlobalSearch.ts`, `fixtures/knowledge-data.ts`,
`attention-service.ts:373`, `knowledge-repository.ts:766`, `writeback-processor.ts:14`.

`layer` — `KNOWLEDGE_LAYERS`, `KnowledgeLayer`, `SCOPE_TO_LAYER`, `scopeToLayer`
(`framework/domain-model/src/knowledge.ts`), `ZONE_BY_LAYER`, the L3 default in
`search_knowledge` (`tool-definitions.ts:191`), the L3-vs-L4 `detectLayerContradiction`
in `promotion-pipeline.ts`, `KNOWLEDGE_LAYER_SET` in `useGlobalSearch.ts`,
`KnowledgeRow.tsx`, `tools/eval/src/judges.ts`.

`product`/`practice` scope values — `SCOPE_KINDS`, `SCOPES_REQUIRING_ID`,
`scopeKindToLabel` (`types.ts`), `SCOPE_PILL_OPTIONS` + `SCOPE_CREATE_OPTIONS`
(`layers/core-ui/src/utils/scope-labels.ts`), the practice branch of scope-name
resolution (`routes/knowledge.ts:136-142`), `computeRoleMatch` +
`communityForRole` use in `session-knowledge-assembler.ts`,
`role-community-map.ts`, and the seeded rows in `tools/setup/src/demo-world/knowledge.ts`.

## 7. Migration semantics (`0070`)

Order inside one transaction:

1. Add the three columns.
2. Seed roots: **Product**, **Practices**, **General** (scope `factory`, no parent).
3. Seed one child of **Practices** per distinct `practice` scope id, titled with that
   role's label (`roleLabel`). Reparent every `practice`-scoped row under its own
   practice item and set its scope to `factory`.
4. Reparent every `product`-scoped row: scope becomes `team`, **`scope_id` unchanged**
   (it is already a team id — `feasibility.md` finding 1). Parent becomes a topic
   knowledge item under **Product**.
5. For every remaining distinct `topic`, create a topic item under the appropriate
   root and reparent its rows. Rows with `topic IS NULL` go under **General**.
6. `task`- and `bet`-scoped rows: `parent_kind = 'task'`, `parent_id = scope_id`. Safe
   because the task-hierarchy strand made every bet a root task **keeping its own id**,
   so the id already resolves.
7. Drop `topic`, `layer`, `kind`; rewrite the scope-kind check constraint.

`position` is assigned by `created_at` within each new parent.

## 8. Security

Surfaces this change actually reaches:

- **State-changing endpoints** — `POST /api/knowledge`, `PATCH /api/knowledge/:id`
  now accept a parent. Abuse: a caller sets a parent it cannot see, or an id that does
  not exist, and with no FK the database will not stop it. Closed by validating parent
  existence and viewer visibility in the same transaction as the invariant checks.
- **Agent-authored input** — the writeback path turns agent-created paths into parent
  links. Path traversal is already refused by the watcher (`handleChange` rejects
  anything resolving outside the sandbox root, and skips symlinks); keep both when
  adding directory handling.
- **Scope is not a security boundary.** `plan.md` says this and it must not drift: the
  subtree filter exists to keep the tree readable. Do not describe it as access control
  in code comments, API docs or UI copy, and do not let a later change lean on it.

Not touched: credentials, outbound requests, the harness boundary, plugin install.

## 9. Dependency order

One technical task; the sequence inside it is not parallelisable because everything
downstream reads the new columns.

1. Schema + migration `0070`.
2. Repository + invariants (the transactional checks).
3. Routes + port contract.
4. Materialiser + writeback.
5. Interface (tree list, children on detail, Backlinks).
6. Deletion sweep (§6) and the demo world.

**Across branches.** The task-hierarchy strand lands first and removes `bet` from
`SCOPE_KINDS`; this work then removes `product`, `practice` and `task`. Rebase onto
their merge rather than editing that list concurrently. The artifact/knowledge strand
owns the `BlockRef` retirement and sequences behind both.

## 10. Verification

Existing lanes are adequate; no new harness.

- **Unit** — invariant rejections (cycle, scope widening, depth 33), `position`
  assignment, move-pairing including the ambiguous batch that must fall back to a
  conflict.
- **Service integration** (`*.integration.test.ts`, real DB) — migration `0070` against
  seeded demo data: every row lands under a parent, no orphans, `product` rows keep
  their `scope_id`, practice rows land under their practice item. Subtree
  visibility: a team-scoped branch is absent for a non-member, including its children.
- **End-to-end evidence, the one that proves the wire** — a harness-lane run where an
  agent creates a nested folder with a knowledge item in its sandbox, and after writeback the
  knowledge item exists with the correct parent; then move it in a second batch and assert the
  parent changed and the body did not. This is the only test that exercises watcher →
  writeback → repository together, and it is the wire most likely to be silently broken.
- **Interface** — a component test that a parent renders its children; the tree read is
  covered by the integration lane above.

`npm run verify` must pass; `npm run test:integration:service` covers the migration.

## 11. Documentation made false

`docs/knowledge-architecture/the-five-layers.md` (the L0–L4 model is gone),
`the-canonical-store.md` and `relevance-and-attention.md` (cohort and topic),
`facilitators.md` (practice communities), and any `docs/information-architecture`
page describing the knowledge list as topic-grouped. `/pipeline:write-docs` owns the
rewrite; it is not optional here, because these pages describe a model that will no
longer exist.
