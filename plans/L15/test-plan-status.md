# L15 — Test plan status (TDD red phase)

Test files added (absolute paths):

- `/Users/tobiasgrundmann/Development/hyperidle/.worktrees/L15-baseline2/packages/shared/src/__tests__/task-request.test.ts`
- `/Users/tobiasgrundmann/Development/hyperidle/.worktrees/L15-baseline2/packages/design-system/src/__tests__/TaskCard.kebab.test.tsx`
- `/Users/tobiasgrundmann/Development/hyperidle/.worktrees/L15-baseline2/packages/design-system/src/__tests__/TaskCard.title-row.test.tsx`
- `/Users/tobiasgrundmann/Development/hyperidle/.worktrees/L15-baseline2/packages/design-system/src/__tests__/TaskCard.optimistic-prohibition.test.tsx`
- `/Users/tobiasgrundmann/Development/hyperidle/.worktrees/L15-baseline2/packages/web/src/shell/__tests__/Kanban.no-dnd.test.ts`
- `/Users/tobiasgrundmann/Development/hyperidle/.worktrees/L15-baseline2/packages/web/src/shell/__tests__/Kanban.props.test.tsx`
- `/Users/tobiasgrundmann/Development/hyperidle/.worktrees/L15-baseline2/packages/web/src/__tests__/WorkTeam.request-post.test.tsx`
- `/Users/tobiasgrundmann/Development/hyperidle/.worktrees/L15-baseline2/packages/web/src/__tests__/WorkTeam.lazy-bootstrap.test.tsx`
- `/Users/tobiasgrundmann/Development/hyperidle/.worktrees/L15-baseline2/packages/web/src/__tests__/WorkTeam.open-thread.test.tsx`
- `/Users/tobiasgrundmann/Development/hyperidle/.worktrees/L15-baseline2/packages/web/e2e/kanban-drag-noop.spec.ts`
- `/Users/tobiasgrundmann/Development/hyperidle/.worktrees/L15-baseline2/packages/web/e2e/kanban-request-verb.spec.ts`

`bun run test` summary after adding the suite: **10 test files failing, 27 individual tests failing** (3207 pre-existing tests still pass; the 4 new test files that fail at module-import time count in the file failure column but raise no per-test failure rows). One unrelated pre-existing failure in `packages/pipeline/src/__tests__/runner-otel.test.ts > opens a span on task_started …` is not introduced by L15.

Coverage of architecture §9 test plan:

- AC: drag removed (source guard) — `Kanban.no-dnd.test.ts` (15 forbidden symbols + onMoveTask + COLUMN_TO_STATE export + WorkTeam handleMoveTask absence). PROTECTED.
- AC: drag removed (e2e) — `kanban-drag-noop.spec.ts`.
- AC: request fires message — `WorkTeam.request-post.test.tsx` (canonical body, success+failure toasts, network reject).
- AC: lazy bootstrap — `WorkTeam.lazy-bootstrap.test.tsx`.
- AC: open thread — `WorkTeam.open-thread.test.tsx` and `TaskCard.kebab.test.tsx`.
- AC: verb matrix — `task-request.test.ts`.
- AC: conditional title-row click — `TaskCard.title-row.test.tsx`.
- AC: toast on success — `kanban-request-verb.spec.ts`.
- AC: optimistic-update prohibition — `TaskCard.optimistic-prohibition.test.tsx`. PROTECTED.

Deviations from architecture §9 (with reasons):

- The architecture lists a `Canvas.drag-still-works.test.tsx` (Vitest) and `canvas-drag-still-works.spec.ts` (Playwright) under §9. The Vitest variant already exists in the repository (`packages/web/src/__tests__/Canvas.test.tsx`) and is green, so no new file was added. The Playwright spec was deferred — Canvas drag is verified end-to-end today via `packages/web/e2e/work-surface.spec.ts` and `packages/web/e2e/touch-targets.spec.ts`, neither of which contradicts the L15 boundary. Proposal: if the green phase produces any visible Canvas regression risk, add `canvas-drag-still-works.spec.ts` then. Currently out-of-scope by §13.
- The `TaskCard.kebab.test.tsx` was placed in `packages/design-system/src/__tests__/` per architecture §6, even though the existing `TaskCard.test.tsx` lives in `packages/web/src/__tests__/`. This matches the architect's explicit pathing decision and aligns the new sub-tests with the design-system package vitest project.
- The `Kanban.props.test.tsx` test that exercises the new per-task callbacks is currently designed to fail at `screen.getAllByRole('button', …)` because the kebab does not yet render. That is the expected red mode and matches the plan; it will be turned green by Plan tasks T5 + T10.
