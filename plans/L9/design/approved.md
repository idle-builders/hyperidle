# L9 — Design (approved variant + considered alternatives)

## Classification: routine

L9 is **routine** under the design playbook (one-variant + considered-alternatives), not novel. Justification:

- The shell composition (IconRail | Submenu | Main | Rail) is unchanged.
- The detail body re-uses the L1 design-system `ThreadShell` primitive without modification.
- The component budget is unaffected (no new custom components; one page deletion, one rename).
- The custom states (loading, error, populated, empty) all already exist as the `SkeletonList` / `ErrorState` / `EmptyState` primitives.

The novel ingredient is the **"thread not found" empty state copy and affordance** — promoted from a raw `HTTP 404` string today to a deliberate `EmptyState` with a back-to-queue link. That's a copy + composition decision, not a new component. It is folded into the variant below.

The variant therefore covers route topology + four states; the "considered X / Y / Z" check at the end records what was rejected and why.

---

## 1. The variant — one detail surface, URL-addressed thread

### 1.1 URL topology

| URL | Renders | Notes |
|---|---|---|
| `/` | `<Navigate to="/conversations" replace />` | Index lands on the queue. |
| `/conversations` | AppShell with the Conversations Submenu populated; Main pane renders the **"Open a thread to see it here"** empty state. | The queue is the Submenu thread list, always visible at this view. |
| `/conversations/:threadId` | AppShell + `<ThreadShell>` for the thread with id `:threadId`. | Single canonical detail route. |
| `/conversations/review` | `<Navigate to="/conversations" replace />` | Legacy redirect. The old "review queue" was the same queue as today's `/conversations`. |
| `/conversations/review?id=X` | `<Navigate to="/conversations/X" replace />` (id preserved) | Legacy deep-link form. |
| `/conversations/chat` | `<Navigate to="/conversations" replace />` | Legacy redirect. |
| `/conversations/chat?thread=X` | `<Navigate to="/conversations/X" replace />` (id preserved) | Legacy deep-link form, used by `WorkTeam` + `TaskSheet`. |

Why path segment instead of query string: shareable URLs read cleaner, the id is observable in URL telemetry without parsing search params, and the `useParams<{ threadId?: string }>()` hook gives strict typing without a custom URLSearchParams decoder.

Why `replace: true` on every redirect: the back button must not bounce the user back into the legacy URL only to redirect them forward again. With `replace`, the legacy URL is overwritten in history at the moment of redirect; pressing back from `/conversations/X` goes to whatever was *before* the legacy URL. That is the spec's "preserving history" requirement read literally — preserve the user's *navigation* history, not the redirect step.

### 1.2 The page surface (Main pane)

Inside the AppShell, the Main pane behaves as four discrete states. Same wrapper element (`data-testid="conversations-page"`); the body switches.

```
┌── Main (px=var(--density-page-gutter), py=var(--density-page-gutter)) ────┐
│ State A — no id (path = "/conversations"):                                │
│ ┌────────────────────────────────────────────────────────────────────┐    │
│ │ EmptyState                                                         │    │
│ │   title:    "Open a thread to see it here"                         │    │
│ │   desc:     "Pick a thread from the list to read it."              │    │
│ │   no action button (the action is "click a row in the Submenu")    │    │
│ └────────────────────────────────────────────────────────────────────┘    │
│                                                                            │
│ State B — loading (path = "/conversations/:id", fetch pending):            │
│   <SkeletonList rows={3} ariaLabel="Loading thread" />                     │
│                                                                            │
│ State C — error (fetch errored, status != 404):                            │
│   <ErrorState title="Failed to load thread" description={message}          │
│               onRetry={refetch} />                                         │
│                                                                            │
│ State D — populated (fetch ok):                                            │
│   <ThreadShell thread messages identities artifactSlot onAppendMessage />  │
│                                                                            │
│ State E — not found (fetch returned 404):                                  │
│   <EmptyState                                                              │
│     title="Thread not found"                                               │
│     description="This thread may have been resolved, archived, or         │
│                  the link is incorrect."                                   │
│     action={<Link to="/conversations">Back to inbox</Link>}                │
│     dataTestId="thread-not-found"                                          │
│   />                                                                       │
└───────────────────────────────────────────────────────────────────────────┘
```

Notes on State E:

- The L1 `ThreadShell` is **not** mounted. There is no message list, no composer, no fixture content. This is the explicit rejection of the "editable-fallback" anti-pattern — we do not render any input that could lead a user to author a message into a non-existent thread.
- The action is a `<Link>` (semantically a navigation, not a button), styled to match `EmptyState`'s action slot.
- Copy intentionally lists the three causes the user might recognise (resolved / archived / wrong link). It does not say "404" — that is plumbing, not language.
- `data-testid="thread-not-found"` is the e2e + Vitest hook.

