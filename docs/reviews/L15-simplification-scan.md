# L15 — Simplification Scan (read-only)

**Scope.** Working-tree changes on branch `ab/L15-1a` against `main` for L15 (strip Kanban drag/drop + add per-task request/thread affordance).
**Mode.** Read-only. Findings only — no code edits.
**Files inspected.**
- `packages/shared/src/task-verbs.ts` (new)
- `packages/shared/src/__tests__/task-verbs.test.ts` (new)
- `packages/web/src/shell/Kanban.tsx` (rewrite — DnD removed)
- `packages/web/src/shell/Kanban.stories.tsx` (extended)
- `packages/web/src/shell/TaskRequestPopover.tsx` (new)
- `packages/web/src/pages/WorkTeam.tsx` (rewrite — handler removed, fetch added)
- `packages/web/src/pages/WorkTeamTaskThread.tsx` (new)
- `packages/web/src/router.tsx` (route added)
- `packages/web/src/__tests__/Kanban.test.tsx`, `WorkKanban.grouped.test.tsx`, `WorkTeam.test.tsx`, `TaskRequestPopover.test.tsx`, `WorkTeamTaskThread.test.tsx`, `Kanban.keyboard-drag.test.tsx` (deleted)
- `packages/design-system/src/Tag.tsx`, `Tag.stories.tsx`, `__tests__/Tag.test.tsx`
- `packages/design-system/src/TaskCard.tsx`
- `packages/web/e2e/team-request.spec.ts` (new)
- `packages/server/src/routes/__tests__/threads.routes.test.ts` (extended)
- Plan: `docs/architecture-plans/L15-plan.md`. Approved design: `docs/design-explorations/L15/approved.md`.

---

## MUST-FIX

- **Duplicated `decodeThreadDetail` + `ThreadDetailDecodeError` + `isObject`** between `packages/web/src/pages/WorkTeamTaskThread.tsx:26-82` and `packages/web/src/pages/ConversationsReview.tsx:38-82`. The plan §10 says the new page "mirrors the ConversationsReview fetch pattern" — and it does, by copy/paste. ~60 lines of identical decode logic in two places. The next time the server changes a thread-detail field shape, one of the two will silently rot. Extract a single `decodeThreadDetail` (and `isObject`) into a shared module — `packages/web/src/lib/thread-detail.ts` — used by both pages.

- **`WorkTeamTaskThread.tsx:62-75` defensively patches the server response with `as unknown as Thread`** — exactly the unsafe cast banned by the project's TypeScript rule ("no unsafe `as` casts"). The "defensive defaults" (`participants: []`, `lastActiveAt: new Date(0).toISOString()`, `initiatorId: ""`) silently mask a malformed server response and produce an apparently-valid Thread that ThreadShell will then misrender. Either the server endpoint always returns these fields (then this code is dead) or it doesn't (then the cast lies). The plan §5.3 explicitly relies on `GET /api/threads/{id}` being authoritative — it is. Drop the patching block; if `decodeThreadDetail` fails validation, route to the `error` state instead.

- **`WorkTeamTaskThread.tsx:139-156` `onAppend` is wired to `<ThreadShell>` but is never exercised by L15** (no AC requires composing in the thread page; the L15 popover does the posting). It re-fetches the entire thread after every append (full GET, no diff), uses a stale closure over `state`, and silently swallows non-OK responses (no error UI). This is YAGNI on top of a correctness bug. Either delete the `onAppend` handler (let `<ThreadShell>` render read-only for L15) or pull the proven handler from `ConversationsReview.tsx` rather than reimplementing a shakier copy.

- **`WorkTeam.tsx:161-188` re-fetches all task thread metadata on mount but uses `INITIAL_TASKS` instead of the React state**. The dependency array is `[]`, so the effect captures the constant fixture by name — not the `tasks` state. After a successful request post, `handleTaskRequestSent` mutates `tasks`, but a remount would discard the optimistic delta and re-fetch from scratch (acceptable). The real issue: the cleanup function calls `ac.abort()`, but the fetches inside `fetchThreadMetaForTask` do not pass the `signal` — so the abort does nothing on inflight requests, and the post-await `setTasks` will run after unmount (React state-on-unmounted-component warning). Either thread `signal` through `fetchThreadMetaForTask` or drop the AbortController theater.

