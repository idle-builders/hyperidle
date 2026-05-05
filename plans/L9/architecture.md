# L9 — Architecture

Plan for "Collapse review/chat to one detail route." Files, signatures, redirect strategy, dispatch shape, naming changes, ordered tasks. The plan is the contract the builder consumes; reviewer evaluates against it in Phase 2 (`/architecture-critique`) and Phase 4 (`/review`).

References: `plans/L9/concept.md`, `plans/L9/design/approved.md`, spec at `plans/work-packages/TRACK-L.md` lines 314–342.

---

## 1. Decisions (taken upfront so the rest reads cleanly)

| # | Decision | Resolution |
|---|---|---|
| D1 | Page filename | **`Conversations.tsx`** (default export `Conversations`). Matches the view name; one word, one concept. Rejected alternative: `ConversationDetail.tsx` — added a noun the design doesn't use. |
| D2 | Route shape | **`/conversations` (no id) and `/conversations/:threadId`** as two sibling paths under the AppShell layout. `:threadId` is required on the second; the no-id case is a separate route element. Rejected: optional segment `/conversations/:threadId?` — React Router v7 allows it but the splice between "no id" and "id present" produces clearer code as two routes. |
| D3 | Redirect technique | **`<Navigate to=... replace />`** for the three plain legacy paths. For the two query-string-bearing legacy forms (`/conversations/review?id=…`, `/conversations/chat?thread=…`), a small redirect component reads the query string and constructs the canonical path. (Inline `<Navigate>` cannot reach search params.) |
| D4 | Selected-thread-id source of truth | **`useParams<{ threadId?: string }>()`** is authoritative. The `AppShellOutletContext.selectedThreadId` field becomes **derived** from `useParams()` inside `AppShell` itself (read once via `useParams`, surfaced through Outlet for backwards compat with any consumer added between L8 and L9). Removing it entirely is a follow-up — not L9. |
| D5 | Submenu click behaviour | Clicking a row calls `navigate(\`/conversations/${threadId}\`)`. The local `useState<string \| null>(null)` for `selectedThreadId` in `AppShell` is **deleted**; the value is derived from `useParams`. |
| D6 | Cross-view callers | `WorkTeam.tsx`'s `handleNavigateToThread` and `TaskSheet.tsx`'s `handleOpenThread` (via `onNavigateToThread`) navigate to `/conversations/:threadId`. Two call sites change. |
| D7 | Index redirect | `index → /conversations` (queue, no thread). Today: `index → /conversations/review`. The settings deep-link `/settings → /conversations/review?settings=open` becomes `→ /conversations?settings=open`. |
| D8 | Page-level dispatch | None. The page does **not** branch on review-vs-chat. `ThreadShell` (L1) owns dispatch via TypeScript discriminant exhaustiveness on `Message.type`. The Vitest "dispatch" tests therefore cover (a) the page mounts `ThreadShell` for any thread shape, and (b) the not-found fallback — there is no per-shape switch in the page to test. |
| D9 | Tests on the deleted `ConversationsChat` | The four `ConversationsChat*` test files (one mock-data unit, plus `chatmode`, `j8`) and the page's stories file are **deleted with the page**. Their assertions are tied to the mock fixture, not to behaviour the new page exposes. |
| D10 | E2E for the new flow | One new spec, `packages/web/e2e/L9-single-detail.spec.ts`, holds the AC-5 flow (Work → click bet thread → detail surface renders). The legacy `conversations-surface.spec.ts` chat-page block is deleted (its describe target no longer exists). The legacy review-page block is already `test.skip`'d and is also deleted. |
| D11 | Visual-compare map | `scripts/visual-compare-map.ts` keeps its routes — every `/conversations/review` becomes `/conversations` (queue snapshot) plus, where the snapshot needs a populated detail, `/conversations/<seeded-thread-id>`. |

---

## 2. File-level changes

### 2.1 Add

