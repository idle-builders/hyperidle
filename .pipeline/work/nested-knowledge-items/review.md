# Implementation review — nested knowledge items (retry, round 2)

Cold re-read of the fix cycle. Base moved: the branch was rebased onto
`origin/main` at `0f4e4d852` (PR #547 artifacts-become-knowledge, plus BA2),
and the migration renumbered `0078` → `0080`. HEAD `4ba4275f1`.

Scope of this pass: the delta since the round-1 review (`8d7ea0653`), plus
everything round 1 passed that the delta could plausibly have broken. Unchanged
PASS entries are carried forward and marked as such. Nothing was taken from a
builder report, a commit message or a code comment; every finding cites a file
I read, a command I ran, or a painted screen I looked at.

## Verdict

**NOT DONE.**

The fix cycle is real work and most of it lands. The tree now renders — I saw
it painted, with real seeded data, three levels deep. Team visibility is wired
on both the list and the children read, and proven from both sides. The bake
contract carries a real `parentChain`, the manifest is one shared type,
directories get entries, scope inheritance works. The hollow e2e test is gone
and its replacement drives the real repository and, under its flag, the real
`fs.watch`. The `needs_human` data bug is fixed.

Four things still fail. One is new information: the team-scope filter was
added to the Children card and **not** to the Backlinks card directly beneath
it, so a non-member still reads every team-scoped child's title on the
shipping page. I proved it on the running app. The other three are unchanged
from round 1 and were not attempted: no human can nest or move an item, the
retired vocabulary is still live in a production interface file, and the item
id is still in 29 test files plus five filenames.

---

## What I ran

| Command | Result |
|---|---|
| `npm run check` | **exit 0** — 38/38 packages, 0 errors |
| `npm run lint` | **exit 0** — biome + eslint + 3 governance passes, 0 violations at error |
| `npm run test:full` | **505 files / 5069 tests passed**, exit 0 |
| `npm run test:integration:service` | **320 passed / 1 skipped, 2205 tests**, exit 0 |
| `npm run knip` | exit 0 (configuration hints only) |
| new e2e integration file, default lane | 5 passed / 1 skipped |
| same file, `HYPERIDLE_REAL_FS_WATCH_TESTS=1` | **6 passed** — the gated real-`fs.watch` block runs and is green |
| the six knowledge integration files | 15 tests passed |
| `npm run setup --demo` into a scratch PGlite dir + `npm run dev` + Playwright | tree, detail, and the leak below, all looked at |

The founder's independent `check`/`lint` exit 0 at `4ba4275f1` is confirmed —
I re-ran both myself. The injected check cache was stale (it still named
`0078` and reported `1 error` in `KnowledgeDetail.tsx`); the live run
disagrees and the live run is right. Working tree clean.

---

## Acceptance criteria

| # | Criterion | Round 1 | Now |
|---|---|---|---|
| 1 | A tree renders; a parent opens as a knowledge item with its children listed | FAIL | **PASS** — verified on the painted page |
| 2 | Nesting and moving work and the tree keeps up | FAIL | **FAIL** (unchanged — API only, no human affordance) |
| 3 | Agent nested folders → same tree; human tree → sandbox directories | FAIL | **PASS** |
| 4 | A team-scoped branch is invisible outside that team | FAIL | **FAIL** (list + children closed; Backlinks leaks — B1) |
| 5 | A task's knowledge appears on the task, never in the tree | PARTIAL | **PASS** (off-tree filter + `ArtifactSection` on the task page, from #547) |
| 6 | `topic`/`kind`/`layer`/`product`/`practice` gone from schema, interface, agent tools | FAIL | **FAIL** (schema + agent tools now pass; interface does not — B3) |

| Founder ruling (architecture §0) | Now |
|---|---|
| Status is exactly `proposed \| active \| stale \| archived`, both enums collapsed, mapping applied to real rows | **PASS** — and `needs_human → proposed` is now correct (`0080_nested_knowledge_items.sql:180`) |
| Layer-keyed gate deleted with nothing replacing it | **PASS** (carried forward) |
| Agent receives factory + its team + its own, straight off scope | **PASS** (carried forward) |
| Filenames keep the id suffix | **PASS** (carried forward) |
| A new directory creates its item | **PASS** (carried forward) |
| A created item inherits its parent's scope | **PASS** — now real, and the test can fail (B6 closed) |
| Narrowing a parent cascades | **PASS** (carried forward) |
| The three invariants run inside the write transaction | **PASS** (carried forward) |
| The status shim is gone | **PASS** — `LEGACY_STATUS_TO_CURRENT` deleted, zero matches repo-wide |

---

## BLOCKING

### B1 — AC4: the Backlinks card leaks every team-scoped child title. Proven on the running app.

`GET /knowledge/:id` builds two lists side by side
(`layers/core-api/src/routes/knowledge.ts:426-437`). `children` now passes
`viewerTeamId`; `relatedItems` (`childrenAndSiblings`) does not — and the
repository branch for it applies only the Q2 private-user predicate:

```ts
// layers/core-api/knowledge/src/knowledge-repository.ts:1383-1392
.where(and(or(siblingCondition, childCondition), ne(knowledgeItems.id, itemId),
           visibleToViewer(viewerUserId)))
```

`scopeVisibleCondition` (`:1195`) is absent. `humanVisibleCondition` (`:1210`)
is the combined rule and is used by `{tree}` and `{childrenOf}` only.

Live, against a real seeded database, as `demo-founder` (`teamId = null`):

```
GET /api/knowledge/ki-mig-root-product
  children:     []                       ← correctly filtered
  relatedItems: 8 team-scoped titles     ← "Decision: two-tier pricing structure",
                                           "Annual discount policy — needs founder sign-off", …
```

`demo-ki-two-tier-pricing` is `scopeKind=team`, `scopeId=demo-team-acme`. I
looked at the painted page: the Product detail page renders **no** Children
card and a **Backlinks** card listing all eight of them, as clickable links.
This is round 1's B3 closed on one card and left open on the card directly
below it.

**Governing:** plan.md "Success looks like" bullet 4; architecture §0 D2 and §4
("a team-scoped branch is invisible outside that team, children included").

### B2 — AC2: no human can nest or move a knowledge item. Unchanged, not attempted.

`rg -n "parentId|parentKind" layers/core-ui/src --glob '!**/__tests__/**'`
returns read-side filters only (`KnowledgeList.tsx:113-116, 760-762`) plus the
two `ArtifactSection` mount points that pass a task/thread id. The detail
page's overflow menu is `Change scope` / `Archive` / `Promote to task`
(`KnowledgeDetail.tsx:486, 494, 502`) — no Move. `KnowledgeCreate.tsx` has no
parent field. `POST /:id/graduate` exists on the server (from #547) and has no
caller in `core-ui`.

plan.md AC2 is "**A person** can nest and move knowledge items, and the tree
keeps up." "Not in this item" excludes drag-to-*reorder*, which is a different
thing from being able to nest or move at all. Round 1 escalated this as a
scope question; it came back unanswered and unbuilt.

### B3 — AC6: retired vocabulary is still live in the production interface.

AC6 says these words are **gone, not deprecated**.

- `layers/core-ui/src/fixtures/knowledge-data.ts` is a **production-world**
  file by CLAUDE.md's own rule (under `layers/`, no `__` segment) and is
  imported by the shipping page (`KnowledgeDetail.tsx:68`). It still declares
  `layer: string` (`:25`), `kind: string` (`:26`), `topic: string` (`:30`) and
  populates them on every row (`:77-82`, `:95-100`, …), including
  `scope: "practice"` ×5 and `scope: "product"` ×3 (`:118-212`).
- `framework/domain-model/src/knowledge.ts:22-23` still exports
  `KNOWLEDGE_TOPIC_HEALTHS` / `KnowledgeTopicHealth`, re-exported from the
  package index (`index.ts:102, 112`), alive only for that fixture's
  `deriveTopicHealth`.
- `KnowledgeDetail.tsx:436` still ships the user-visible string "Related and
  **same-topic** items will appear here."

The fix cycle called this "a legacy fixture path, wider blast radius". The
blast radius is the argument for a follow-up, not for the AC being met — and
the governance ledger already records this file as production-path-really-
development whose fix "is the API, not a relocation", which is a different
open problem, not a licence to keep the deleted words.

The other half of round 1's B9 **is** closed and I verified it on the painted
page: no "Kind" row in the Metadata card, no topic breadcrumb, no `byTopic`
related list.

### B4 — the item id is still in code outside `.pipeline/**`.

29 non-`@lore` occurrences remain, all in development-world test files:

```
rg -n "nested-knowledge-items" --glob '!.pipeline/**' -g '!*.md' -g '!**/dist/**' . | rg -v "@lore"
→ 29 hits across 22 files
```

e.g. `knowledge-tree-invariants.integration.test.ts:2, :29`,
`nested-knowledge-status-collapse.test.ts:2, :17`,
`scope-kinds.test.ts:22`, `KnowledgeList.parent-rule.test.tsx:2`,
`tool-registry.integration.test.ts:25, :101, :139, :155`.

Five **filenames** also carry it: `framework/db/drizzle/0080_nested_knowledge_items.sql`,
`migration-0080-nested-knowledge-brownfield.integration.test.ts`,
`nested-knowledge-status-collapse.test.ts`,
`nested-knowledge-parent-chain.integration.test.ts`,
`nested-knowledge-materialisation.test.ts`.

The five production-file leaks round 1 named **are** closed (`status-mapping.ts`,
`useKnowledgeItem.ts`, `KnowledgeDetail.tsx`, `ScopeChangeDialog.tsx`,
`design-profile-census.ts` — each now an `@lore` tag, which is exempt). The
standing rule has no development-world carve-out: ids live in `.pipeline/**`
and nowhere else.

### B5 — the founder live-render review architecture §10 booked was never held.

Architecture §10: "replacing a topic-grouped list with a tree is visually novel
and high-exposure, so `.claude/rules/visual-regression.md` makes founder review
of the live render the primary gate. **Book it before the interface work is
called done.**" `.pipeline/work/nested-knowledge-items/` still holds only
plan/architecture/critique/feasibility/review/checks-log. No design artifact,
no recorded review.

I drove the app and looked at it myself, and I report what I saw below — that
is reviewer evidence, not the founder gate. The rule is explicit that nothing
substitutes for it.

---

## NON-BLOCKING DEFECTS

### N1 — the triage badge counts items the triage list cannot show. Live-proven.

`count({triageVisible})` (`knowledge-repository.ts:1420-1433`) filters
`status='proposed' AND role='ordinary' AND visibleToViewer` — it gained
neither `parentIsKnowledgeItemOrRoot()` nor the team-scope condition that
`list({tree})` gained. On the running app:

```
GET /api/knowledge/triage-count → {"count":7}
GET /api/knowledge              → 6 proposed items
```

The sidebar badge shows **7** while the Triage tab shows **6** rows — a count
the user cannot clear. Before this change both reads used the same predicate;
this is a regression the change introduced. It is also a (weak) second-order
AC4 signal: the extra unit is an item the viewer is not allowed to see.

### N2 — `position` is still never assigned by the migration.

Architecture §7 closes with "`position` is assigned by `created_at` within each
new parent." `0080_nested_knowledge_items.sql:29` adds the column with
`DEFAULT 0` and no assignment step exists. Every migrated row is `0`; ordering
falls through to `title` (`knowledge-repository.ts:1315`, `:1394`). Carried
forward from round 1 N1, unaddressed.

### N3 — the migration still does not convert residual scope values.

`0080` step 10 drops the three columns and stops (`:189-196`). Every
reparenting step is scoped to `role = 'ordinary'` (correctly), so a
`skill`/`rule`/`prompt`/`agent_file` row carrying `product`/`practice`/`task`
scope survives with a value TypeScript no longer admits and no CHECK
constraint to catch. Carried forward from round 1 N2.

### N4 — invariant 2 is still breachable from the child's own scope edit.

`update()` runs `cascadeScopeNarrowing` downward (`knowledge-repository.ts:742,
:772`) and never compares the item's **own** new scope to its parent's.
`PATCH {scopeKind:"factory"}` on a `team`-scoped child of a `team`-scoped
parent still produces a factory-visible node under an invisible one.
`reparent()` checks this; `update()` does not. Carried forward from round 1 N4.

### N5 — the cross-scope repetition signal was approximated, not deleted.

plan.md and architecture §4 both say it is "deleted rather than approximated;
without `topic` there is no honest version of it."
`layers/core-api/knowledge/src/attention-scoring.ts:48, :67-69, :84-85` keep
it, re-keyed on `(parentKind, parentId)`. Contained — nothing renders an
attention score — but it is the opposite of an approved decision, stated twice.
Carried forward from round 1 N5.

### N6 — two byte-identical status enums where architecture §2 said one.

`KNOWLEDGE_STATUSES` (`framework/domain-model/src/knowledge.ts:12`) and
`KERNEL_KNOWLEDGE_STATUSES` (`types.ts:61`) now hold the same four members and
are both exported. Carried forward from round 1 N6.

### N7 — a live eval prompt still asks the agent about L2/L3/L4.

`tools/eval/src/scenarios/assembled-knowledge.ts:39-43, :58` instructs the
agent to "Note which knowledge layer each came from (L2, L3, or L4)" against a
store where layers do not exist. Carried forward from round 1 N8.

### N8 — agent-facing persona prompts still teach the deleted layer vocabulary.

`plugins/role-personas/personas/product-manager.md:26` ("Capture L2
facilitation-level learnings via `write_memory`") and
`facilitator.md:10, :15` ("organize the L3 practice knowledge"). `write_memory`
no longer accepts `layer` at all. New finding — these are shipped prompts an
agent reads, and this change is what made them false.

### N9 — `KnowledgeList.tsx`'s own header contradicts its body.

`:27-32` still states "The Curated tab is now a flat sorted list… Browsing the
actual tree (parent/child nesting) lives on the detail page's children list,
**not here**." Sixty lines below, `:94-96` and `:253` build and render the
tree. A reader who trusts the header learns the wrong thing about the file the
tree was just added to.

### N10 — `docs/` now describes a model that does not exist.

Architecture §11 names five pages made false and says `/pipeline:write-docs` is
not optional here. `git diff <merge-base>...HEAD -- docs/` is **empty**;
`docs/knowledge-architecture/the-five-layers.md` and its neighbours still teach
L0–L4, topic cohorts and practice communities. Not a retry-loop blocker if the
orchestrator routes the docs phase, but it must close before this ships —
`docs/` is declared ground truth.

### N11 — a public package export widened for a test only.

`createWritebackProcessor` was made public on `@hyperidle/run-orchestration`
(`src/index.ts:92-103`) solely so the new e2e test can reach it from
`core-api`. The reasoning in the `@lore` is sound (the import edge leaves no
other legal home) and the function itself has an in-package production caller —
but the *public surface* is now test-only reachable. Worth a conscious nod
rather than a silent widening.

---

## FOLLOW-UP / NOTES

- **Two transactions still bracket a PATCH that both moves and edits.**
  `reparent` now runs first (`routes/knowledge.ts:618-635`), which is the right
  order and closes round 1's B12 half-commit: an illegal move refuses the whole
  PATCH. `reparent` does not bump `version` (`applyParentMove` is called
  without `versionBump`, `knowledge-repository.ts:586`), so the following
  `update()` still matches. A failure *between* them would still leave the move
  committed and the field edit not. Narrow, and outside what the architecture
  demanded.
- **The tree read is a flat SELECT, not the recursive CTE architecture §4
  describes** (`knowledge-repository.ts:1349-1358`), with the tree assembled
  client-side and a depth-32 backstop there (`KnowledgeList.tsx:126`). Same
  outcome, less machinery — a good deviation, but it means the depth bound is
  not enforced server-side.
- **`routine`/`agent` parent existence is still unvalidated in PATCH**
  (`routes/knowledge.ts:596-611` validates `task`/`thread` only). The comment
  reasons it from `CLIENT_WRITABLE_PARENT_KINDS`; I checked and those kinds are
  written by core-api's own routes today. Acceptable to ship: the surface is
  not client-reachable, and the no-FK design already permits a dangling parent.
- **Backlinks duplicates the Children card.** On a parent, the two cards render
  overlapping content (children appear in both) — architecture §4 asked for
  children ∪ siblings, so this is per spec, but on a real page it reads as the
  same list twice.
- **Row excerpts are not indented with their titles.** The tree indent is
  applied to the title span only (`KnowledgeList.tsx:644`), so every subtitle
  starts at the same x as a root title. Visible on the painted page: the
  indentation reads as ragged rather than as a hierarchy.

---

## What is genuinely good

Reported in full, because most of the fix cycle holds up.

- **The tree renders, and I looked at it.** `/knowledge` → Curated, against a
  freshly migrated + demo-seeded database: `General` → `└ This quarter's focus`;
  `Practices` → `└ builder practice` → `└ Session notes are the handoff
  contract`. Three levels, DFS order, 18px per level, capped at 6
  (`KnowledgeList.tsx:637`). `buildKnowledgeTree` (`:108-131`) promotes an item
  whose parent is not in the array to a root rather than dropping it, and
  `KnowledgeList.tree.test.tsx` asserts DOM order *and* the padding, so the
  component test can fail.
- **The detail page renders its children, and I looked at that too.**
  `ki-mig-root-practices` shows a CHILDREN card with all eight practice
  folders, and no "Kind" row anywhere.
- **`list({tree})` has a real production caller.** `routes/knowledge.ts:374-375`,
  with the viewer's team resolved through the owning service
  (`resolveViewerTeamId` → `findUser`, `:121-124`) — no join into `users` from
  the knowledge repository, so the table-ownership rule holds.
- **The team-visibility test is honest.** `knowledge.team-visibility.integration.test.ts`
  drives the real HTTP route with two real users in two real teams and asserts
  **both** directions — the outsider does not see it, the member does. That
  second assertion is what makes the first one mean something.
- **The new e2e test is real, and I ran it both ways.** It wires the actual
  `create`/`update`/`recordConflict`/`reparent` from `@hyperidle/knowledge`
  into the actual `createWritebackProcessor` against a real PGlite database and
  real files on disk. The scope assertion now compares a genuinely `team`-scoped
  parent against a child that would default to `"factory"` — the two sides come
  from different sources, so it can fail (and would fail either on the value or
  on the scope-too-wide invariant). It also asserts a real
  `knowledge_edit_log` row with `field='parent'`, which the old hand-rolled
  stub could never produce, and includes a cycle refusal *and* a legal-move
  success as a positive control. The gated `HYPERIDLE_REAL_FS_WATCH_TESTS=1`
  block is not decorative: I ran it, the real `startWatcher` picked up a real
  file write and the row landed in the real database. Gating it is what
  `.claude/rules/testing.md` explicitly asks for.
- **`parentChain` has a real producer.** `resolveParentChain`
  (`knowledge-repository.ts:1161-1191`) walks ancestors root-first and stops at
  the first non-`knowledge_item` parent, exactly as architecture §3 requires;
  `assembleSessionKnowledge:404-409` attaches it to every ranked ordinary item
  at bake time, with capability items carrying `[]` by role. Both are covered
  against a real DB (`nested-knowledge-parent-chain.integration.test.ts`,
  including the task-parented stop case).
- **The manifest is one type now.** `manifest-types.ts` is imported by both the
  writer (`context.ts:12`) and the reader (`writeback-processor.ts:7`), so the
  two shapes are compared by the compiler. `writeOrdinaryItem:794-801` writes an
  entry per ancestor directory carrying its real `scopeKind`, which is what
  stops writeback minting a duplicate folder item, and
  `nested-knowledge-materialisation.test.ts` proves it against real files with
  poisoned ports (so a DB read inside `writeContextBundle` fails the test).
- **The drain crash is closed by a migration step, not a shim.** `0080:209-224`
  fails any `pending`/`claimed` intent whose baked bundle has an item without
  `parentChain`, with a named error code, and
  `migration-0080-stale-baked-intents.integration.test.ts` covers it.
- **`needs_human → proposed`** at `0080:180` — the founder-caught inversion is
  fixed, and the brownfield test (which builds its pre-state from the real
  migrations 0..79) passes.
- **An illegal move is now a 4xx naming the rule.** `InvalidReparentError`
  carries a `rule` discriminant (`errors.ts`), the route maps it to 400 with
  `details.rule` (`routes/knowledge.ts:643-650`), and `reparent` runs *before*
  `update` so nothing half-commits. The test asserts the status band, the rule
  name, and that title/version/parent are all untouched afterwards.
- **`topic` is gone from the agent tools.** `split_knowledge`'s schema and
  `ports.ts` no longer carry it; the only matches left are `@lore` comments
  recording the deletion. The `draft` reference in the tool description is gone
  too.
- **`LEGACY_STATUS_TO_CURRENT` is deleted** — zero matches repo-wide.
- **The design-profile census was updated honestly, not silenced.** `+1
  metadata` for the tree-indent marker, `-2 small` / `-1 thin` for the deleted
  Kind row — each matches what I saw change on the painted page.
- **No scope excess.** The fix cycle's production delta is ~750 lines across 21
  files; the rest of the ~2000 is tests. I traced each production file to a
  named round-1 finding. The `?parentKind&parentId` list endpoint and
  `POST /:id/graduate` are **upstream** (#547), not additions here. Nothing in
  the delta is capability nobody asked for.
- **No test was bent.** The only test assertion deleted in the fix cycle is
  W3's "Kind field" check (`4ba4275f1`), which asserted the presence of a row
  AC6 deletes — deleting it is the AC, not an accommodation. Every other test
  change is an addition or a shape update forced by a real contract change.

---

## Escalations for the orchestrator

1. **B2 is still the founder's call, and it came back untouched.** Either the
   nest/move affordance gets built, or AC2 is amended in writing. A second
   silent pass over it is not available.
2. **B1 is a one-line omission with a user-visible consequence** — pass
   `viewerTeamId` into `childrenAndSiblings` and use `humanVisibleCondition`,
   the way `childrenOf` already does. It should not need a round of its own,
   but it does need one.
3. **B5 needs the founder personally.** I drove the app and can report the tree
   renders correctly; I cannot hold the review the architecture booked.
4. **N10 (docs) needs routing**, not a retry — five authoritative pages now
   describe a deleted model.