### 1.3 The Submenu (queue) — unchanged

L8 already shipped the live thread list as the Submenu body. L9 changes one thing: clicking a row navigates to `/conversations/:threadId` instead of mutating an Outlet-context state. The list itself, the filter chip row, the empty state, the error state, and the loading state are all out of L9's scope.

The `aria-current` highlight on the selected row continues to work because `selectedThreadId` is now derived from `useParams().threadId` instead of a `useState`.

### 1.4 Dispatch by message shape — owned by `ThreadShell` (no page-level switch)

The page does **not** branch on review-vs-chat. It hands the whole `{ thread, messages, identities }` payload to `ThreadShell`, which already decides:

- Whether a `RichMessageCard` is promoted from the message stream (the `promotedRichMessageId` rule, L11).
- Whether `ThreadHostBanner` shows the blocking indicator (from `agentSessionState`).
- Per-message rendering: `review` → `RichMessageCard`; `questionnaire` → rich-row variant; `plain` → `CommentRow`; `verdict` → terminator.
- Composer mount (always at the floor, regardless of shape).

This is the L1 contract. L9 consumes it; it does not re-implement it.

### 1.5 State coverage — what each state proves

| State | Trigger | Visible affordance | Test hook |
|---|---|---|---|
| A — empty (no id) | `/conversations` | `EmptyState` "Open a thread to see it here" | `data-testid="conversations-empty"` |
| B — loading | id present, fetch pending | `SkeletonList` rows=3 | aria-label "Loading thread" |
| C — error (network/5xx) | fetch threw or non-404 status | `ErrorState` with retry | `data-testid="thread-error"` (new) |
| D — populated | 200 OK with valid body | `ThreadShell` | `data-testid="thread-shell"` (already wired by L1) |
| E — not found | 404 | `EmptyState` "Thread not found" + link to `/conversations` | `data-testid="thread-not-found"` |

### 1.6 Density / spacing

The page wrapper carries `data-testid="conversations-page"` and uses the existing `flex flex-col h-full` shell. No new spacing tokens. No new typography. The empty / error / not-found states all sit inside the existing `EmptyState` / `ErrorState` primitives, so they inherit the tokens already audited (AQ-001 / AQ-002).

### 1.7 Copy register

| Surface | Old copy | New copy | Why |
|---|---|---|---|
| State A | "No thread selected" / "Open a review from the inbox to see it here." | "Open a thread to see it here" / "Pick a thread from the list to read it." | "Review" is no longer a noun. "Inbox" is not a canonical noun in HyperIdle. "Thread" is. |
| State E (new) | (was raw "HTTP 404" via `ErrorState`) | "Thread not found" / "This thread may have been resolved, archived, or the link is incorrect." + "Back to inbox" link | Replaces the editable-fallback risk and the cryptic HTTP code with a deliberate state. |
| State C | "Failed to load review" | "Failed to load thread" | "Review" demoted to message type; the page renders a thread, not a review. |

The "Back to inbox" link uses the user-facing word "inbox" — this is a single user-language exception; the canonical noun for the surface is still "Conversations" / "thread list". The L8 docs already use "inbox" as the user-language synonym for "the queue you triage from". If the architect prefers strict canonical "Back to thread list", either is acceptable.

---

## 2. Considered alternatives — what we did NOT pick

### X — Keep two pages, share a hook

> Extract a `useThreadDetail(id)` hook; have both `ConversationsReview.tsx` and `ConversationsChat.tsx` call it and render the same `ThreadShell`.

**Rejected because** it does not satisfy AC-1 ("one queue plus one detail surface"). Two pages mean two routes, two test surfaces, two places future agents have to keep in sync. The duality persists in the file tree, the router, the e2e specs, and the visual-compare map. The point of L9 is to delete the duality, not to factor a hook around it.

### Y — Introduce a per-shape route (`/conversations/:threadId/review`, `/conversations/:threadId/chat`)

> Use the URL to encode the dominant message shape so each shape gets its own URL.

**Rejected because** it pushes L1's internal dispatch out into the URL, where it doesn't belong. The thread shape is derived from the messages — it isn't an immutable property the user picked. Recording it in the URL means the URL changes when the agent appends a `review` message to a previously plain thread. URLs that mutate based on content are a UX hazard (they invalidate bookmarks, break sharing, race with the WS message-arrived event). Worse: every new message type would need a new route segment.

### Z — Use the query string for the thread id (`/conversations?id=…`)

> Keep the existing `?id=` shape and only delete `/conversations/chat`.

**Rejected because** the path segment is strictly better at matching React Router conventions, gives strict typing via `useParams`, and makes deep-links read like the underlying primitive (`/conversations/<thread-id>`). The only argument for keeping the query string is "no migration cost," but the migration is bounded (router table + 2 cross-view callers + the e2e specs + the visual-compare map), and we'd have to migrate anyway to consolidate `?id=` (review form) and `?thread=` (chat form) into a single param name.

