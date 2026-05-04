# L15 — Technical Plan: Strip drag/drop from Kanban; humans request task changes

**Status:** Draft, post-/architecture interrogation. Locks the wire shape, file paths, and ordered tasks for L15. The user-visible shape, component vocabulary, and interaction grammar are fixed by `docs/design-explorations/L15/approved.md` (Variant A, kebab overflow menu) — this plan does NOT re-decide those.

**Scope reminders:**
- Tasks are agent-team-owned. Humans REQUEST; agents DECIDE.
- Drag survives ONLY on Canvas (Shaped → Committed). Kanban drag is fully removed.
- Optimistic state changes are forbidden — the card MUST stay in its current column when a request is posted.
- L1 (Thread primitive) is shipped. L18 (full thread surfaces) is pending — this plan must not block on L18 but must leave a clean handoff.

---

## 1. Architect interrogation (one question at a time)

Each question is answered against the codebase before drafting the design.

### Q1 — Can a `plain` message carry a structured "state-request" marker?

The `MESSAGE_TYPES` enum is closed: `["plain", "review", "questionnaire", "verdict"]`. Adding a fifth `state_request` type is a concept-doc change (`HUMAN_INTERFACE_LAYER.md` §4.5 + `BLOCKS.md`-style ratification) that L15's spec does NOT authorize. The schema for `plain` is `{ text: string, refs?: ReadonlyArray<InlineRef> }` (`packages/shared/src/thread.ts:90-93`, `packages/server/src/routes/threads-schema.ts:34-38`). There is no field on `plain` to carry `{ from, to }` without bending the contract.

**Answer:** Use `type: "plain"` with a deterministic, parseable `text` template. Renderers reading the thread in L18 detect the request shape from the `text` prefix. NO new message type. NO payload extension. The `refs` array DOES carry a single `InlineRef { kind: "task", id: <task.id> }` so the message can be back-linked to the task primitive without re-parsing prose.

**Implication:** the rendering of the request as a styled "Requested → Blocked" block is L18's job. L15 ships only the wire (text template) and the link (refs). L18 reads the same template to render a styled chip.

### Q2 — Endpoint: thin task helper or direct thread message POST?

The existing thread message route — `POST /api/threads/:id/messages` — already covers everything we need: idempotency on `(thread_id, sender_id, client_key)`, participant authz, event emission. A `POST /api/tasks/:id/state-request` helper would (a) duplicate authz, (b) need its own ensure-thread logic, (c) couple a Tasks REST surface (which does not yet exist as a thread-aware endpoint) to L15.

**Answer:** Direct `POST /api/threads/:id/messages` from the web client. For the "thread doesn't exist yet" path, the web client first does `POST /api/threads` with the host = `(task, task.id)` and an empty/seed initial message. ONE new endpoint covering "ensure-thread-and-post-state-request" would be cleaner ergonomically but at the cost of a second authz path. We pay the two-round-trip cost on first use only — every subsequent action on the same task hits the cached thread id.

### Q3 — "Open thread" target route — what placeholder does L18 inherit?

Existing routes in `packages/web/src/router.tsx` lines 23-72 show the pattern: `work/team`, `work/bet/:betId`, `conversations/review`, etc. L18 has not chosen a final task-thread surface. We need a route that:
1. Encodes the task id so L18 can rehydrate.
2. Does NOT collide with any existing route.
3. Renders something non-broken today (so L15 verification has a target page to land on).

**Answer:** Route is `work/team/task/:taskId/thread`. The placeholder page is `packages/web/src/pages/WorkTeamTaskThread.tsx` — a minimal page that fetches `GET /api/threads?host_kind=task&host_id=:taskId`, picks the most-recent thread, and renders `ThreadShell` (already in design-system). If no thread exists, the page does `POST /api/threads` lazy-creation on mount. L18 can either replace this whole page or reuse it as the thread-detail surface.

**Contract handed to L18:** a route exists at `/work/team/task/:taskId/thread` whose only invariants are (a) the URL contains the task id, (b) it can land users on a thread surface and create one on first visit. L18 may freely change the page body.

### Q4 — Toast surface: app-level container or inline aria-live?

`grep` for "toast/Toast/ToastContainer" across `packages/web/src` and `packages/design-system/src` returns only one passing reference in a comment in `SettingsPanel.tsx`. There is NO global toast container, NO toast slot in `AppShell`. The two existing aria-live conventions in the codebase are: (a) `role="status" aria-live="polite"` on `EmptyState`/`SkeletonList`, (b) `aria-live="polite"` on `ThreadShell`'s shape-transition region. Introducing a global toast is out of L15's scope — that belongs in a design-system primitive story.

