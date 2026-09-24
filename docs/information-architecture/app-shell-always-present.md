# App Shell (Always Present)

The shell is the fixed frame around every view: **Sidebar | Main**, two columns only (`layers/core-ui/src/layouts/AppShell.tsx` — Sidebar plus the routed `<Outlet>`). It provides:

1. **Context switching** — four stable destinations: Notifications, Conversations, Work, and Knowledge
2. **Domain navigator** — one large region whose provisional content changes with the active domain
3. **Main content** — the active view's content
4. **Ambient awareness** — blocking counts, triage counts, and unread notifications visible without leaving the current view

For the end-user walkthrough of this surface, see [guides/user/the-interface](../guides/user/the-interface.md). For the Sidebar as a component (tiers, composition), see [ui-design/our-components](../ui-design/our-components.md).

## 1. Sidebar layout (Navigator shell)

`layers/core-ui/src/shell/Sidebar.tsx`, top to bottom:

1. **Identity and tools** — HyperIdle mark + wordmark at left; Search and Assistant remain separate accessible actions inside one compact visual group at right. ⌘K still activates global search.
2. **Four stable destinations: Notifications / Conversations / Work / Knowledge.** Desktop renders labelled rows. In the 300px phone drawer they become a four-icon strip with full accessible names. Conversations, Work and Knowledge select the active domain; Notifications retains its existing inbox behavior until its registered follow-up.
3. **Domain navigator** — the flexing, scrollable region receives most sidebar space. The shell preserves the current provisional rows (five recent threads, the team set when there are multiple teams, or five Documents). Registered domain follow-ups own the domain-specific structure, controls, canonical order and any list-page retirement.
4. **Footer** — icon-only Settings pinned at bottom right. Settings changes Main without replacing the destination strip or active domain navigator.

Desktop width is **276px**. Below the shell breakpoint, the sidebar is hidden behind **Menu** and opens as a **300px drawer**. Detail routes keep both Back and Menu so drilling into an object never strands global navigation.

Team status is **not** surfaced in the shell — that lives on the WorkTeam page.

### 1.1 Badges

- **Conversations** section header carries a numeric blocking-count badge (`conversations-blocking-badge`).
- **Knowledge** section header carries a triage-count badge for `proposed` items (`knowledge-triage-badge`).

Both testids are set conditionally on a single `<span>` element via a ternary on `view` (`Sidebar.tsx:209-222`).
- **Notifications** shows a red unseen-notification dot. Notification behavior itself: [human-interface-layer/notification-primitive](../human-interface-layer/notification-primitive.md).

## 2. Navigation grammar

Uniform across the three selectable domains:

- **Selecting a destination** → marks its domain active + swaps the provisional navigator + navigates `<main>` to that domain's current entry route (`/conversations`, `/work`, `/documents`).
- **Clicking a navigator item** → navigates directly to that object (`/conversations/:threadId`, `/work/team/:teamId`, `/documents/:documentId`). Long labels expose their full value through pointer title and accessible name.
- **One exception (AD3/AC11):** Work with exactly 1 team lands directly on `/work/team/:onlyId` — `WorkOverview.tsx:194-196` short-circuits with a redirect so a solo-team founder never sees a 1-row list.

Cross-view edges (what links to what across the three views): [cross-view-navigation-map](./cross-view-navigation-map.md).

## 3. Routes

`layers/core-ui/src/router.tsx`, all inside the shell layout:

| Route | Page |
|---|---|
| `/conversations` | Conversations list |
| `/conversations/:threadId` | Conversation detail |
| `/work` | WorkOverview (flat attention-sorted team list) |
| `/work/team/:teamId` | WorkTeam |
| `/work/task/new` | WorkTaskCreate (full page — no dialog) |
| `/work/task/:taskId` | WorkTask detail (root or subtask, any depth) |
| `/reviews/:reviewId` | ReviewPage |
| `/agents/:agentId` | AgentProfile |
| `/documents` | DocumentList |
| `/documents/new` | DocumentCreate |
| `/documents/:documentId` | DocumentDetail |
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

Settings opens **in-shell**: Main renders `SettingsPage`, while the primary destinations and selected domain navigator persist unchanged. The Settings utility is marked current; Escape closes and returns to the previous view. Deep-link `/settings` redirects to `/conversations?settings=open`.

`SettingsPage` is a **stacked single scrollable page** (content max-width 680px, no per-section tabs — W3 AC-47/AC-52) with 11 sections in order (`SettingsPage.tsx`):

Profile · Org chart · Agents · Skills & rules · Agent behavior · Filesystems · Agent backends · Connections · Appearance (theme only) · Notifications (one toggle per event, over your own subscriptions) · Backend (mode label + desktop hint, no switch button; Worker folded in, shared-mode only).

Models and Assistant are no longer standalone sections (AV2): Assistant is a row inside Agents. Model tiers moved into the built-in harness's own detail pane inside Agent backends, and went with that harness — there is no tier screen.

Section-by-section reference: [guides/user/settings](../guides/user/settings.md).

## 6. Assistant overlay

The Assistant button in the search row opens **AssistantOverlay** (`layers/core-ui/src/shell/AssistantOverlay.tsx`): a fixed popover at bottom-right (360px wide, max-height 70vh), backed by the same thread actions as any direct thread — `send_message` with `recipients: [myAgentId]` on the first message, `open_thread` after. It deliberately does **not** close on outside clicks — the user keeps interacting with Main to attach context items while it stays open (L21); only Escape or clicking the trigger again closes it.

## 7. New conversation (N flow)

In the Conversations view, pressing **N** (outside text inputs) opens the **RecipientPicker**, which **replaces the Main outlet entirely** — there is no side panel (`AppShell.tsx:455-467, 607-626`). The picker shows each recipient's name, role tag, and live-session indicator (`components/RecipientPicker.tsx`). Selecting a recipient creates the thread; it appears in the Conversations list (U9 AC-1), and replies stream live over the WebSocket at `/api/ws`. Escape cancels the picker.