| Path | Purpose |
|---|---|
| `packages/web/src/pages/Conversations.tsx` | The single page component. Replaces `ConversationsReview.tsx`. |
| `packages/web/src/pages/Conversations.stories.tsx` | Stories for the four states (no-id empty, loading, populated, not-found). |
| `packages/web/src/pages/RedirectLegacyConversation.tsx` | Tiny redirect helper that reads `?id=` / `?thread=` and emits a `<Navigate to={\`/conversations/${id}\`} replace />`. Sole responsibility. |
| `packages/web/src/__tests__/Conversations.test.tsx` | Vitest. Covers: (a) renders empty state when no `:threadId` param, (b) mounts `ThreadShell` for a fetched thread, (c) renders the not-found `EmptyState` on a 404, (d) renders the `ErrorState` on a non-404 fetch failure. |
| `packages/web/src/__tests__/RedirectLegacyConversation.test.tsx` | Vitest. Covers: (a) `?id=X` → `/conversations/X`, (b) `?thread=X` → `/conversations/X`, (c) no id → `/conversations`. |
| `packages/web/e2e/L9-single-detail.spec.ts` | Playwright. AC-5 flow + AC-1 redirect-preserves-history check + AC-2 unknown-thread fallback. |

### 2.2 Modify

| Path | Change |
|---|---|
| `packages/web/src/router.tsx` | Replace the two sibling routes (`conversations/review`, `conversations/chat`) with: `conversations`, `conversations/:threadId`, four redirect routes, plus the index redirect change. See §3. |
| `packages/web/src/layouts/AppShell.tsx` | (a) Replace `useState<string \| null>(null)` for `selectedThreadId` with a derived value from `useParams<{ threadId?: string }>()`. (b) `handleSelectThread` becomes `navigate(\`/conversations/${id}\`)`. (c) `handleViewChange` for `view === "conversations"` navigates to `/conversations` (was `/conversations/review`). (d) `handleSearchNavigate`'s `default` branch navigates to `/conversations` (was `/conversations/review`). (e) Outlet context still publishes `selectedThreadId` for backwards-compat — derived, not stateful. |
| `packages/web/src/pages/WorkTeam.tsx` | Line 168: change `\`/conversations/chat?thread=${encodeURIComponent(threadId)}\`` → `\`/conversations/${encodeURIComponent(threadId)}\``. |
| `packages/web/src/shell/TaskSheet.tsx` | Update the `@lore` comment at line 193 ("/conversations/chat" → "/conversations/:threadId"). The actual navigation is delegated through `onNavigateToThread`, which is set by `WorkTeam` (already updated). No code change beyond the lore comment. |
| `packages/web/scripts/visual-compare-map.ts` | Replace each `/conversations/review` and `/conversations/chat` with the canonical equivalent. The settings-open snapshot becomes `/conversations?settings=open`. |
| All Playwright e2e specs that hit `/conversations/review` or `/conversations/chat` | Replace with `/conversations` (or `/conversations/:id` where the test seeded an id). See §6. |
| `__tests__/AppShell.knowledge-submenu.test.tsx` | If it inspects router behaviour, the test memory router pre-populates `/conversations/review` paths — replace with `/conversations`. |
| `packages/web/src/__tests__/ConversationsReview.dispatch.test.tsx` → `Conversations.dispatch.test.tsx` | Rename (file rename via `git mv`); update import path inside. The test logic stands as-is — it tests the same page, now under a new name. |
| `packages/web/src/__tests__/ConversationsReview.reasoning.test.tsx` → `Conversations.reasoning.test.tsx` | Same. |
| `packages/web/src/__tests__/ConversationsReview.test.tsx` → `Conversations.test.tsx` | Rename and merge with the new test cases listed above (no-id empty, not-found, error). |

### 2.3 Delete

| Path | Why |
|---|---|
| `packages/web/src/pages/ConversationsReview.tsx` | Replaced by `Conversations.tsx`. |
| `packages/web/src/pages/ConversationsChat.tsx` | Mock fixture; never wired through to L1; the editable-fallback anti-pattern. |
| `packages/web/src/pages/ConversationsReview.stories.tsx` | Replaced by `Conversations.stories.tsx`. |
| `packages/web/src/pages/ConversationsChat.stories.tsx` | The page is deleted. |
| `packages/web/src/__tests__/ConversationsChat.test.tsx` | Tests the deleted mock. |
| `packages/web/src/__tests__/ConversationsChat.chatmode.test.tsx` | Same. |
| `packages/web/src/__tests__/ConversationsChat.j8.test.tsx` | Same. |
| The `J4 Conversations Surface — Chat page` describe block in `packages/web/e2e/conversations-surface.spec.ts` | Page no longer exists. The file's review-page block is already `test.skip`'d; delete the whole file or leave one regression test redirected to the canonical route — the simpler move is to delete the file outright. |

