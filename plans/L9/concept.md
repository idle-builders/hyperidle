# L9 — Concept: One Conversations detail surface

L9 does not introduce a new primitive. The Thread primitive (host_kind × messages) was settled in L1 and shipped with `ThreadShell` (`packages/design-system/src/ThreadShell.tsx`). L9 reshapes the **Conversations IA** so the URL topology and the page wiring agree with what L1 already says is true: there is one thread, one detail surface, and the differences live on the messages — not on the route.

This doc probes that reshape.

---

## 1. The probe — what is the "Conversations detail" now?

### 1.1 Identity (a one-line definition)

> **The Conversations detail is the single page that renders any thread the user picked from the Conversations queue, regardless of which message types the thread contains.**

It is a thin page-shaped wrapper over the L1 design-system primitive `ThreadShell`. Its job is: read the selected thread id, fetch `/api/threads/:id`, mount `ThreadShell`, handle the four page-level states (loading, error, not-found, populated). The page does not branch on review-vs-chat. `ThreadShell` already dispatches by message type (`review` → `RichMessageCard`, `questionnaire` → rich row, `plain` → `CommentRow`, `verdict` → terminator) via discriminant exhaustiveness — that is the dispatch surface, and it is owned by L1.

### 1.2 Essential properties

- **Single mount.** Exactly one route serves any thread. No per-shape routes, no per-host-kind routes.
- **Thread-id-addressed.** The thread id is in the URL path (`/conversations/:threadId`) — no longer a query string. This makes deep-links share-able and makes it observable in URL telemetry without parsing `?id=` and `?thread=` and a third synonym.
- **Empty in the absence of an id.** A bare `/conversations` is the **queue** (the Submenu thread list). The Main pane in that case shows an "Open a thread to see it here" empty state. The page is never the implicit home for a fixture.
- **Definite "not found".** A thread id that does not resolve renders an explicit `EmptyState` titled "Thread not found" with a link back to the queue. It does **not** fall through to a chat-mode mock or an editable composer. (The current `ConversationsChat.tsx` is the editable-fallback anti-pattern that the spec calls out.)

### 1.3 Rejection list — what the Conversations detail is NOT

| Not | Because |
|---|---|
| Two pages keyed by message shape | L1 already dispatches by shape inside `ThreadShell`. A second dispatch at the page layer is a parallel switch — every new message type would have to land twice. |
| A page per host kind (bet, task, knowledge_item, …) | Threads are host-agnostic from the user's perspective. Host context is rendered by `ThreadHostBanner` *inside* the shell, not by the route. |
| The fallback for "no selection" | `/conversations` (no id) is the queue; the detail's empty state is "open one." It is not a default-fixture page. |
| The home for typing a brand-new chat into a mock | The `ConversationsChat.tsx` mock fixture is removed entirely. New threads are created from a host (a bet, a task, a knowledge item) — never as orphans typed into a free-form panel. (See L1: "no orphan threads.") |
| A redirect target by query string | `?id=…` legacy deep-links redirect *once* into the canonical `/conversations/:threadId` shape. The query form is not a long-lived alias. |

### 1.4 Composition

The detail surface is composed of:

- The page route (`/conversations/:threadId?` — id optional).
- A page component (rename below) that owns: id resolution, fetch lifecycle, four states (loading / error / not-found / populated), and the empty state when no id.
- The L1 `ThreadShell` primitive (consumed unchanged) — it owns the render of the messages and the composer.
- The shared Outlet context already lifted in L8 (`AppShellOutletContext.selectedThreadId`) becomes redundant for routing **once the URL is the source of truth**. L9 makes the URL authoritative; the lifted state becomes a UI bridge for selection-without-navigation in the Submenu (kept) but no longer the primary id source for the page.

### 1.5 Lifecycle

