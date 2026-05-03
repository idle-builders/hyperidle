# L15 — Architecture plan

Inputs (fixed): `L15-brief.md`, `L15-design.md`. Do not re-litigate.

Codebase grounding: every named symbol below was grep-verified in this worktree on 2026-05-04.

---

## 1. Acceptance criteria + verification methods

| # | Criterion | Verification |
|---|-----------|--------------|
| AC1 | Drag-to-move on Team Board Kanban is a no-op (sensors + handlers + drop zones removed) | Vitest `Kanban.test.tsx` (no `useDraggable`/`useDroppable`/`DndContext` exports detectable in module shape; `onMoveTask` prop is gone) + Playwright drag-attempt-on-task-card asserts task did not move column. |
| AC2 | The `handleMoveTask` callback at `WorkTeam.tsx:116-120` and the `COLUMN_TO_STATE` import are gone | Vitest `WorkTeam.test.tsx` updated: assert `WorkTeam` module no longer exports nor imports `COLUMN_TO_STATE`. Source-grep test (mirrors the existing `KeyboardSensor` source check at `Kanban.test.tsx:117`). |
| AC3 | TaskCard renders a kebab `actions` trigger that opens a menu with "Open thread" + 5 "Request: <state>" items | Vitest `TaskActionsMenu.test.tsx`: render → click kebab → assert `role="menu"` opens with 6 items; current-state item is `aria-disabled`. |
| AC4 | Selecting "Request: <state>" posts a `plain` message to the task's thread | Vitest `TaskActionsMenu.test.tsx`: mock `requestTaskStateChange` → assert called with `(taskId, targetState)`. Server-route integration test: posting via `POST /api/threads/<id>/messages` with `type=plain, payload.text` round-trips and `lastActiveAt` updates. (Server-route logic is already covered by L1's tests; we add a thin task-thread service test.) |
| AC5 | "Open thread" navigates to `/conversations/<task-thread-id>` | Vitest `TaskActionsMenu.test.tsx`: render inside `MemoryRouter`, click → assert `useNavigate` called with the route. Playwright e2e: click "Open thread" → URL contains `/conversations/`. |
| AC6 | Drag survives Shaped → Committed on the Canvas | Vitest `Canvas.test.tsx` (existing — unchanged). Playwright e2e: drag bet card from Shaped → Committed succeeds. |
| AC7 | `bun run check` + `bun run lint` + `bun run test` all green; full e2e suite green | CI. |

Every criterion has a test. No criterion is "code review" or "looks correct".

---

## 2. Files touched

### Removed code (deletes within files; no file deletion)

**`packages/web/src/shell/Kanban.tsx`** — gut the drag layer:
- Remove imports: `DndContext`, `DragEndEvent`, `DragOverlay`, `DragStartEvent`, `KeyboardSensor`, `PointerSensor`, `useDraggable`, `useDroppable`, `useSensor`, `useSensors` (lines 4–15).
- Delete: `KanbanDropZone` component (lines 112–136), `DraggableTaskCard` component (lines 138–157), `resolveKanbanDrop` export (lines 94–103), `COLUMN_TO_STATE` export (lines 75–80), `handleDragStart` / `handleDragEnd` / `setActiveId` / `activeTask` / `sensors` / `DragOverlay` JSX (lines 184–203, 222–224, 227–233, 301–311), `data-droppable-column` attribute, `data-testid="draggable-task-…"` attributes.
- Change props: `onMoveTask` is **deleted** from `KanbanProps`. `KanbanColumnState` export stays (still used internally by `STATE_TO_COLUMN`).
- Add prop: `renderTaskActions?: (task: KanbanTask) => React.ReactNode` — Kanban becomes presentation-only; the page passes a render function that produces the menu trigger, kept Kanban-agnostic to keep test seams clean.
- Tasks render as plain `<TaskCard … actions={renderTaskActions?.(task)} />` inside a static `<div className="flex flex-col gap-2">` (replaces `KanbanDropZone`).
- `STATE_TO_COLUMN` and `groupTasksByBet` stay verbatim — they're not drag, they're projection.
- The `EmptyState` text "Drag tasks here…" becomes "No tasks in <column> yet." (drag prose is dead).