---

## 3. Route table (after L9)

`packages/web/src/router.tsx` (verified pattern: React Router v7 `createBrowserRouter` with nested children — same shape the file already uses).

```ts
{
  path: "/",
  element: <AppShell />,
  children: [
    { index: true, element: <Navigate to="/conversations" replace /> },
    { path: "conversations", element: <Conversations /> },
    { path: "conversations/:threadId", element: <Conversations /> },
    // Legacy redirects — preserve user-facing history via replace:true.
    { path: "conversations/review", element: <RedirectLegacyConversation paramName="id" /> },
    { path: "conversations/chat",   element: <RedirectLegacyConversation paramName="thread" /> },
    // (No `/conversations/review/:id` etc. exist today — only query-string forms.)

    { path: "work/portfolio", element: <WorkPortfolio /> },
    { path: "work/team",      element: <WorkTeam /> },
    { path: "work/bet/:betId",element: <WorkBet /> },
    { path: "knowledge",      element: <KnowledgeList /> },
    { path: "knowledge/:knowledgeId", element: <KnowledgeDetail /> },
    { path: "artifacts/:id",  element: <ArtifactPermalink /> },
    {
      path: "settings",
      element: <Navigate to="/conversations?settings=open" replace />,
    },
    { path: "*", element: <NotFound /> },
  ],
}
```

Notes:

- The same `Conversations` element is mounted on both `conversations` and `conversations/:threadId`. The component reads `useParams<{ threadId?: string }>()` — when `threadId` is undefined, it renders State A (empty); when defined, it fetches and renders B/C/D/E.
- `RedirectLegacyConversation` accepts a `paramName` prop because the two legacy forms used different query-param names (`id` vs `thread`). The component's whole job:

```ts
// packages/web/src/pages/RedirectLegacyConversation.tsx
import { type JSX } from "react";
import { Navigate, useSearchParams } from "react-router-dom";

export interface RedirectLegacyConversationProps {
  /** The legacy query parameter name carrying the thread id ("id" or "thread"). */
  paramName: "id" | "thread";
}

export function RedirectLegacyConversation(
  { paramName }: RedirectLegacyConversationProps,
): JSX.Element {
  const [params] = useSearchParams();
  const id = params.get(paramName);
  // Drop the legacy paramName, but preserve any other query params the user had.
  const carry = new URLSearchParams(params);
  carry.delete(paramName);
  const suffix = carry.toString();
  const target = id
    ? `/conversations/${encodeURIComponent(id)}${suffix ? `?${suffix}` : ""}`
    : `/conversations${suffix ? `?${suffix}` : ""}`;
  return <Navigate to={target} replace />;
}
```

⚠️ UNVERIFIED — I have not re-read the React Router v7 docs while drafting this. The `<Navigate replace />` semantics and `useSearchParams()` are standard v6/v7 patterns and are already used in the codebase (`router.tsx`, `AppShell.tsx`), so the approach is consistent with the repo's verified usage. The builder should sanity-check by running the e2e redirect test in §6 — if v7 changed the `<Navigate>` semantics, the test will catch it.

---

## 4. Page signature

`packages/web/src/pages/Conversations.tsx`:

```ts
export function Conversations(): JSX.Element;
```

State machine — exactly the design's State A–E:

```
const { threadId } = useParams<{ threadId?: string }>();

if (!threadId) return <EmptyState title="Open a thread to see it here"
                                  description="Pick a thread from the list to read it."
                                  dataTestId="conversations-empty" />;

const { data, error, status, retry } = useThreadDetail(threadId);
//                  ↑ extracted from the body of today's ConversationsReview;
//                    the fetch + decodeThreadDetail logic moves wholesale
//                    into a hook in packages/web/src/hooks/useThreadDetail.ts

if (status === "loading") return <SkeletonList rows={3} ariaLabel="Loading thread" />;
if (status === "not-found") return <EmptyState ... dataTestId="thread-not-found" ... />;
if (status === "error")    return <ErrorState ... onRetry={retry} dataTestId="thread-error" />;
return <ThreadShell ... />;
```

