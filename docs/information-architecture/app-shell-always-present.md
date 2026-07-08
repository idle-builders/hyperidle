# App Shell (Always Present)

The shell is the fixed frame around every view: **Sidebar | Main**, two columns only (`packages/web/src/layouts/AppShell.tsx` — Sidebar plus the routed `<Outlet>`). It provides:

1. **View switching** — navigation between Conversations, Work, and Knowledge
2. **Per-section fast-nav** — the head of the active section's items (threads / teams / knowledge items), swapping when a different section is selected
3. **Main content** — the active view's content
4. **Ambient awareness** — blocking counts, triage counts, and unread notifications visible without leaving the current view

For the end-user walkthrough of this surface, see [guides/user/the-interface](../guides/user/the-interface.md). For the Sidebar as a component (tiers, composition), see [ui-design/our-components](../ui-design/our-components.md).

## 1. Sidebar layout (SidebarV2, shipped AD9)

`packages/web/src/shell/Sidebar.tsx`, top to bottom:

1. **Search row** — a `SearchField` spanning the sidebar width, with the **Assistant icon button** (robot glyph, `sidebar-assistant-btn`, Sidebar.tsx:243) immediately to its right on the same flex row. ⌘K activates global search (`hooks/useCommandK.ts`).
2. **Three selectable section items: Conversations / Work / Knowledge** (in that order). Exactly one is active at a time. The active item's icon is `--text-primary`; inactive icons are `--text-tertiary` (Sidebar.tsx:154, 196-207).
3. **Separator** (`--border-subtle`).
4. **Shared fast-nav list** — ONE list region below the separator showing the head of the currently-active section's items; it **swaps** when a different section is selected — never three stacked lists (Sidebar.tsx:484-588). Conversations: recent threads (max 5). Work: teams — suppressed entirely when there are fewer than 2 teams (AD3 AC-1, Sidebar.tsx:538). Knowledge: knowledge items (max 5).
5. **Footer strip** pinned at the bottom, separator above: a **Notifications button** (`sidebar-notification-btn`, opens the NotificationPopover; AF8) and the **Settings gear** — icon-only, no visible label ("Settings" text renders only in the sidebar body when settings is open; Sidebar.tsx:358-360).

Cost burn is **not** surfaced in the shell — team burn vs cap lives on the WorkTeam page.

### 1.1 Badges

- **Conversations** section header carries a numeric blocking-count badge (`conversations-blocking-badge`).
- **Knowledge** section header carries a triage-count badge for draft + needs_human items (`knowledge-triage-badge`).

Both testids are set conditionally on a single `<span>` element via a ternary on `view` (`Sidebar.tsx:209-222`).
- **Notifications footer button** shows a red unseen-notification dot (`notification-unread-dot`, Sidebar.tsx:318). Notification behavior itself: [human-interface-layer/notification-primitive](../human-interface-layer/notification-primitive.md).

## 2. Navigation grammar

Uniform across all three sections:

- **Selecting a section item** → marks it active + swaps the fast-nav list + navigates `<main>` to that section's overview (`/conversations`, `/work`, `/knowledge`).
- **Clicking a fast-nav item** → navigates directly to that subpage (`/conversations/:threadId`, `/work/team/:teamId`, `/knowledge/:knowledgeId`).
- **One exception (AD3/AC11):** Work with exactly 1 team lands directly on `/work/team/:onlyId` — `WorkOverview.tsx:194-196` short-circuits with a redirect so a solo-team founder never sees a 1-row list.

Cross-view edges (what links to what across the three views): [cross-view-navigation-map](./cross-view-navigation-map.md).

## 3. Routes

`packages/web/src/router.tsx`, all inside the shell layout:

| Route | Page |
|---|---|
| `/conversations` | Conversations list |
| `/conversations/:threadId` | Conversation detail |
| `/work` | WorkOverview (flat attention-sorted team list) |
| `/work/team/:teamId` | WorkTeam |
| `/work/routine/:routineId` | WorkRoutine |
| `/work/bet/new` | WorkBetCreate (full page — no dialog) |
| `/work/bet/:betId` | WorkBet detail |
| `/work/bet/:betId/task/:taskId` | WorkTask |
| `/work/bet/:betId/review/:reviewId` | ReviewPage |
| `/agents/:agentId` | AgentProfile |
| `/knowledge` | KnowledgeList |
| `/knowledge/new` | KnowledgeCreate |
| `/knowledge/:knowledgeId` | KnowledgeDetail |
| `/artifacts/:id` | ArtifactPermalink |
| `/settings` | Redirect → `/conversations?settings=open` (L9) |
| `*` | NotFound (standalone, outside the shell) |

Legacy redirects: `/work/portfolio` → `/work`; `/work/product/:productId` → `/work/team/:teamId`.

## 4. Keyboard shortcuts

Shell-level bindings, all guarded against firing while focus is in an input / textarea / contentEditable (`hooks/useNavShortcuts.ts`):

| Keys | Action |
|---|---|
| ⌘/Ctrl + 1 / 2 / 3 | Switch to Conversations / Work / Knowledge overview |
| ⌘/Ctrl + [ / ] | History back / forward |
| ⌘K | Global search |
| N | New conversation (Conversations view only — see §6) |
| Escape | Close settings overlay / RecipientPicker |

View-local shortcuts (e.g. the session dial-in toggle) are documented per view: [conversations-view](./conversations-view.md).

## 5. Settings (overlay)

Settings opens **in-shell**: the sidebar body swaps to a "Settings" heading + settings nav, and Main renders `SettingsPage`. Escape closes and returns to the previous view (P4 AC-21, `AppShell.tsx:347-368`). Deep-link `/settings` redirects to `/conversations?settings=open`.

`SettingsPage` is a **stacked single scrollable page** (content max-width 680px, no per-section tabs — W3 AC-47/AC-52) with 13 sections in order (`SettingsPage.tsx`):

Profile · Org chart · Models · Agents · Filesystems · Agent backends · Connections · Assistant · Appearance (theme only) · Credentials · Notifications (per-type mute) · Worker · Backend (mode label + desktop hint, no switch button).

Section-by-section reference: [guides/user/settings](../guides/user/settings.md).

## 6. Assistant overlay

The Assistant button in the search row opens **AssistantOverlay** (`packages/web/src/shell/AssistantOverlay.tsx`): a fixed popover at bottom-right (360px wide, max-height 70vh), backed by `/api/threads/assistant`. It deliberately does **not** close on outside clicks — the user keeps interacting with Main to attach context items while it stays open (L21); only Escape or clicking the trigger again closes it.

## 7. New conversation (N flow)

In the Conversations view, pressing **N** (outside text inputs) opens the **RecipientPicker**, which **replaces the Main outlet entirely** — there is no side panel (`AppShell.tsx:455-467, 607-626`). The picker shows each recipient's name, role tag, and live-session indicator (`components/RecipientPicker.tsx`). Selecting a recipient creates the thread; it appears in the Conversations list (U9 AC-1), and replies stream live over the WebSocket at `/api/ws`. Escape cancels the picker.
