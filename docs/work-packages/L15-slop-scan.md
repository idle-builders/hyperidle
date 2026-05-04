# L15 Slop Scan

Read-only scan for AI-specific code anti-patterns across L15 changed files. No code was modified.

## Methodology

Pattern catalogue applied:
- Verbose / over-helpful naming
- Comments that restate code or reference the current PR/story/task
- Defensive validation at internal trust boundaries
- Try/catch that swallows or rewraps non-throwing code into a generic shape
- Unnecessary `async`
- Speculative future-proofing (`// Future story:`, optional params with no caller)
- Magic-number / magic-string duplication
- Tautological test names (`should successfully ...`)
- Filler comments / re-export-only files

---

## CRITICAL (must fix)

### C-1 — `clientKey` collision risk in `WorkTeam.tsx` makes idempotency a lie
**File:** `packages/web/src/pages/WorkTeam.tsx:129`

```ts
clientKey: `req-${taskId}-${verb}-${Date.now()}`,
```

The whole point of `clientKey` is that a retry of the SAME logical click reuses the SAME key so the server can return 200 instead of inserting a duplicate (`appendPlainMessage` idempotency). This builder regenerates the key on every render-time call, so:
- A user who double-clicks within 1 ms gets a 409 `idempotency_conflict` (same ms, same payload — wait, same payload returns 200; but if `Date.now()` clicks tick differently, two distinct rows are inserted — duplicate request).
- A network retry from the browser can't reuse the key because the next call recomputes `Date.now()`.

The server-side idempotency_conflict logic in `append-plain-message.ts:134-144` is now dead weight from this caller's perspective. Either the caller must derive a stable key per click intent (e.g. `crypto.randomUUID()` captured before dispatch and held until ack), or the docstring promise of idempotency is a fiction at the page layer.

This is not "slop" in the comment sense, but it is the canonical AI-tell of "sprinkle `Date.now()` to make it unique" without thinking through the protocol.

---

## WARNINGS (should fix)

### W-1 — `appendPlainMessage` is synchronous but its tests `await` it
**Files:** `packages/server/src/services/append-plain-message.ts:94-205`, `packages/server/src/services/__tests__/append-plain-message.test.ts:104,127,144,156,164,176,183,194,205`

`appendPlainMessage` is a plain (non-`async`) function — every call site (`tasks.ts:298`) treats it as sync, drizzle/sqlite is sync, and the function returns `AppendPlainResult` (no `Promise<>` in the type). Yet every test in `append-plain-message.test.ts` is an `async` arrow with `await appendPlainMessage(...)`. The awaits are no-ops on a non-thenable; this works only because `await` on a value coerces to `Promise.resolve(value)`.

