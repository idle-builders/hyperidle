# Navigation

## Routes

| Path | Page |
|---|---|
| `/setup` | SetupFlow (first-run wizard) |
| `/` | Redirects to `/conversations` |
| `/conversations` | Thread list |
| `/conversations/:threadId` | Thread list with thread open |
| `/work` | Work overview (1-team short-circuits to `/work/team/:id`) |
| `/work/team/:teamId` | Team task board |
| `/work/task/new` | New task form |
| `/work/task/:taskId` | Task page |
| `/reviews/:reviewId` | Review page (also accepts `?threadId=`) |
| `/agents/:agentId` | Agent profile |
| `/documents` | Document list |
| `/documents/new` | New document |
| `/documents/:documentId` | Document detail |
| `/settings` | Settings (all sections, one scrollable page) |

Legacy paths `/conversations/review` and `/conversations/chat` redirect to the canonical forms.

## Open contract

Any object reference in the UI is opened through a single `OpenHandler`. The renderer never calls `navigate()` directly — it dispatches an `OpenTarget` and the page binds the handler.

Three target kinds:

- **host** — resolves to a page via `resolveHostRoute(hostKind, hostId)`. Route host kinds: `task`, `document`, `agent`, `team`. `user` and `factory` resolve to null (no navigation).
- **review** — opens at its thread's address, `/conversations/<thread>?review=<message>`.
- **session** — fires a page-supplied callback to open a session pane; no URL navigation.

Opening intent maps to presentation:
- `navigate` → full page
- `inspect` → side pane
- `act` → overlay

## Settings

`/settings` is a real route. `settingsOpen` in AppShell is derived from `location.pathname.startsWith("/settings")`, not local state. The page is one scrollable surface, max-width 720 px, with 11 sections: Profile, Org chart, Agents, Skills & rules, Plugins, Filesystems, Agent backends, Connections, Appearance, Notifications, Backend.

## Sidebar and shell parts

The sidebar Conversations entry carries a badge that counts threads with an unresolved review (not "blocking" threads — `ThreadItem.blocking` is always false in the live list).

The shell also contains:
- `NotificationPopover` — opens from the sidebar Notifications button
- `AssistantOverlay` — opens via command-K
- `ToastRegion` — transient feedback

## Back vs Up

Back returns to the previous history entry. Up moves to the parent in the object hierarchy (e.g. task → team). They are distinct — a breadcrumb provides Up; the browser button provides Back.