### W — Render a "create new thread" composer in State A

> When no thread is selected, show a composer that lets the user start a new chat.

**Rejected because** of the L1 "no orphan threads" contract. Threads are created by a host (a bet, a task, a knowledge item). A free-form composer in the Conversations area would either need to ask the user to pick a host first (which belongs in a different surface) or create an orphan thread (which the contract forbids).

### V — Unify the redirect via a single wildcard route

> Match `/conversations/*` and inspect `useLocation()` inside a redirect component.

**Rejected because** wildcards swallow the legitimate `/conversations` and `/conversations/:threadId` cases unless very carefully ordered. Three explicit `<Navigate>` redirects are simpler, exhaustively type-checked, and cheaper to reason about. (The architect can elect to factor a small `RedirectLegacy` helper if it cuts duplication; the design does not require it.)

### U — Inline the not-found state into `ThreadShell`

> Pass `error="404"` to `ThreadShell` and have it render a "not found" state internally.

**Rejected because** `ThreadShell` is not the right home for "thread doesn't exist." It is the home for "thread exists, here is its content." Conflating "no data" with "the entity is missing" weakens the primitive's contract and forces every consumer of `ThreadShell` (web/Conversations, web/WorkBet/HostThreadSection, mobile, future surfaces) to share the same not-found copy. The page owns the not-found state because the page knows the URL the user typed.

---

## 3. State / interaction matrix (compact)

| State | URL example | Body | aria-current on Submenu | Composer reachable |
|---|---|---|---|---|
| A — no id | `/conversations` | EmptyState "Open a thread…" | none | no |
| B — loading | `/conversations/abc` (pending) | SkeletonList | the `abc` row | no |
| C — error | `/conversations/abc` (5xx) | ErrorState + Retry | the `abc` row | no |
| D — populated | `/conversations/abc` (200) | ThreadShell | the `abc` row | yes |
| E — not found | `/conversations/abc` (404) | EmptyState "Thread not found" + Back link | none (id doesn't match any row) | no |
| Legacy redirect | `/conversations/review` etc. | (replaced before render) | n/a | n/a |

---

## 4. Self-critique against the 9-dimension rubric

| Dimension | Score (0–10) | Note |
|---|---|---|
| Hierarchy | 8 | One clear primary action per state (open a thread / retry / go back). |
| Spacing | 8 | Re-uses density tokens; no new spacing introduced. |
| Typography | 8 | Re-uses primitive type scale via `EmptyState` / `ErrorState`. |
| Color | 8 | No new color use; danger reserved for actual errors (`ErrorState`), not the not-found case (which is a neutral empty, not a danger). |
| Coherence | 9 | Removes a duality; the route shape now matches the L1 primitive's shape. |
| States | 9 | Five named states with explicit hooks; the not-found state is the headline new behaviour. |
| A11y | 8 | `<Link>` for navigation, `aria-label` on skeleton, `EmptyState` already a11y-audited. |
| Anti-slop | 9 | No emojis, no marketing superlatives, no decorative icons, no purple gradients. The only anti-slop trap is over-iconification on the empty states; the design uses no icons. |
| Premium polish | 7 | Minimum-viable rather than expressive; that is the right move for routine work. |

Net: 74/90. Acceptable for routine; novel surfaces should clear ~80 with the same rubric. The biggest delta vs novel work is "premium polish" — there is no expressive moment here because the user's relationship to this surface is utilitarian (they are triaging).

---

## 5. Acceptance check (against the 6 ACs in the spec)

| AC | How this design meets it |
|---|---|
| 1 — One queue + one detail per thread; legacy URLs redirect, never 404. | §1.1 route table; legacy paths use `<Navigate replace>` with id preservation. |
| 2 — Detail surface renders whichever thread the user picked, with rich messages from L1 inline. | §1.2 State D mounts `ThreadShell` unchanged; §1.4 confirms dispatch is owned by the L1 primitive. |
| 3 — Naming collisions resolved per L1 — one canonical noun. | concept.md §2; design copy in §1.7 follows ("thread", not "review"/"chat"). |
| 4 — Vitest covers dispatch + unknown-thread fallback. | §1.5 names test hooks (`thread-not-found`, etc.); architecture writes the tests. |
| 5 — Playwright e2e: Work → click bet's thread → detail surface renders that thread. | §1.1 — the canonical URL `/conversations/:threadId` is what `WorkTeam` / `TaskSheet` will navigate to. The architecture artifact specifies the exact e2e flow. |
| 6 — `bun run check` + lint + test all green; full e2e green. | Process gate; held by builder during /write-code. |

The architecture artifact picks file names, route-table edits, redirect helper, and the ordered task list.
