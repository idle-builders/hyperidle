# L8 — Tests (red phase)

Verification mapping per acceptance criterion (TRACK-L L8 lines 269–294).

## AC → Verification artifact

| AC | Test file | Test name(s) |
|---|---|---|
| Submenu renders full thread list grouped sensibly; static entries + hardcoded counts removed | `packages/web/src/__tests__/AppShell.threads.test.tsx` | `renders threads from /api/threads as the submenu list`; `SUBMENU_CONFIG has no static conversations items (no Review Queue / Chat NavItems)` |
| Real query against L1 thread store; selection drives lifted id NOT route navigation | `packages/web/src/__tests__/AppShell.threads.test.tsx` | `clicking a thread row updates lifted id, does not call navigate()` (PROTECTED §7.2); `selecting a thread does not change location.search or pathname` |
| Section counts derived from fetched list | `packages/web/src/components/__tests__/ThreadSections.conversations.test.tsx` | `counts equal rendered list length — never literal` (PROTECTED §7.1); `submenu title-bar count equals total rendered rows` |
| Empty list rendering | `packages/web/src/components/__tests__/ThreadSections.conversations.test.tsx` | `renders EmptyState when no threads provided` |
| Mixed list rendering (Blocking / Active / Resolved buckets) | `packages/web/src/components/__tests__/ThreadSections.conversations.test.tsx` | `classifies threads into blocking/active/resolved buckets`; `renders sections in canonical order` |
| Pinned coach floats top of Active | `packages/web/src/components/__tests__/ThreadSections.conversations.test.tsx` | `pinned thread sorts first within Active section` |
| Selection drives the lifted id (Vitest) | `packages/web/src/__tests__/AppShell.threads.test.tsx` | `clicking a row sets selectedThreadId on AppShell and propagates via outlet context` |
| Network failure → clear error state | `packages/web/src/hooks/__tests__/useConversationsThreads.test.tsx` | `surfaces error when fetch fails`; `retry re-runs the fetch and restores ready` |
| Server response carries `hasUnresolvedReview` | `packages/server/src/routes/__tests__/threads.routes.test.ts` (append) | `GET /api/threads includes hasUnresolvedReview=true when an unresolved review exists`; `GET /api/threads sets hasUnresolvedReview=false for plain-only threads`; `GET /api/threads sets hasUnresolvedReview=false when the review is resolved` |
| ThreadRow gains selected/pinned/hostTag props | `packages/web/src/__tests__/ThreadRow.test.tsx` (append) | `applies aria-current when selected`; `renders pin glyph when pinned`; `renders host tag pill when hostTag is provided`; `selected primary border overrides blocking border` |
| Playwright: list loads, click updates main pane, counts match list | `packages/web/e2e/conversations-submenu.spec.ts` | `loads thread list and renders rows by section`; `clicking a thread row updates the main pane`; `network failure renders ErrorState with retry` |
| `bun run check` + `bun run lint` + `bun run test` green | gate run | n/a |
| Counts must match list length | `ThreadSections.conversations.test.tsx` (PROTECTED §7.1) | as above |
| No keyboard verb shortcuts; no emojis | implicit (no shortcuts/emojis introduced); design-lint covers | n/a |

## Protected tests (CC-008 bug-replay set)

- `packages/web/src/components/__tests__/ThreadSections.conversations.test.tsx` — `counts equal rendered list length — never literal`
- `packages/web/src/__tests__/AppShell.threads.test.tsx` — `clicking a thread row updates lifted id, does not call navigate()`; `SUBMENU_CONFIG has no static conversations items`
- `packages/web/e2e/conversations-submenu.spec.ts`