The tests advertise an asynchronous API that doesn't exist. Either:
- The helper should be `async` (it isn't, and shouldn't be — there's no I/O suspension), or
- The tests should drop the `async` and `await` to honestly signal a sync API.

This is a textbook AI-tell: "tests that mock the shape of async because the model assumed any DB call is async."

### W-2 — `WorkTeam.tsx` ships five no-op handlers stubbed with `// Future story:`
**File:** `packages/web/src/pages/WorkTeam.tsx:150-181`

```ts
const handleOpenThread = useCallback((_taskId: string): void => {
  // Future story: route push to thread surface.
}, []);
const handleReplyInThread = useCallback((_taskId: string, _body: string): void => {
  // Future story: open composer over thread surface.
}, []);
const handleSnooze24h = useCallback((_taskId: string): void => {
  // Future story: POST /api/tasks/:id/snooze.
}, []);
const handleCopyLink = useCallback((_taskId: string): void => {
  // Future story: clipboard copy of task deep-link.
}, []);
const handleAddToCanvas = useCallback((_pitchId: string): void => {
  // Mock — real implementation promotes the pitch to a canvas bet.
}, []);
const handleMoveBet = useCallback(
  (_betId: string, _targetStatus: "shaped" | "committed"): void => {
    // Mock — the team-board canvas does not persist bet moves yet.
  },
  [],
);
```

Six dead callbacks wired into the component tree with `useCallback([])` so React never frees them, propagating the illusion that the menu is wired. The comments are textbook "AI tells": `// Future story:`, `// Mock —`. These belong in the work-package backlog, not source. Either:
- Don't pass them to `<TaskActionsMenu>` so the menu hides the items, or
- Add the items only when their handlers exist.

Bonus: `_taskId` / `_body` underscored params on stubs that do nothing are pure noise.

### W-3 — `MenuItem` ternary that can never be truthy
**File:** `packages/design-system/src/TaskActionsMenu.tsx:118-120`

```tsx
className={`... ${
  danger ? "" : ""
}`}
```

A ternary that returns the empty string in both branches. Either delete it or finish the danger styling — leaving a dead toggle is exactly the "I left a hook for later" pattern that confuses every future reader. The `danger` prop is still meaningful (line 123 colors the text), but this branch is dead.

### W-4 — `TaskActionsMenu` `secondary` strings duplicated between server-rendered text and UI
**Files:** `packages/shared/src/task-request-verbs.ts:27-35` (`REQUEST_VERB_TEXT`), `packages/design-system/src/TaskActionsMenu.tsx:30-66` (`VERB_DEFS`)

`REQUEST_VERB_TEXT` and `VERB_DEFS[*].primary` are the same canonical strings restated:
- `request_stop` → "Request stop" (in shared) and "Request stop" (in TaskActionsMenu)
- ...for all seven verbs.

If the canonical text changes in `@hyperidle/shared`, the menu silently drifts. The `VERB_DEFS` map should consume `REQUEST_VERB_TEXT[verb]` for `primary` and only own the secondary copy + shortcut. Right now the canonical-text source-of-truth claim in the L15 plan is undermined by client-side duplication.

### W-5 — `dbRowToMessage` duplicated verbatim between `tasks.ts` and `append-plain-message.ts`
**Files:** `packages/server/src/routes/tasks.ts:37-62`, `packages/server/src/services/append-plain-message.ts:67-92`

The exact same `rowToMessage` / `dbRowToMessage` switch-on-`parsed.type` exists in two places. One of them (the route's `dbRowToMessage`) is now unused for the request handler — the route delegates to `appendPlainMessage` which converts internally. Verify whether `tasks.ts:37-62` still has a caller for the request path; if not, delete the duplicate.

### W-6 — Boilerplate JSDoc on internal helpers
**Files:** `packages/server/src/routes/tasks.ts:64-66, 99-102`

```ts
/**
 * Zod schemas for request validation.
 */
const createTaskSchema = ...

/**
 * Create Hono routes for task endpoints.
 * Requires db and eventBus injected.
 */
export function createTaskRoutes(...) { ... }
```

The names already say this. Pure filler. Not introduced by L15, but the L15 file additions follow the same pattern and inflate the file.

### W-7 — `kanban` test grep-on-source instead of behavior
**File:** `packages/web/src/__tests__/Kanban.no-drag.test.tsx:43-87`

V-1b assertions are nine `expect(KanbanSource).not.toMatch(...)` checks — they verify that strings like `useDraggable`, `KeyboardSensor`, `DragOverlay` are absent from the source file. This is a brittle, refactor-hostile pattern: any rename, any string in a comment, any re-introduction of `@dnd-kit/core` for an unrelated purpose breaks them. The behavior these are trying to assert (no drag) is fully observable from the rendered DOM (which V-1a already checks). The source-grep tests are AI-padding: they look thorough but verify implementation details, not contract.

V-1c (`COLUMN_TO_STATE` is no longer exported) is exactly the same story: a TS export check belongs to the type checker, not a runtime test.

### W-8 — `WorkTeam.menu.test.tsx` uses fileURL-source-grep for "handleMoveTask is removed"
**File:** `packages/web/src/__tests__/WorkTeam.menu.test.tsx:33-41`

```ts
expect(WorkTeamSource).not.toMatch(/handleMoveTask/);
expect(WorkTeamSource).not.toMatch(/COLUMN_TO_STATE/);
```

Same anti-pattern as W-7 — assertions on source text rather than behavior. If a developer adds a `// don't reintroduce handleMoveTask` comment, the test fails. These checks belong in a one-shot `simplification-scan` audit, not the standing test suite.

### W-9 — Dead-code error-rewrap that hides the real cause
**File:** `packages/server/src/services/append-plain-message.ts:174-181`

```ts
} catch (cause) {
  return {
    ok: false,
    status: 500,
    code: "internal_error",
    message: `Failed to append message: ${String(cause)}`,
  };
}
```

The wrapped block is two drizzle calls inside `db.transaction`. The TypeScript rules in `.claude/rules/typescript.md` explicitly say: *"Use result types for expected errors. Let unexpected errors propagate — no swallowing with try-catch."* This catch swallows every unexpected error (FK violation, malformed JSON, sqlite busy) into a single string and loses the stack. Either:
- Specify which exact errors are expected and let the rest propagate, or
- Delete the catch.

Same critique applies — to a milder degree — to the `try { JSON.parse } catch { return 500 }` at line 105-114; that one at least narrows the failure to a known shape (malformed participants column), which is fine, but the `String(cause)` interpolation leaks DB internals into client responses.

---

## OBSERVATIONS

### O-1 — Filler comment block restating function purpose
**File:** `packages/web/src/shell/Kanban.tsx:43-48`

```ts
/**
 * Maps every TaskState to a Kanban column, or `null` for states the board
 * deliberately hides (hold, killed). Exhaustive `Record<TaskState, …>` so the
 * type checker flags any new TaskState — a partial map would silently drop
 * tasks on union growth.
 */
const STATE_TO_COLUMN: Record<TaskState, KanbanColumnState | null> = { ... };
```

The TS type is self-documenting; the comment restates it. Worth trimming if the file is touched again.

### O-2 — Tautological test descriptions
**Files:**
- `packages/server/src/services/__tests__/ensure-task-thread.test.ts:104` — *"when the conditional UPDATE returns rowcount=0 (race lost), the speculative thread row is deleted and TaskThreadRaceLost is thrown internally"* — a 25-word implementation summary. The "should" / "when X returns Y" phrasing is the canonical AI-test-name shape.
- `packages/server/src/services/__tests__/ensure-task-thread.test.ts:145` — *"exports `TaskThreadRaceLost` as the sentinel error class"* — a TS export check; delete it (the type checker enforces it).
- `packages/server/src/services/__tests__/append-plain-message.test.ts:155` — *"is idempotent on (threadId, senderId, clientKey) — same payload returns 200 with same message id"* — fine substantively, but verbose.

### O-3 — Speculative comment in `task-request-verbs.ts`
**File:** `packages/shared/src/task-request-verbs.ts:8-10`

```ts
* @lore L15 § 2.4: agents move state machines; humans request. The matrix
* encodes which requests are LEGAL to send for a state, not what the agent
* MUST honor. The agent decides.
```

Useful lore — keep it. But the file header `L15 § 3.1 — task request verbs.` references the work-package section number; once L15 ships these section anchors will rot when the plan is reorganized. Lore-doc convention in this codebase already uses `@lore` to link to spec sections; the file-header restating the same thing is duplication.

### O-4 — `requestBodySchema` reason length not centralized
**Files:** `packages/server/src/routes/tasks.ts:33` (`z.string().min(1).max(2048).optional()`) and `packages/server/src/routes/threads-schema.ts:37` (same `min(1).max(2048)`).

The same `2048` magic number is duplicated. One constant in `@hyperidle/shared` (e.g. `REQUEST_REASON_MAX_LEN`) would let server + UI agree.

### O-5 — `readSenderId` and `DEFAULT_FOUNDER_ID` re-declared in `tasks.ts`
**File:** `packages/server/src/routes/tasks.ts:24-29`

`DEFAULT_FOUNDER_ID = "u-founder"` is also exported from `services/task-authz.ts:17`. Two sources for the same magic string in the same package. The route should import from the service.

### O-6 — `MenuItemProps.danger` prop is partially-implemented
**File:** `packages/design-system/src/TaskActionsMenu.tsx:88-94, 112-135`

`danger` controls only the text color. The L15 mockup likely calls for a hover state too; the dead ternary on line 118-120 betrays an in-progress implementation that was checked in. Either finish or simplify.

### O-7 — Interface name `KanbanTask` reused for both shell prop and test fixture
**Files:** `packages/web/src/shell/Kanban.tsx:14-22` and tests. Not a defect; just note that the `pendingRequest?: PendingRequestSummary | null` field is the only way the page tells the menu to show "cancel" — if `pendingRequest` is `undefined` (not `null`), the boolean coercion in `WorkTeam.tsx:190` `Boolean(task.pendingRequest)` masks the missing-field case as "no pending." Fine for the mock data, will bite live data once the server populates it.

### O-8 — `appendPlainMessage` re-reads thread + message after insert
**File:** `packages/server/src/services/append-plain-message.ts:194-198`

After the transaction inserts a known row, the helper does two extra `SELECT`s to fetch the just-inserted message and the just-updated thread. We already know all the values. This is the AI pattern of "trust nothing, re-read everything." Two extra round-trips per request. Not a critical, but the right shape would be to construct the result directly from the inputs + `now` + `messageId`.

---

## VERDICT

**REVISE.**

C-1 (clientKey collision builder in `WorkTeam.tsx`) defeats the very idempotency contract L15 is supposedly establishing. W-1 (sync function awaited everywhere) and W-9 (catch-all that swallows unknown errors and rewraps as a generic 500) violate explicit project rules. W-2 (six stubbed `// Future story:` callbacks) is the headline AI-slop pattern in this PR. The rest are cleanup items that should be addressed before this leaves the worktree.

### Severity counts
- **CRITICAL:** 1
- **WARNINGS:** 9
- **OBSERVATIONS:** 8

### Top 3 most egregious
1. **C-1** — `clientKey: \`req-${taskId}-${verb}-${Date.now()}\`` in `WorkTeam.tsx:129`. Idempotency theatre.
2. **W-2** — Six `// Future story:` no-op callbacks wired into `<TaskActionsMenu>` so the UI lies about what works.
3. **W-1** — `appendPlainMessage` is synchronous; every test `await`s it as if it were async. The contract advertised by the test suite does not match the function signature.