## SHOULD-FIX

- **`Kanban.tsx:117-166` introduces a `TaskCardActions` sub-component that does almost nothing**. It computes `verbs.length`, picks an aria-label, and conditionally renders `<TaskRequestPopover>` + `<Tag>`. It's only called from `renderTask` (one site). The card-state-derivation rules in approved.md §3 (the four card-variant table) are simple enough to inline at the call site, or at minimum the helper should live next to `renderTask` (also a one-call helper) and be flattened into the JSX. Two single-call helpers + one inline render path is one indirection too many for ~30 lines of conditional JSX.

- **`Kanban.tsx:168-195` `renderTask` is a one-call helper** that exists only because the grouped/non-grouped paths each map over the same shape. Inline it as a local `const renderTask = (task) => …` inside the component (closes over `founderId`, `founderName`, `handleSent`) — the `RenderTaskOptions` interface and the four-prop ceremony disappear. Saves ~15 LOC and removes one type-cliff per task render.

- **`TaskRequestPopover.tsx:47-95` `postRequest` lives at module scope but takes the entire popover's identity surface as a prop bag** (task, founderId, founderName, threadId, verb, note, clientKey — 7 args). The function is called from one place. Either keep it module-local (current state, but argue for it) OR — better — fold it into `handleSend` as a try/await block. It's a fetch wrapper, not a domain primitive. Also: the function silently retries via re-call on failure but doesn't reuse the `clientKey`, defeating the server-side idempotency the plan §10 trade-off (4) explicitly purchased. Hoist `clientKey` generation out of `handleSend` so a retry uses the same key.

- **`Kanban.tsx:13` re-imports `requestableVerbsFor`** to compute `hasRequest = verbs.length > 0` for the "should the action footer render" decision — but the same computation happens inside `<TaskRequestPopover>` (line 98 there) which returns `null` for terminal states. Decide once: either the parent skips rendering the popover when verbs are empty, or the popover skips itself. Currently both happen, so the parent's check is dead-code defense.

- **`TaskRequestPopover.tsx:23-27` defines `TaskRequestPopoverTask` as a 3-field structural subset of `KanbanTask`**. The Kanban then constructs this subset inline at line 140: `task={{ id: task.id, state: task.state, ownerAgentId: task.ownerAgentId }}`. This is prop-narrowing for its own sake — the popover doesn't mutate the task, and the subset adds zero type safety (the Kanban already has the full task). Take `task: KanbanTask` directly; drop the alias type and the inline rebuild.

- **`Kanban.tsx:127`** `const hasThread = (task.threadId ?? null) !== null && threadCount > 0;` — `threadCount > 0` is the actual signal; `threadId !== null` only matters if you want to distinguish "thread exists with zero messages" from "no thread". The L15 contract creates the thread *with* an initial message (plan §5.4 + popover code at TaskRequestPopover.tsx:67-73), so a threadId-without-messages should not exist. Either drop the redundant check or document why both conditions are required.

- **`WorkTeam.tsx:128-134`** declares two single-purpose interfaces (`ThreadListResponse`, `ThreadDetailResponse`) and casts JSON parse results to them. The `ThreadDetailResponse` is `{ messages: ReadonlyArray<unknown> }` — the cast tells the type checker "trust me, the server returns this shape" without runtime validation. The same risk vector that `decodeThreadDetail` exists to prevent in `WorkTeamTaskThread.tsx` is brushed off here. Either reuse the (to-be-extracted) `decodeThreadDetail`, or treat the parse result as `unknown` and check it.

- **`Kanban.tsx:65-74` `STATE_TO_COLUMN` keeps `hold: null, killed: null`**. The grouping loop skips nulls. With drag deleted, this map only serves the grouping projection; the partial map could be a `Partial<Record<TaskState, KanbanColumnState>>` and the loop could just check membership. The `null` sentinel + `if (col !== null)` adds noise. The `@lore I4` comment defends the exhaustiveness — fair, keep the exhaustive `Record<TaskState, …>`, but consider dropping the `| null` and using a `"hidden"` literal so the type/value coupling is clearer than "null means hidden."

