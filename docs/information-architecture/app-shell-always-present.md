## 1. App Shell (Always Present)

The shell is the fixed frame around every view. It provides:

1. **View switching** — navigation between Conversations, Work, and Knowledge
2. **Per-section fast-nav** — the head of the active section's items (threads / teams / knowledge items), swapping when a different section is selected
3. **Main content** — the active view's content
4. **Ambient awareness** — system state (blockers, cost burn, unread counts) accessible without leaving the current view

### 1.0 Sidebar layout (SidebarV2, shipped AD9)

The sidebar runs top-to-bottom:

1. **Search row** — a `SearchField` spanning the sidebar width, with the **Assistant icon button** (robot glyph) immediately to its right on the same flex row. ⌘K activates global search.
2. **Three selectable section items: Conversations / Work / Knowledge** (in that order). Exactly one is active at a time. The active item's icon is `--text-primary` (elevated surface treatment); inactive icons are `--text-tertiary`.
3. **Separator** (`--border-subtle`).
4. **Shared fast-nav list** — one list below the separator showing the head ("top N that fit") of the currently-active section's items. For Conversations: recent threads. For Work: teams. For Knowledge: knowledge items. The list **swaps** when a different section is selected — there is one shared region, not three stacked lists.
5. **Settings** pinned at the bottom (gear icon + label), separator above, same active/hover grammar as the section items.

**Navigation grammar (uniform across all three sections):**
- **Selecting a section item** → marks it active + swaps the fast-nav list + **navigates `<main>` to that section's overview** (`/conversations`, `/work`, `/knowledge`).
- **Clicking a fast-nav item** → navigates directly to that specific subpage (`/conversations/:id`, `/work/team/:id`, `/knowledge/:id`).
- **One exception (AD3, preserved):** Work with exactly 1 team lands directly on `/work/team/:onlyId` — the Work overview short-circuits so a solo-team founder never sees a 1-row list.

**Keyboard shortcuts** `⌘1/2/3` map to Conversations/Work/Knowledge and land on their respective section overviews.

### 1.1 Settings (Overlay)

Settings opens as an overlay. Press Escape to close and return to the previous view.

Seven settings sections:

| Section | Information | Actions |
|---|---|---|
| **Profile** | Name, email | Edit name and email |
| **Org Chart** | Review routing edges between users/agents | Add, edit, delete routing edges (direct, function, team mechanisms) |
| **Credentials** | API keys and shared credentials | Add/remove credentials; desktop uses safeStorage, shared uses encrypted DB |
| **Notifications** | Per-type toggles (review, cost, blocker), quiet hours (HH:MM), per-product mute | Toggle on/off, set times |
| **Appearance** | Density (auto/compact/default/comfortable), theme (light/dark/system) | Select options |
| **Products** | Product list with active/archived status | Toggle active/archived |
| **Backend** | Current backend mode, desktop-only gate | View mode, switch button with restart warning |

---