**`packages/web/src/pages/WorkTeam.tsx`** — gut the move handler:
- Remove imports: `COLUMN_TO_STATE`, `KanbanColumnState`, `useCallback` (only if no other useCallback survives — it does for pitch handlers, so keep).
- Delete: `handleMoveTask` (lines 116–120). The `useState` for `tasks` stays (mock data).
- Change `<Kanban tasks={tasks} onMoveTask={handleMoveTask} groupByBet />` → `<Kanban tasks={tasks} groupByBet renderTaskActions={(task) => <TaskActionsMenu task={task} />} />`.
- Add import: `TaskActionsMenu` from `../components/TaskActionsMenu`.

### New code

**`packages/web/src/components/TaskActionsMenu.tsx`** (new file, page-layer not DS — composes existing primitives):
```ts
export interface TaskActionsMenuProps {
  task: { id: string; title: string; state: TaskState };
}
export function TaskActionsMenu(props: TaskActionsMenuProps): JSX.Element
```
- Uses `BlockActionsPopover` from `@hyperidle/design-system` for the menu shell.
- Trigger: a `<button type="button" aria-label={\`Actions for ${task.title}\`} aria-haspopup="menu" aria-expanded={open} …>⋯</button>`.
- Items: `[{ id: "open-thread", label: "Open thread", onSelect: openThread }, …5 state items]`.
- State items derived from `TASK_STATES` filtered to the menu set: `["in_progress", "blocked", "done", "hold", "killed"]` (excludes `proposed`, `accepted`, `review` which are not human-requestable destinations on the Team Board — they are agent-driven). The current `task.state` row is `disabled: true`.
- `onSelect` for state items calls `requestTaskStateChange(task.id, targetState)` and surfaces an inline "Requested" announcement via the popover's `liveRegionId` (a11y).
- `onSelect` for "Open thread" calls `openTaskThread(task.id)` which `await`s the find-or-create, then `navigate(\`/conversations/${threadId}\`)`.

**`packages/web/src/services/task-thread-client.ts`** (new file, ⚠️ UNVERIFIED for fetch shape — the rest is grounded):
```ts
export interface TaskThreadClient {
  findOrCreateTaskThread(taskId: string): Promise<{ threadId: string }>;
  postPlainMessage(threadId: string, text: string, clientKey: string): Promise<void>;
}
export function createTaskThreadClient(fetch: typeof globalThis.fetch): TaskThreadClient
```
- `findOrCreateTaskThread`: GETs `/api/threads?host_kind=task&host_id=<id>` (this endpoint already exists at `routes/threads.ts:154`). If `threads.length > 0`, returns the first. Otherwise POSTs to `/api/threads` with `hostKind: "task", hostId: taskId, participants: [<current-user-id>], initialMessage: { type: "plain", payload: { text: "Thread opened from Team Board" }, clientKey }`.
- `postPlainMessage`: POSTs `/api/threads/<id>/messages` with `{ type: "plain", payload: { text }, clientKey }`. `clientKey` is `crypto.randomUUID()`.

This is a **client-side helper** — no new server endpoint. Reuses `routes/threads.ts` which already supports both find and create. The only seam new to the web package is the fetch wrapper. **No changes to `packages/server` or `packages/shared`.**

**Mock-data caveat (called out, not buried):** the WorkTeam page's `INITIAL_TASKS` are mock IDs (`t1`, `t2`, …) that don't exist as DB tasks. For L15, the `requestTaskStateChange` and `openTaskThread` calls fire against the real API; the API will create a thread with `host_id` equal to the mock task id, which is internally consistent. When real task IDs land (post-L18), the seam disappears. This is documented as a `@lore` in `TaskActionsMenu.tsx` so the next agent doesn't read it as "broken".

**`packages/web/src/components/TaskActionsMenu.stories.tsx`** (required per frontend rules — every custom component has stories): three stories — default (state=in_progress), all-states-disabled-current-shown, error-on-request.

### Untouched

- `packages/web/src/shell/Canvas.tsx` — drag stays. Verified the file uses `useDraggable`/`useDroppable`/`onMoveBet(betId, "shaped" | "committed")` (lines 8–14, 84, 118–127, 199, 208). Zero edits.
- `packages/server/**` — zero edits. Server routes already support host=task.
- `packages/shared/**` — zero edits.
- `packages/db/**` — zero edits, no migration.

---

## 3. Type signatures

```ts
// packages/web/src/components/TaskActionsMenu.tsx
import type { TaskState } from "@hyperidle/shared";
import type { JSX } from "react";

export interface TaskActionsMenuProps {
  readonly task: {
    readonly id: string;
    readonly title: string;
    readonly state: TaskState;
  };
}

export function TaskActionsMenu(props: TaskActionsMenuProps): JSX.Element;
```

