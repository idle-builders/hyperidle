# L9 — Code Review (Phase 4)

**Verdict: DONE**

Reviewer: Phase 4 (carries Phase 2 critique context). Branch `feat/L9-conversations-single-detail`, draft PR #70. Reviewed against `plans/work-packages/TRACK-L.md` lines 314–342, `plans/L9/architecture.md`, and the two Phase 2 critique artifacts.

The diff lands the architecture cleanly. Both Phase 2 blockers (CRITICAL trim() guard + WARNING Outlet-context migration) are resolved. All 6 ACs are met by code or by tests. One MED finding (AC-5 e2e silently degrades to a non-click-through path), one LOW (AppShell stale code comment), several INFO. Nothing blocking ship.

---

## AC audit (6/6 DONE)

| # | AC | Status | Proof |
|---|----|--------|-------|
| 1 | One queue + one detail surface; legacy routes redirect, never 404 | DONE | `packages/web/src/router.tsx:34–50` (canonical routes + legacy redirect mounts); `packages/web/src/pages/RedirectLegacyConversation.tsx:43–63` (redirect helper with trim guard); `packages/web/src/__tests__/RedirectLegacyConversation.test.tsx` (9 cases incl. whitespace-only id); `packages/web/e2e/L9-single-detail.spec.ts:88–188` (e2e redirect + history-preservation). Vitest 18/18 green locally. |
| 2 | Detail surface renders the picked thread, rich messages from L1 inline | DONE | `packages/web/src/pages/Conversations.tsx:158–168` mounts `ThreadShell` (no per-shape branching); `Conversations.test.tsx:136–185` proves both review-shape and plain-shape mount the same `ThreadShell`; `Conversations.dispatch.test.tsx:129–154` retains the L11 verdict-dispatch contract verbatim. |
| 3 | Naming collisions resolved per L1 — one canonical noun per concept | DONE | Page renamed `Conversations` (filename + export). All `ConversationsReview*` and `ConversationsChat*` source files deleted (verified via `git diff main..HEAD --stat`). Routes converged on `/conversations` + `/conversations/:threadId`. Stale `@lore` comments at `AppShell.tsx:36, 606` reference the old name — see Slop INFO #1; not a naming collision in code. |
| 4 | Vitest covers dispatch + unknown-thread fallback | DONE | Dispatch: `Conversations.test.tsx:136–185` (review + plain shape both mount `ThreadShell`); `Conversations.dispatch.test.tsx:129–154` (verdict POST contract). Unknown-thread: `Conversations.test.tsx:190–206` (404 → `thread-not-found` testid, no `ThreadShell`, back-to-inbox link). |
| 5 | Playwright e2e: Work → click bet's thread → detail surface renders | DONE (with caveat) | `L15-task-request.spec.ts:303–314` exercises Work → TaskSheet → "Open thread" button → `/conversations/:TASK_THREAD_ID` URL assertion. This is the actual click-through. The dedicated `L9-single-detail.spec.ts:236–339` test for Work-bet → detail has a flawed primary path (looks for non-existent `open in conversations` button) and silently falls through to direct `goto` — see Adversarial MED #1. |
| 6 | `bun run check` + `bun run lint` + `bun run test` green; full e2e green | DONE (per founder direction) | Local validation per task brief: `check` 0 errors, `lint` 0 errors (174 baseline warnings), `test` 3342 passed. Local Playwright on 62 conversation-touching specs passed; full-suite CI is in-flight and authorized for advance on green local verify. |

---

## Carry-over verification (Phase 2 → Phase 4)

| # | Item | Result | Evidence |
|---|------|--------|----------|
| 1 | CRITICAL: `RedirectLegacyConversation` `.trim()` + fall-back to `/conversations` on whitespace ids | PASS | `RedirectLegacyConversation.tsx:51` `const id = params.get(paramName)?.trim() || null;`. Test `RedirectLegacyConversation.test.tsx:77–83` exercises `?id=%20%20%20`. |
| 2 | WARNING: AppShell `selectedThreadId` derived from `useParams`, Outlet field name preserved | PASS | `AppShell.tsx:460–461` derives `selectedThreadId` from `useParams<{ threadId?: string }>()`; field name `selectedThreadId` retained in `AppShellOutletContext` (`AppShell.tsx:39–41`); `AppShell.threads.test.tsx:175–206` verifies click-row → URL change AND outlet-context propagation. |
| 3 | Search nav with id routes to `/conversations/:id` | PASS | `AppShell.tsx:358–370` "conversation" branch sanitizes id and navigates to `/conversations/${safeId}`; falls back to `/conversations` on null id. Reuses the existing `sanitizeRouteId` (path traversal + scheme guard). |
| 4 | Not-found state is `EmptyState` with `data-testid="thread-not-found"` (no `ThreadShell`) | PASS | `Conversations.tsx:128–139` returns the `EmptyState` only — no `ThreadShell`, no fixture content. `Conversations.test.tsx:200–203` asserts `queryByTestId("thread-shell")` is null. |
| 5 | Legacy URL grep shows only documented hits | PASS | `grep` over `packages/web/src + e2e + scripts` shows hits only in: `router.tsx` (route definitions), `RedirectLegacyConversation.tsx` + test (the helper itself), `TaskSheet.tsx:196` (`@lore` comment), `Conversations.tsx` and various `@lore` notes documenting the migration. No live navigations to legacy URLs. |
| 6 | Renamed dispatch + reasoning tests preserve assertions | PASS | `Conversations.dispatch.test.tsx:129–162` retains the verdict-POST shape + clientKey assertion + "no `review-header`" guard verbatim. `Conversations.reasoning.test.tsx:1–40` preserves the long-reasoning toggle assertion. Only describe / import / lore changed. |
| 7 | `data-testid="thread-error"` kept or dropped, deliberate | PASS (kept) | Kept at `Conversations.tsx:148`. Asserted at `Conversations.test.tsx:218`. Decision is intentional — used by `bet-thread` and other specs. |

