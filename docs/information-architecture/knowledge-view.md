# Knowledge View

**Purpose:** The company's wiki. Humans and agents curate it together — items carry an origin agent, host their own discussion thread, and agent-drafted items land in Triage for human validation.

**Shell structure:** Sidebar | Main. Three routes (`router.tsx:96-98`):

| Route | Page |
|---|---|
| `/knowledge` | Item list (Curated / Triage tabs) |
| `/knowledge/new` | Full-page create |
| `/knowledge/:knowledgeId` | Item detail |

The Sidebar carries a triage badge — count of items needing attention (status `proposed`), shown when > 0 (`Sidebar.tsx`). There is no scope sub-browser in the Sidebar; scope filtering is inline pills on the list page.

## 1. Knowledge Item List (`/knowledge`)

Header: page title, Curated/Triage tab control, search field, **+ New** button (navigates to `/knowledge/new`).

There is no separate folder concept — a knowledge item's parent is another knowledge item, and clicking a row opens it with its own children listed on it (see §2).

| Component | Information | Actions |
|---|---|---|
| **Tab control** | Two views: **Curated** (a nested tree of `active` items) and **Triage** (`proposed` items, recency order). Tab memory is component state only — never persisted (`KnowledgeList.tsx` @lore J6). | Click to switch |
| **Scope pills** | All / Shared / Team / Private — static 4-pill row. All = no filter; Shared = factory scope; Team = team scope; Private = user scope (`utils/scope-labels.ts` SCOPE_PILL_OPTIONS). Selection is component state only — not carried in the URL (the old `?scope=` param drove a hidden indicator for dead scope values and was removed with them). | Click to filter both tabs |
| **Sort control** | Recency (`updatedAt`) is the only sort — the relevance/frequency pills and the signals they read were removed; `VISIBLE_SORT_OPTIONS` is a one-value list so the UI never offers a dead option. | Click to reorder (currently a no-op beyond the default) |
| **Search bar** | Text filter within the current tab | Type to filter |
| **KnowledgeTreeList row** (Curated, × N) | One row per item, DFS tree order — each parent immediately followed by its own children. Chevron toggles collapse/expand (expanded by default); 18px indent guide per ancestor depth, capped at 6; title + one-line body excerpt; a "Private" tag for user-scoped items; relative timestamp; a hover/focus "Add child" button that navigates to create with this row as the parent (`pages/knowledge/KnowledgeTreeList.tsx`, `build-knowledge-tree.ts`). Keyboard: `ArrowLeft` collapses an expanded row with children, `ArrowRight` expands a collapsed one, `Enter`/`Space` opens it. | Click row to open detail; click chevron to collapse/expand; click **+** to add a child |
| **KnowledgeRow** (Triage, × N) | Title, one-line preview, status, timestamp; user-scoped items show a "Private" tag (`Row`/`ItemList` DS primitives) | Click to open detail |

Scoring semantics (relevance, attention, access signals) are owned by [relevance-and-attention](../knowledge-architecture/relevance-and-attention.md).

### Triage tab

`proposed` items in recency order (the sort pill applies on top, though recency is the only option today). Keyboard-driven (Y4, ignored while typing in an input):

| Key | Action |
|---|---|
| `j` / `↓`, `k` / `↑` | Move focus |
| `Enter` / `o` | Open focused item |
| `v` | Validate → status `active` (optimistic) |
| `x` | Reject → status `archived` (optimistic) |
| `Esc` | Clear focus |

## 2. Knowledge Item Detail (`/knowledge/:knowledgeId`)