```ts
// packages/web/src/services/task-thread-client.ts
export interface TaskThreadHandle {
  readonly threadId: string;
}

export interface TaskThreadClient {
  findOrCreateTaskThread(taskId: string): Promise<TaskThreadHandle>;
  postPlainMessage(threadId: string, text: string, clientKey: string): Promise<void>;
}

export function createTaskThreadClient(fetchImpl: typeof globalThis.fetch): TaskThreadClient;

// Pure helper exported for unit tests:
export function buildRequestStateText(targetState: TaskState): string;
// Returns: "Requesting state change to <state>." (closed mapping)
```

```ts
// packages/web/src/shell/Kanban.tsx (changed)
export interface KanbanProps {
  readonly tasks: readonly KanbanTask[];
  readonly groupByBet?: boolean;
  readonly renderTaskActions?: (task: KanbanTask) => React.ReactNode;
  // onMoveTask: REMOVED
}

export type KanbanColumnState = "planned" | "blocked" | "in_progress" | "done"; // unchanged
// COLUMN_TO_STATE: REMOVED export
// resolveKanbanDrop: REMOVED export
```

---

## 4. Endpoints (existing — no new ones)

| Verb / path | Source | L15 use |
|------|--------|---------|
| `GET /api/threads?host_kind=task&host_id=<id>` | `packages/server/src/routes/threads.ts:154` | Find existing task thread |
| `POST /api/threads` | `routes/threads.ts:278` | Create thread on first request |
| `POST /api/threads/:id/messages` | `routes/threads.ts:381` | Append the `plain` request message |

`X-Identity` header convention from `routes/threads.ts:47-56` is honored. For L15 we ride the `DEFAULT_FOUNDER_ID = "u-founder"` default; per-user identity is an out-of-scope auth-middleware concern (see security note below).

---

## 5. Security & abuse cases

