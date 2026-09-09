# Implementation review — nested knowledge items (round 3)

Cold re-read of the latest fix cycle. Scope: the delta since `623d8b78b`'s
parent (`bb9715103`) through HEAD `ea5f88ad5`, plus whether round-2 blockers
B1–B5 actually closed. Prior `review.md` (NOT DONE) is not rewritten; this
file is the round-3 verdict.

Commits judged:

| SHA | Subject |
|---|---|
| `623d8b78b` | codex test model → gpt-5.6-luna (out of product scope) |
| `3c24a523c` | Accept `knowledge_item` parent on create (one write) |
| `ea5f88ad5` | Real nestable tree UI + `design/approved.md` |

Earlier commits on the branch (before this three-commit window) already
attempted B1–B4 closes; those landings are verified here rather than trusted
from commit messages.

Working tree: **clean**. Branch ahead of its remote tracking branch by 4
commits; nothing uncommitted.

---

## Verdict

**NOT DONE.**

ACs 1–6 are met in the product surface. Prior B1–B3 are closed with
executable evidence. Two round-2 blockers remain: the work-item id is still
outside `.pipeline/**` (B4), and the founder live-render gate architecture
§10 booked is still unrecorded (B5). Design approval for the tree chrome now
exists; that is not a substitute for the visual rule's founder live review.

---

## What I ran

| Command | Result |
|---|---|
| `git status` / `git log` / `git diff --stat HEAD~3..HEAD` | clean tree; three named commits + prior B1–B4 closes on the branch |
| `rg` across routes, repository, UI, fixtures, domain-model, tools | B1 wiring, AC6 leftovers, WP-id leaks |
| `npx vitest run` (6 UI/unit files under `layers/core-ui`) | **18/18 passed** |
| `npm run test:integration:service -- …knowledge.team-visibility… …knowledge.parent…` | **19/19 passed** |
| Live app / Playwright | **not re-driven** this round — tree UI judged from approved design + component tests + code; founder live gate still B5 |

Injected/pre-spawn `check`+`lint` from `checks-latest.log` remain green from an
earlier pass; not re-run. Not disputing them.

---

## Acceptance criteria

| # | Criterion | Round 2 | Round 3 |
|---|---|---|---|
| 1 | Tree renders; parent opens as item with children listed | PASS | **PASS** — `KnowledgeTreeList` (`KnowledgeTreeList.tsx`) replaces dent markers; `ChildrenCard` always present with Add child (`KnowledgeDetail.tsx:383-431`) |
| 2 | Person can nest and move; tree keeps up | FAIL | **PASS** — ParentPicker + Move overflow + create `parentKind`/`parentId` in one POST (`KnowledgeCreate.tsx:125-128`, `routes/knowledge.ts:149`, `3c24a523c`) |
| 3 | Agent nested folders ↔ human tree directories | PASS | **PASS** (carried; writeback D4 inherit unchanged by this delta) |
| 4 | Team-scoped branch invisible outside team | FAIL (Backlinks leak) | **PASS** — B1 closed (see below) |
| 5 | Task knowledge on task, not in tree | PASS | **PASS** — list parent filter (`KnowledgeList.tsx:672-674`) + `ArtifactSection parentKind="task"` (`WorkTaskPage.tsx:650-651`) |
| 6 | `topic`/`kind`/`layer`/`product`/`practice` gone from schema, interface, agent tools | FAIL | **PASS** — schema projection dropped layer/kind; `SCOPE_KINDS` = factory/team/user; `write_memory` schema has no layer/kind/topic; fixture fields removed. Residual dead `scope: "practice"` in `LEGACY_DETAILS` noted as N1 below (not painted via `scopeKindToLabel`) |