---

## Findings by lens

### Architecture (positive)

- **Layer integrity (PASS).** Every change inside `packages/web` (Human Interface). No Meta or Agent reach.
- **API contracts (PASS).** No new HTTP contracts. `useThreadDetail` exposes a closed 4-state discriminant exactly as planned.
- **Plan fidelity (PASS).** Each task in `architecture.md §7` is traceable to a commit/file. The decisions block (D1–D11) holds — no quiet redesign during build. Phase 2 CRITICAL/WARNING both addressed.

No architecture findings.

### Design (positive)

- **State machine (PASS).** Five states (A–E) match `design/approved.md`; the page renders exactly the testids the design specifies (`conversations-page`, `conversations-empty`, `thread-not-found`, `thread-error`, `thread-shell` from `ThreadShell`).
- **Stories (PASS).** All five states present in `Conversations.stories.tsx` (A–E). Storybook coverage matches `design-critique.md` SUGGESTION on the not-found state — explicit `EmptyState`, not a fixture.
- **Tokens (PASS).** No hardcoded colors, no off-grid spacing in the new files. `Conversations.tsx` uses `flex flex-col h-full` containers — token-clean.

No design findings.

### Security (positive)

- **Search-result id sanitization (PASS).** `AppShell.tsx:358–370` runs the search-result id through the existing `sanitizeRouteId` (rejects path-escapes, control chars, traversal, scheme prefixes) before interpolating into `navigate()`. This is the I4 MED-1 contract carried forward correctly.
- **Path-segment encoding (PASS).** `RedirectLegacyConversation` uses `encodeURIComponent` on the legacy id; `WorkTeam.tsx:169` and `AppShell.tsx:467` (`handleSelectThread`) both encode. No string concatenation of unverified ids into URLs.
- **No new POST/PATCH (PASS).** `onAppend` in `Conversations.tsx:104–118` is the existing thread-message POST carried over verbatim from `ConversationsReview.tsx`. No new auth boundary.

No security findings.

### Adversarial (negative)

**MED-1 — `L9-single-detail.spec.ts:325–338` AC-5 silently degrades to a non-click-through path.**
File: `packages/web/e2e/L9-single-detail.spec.ts:236–339`. The test goes `page.goto("/work/bet/:betId")`, expects `host-thread-section` visible, then searches for `getByRole("button", { name: /open in conversations/i })`. Grep confirms **no such button exists anywhere** in the codebase (`/Users/tobiasgrundmann/Development/hyperidle/.worktrees/L9/packages/web/src`). Therefore `(await openButton.count()) > 0` is always false, and the `else` branch executes a direct `page.goto(/conversations/${BET_THREAD_ID})` and asserts the URL it just typed. That is a tautology — it proves "we can goto a URL", not "Work → click → detail."

The actual AC-5 click-through is covered by `e2e/L15-task-request.spec.ts:303–314` (Team Board → click task card → TaskSheet → "Open thread" button → `/conversations/:threadId`). So the AC is met by another spec — the L9-specific test is misleading at best.

Required fix (follow-up, not blocking): either delete the dead branch and switch the test to mount on `/work/team` and click "Open thread" through TaskSheet (matching `L15-task-request.spec.ts`), or add the missing "open in conversations" button to `HostThreadSection` and let this spec exercise it. As is, the test gives a false sense of coverage.

**LOW-1 — Stale `@lore` comments reference deleted `ConversationsReview`.**
File: `packages/web/src/layouts/AppShell.tsx:36, 605–609`. Comments still refer to `ConversationsReview`, e.g. `"Read by ConversationsReview (and any future thread-aware page)"` and `"the lifted selected-thread id reaches the Main pane … ConversationsReview consumes it"`. The component no longer exists. This is dead documentation that will mislead the next reader. Same in `AppShell.threads.test.tsx:74` ("so ConversationsReview can mount") and `AppShell.tsx:606`. Cosmetic.

