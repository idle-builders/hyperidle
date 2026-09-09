# Nested knowledge tree UI — approved design

Decisions for the Curated browse tree and detail nesting surfaces. Inspired by
Notion / Linear / filesystem trees; executed in Hearth (Crème Lemon) tokens —
not purple chrome, not └ dented lists.

## List (`/knowledge` Curated)

1. **Real tree chrome.** Each row is a `treeitem` under a `tree`: collapse/
   expand chevron (rotated with `motion-move`), vertical indent guides (1px
   `--border-subtle` hairlines, 18px depth step, depth capped at 6), title +
   excerpt aligned to the indent — not a flat list with a └ prefix.
2. **Starts expanded.** Collapse state is local UI memory for the session; it
   is not persisted. Collapsing hides the whole descendant DFS slice.
3. **Add child in place.** Hover/focus reveals a + control that navigates to
   `/knowledge/new?parentId=…`. Create reads that query into the ParentPicker
   (init only; submit shape unchanged).
4. **Keyboard.** Chevron and add-child are real buttons (44px targets). Focused
   rows: Enter/Space open; ArrowLeft collapses; ArrowRight expands. Triage keeps
   its existing j/k/v/x shortcuts — curated does not steal those.
5. **Off-tree stays off.** Task/thread/routine/agent-parented items never enter
   this tree (parent rule already filters the list). Orphans whose parent is
   filtered out promote to temporary roots so a filter cannot hide them.
6. **No drag-to-reorder.** Out of scope; `position` exists for later.

## Detail (`/knowledge/:id`)

1. **Ancestry breadcrumb.** For `parentKind === "knowledge_item"`, the middle
   segment is the parent’s title (linked), not the scope label. A single `…`
   segment appears when the parent itself has a knowledge parent — signals
   deeper nesting without cascading ancestor fetches. Off-tree items still fall
   back to `scopeName`.
2. **Children card.** Always present: section label, Add child link, then either
   the child list or a quiet empty line. First nest is available from detail,
   not only after children already exist. No decorative arrows.
3. **Move** remains in the overflow menu (existing MoveDialog + ParentPicker).

## Composition notes

- Page-local `KnowledgeTreeList` (not a new `ds/` primitive) — one consumer;
  promote if a second surface needs the same chrome.
- Reuses DS `Breadcrumb`, `SectionLabel`, `EmptyState`, `PageScaffold` / header.
- Touch targets ≥ 44px on chevron and add-child (AQ-015).
- Scope remains a readability filter in copy and chrome — never sold as ACL.
