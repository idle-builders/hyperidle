## 4. Knowledge View

**Purpose:** The company's wiki. Agent-free curation.

<!-- @source packages/web/src/pages/KnowledgeList.tsx -->

**Shell structure:** Sidebar | Main (Knowledge Item List or Detail).

### 4.1 Submenu (Scope & Topic Browser)

| Component | Information | Actions |
|---|---|---|
| **Scope selector** | Three options: Practice / Product / Factory | Click to switch scope |
| **Practice list** (Practice scope) | Building, Growth, Product, Ops, Hardware, Facilitation — each with item count | Click to filter main pane |
| **Product list** (Product scope) | Ambrovia, Acme, HyperIdle, Pulse — each with item count | Click to filter |
| **Topic list** | Per topic: name, item count, health indicator (stable/degraded), stale count | Click to filter; multi-select with Cmd |
| **Quick filter links** | Drafts, Index, Curated, Stale, Archive — with counts | Click to jump to view |

### 4.2 Knowledge Item List (in Main)

| Component | Information | Actions |
|---|---|---|
| **View switcher** | Two views: Curated (all active items grouped by topic) and Triage (needs attention + drafts + stale, sorted by attention score). Additional sort options within each view: by date, access count, attention score. | Click to switch view; click sort control to reorder |
| **Knowledge gap indicator** | Topics with zero active items or no activity in 90+ days, highlighted in topic list | Click to create first item in gap topic |
| **Topic section header** | Topic name, item count, stale count | Collapse/expand |
| **KnowledgeRow** (× N) | Title, one-line preview, kind tag, status tag, topic (in cross-topic views), timestamp | Click to open detail |
| **Kind tag** | Pattern, anti_pattern, decision, failure, brief, principle, reflection, focus — color-coded | Read-only |
| **Status tag** | Captured, provisional, active, stale, archived — with colored dot | Read-only |
| **Search bar** | Full-text search within current scope | Type to search; highlighted results |
| **Filter/sort controls** | Sort by attention score, date, access count | Click to change sort |
| **Bulk update button** | — | Multi-select items and batch-apply operations |
| **Curation suggestion card** | Agent-generated suggestion (e.g., "3 JWT items losing relevancy — merge?") | Execute or dismiss |

### 4.3 Knowledge Item Detail/Edit (in Main)

| Component | Information | Actions |
|---|---|---|
| **Breadcrumb** | Knowledge → [Practice/Product] → [Topic] → [Item title] | Click to return to list |
| **Editable title** | Item title, large text | Click to edit inline |
| **Metadata bar** | Kind, status, topic (dropdown to change), confidence (0-1 bar), last-edited date + editor, access count, origin agent, creation context, evidence links | Read-only except topic |
| **Action bar** | Flag, Archive, Move, Merge, Split | Click each |
| **Rich content body** | Full markdown rendered as a list of blocks per the **Block primitive** (TRACK-L L2; spec at `docs/blocks/`): headings, paragraphs, lists, code, quotes, tables, hr, images. Each block carries a stable, server-computed id; blocks are a *derived* view over `knowledge_items.body` (markdown stays on disk / in the DB column — never a stored dialect). | Click anywhere to edit inline; auto-save (body-level optimistic lock). Per-block discussion (L26) attaches a thread message to a `(host_id, block_id)` anchor. |
| **Edit toolbar** | Bold, italic, link, image, save | Formatting controls (appears when editing) |
| **Observation logs** | Read-only comments from facilitator agents | — |
| **Edit history** | Version timeline: what changed, when, by whom | Collapse/expand; click version to preview |
| **Related items sidebar** | Auto-suggested related items (by topic, by text similarity) + manually linked items | Click to navigate; "Link item" button to add manual link |
| **Merge modal** | Triggered from Action bar. Lists similar items in same topic → select target → preview combined result → confirm | Execute merge; source item archived with redirect |
| **Split modal** | Triggered from Action bar. Select text section → promote to new item in same topic → auto-cross-link both | Execute split; both items linked |

---
