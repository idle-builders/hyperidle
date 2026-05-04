# L15 Slop Scan — Findings

Read-only AI anti-pattern scan over L15-changed files. Severity legend: **HIGH** = clear slop, must fix; **MED** = should fix; **LOW** = nit / consider.

## packages/web/src/shell/Kanban.tsx

- **HIGH** L156–157, L165: Dead computation. `fromLabel` is built from `STATE_LABELS[task.state]` but never read; `toLabel` is used but the local is fine to inline. The whole `STATE_LABELS` const (L106–115) exists solely to compute the unused `fromLabel`. Drop `STATE_LABELS` and `fromLabel`; inline `COLUMN_LABELS[target]` at the toast call site or remove the indirection. The trailing comment "Re-emit result so the menu can re-open on failure." (L163) restates the `return result` line — remove.
- **MED** L99–104 vs L70–75: `COLUMN_LABELS` and `COLUMNS` carry the same four label strings. One source of truth is enough; map `COLUMNS` to a label lookup or vice-versa.
- **MED** L47–56 vs `taskStateRequest.ts` L12–21 vs `TaskActionsMenu.tsx` L26–35: The TaskState→column mapping is duplicated **three times** across the diff with the same eight keys. Centralize in one module (e.g., `taskStateMap.ts`) and import — current state is a maintenance landmine.
- **LOW** L58–62 lore comment on `COLUMN_TO_STATE` says "Kept exported even after L15's drag removal because consumers (and the menu copy) still need the column→state vocabulary" — but `WorkTeam.tsx` explicitly imports it only to `void` it (see below). If the menu doesn't use it either, delete the export.

## packages/web/src/pages/WorkTeam.tsx

- **HIGH** L15, L21–23: `COLUMN_TO_STATE` is imported and immediately discarded with `void COLUMN_TO_STATE` plus a comment justifying it ("imported only to keep the public re-export contract from Kanban; not used directly here after L15. Suppress unused."). This is pure ceremony — re-exports are a build-time concern, not a runtime import. Remove the import and the `void` line entirely.
- **HIGH** L168–172: Manual `window.history.pushState` after `navigate()` with a comment "MemoryRouter does not sync to window.location." This is production code being warped to satisfy a test environment. Either the test should use a router that updates location, or the component should expose navigation behavior testably — production should not push history twice on every click. Defensive shim for a test gap.
- **MED** L177–181, L190–192: `handleMoveBet` and `handleAddToCanvas` are stubs with comments "Mock — …". If they are no-ops, pass `undefined`/optional handlers from the children, or extract the mock data + stubs to a fixture. They look like real handlers in a production file.
- **LOW** L137: `formatStateRequestText(task.state, targetColumn)` builds a state-request text string but the resulting `text` is only sent to the server inside the `payload`. Confirm the server-side renderer is the one that splits on `STATE_REQUEST_PREFIX` — otherwise this format is unused.

## packages/web/src/shell/taskStateRequest.ts

- **MED** L23–33: `labelFor` uses `value in COLUMN_TO_LABEL` to disambiguate, then casts. Since `KanbanColumnState` and `TaskState` overlap on `"blocked"`, `"in_progress"`, `"done"`, the precedence is silent and untested. Either take two typed params (`from: TaskState`, `to: KanbanColumnState`) or use a discriminator — a runtime `in` check + cast is fragile.
- **LOW** L46–50 lore comment on `makeStateRequestClientKey` references a regex constraint `/^[A-Za-z0-9_\-:.]{8,128}$/` but the function does not validate against it. Either assert (and test the failure mode) or drop the false promise.

## packages/web/src/shell/ensureTaskThread.ts

- **MED** L37–40: `(await listResp.json()) as { threads?: Array<{ id: string; lastActiveAt?: number }> }` — unchecked cast on a network response. If the server returns `{ error: "..." }` with status 200 (unlikely but happens), `threads ?? []` masks it. Use a Zod parse or accept the runtime risk explicitly via `@lore`.
- **LOW** L60: `title: \`Task ${taskId}\`` — placeholder title for a thread created on lazy creation. Marketing-flavor placeholder. Either omit the field (let the server default) or move to a constants file with a TODO referencing L18.
- **LOW** L14–16: `__resetEnsureTaskThreadCache` is a test-only escape hatch baked into production code. Acceptable but the double-underscore convention is unconventional in this codebase — verify it's documented elsewhere or move the cache into a factory injected by tests.

