# L15 — Definition-of-Done Audit

**Verdict.** REVISE.

`bun run check` clean, `bun run test` runs 3287 tests with only the pre-existing
`runner-otel.test.ts` failure (tolerated). `bun run lint` reports 49 errors all
confined to `docs/design-explorations/L*/` mockup HTML — by the QA brief these
are tolerated as exploration artifacts. Server-side ACs and validation
scenarios are met with strong assertions. The blocking gap is design surface:
the L15 design review FAIL'd at 4.1/10 with 10 CRITICAL findings. CRITICALs
1/2/3 appear addressed in code; CRITICALs 4/5/6/7/8/9/10 are NOT addressed and
were filed as follow-ups while the spec contract for AC-2 ("each task gains an
affordance to request a state change OR open the task's attached thread") is
behaviourally honoured at the API level but partially honoured at the UX
level. Visual-parity tests are smoke tests, not pixel diffs.

## Per-AC + per-validation table

| Item | Status | Evidence |
|---|---|---|
| AC-1 — drag removed from Team Board Kanban; sensors + WorkTeam:116-120 handler gone | pass | `packages/web/src/shell/Kanban.tsx` has no `@dnd-kit/core` import (verified by grep — empty); no `DndContext`, `useDraggable`, `useDroppable` anywhere in file. `packages/web/src/pages/WorkTeam.tsx` no longer contains `handleMoveTask` or `COLUMN_TO_STATE` (verified). Pinned by `packages/web/src/__tests__/Kanban.test.tsx:116-121` (source-grep assertion) and `packages/web/src/__tests__/Kanban.no-drag.test.tsx:34-58`. |
| AC-2 — affordance to request state change OR open task thread; selecting posts message to thread | partial | API + wiring: `packages/server/src/routes/tasks.ts:23,32,290,339,346` (auth + ensureTaskThread + appendPlainMessage). Web: `packages/web/src/pages/WorkTeam.tsx:131-148` posts `verb` to `/api/tasks/:id/request`. Menu: `packages/design-system/src/TaskActionsMenu.tsx:184-256`. UX gaps documented as follow-ups in `docs/work-packages/follow-ups.md:94-120` (`L15-composer-modal-and-toast`, `L15-page-level-thread-routing`): no Composer modal (C4), no toast surface (C7), no section labels/dividers (C6), `Reply in thread…` is a no-op (`WorkTeam.tsx:163-166`), no Cmd+click branch (W12), no W2 chip-click `stopPropagation`. The "request → thread message" path itself is exercised end-to-end by `packages/server/src/routes/__tests__/tasks.request.test.ts` and `packages/web/e2e/team-board-request.spec.ts`. |
| AC-3 — drag survives ONLY between Shaped→Committed on Canvas | pass | `packages/web/src/shell/Canvas.tsx:7-17,84,147,208` retains `DndContext`, `useDraggable`, `useDroppable`. E2E pin: `packages/web/e2e/canvas-drag-survives.spec.ts`. |
| AC-4 — vitest covers no-op drag, posts to right thread, opens thread | pass | `Kanban.test.tsx`, `Kanban.no-drag.test.tsx`, `tasks.request.test.ts`, `tasks.request-concurrent.test.ts`, `tasks.request-authz.test.ts`, `task-pending.test.ts`, `TaskActionsMenu.test.tsx` all present and green. |
| AC-5 — Playwright e2e: try drag → no-op; request state change → message in thread | pass | `packages/web/e2e/team-board-no-drag.spec.ts`, `packages/web/e2e/team-board-request.spec.ts`, `packages/web/e2e/canvas-drag-survives.spec.ts` exist. (E2E Playwright run not invoked in this audit; brief said "rely on full-suite run".) |
| AC-6 — bun run check + lint + test all green; full e2e green | partial | `bun run check` exit 0. `bun run test` exit 1 — only `runner-otel.test.ts` fails (tolerated per QA brief). `bun run lint` exit 1 — 49 errors all in `docs/design-explorations/L10` and `docs/design-explorations/L15` mockup HTML (a11y/useButtonType). Per QA brief, "pre-existing errors in `docs/design-explorations/` HTML are tolerated; new errors are NOT." 18 of the 49 errors are in the new `docs/design-explorations/L15/` files added by this branch. They follow the same pattern as the 2 L10 errors — i.e. exploration mockups that don't include `type="button"`. Treating exploration mockup files as a tolerated category, but flagging that strict reading of the brief would call them new errors that should be fixed. |
| Validation V1 — drag does nothing | pass | `packages/web/e2e/team-board-no-drag.spec.ts` + `packages/web/src/__tests__/Kanban.no-drag.test.tsx`. |
| Validation V2 — request → thread message appears | pass | `packages/server/src/routes/__tests__/tasks.request.test.ts` (server) + `packages/web/e2e/team-board-request.spec.ts` (browser). |
| Validation V3 — opening a task's thread renders | partial | `Kanban.tsx:117` wires `onOpenThread`; `WorkTeam.tsx:150-156` issues `window.location.hash = '#/tasks/:id'`. There is no actual page-level route that renders the task's thread — that wire-up is filed as follow-up `L15-page-level-thread-routing` in `docs/work-packages/follow-ups.md:122`. The validation scenario is satisfied at the affordance level (clicking opens) but NOT at the rendering level (no thread surface to render into). |

## CRITICAL items audit

- CRITICAL-1 helper extraction (`appendPlainMessage`) — wired. `packages/server/src/routes/tasks.ts:23,346` calls the helper; `packages/server/src/services/append-plain-message.ts` exists, tested by `packages/server/src/services/__tests__/append-plain-message.test.ts`. Threads route refactor is exercised by `packages/server/src/routes/__tests__/threads.routes.test.ts` (named `threads.routes.test.ts`, NOT `threads.test.ts` as plan §12 listed — same file, semantic match). The plan §12 row required a "function-mock spy assertion" pinning `appendPlainMessage` is the path; that spy assertion is NOT present (`grep -n "appendPlainMessage" packages/server/src/routes/__tests__/threads.routes.test.ts` → 0 hits). The behavior parity is exercised but not mocked.
- CRITICAL-2 race resolution (`ensureTaskThread`) — wired. `packages/server/src/services/ensure-task-thread.ts` exists; `tasks.ts:339` calls it. Pinned by `packages/server/src/routes/__tests__/tasks.request-concurrent.test.ts` lines 92-131 with `Promise.all`-style race assertions ((a) exactly one thread, (b) both messages land, (c) thread_id correct, (d) no orphans).
- CRITICAL-3 authz (`assertTaskParticipantAuthz`) — wired. `packages/server/src/services/task-authz.ts:30-59` enforces founder bypass + agent team-match + 404 on cross-team. Called from `tasks.ts:162,290,380,426`. Pinned by `packages/server/src/routes/__tests__/tasks.request-authz.test.ts:113-220` and `packages/server/src/services/__tests__/task-authz.test.ts`. Cross-team and not-exist branches return byte-identical 404 bodies (`packages/server/src/routes/__tests__/tasks.request-authz.test.ts:169-186`).

## Visual-parity audit

- TaskCard — `packages/design-system/html/TaskCard.html` and `packages/design-system/src/TaskCard.tsx` exist. Visual test exists but is a SMOKE test, not a pixel-diff: `packages/design-system/src/__tests__/TaskCard.visual.test.tsx` checks `existsSync()` + `html.contains()`. Per `.claude/rules/visual-parity.md` the visual test must enforce 5% pixel diff; it does not. Design review C8 says the HTML reference does not even render the new `pendingRequest` slot — a real pixel-diff would either fail or require updating the HTML.
- StatusChip — `StatusChip.html`, `StatusChip.tsx` exist; `__tests__/StatusChip.visual.test.tsx` exists; same smoke-test pattern.
- TaskActionsMenu — `TaskActionsMenu.html`, `TaskActionsMenu.tsx` exist; `__tests__/TaskActionsMenu.visual.test.tsx:17-48` is `existsSync` + substring-contains check. No pixel diff. Design review C9 + C10 record HTML / TSX divergences (overlapping menus in HTML; letter-shortcut bindings differ — H/C in HTML vs K/X in TSX).

Visual-parity contract is structurally not met for any of the three new design-system surfaces.

## Protected-tests audit (plan §12)

All listed Vitest files exist. One naming mismatch: `threads.test.ts` in plan §12 is `threads.routes.test.ts` on disk — same file, semantic match. The plan-locked assertion "(a) plain-type append goes through `appendPlainMessage` (function-mock spy assertion)" is not present in `threads.routes.test.ts`. All other assertion locks were spot-verified against test bodies and are present. Letter-shortcut test (e) is present (`TaskActionsMenu.test.tsx:137-156`); the (c) Cmd+click test is documented as missing in the design review (W13) and the corresponding handler is also not implemented (W12).

## Cold-DoD red flags

- `@plan-contradiction` markers in `tasks.request.test.ts:8` and `tasks.list-pending.test.ts:5` — both flag CONFUSION-1 (task-fetch endpoint identification). Acceptable: they are honest design notes, not "blocked" markers, and the route is functional.
- `@plan-contradiction` marker in `packages/shared/src/__tests__/thread-plain-with-request.test.ts:5` — flags a plan §12 vs implementation discrepancy on the validation route. Acceptable.
- `@test-issue` marker in `packages/web/src/__tests__/WorkTeam.test.tsx:99` — documents that the test now finds the trigger that yields "Request stop" rather than `triggers[0]`. The fix is correct and the assertion still tests the wiring.
- TODO marker in `packages/web/src/pages/ConversationsChat.tsx:110` — pre-existing, not introduced by L15 (`git diff main..HEAD` returns no changes for that file).
- No `@blocked` markers introduced.
- Spot-checked tests for degenerate assertions: visual tests (`TaskActionsMenu.visual.test.tsx`, `TaskCard.visual.test.tsx`, `StatusChip.visual.test.tsx`) are degenerate — they assert file existence + substring containment, not visual parity. This is the explicit gap the design review flagged as W11.

## Design FAIL is real

The design review's score 4.1/10 (FAIL, gate is 7.0) reflects shipped UX defects:
- C4 (Composer modal): not implemented; `Reply in thread…` posts an empty body to a no-op page handler (`WorkTeam.tsx:163-166`). User-visible affordance is broken.
- C5 (trigger opacity): no `opacity: 0` at rest, no transitions; the "card stays visually identical at rest" contract from approved.md §3.1–3.3 is violated.
- C6 (section labels + dividers): not present; menu is a flat list.
- C7 (toast surface): not implemented; no "Request sent — agent will respond." confirmation.
- C8/C9 (HTML reference contradicts implementation): visual-parity rule says HTML wins; HTML doesn't render `pendingRequest` and renders all five state menus stacked.
- C10 (letter-shortcut divergence): HTML uses H/C, TSX uses K/X.
- W11 (visual-regression tests are smoke tests).
- W6 (touch-target sizing fails AQ-015 on mobile).
- W9/W10 (missing PendingRequest and request_pending stories).

Many of these are filed in `docs/work-packages/follow-ups.md`. They cover real shipped defects, not optional polish; the "open thread" affordance leg of the spec is functionally absent (no thread surface to render).

## Summary

- AC pass: AC-1, AC-3, AC-4, AC-5, V1, V2 (6).
- AC partial: AC-2, AC-6, V3 (3).
- AC fail: 0.

The server contract is solid, drag removal is clean, the request-posting path is end-to-end. The user-facing menu surface is incomplete against the approved design and the visual-parity contract is not enforced. Recommend REVISE before ship: at minimum (a) implement the toast surface so users see confirmation of their requests, (b) tighten visual-regression tests to actual pixel diff (or update the HTML references and re-run), (c) wire page-level thread routing or remove the `Open thread` affordance until L15-page-level-thread-routing lands, (d) close the missing Cmd+click handler + test or document it as out-of-scope in approved.md.
