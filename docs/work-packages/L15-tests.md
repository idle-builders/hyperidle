# L15 — Tests Summary (TDD red phase)

This document lists every test file written for L15 in the red phase. Each
row maps to (a) the protected-tests entry in `L15-plan.md` § 12, (b) the
acceptance criterion in TRACK-L § L15 / `L15-plan.md` § 1, and (c) the
expected red-phase failure mode.

## Shared fixture

| File | Purpose | Notes |
|---|---|---|
| `packages/shared/src/task-request-verbs.ts` | Locked verb identifiers (`REQUEST_VERBS`) + verb-text map + stub legality matrix. Created so server/web tests can import the constants. | Helpers `isVerbLegalForState` / `renderRequestText` throw "not implemented" — green phase fills them in. The matrix is a stub returning empty arrays for every state. NOT exported from `packages/shared/src/index.ts` yet — green phase wires that. |

## Server — protected tests (L15-plan.md § 12)

| File | AC | Failure mode (red) |
|---|---|---|
| `packages/server/src/routes/__tests__/tasks.request.test.ts` | AC-2 | `POST /api/tasks/:id/request` returns 404 (route not mounted). 9 of 11 assertions fail; the 401-no-auth and 404-missing-task happen to satisfy contract incidentally. |
| `packages/server/src/routes/__tests__/tasks.request-concurrent.test.ts` | CRITICAL-2 | Same 404 — 6 assertions fail. Tests the lazy-thread-creation race-resolution invariant: two concurrent posts on a NULL-thread task converge on a single thread row. |
| `packages/server/src/routes/__tests__/tasks.request-authz.test.ts` | CRITICAL-3, AC-2 | Cross-team / phantom 404 cases incidentally pass (route doesn't exist); founder-bypass and same-team-success cases fail. Pins anti-information-leak contract: cross-team senders MUST 404 even after the route exists. |
| `packages/server/src/services/__tests__/task-authz.test.ts` | CRITICAL-3 | Module-not-found for `../task-authz.js` — pure unit tests on `assertTaskParticipantAuthz` (founder bypass, role==='founder' bypass, team_id match, 404 otherwise). |
| `packages/server/src/services/__tests__/append-plain-message.test.ts` | refactor invariant | Module-not-found for `../append-plain-message.js`. Tests the helper signature: appends a plain message, bumps `lastActiveAt`, fires `thread_message_appended`, idempotency (200 same-payload / 409 divergent), 404 missing-thread, 403 non-participant. |
| `packages/server/src/services/__tests__/ensure-task-thread.test.ts` | CRITICAL-2 | Module-not-found for `../ensure-task-thread.js`. Tests the conditional-UPDATE rowcount race resolution and the `TaskThreadRaceLost` sentinel. |
| `packages/server/src/routes/__tests__/threads.verdict-race.test.ts` | AC-6 (regression) | Currently passes — verdict-race semantic at `threads.ts:488–524` is intact (this is a regression PIN: the file must remain green through the L15 `appendPlainMessage` extraction). If the green-phase refactor takes too much, this test goes red and the work-code agent must dial back. |

## Design system — visual regression (L15-plan.md § 12, W-4)

| File | AC | Failure mode (red) |
|---|---|---|
| `packages/design-system/src/__tests__/TaskActionsMenu.visual.test.tsx` | AC-2, visual-parity rule | `beforeAll` throws because `packages/design-system/html/TaskActionsMenu.html` does not exist yet. ⚠️ FLAG: Claude Design must create the HTML reference per `.claude/rules/visual-parity.md` BEFORE the TSX implementation; the mockup at `docs/design-explorations/L15/quiet-menu/mockup.html` is the source. The test also requires the design-system Playwright `testMatch` to widen from `visual-regression.test.ts` to `*.visual.test.tsx` — green-phase wiring task. |
| `packages/design-system/src/__tests__/TaskCard.visual.test.tsx` | AC-2, visual-parity rule | Variants `pending` and `menu-open` require Claude Design to extend `packages/design-system/html/TaskCard.html` with `data-variant="pending"` and `data-variant="menu-open"` sections. Until then `expect(htmlSection).toBeVisible()` fails. The `at-rest` variant is already covered by the existing `visual-regression.test.ts` `COMPONENTS` list — duplicating it here makes the L15 protected suite self-contained. |

## Web — protected tests (L15-plan.md § 12)

| File | AC | Failure mode (red) |
|---|---|---|
| `packages/web/src/__tests__/Kanban.no-drag.test.tsx` | AC-1 | Replaces `Kanban.keyboard-drag.test.tsx` (deleted in green phase per plan § 8 task 19). DOM assertions and source-grep assertions all fail because Kanban.tsx still imports `DndContext` / `useDraggable` / `KeyboardSensor` and renders `[data-droppable-column]` markers. |
| `packages/web/src/__tests__/WorkTeam.menu.test.tsx` | AC-1, AC-2 | Source-grep on `handleMoveTask` fails (still defined). The menu-trigger query `screen.findByRole("button", { name: /task actions/i })` times out (no such trigger rendered). |

## E2E — Playwright (L15-plan.md § 12)

| File | AC | Failure mode (red) |
|---|---|---|
| `packages/web/e2e/L15-team-board-no-drag.spec.ts` | AC-1, AC-2, AC-5 | Two flows: (1) drag-is-noop — currently fails because dragTo() still triggers state mutation (no transition network call expected, but column membership changes); (2) menu-click-posts-request — currently fails because the trigger button doesn't exist. Both go green after the implementation. |

## Verification commands

The red-phase invariants were confirmed with:

```bash
bun run test packages/server/src/routes/__tests__/tasks.request.test.ts
# Test Files: 1 failed (1) | Tests: 9 failed | 2 passed (11)

bun run test packages/server/src/routes/__tests__/tasks.request-concurrent.test.ts \
              packages/server/src/routes/__tests__/tasks.request-authz.test.ts \
              packages/server/src/routes/__tests__/threads.verdict-race.test.ts
# Test Files: 2 failed | 1 passed (3) | Tests: 6 failed | 4 passed (10)

bun run test packages/server/src/services/__tests__/task-authz.test.ts \
              packages/server/src/services/__tests__/append-plain-message.test.ts \
              packages/server/src/services/__tests__/ensure-task-thread.test.ts
# Test Files: 3 failed (3) | Tests: no tests (module-not-found errors)

bun run test packages/web/src/__tests__/Kanban.no-drag.test.tsx \
              packages/web/src/__tests__/WorkTeam.menu.test.tsx
# Test Files: 2 failed (2) | Tests: 11 failed | 3 passed (14)

bun run check
# Passes: type-check is clean (the new `task-request-verbs.ts` stub is
# valid TypeScript and not imported anywhere yet).
```

## Flags raised during write-tests

1. **Missing HTML references** — `packages/design-system/html/TaskActionsMenu.html`
   does not exist. Claude Design must author it (translate
   `docs/design-explorations/L15/quiet-menu/mockup.html`). `TaskCard.html`
   must also gain `data-variant="pending"` and `data-variant="menu-open"`
   sections. Per `.claude/rules/visual-parity.md`, HTML is the design
   source of truth — TSX must match it pixel-for-pixel.

2. **Design-system Playwright `testMatch`** is currently
   `visual-regression.test.ts` only. Green phase must widen it (or fold
   the new `*.visual.test.tsx` cases into the existing
   `visual-regression.test.ts` COMPONENTS list — that may be the simpler
   path).

3. **Path conventions** — the user's task instructions named files like
   `packages/server/src/routes/tasks.request.test.ts`. The existing
   project convention places server tests under
   `packages/server/src/routes/__tests__/`. The L15-plan.md § 12
   protected-list also uses the `__tests__` form. I followed the existing
   convention. The set of files matches the protected list verbatim.
