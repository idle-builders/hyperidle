# L8 Architecture Review (read-only)

Worktree: `/workspace/.worktrees/L8` · Branch: `feat/L8-conversations-submenu-threads`
Spec: `docs/work-packages/TRACK-L.md` lines 269-294 · Plan: `docs/work-packages/L8-plan.md`

---

## Summary

| Severity | Count |
|---|---|
| CRITICAL | 2 |
| Major | 4 |
| Minor | 3 |

---

## CRITICAL

### C1 — `loading` status never renders; hook starts in `loading` and Submenu shows EmptyState during fetch
File: `packages/web/src/components/ThreadSections.tsx` (no `loading` branch); `packages/web/src/layouts/AppShell.tsx:472-483`.
Plan §5 commits to a *Loading* state ("3 `Skeleton` rows in list slot. Title-bar count hidden."). Plan §6 task 13 also asserts a Loading state.
The hook initialises `status: 'loading'` (`useConversationsThreads.ts:102`) with an empty `threads` array. `AppShell` only forwards an `errorMessage` when `status === 'error'`; `ThreadSections` has no loading branch and falls through to its `threads.length === 0` check, so during every fetch the Submenu briefly renders the `EmptyState` ("No threads yet"). That is the exact "silent collapse" the spec forbids ("the Submenu shows a clear error state, never silent collapse" — TRACK-L AC). Empty-state-flash also defeats §7.1 / §7.3 in real navigation, even though the unit tests only assert the post-fetch DOM.
Fix: thread `status` through to `ThreadSections` (e.g., add a `loading?: boolean` prop) and render skeleton rows; suppress the title-bar count while loading.

### C2 — Plan §3.5 Outlet-context wiring (`selectedThreadId` → ConversationsReview) is not implemented
Files: `packages/web/src/layouts/AppShell.tsx:514-516` (Outlet has no `context=`), `packages/web/src/pages/ConversationsReview.tsx` (no `useOutletContext`).
Plan §3.5: "The id is passed down via Outlet context (`react-router-dom`'s `useOutletContext`) so `ConversationsReview` and `ConversationsChat` can read it and render the matching thread." Plan §6 task 12 calls this out explicitly. AC: "Selection drives a lifted selected-thread id" — i.e., picking any thread should change the main pane.
The lifted state (`selectedThreadId`) exists but has no consumer. Clicking a row updates aria-current on the row but the Main pane never re-reads the id; rich-thread navigation from the new list is broken end-to-end. The Vitest "selection-not-routing" test only verifies *navigation didn't happen* — it does not verify the main pane updated, so the regression slipped past the protected test set. (The Playwright spec's "main pane updates" test similarly will pass only because it asserts URL stayed the same, not because the rendered content changed.) This is the same "wired-up but never instantiated" pattern the L7 retro called out.

---

## Major

### M1 — Plan §3.1 / §6 task 1 protected test missing: single-batched-query performance assertion
File: `packages/server/src/routes/__tests__/threads.routes.test.ts:819-973`.
Plan §6 task 1 commits: "single batched messages query (assert by spying on driver `prepare` or by asserting only ONE additional query beyond the threads SELECT)". No such assertion exists; only correctness-of-flag tests landed. The N+1 risk explicitly called out in §10 Option A is now unprotected. Recurrence guard: the L8 retro should add this back as a protected test, otherwise a future refactor can re-introduce N+1 silently.

### M2 — Plan §2 / §6 task 11 commitment: read `submenuFilter` into the threads list — NOT implemented
File: `packages/web/src/layouts/AppShell.tsx:389,463-483`.
`submenuFilter` is set into `Submenu.activeFilter` but never passed into `ThreadSections` or used to filter `conversationsThreads.threads`. Plan §2 row 8 says "L8 architect call: L8 wires filter chips into the new sectioning so the design's §6 contract is honoured" and §6 task 11 names the same. The chips render and are interactive but selecting "Needs review" / "Resolved" does nothing. AC ("Counts must match list length") still holds for active filter='all' but the contract is partially shipped — surface debt.

