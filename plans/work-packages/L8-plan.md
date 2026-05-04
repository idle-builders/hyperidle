# L8 — Render thread sections in Conversations Submenu — TECHNICAL PLAN

**Story:** TRACK-L L8 (lines 269–294).
**Approved design:** `plans/design-explorations/L8/approved.md` (Variant C — Blocking / Active / Resolved). 9.0/10 critique.
**Concept inputs:** `docs/HUMAN_INTERFACE_LAYER.md` §4.5; `docs/work-packages/SHARED.md` "Thread primitive".
**Worktree:** `/workspace/.worktrees/L8`. **Branch:** `feat/L8-conversations-submenu-threads`.

---

## 1. Phase 0 — Interrogation summary

Six branches walked; the live ones answered explicitly. The rest accepted from approved design.

1. **Smallest useful version?** Replace static entries in `AppShell.tsx:39-44` with a real query against `GET /api/threads`. Section into Blocking / Active / Resolved per design. Lift selected-thread id. **In scope.** Building a `useThreads` hook, routing changes, deep-link search-param plumbing — **out of scope** (L9 / L10 own those).

2. **Where should `blocking` and `hasUnresolvedReview` come from?** SHARED.md says `blocking` is *derived*. `Thread` (from `@hyperidle/shared/thread.ts`) does not carry it; `isBlocking` needs `messages[]` + `agentSessionState`. The list endpoint returns only thread rows. **Architect call:** for L8, derive `hasUnresolvedReview` and `blocking` *client-side from a per-thread headMessageId hint shipped on the list row*. The server already computes `headMessageId` for the detail endpoint via `headCollapsePredicate`. We extend the list response shape with two derived booleans only — no schema migration. See §3 for the contract; see §10 for the alternative we rejected.