1. User clicks a thread row in the Submenu → AppShell calls `navigate(\`/conversations/${id}\`)`.
2. The page component reads `useParams<{ threadId?: string }>()` and either: (a) shows the empty-state ("Open a thread"); (b) fetches `/api/threads/:id`, shows skeleton, then mounts `ThreadShell` on success; or (c) shows the "Thread not found" empty state on a 404.
3. Internally `ThreadShell` decides the layout (head card vs no head, verdict bar visibility) per L1's rules. The page does not.
4. Legacy URLs (`/conversations/review`, `/conversations/review?id=…`, `/conversations/chat`, `/conversations/chat?thread=…`) are matched by redirect-only routes that map to the canonical shape **with `replace: true`** so the back button does not bounce the user back into a 301 loop.

### 1.6 Authority

- **The URL is authoritative for the selected thread.** Browser history, deep-links, refresh, and cross-view callers (Work, TaskSheet) all converge on `/conversations/:threadId`.
- The L8-introduced `selectedThreadId` Outlet context remains as a UI hint for the Submenu's `aria-current`, but is *derived from the URL* once L9 lands. (Architecture decides whether to keep the context object or drop it; either is consistent with this concept.)

---

## 2. Vocabulary — one canonical noun per concept

The collision table the spec calls out:

| Word in current source | What it means today | Canonical form after L9 |
|---|---|---|
| "Conversations" | The view (IconRail tab, the area) | **Conversations** — the view name. Capitalised; user-visible. |
| "Chat" / "Chats" / "chat" | A page (`ConversationsChat.tsx`), a route segment (`/conversations/chat`), a mode in stories ("chat mode") | **Banished as a noun.** "Chat" survives only as an adjective inside `ThreadShell`'s internal layout vocabulary ("chat-shape thread" = "a thread with no unresolved review or questionnaire"). It is never the name of a page, a route segment, or a public concept. |
| "Review" / `ConversationsReview.tsx` / `/conversations/review` | A page, a component, a route segment | **Demoted to message type only.** "Review" continues to name a `Message.type` value (`review`) and the design-system `RichMessageCard`. There is no Review page. |
| "Thread" | The L1 primitive | **Thread** — the canonical noun. The page renders one thread. The route segment is `/conversations/:threadId`. The submenu list is "the thread list." |
| "thread detail" / "thread surface" | UI shorthand in docs | **Conversations detail** (formal) or **thread detail** (informal). Both legal; same referent. The shell structure docs already use "Thread Detail" — kept. |

### Naming consequence — which file names change

- `packages/web/src/pages/ConversationsReview.tsx` → **`Conversations.tsx`** (or `ConversationDetail.tsx`; architecture picks). The default export is the page component for the new canonical route.
- `packages/web/src/pages/ConversationsChat.tsx` → **deleted.** It is a stale mock-data fixture that never wired through to the L1 thread primitive. There is nothing here to migrate.
- `packages/web/src/pages/ConversationsReview.stories.tsx` → renamed alongside the component.
- `packages/web/src/pages/ConversationsChat.stories.tsx` → deleted.
- `__tests__/ConversationsChat.test.tsx`, `__tests__/ConversationsChat.chatmode.test.tsx`, `__tests__/ConversationsChat.j8.test.tsx` → deleted (they test the removed mock).
- `__tests__/ConversationsReview.dispatch.test.tsx`, `__tests__/ConversationsReview.reasoning.test.tsx`, `__tests__/ConversationsReview.test.tsx` → renamed to match the page's new name; the tests assert behaviour that is preserved (they cover the L1 dispatch path through the page, not chat-mode behaviour).

The architecture artifact picks between `Conversations.tsx` (matches the view name) and `ConversationDetail.tsx` (matches the document name "Conversations detail"). Either is canonical; the concept does not commit.

---

## 3. Contracts this commits us to

These are the load-bearing properties downstream stories will consume.