**Answer:** Inline aria-live region in the Kanban DOM. The `Kanban` component owns one `<div role="status" aria-live="polite" className="sr-only">` plus a visible toast pill rendered with DaisyUI's `toast toast-bottom toast-end` utility classes (DaisyUI ships toast positioning utilities — no JS container needed). The visible pill renders for 3000 ms then unmounts; the sr-only region echoes the same text for screen readers. No new design-system component. When the global toast primitive arrives, swap the inline pill for the global container — single-file change in `Kanban.tsx`.

**DaisyUI toast utility:** `<div class="toast toast-bottom toast-end">` (https://daisyui.com/components/toast/). Visual chrome reuses `alert alert-error` for the error variant.

### Q5 — Mobile kebab visibility rule — confirm `[data-density="comfortable"]`?

AQ-016 ties density `comfortable` to viewport ≤ 1024 px when Settings preference is `auto`. `AppShell` already sets `data-density` based on viewport + preference (verified in `auto-density.test.tsx`). The kebab styling MUST use `[data-density="comfortable"] .task-card-kebab { opacity: 1; pointer-events: auto; }` rather than a media query — that way a user who manually selects `comfortable` on a desktop also gets the always-visible kebab. The synthesized `.kebab` is opacity-0 by default and reveals on `:hover`/`:focus-within` of the card, OR when `[data-density="comfortable"]` is set anywhere up the tree.

**Answer:** Confirmed. CSS selectors only — no JS density branching in the React component. The TaskCard's `overflowMenu` slot wraps its child in a `<div data-task-overflow>` whose styles read the density attribute.

---

## 2. Context

L15 enforces the v3 ownership contract: tasks belong to agent teams, humans interact through threads. The current Team Board violates this by exposing drag-to-move on `TaskCard`s. We rip that out and replace it with a per-card kebab menu that posts state-change requests onto the task's thread (L1) and routes "Open thread" to a placeholder page L18 will replace.

## 3. Constraints (fixed)

- **Closed enums.** `MESSAGE_TYPES = ["plain","review","questionnaire","verdict"]`. `HOST_KINDS` already includes `"task"`. No schema or enum changes.
- **No optimistic UI.** The card never moves on a request — only when the agent updates the actual `TaskState`.
- **Component budget.** 19 custom components. L15 adds ZERO new design-system components. `TaskCard` gets one optional prop (`overflowMenu?: ReactNode`). The kebab + menu live in `packages/web/src/shell/` (consumer surface) using DaisyUI `dropdown` + `menu` directly.
- **Visual parity.** TaskCard.tsx must continue to match `packages/design-system/html/TaskCard.html` pixel-for-pixel. Adding `overflowMenu` is additive — when not passed, render is identical. The HTML reference must be updated by Claude Design (separate non-blocking ticket); the visual regression threshold of 5% holds.
- **Strict TS, no `any`, workspace imports `@hyperidle/*`, Drizzle only, no barrel files except `packages/*/src/index.ts`.**
- **Hono pattern parity.** Reuse the existing route patterns in `packages/server/src/routes/threads.ts` — no new framework idioms.
- **Canvas drag survives** — `packages/web/src/shell/Canvas.tsx` is out of scope and untouched.

## 4. Design

### 4.1 Wire shape — state-request message text template

A state-change request becomes a `plain` message whose `text` follows a parseable template. The template is locked here so L18's renderer can detect it.

```
Requested state change: <FROM_LABEL> → <TO_LABEL>
```

Where `FROM_LABEL` and `TO_LABEL` are the human-readable column labels from approved.md §5: `Planned`, `Blocked`, `In Progress`, `Done`. The arrow is the literal Unicode `→` (U+2192). L18 detects requests by exact-prefix match on `Requested state change: `. Case-sensitive.

**Why a text template, not a structured marker.** See Q1. Adding `kind: "state_request"` requires extending the closed `MESSAGE_TYPES` vocabulary or extending `PlainPayload` — both are concept-doc changes outside L15's scope.

**Refs.** Every state-request message includes `refs: [{ kind: "task", id: <task.id> }]` so the link from message → task is queryable without parsing prose. This is already valid `PlainPayload` (`packages/shared/src/thread.ts:80-93`).

**Client key.** Format: `state-req:<task.id>:<targetColumn>:<isoTimestamp>` — ≥ 8 chars, regex-safe per `CLIENT_KEY_RE` (`packages/server/src/routes/threads-schema.ts:21`). Idempotency: a duplicate click within the same second posts the same `clientKey` → server returns the existing message (200) per `threads.ts:435-458`.

### 4.2 Shared types

NO new exports in `@hyperidle/shared`. The state-request shape is captured in two places:

1. A `const STATE_REQUEST_PREFIX = "Requested state change: "` constant exported from `packages/web/src/shell/taskStateRequest.ts` (web-only — the request format is a UI concern, not a contract that crosses into the server).
2. A pure helper `formatStateRequestText(from: TaskState, to: TaskState): string` in the same file, locked by a Vitest test.

Rationale: keep `@hyperidle/shared` free of UI strings. L18 imports the same constant when it lands.

### 4.3 DB schema deltas

**NONE.** L1 covers `threads` + `messages` and `host_kind` already includes `"task"`. Verified in `packages/db/src/schema.ts:175-222`.

### 4.4 Server routes — added/changed

**Added: ZERO new routes.** L15 reuses:

| Method | Path | Purpose | Source |
|---|---|---|---|
| `POST` | `/api/threads` | Create the task's thread on first interaction (host_kind=`task`, host_id=task.id) | `packages/server/src/routes/threads.ts:278-378` |
| `POST` | `/api/threads/:id/messages` | Append the state-request `plain` message | `packages/server/src/routes/threads.ts:381-596` |
| `GET` | `/api/threads?host_kind=task&host_id=:taskId` | Resolve the task's thread id (placeholder page + first-time helper) | `packages/server/src/routes/threads.ts:154-247` |
| `GET` | `/api/threads/:id` | Render the placeholder thread page | `packages/server/src/routes/threads.ts:250-275` |

**Request body for the state-request POST:**

```ts
// Wire shape — already validated by messageInputSchema (plain branch)
{
  type: "plain",
  payload: {
    text: "Requested state change: In Progress → Blocked",
    refs: [{ kind: "task", id: "t1" }],
  },
  clientKey: "state-req:t1:blocked:2026-05-04T12:00:00.000Z",
}
```

**Response:** `201` with `{ message, thread }` per existing contract. Errors per existing `ApiErrorResponse` shape — `403` (sender not participant), `404` (thread not found), `409` (idempotency conflict), `400` (validation), `500` (transactional failure).

### 4.5 Web components — added/changed

#### 4.5.1 `packages/design-system/src/TaskCard.tsx`

**Diff:** add a single optional prop.

```ts
export interface TaskCardProps {
  // ...existing props
  /**
   * Optional overflow affordance. Rendered absolute-positioned in the top-right
   * of the card. Reveals on `:hover` / `:focus-within` and unconditionally when
   * the nearest `[data-density]` ancestor is `comfortable` (AQ-016 mobile rule).
   * Density-static: TaskCard is in the density-aware bucket; the absolute
   * positioning honors the closed spacing scale (top/right offset = 8 px = 2 ×
   * 4-px grid).
   */
  overflowMenu?: ReactNode;
}
```

The `overflowMenu` is rendered as a sibling of the existing card body, absolute-positioned. CSS rules (Tailwind utility classes only):

- Wrapper `position: relative` on the outermost card div (already implicit; verify it doesn't break visual parity with the HTML reference).
- Slot `position: absolute; top: 8px; right: 8px;` with `opacity-0 transition-opacity duration-[var(--motion-fast)] ease-[var(--motion-ease)]`.
- Reveal: `:hover` of card OR `:focus-within` of card OR `[data-density="comfortable"]` ancestor → `opacity-100`.
- Hit target: 44×44 CSS px on touch viewports (AQ-015), achieved by transparent padding around the 24×24 icon — implemented in the kebab consumer, not TaskCard.

**Visual parity contract.** When `overflowMenu` is undefined the rendered DOM is byte-identical to today's `TaskCard`. Verified by snapshot test.

#### 4.5.2 NEW component: `packages/web/src/shell/TaskActionsMenu.tsx`

This is a SHELL component, not a design-system primitive. Lives in `web` because it's a Kanban-specific consumer that wires the menu to the API.

```ts
export interface TaskActionsMenuProps {
  task: KanbanTask;            // for state, id, title (a11y)
  onStateRequest: (
    targetColumn: KanbanColumnState,
  ) => Promise<
    | { ok: true }
    | { ok: false; reason: "network" | "validation" | "forbidden" | "server" }
  >;
  // reason mapping from server status:
  //   network → fetch threw / no response
  //   validation → 400
  //   forbidden → 403
  //   server → 404, 409, 500 (collapsed; toast copy is generic "Couldn't post request. Retry.")
  onOpenThread: () => void;     // navigates to /work/team/task/:taskId/thread
}

export function TaskActionsMenu(props: TaskActionsMenuProps): JSX.Element;
```

**Implementation outline (no code):**
- Renders a DaisyUI `dropdown` whose trigger is a `<button class="btn btn-ghost btn-xs">` with a kebab icon (lucide `MoreVertical`).
- Two top-level menu items: "Request state change ▸" (opens nested submenu) and "Open thread" (`T` shortcut).
- Submenu is the four states; current is `aria-disabled="true"` with " (current)" suffix; "Blocked" carries `text-[var(--danger)]` for danger styling.
- On state click → calls `onStateRequest(column)` → on success closes menu and emits a toast event (see §4.5.4); on failure re-opens menu with focus on the failed item and emits an error toast.
- Keyboard handlers per approved.md §6: `↑/↓`, `→/←`, `ESC`, `Enter`, `P/B/I/D` shortcut keys inside the open submenu, `T` shortcut on the open menu.

**ARIA contract:** `aria-haspopup="menu"`, `aria-expanded={open}` on kebab; `role="menu"`, `role="menuitem"` on items; `aria-disabled` on the current state.

#### 4.5.3 NEW page: `packages/web/src/pages/WorkTeamTaskThread.tsx`

Placeholder for L18. Renders `ThreadShell` against the task's thread.

```ts
export function WorkTeamTaskThread(): JSX.Element;
// reads :taskId from useParams
// fetches GET /api/threads?host_kind=task&host_id=:taskId
// if list empty: POST /api/threads with host_kind=task, host_id=taskId,
//   participants=[founderId], initialMessage = { type: "plain",
//   payload: { text: "Thread opened" }, clientKey: <generated> }
// once thread id known: fetch GET /api/threads/:id
// renders <ThreadShell thread={...} messages={...}>
```

L18 will replace the body or reuse it. The route + page filename are the only contracts.

#### 4.5.4 Toast: inline DaisyUI utility inside `Kanban.tsx`

A `useTaskRequestToast` local hook in `packages/web/src/shell/useTaskRequestToast.ts` exposes:

```ts
interface ToastApi {
  show: (kind: "success" | "error", text: string) => void;
}
export function useTaskRequestToast(): { api: ToastApi; element: JSX.Element };
```

Renders a DaisyUI `<div class="toast toast-bottom toast-end">` with the current toast inside (`alert alert-success` or `alert alert-error`). Auto-dismisses after 3000 ms. The same text is mirrored into a `role="status" aria-live="polite" className="sr-only"` region for screen readers (per §4.4 above).

Replacing this with a global toast container later is a one-file change in `Kanban.tsx`.

#### 4.5.5 `packages/web/src/shell/Kanban.tsx`

**Removed:**
- `@dnd-kit/core` imports (`DndContext`, `DragOverlay`, `useDraggable`, `useDroppable`, sensors).
- `KanbanDropZone`, `DraggableTaskCard` components.
- `useSensors` / `KeyboardSensor` / `PointerSensor` configs.
- `resolveKanbanDrop` (export deleted) — keyboard drag tests will be removed (see §6).
- `KanbanColumnState` and `COLUMN_TO_STATE` are KEPT and EXPORTED (the menu still needs the state-vocabulary mapping). `STATE_TO_COLUMN` stays — it's the column-grouping helper.
- `onMoveTask` prop on `KanbanProps` REMOVED. New required prop: `onTaskStateRequest: (taskId: string, targetColumn: KanbanColumnState) => Promise<...>` and `onOpenTaskThread: (taskId: string) => void`.
- The `<DndContext>` wrapper around the columns. Columns become plain `<div>`s.

**Added:**
- Each `TaskCard` now passes `overflowMenu={<TaskActionsMenu task={task} ... />}` as the new optional prop.
- The shared `useTaskRequestToast` hook + its rendered toast element.

**Visual diff:** zero on the static card layout. Adds the kebab on hover/focus.

#### 4.5.6 `packages/web/src/pages/WorkTeam.tsx`

**Removed:**
- `handleMoveTask` callback (lines 116-120) — gone.
- `COLUMN_TO_STATE` import (no longer used here — the state map lives inside Kanban+menu now).

**Added:**
- `handleTaskStateRequest(taskId, targetColumn)` — builds the request body via `formatStateRequestText`, ensures the task's thread exists (calls `ensureTaskThread(taskId)` helper), POSTs the message, returns `{ ok }`.
- `handleOpenTaskThread(taskId)` — calls `navigate(`/work/team/task/${taskId}/thread`)` via `react-router-dom`'s `useNavigate`.
- `ensureTaskThread(taskId)` — pure-async helper in `packages/web/src/shell/ensureTaskThread.ts` that does GET-then-POST with caching in module-scope `Map<taskId, threadId>` (cleared on page unmount).

#### 4.5.7 `packages/web/src/router.tsx`

Add one new route entry:

```ts
{ path: "work/team/task/:taskId/thread", element: <WorkTeamTaskThread /> }
```

Insert after `work/bet/:betId`. Keep before the `*` catch-all.

### 4.6 Information flow

```
[User clicks kebab on TaskCard]
        |
        v
[TaskActionsMenu opens DaisyUI dropdown]
        |
   ┌────┴────┐
   │         │
[State req]  [Open thread]
   │         │
   v         v
WorkTeam     useNavigate
.handleTask  to /work/team
StateRequest /task/:id/thread
   │         │
   v         v
ensureTask   WorkTeamTaskThread
Thread       page mounts
(GET ?host_kind=task&host_id=taskId
 → POST /api/threads if missing)
   │         │
   v         │
POST /api/   │
threads/:id/ │
messages     │
   │         │
   v         v
Server       GET /api/threads
threads.ts   GET /api/threads/:id
appends row  → ThreadShell renders
   │
   v
Toast.show("success", "Requested → Blocked. Posted to thread.")
+ aria-live announcement
```

The card's column DOES NOT change. The agent's downstream handling (out of scope for L15) is what eventually moves the state.

## 5. Trade-offs

- **Text-template wire shape vs. structured `state_request` message type.** Chose template. Cost: L18 must parse a string prefix to render styled chips. Saved: no concept-doc churn, no enum extension, no migration risk. Reversible — L18 can promote the template to a real type when it lands.
- **No new design-system component for the menu.** Chose to put `TaskActionsMenu` in `web/src/shell/`. Cost: cannot be reused on other surfaces without lifting it. Saved: stays under the 19-component budget; menu vocabulary is task-specific, not generic.
- **Inline toast instead of global container.** Chose inline. Cost: when global toast lands we touch one file. Saved: zero new design-system primitive; no app-shell changes.
- **Two round-trips on first state request (GET threads, POST threads, POST message).** Chose two-RT over a new `POST /api/tasks/:id/state-request` helper. Cost: two extra requests on first use per task. Saved: no duplicate authz, no new server route, idempotent retries via existing `clientKey` mechanism.
- **Optimistic UI rejected.** The card never moves on request. Cost: less snappy. Saved: enforces "humans request, agents decide" at the visual level — exactly the v3 ownership contract.
- **Placeholder thread route now.** Chose to ship `/work/team/task/:taskId/thread` rather than a panel/drawer. Cost: L18 may want a different surface and have to reroute. Saved: testable today, decoupled from L18's pending decisions.

## 6. Tests required

### 6.1 Acceptance-criteria coverage matrix

| AC (TRACK-L L15 + approved.md §10) | Test file | Test name |
|---|---|---|
| Drag is a no-op | `packages/web/src/__tests__/Kanban.no-drag.test.tsx` | `drag gestures on a TaskCard do not invoke any move handler and do not mutate state` |
| Move-task handler is gone | `packages/web/src/__tests__/WorkTeam.test.tsx` (updated) | `WorkTeam no longer exposes onMoveTask wiring` |
| Kebab fades in on hover | `packages/web/src/__tests__/TaskActionsMenu.test.tsx` | `kebab is opacity-0 by default and reveals on card hover` |
| Kebab is always visible at comfortable density | `packages/web/src/__tests__/TaskCard.density.test.tsx` | `overflowMenu slot is always visible when [data-density=comfortable]` |
| Menu shows "Request state change" + "Open thread" | `TaskActionsMenu.test.tsx` | `menu renders both top-level items with correct copy` |
| Submenu shows 4 states; current is disabled; Blocked is danger | `TaskActionsMenu.test.tsx` | `submenu disables current state and renders Blocked in danger color` |
| Selecting a state posts a `plain` message | `packages/web/src/__tests__/WorkTeam.taskStateRequest.test.tsx` | `selecting Blocked posts plain message with text "Requested state change: In Progress → Blocked" and refs=[{kind:"task", id}]` |
| ClientKey shape is correct + idempotent | `packages/web/src/__tests__/taskStateRequest.test.ts` | `formatStateRequestText is locked; clientKey conforms to /^[A-Za-z0-9_\-:.]{8,128}$/` |
| Open thread navigates to `/work/team/task/:taskId/thread` | `WorkTeam.test.tsx` | `clicking Open thread navigates to placeholder route` |
| First-time thread auto-create | `WorkTeamTaskThread.test.tsx` | `mounting with no existing thread POSTs /api/threads with host_kind=task` |
| ESC closes menu, returns focus to kebab | `TaskActionsMenu.test.tsx` | `ESC closes menu and returns focus to kebab trigger` |
| `P/B/I/D` shortcut inside submenu | `TaskActionsMenu.test.tsx` | `pressing B in open submenu posts state request to "blocked"` |
| `T` shortcut on open menu | `TaskActionsMenu.test.tsx` | `pressing T in open menu opens thread` |
| Optimistic — card stays put | `WorkTeam.taskStateRequest.test.tsx` | `card column does not change after a state-request POST resolves successfully` |
| Toast on success | `WorkTeam.taskStateRequest.test.tsx` | `success toast appears with text "Requested → Blocked. Posted to thread."` |
| Toast on error | `WorkTeam.taskStateRequest.test.tsx` | `network failure renders danger toast and re-opens menu with focus retained` |
| aria-live announcement | `Kanban.toast.a11y.test.tsx` | `toast text is mirrored into role=status aria-live=polite region` |
| Canvas Shaped→Committed drag survives | `packages/web/src/__tests__/Canvas.test.tsx` (existing — guard) | `Canvas drag tests stay green` |
| Playwright e2e | `apps/e2e/tests/team-board-task-actions.spec.ts` | `attempt drag → no movement → click kebab → submit Blocked → toast → backend received POST` |

### 6.2 Protected tests (must stay green)

- `packages/web/src/__tests__/Canvas.test.tsx` — Canvas drag is out of scope.
- `packages/web/src/__tests__/Kanban.test.tsx` — column-grouping and rendering pieces stay; assertions on `onMoveTask` and `useDraggable` MUST be removed/replaced.
- `packages/web/src/__tests__/WorkKanban.grouped.test.tsx` — bet-grouping is unchanged.
- `packages/web/src/__tests__/TaskCard.test.tsx` — visual parity guard.
- All Thread/L1 tests in `packages/server/src/__tests__/threads*.test.ts` — server route is unchanged.

### 6.3 Tests to delete or repurpose

- `packages/web/src/__tests__/Kanban.keyboard-drag.test.tsx` — DELETE. Keyboard drag is gone with the dnd-kit removal. Replaced by the `TaskActionsMenu` keyboard tests above.
- Any test in `Kanban.test.tsx` asserting `useDraggable`, `useDroppable`, `resolveKanbanDrop`, or `onMoveTask` — REMOVE. Repurpose the file's structure for the new `overflowMenu` rendering assertions.

## 7. Ordered implementation tasks (smallest viable steps)

1. **Concept lock — write the failing tests first (TDD red).**
   - `packages/web/src/__tests__/taskStateRequest.test.ts` — locks `formatStateRequestText` + `clientKey` regex.
   - `packages/web/src/__tests__/Kanban.no-drag.test.tsx` — locks "drag is a no-op".
   - `packages/web/src/__tests__/TaskActionsMenu.test.tsx` — locks all menu/submenu/keyboard/aria contracts.
   - `packages/web/src/__tests__/WorkTeam.taskStateRequest.test.tsx` — locks the network shape and toast.
   - `packages/web/src/__tests__/WorkTeamTaskThread.test.tsx` — locks the placeholder page.
   - `apps/e2e/tests/team-board-task-actions.spec.ts` — Playwright skeleton.

2. **Add `overflowMenu` to `TaskCard`.** Visual-parity snapshot test must still pass with prop omitted.

3. **Build `formatStateRequestText` + `STATE_REQUEST_PREFIX`** in `packages/web/src/shell/taskStateRequest.ts`. Tiny pure module.

4. **Build `ensureTaskThread`** helper in `packages/web/src/shell/ensureTaskThread.ts` — GET-then-POST with module-scope cache. Test against fetch mocks.

5. **Build `useTaskRequestToast`** hook in `packages/web/src/shell/useTaskRequestToast.ts`. DaisyUI utility classes only.

6. **Build `TaskActionsMenu`** in `packages/web/src/shell/TaskActionsMenu.tsx`. DaisyUI `dropdown` + nested `dropdown` with mobile branching (replace-in-place per approved.md §8).

7. **Strip dnd-kit from `Kanban.tsx`.** Remove DraggableTaskCard + KanbanDropZone + sensors. Wire `overflowMenu={<TaskActionsMenu ... />}`. Wire toast.

8. **Update `WorkTeam.tsx`.** Remove `handleMoveTask`. Add `handleTaskStateRequest` + `handleOpenTaskThread`. Pass `useNavigate` for thread route.

9. **Add the new route** to `router.tsx` and create `WorkTeamTaskThread.tsx`.

10. **Delete the obsolete test** `Kanban.keyboard-drag.test.tsx`. Update `Kanban.test.tsx` to drop drag assertions.

11. **Run `bun run check && bun run lint && bun run test && bun run test:e2e`.** Iterate to green.

12. **Visual regression.** Take new screenshots of the Team Board via `apps/e2e/tests/team-board-task-actions.visual.spec.ts` (Playwright `toHaveScreenshot` with `maxDiffPixelRatio: 0.05`). Five states captured: idle (no hover), kebab-revealed (hover), top-level menu open, submenu open with current state disabled and Blocked in danger color, toast visible after success. Baselines committed under `apps/e2e/tests/team-board-task-actions.visual.spec.ts-snapshots/`. Apply the danger-styled "Blocked" submenu item as called out in approved.md §12.

13. **`@lore` annotations.** Drop `@lore L15` comments at:
    - `Kanban.tsx` — "drag removed; ownership contract enforced — see L15-plan.md".
    - `taskStateRequest.ts` — "text-template wire shape — L18 will promote when state_request becomes a first-class message type".
    - `WorkTeamTaskThread.tsx` — "placeholder for L18 — route stable, body replaceable".

## 8. Security & abuse cases

| Surface | Threat | Existing mitigation | L15 action |
|---|---|---|---|
| `POST /api/threads/:id/messages` | Unauthorized poster (IDOR via shared API key) | Sender must be a participant (`threads.ts:418-421`). Server reads `X-Identity` header, defaults to `u-founder`. | Inherits. The `@lore` comment in `threads.ts:148-153` already flags the cross-cutting auth-middleware follow-up. NO new exposure. |
| `POST /api/threads` lazy-creation | Spamming threads on arbitrary task ids | `host_kind=task` is a closed enum. Task existence is NOT validated server-side today. | Document that L15 inherits this gap. Add a follow-up entry to `docs/work-packages/follow-ups.md`: `task-host-id-existence-validation` — server should verify `host_id` references a real task before letting `host_kind=task` threads land. Out of scope for L15. |
| Idempotency | Double-click posts duplicate request | `(thread_id, sender_id, client_key)` unique index in DB; route returns existing on match. | `clientKey` includes the ISO timestamp truncated to the second to allow legitimate retries within ms while still letting an explicit "I want to request again" produce a new entry. ⚠️ UNVERIFIED: confirm during implementation that the chosen truncation gives the right tradeoff. |
| Rate limit | A user spam-clicks state requests | No rate limit exists today on `/api/threads/*`. | Out of scope; the idempotency window provides a soft cap. Add a follow-up entry: `threads-message-rate-limit`. |
| XSS via `payload.text` | Hostile text rendered as HTML on a thread page | All renderers in design-system pass text through React escaping; no `dangerouslySetInnerHTML`. | No new exposure. |
| Cross-task post | Posting a state request for task A onto task B's thread | `refs[].id` is what links. Server doesn't validate. | The web client is the only writer — it ALWAYS sets refs to the same task whose thread it is posting to. Add a Vitest test that locks this invariant in `WorkTeam.taskStateRequest.test.tsx`. |

## 9. Failure-mode coverage

- **Network error on `POST /messages`.** Toast renders the error variant with copy `"Couldn't post request. Retry."`. Menu re-opens, focus stays on the failed item. Tested in `WorkTeam.taskStateRequest.test.tsx`.
- **Thread missing (404).** "Open thread" calls `ensureTaskThread` which lazy-creates; "Request state change" path also calls `ensureTaskThread` first. The 404 path is rare-by-design but covered: `ensureTaskThread.test.ts` simulates a 404 then POST → success.
- **`ensureTaskThread` POST returns 500.** Helper rejects with `{ ok: false, reason: "server" }`. Caller renders the error toast and re-opens the menu (same path as message-POST failure). The module-scope cache is NOT populated, so the next click retries from scratch. Tested in `ensureTaskThread.test.ts` — `POST /api/threads 500 leaves cache empty and propagates ok:false`.
- **Focus management on error.** When the message POST fails, the menu re-opens with focus on the failed submenu item (the state the user clicked). When `ensureTaskThread` fails before message-POST is reached, focus returns to the kebab trigger (no submenu item to focus). Both paths tested in `WorkTeam.taskStateRequest.test.tsx`.
- **Concurrent requests on the same task.** Two clicks within 1 s with the same target produce the same `clientKey` → server returns `200` with the existing message. UI shows one toast. Test: `WorkTeam.taskStateRequest.test.tsx` — `concurrent identical requests deduplicate`.
- **Concurrent requests with different targets.** Different `clientKey`s → both messages land. UI shows two toasts in sequence. Test in same file.
- **`POST /api/threads` race during lazy-creation.** Two tabs both POST → server creates two threads (the host+id query returns most-recent). The placeholder page sorts by `lastActiveAt` desc. Cosmetic duplication, not data corruption. Add a follow-up: `task-thread-uniqueness-constraint`.
- **Slow network UX.** The kebab item flashes `--primary-dim` for 80 ms (approved.md §5). If the request takes longer than 600 ms, render an inline pending pill near the toast region. ⚠️ UNVERIFIED: 600 ms threshold needs a designer call — placeholder; verify before implementation.
- **`prefers-reduced-motion`.** All transitions read `--motion-fast`/`--motion-medium`; the kebab fade and toast slide collapse to instant when the media query matches. Tested in `auto-density.test.tsx` patterns; new test `Kanban.toast.a11y.test.tsx` covers the toast.

## 10. route-checklist

```
route-checklist:
  - method: POST
    path: /api/threads
    handler: packages/server/src/routes/threads.ts:278  (router.post("/"))
    middleware:
      - sender-identification (in-route): packages/server/src/routes/threads.ts:64-79  readInitialSenderId
      - body-validation (in-route): createThreadBodySchema in packages/server/src/routes/threads-schema.ts:115-121
      - participant-authorization (server-derived from senderId): inline at threads.ts:294-297
      - event-emission: ThreadCreatedEvent + ThreadMessageAppendedEvent at threads.ts:344-363
      - error-shape: ApiErrorResponse via err() at threads.ts:132-141

  - method: POST
    path: /api/threads/:id/messages
    handler: packages/server/src/routes/threads.ts:381  (router.post("/:id/messages"))
    middleware:
      - sender-identification (in-route): readSenderId at threads.ts:50-56
      - body-validation (in-route): messageInputSchema at packages/server/src/routes/threads-schema.ts:65-86
      - participant-authorization: threads.ts:418-421
      - idempotency-check: threads.ts:424-459 (unique idx on threads_id + sender_id + client_key)
      - verdict-authorization (n/a for plain): threads.ts:462-479
      - re-open-semantics (n/a for plain): threads.ts:485-487, 529-536
      - event-emission: ThreadMessageAppendedEvent at threads.ts:550-559
      - error-shape: ApiErrorResponse via err() at threads.ts:132-141

  - method: GET
    path: /api/threads
    handler: packages/server/src/routes/threads.ts:154  (router.get("/"))
    middleware:
      - query-validation: listThreadsQuerySchema at packages/server/src/routes/threads-schema.ts:150-160
      - host-or-participant-scope: threads.ts:167-170
      - SQL-LIKE-escape: packages/server/src/services/like-escape.ts via threads.ts:200
      - response-shape: threadListRowSchema at packages/server/src/routes/threads-schema.ts:129-145

  - method: GET
    path: /api/threads/:id
    handler: packages/server/src/routes/threads.ts:250  (router.get("/:id"))
    middleware:
      - row-existence: threads.ts:252-256
      - row→DTO boundary parsing: rowToThread + rowToMessage at threads.ts:88-130
      - head-collapse derivation: headCollapsePredicate in @hyperidle/shared
      - error-shape: ApiErrorResponse via err()

  - guards reused (no new guard files):
      packages/server/src/routes/threads.ts (whole file is the canonical L1 contract)
      packages/server/src/routes/threads-schema.ts (Zod boundary)
      packages/server/src/services/like-escape.ts (used by GET list)

  - guards added by L15: NONE
```

## 11. Open questions for human review

1. ⚠️ The 600 ms "slow request → pending pill" threshold is a placeholder. A designer call is needed before implementation. Default to "no pending pill, only the toast on completion" if no decision arrives — that's the simplest path and still passes accessibility.
2. The `task-host-id-existence-validation` follow-up (server-side check that `host_id` references a real task before allowing a `host_kind=task` thread) is filed but not done in L15. Confirm OK to defer.
3. `task-thread-uniqueness-constraint` follow-up — should there be a unique partial index `WHERE host_kind='task'` on `(host_kind, host_id)`? Today multiple threads per task are possible. L15 inherits the existing behavior; flag for L18.
4. The HTML reference in `packages/design-system/html/TaskCard.html` does not currently render an overflow slot. Claude Design must add the visual reference for the kebab-revealed state and the menu-open state. This is a non-blocking ticket for L15 but must land before L15's visual-regression gate goes green. Track separately.