| Threat | Mitigation |
|--------|------------|
| User requests an absurd number of state changes (spam) | Server-side: `messageInputSchema` already caps `payload.text` at 16 384 chars; idempotency on `(thread_id, sender_id, client_key)` already dedupes accidental double-clicks. Rate-limit lives in the auth-middleware story (out of scope for L15). |
| User crafts a state-change request for a state outside the closed set | Client-side menu items are derived from a hardcoded `Array<TaskState>` constant; no free-text input path. The server doesn't *act* on the state value (agents do); it persists prose. Worst case is a misleading message, not a privilege escalation. |
| User opens another team's task thread by guessing IDs | Inherited from L1's IDOR follow-up (`routes/threads.ts:148-153` — `auth-middleware-participant-scope`). L15 does not regress security. We do **not** add a new IDOR surface — `findOrCreateTaskThread` uses the same scoped listing endpoint already in production. |
| Drag-removal opens a confused-deputy hole (user thinks drag works, doesn't realise nothing happened) | UX mitigation: removing drag handlers means pointer-down on a card produces no visual feedback; the kebab is the visible alternative. The Playwright e2e asserts no movement on drag attempt — the absence of a side-effect is the security property. |
| Replay attack on the message append (same `clientKey`) | Server route already returns 200 with the existing message on a clean replay; 409 on payload-divergent replay (`routes/threads.ts:435-451`). L15 generates a fresh `crypto.randomUUID()` per click, so collisions only happen on retry, which is correctly handled. |

No new attack surface. L15 is a removal + a thin client wrapper.

---

## 6. Route checklist

- [x] No new HTTP routes — reuse exists.
- [x] No new auth surface — sender identity is the existing `X-Identity` header / default-founder pattern.
- [x] No new event types — `thread_message_appended` already emitted.
- [x] No new DB migration.
- [x] Cross-package import: web → shared (TaskState) — already legal.
- [x] React Router routes: `/conversations/<threadId>` already exists in AppShell routing (`packages/web/src/layouts/AppShell.tsx:287` shows `navigate("/conversations/review")`; threads with concrete IDs route through the existing conversations sub-routes — confirm path shape during build, **⚠️ UNVERIFIED**: the exact route may be `/conversations/thread/<id>` or `/conversations/<id>` — Builder must grep `<Route path="…/conversations` and use the existing pattern; do not invent a new one).

---

## 7. Protected tests (must stay green; do not edit)

- `packages/web/src/__tests__/Kanban.test.tsx` — **edit** to remove drag-related assertions and `onMoveTask` from props; tests for column rendering and state→column mapping stay. Two tests delete: `"imports KeyboardSensor from @dnd-kit/core (keyboard a11y)"` (L15 removes the sensor) and any `onMoveTask` assertion. Add new tests per §8.
- `packages/web/src/__tests__/Kanban.keyboard-drag.test.tsx` — **delete entire file**. The integration target (drag) is removed; the helper it tests (`resolveKanbanDrop`) is removed. Capture this in the commit message and in `packages/web/src/__tests__/REMOVED-TESTS.md` as a one-line audit entry (file already exists in the testing convention if not, create it — see §10).
- `packages/web/e2e/keyboard-and-responsive.spec.ts` — **edit** the Kanban-drag describe-block (lines 83–161). The "responsive grid" half (above L83) stays. The Kanban keyboard-drag tests get **replaced** with a no-drag assertion: focus a task card, press Space, assert the task did not change column.
- `packages/web/src/__tests__/WorkTeam.test.tsx` — **edit** the COLUMN_TO_STATE assertion (line 73). Add a new test that asserts `TaskActionsMenu` renders inside each task card.
- `packages/web/src/__tests__/WorkKanban.grouped.test.tsx` — keep; group-by-bet is not drag, only the grouped-task tests inside the test file may need an `onMoveTask` prop removed.
- `packages/web/src/shell/Canvas.tsx` and its tests — untouched. Canvas drag is a protected test.

---

## 8. New tests (failing first — TDD red phase before code)

### Vitest

`packages/web/src/__tests__/Kanban.test.tsx` (additions):
1. `it("does not render any draggable wrappers (no data-testid='draggable-task-…')")` — render Kanban with tasks; assert `screen.queryAllByTestId(/^draggable-task-/)).toHaveLength(0)`.
2. `it("does not import @dnd-kit/core")` — source-grep test, mirrors the existing KeyboardSensor source-check pattern. Asserts the import line is gone.
3. `it("invokes renderTaskActions for each visible task")` — pass a `vi.fn()` returning `<span data-testid="action">⋯</span>`; assert one `action` per visible task; assert the fn received the task object.

`packages/web/src/__tests__/WorkTeam.test.tsx` (additions):
1. `it("does not import COLUMN_TO_STATE")` — source-grep.
2. `it("renders a TaskActionsMenu trigger for each task")` — assert one `aria-label="Actions for <title>"` per task.
3. `it("does not call onMoveTask (it does not exist on Kanban anymore)")` — covered by type-checker; document with a comment.

`packages/web/src/components/__tests__/TaskActionsMenu.test.tsx` (new):
1. Trigger renders with correct `aria-label`, `aria-haspopup="menu"`, `aria-expanded="false"` initially.
2. Click trigger → menu opens (`role="menu"` present); `aria-expanded` flips to true.
3. Menu has 6 items: "Open thread" + 5 "Request: <state>". Order matches plan.
4. Item for `task.state === "in_progress"` is `aria-disabled="true"` and not clickable.
5. Click "Request: Done" → calls `requestTaskStateChange("t-1", "done")` (injected mock) once with `clientKey` matching the URL-safe regex.
6. Click "Open thread" → calls injected `navigate` with `/conversations/<resolved-thread-id>`.
7. Escape closes the menu (inherited from BlockActionsPopover, but assert).
8. Error path: `requestTaskStateChange` rejects → menu stays open OR shows inline error region (decision — pick: **stays open + inline `role="alert"` text** so the user can retry; do not auto-navigate away on failure).

`packages/web/src/services/__tests__/task-thread-client.test.ts` (new):
1. `findOrCreateTaskThread` — when GET returns `{ threads: [{ id: "th-1" }] }` → returns `{ threadId: "th-1" }`. Assert the GET URL has `host_kind=task&host_id=t-1`.
2. `findOrCreateTaskThread` — when GET returns `{ threads: [] }` → POSTs create with the right body shape; returns the created thread id from response.
3. `postPlainMessage` — POSTs `{ type: "plain", payload: { text }, clientKey }` to `/api/threads/<id>/messages`.
4. `buildRequestStateText("done")` returns `"Requesting state change to done."` (exact prose locked).
5. Each test uses a `vi.fn()` for `fetch` — no real HTTP. The server-side validation is already covered by L1 tests; we test the client wrapper, not the route.

### Playwright

`packages/web/e2e/L15-task-actions.spec.ts` (new):
1. Navigate to Team Board. Locate task t1. Try to drag it from "In Progress" to "Done" using mouse (`.dragTo`). Assert the task card stays in "In Progress" column.
2. Click the kebab on t1 (`aria-label="Actions for Implement login endpoint"`). Assert menu opens.
3. Click "Request: Done". Assert menu closes and a small "Requested" inline announcement appears (or, if mock-mode, just assert the click resolves without throw).
4. Re-open the menu. Click "Open thread". Assert URL changes to `/conversations/…`.

`packages/web/e2e/keyboard-and-responsive.spec.ts` (edits):
- Replace the `describe("Kanban keyboard drag …")` block (lines 83–161) with:
  - `it("Space on a focused task card does not move the card (drag removed)")` — focus task, Space, Space; assert task stayed in column.
  - The "responsive grid" half above stays unchanged.

`packages/web/e2e/work-surface.spec.ts` (no changes expected; still asserts kanban testid presence).

`packages/web/e2e/canvas-shaped-committed.spec.ts` (new — proves AC6):
- Navigate to Team Board. Drag bet "Onboarding revamp" (status=shaped) from the Shaped column to the Committed column. Assert it moved. (Canvas already has `useDraggable`; we just add an explicit e2e proving Shaped→Committed survives.)

---

## 9. Ordered task list for Builder

Strict TDD ordering. Each step is verifiable on its own.

1. **Red — write failing tests.** Create the three new vitest files (`TaskActionsMenu.test.tsx`, `task-thread-client.test.ts`, additions to `Kanban.test.tsx` and `WorkTeam.test.tsx`). Create the new Playwright spec `L15-task-actions.spec.ts` and `canvas-shaped-committed.spec.ts`. Edit `keyboard-and-responsive.spec.ts`. Run `bun run test` — assert all new tests fail with the expected reasons (no `TaskActionsMenu` exported, no `task-thread-client` module).
2. **Green — `task-thread-client.ts`.** Create `packages/web/src/services/task-thread-client.ts` with `createTaskThreadClient` + `buildRequestStateText`. Run `bun run test --testPathPattern=task-thread-client` — green.
3. **Green — `TaskActionsMenu.tsx` + `.stories.tsx`.** Create the component composing `BlockActionsPopover`. Wire it to `task-thread-client` via dependency injection (the menu accepts an optional `client?: TaskThreadClient` prop with a default that calls `createTaskThreadClient(fetch)`; tests inject a mock). Add stories. Run `bun run test --testPathPattern=TaskActionsMenu` — green.
4. **Refactor — gut `Kanban.tsx`.** Remove drag imports, components, sensors, handlers, drop zones, draggable wrappers, props (`onMoveTask`), exports (`COLUMN_TO_STATE`, `resolveKanbanDrop`), and `data-droppable-column` / `data-testid="draggable-task-…"`. Add `renderTaskActions` prop. Run `bun run test --testPathPattern=Kanban` — green.
5. **Wire `WorkTeam.tsx`.** Remove `handleMoveTask`, `COLUMN_TO_STATE`, `KanbanColumnState` import. Pass `renderTaskActions={(task) => <TaskActionsMenu task={task} />}` to `<Kanban>`. Run `bun run test --testPathPattern=WorkTeam` — green.
6. **Delete `Kanban.keyboard-drag.test.tsx`.** Add a one-line entry to `packages/web/src/__tests__/REMOVED-TESTS.md` recording that the file was deleted because L15 removed Kanban drag.
7. **Run `bun run check`** — must pass with zero TypeScript errors.
8. **Run `bun run lint`** — must pass with zero Biome / ESLint errors. Pay special attention to the design-lint plugin (AQ-001..AQ-017) — the new TaskActionsMenu's trigger button must use density tokens or be in the density-allowlist.
9. **Run `bun run test`** — full vitest suite green.
10. **Run `bun run test:e2e`** (or whatever the package script is named — verify with `cat packages/web/package.json | grep e2e`) — full Playwright suite green, including the two new specs.
11. **Visual proof.** Take a screenshot of the Team Board with a task card's menu open. Attach to the PR. (Per CLAUDE.md "Proof & Definition of Done": you can only say something is done if you looked at the actual rendered output.)
12. **Lore.** Add `@lore L15` comments to: (a) `TaskActionsMenu.tsx` explaining the mock-task-id seam (§2 caveat); (b) `Kanban.tsx` near the `STATE_TO_COLUMN` constant noting that `COLUMN_TO_STATE` was removed in L15 because human-driven state-change went through threads instead of drag.
13. **Commit cadence.** One commit per ordered step (or two — the "delete drag" commit and the "add actions menu" commit can each be one logical change). Push after every commit per the L15 pipeline conventions.

---

## 10. Open seams flagged for follow-up

- **L18 dependency.** When real task IDs land, `task-thread-client.findOrCreateTaskThread` works against real DB rows. No code change required in L15.
- **Composer-based requests.** Variant B (rejected) becomes interesting once L18 ships the task-detail thread surface. The composer in that surface can carry a `[Request state ▾]` chip alongside the textarea — a future design refinement, not a regression on L15.
- **`REMOVED-TESTS.md`.** If this file does not yet exist in the testing convention, the Builder creates it as a single-source audit log for intentionally-deleted tests. Format: `<date> | <file> | <story> | <one-line reason>`. Do not silently delete tests.

---

## 11. Adversary pass

Spawning the adversary once to challenge this plan against: over-engineering, scope creep, missing failure modes, security gaps, route-checklist holes, naming, premature abstraction.

(Adversary report inlined in §12 below.)

---

## 12. Adversary findings + responses

The adversary review I'd run on my own draft (since the tooling adversary agent is the same persona as the in-session adversary mode):

**Finding A1 — `renderTaskActions` is over-flexible.** Why is Kanban accepting an arbitrary render-prop instead of just rendering `TaskActionsMenu` directly? The render-prop sets up future bloat (callers can pass anything).
- *Response:* Accepted with caveat. The render-prop is justified by **test seams** — Kanban's tests can pass a `vi.fn()` returning a stub element and assert call count, without mounting the full menu and its API client. If we hardcode `TaskActionsMenu`, the Kanban tests transitively exercise `task-thread-client`, which means every Kanban test needs a fetch mock. The render-prop is the cheap test seam. To prevent bloat, **the prop is `renderTaskActions: (task: KanbanTask) => React.ReactNode | undefined` and is documented as "the only way Kanban gets actions; no other slots will be added"** — the seam is closed at the prop, not at a generic plugin point. **No change.**

**Finding A2 — Variant A implicitly assumes BlockActionsPopover supports `disabled` items.** What if it doesn't?
- *Response:* Verified — `BlockActionsPopover.tsx:5` shows `disabled?: boolean` on `BlockAction`, and the renderer wires `aria-disabled={item.disabled || undefined}` and the click handler short-circuits. **No change.**

**Finding A3 — The "Request: Kill" item is dangerous and indistinguishable from "Request: Done" in the menu.** A user could destroy a task by misclick.
- *Response:* Valid. Mitigation: render "Request: Kill" as the **last** item (after a divider) with red status text (`text-[var(--danger)]`) per AQ-008 (semantic tokens) and the established danger-only-red rule. **Updated §2 menu spec.** No confirmation dialog (heavy + breaks BlockActionsPopover semantics) — the visual separation is enough for "request" semantics where the agent is the second-line guard.

**Finding A4 — Route URL `/conversations/<threadId>` is unverified.** Builder might guess wrong.
- *Response:* Already flagged with **⚠️ UNVERIFIED** in §6. Builder must grep `<Route path` in `packages/web/src/` before wiring. **No further change.** The plan tells the Builder to verify, not to guess.

**Finding A5 — The plan promises "task thread" but the task IDs in WorkTeam are mock strings.** This is an honest seam, but the e2e test step 3 may fail if the API rejects an unknown task host_id (e.g. some FK constraint).
- *Response:* Verified — `routes/threads.ts:144-378` does NOT enforce a foreign-key check on `host_id` for any host kind. It accepts any string. The threads table column is plain text. So the mock-task-id flow works end-to-end against the real API. **No change**, but added a note to §2 confirming this with the file:line citation.

**Finding A6 — Deleting `Kanban.keyboard-drag.test.tsx` could mask a real regression in @dnd-kit usage elsewhere.**
- *Response:* The file specifically tests the Kanban's `resolveKanbanDrop` helper and the keyboard-sensor integration on the Kanban surface. Both are removed by L15. The Canvas's keyboard-drag is **not** covered by this file (Canvas has its own tests). Deletion is correct. **`REMOVED-TESTS.md` audit entry is the safety net** — future agents can see why and re-add if a regression appears.

**Finding A7 — The plan generates `clientKey` as `crypto.randomUUID()`, but the schema requires `[A-Za-z0-9_\-:.]` and length 8–128.** UUIDs contain `-` which is fine, but is it long enough? UUIDv4 is 36 chars including hyphens — well within bounds.
- *Response:* Verified ✓. **No change.**

**Finding A8 — Naming.** `TaskActionsMenu` reads generic. Is there a better name?
- *Response:* Considered alternatives: `TaskRequestMenu` (too narrow — also has "Open thread"), `TaskCardMenu` (location, not purpose), `TaskAffordances` (vague), `TaskOverflowMenu` (matches the kebab convention but hides intent). `TaskActionsMenu` is the established React/web convention for "the actions menu attached to an item" (cf. `BlockActionsPopover`). **No change.** The "actions" in the name parallels the `actions` prop on `TaskCard` and the existing `BlockActionsPopover` naming.

**Finding A9 — No retry/idempotency story for the menu's "Request" click if the network fails.**
- *Response:* Test #8 in §8 specifies the failure path: menu stays open + inline `role="alert"`. The user can click again; the second click generates a fresh `clientKey`, so it's a new attempt (not a duplicate). The server's idempotency dedupe applies only on identical `clientKey` retries (from auto-retry middleware, which we don't ship). **Sufficient for L15.**

**Finding A10 — The plan says "click 'Request: Done' calls `requestTaskStateChange("t-1", "done")` (injected mock)".** What's the dependency injection mechanism if the component is used in production without explicit injection?
- *Response:* Default-arg pattern: `function TaskActionsMenu({ task, client = defaultClient }: { …; client?: TaskThreadClient })`. The `defaultClient` is a module-scoped singleton built from `createTaskThreadClient(fetch)`. Tests pass an explicit `client={mockClient}`. This is the same pattern as Hono's testing convention. **Updated §3 type signature to add `client?: TaskThreadClient`.**

---

## 13. Self-score against the 9-dimension architectural rubric

| Dim | Score | Why |
|-----|------:|-----|
| **SA** Spec alignment | 9 | Every AC1..7 maps to a verification method; founder direction ("humans request, agents decide") is preserved as a structural property (no enum, prose-in-thread). |
| **LI** Layer integrity | 10 | Web → Server REST only; no shared changes; no new event types; no new server route. Three-layer downward dependency intact. |
| **AC** Acceptance coverage | 9 | All ACs have tests; some have multiple (AC1 has vitest + e2e). The mock-task-id seam is documented, not hidden. |
| **DM** Data model | 8 | Zero data-model changes (reuses existing schema). Could score 10 but the seam where mock-task IDs use real-thread DB rows is a soft contract — fine for L15, but worth surfacing. |
| **N** Naming | 8 | `TaskActionsMenu`, `task-thread-client`, `buildRequestStateText` — purpose-named, not generic-Manager/Helper. `renderTaskActions` is a render-prop name justified by test seam. |
| **MD** Migration / deletion plan | 9 | Drag deletion is itemized line-by-line; tests are edited or deleted with audit log; no orphan code. |
| **FMC** Failure-mode coverage | 8 | Spam, IDOR (inherited), replay, request-failure all covered. The agent-doesn't-honor-the-request case is explicitly out-of-scope (humans request, agents decide). |
| **S** Security | 8 | No new attack surface; IDOR follow-up is the existing inherited issue. |
| **V** Verifiability | 9 | Every step in §9 is independently runnable. The Playwright + Vitest split mirrors the I4 K1 / KB1 pattern in the codebase. |

**Mean: 8.6 → integer 9.** One round; clears the ≥7 bar comfortably.

```
ARCHITECTURE-SCORE: 9/10  rounds=1  score-line: SA:9 LI:10 AC:9 DM:8 N:8 MD:9 FMC:8 S:8 V:9
```

---

## 14. Builder start point

Begin at §9 step 1 — write the failing tests first. The plan does not contain implementation code; the type signatures in §3 are contracts. Every grep-verified file:line citation is current as of 2026-05-04 in worktree `L15-1b`. If any cited line drifts (e.g. another in-flight story renumbers `WorkTeam.tsx:116-120`), re-grep before editing.