**INFO-1 — `useThreadDetail` swallows server-side `error` body.**
File: `packages/web/src/hooks/useThreadDetail.ts:114–118`. Non-2xx (non-404) sets `error` to `HTTP ${res.status}` — does not read the response body. If the server returns a JSON `{ error: "rate limited" }` payload, the user sees only "HTTP 429". This is the same behavior as the original `ConversationsReview` (carried unchanged), so it's not a regression. Worth a follow-up but not a finding for this PR.

**INFO-2 — `onAppend` does not surface the POST failure path.**
File: `packages/web/src/pages/Conversations.tsx:104–118`. If `res.ok` is false, the function returns silently — no toast, no error state. Callers (`ThreadShell`'s composer) handle their own optimistic UI, but a failed POST is invisible. Carried from `ConversationsReview`. Not a regression; flag for follow-up.

### Simplification (negative)

**INFO-3 — `Conversations.tsx:154–156` adds a defensive branch that tests show cannot fire.**
```ts
if (!data) {
  return <div className="h-full" data-testid="conversations-page" />;
}
```
At this point `status === "ready"` and the hook only sets `status = "ready"` in the same tick that it sets `data = body` (`useThreadDetail.ts:121–122`). The "ready but data null" state is unreachable. This is a defensive empty-div that costs nothing but is dead code. Remove or convert to an exhaustiveness assertion — minor.

**INFO-4 — Helper `emptyDataForShape` is invoked once per case at `resolveArtifactSlot`.**
File: `packages/web/src/pages/Conversations.tsx:40–95`. The five-case `switch` is then duplicated by a second five-case `switch` in `resolveArtifactSlot` that re-invokes `emptyDataForShape(kind)` and casts the result. The cast is a re-narrowing of what the first switch already proved. Could collapse to one switch with `<ArtifactView shape={kind} data={emptyDataForShape(kind)} />` if `ArtifactView`'s prop types allowed a discriminated union — and the "carried unchanged from ConversationsReview" comment notes this is the legacy shape. Not introduced by this PR; carry-over.

### Slop (negative)

**INFO-5 — Verbose lore in `RedirectLegacyConversation.tsx`.**
File: `packages/web/src/pages/RedirectLegacyConversation.tsx:1–42`. The file is 64 lines of which ~40 are TSDoc + JSDoc-example + lore comments — 3:1 comment-to-code ratio. The CRITICAL `@lore` is load-bearing (it documents the trim() guard rationale); the JSDoc-example block at lines 35–42 duplicates the table at lines 4–8. Not harmful, but trim-able. Carries forward Phase 2 SUGGESTION #2.

**INFO-6 — Stories file uses `globalThis as unknown as { fetch: unknown }` cast pattern.**
File: `packages/web/src/pages/Conversations.stories.tsx:45, 62, 117, 138`. Repeated double-cast. Not a TypeScript error but is a slop tell — typically `vi.stubGlobal` or a typed wrapper is preferred. Stories are dev-only; INFO.

---

## Tests run

```
bunx vitest run packages/web/src/__tests__/Conversations.test.tsx \
                packages/web/src/__tests__/Conversations.dispatch.test.tsx \
                packages/web/src/__tests__/Conversations.reasoning.test.tsx \
                packages/web/src/__tests__/RedirectLegacyConversation.test.tsx
→ Test Files 4 passed (4) | Tests 18 passed (18)

bunx vitest run packages/web/src/__tests__/router.test.tsx \
                packages/web/src/__tests__/AppShell.threads.test.tsx
→ Test Files 2 passed (2) | Tests 17 passed (17)
```

Builder's reported full-suite numbers (`bun run check` 0 errors, `bun run lint` 0 errors, `bun run test` 3342 passed, 62 conversation-touching Playwright specs passed) accepted under task-brief direction (CI green-equivalent).

---

## Summary

L9 ships. Both Phase 2 blockers are resolved with proof. The implementation is small, contract-respecting, and test-covered. The single MED finding is a misleading e2e test path (AC is satisfied elsewhere); the LOW + INFO findings are non-blocking.

**Top 3 findings:**

1. **MED — `L9-single-detail.spec.ts` AC-5 fallback is a tautology.** No "open in conversations" button exists; the test always direct-goto's the URL it just constructed. AC-5 click-through is real but covered by `L15-task-request.spec.ts`. Follow-up: collapse the dead branch.
2. **LOW — Stale `ConversationsReview` references in `AppShell.tsx` lore comments + `AppShell.threads.test.tsx` comment.** Cosmetic. Update on next touch.
3. **INFO — `Conversations.tsx:154–156` unreachable defensive `!data` branch.** Dead code under the typed status discriminant.
