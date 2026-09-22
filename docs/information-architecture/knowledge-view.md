# Knowledge View

**Purpose:** The company's wiki. Humans and agents curate it together — documents carry an origin editor, host their own discussion thread, and agent-drafted documents land in Triage for human validation.

**Shell structure:** Sidebar | Main. Three routes (`router.tsx`):

| Route | Page |
|---|---|
| `/documents` | Document list (Curated / Triage tabs) |
| `/documents/new` | Full-page create |
| `/documents/:documentId` | Document detail |

The Sidebar section is still labelled "Knowledge" and carries a triage badge — count of documents needing attention (status `proposed`), shown when > 0 (`Sidebar.tsx`). There is no scope sub-browser in the Sidebar; scope filtering is inline pills on the list page.

## 1. Document List (`/documents`)

Header: page title, Curated/Triage tab control, search field, **+ New** button (navigates to `/documents/new`).

There is no separate folder concept — a document's parent is another document, and clicking a row opens it with its own children listed on it (see §2).

| Component | Information | Actions |
|---|---|---|
| **Tab control** | Two views: **Curated** (a nested tree of `active` documents) and **Triage** (`proposed` documents, recency order — there is no attention score any more). Tab memory is component state only — never persisted (`DocumentList.tsx`). | Click to switch |
| **Scope pills** | All / Shared / Team / Private — static 4-pill row. All = no filter; Shared = factory scope; Team = team scope; Private = user scope. Selection is component state only — not carried in the URL. | Click to filter both tabs |
| **Sort control** | Recency (`updatedAt`) is the only sort. | Click to reorder (currently a no-op beyond the default) |
| **Search bar** | Text filter within the current tab, via `search_documents({ text })` | Type to filter |
| **DocumentTreeList row** (Curated, × N) | One row per document, DFS tree order — each parent immediately followed by its own children. Chevron toggles collapse/expand (expanded by default); indent guide per ancestor depth; title + one-line body excerpt; a "Private" tag for user-scoped documents; relative timestamp; a hover/focus "Add child" button that navigates to create with this row as the parent (`pages/document/DocumentTreeList.tsx`, `build-document-tree.ts`). Keyboard: `ArrowLeft` collapses an expanded row with children, `ArrowRight` expands a collapsed one, `Enter`/`Space` opens it. | Click row to open detail; click chevron to collapse/expand; click **+** to add a child |
| **DocumentRow** (Triage, × N) | Title, one-line preview, status, timestamp; user-scoped documents show a "Private" tag | Click to open detail |

### Triage tab

`proposed` documents in recency order. Keyboard-driven, ignored while typing in an input:

| Key | Action |
|---|---|
| `j` / `↓`, `k` / `↑` | Move focus |
| `Enter` / `o` | Open focused document |
| `v` | Validate → status `active` (optimistic, `call("edit_document", { id, status: "active", version })`) |
| `x` | Reject → status `archived` (optimistic, same call with `status: "archived"`) |
| `Esc` | Clear focus |

## 2. Document Detail (`/documents/:documentId`)