1. **One detail route per thread.** The router has exactly one route element that mounts the page. New message types do not get new routes.
2. **No per-shape page logic.** Adding a new message type adds a branch inside `ThreadShell`'s renderer (a TypeScript discriminant case), not a sibling page. The page is shape-agnostic.
3. **Thread id is a path segment.** `/conversations/:threadId`. The legacy `?id=` and `?thread=` query forms are accepted only by redirect, never used by new callers.
4. **No orphan-thread UI.** The "no thread selected" state is an empty state, not a thread-creation surface. Threads are created by a host (`bet`, `task`, `knowledge_item`, …) per L1; the Conversations area never authors them.
5. **"Thread not found" is explicit.** A 404 from `/api/threads/:id` renders an `EmptyState` that says exactly that, with a `<Link to="/conversations">` back to the queue. No editable mock, no fixture leak.
6. **Legacy URLs redirect, never 404.** Any URL that worked yesterday (`/conversations/review`, `/conversations/chat`, `/conversations/chat?thread=…`, `/conversations/review?id=…`) returns the user to the canonical form with `replace: true` so the back button is sane.
7. **Cross-view callers converge.** `WorkTeam` (currently `/conversations/chat?thread=…`), `TaskSheet` (same), and AppShell's submenu click all navigate via the canonical shape. After L9 there is exactly one `navigate("/conversations/...")` call shape used in production code.

---

## 4. What L9 deliberately leaves to other stories

- **Filter chips actually filter** — L10. The submenu's "Blocking / Async / All" chips are a separate workpackage; L9 changes the route, not the filter wiring.
- **Composer behaviour for new threads from Conversations** — never. The concept rejects this. New threads always come from a host. Anything that looks like "let me start a chat from the inbox" should be a follow-up that picks a host first (e.g. "DM agent X" → host_kind=`agent`, host_id=agentId, then the URL is the canonical `/conversations/:threadId`).
- **The URL ↔ Submenu selection sync** — covered here as a contract (URL is authoritative; the L8 Outlet context becomes derived) but the *implementation* of how `selectedThreadId` is wired (controlled vs derived) is an architecture decision.
- **Mobile form factor** — out of scope. Mobile lives in the three-tab variant (HIL §form factors); the same `/conversations/:threadId` URL pattern applies. No mobile-specific routes.

---

## 5. Open questions for the architect (not the concept)

1. Component file name: `Conversations.tsx` or `ConversationDetail.tsx`?
2. Should `selectedThreadId` Outlet context be removed or kept as a derived hint? (Recommendation: keep it for `aria-current` on the submenu row, derive it from `useParams`.)
3. Redirect-route shape: a dedicated `<RedirectLegacy />` component vs an inline `<Navigate>` per legacy path. Three legacy URL shapes need redirecting (`/conversations/review`, `/conversations/chat` plus their `?id=` / `?thread=` variants); a small helper is probably cheaper than three inline `<Navigate>`s, but architecture decides.
4. Index redirect: today `index → /conversations/review`. After L9: `index → /conversations` (queue with no thread selected) — confirm this is the desired landing.

---

## 6. Probe summary (what changes and what stays)

| Layer | Before L9 | After L9 |
|---|---|---|
| Routes | `/conversations/review`, `/conversations/chat` (siblings) | `/conversations` (queue), `/conversations/:threadId` (detail), legacy paths redirect |
| Pages | `ConversationsReview.tsx` + `ConversationsChat.tsx` | `Conversations.tsx` (single page; name TBD by architect) |
| Detail dispatch | Two pages, page-level shape selection by URL | One page; `ThreadShell` dispatches by message type internally |
| Selected thread id source | Mixed (`?id=`, `?thread=`, lifted Outlet context) | URL path (`:threadId`); Outlet context derived from URL or removed |
| "No thread" UI | Implicit fixture in `ConversationsChat`; review page shows `EmptyState` | Explicit `EmptyState` on `/conversations`; no mock fallback |
| "Unknown thread id" UI | "HTTP 404" raw error string | Explicit "Thread not found" `EmptyState` with link to queue |
| Cross-view links | `/conversations/chat?thread=:id` (WorkTeam, TaskSheet) | `/conversations/:id` |
| Vocabulary | Conversations / Review / Chat / chat / Chats compete | Conversations (view) + Thread (entity) only |

That is the reshape. The architecture artifact specifies file moves, route table, redirect shape, and ordered tasks.