### M3 — Plan §3.4 commits closed enum `hostTag?: HostKind`; ship widened to `string`
File: `packages/design-system/src/ThreadRow.tsx:35`.
Plan §3.4: "Closed enum — closed exactly to HOST_KINDS." The shipped prop is `hostTag?: string`. The hook validates `hostKind` with `HOST_KIND_SET` so today's call site is safe, but the design-system primitive's contract no longer enforces the closed enum at the type boundary — a downstream consumer can pass any string ("foo bar") and render a junk pill. Aesthetic / contract regression vs. plan.

### M4 — Plan §3.1 / §6 task 2 commits a Zod schema (`threadListRowSchema`) — NOT exported
File: `packages/server/src/routes/threads-schema.ts` (grep for `threadListRow` / `listThreadsResponse` / `hasUnresolvedReview` returns nothing).
Plan §3.1 + §6 task 2: "Append `threadListRowSchema` to `threads-schema.ts`." Server returns the field on the wire, but no Zod schema documents/validates the response shape. Consumer (the hook) ad-hoc validates with a hand-rolled `isThreadListRow` instead. This is exactly the "schema/contract drift" failure mode the L7 retro flagged. Add the schema or remove the §3.1 commitment from the plan.

---

## Minor

### m1 — Plan §3.5 fallback-id behavior unimplemented
`ConversationsReview.tsx` continues to read its own `?id=` URL fallback unchanged. Plan §3.5 says lifted state should win when present; safe today because lifted state has no path into the page (see C2), but leave a TODO when fixing C2 so the fallback hierarchy lands as designed.

### m2 — Pinned glyph contradicts approved design vocabulary
`ThreadRow.tsx:88-99` uses a star path. Plan §3.4 + design §4 call this a "pin glyph". A star is iconographically a "starred/favorite" affordance, not a pin. Functionally fine for L8 (it's an SVG, not an emoji) but the icon library token is mislabelled.

### m3 — Plan §5 "Title XSS" Playwright test absent
Plan §5 commits a Vitest + Playwright XSS assertion (mocked response with `<script>` tag → DOM shows it as text). Title is a stub today (`Task thread <id-prefix>`), so the surface is genuinely zero — but the regression guard the plan promised is missing for the day someone pipes real titles through.

---

## L7 Retro Recurrence Guards — Status

| Guard | Status |
|---|---|
| "Wired-up but never instantiated" hooks/services | FAIL — see C2 (`selectedThreadId` is set, never consumed by main pane) and M2 (`submenuFilter` set but never filters list). |
| Schema/migration self-consistency (no NOT NULL + ON DELETE SET NULL) | N/A — L8 ships no schema migration; only a derived field. |
| Plan §5 file-path commitments matched | PARTIAL — `threads-schema.ts` extension missing (M4); `ConversationsReview.tsx` Outlet wiring missing (C2); `app-shell-data.ts` row not touched (acceptable — no L8 mocks lived there). |

---

## Coverage of Plan §7 Protected Tests + §9 Route Checklist

| Plan item | Verified in code |
|---|---|
| §7.1 counts-derived-from-list (sections) | YES — `ThreadSections.conversations.test.tsx` asserts header counts vs bucket length. |
| §7.1 counts-derived-from-list (chrome) | YES — `AppShell.threads.test.tsx` asserts badge=7 and badge hidden at zero. |
| §7.2 selection-not-routing | PARTIAL — test asserts pathname/search unchanged; does NOT assert main pane reflects threadId (the AC half). See C2. |
| §7.3 hardcoded-counts removal | YES. |
| §7.4 e2e contract | YES — `conversations-submenu.spec.ts` covers list, click, error, retry. |
| §9 route-checklist `/conversations/review` | Both files in scope changed. |

---

## Layer / Boundary Check

- Human Interface ↔ Meta Layer separation honoured: web fetches via REST only.
- Hook-side row validator (`isThreadListRow`) duplicates server-side schema work; promote to a shared schema (M4) to keep one source of truth.
- No primitive-store / agent-runtime reach-through detected. Clean.

---

## Top 3 (under-200-word summary follows in chat reply)