- **`Tag.tsx:38-71`** the unread variant short-circuits the `kind` registry: when `meta` is undefined AND `unread` is true, render the unread chip. This implies that passing `kind="some-unknown-string" + unread={true}` — both invalid kind AND unread — falls through to the unread branch via the defensive `meta ?? undefined` guard at line 44. The "kind wins when both are set" mutual-exclusion documented on TagProps:13-14 only holds when `kind` is a *valid* registered kind. Either make the precedence test `if (kind != null) { return kindBranch }` first OR document that the precedence is "valid kind > unread > default" not "kind > unread."

- **`Kanban.tsx:83-84`** `DEFAULT_FOUNDER_ID = "u-founder"` and `DEFAULT_FOUNDER_NAME = "A. Founder"` are hardcoded auth-shaped defaults baked into a presentation component. When real auth lands, every component carrying these defaults becomes a search-and-replace landmine. Either require `founderId` + `founderName` as required props (`WorkTeam.tsx` already knows them or could) or read them from a context — but don't ship "u-founder" as a default in the design-system-adjacent layer.

## NICE-TO-HAVE

- **`WorkTeamTaskThread.tsx:33-35` `isObject` is defined twice in the codebase** (here and in `ConversationsReview.tsx`). When the shared `thread-detail.ts` is extracted (MUST-FIX above), this disappears too.

- **`TaskRequestPopover.tsx:155-228` is a 70-line JSX block** with three nested `?:` (verb list, error strip, sending state). Extracting `<VerbButton verb selected onSelect />` would compress lines 177-191 to one line and make the kill-styling rule explicit. Worth it only if a second consumer ever needs the verb-list grammar; for one consumer, current shape is fine.

- **`Kanban.test.tsx:93-97`** asserts that `resolveKanbanDrop` and `COLUMN_TO_STATE` are `undefined` exports of the module. This is structural negative-space testing — it asserts the absence of code. The test will go stale the moment someone re-adds an unrelated export with a similar name. The drag-is-no-op behavior is asserted at lines 114-129 already; the export-shape assertion is belt-and-braces and could go.

- **`WorkTeam.test.tsx:93-96`** also asserts `mod.COLUMN_TO_STATE === undefined`. Same comment as above — duplicate of the assertion in `Kanban.test.tsx:93-97`.

- **`Kanban.stories.tsx`** wraps every story in `<MemoryRouter>` because `TaskCardActions` renders an `<a href>` for the thread chip. If the story viewer mounts a Router globally (`packages/web/src/designsystem/`), the per-story wrappers are redundant. Worth checking the design-system harness once.

- **`Kanban.tsx:234-236` `handleSent`** is a one-liner that just forwards to `onTaskRequestSent?.(taskId, result)`. Inline at the call site (line 189) — the closure ceremony adds nothing.

- **`packages/server/src/routes/__tests__/threads.routes.test.ts`** is extended with L15-specific assertions per plan §6 step 13. Good. Confirm the new block is appended to the existing `describe`, not a new file (file count unchanged is the goal). Did not re-read the test file to verify the ordering — flagging for the reviewer.

- **`WorkTeamTaskThread.tsx:90-189`** the page is a state-machine with 4 states (`loading | error | empty | loaded`). The decode-error path collapses into the `catch` block as a generic "Network error" — the user sees "Network error" when the actual problem is a malformed server payload. Distinguish `decode_error` from `network_error` so failures are diagnosable from the UI without opening DevTools.

---

## VERDICT

**REVISE.** Four MUST-FIX items: a copy/paste duplication that splits `decodeThreadDetail` across two files, an unsafe `as unknown as Thread` cast that violates the strict-TS rule, an unused-but-broken `onAppend` handler with a stale-closure bug, and a fetch-fan-out whose AbortController doesn't actually abort. None of these block the AC, but all of them turn into incidents the moment the server contract drifts or the user navigates away mid-fetch. Fix before merge.

The good news: the L15 contract itself is clean. `task-verbs.ts` is the right shape, the popover composes DaisyUI primitives directly per the no-wrapping rule, drag deletion is total, the test surface covers the AC. The simplification debt is concentrated in the new `WorkTeamTaskThread` page and a few thin helper layers in `Kanban.tsx` — not in the L15 domain logic.
