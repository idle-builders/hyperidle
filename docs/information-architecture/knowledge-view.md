# Knowledge View

**Purpose:** The company's wiki. Humans and agents curate it together — items carry an origin agent, host their own discussion thread, and agent-drafted items land in Triage for human validation.

**Shell structure:** Sidebar | Main. Three routes (`router.tsx:90-92`):

| Route | Page |
|---|---|
| `/knowledge` | Item list (Curated / Triage tabs) |
| `/knowledge/new` | Full-page create |
| `/knowledge/:knowledgeId` | Item detail |

The Sidebar carries a triage badge — count of items needing attention (draft + `needs_human`), shown when > 0 (`Sidebar.tsx:119`). There is no scope sub-browser in the Sidebar; scope filtering is inline pills on the list page.

## 1. Knowledge Item List (`/knowledge`)

Header: page title, Curated/Triage tab control, search field, **+ New** button (navigates to `/knowledge/new`).

| Component | Information | Actions |
|---|---|---|
| **Tab control** | Two views: **Curated** (active items grouped by topic) and **Triage** (draft + `needs_human` items, ordered by attention score). Tab memory is component state only — never persisted (`KnowledgeList.tsx` @lore J6). | Click to switch |
| **Scope pills** | All / Shared / Team / Private — static 4-pill row. All = no filter; Shared = factory + practice scopes; Team = team + product scopes; Private = user scope (`utils/scope-labels.ts` SCOPE_PILL_OPTIONS, AD6). Selection lives in the `?scope=` URL param. | Click to filter both tabs |
| **Sort control** | relevance (default, `signals.relevanceScore`) / recency (`updatedAt`) / frequency (30-day access count) via `?sort=` URL param. Item signals also carry `citationCount` and `attentionScore`. | Click to reorder |
| **Search bar** | Text filter within the current tab | Type to filter |
| **Topic section header** (Curated) | Topic name, item count, stale count (archived items), health indicator fresh / some_stale / mostly_stale — derived from the archived ratio (≥ 50% → mostly_stale) | Collapse/expand |
| **KnowledgeRow** (× N) | Title, one-line preview, status, timestamp; user-scoped items show a "Private" tag (`design-system/src/KnowledgeRow.tsx`) | Click to open detail |

Scoring semantics (relevance, attention, access signals) are owned by [relevance-and-attention](../knowledge-architecture/relevance-and-attention.md).

### Triage tab

Draft and `needs_human` items sorted by `attentionScore` descending (unscored items last); the sort pill applies on top. Keyboard-driven (Y4, ignored while typing in an input):

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
| **Breadcrumb** | Back to the list (DS `Breadcrumb`, `KnowledgeDetail.tsx`) | Click to return |
| **PageHeader** | Title + metadata subtitle: confidence, 30-day access count, origin agent, topic | Edit button + overflow menu |
| **Overflow menu** | Archive (POST `/api/knowledge/:id/archive`), scope change | Click |
| **ScopeChangeDialog** | Move the item to a different scope: scope kind + scope id + required reason; PATCH `/api/knowledge/:id/scope` carries the current `version` so stale mutations are rejected (`pages/knowledge/ScopeChangeDialog.tsx`) | Submit |
| **Body** | Markdown `knowledge_items.body` rendered as Blocks (derived view, never a stored dialect) — see [docs/blocks/](../blocks/index.md). Per-block discussion anchors thread messages on `messages.block_id` (`db/src/schema.ts`, T5); thread grammar → [thread-primitive](../human-interface-layer/thread-primitive.md). | Edit toggles in-page (state, not a route) |
| **Edit mode** | `BodyEditor` with auto-save via PATCH `/api/knowledge/:id`; "Saved" indicator; **Done** exits. Optimistic lock rides the `version` column. | Type; auto-saves |
| **Discussion** | `HostThreadSection` hosts the item's conversation — this replaced the old read-only observation logs (L18) | Reply |
| **Related items sidebar** | Structured `relatedItems` from the API, rendered as a navigable list | Click to navigate |

## 3. Create flows

**Full-page create (`/knowledge/new`, `KnowledgeCreate.tsx`):** bordered header (breadcrumb + editable title input + **Create** button, disabled until title and body have content) over a two-column body — `BodyEditor` left, metadata card right with a scope picker. Create-time scope options: Shared → factory, Team → team, Private → user (`SCOPE_CREATE_OPTIONS`). Human-authored items are created as status `active` immediately (AF13 §1) — no draft detour.

**In-context capture (`KnowledgeCreateDialog`):** the dialog survives for capture from a host object — e.g. "Add knowledge" on a task detail page opens it with the task scope locked (`WorkTask.tsx`).

## 4. Data semantics (pointers)

- **Statuses:** `draft | active | archived | needs_human` (`KERNEL_KNOWLEDGE_STATUSES`, `framework/domain-model/src/types.ts:77`). Lifecycle and promotion → [facilitators](../knowledge-architecture/facilitators.md).
- **Scope:** `scopeKind` (7-value closed enum) + `scopeId` on the kernel table; enum and store semantics → [the-canonical-store](../knowledge-architecture/the-canonical-store.md).
- **No kind/layer columns** on `knowledge_items` — strategy fields (layer, kind, scoring) live on the fabric extension table (O2); taxonomy → [the-five-layers](../knowledge-architecture/the-five-layers.md).
- **Shape:** owned by `framework/db/src/schema.ts` (id, scopeKind/scopeId, topic, title, body, format, status, version, updatedBy, timestamps).
