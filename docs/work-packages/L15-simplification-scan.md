# L15 Simplification Scan — Findings

Read-only scan of L15 changes. No code modified.

## Findings

### 1. WorkTeam.tsx:15,21-23 — Dead `COLUMN_TO_STATE` import + `void` suppression
**Severity:** high
**Issue:** `COLUMN_TO_STATE` is imported and immediately discarded with `void COLUMN_TO_STATE`. The comment claims it preserves "the public re-export contract from Kanban", but `WorkTeam.tsx` does not re-export anything — it is a page component. `COLUMN_TO_STATE` is already exported directly from `Kanban.tsx:63`, so consumers import it from there.
**Recommendation:** Drop both the named import (`, COLUMN_TO_STATE`) and the `void COLUMN_TO_STATE` line. Pure dead code with a misleading justification comment.

### 2. WorkTeam.tsx:163-175 — Dual navigation (`navigate()` + `window.history.pushState`) is a test workaround in prod code
**Severity:** high
**Issue:** `handleOpenTaskThread` calls `navigate(path)` AND then `window.history.pushState({}, "", path)`. The lore comment admits this exists because `MemoryRouter` does not sync to `window.location`. But `WorkTeam.taskStateRequest.test.tsx:221` asserts `expect(window.location.pathname).toBe("/work/team/task/t1/thread")` — that's the test asserting the wrong thing. In production (BrowserRouter), `navigate()` already updates `window.location`; the manual `pushState` is redundant and could cause a double history entry / drift if React Router's internal state diverges.
**Recommendation:** Remove the `window.history.pushState` block. Fix the test instead — assert via `useLocation()` inside a probe component, or use `createMemoryRouter` and inspect `router.state.location.pathname`. Production code should never carry test scaffolding.

### 3. ensureTaskThread.ts:12-16 — Module-scope cache with test-only reset hook
**Severity:** medium
**Issue:** Module-scope `Map` cache plus an exported `__resetEnsureTaskThreadCache` solely for tests. Two callers exist (`WorkTeam.handleTaskStateRequest` and `WorkTeamTaskThread`'s `useEffect`). Per task open, this fires once. The cache saves at most one GET round trip on re-navigation. It also caches stale data forever (no invalidation if the thread is deleted server-side, no TTL, no eviction). The lore claims "user navigating between Team Board → Thread → back avoids the round trips" — but this is a single GET per task, not a hot path.
**Recommendation:** Delete the module-scope cache and the test reset hook. If perf becomes a concern, hoist into React Query / SWR which already handles invalidation. Premature optimization that introduces a global mutable state hazard.

### 4. useTaskRequestToast.tsx — Dedicated hook for inline toast
**Severity:** medium
**Issue:** 68-line hook + dedicated file for what is a single setState + setTimeout pattern used in exactly one place (`Kanban.tsx`). The `seqRef` race-guard, separate `liveText` mirror, and dual-rendering of visible-pill vs sr-only-fallback add complexity that no test exercises beyond the happy path. The lore itself says "Replace with a global toast container in a future story — single-file change in Kanban.tsx" — acknowledging this is throwaway scaffolding.
**Recommendation:** Either inline the ~15 lines into `Kanban.tsx` (simpler, removes one file), or commit to the global toast container now. The current intermediate abstraction has the worst of both: extraction overhead with no reuse.

### 5. TaskActionsMenu.tsx:26-35 — `STATE_TO_COLUMN_LOCAL` duplicates Kanban's `STATE_TO_COLUMN`
**Severity:** medium
**Issue:** `Kanban.tsx:47-56` defines `STATE_TO_COLUMN: Record<TaskState, KanbanColumnState | null>`. `TaskActionsMenu.tsx:26-35` defines a near-identical `STATE_TO_COLUMN_LOCAL: Record<string, KanbanColumnState>` with `hold`/`killed` mapped to non-null fallbacks instead of `null`. Two sources of truth for the same mapping; they will drift.
**Recommendation:** Export `STATE_TO_COLUMN` from `Kanban.tsx` (or move to `taskStateRequest.ts`) and use a single helper `taskStateToColumn(state): KanbanColumnState` that picks the fallback. Eliminate the local copy.

### 6. Kanban.tsx:99-115 — `COLUMN_LABELS` and `STATE_LABELS` duplicate `taskStateRequest.ts` label maps
**Severity:** medium
**Issue:** `taskStateRequest.ts:12-28` already defines `TASK_STATE_TO_LABEL` and `COLUMN_TO_LABEL` with identical values. `Kanban.tsx` redefines both for toast text construction. Three label maps (Kanban x2 + taskStateRequest x2) for the same four-column vocabulary.
**Recommendation:** Export the label maps (or a `labelFor` function) from `taskStateRequest.ts`. Delete `COLUMN_LABELS`/`STATE_LABELS` in `Kanban.tsx`.

### 7. Kanban.tsx:70-75 vs :99-104 — `COLUMNS` and `COLUMN_LABELS` overlap
**Severity:** low
**Issue:** `COLUMNS: [{key, label}, …]` and `COLUMN_LABELS: Record<key, label>` carry the same data shape twice in the same file.
**Recommendation:** Derive one from the other, or pick one and use it everywhere.

### 8. taskStateRequest.ts:30-33 — `labelFor` uses `in` operator on union of incompatible keys
**Severity:** low
**Issue:** `if (value in COLUMN_TO_LABEL)` happens to work because `"blocked"`, `"in_progress"`, `"done"` collide between `TaskState` and `KanbanColumnState`. The function relies on `"planned"` being the only column-only key. Brittle: any future addition to `KanbanColumnState` that overlaps with a TaskState value silently picks the column branch.
**Recommendation:** Take an explicit discriminator parameter (`kind: "state" | "column"`) or split into two functions `taskStateLabel` / `columnLabel`. The dual-input function is over-generic for two callsites.

### 9. TaskActionsMenu.tsx:47 — `currentColumn` fallback to `"planned"` for unknown states
**Severity:** low
**Issue:** `STATE_TO_COLUMN_LOCAL[task.state] ?? "planned"`. Since `task.state: TaskState` is exhaustively keyed, the `??` branch is unreachable — but the local map's typing as `Record<string, …>` defeats exhaustiveness checking.
**Recommendation:** Type as `Record<TaskState, KanbanColumnState>` so TypeScript guarantees totality and the `??` falls away.

### 10. WorkTeam.tsx:177-182, 190-192 — Mock no-op handlers in production code
**Severity:** low
**Issue:** `handleMoveBet` and `handleAddToCanvas` are empty callbacks with `// Mock —` comments. They satisfy required props on `Canvas` and `PitchSelector`. The page is wired with mock data (`CANVAS_BETS`, `INITIAL_TASKS`, `MOCK_PITCHES`) — half the component is scaffold.
**Recommendation:** Out of L15 scope, but flag: the page is largely a fixture. When real data lands, audit whether all this scaffold survives or gets replaced wholesale.

### 11. ensureTaskThread.ts:42-44 — Sort by `lastActiveAt` then take first; expectation is one thread
**Severity:** low
**Issue:** The endpoint queries `host_kind=task&host_id=<taskId>` — the data model implies one thread per task. Sorting and picking the most recent only matters if multiple threads can exist. If multiplicity is real, the comment should explain why; if not, the sort is dead complexity.
**Recommendation:** Either delete the sort (take `threads[0]` since the server should return at most one) or document the multi-thread case explicitly.

## Summary

- High: 2
- Medium: 4
- Low: 5
- Total: 11