| Component | Information | Actions |
|---|---|---|
| **Breadcrumb** | True ancestry, not scope: Knowledge › … › parent title › document title. Shown when the document's parent is itself a document (fetched by id); a leading "…" segment signals a deeper chain without extra fetches. A document with no document parent (a root, or one parented to a task/thread) falls back to its resolved scope name. | Click a segment to navigate |
| **PageHeader** | Title + status chip | Edit button (or Done, in edit mode) + overflow menu |
| **Overflow menu** | Archive, Promote to task (disabled once archived), Change scope, Move — every mutation calls `edit_document` with the document's current `version`, so a stale write is refused rather than silently overwriting | Click |
| **ScopeChangeDialog** | Move the document to a different scope: scope kind + scope id (free text) where the scope needs one; saves via `call("edit_document", { id, scopeKind, scopeId, version })` (`pages/document/ScopeChangeDialog.tsx`) | Submit |
| **MoveDialog** | Reparent the document, or send it back to the top level: a single `ParentPicker` select, pre-filled with the current document parent (empty when the document is already a root or parented off-tree). Options are the legal destinations only — narrowed by the no-cycles/no-wider-scope/depth≤32 rules before render, so the picker never offers a move the server would reject. Saves via `call("edit_document", { id, parent, version })`, then reloads the page (`pages/document/MoveDialog.tsx`, `ParentPicker.tsx`) | Submit |
| **Body** | Markdown `documents.body` rendered as Blocks (derived view, never a stored dialect) — see [docs/blocks/](../blocks/index.md). Per-block discussion anchors thread messages on `messages.block_id` (`db/src/schema.ts`, T5); thread grammar → [thread-primitive](../human-interface-layer/thread-primitive.md). | Edit toggles in-page (state, not a route) |
| **Edit mode** | `BodyEditor` with auto-save via `call("edit_document", { id, body, version })`; "Saved" indicator; **Done** exits. Optimistic lock rides the `version` column — a stale save is refused, never silently overwritten. | Type; auto-saves |
| **Discussion** | `HostThreadSection` hosts the document's conversation | Reply |
| **Children card** | Always shown, even with no children yet — this document's own children, ordered by `position`, plus an "Add child" link that navigates to create with this document pre-selected as parent (`ChildrenCard` in `DocumentDetail.tsx`) | Click a child to navigate; click "Add child" to nest a new one |
| **Aside** | Status, last edited, editor, and usage — read count + last-read time, session-use count + last-used time (`document-read-count`/`document-session-use-count`, `DocumentDetail.tsx`) | — |
| **Backlinks card (aside)** | Children plus siblings — the tree's own answer to "what is near this" | Click to navigate |

## 3. Create flows

**Full-page create (`/documents/new`, `DocumentCreate.tsx`):** bordered header (breadcrumb + editable title input + **Create** button, disabled until title and body have content) over a two-column body — `BodyEditor` left, metadata card right with a scope picker and a `ParentPicker`. A chosen parent rides the create call itself (`call("edit_document", { title, body, parent, scopeKind })`) — no follow-up edit. Opening the page with `?parentId=<id>` (the tree row's "Add child" and the detail page's "Add child" both do this) pre-selects that parent. Create-time scope options: Shared → factory, Team → team, Private → user. Human-authored documents are created as status `active` immediately — no draft detour.

**In-context capture:** a host object (e.g. a task detail page) can open document creation with its scope pre-locked.

## 4. Data semantics (pointers)

- **Statuses:** `proposed | active | stale | archived` (`DOCUMENT_STATUSES`, `framework/domain-model/src/actions/document.ts`); a human-created document and an agent-written one both start `proposed`. Lifecycle and curation → [Knowledge Movement](../knowledge-architecture/the-knowledge-fabric-how-knowledge-moves.md).
- **Scope:** `scopeKind` — `factory | team | user` (`SCOPE_KINDS`) — + `scopeId`, on the same row. A readability filter, not access control: a child's scope must be the same or narrower than its parent's. Reach and store semantics → [the-canonical-store](../knowledge-architecture/the-canonical-store.md).
- **Tree placement:** `parentId` + `parentKind` (`document | task | thread | routine | agent`) + `position` say what a document is about and where it sits — a folder is a document, not a separate mechanism. Only a `document` parent puts a row in this tree; a task- or thread-parented document (an artifact) lists on that task or thread instead. → [the-canonical-store](../knowledge-architecture/the-canonical-store.md).
- **No `topic`/`kind`/`layer` columns** — those vocabularies don't exist; where a document sits in the tree says what it is about. See [the-canonical-store](../knowledge-architecture/the-canonical-store.md).
- **Shape:** owned by `framework/db/src/schema.ts` (id, scopeKind/scopeId, slot, parentKind/parentId, position, title, body, format, status, version, confidence, meta, four usage columns, updatedBy, timestamps).