| Founder / architecture rulings touched by delta | Status |
|---|---|
| Create may name a `knowledge_item` parent in one write | **PASS** — `CLIENT_WRITABLE_PARENT_KINDS` includes it; invariants inside `create()` transaction; integration test green |
| Approved tree design (`design/approved.md`) | **PASS vs design decisions** — chevron, 18px guides, expand-by-default, Add child URL, keyboard, Move in overflow, ancestry breadcrumb |
| Founder live-render review (architecture §10 / `visual-regression.md` §5) | **FAIL** — still B5 |

---

## Prior blockers B1–B5

| ID | Round 2 | Round 3 | Evidence |
|---|---|---|---|
| **B1** Backlinks leaked team-scoped titles | OPEN | **CLOSED** | `childrenAndSiblings` takes `viewerTeamId` and applies `humanVisibleCondition` (`knowledge-repository.ts:1364-1397`); route passes it (`routes/knowledge.ts:455-458`); `knowledge.team-visibility.integration.test.ts` asserts outsider `relatedItems` excludes / member includes — **19** service tests green including that case |
| **B2** No human nest/move affordance | OPEN | **CLOSED** | Move menu + `MoveDialog` (`KnowledgeDetail.tsx:525-549, 1187+`); create ParentPicker + `?parentId=`; POST accepts `knowledge_item` parent; UI + parent integration tests green |
| **B3** Retired vocab live in interface | OPEN | **CLOSED** | `knowledge-data.ts` no longer declares layer/kind/topic; `KNOWLEDGE_TOPIC_HEALTHS` deleted; Backlinks empty copy is "Related items will appear here." (`KnowledgeDetail.tsx:467`); Kind/layer chrome still absent |
| **B4** Work-item id outside `.pipeline/**` | OPEN | **STILL OPEN** | See blocking finding R3-B1 |
| **B5** Founder live-render review never held | OPEN | **STILL OPEN / UNVERIFIED** | `design/approved.md` now exists (closes "no design artifact"); no recorded founder annotation of the live render in `.pipeline/work/nested-knowledge-items/` |

---

## BLOCKING

### R3-B1 (= prior B4) — work-item id still outside `.pipeline/**`