| Component | Information | Actions |
|---|---|---|
| **Breadcrumb** | True ancestry, not scope: Knowledge › … › parent title › item title. Shown when the item's parent is itself a knowledge item (fetched by id); a leading "…" segment signals a deeper chain without extra fetches. An item with no knowledge-item parent (a root, or one parented to a task/thread) falls back to its resolved scope name (DS `Breadcrumb`, `KnowledgeDetail.tsx`). | Click a segment to navigate |
| **PageHeader** | Title + metadata bar: status chip, confidence, origin agent (if any), last-updated timestamp | Edit button (or Done, in edit mode) + overflow menu |
| **Overflow menu** | Archive (POST `/api/knowledge/:id/archive`); Promote to task (disabled once archived); for editable items only — Change scope, Move | Click |
| **ScopeChangeDialog** | Move the item to a different scope: scope kind + scope id (free text) where the scope needs one; saves through PATCH `/api/knowledge/:id` (the same endpoint the body and role use) carrying the current `version` so stale mutations are rejected (`pages/knowledge/ScopeChangeDialog.tsx`) | Submit |
| **MoveDialog** | Reparent the item, or send it back to the top level: a single `ParentPicker` select, pre-filled with the current knowledge-item parent (empty when the item is already a root or parented off-tree). Options are the legal destinations only — narrowed by the no-cycles/no-wider-scope/depth≤32 rules before render, so the picker never offers a move the server would reject. Saves through the same PATCH `/api/knowledge/:id`, then reloads the page (`pages/knowledge/MoveDialog.tsx`, `ParentPicker.tsx`) | Submit |
| **Body** | Markdown `knowledge_items.body` rendered as Blocks (derived view, never a stored dialect) — see [docs/blocks/](../blocks/index.md). Per-block discussion anchors thread messages on `messages.block_id` (`db/src/schema.ts`, T5); thread grammar → [thread-primitive](../human-interface-layer/thread-primitive.md). | Edit toggles in-page (state, not a route) |
| **Edit mode** | `BodyEditor` with auto-save via PATCH `/api/knowledge/:id`; "Saved" indicator; **Done** exits. Optimistic lock rides the `version` column. | Type; auto-saves |
| **Discussion** | `HostThreadSection` hosts the item's conversation | Reply |
| **Children card** | Always shown, even with no children yet — this item's own children, ordered by `position`, plus an "Add child" link that navigates to create with this item pre-selected as parent (`ChildrenCard` in `KnowledgeDetail.tsx`) | Click a child to navigate; click "Add child" to nest a new one |
| **Backlinks card (aside)** | Children plus siblings — the tree's own answer to "what is near this," replacing the old shared-topic query | Click to navigate |

## 3. Create flows

**Full-page create (`/knowledge/new`, `KnowledgeCreate.tsx`):** bordered header (breadcrumb + editable title input + **Create** button, disabled until title and body have content) over a two-column body — `BodyEditor` left, metadata card right with a scope picker and a `ParentPicker`. A chosen parent rides the create call itself (`parentKind`/`parentId`) — no follow-up PATCH. Opening the page with `?parentId=<id>` (the tree row's "Add child" and the detail page's "Add child" both do this) pre-selects that parent. Create-time scope options: Shared → factory, Team → team, Private → user (`SCOPE_CREATE_OPTIONS`). Human-authored items are created as status `active` immediately (AF13 §1) — no draft detour.

**In-context capture (`KnowledgeCreateDialog`):** the dialog survives for capture from a host object — e.g. "Add knowledge" on a task detail page opens it with the task scope locked (`WorkTask.tsx`).

## 4. Data semantics (pointers)

- **Statuses:** `proposed | active | stale | archived` (`KNOWLEDGE_STATUSES`, `framework/domain-model/src/knowledge.ts`). The former nine-value split across two vocabularies (`draft`/`captured`/`provisional`/`needs_human`/…) collapsed to these four; a human-created item and an agent-written one both start `proposed`. Lifecycle and promotion → [facilitators](../knowledge-architecture/facilitators.md).
- **Scope:** `scopeKind` — `factory | team | user` (`SCOPE_KINDS`) — + `scopeId` on the kernel table. A readability filter, not access control: a child's scope must be the same or narrower than its parent's. Reach and store semantics → [the-canonical-store](../knowledge-architecture/the-canonical-store.md).
- **Tree placement:** `parentId` + `parentKind` (`knowledge_item | task | thread | routine | agent`) + `position` say what an item is about and where it sits — a folder is a knowledge item, not a separate mechanism. Only a `knowledge_item` parent puts a row in this tree; a task- or thread-parented item lists on that task or thread instead. → [the-canonical-store](../knowledge-architecture/the-canonical-store.md).
- **No `topic`/`kind`/`layer` columns** on `knowledge_items` — those vocabularies are deleted entirely, not moved; where an item sits in the tree says what it is about. Scoring fields live on the app projection extension table (O2). See [the-canonical-store](../knowledge-architecture/the-canonical-store.md).
- **Shape:** owned by `framework/db/src/schema.ts` (id, scopeKind/scopeId, role, parentKind/parentId, position, title, body, format, status, version, updatedBy, timestamps).