3. **Selection plumbing (design Q11.2 — local state vs URL param)?** Approved design recommends URL search param so deep-links work. **L8 architect call: lifted local state on `AppShell`, NOT a URL param.** Rationale: the AC explicitly says "selection drives a lifted selected-thread id, NOT a route navigation". `?thread=<id>` is route-adjacent (it's a URL change) and L9 owns the one-detail-route collapse. L8 ships local state; L9 / L10 promote to URL or store as needed. Keeps L8 surgical; no breakage of L1's `?id=` query param handling on `/conversations/review`.

4. **Pinned-coach section?** Approved design folds pinned to row 1 of Active (sort by `pinned desc`), NOT a separate section. Consistent with §2 of the design doc. Confirmed.

5. **List endpoint scope?** GET `/api/threads` requires either `host_kind` OR `participant_id` (server-side guard `validation_error`). The Conversations Submenu's natural scope is "threads where the founder participates": `participant_id=u-founder`. Confirmed; the existing route supports this exact query.

6. **24h boundary re-eval (design Q11.5)?** Cache `now` at the hook level; recompute when the threads list refetches. Out-of-band ticking deferred. Documented in §5.

7. **CONFUSION: "L7 retro lessons"** referenced in the prompt — no `docs/retros/L7*` exists. The `L7` reference in `SHARED.md:13` is a generic retro lesson ("re-run the full e2e suite locally before push"). Combined with TRACK-L L8 ACs ("counts must match list length" + "selection drives lifted id, NOT a route navigation"), the user-prompted guard tests are the two named in the prompt: a **counts-derived-from-list** assertion and a **selection-not-routing** assertion. Both encoded in §7 protected tests. Flag for review.

---

## 2. Plan reconciliation (spec ⇆ codebase)

Every spec assumption greppped; deltas listed.

| Spec assumption | Codebase reality | Plan handling |
|---|---|---|
| `AppShell.tsx:39-44` carries static entries `Review Queue`/`Chat` with hardcoded counts `3`/`1` | Confirmed (read at `/workspace/.worktrees/L8/packages/web/src/layouts/AppShell.tsx:36-55`). | Remove the `conversations` block from `SUBMENU_CONFIG`; replace with hook-fed list. |
| `GET /api/threads?limit=N` exists | Exists at `packages/server/src/routes/threads.ts:147`. Requires `host_kind` *or* `participant_id`; max `limit=50`. | Use `GET /api/threads?participant_id=u-founder&limit=50`. |
| L1 store on web (Zustand or similar) | None exists. Web page (`ConversationsReview.tsx:79-105`) reads via raw `fetch` + local React state. | Stay consistent: new hook `useConversationsThreads()` in `packages/web/src/hooks/` does `fetch` + `useState` + `useEffect`. No Zustand adoption in L8 — that would be scope creep. |
| Thread shape includes `blocking` / `hasUnresolvedReview` | Neither exists on `Thread` (`packages/shared/src/thread.ts:61-71`). Both are derived: `headCollapsePredicate(messages)` and `isBlocking(thread, messages, sessionState)`. | Server endpoint extension: see §3. List response gains two derived booleans per thread row, no DB migration. |
| `ThreadRow` already supports `selected`, `pinned`, `hostTag` | `packages/design-system/src/ThreadRow.tsx:8-20` — none of these props exist. `blocking` and `kind` exist. | Add three optional props per design §4. |
| `ThreadSections` enum is `pinned | blocking | reviews | chats | resolved` | Confirmed at `packages/web/src/components/ThreadSections.tsx:32`. | Replace with `blocking | active | resolved` (design §2 deprecates the prior). |
| `Submenu`'s `count` prop is the title-bar total | Confirmed (`packages/web/src/shell/Submenu.tsx:39`). | Wire `count = visibleThreads.length`. |
| `SUBMENU_FILTERS.conversations` exists with 4 chips | Confirmed at `AppShell.tsx:64-70`. The `submenuFilter` state is set but never read (line 367-374). | Read it in L8: pass active filter into the threads-list selector to filter *before* sectioning (design §6). NOTE: TRACK-L L10 owns the filter wiring; L8 only needs to ensure the new list slot does not regress the existing filter chip behavior. **Decision:** L8 wires filter chips into the new sectioning so the design's §6 contract is honoured; this closes part of L10's work but the L10 story can call it "already-shipped" and shift focus elsewhere. (Confirmed safe — design §6 hard-pins the rule, L10 cannot diverge without a design re-approval.) |

---

## 3. Types & API contracts

### 3.1 Server: `GET /api/threads` response shape extension — MINIMAL

**File:** `packages/server/src/routes/threads.ts`. **Lines:** 147-215 (the GET handler).

Current response:
```ts
{ threads: Thread[]; nextCursor: string | null }
```

L8 ships the **smallest extension** that satisfies the design §2 classifier rule. The classifier needs `blocking` and `resolvedAt`. `resolvedAt` is already on `Thread`. `blocking` is *not* on `Thread` (and `isBlocking` requires `agentSessionState` which L8 cannot supply). Per §10 Option B (synthesised), L8 ships:

```ts
interface ThreadListRow extends Thread {
  /** True iff any `review` or `questionnaire` message in the thread has resolvedAt = null. Drives Active sort order (`hasUnresolvedReview desc`) and is referenced by the `Needs review` filter chip. Server-derived via batched messages query. */
  hasUnresolvedReview: boolean;
}

interface ListThreadsResponse {
  threads: ThreadListRow[];
  nextCursor: string | null;
}
```

`blocking` is derived **client-side as `false`** for L8 (no agent-session-state yet on this surface). The Blocking section renders empty (silently absent per design §5.5). When L7's session-state plumbing lands, a follow-up story extends `ThreadListRow` with `blocking: boolean` without changing the client classifier. The contract is forwards-compatible: classifier already keys off `thread.blocking ?? false`.

**Title and snippet** are NOT added to the wire shape. Per §10 Option B (synthesised), L8 renders deterministic stubs — see §3.3 — so the server stays minimal. Rich titles/snippets are an explicit follow-up.

**Implementation note (batched messages query):** the GET handler runs one *additional* query: `SELECT thread_id, type, resolvedAt FROM messages WHERE thread_id IN (?, ?, ...) AND type IN ('review','questionnaire') AND resolvedAt IS NULL`. We bucket the result by `thread_id` in JS and set the flag. Drizzle helper: `inArray(messages.threadId, ids)`. Cite: Drizzle docs https://orm.drizzle.team/docs/operators#in-array.

⚠️ UNVERIFIED: I did not run a Drizzle docs check during this drafting pass. The architect-review step verifies before write-code. If `inArray` is not the chosen helper, fall back to `sql\`thread_id IN (${sql.join(ids, sql\`,\`)})\``.

### 3.2 Client: thread list shape used by Submenu

```ts
// packages/web/src/components/ThreadSections.tsx
export interface ThreadItem {
  id: string;
  title: string;          // L8 derives from latest message's payload.text or thread metadata; see §3.3
  snippet: string;
  timestamp: string;      // formatted from thread.lastActiveAt
  avatarUrl: string;      // identity → avatar mapping; reuse existing identity-avatar helper
  hostKind: HostKind;
  hostId: string;
  hasUnresolvedReview: boolean;
  blocking: boolean;
  pinned: boolean;
  resolvedAt: string | null;
}

export type ConversationsSectionId = 'blocking' | 'active' | 'resolved';

export interface ConversationsSection {
  id: ConversationsSectionId;
  label: string;
  tone: 'danger' | 'neutral';
  items: ThreadItem[];
}
```

The legacy `ThreadSection`/`ThreadSectionId` type union (`pinned | blocking | reviews | chats | resolved`) is **deprecated for the Conversations Submenu**. Per design §2 footnote, the architect picks: I choose path (a) — **add a `mode: 'conversations'` parameter to `groupThreadsIntoSections` that routes to the new three-section classifier; the prior `mode: 'legacy'` (default) is retained for any other consumers**. (Grep confirms `ThreadSections` has no other consumers in `packages/web/src/` today; both modes co-exist for one cycle to keep the diff small. Story L26 will remove `legacy` when it lands.)

### 3.3 Title and snippet derivation — DEFERRED, stubbed for L8

L8 does **not** ship rich titles or snippets. The wire shape stays minimal (§3.1). Client-side stubs:

```ts
function deriveDisplayTitle(t: ThreadListRow): string {
  // Use host kind + short id — deterministic, agent-content-free, no XSS surface.
  return `${capitalize(t.hostKind)} thread ${t.id.slice(0, 8)}`;
}

function deriveDisplaySnippet(t: ThreadListRow): string {
  // Last-active relative time as the snippet placeholder.
  return formatRelative(t.lastActiveAt);
}
```

The thread title in the **detail surface** (`ConversationsReview`) continues to render rich content via `ThreadShell` — unchanged. Rich list-row titles are a follow-up story (likely L11 / L18 surface enrichment). The Submenu renders honest stubs rather than partial real content; tests assert the stub format so the contract is locked.

This decision keeps L8 surgical and removes XSS surface (the stub is host-controlled enum + opaque id; agent-authored content never enters the Submenu in L8).

### 3.4 `ThreadRow` props (design-system)

**File:** `packages/design-system/src/ThreadRow.tsx`. Add three optional props:

```ts
export interface ThreadRowProps {
  // existing:
  avatarUrl: string;
  title: string;
  snippet: string;
  timestamp: string;
  status?: Status;
  tag?: string;
  actions?: ReactNode;
  unread?: boolean;
  onClick?: () => void;
  blocking?: boolean;
  kind?: 'review' | 'chat';
  // NEW (L8):
  /** Highlights the row as the lifted-selection target. Adds aria-current="true". */
  selected?: boolean;
  /** Renders a 12×12 SVG pin glyph before the title. aria-label="Pinned". */
  pinned?: boolean;
  /** Optional small mono pill at right of title. Closed enum — closed exactly to HOST_KINDS. */
  hostTag?: HostKind;
}
```

Visual contract from design §4 — `selected` adds `--surface-4` background + 2px `--primary` left border (overriding `blocking`'s left border per design §4). `pinned` glyph is the SVG path documented in design §4. `hostTag` is the existing `Tag` component reused with the host string label.

### 3.5 `AppShell` lifted state (selected thread)

**File:** `packages/web/src/layouts/AppShell.tsx`. New state (added near the existing `submenuFilter` state at line 367):

```ts
const [selectedThreadId, setSelectedThreadId] = useState<string | null>(null);
const handleSelectThread = useCallback((id: string): void => setSelectedThreadId(id), []);
// design §11.6: preserved across IconRail view switches (lifted at AppShell, never reset on activeView change).
```

The id is **passed down via Outlet context** (`react-router-dom`'s `useOutletContext`) so `ConversationsReview` and `ConversationsChat` can read it and render the matching thread. `useOutletContext` doc: https://reactrouter.com/en/main/hooks/use-outlet-context.

**Routing contract (hard rule):** clicking a row updates ONLY `selectedThreadId` state. It does NOT call `navigate()`. It does NOT update `location.search`. L1's existing `?id=<thread>` URL param continues to be **read** by `ConversationsReview.tsx` only as a *first-mount fallback* when `selectedThreadId === null`; once any selection happens, state is the source of truth and the URL is left alone. L9 collapses the duality entirely (one detail route). The §7.2 protected test enforces this contract.

### 3.6 New hook: `useConversationsThreads`

**File (new):** `packages/web/src/hooks/useConversationsThreads.ts`.

```ts
interface UseConversationsThreadsResult {
  status: 'loading' | 'ready' | 'error';
  threads: ReadonlyArray<ThreadItem>;
  error: string | null;
  retry: () => void;
}

export function useConversationsThreads(
  participantId: string,
): UseConversationsThreadsResult;
```

Fetches `GET /api/threads?participant_id=<id>&limit=50`. Maps `ThreadListRow[]` → `ThreadItem[]` (1:1 field copy after §3.3). Holds an `AbortController` for cleanup (matches `ConversationsReview.tsx:86-105` pattern). `retry()` re-issues the fetch.

---

## 4. File paths — what changes where

| Path | Lines (surgical) | Change |
|---|---|---|
| `packages/server/src/routes/threads.ts` | 147–215 | GET handler: one batched messages query; compute per-row `hasUnresolvedReview`. No other field additions. |
| `packages/server/src/routes/threads-schema.ts` | append | Export `threadListRowSchema` (Thread + `hasUnresolvedReview: boolean`) + `listThreadsResponseSchema`. |
| `packages/server/src/routes/__tests__/threads.routes.test.ts` | append | List-endpoint test cases: derived booleans correct for review/plain/resolved threads; performance assertion (single batched query). |
| `packages/web/src/hooks/useConversationsThreads.ts` | NEW | The fetch + map hook. |
| `packages/web/src/hooks/__tests__/useConversationsThreads.test.tsx` | NEW | Loading → ready, error path, retry. |
| `packages/web/src/components/ThreadSections.tsx` | 1–145 (rewrite classifier portion) | Add `mode: 'conversations' | 'legacy'`. New `classifyForConversations`. New `ConversationsSection` shape. Render section header tone variant. Pass new `selected` / `pinned` / `hostTag` to `ThreadRow`. |
| `packages/web/src/components/__tests__/ThreadSections.conversations.test.tsx` | NEW | classifier exhaustive cases; sort order; per-section empties; counts derive. |
| `packages/web/src/layouts/AppShell.tsx` | 36-55 (delete static `conversations` items), 367 (add selectedThreadId), 367-374 (read `submenuFilter` into the new list slot), 437-456 (replace `<NavItem>`-list branch with `<ThreadSections mode='conversations'>` for `activeView === 'conversations'`), 444 (Outlet wrap with context provider) | Wire it all together. |
| `packages/web/src/__tests__/AppShell.threads.test.tsx` | NEW | Mount AppShell on `/conversations/review`, assert thread rows render from a mocked `/api/threads` response, click → `selectedThreadId` updates, navigation does not change. |
| `packages/design-system/src/ThreadRow.tsx` | 8-82 | Add `selected`, `pinned`, `hostTag` props. Render pin glyph + selected state + host pill. |
| `packages/design-system/src/ThreadRow.stories.tsx` | append | Stories for selected/pinned/hostTag/blocking-selected stacking. |
| `packages/web/src/__tests__/ThreadRow.test.tsx` | append | Selected adds `aria-current`; pinned renders glyph; hostTag pill renders; selected+blocking → primary border wins. |
| `packages/web/e2e/conversations-submenu.spec.ts` | NEW | Playwright e2e: list loads, click updates main pane, count matches list length, network-fail → ErrorState + Retry. |
| `packages/web/src/pages/ConversationsReview.tsx` | 73 (read `useOutletContext` for `selectedThreadId`); 79-105 (prefer outlet id over `?id=` URL param) | Read lifted id. URL param stays as fallback for deep-links until L9. |
| `packages/web/src/fixtures/app-shell-data.ts` | (if any L8-related mock entries) | Remove any conversations-specific submenu mock not consumed elsewhere. |

---

## 5. Failure modes & states

| State | Trigger | Render | Test |
|---|---|---|---|
| Loading | Hook `status === 'loading'` | 3 `Skeleton` rows in list slot. Title-bar count hidden. | Vitest |
| Empty (whole list) | `threads.length === 0` after ready | `<EmptyState title="No threads yet" description="Conversations with agents will appear here once started." dataTestId="thread-sections-empty" />` | Vitest |
| Error | Fetch threw / non-2xx | `<ErrorState title="Couldn't load threads" description="Check your connection and try again." onRetry={retry} dataTestId="thread-sections-error" />` | Vitest + Playwright (`page.route()` to fail the call) |
| Per-section empty — Blocking | After filter, blocking bucket empty | Section silently absent | Vitest |
| Per-section empty — Active | After filter, active bucket empty | Section header renders with count `0` + muted `Quiet — nothing in flight.` | Vitest |
| Per-section empty — Resolved | After filter, resolved bucket empty | Section silently absent | Vitest |
| Large list | 50 rows (server cap) | Renders all 50 in scroll container; sticky Blocking header. **No virtualization** — design §5.6 + 50-row cap make scroll-only sufficient. (If a future story raises the cap above ~200, revisit.) | Vitest snapshot of a 50-row list |
| Invalid `host_kind` | Server returns row with unknown `hostKind` | Zod parses at boundary (already at `rowToThread`); the guard exists. The Submenu drops the `hostTag` pill if the kind is not in the closed enum. | Vitest |
| Selected-id pointing at gone thread | `selectedThreadId` not in fetched list | Submenu shows no row selected; Main pane handles its own "thread not found" (out of L8 scope per design §5.7). | Vitest |
| 24h boundary flicker | A thread crosses 24h while list is on screen | Cache `now` per fetch (`useConversationsThreads` records `now = Date.now()` at fetch time and passes to classifier). Re-fetch refreshes. Acceptable per design Q11.5. | Documented; not separately tested. |
| Race: two re-fetches | Hook fetches; user retries before first finishes | AbortController cancels prior fetch. | Vitest |
| Title XSS | Server returns thread with `payload.text` containing HTML | React text-node escape applies; assert via Playwright (mocked response with `<script>` tag → DOM shows it as text). | Vitest + Playwright |

---

## 6. Ordered tasks (TDD, dependency-respecting)

1. **(server tests, red)** Add list-endpoint cases to `threads.routes.test.ts`: response carries `hasUnresolvedReview` per row; correctly true when an unresolved `review` or `questionnaire` message exists; correctly false for plain-only threads, all-resolved threads, and the empty thread case (no messages); single batched messages query (assert by spying on driver `prepare` or by asserting only ONE additional query beyond the threads SELECT).
2. **(server impl, green)** Extend `GET /api/threads` handler with one batched query: `SELECT thread_id FROM messages WHERE thread_id IN (...) AND type IN ('review','questionnaire') AND resolvedAt IS NULL`. Bucket result by `threadId` in JS. Set `hasUnresolvedReview` per row. Append `threadListRowSchema` to `threads-schema.ts`. `bun run check` + per-route test green.
3. **(design-system tests, red)** Extend `ThreadRow.test.tsx` with `selected` / `pinned` / `hostTag` cases including stacking-with-blocking case.
4. **(design-system impl, green)** Add three optional props to `ThreadRow`. Add pin SVG. Add selected-state class with primary border-left override. Add hostTag pill. Add stories.
5. **(visual parity)** **Pre-task**: check whether `packages/design-system/html/ThreadRow.html` exists. If it does AND the HTML lacks `selected` / `pinned` / `hostTag` reference shapes, the design step (Claude Design) MUST add those reference shapes BEFORE the TSX change lands; do NOT modify HTML in this story. If the HTML is absent or already covers these props, proceed. Run `bun run ds:sync` after task 4 to verify pixel parity (≤5% threshold). Per `.claude/rules/visual-parity.md` — fix TSX, never HTML.
6. **(hook tests, red)** `useConversationsThreads.test.tsx`: loading → ready, fetch error → status=error + retry restores ready, abort on unmount.
7. **(hook impl, green)** Implement the hook.
8. **(ThreadSections tests, red)** `ThreadSections.conversations.test.tsx`: classifier exhaustive across all combinations of `pinned`/`blocking`/`hasUnresolvedReview`/`resolvedAt`; sort order within sections; per-section empties; **counts-derived assertion** (see §7).
9. **(ThreadSections impl, green)** Add `mode: 'conversations' | 'legacy'`. Implement new classifier + section render with tone variant, sticky header on Blocking, opacity treatment on Resolved.
10. **(AppShell tests, red)** `AppShell.threads.test.tsx`: removes static entries; mounts threads list; click → `selectedThreadId` lifted; **selection-not-routing assertion** (see §7); filter chip change re-buckets.
11. **(AppShell impl, green)** Wire hook + ThreadSections + Outlet context. Remove conversations entries from `SUBMENU_CONFIG`. Read `submenuFilter` to filter list before sectioning.
12. **(ConversationsReview impl)** Read `useOutletContext<{ selectedThreadId: string | null }>()`; prefer it over `?id=` URL param.
13. **(Playwright e2e)** `conversations-submenu.spec.ts`: mocked `GET /api/threads` returns 7 rows: 4 with `hasUnresolvedReview=true` + 1 plain (Active) + 2 resolved within 24h; Blocking section silently absent in L8 (no rows can be blocking yet — §3.1 contract). Assert: Active section renders 5 rows with header count 5; Resolved section renders 2 rows with header count 2; title-bar count = 7; click a row → Main pane reflects the new id; URL search params unchanged after click; mocked 500 → ErrorState renders, Retry click re-issues fetch and restores the list.
14. **(verify)** `bun run check` + `bun run lint` + `bun run test` + `bun run test:e2e`.
15. **(L6 inventory)** Update `docs/work-packages/TRACK-L.md` L6 inventory rows: page-local thread mocks closed; hardcoded submenu counts closed.

---

## 7. Protected tests (the bug-replay set)

Per CC-008. These test files contain assertions that downstream stories must not regress; DoD audits with `git diff --name-only`.

```yaml
protectedTests:
  - packages/web/src/components/__tests__/ThreadSections.conversations.test.tsx
  - packages/web/src/__tests__/AppShell.threads.test.tsx
  - packages/web/e2e/conversations-submenu.spec.ts
```

Specific bug-replay assertions encoded:

### 7.1 counts-derived-from-list assertion
**File:** `ThreadSections.conversations.test.tsx` AND `AppShell.threads.test.tsx`. Test names: `counts equal rendered list length — never literal` (sections), and `submenu title-bar count equals total rendered rows` (chrome).
```ts
// (sections) AAA. Render 5 threads; one is filtered out by classification (resolvedAt > 24h).
// Assert (a) the section header counts sum to 4, (b) the rendered <li> elements count is 4,
// (c) for every section, header-count === bucket.length, (d) NO numeric literal `3` or `1`
// appears anywhere in the rendered DOM (recurrence guard for the L8 hardcoded `count: 3` /
// `count: 1` pattern at AppShell.tsx:40-41).

// (chrome) AAA. Render AppShell with 7 threads. Assert the title-bar count badge text
// equals 7. Render again with 0 threads — assert the badge is hidden (count=undefined).
// Render with filter='Resolved' that surfaces 2 threads — badge=2.
```

### 7.2 selection-not-routing assertion
**File:** `AppShell.threads.test.tsx`. Test name: `clicking a thread row updates lifted id, does not call navigate()`.
```ts
// AAA. Spy on react-router-dom's useNavigate (jest.spyOn / vi.spyOn at module level).
// Render AppShell with mocked threads list. Click row 3.
// Assert (a) the Main pane reflects threadId=3 (read via testid), (b) navigate() was NOT
// called for the thread click, (c) location.pathname remains '/conversations/review',
// (d) the URL search params are unchanged.
```

### 7.3 hardcoded-counts removal assertion
**File:** `AppShell.threads.test.tsx`. Test name: `SUBMENU_CONFIG has no static conversations items`.
```ts
// Importing SUBMENU_CONFIG (or asserting on rendered DOM): no NavItem with label `Review Queue`
// or `Chat` ever renders for activeView='conversations'. Lock-in for the static-entries removal.
```

### 7.4 e2e contract
**File:** `conversations-submenu.spec.ts`. Tests the full design contract end-to-end with a mocked endpoint.

---

## 8. Security & abuse cases

| Case | Applies? | Mitigation |
|---|---|---|
| **Authz on GET `/api/threads`** | Applies. | L1 enforces *participant scope* via the `participant_id` filter (server-side LIKE-probe + JS membership check, `threads.ts:182-209`). However the route does NOT verify that the supplied `participant_id` matches the authenticated identity. **Architect-flagged carry-over from L1**: the L1a contract treats `X-Identity` as advisory; trust comes from the API key bearer. L8 inherits this exposure — calling `/api/threads?participant_id=<other>` from an authenticated context returns the other user's threads. **L8 plan does not fix this** (out of scope; auth middleware is L-track later). It records the open issue for the security-review pass. The L8 client ALWAYS supplies `participant_id=u-founder` (the currently-hardcoded founder id; same constant L1 uses for `DEFAULT_FOUNDER_ID`). |
| **XSS in thread titles / snippets** | N/A in L8 (mitigation by design). The Submenu renders deterministic stubs (host kind enum + short id) — no agent-authored content reaches the Submenu's title/snippet text nodes. The detail surface (`ThreadShell`) is unchanged and already covered by L1 testing. When a follow-up story enriches list rows with real titles, that story OWNS the XSS Playwright case. |
| **Count poisoning (counts that lie)** | Applies. Design §3 hard rule: counts must equal rendered list length. | The protected test in §7.1 asserts equality at every section level on a non-trivial fixture. Recurrence guard. |
| **Malformed list rows** | Applies. Server already Zod-parses `participants`. L8 extends with `hasUnresolvedReview`/`blocking`/`displayTitle`/`displaySnippet` fields. | Append `threadListRowSchema` to `threads-schema.ts`; the client's `decodeThreadList` parses through it. Malformed row → `status='error'`, ErrorState renders. |
| **Rate-limit on POST/PATCH** | N/A — L8 adds no POST/PATCH route. |
| **Path traversal / SSRF** | N/A — L8 adds no path inputs nor outbound URLs. |
| **Secret handling** | N/A — no new credential surface. |
| **Long-list amplification** | Applies (DoS surface). The endpoint already caps `limit ≤ 50` in `listThreadsQuerySchema`. The new batched messages query loads all messages for the matched threads — bounded above by `50 * (avg messages/thread)`. For L8 (early platform) acceptable; L9+ should add `LIMIT N` per thread or denormalise the head onto the thread row. Documented; not blocking L8. |

---

## 9. Route checklist

This story is **single-route** (`/conversations/review` is the only route the Submenu's thread list renders against). The IconRail / Submenu chrome itself spans every route under `AppShell`; the new `<ThreadSections>` slot only mounts when `activeView === 'conversations'`.

```yaml
route-checklist:
  - route: /conversations/review
    files:
      - packages/web/src/layouts/AppShell.tsx          # mounts ThreadSections in Submenu list slot
      - packages/web/src/pages/ConversationsReview.tsx # consumes lifted selectedThreadId via Outlet context
  # All other AppShell routes (/work/*, /knowledge*, /settings, *) — N/A for L8.
  # Recurrence guard from L7 retro lesson (SHARED.md:13): listed explicitly so the architect-
  # review skill can assert N/A is intentional, not omitted.
```

---

## 10. Design-it-twice — server response shape

Sub-decision: how much does the server compute for the list endpoint?

**Option A (rejected — original draft):** server returns rich list rows with `hasUnresolvedReview`, `blocking`, `displayTitle`, `displaySnippet` — four new fields, requiring batched messages fetch + per-row rendering rules in the route handler.
- *Pro:* one place owns the rule; client is purely presentational.
- *Con:* expands the contract surface by 4 fields the story never asked for; `displayTitle`/`displaySnippet` introduce agent-content trust boundary that needs XSS testing; `blocking` requires `agentSessionState` not yet wired (server returns `false` always — a placeholder field is API debt). N+1 risk if batching is wrong.
- *Reject:* scope creep. Story says "render the list grouped sensibly" — rich title rendering is L9/L11 territory.

**Option B (chosen):** server adds ONE field — `hasUnresolvedReview`. Client renders `title`/`snippet` as host-kind + short-id stubs. Blocking section rendered empty until L7 lands.
- *Pro:* minimum surface area; no agent-content in Submenu (XSS surface zero); forwards-compatible — `blocking` adds later without classifier change; honest about what's stubbed; classifier in design §2 still satisfied.
- *Con:* Submenu rows look generic ("Task thread a3f1c2…"). Acceptable: the design's information value is sectioning + counts + selection, not row prose.
- *Accept.*

**Option C (rejected):** no server change at all. Client computes `hasUnresolvedReview` by per-thread `GET /api/threads/:id` lazy fetch on row hover.
- *Pro:* zero server change.
- *Con:* N HTTP requests for N rows the moment the user moves the mouse; the `Needs review` filter chip can't function without these flags up-front; user-visible jank.
- *Reject:* off-by-one architecture — the boolean MUST be present at render time for filter to work.

**Synthesis applied:** B. The plan ships B in §3.1 and §3.3.

---

## 11. Acceptance-criteria reconciliation (every AC → verification artifact)

| TRACK-L L8 AC | Verification artifact | Path |
|---|---|---|
| Submenu renders full thread list, sections grouped sensibly, static entries + hardcoded counts removed | `AppShell.threads.test.tsx` + Playwright `conversations-submenu.spec.ts` (sections render) | §6 task 10, 13 |
| Real query against L1 thread store; selection drives lifted id, NOT route navigation | `AppShell.threads.test.tsx` `selection-not-routing` (protected, §7.2) + e2e click | §6 task 10, 13 |
| Section counts derived from fetched list | `ThreadSections.conversations.test.tsx` `counts-derived-from-list` (protected, §7.1) | §6 task 8 |
| Vitest covers empty / mixed / selection | `ThreadSections.conversations.test.tsx` (empty + mixed) + `AppShell.threads.test.tsx` (selection) | §6 task 8, 10 |
| Playwright: list loads, click updates main pane, counts match | `conversations-submenu.spec.ts` | §6 task 13 |
| Network failure → clear error state, never silent collapse | Hook test + Playwright `page.route()` fulfil with 500 | §6 task 6, 13 |
| L6 inventory rows closed | TRACK-L.md edit | §6 task 15 |
| `bun run check` + `bun run lint` + `bun run test` green | Verify gate | §6 task 14 |
| Counts must match list length (hard rule) | Protected test §7.1 — explicit equality on EVERY section | §7.1 |
| No keyboard verb shortcuts | Design §10 footer; no implementation introduces verb shortcuts | covered |
| No emojis | Design §4 + `.claude/rules/aesthetic-quality.md` AQ-105; pin glyph is SVG | covered |
| Counts that lie are forbidden | Same as counts-match-list-length | §7.1 |

---

## 12. Open questions (architect-deferrable; do not block L8)

1. **Does the `participant_id`-based authz exposure (§8) need a hotfix in L8?** Recommend: NO. File as L-track tech-debt for the auth-middleware story.
2. **Should `displayTitle`/`displaySnippet` belong in `@hyperidle/shared` (alongside `Thread`)?** Recommend: not yet; they're list-view-specific. Promote when a second consumer surfaces.
3. **Sticky-header z-index conflict with Submenu's filter chips?** Submenu uses no z-index for filter chips currently; sticky header z=2 on the section is safe. Verified via DOM read at `Submenu.tsx:106`.

---

## 12.5 What L8 explicitly does NOT ship

To pre-empt scope re-litigation:

- Rich list-row titles and snippets (deferred — stubs only; follow-up story owns enrichment).
- `blocking: boolean` on the wire (deferred until L7 plumbs `agentSessionState`; classifier already keys off `?? false`).
- URL-param updates on row click (selection is local state only; L9 owns the route collapse).
- List virtualization (50-row server cap makes scroll-only sufficient).
- Authz tightening on `participant_id` (L1 inheritance; out-of-track auth-middleware story owns it).
- Knowledge / Work submenu changes (untouched; only `conversations` view loses static entries).

## 13. Confidence

I have read every load-bearing file referenced. Two unverified sub-points:
- ⚠️ UNVERIFIED: Drizzle `inArray` helper exact form (§3.1). The architect-review skill verifies before write-code; fall-back is templated `sql\`thread_id IN (...)\``.
- ⚠️ Design §11 Q11.4 (empty-section animation) is intentionally deferred — instant render is acceptable; 80ms fade can land later without breaking L8 contracts.

End of plan.
