# L15 Adversary Review

## CRITICAL

1. **Killed/hold tasks can post state-change requests with misleading copy.**
   `WorkTeam.handleTaskStateRequest` builds `text` via `formatStateRequestText(task.state, targetColumn)`. `TaskActionsMenu.handleSelectState` allows fire on `hold`/`killed` because it falls back to `"planned"` for currentColumn — a `killed` task can request, and the message loses its true state in the copy.
   Files: `packages/web/src/pages/WorkTeam.tsx`, `packages/web/src/shell/TaskActionsMenu.tsx`.

2. **`pickThreadId` selects wrong thread.**
   `ensureTaskThread.ts` `pickThreadId` initializes `bestActive` to `-Infinity` and uses `>=`. When `lastActiveAt` is missing on all rows, it ends up returning the LAST array element (not the first). Also, no defensive filter `t.hostKind === "task" && t.hostId === taskId` — fully trusts query-param semantics. If the server contract drifts, the wrong thread receives the message.
   File: `packages/web/src/shell/ensureTaskThread.ts`.

3. **Concurrent double-click race; idempotency not actually proven.**
   `TaskActionsMenu.handleSelectState` is not guarded by an `inFlight` flag. `clientKey` includes `Date.now()` ISO at ms precision — two clicks in different ms produce different keys, defeating idempotency under fast double-click. The "concurrent identical requests" test asserts `>= 1` — tautology.
   File: `packages/web/src/shell/TaskActionsMenu.tsx`, `packages/web/src/__tests__/WorkTeam.taskStateRequest.test.tsx`.

## WARNINGS

4. **Fragile sibling-selector spacing in TaskCard.**
   `TaskCard.tsx` replaced `flex flex-col gap-` with `[&>*+*]:mt-[var(--density-card-gap)]`. `overflowMenu` is rendered as an absolute-positioned sibling — margin is dropped, but reorder children → broken spacing.

5. **Mobile: no `touchstart`/`pointerdown` outside-click for menu.**
   `TaskActionsMenu` listens on `mousedown` only — menu won't close on tap-outside on touch devices. No focus trap inside the menu.

6. **Keyboard shortcuts hijack typing.**
   Plain `p/b/i/d/t` letters fire global handler without modifier or `e.target` check. Any future focused input/textarea inside the card subtree gets hijacked.

7. **Stale `sr-only` toast announcement.**
   `Kanban.tsx` toast: dead `<span className="sr-only">{liveText}</span>` only renders when toast is null but liveText was set, announces stale text post-dismissal.

8. **`useState<KanbanTask[]>(INITIAL_TASKS)` without setter.**
   `WorkTeam.tsx`: tasks never change. The `tasks` dependency in `useCallback` is phantom reactivity. Should be a module const.

9. **Submenu re-open on error doesn't restore focus to the failed item.**
   `closeAll(true)` already moved focus to trigger; user has to re-navigate. Test claims "focus on error" but doesn't assert.

## OBSERVATIONS

10. **`formatStateRequestText` runtime branch via `in COLUMN_TO_LABEL` is brittle.**
    `"blocked"` and `"done"` are members of BOTH `TaskState` and `KanbanColumnState`. Branch collapse only works because labels happen to match.

11. **No per-taskId memo of `ensureTaskThread`.**
    Every kebab open + state-request click runs GET+POST chain. N clicks = N round trips on the same threadId. Memoize per taskId for page lifetime.

12. **POST has no `credentials: "include"`.**
    Tests overwrite `global.fetch`; never assert auth headers. Cross-origin session cookies → silent 401s in prod.

13. **Test selector `closest(".flex.flex-col")` for "column" is ultra-fragile.**
    Coupled to Tailwind class internals.

## Verdict
**REVISE** — fix the three CRITICALs before ship; tighten test quality.
