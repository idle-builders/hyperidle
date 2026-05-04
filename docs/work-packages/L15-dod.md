# L15 — Definition of Done Audit

**Verdict: NOT DONE — DoD not met.**

| AC | Status | Evidence |
|----|--------|----------|
| 1. Drag-to-move REMOVED from Kanban (no-op) | PASS | `git diff main` on `packages/web/src/shell/Kanban.tsx` shows `DndContext`, `useDraggable`, `useDroppable`, `PointerSensor`, `KeyboardSensor`, `COLUMN_TO_STATE`, `onDragStart`, `onDragEnd` all removed. `WorkTeam.tsx:116-120` move-task handler replaced. Confirmed: `grep "DndContext" packages/web/src/shell/Kanban.tsx` returns 0 matches. |
| 2. Affordance to request state change OR open thread | PASS | `packages/web/src/shell/TaskActionsMenu.tsx` (new), wired in `Kanban.tsx` and `WorkTeam.tsx`. Two menu items: state-change request + open thread. |
| 3. Selecting request posts to task thread | PASS (unit) / FAIL (e2e) | Unit: `packages/web/src/__tests__/WorkTeam.taskStateRequest.test.tsx` passes (POST to `/api/threads/:id/messages`). E2E observed failure — see AC 6. |
| 4. Drag survives Shaped → Committed on Canvas | PASS | `packages/web/src/shell/Canvas.tsx` retains `DndContext` / `useDraggable` (lines 7,13,84,147). No diff vs main on Canvas. |
| 5. Vitest tests cover drag no-op, request posting, thread lift | PASS | `Kanban.no-drag.test.tsx`, `WorkTeam.taskStateRequest.test.tsx`, `WorkTeamTaskThread.test.tsx`, `TaskActionsMenu.test.tsx`, `taskStateRequest.test.ts`, `ensureTaskThread.test.ts`. All 947 web tests pass (`bun run test packages/web`). |
| 6. Playwright e2e: drag no-op + request posts message | **FAIL** | `packages/web/e2e/team-board-task-actions.spec.ts:45` — toast `Requested → Blocked. Posted to thread.` never visible. `1 failed, 1 passed`. The fetch to `/api/threads/:id/messages` is not handled in dev/e2e harness; the catch returns network error and no success toast is rendered. |
| 7. `bun run check` + `lint` + `test` all green | **FAIL** | `bun run check`: PASS. `bun run lint`: **FAIL** — 65 errors / 177 warnings in `docs/design-explorations/L15/variant-a-kebab/mockup.html` and `variant-c-bottom-sheet/mockup.html` (and L10 mockup). All errors live in files added by L15. `bun run test`: 1 unrelated pre-existing failure in `pipeline/runner-otel.test.ts` (no diff vs main); web suite 947/947 green. |
| 8. No emojis | PASS | No emoji introduced in source files. |

## Failures summary

1. **AC 6 — E2E fails.** The state-change toast never appears because the POST to `/api/threads/:id/messages` is not stubbed/served in the Playwright run, so the handler hits the `catch` and returns `network` error → no success toast. Spec demands "message appears in the task's thread" — must either (a) stand up the API in e2e, (b) mock the route via Playwright `page.route`, or (c) provide an in-memory transport.
2. **AC 7 — Lint fails.** 65 errors in design-exploration HTML mockups added by L15 (variant-a-kebab/mockup.html, variant-c-bottom-sheet/mockup.html) — primarily missing `type="button"` on buttons. Either fix the mockups, exclude `docs/design-explorations/**` from biome, or remove from tracked files.

## Pre-existing (not L15's fault)

- `packages/pipeline/src/__tests__/runner-otel.test.ts` failure exists on `main` per `git diff main` (no L15 changes to that area).
- `docs/design-explorations/L10/variant-a-pure-axis/mockup.html` lint errors pre-date this branch.

## Files reviewed

- `/Users/tobiasgrundmann/Development/hyperidle/.worktrees/L15-4/packages/web/src/shell/Kanban.tsx`
- `/Users/tobiasgrundmann/Development/hyperidle/.worktrees/L15-4/packages/web/src/pages/WorkTeam.tsx`
- `/Users/tobiasgrundmann/Development/hyperidle/.worktrees/L15-4/packages/web/src/shell/Canvas.tsx`
- `/Users/tobiasgrundmann/Development/hyperidle/.worktrees/L15-4/packages/web/e2e/team-board-task-actions.spec.ts`
- `/Users/tobiasgrundmann/Development/hyperidle/.worktrees/L15-4/packages/web/src/shell/TaskActionsMenu.tsx`
- `/Users/tobiasgrundmann/Development/hyperidle/.worktrees/L15-4/packages/web/src/shell/taskStateRequest.ts`