Governing: review skill ("exact or derived item-ID leakage outside `.pipeline/**`
is always blocking"); `taste.md` ("planning labels stay inside `.pipeline/`");
round-2 B4.

Non-`@lore` occurrences (source, excluding dist):

```
layers/core-api/src/routes/knowledge.ts:232
  * … founder ruling, nested-knowledge-items:

layers/core-api/src/__tests__/nested-knowledge-tree-real.integration.test.ts:2
  * nested-knowledge-items — proof against a REAL agent…

layers/core-ui/src/__tests__/KnowledgeCreate.af13.test.tsx:122
  // nested-knowledge-items — nesting under an existing item…

layers/core-ui/src/__tests__/KnowledgeCreate.af13.test.tsx:125
  describe("nested-knowledge-items — KnowledgeCreate nests in one write", …
```

Filenames still carrying the id (or its derived form):

- `layers/core-api/src/__tests__/nested-knowledge-tree-real.integration.test.ts`
  — **reintroduced after** the round-2 rename pass that closed the prior
  filename set
- `framework/db/drizzle/0080_nested_knowledge_items.sql` — still named for the
  work item (round-2 listed this; never renamed)

Impact: the standing rule has no test-world carve-out. The create-flow test
describe string and the new real-harness proof file are fresh leaks in the
window after B4 was supposedly closed.

### R3-B2 (= prior B5) — founder live-render review still unrecorded

Governing: architecture.md §10; `.pipeline/rules/visual-regression.md` §5
("Never auto-approve because a tool would not start, and never offer a
passing lint in its place").

`design/approved.md` (landed in `ea5f88ad5`) records design decisions for the
tree chrome and is the right artifact for `/design`. It does **not** record
that the founder annotated the running app. This round did not drive the live
render either — component tests prove structure against the approved design,
not the visual gate.

Impact: architecture books the founder live review as a hard stop before the
interface work is called done. Still unmet.

---

## NON-BLOCKING DEFECTS

### N1 — `LEGACY_DETAILS` still stores `scope: "practice"` ×4

`KnowledgeDetail.tsx:155,167,185,202`. Production-world fixture constants.
Painted path uses `scopeKindToLabel(item.scopeKind ?? "factory")` (`:1210`),
so the word "practice" is not shown for these rows. Dead retired vocabulary
in the interface file after AC6; safe to defer scrubbing with the fixture
removal already tracked (#93).

### N2 — Add child from a team-scoped parent defaults to an illegal create

`KnowledgeCreate` defaults `scopeKind` to `"factory"` (`:76`) while
`?parentId=` only seeds the picker (`:87`). `buildParentOptions` then drops
any parent wider than the child (`parent-options.ts:108` —
`scopeRank(item) <= childRank`), so a team parent disappears from legal
options while `parentId` state can remain set; changing scope to Team
**clears** `parentId` (`KnowledgeCreate.tsx:261-264`). Nesting under team
items is still possible manually; the tree "+" shortcut is awkward. Does not
fail AC2 (nest/move exist), but fights the approved "Add child in place"
flow for team branches.

### N3–N13 — carry-forward from round 2 where still true

Unaddressed by this delta (spot-checked, not re-proven end-to-end):

- triage-count vs list mismatch (round-2 N1)
- migration `position` all zeros (N2)
- residual non-ordinary scope values (N3)
- `update()` can widen past parent (N4)
- cross-scope attention approximated (N5)
- duplicate status enums (N6)
- eval / persona prompts still teach layers (N7–N8)
- docs/ still teach L0–L4 (`docs/knowledge-architecture/the-five-layers.md`;
  `git diff` vs main on `docs/` is only the harness model string from
  `623d8b78b`) — round-2 N10; route via write-docs, not this retry loop
- public `createWritebackProcessor` export for tests (N11)

Round-2 N9 (KnowledgeList header contradicted the tree) is **closed** — header
now describes `KnowledgeTreeList` (`KnowledgeList.tsx:29`).

---

## FOLLOW-UP / NOTES

- `623d8b78b` (codex model rename) is infrastructure for harness tests, not
  product scope for this item — no AC impact.
- Design conformance of `KnowledgeTreeList` to `design/approved.md` looks
  solid in code: `role="tree"` / `treeitem`, 18px depth step capped at 6,
  `motion-move` chevron, hover add-child, ArrowLeft/Right, starts expanded
  (`collapsedIds` empty). Ancestry breadcrumb with `…` matches detail §1.
- Stale dent-marker expectations were updated, not left behind:
  `KnowledgeList.tree.test.tsx` and `KnowledgeTreeList.test.tsx` assert
  **absence** of `└`. No stale "create must 400 on knowledge_item" contract —
  `knowledge.parent.integration.test.ts` now asserts the one-write path.
- No scope excess in the three commits: create parent + tree chrome match
  plan AC2 and the approved design.

---

## What works (positive evidence)

- **B1 really closed.** Repository + route + bidirectional HTTP test.
- **AC2 human path is real.** Nest at create (one POST), move from overflow,
  Add child from list and detail — not API-only.
- **Tree UI matches the approved design**, not a └ prefix list.
- **Create invariants.** Illegal `knowledge_item` parent (missing / invisible)
  → 400; legal parent → 201 with parent set — proven in service integration.
- **Team visibility** still proven for list, children, and relatedItems.
- **Working tree clean**; focused UI and service suites for this delta green.

---

## Escalations for the orchestrator

1. **R3-B1 / B4** — strip or `@lore`-tag the four non-exempt strings; rename
   the reintroduced test file (and decide whether the migration filename is
   amended or explicitly grandfathered in writing).
2. **R3-B2 / B5** — founder must review the live `/knowledge` tree render;
   record it under this work folder. Design approval alone is insufficient
   per architecture §10.
3. **Docs (carry N10)** — still needs `/pipeline:write-docs`, not another
   code retry.