The `useThreadDetail` hook is named (its job is "fetch a thread detail by id"), is single-purpose, and is testable in isolation. It carries the `decodeThreadDetail` decoder + the `AbortController` lifecycle that today live inside `ConversationsReview.tsx`.

`useThreadDetail` signature:

```ts
type ThreadDetailStatus = "loading" | "ready" | "error" | "not-found";
interface ThreadDetailState {
  status: ThreadDetailStatus;
  data: ThreadDetail | null;
  error: string | null;
  retry: () => void;
}
export function useThreadDetail(threadId: string): ThreadDetailState;
```

The status `"not-found"` is the explicit projection of HTTP 404. Anything else non-2xx is `"error"` with the message in `error`.

---

## 5. Navigation choreography after L9

| Origin | Target URL | Note |
|---|---|---|
| Index `/` | `/conversations` | (was `/conversations/review`) |
| IconRail click "Conversations" tab | `/conversations` | from `handleViewChange` |
| Submenu thread row click | `/conversations/:threadId` | from `handleSelectThread` (was a setState; now `navigate`) |
| `WorkTeam` "open thread" button | `/conversations/:threadId` | (was `/conversations/chat?thread=…`) |
| `TaskSheet` "open thread" affordance | `/conversations/:threadId` | (delegated through `WorkTeam`'s `onNavigateToThread`) |
| Global search → "conversation" result | `/conversations` (or `/conversations/:id` if the search emits one) | `handleSearchNavigate` default branch |
| Settings deep-link `/settings` | `/conversations?settings=open` | (was `/conversations/review?settings=open`) |
| Legacy `/conversations/review` (typed/bookmarked) | `/conversations` | via `RedirectLegacyConversation` (no id) |
| Legacy `/conversations/review?id=X` | `/conversations/X` | via `RedirectLegacyConversation` (`paramName="id"`) |
| Legacy `/conversations/chat` | `/conversations` | via `RedirectLegacyConversation` (no id) |
| Legacy `/conversations/chat?thread=X` | `/conversations/X` | via `RedirectLegacyConversation` (`paramName="thread"`) |

Browser back from `/conversations/X` should land on whatever the user was on **before** the legacy URL — because the redirect uses `replace`, the legacy URL never sticks in history. This is the spec's "preserving history" requirement satisfied by *replacing the redirect step*, not by skipping back-button traversal.

---

## 6. Test plan

### 6.1 Vitest — `packages/web/src/__tests__/Conversations.test.tsx`

```
describe("Conversations page", () => {
  it("renders the 'open a thread' empty state when no :threadId param");
  it("renders SkeletonList while the thread fetch is pending");
  it("mounts ThreadShell with the fetched thread (review-shape thread)");
  it("mounts ThreadShell with the fetched thread (plain-shape thread)"); // proves no per-shape branching
  it("renders the 'thread not found' EmptyState with a back-to-queue link on a 404");
  it("renders the ErrorState with retry on a non-404 fetch failure");
});
```

The first two assertions exist today (in `ConversationsReview.test.tsx`); the rest are new.

### 6.2 Vitest — `packages/web/src/__tests__/RedirectLegacyConversation.test.tsx`

```
describe("RedirectLegacyConversation", () => {
  it("redirects /conversations/review?id=X → /conversations/X");
  it("redirects /conversations/chat?thread=X → /conversations/X");
  it("redirects /conversations/review (no id) → /conversations");
  it("redirects /conversations/chat (no id) → /conversations");
  it("preserves other query params except the legacy id param");
});
```

### 6.3 Vitest — keep & rename existing dispatch + reasoning suites

`Conversations.dispatch.test.tsx` (renamed) keeps the L11 verdict-dispatch assertion verbatim — it proves the page, mounted via the canonical route, still wires verdicts to the canonical thread-message endpoint.

`Conversations.reasoning.test.tsx` (renamed) — same: kept verbatim.

### 6.4 Playwright — `packages/web/e2e/L9-single-detail.spec.ts`

```
test.describe("L9 — single Conversations detail surface", () => {
  test("Work → click a bet's thread → /conversations/:threadId renders ThreadShell", ...);
  test("Legacy /conversations/chat?thread=X redirects to /conversations/X (history preserved)", ...);
  test("Legacy /conversations/review?id=X redirects to /conversations/X", ...);
  test("Unknown thread id (404) shows 'Thread not found' EmptyState with back link", ...);
  test("Bare /conversations shows the 'open a thread' empty state in the Main pane", ...);
});
```

The first test is AC-5. It mocks `/api/bets/:id`, `/api/threads?host_kind=bet&host_id=…`, and `/api/threads/:id` exactly as `bet-thread.spec.ts` does, then drives:

1. `page.goto("/work/bet/:betId")`.
2. Find the host-thread section's "open in conversations" button (or the equivalent affordance from L18 — confirm with the L18 markup).
3. Click → `expect(page).toHaveURL(/\/conversations\/.+/)`.
4. `expect(page.getByTestId("thread-shell")).toBeVisible()`.

The redirect tests use `page.goto` on the legacy URL and assert `expect(page).toHaveURL(canonical)`. Browser-history preservation: navigate to `/work/portfolio`, then to `/conversations/chat?thread=t1` (which redirects), then `await page.goBack()` and expect URL `/work/portfolio` (not the legacy form).

### 6.5 Update existing Playwright specs

The grep at concept-time turned up these specs hitting legacy paths:

- `e2e/navigation.spec.ts` — index redirect changes from `/conversations/review` to `/conversations`. Update the assertion.
- `e2e/conversations-submenu.spec.ts` — `page.goto("/conversations/review")` × 4 → `/conversations`.
- `e2e/keyboard-nav.spec.ts` — `page.goto("/conversations/review")` × 3 → `/conversations`.
- `e2e/L15-task-request.spec.ts` — assertion `await expect(page).toHaveURL(/\/conversations\/chat\?thread=/)` → `await expect(page).toHaveURL(/\/conversations\/[^/]+/)`.
- `e2e/synthesis.spec.ts` — `page.goto("/conversations/review")` × 2 → `/conversations`.
- `e2e/L11-rich-messages.spec.ts` — `page.goto(\`/conversations/review?id=${THREAD_ID}\`)` × 3 → `/conversations/${THREAD_ID}`.
- `e2e/keyboard-and-responsive.spec.ts` — once → `/conversations`.
- `e2e/l10-conversations-filter.spec.ts` — × 4 → `/conversations`.
- `e2e/conversations-surface.spec.ts` — **delete** (page mount asserts a deleted page).
- `e2e/accessibility.spec.ts` — drop the `/conversations/chat` row; the `/conversations/review` row becomes `/conversations`.
- `e2e/threads.spec.ts` — × 6 `?id=` → `/:id` path.
- `e2e/conversations.spec.ts` — `/conversations/review` → `/conversations`; `/conversations/chat` → delete that block (the page is gone).
- `e2e/touch-targets.spec.ts` — same shape.
- `e2e/accessibility-K8.spec.ts` — same.

These are mechanical edits; the builder runs `bun run test:e2e` after each batch.

### 6.6 Test ordering vs implementation (TDD red phase)

The builder writes the failing tests **first**:

1. `Conversations.test.tsx` (new + renamed cases) — fails because the file doesn't exist yet.
2. `RedirectLegacyConversation.test.tsx` — fails because the helper doesn't exist.
3. `L9-single-detail.spec.ts` — fails because the canonical route doesn't exist.

Then green:

1. Add `useThreadDetail` hook (extracts existing logic; covered by the page tests).
2. Add `Conversations.tsx` + `Conversations.stories.tsx`.
3. Add `RedirectLegacyConversation.tsx` + tests pass.
4. Update `router.tsx` (route table § 3).
5. Update `AppShell.tsx` (D5 — derive `selectedThreadId` from URL; navigate on click).
6. Update `WorkTeam.tsx` line 168.
7. Update `TaskSheet.tsx` `@lore` comment.
8. Update `visual-compare-map.ts`.
9. Mass-update e2e specs (§6.5).
10. Delete `ConversationsReview.tsx`, `ConversationsChat.tsx`, their stories, the three deleted test files, and the deletable e2e file.

---

## 7. Ordered task list (for the builder)

### Phase R — red

1. **Define DoD.** Write `plans/L9/dod.md` with verifiable criteria for each of the 6 ACs (each criterion → test path).
2. **Create `Conversations.test.tsx`** (new file under `packages/web/src/__tests__/`) covering the four states + dispatch parity (review-shape and plain-shape both mount `ThreadShell`). Tests fail because `Conversations.tsx` doesn't exist.
3. **Create `RedirectLegacyConversation.test.tsx`** covering the five redirect cases from §6.2. Tests fail.
4. **Create `e2e/L9-single-detail.spec.ts`** with the five Playwright cases from §6.4. Tests fail.
5. **Update existing e2e specs to the canonical URLs** (§6.5). Most will fail; that's correct — they prove the redirect is wired *and* that the legacy paths no longer host pages.

### Phase G — green

6. **Add `packages/web/src/hooks/useThreadDetail.ts`** — extract fetch + decode + AbortController from today's `ConversationsReview.tsx`. Add the `"not-found"` status branch (today's code returns the string `"Thread not found"` into the error state — promote that to an explicit status).
7. **Add `packages/web/src/pages/Conversations.tsx`** — the page from §4.
8. **Add `packages/web/src/pages/Conversations.stories.tsx`** — five stories: empty (no-id), loading, populated-review, populated-plain, not-found. (The error story is optional — the existing `ErrorState.stories` already covers the surface.)
9. **Add `packages/web/src/pages/RedirectLegacyConversation.tsx`** — code in §3.
10. **Update `packages/web/src/router.tsx`** — apply the route table from §3. Imports change: drop `ConversationsChat`, `ConversationsReview`; add `Conversations`, `RedirectLegacyConversation`.
11. **Update `packages/web/src/layouts/AppShell.tsx`** — D4 / D5 changes: derive `selectedThreadId` from `useParams`; replace `setSelectedThreadId` with `navigate`. Update `handleViewChange` and `handleSearchNavigate` to use `/conversations`.
12. **Update `packages/web/src/pages/WorkTeam.tsx`** — line 168 navigation target.
13. **Update `packages/web/src/shell/TaskSheet.tsx`** — lore-only comment update at line 193.
14. **Update `packages/web/scripts/visual-compare-map.ts`** — replace legacy URLs.
15. **Delete the six files in §2.3 and the deletable e2e file**, in this order: tests first (so the e2e suite stays buildable), then page + stories, then the shell test if it references the deleted page (it doesn't, per the grep).
16. **Rename the three `ConversationsReview*.test.tsx` files** to `Conversations*.test.tsx` (`git mv`), updating internal imports. (The dispatch and reasoning tests stay; merge no-id / not-found / error cases into the renamed primary test file or split — builder's call.)

### Phase V — verify

17. **`bun run check`** — zero type errors. The `useParams<{ threadId?: string }>()` type narrows correctly because we mount `Conversations` on two paths. (If TS complains, fall back to `useParams<Record<"threadId", string \| undefined>>()`.)
18. **`bun run lint`** — zero biome / eslint errors.
19. **`bun run test`** — all Vitest green.
20. **`bun run test:e2e`** (or whatever the project alias is — confirm via `package.json`) — all Playwright specs green, including the five new L9 cases.
21. **Visual sanity check** — `bun run dev`, open `localhost:5173/conversations`, click a thread, confirm URL becomes `/conversations/:threadId` and `ThreadShell` mounts. Hit `/conversations/does-not-exist` → "Thread not found" empty state. Hit `/conversations/review` → bounces to `/conversations` (then back-button does NOT bounce back into `/conversations/review`).
22. **Capture lore** in `Conversations.tsx`: a `@lore L9:` comment on the four-state state machine documenting why the page does not branch by message shape (deferred to `ThreadShell`).

---

## 8. Risks / edge cases / things the reviewer should challenge

1. **Outlet-context backwards compat.** `AppShellOutletContext.selectedThreadId` is published from the URL after L9, but the only consumer today is `ConversationsReview.tsx` (which we delete). Do any other consumers exist? Grep before commit — if none, drop the field entirely. If any, document the contract in `AppShell.tsx`.
2. **Storybook coverage of the not-found state.** `ConversationsChat`'s stories included an "empty" variant (was the editable-mock behaviour). The new `Conversations.stories.tsx` must not regress to a fixture-driven empty — the story renders the literal `EmptyState`.
3. **Storybook coverage of the legacy redirect.** A redirect component that returns `<Navigate>` is hard to render in Storybook (it tries to navigate). Either skip a story for this component, or render it inside a `MemoryRouter` with an `initialEntries` that triggers the redirect, then assert the resulting location. Recommendation: skip the story (it's a single-purpose router primitive); rely on the unit test.
4. **`useParams` typing.** React Router v7's `useParams<T>()` accepts a generic that produces `Partial<T>`-like behavior — every value is `string | undefined`. The page handles the undefined case explicitly; the typed annotation is defensive, not load-bearing.
5. **`%-encoded thread ids in legacy URLs.** The redirect helper uses `encodeURIComponent(id)` when building the canonical path. If the legacy URL came in with an already-encoded id, this double-encodes. Today's WorkTeam code already calls `encodeURIComponent` before navigating, so the test fixture should reflect both the pre-encode and the post-encode forms. (The legacy `?thread=t1` form has a plain id — fine. The `?thread=t%2F1` form would double-encode — the test should cover this if the spec demands it; otherwise mark as a follow-up.)
6. **What if `handleSearchNavigate`'s "conversation" result type carries an id?** Currently the default branch ignores any id and lands on the queue. If search results carry a thread id, this is the moment to wire `/conversations/:id`. Out of L9 scope unless search already emits ids — verify with one grep.
7. **Mobile.** Mobile is three tabs; `/conversations` and `/conversations/:id` collapse to "the Conversations tab" and "an open thread within it." The router doesn't change for mobile; this is mentioned only because mobile code, if it exists, must not encode the legacy shape.
8. **Race between redirect and AppShell mount.** Each redirect element is rendered *inside* the AppShell's `<Outlet />`, so the AppShell mounts first and the redirect runs in its body. `<Navigate replace />` schedules the redirect synchronously during render — there is no flash of the legacy chrome.

---

## 9. What this plan deliberately doesn't do

- It does not change `/api/threads/:id`. No backend changes.
- It does not introduce a new design-system component. Custom-component budget unchanged.
- It does not migrate `useState`-based selection to a Redux/Zustand store; it derives selection from the URL.
- It does not redesign the empty / error states; it picks copy and a `dataTestId`.
- It does not address L10 (filter chips actually filter) or L11 (rich review messages) — both remain in scope for their own workpackages.
- It does not delete the L8-introduced `selectedThreadId` Outlet field; the field becomes derived and is removable in a follow-up if no consumers materialise.

---

## 10. Self-critique against the architectural rubric

| Dimension | Score (0–10) | Note |
|---|---|---|
| Spec fidelity | 10 | Every AC is mapped to a concrete file, test, or task. |
| Right-sizing | 9 | One new component (page), one new helper, one new hook. No new layers. |
| Layer respect | 10 | All changes inside Human Interface (`packages/web`); no Meta or Agent layer reach. |
| Test coverage | 9 | Every state has a Vitest case; every AC has a Playwright case. |
| Migration safety | 8 | Legacy URLs redirect; e2e proves the redirect; visual-compare map updated. The one gap is users with bookmarks containing double-encoded ids — covered as risk #5. |
| Verifiability | 9 | DoD-first; tests precede code; verify gate runs `check + lint + test + e2e`. |
| Naming clarity | 9 | One canonical noun per concept (concept §2 enforced in this plan: page name, route, hook name). |
| Lore capture | 8 | Two `@lore` comments planned (one in the page, one perhaps in the router). |
| Source-driven | 7 | The React Router `<Navigate replace />` and `useSearchParams` patterns are used elsewhere in the repo (verified by grep) but I did not re-read the v7 docs in this draft — flagged ⚠️ UNVERIFIED in §3. |

Net 79/90. The plan is small enough to be hard to over-engineer, and the surface area is well-mapped. The biggest residual risk is bookmark-doubling-encoding (§8.5), which is correctly punted to a test rather than pre-emptively coded.