## packages/web/src/shell/useTaskRequestToast.tsx

- **MED** L46–50: Multi-line lore comment narrates the JSX structure that follows ("a single role=status aria-live region that wraps the visible toast pill…"). The JSX is ~10 lines and self-evident; this is a comment that restates the code. Trim to one sentence or drop.
- **LOW** L20: `TOAST_DURATION_MS = 3000` — magic number is fine, but the duration is also part of the visual contract; consider sourcing from a design token (`--motion-toast` or similar) if one exists.

## packages/web/src/shell/TaskActionsMenu.tsx

- **HIGH** L26–35: `STATE_TO_COLUMN_LOCAL` — third copy of the TaskState→column map (see Kanban.tsx finding). The `_LOCAL` suffix is an AI tell ("I know this duplicates something else, here's a flag"). Centralize.
- **MED** L73–76: Comment "Re-open submenu on failure for retry; restore focus to the failed target." The code re-opens the submenu but does **not** restore focus to the failed target — there is no focus-management call in this branch. Comment lies about behavior. Either implement focus restore or correct the comment.
- **MED** L86–107: `handleRootKeyDown` mixes "is open" gating, escape handling, submenu shortcut matching, and root shortcut. The function is small enough today but the imperative `if/return` ladder is the kind of thing that grows. Consider a single `switch (e.key)` for clarity.
- **LOW** L133: Comment `{/* lucide MoreVertical, inlined — no new dep */}` — explanation for why a dep wasn't added is fine as `@lore`, not as a JSX comment that ships in the bundle (it doesn't, but the noise is in source).
- **LOW** L19–24: `STATE_OPTIONS` shortcut keys (`p`/`b`/`i`/`d`) are not displayed to the user anywhere in the menu. Either show them (`<kbd>` hint) or drop the shortcut field; undocumented shortcuts are dead UX.
- **LOW** L184: `disabledCls = isCurrent ? " opacity-50 cursor-not-allowed" : ""` — `disabled` attribute already styles the button via DaisyUI. Hardcoded `opacity-50` and `cursor-not-allowed` likely duplicate the framework default. Verify.

## packages/design-system/src/TaskCard.tsx

- **LOW** L40–50: 11-line lore block on a `relative` className addition. The K11 token mapping note is useful; the L15 note "Visual parity preserved when overflowMenu is undefined (slot is not rendered)" restates the conditional render below it. Trim the L15 half to one line.
- **LOW** L69–76: `data-task-overflow` attribute is set but I could not find a CSS rule or test selector that uses it (search the worktree if so). If unused, drop. The `data-[density=comfortable]:opacity-100` Tailwind variant assumes the attribute is on the same element — confirm density attribute is forwarded to the slot wrapper, not just the card root.

## packages/web/src/pages/WorkTeamTaskThread.tsx

- **MED** L34: `setError(\`server-${resp.status}\`)` — error code is rendered to the user verbatim ("Failed to load: server-500"). Either map to a human string or surface the numeric status separately for diagnostics. Current shape is debug output leaking into UI.
- **LOW** L11–14: `ThreadDetailResponse` is declared inline. If the server defines this type in `@hyperidle/shared`, import it instead of redeclaring.

## Tests (spot checks)

- `packages/web/src/__tests__/Kanban.no-drag.test.tsx` — name implies an absence test ("verify no drag handlers"). Negative-assertion tests against a removed feature tend to rot. Once the next refactor lands, this test will be the first to be deleted; consider whether it earns its keep or whether a single grep-style check suffices.

---

## Counts

- HIGH: **4**
- MED: **9**
- LOW: **10**

## Top three to fix first

1. Eliminate the triple-duplicated TaskState→column map (Kanban.tsx, taskStateRequest.ts, TaskActionsMenu.tsx).
2. Remove the dead `STATE_LABELS` / `fromLabel` and the `void COLUMN_TO_STATE` ceremony in WorkTeam.tsx.
3. Fix or remove the manual `window.history.pushState` shim in `handleOpenTaskThread` — production code should not be shaped by MemoryRouter quirks.
