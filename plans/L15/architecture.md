# L15 — Architecture

> Strip drag/drop from the Team Board Kanban; tasks become agent-team-owned. Each TaskCard gains a kebab menu (Open thread + state-change request verbs + Kill task) and a conditional unread thread dot. Drag survives only on the Canvas (Shaped → Committed). No new endpoint. No new component primitive. No new DB table.

Inputs (fixed, do NOT re-litigate):
- Spec — `plans/work-packages/TRACK-L.md` § L15 (lines 511-540).
- Concept — `docs/human-interface-layer/thread-primitive.md`.
- Approved design — `plans/L15/design/approved.md` (visual hierarchy, component vocabulary, interaction grammar, copy, density, mobile, a11y, motion, drag-no-op cue all locked).

## Required reading (downstream agents)

Developer / QA / Designer must read before touching this workpackage:

1. `plans/work-packages/TRACK-L.md` — § L15 spec block (acceptance criteria, validation scenarios, contracts).
2. `plans/L15/design/approved.md` — verbatim input contract (especially §4.1 verb matrix, §4.2 wire copy, §6 prop additions, §7 file-level deletions).
3. `docs/human-interface-layer/thread-primitive.md` — Thread/Message shape, host kinds, idempotency rule.
4. `packages/design-system/src/TaskCard.tsx` + `packages/design-system/src/TaskCard.stories.tsx` — current TaskCard and its stories pattern.
5. `packages/web/src/shell/Kanban.tsx` — current drag wiring (deletions enumerated below).
6. `packages/web/src/pages/WorkTeam.tsx` — `handleMoveTask` (deletion target).
7. `packages/server/src/routes/threads.ts` + `packages/server/src/routes/threads-schema.ts` — existing `POST /api/threads/:id/messages` contract.
8. `packages/shared/src/thread.ts` — Thread/Message types and HOST_KINDS.
9. `packages/shared/src/types.ts` — `TASK_STATES`, `TaskState` union.
10. `.claude/rules/typescript.md`, `.claude/rules/aesthetic-quality.md`, `.claude/rules/testing.md`, `.claude/rules/visual-parity.md` — non-negotiable rule files.

## 1. Spec alignment

| AC (TRACK-L § L15) | Artifact | Verification method |
|---|---|---|
| Drag-to-move removed; sensors and column-to-state mapping gone | Kanban.tsx delete-list (§7 of approved); WorkTeam.tsx delete-list | **Vitest** `Kanban.no-dnd.test.tsx`: parses Kanban.tsx source and asserts `useDraggable\|useDroppable\|DndContext\|DragOverlay\|KeyboardSensor\|PointerSensor\|@dnd-kit/core` are NOT present (regex against the file). **Type guard**: `KanbanProps` no longer carries `onMoveTask` (compile error if a caller still passes it). **Playwright** `kanban-drag-noop.spec.ts`: simulate pointer drag from card to a different column; assert card stays in original column DOM. |
| Each task gains an affordance to request a state change OR open the thread; selecting a request posts a message to the thread | TaskCard prop additions; Kanban wires kebab to handlers in WorkTeam | **Vitest** `TaskCard.kebab.test.tsx`: render TaskCard with `onRequestStateChange` + `onOpenThread`, click kebab, assert menu items per `getRequestableVerbRows(state)`, click a verb, assert handler called with `TaskRequestVerb`. **Vitest** `WorkTeam.request-post.test.tsx`: stub fetch, simulate verb pick, assert one `POST /api/threads/<id>/messages` with the canonical body shape (§3 below). |
| Drag survives ONLY between Shaped → Committed columns on the Canvas | Canvas.tsx unchanged | **Vitest** `Canvas.drag-still-works.test.tsx` already exists per L11/I4 — confirm green. **Playwright** `canvas-drag-still-works.spec.ts` (extend existing or add new): drag bet from Shaped → Committed; assert column-of-residence flips. |
| Vitest: drag is a no-op; request actions post messages; opening a thread lifts it | See above | Three Vitest files above. |
| Playwright e2e: try to drag → no-op; request a state change → message in thread | `kanban-drag-noop.spec.ts` + `kanban-request-verb.spec.ts` | Playwright spec mocks `POST /api/threads/:id/messages` and asserts (a) drag attempt does nothing, (b) verb pick fires the POST with the right body, (c) toast `Request posted to thread` appears. |
| `bun run check` + `bun run lint` + `bun run test` all green | n/a | `bun run verify`. |

## 2. Layer integrity

L15 stays inside the Human Interface Layer + the existing server thread-message route. No agent-runtime touch. Confirmed:

- Web: `packages/web/src/shell/Kanban.tsx`, `packages/web/src/pages/WorkTeam.tsx`. No imports from `@hyperidle/fabric` or any agent package.
- Server: zero new routes; existing `POST /api/threads/:id/messages` is reused.
- Shared: one new pure helper (`getRequestableVerbRows`) and one new type (`TaskRequestVerb`) added to `packages/shared/src/task-request.ts`. No runtime dependency added.
- Design system: `packages/design-system/src/TaskCard.tsx` props extended; no new component file.
- DB: no schema change. The existing `threads`/`messages` tables already model `host_kind=task`.
- Layer rule (HI → Meta → Agent Runtime) is preserved end-to-end.

## 3. Contracts

### 3.1 New shared types — `packages/shared/src/task-request.ts`

```ts
import type { TaskState } from "./types.js";

/**
 * Closed vocabulary of state-change verbs the human can REQUEST on a task.
 * Humans request; agents decide. The verb is encoded in the plain message
 * payload (§4.2 of approved design) — there is no separate verb column on
 * the message row, the wire format is the canonical L1 plain-message shape.
 */
export const TASK_REQUEST_VERBS = [
  "pause",
  "mark_blocked",
  "resume",
  "push_to_review",
  "mark_done",
  "reopen",
  "kill",
] as const;
export type TaskRequestVerb = (typeof TASK_REQUEST_VERBS)[number];

/**
 * Render row for the kebab menu — one entry per verb at a given state.
 * Renamed from `RequestableVerb` per critique R1: `disabled: true` rows are
 * NOT requestable, they are still rendered (greyed) to keep the verb set
 * visible — this type describes a render row, not the verb itself.
 */
export interface RequestableVerbRow {
  readonly verb: TaskRequestVerb;
  readonly label: string;            // e.g. "Pause", "Mark blocked"
  readonly targetState: TaskState;   // shown in the right column of the menu row
  readonly disabled: boolean;        // true when not applicable for the current state
  readonly disabledHint?: string;    // e.g. "Already in progress"
}

/**
 * Single source of truth for the per-state ordered verb list. Consumed by
 *  - the web kebab menu renderer (TaskCard / Kanban),
 *  - vitest unit tests asserting the matrix,
 *  - any future server-side validation that wants to bounce malformed
 *    requests early (out of L15 scope but the helper lives in shared so the
 *    door is open).
 *
 * Pure. No I/O. Importable from server tests too.
 */
export function getRequestableVerbRows(state: TaskState): ReadonlyArray<RequestableVerbRow>;

/**
 * Canonical message text per verb (approved.md §4.2). Returned verbatim —
 * no template literal variants, no trailing-period drift, no i18n.
 */
export function requestMessageText(verb: TaskRequestVerb): string;
```

The `requestMessageText` mapping is fixed:

| verb | text |
|---|---|
| `pause` | `Requesting: pause this task.` |
| `mark_blocked` | `Requesting: mark this task as blocked.` |
| `resume` | `Requesting: resume this task.` |
| `push_to_review` | `Requesting: push this task to review.` |
| `mark_done` | `Requesting: mark this task as done.` |
| `reopen` | `Requesting: reopen this task.` |
| `kill` | `Requesting: kill this task.` |

### 3.2 TaskCard prop additions — `packages/design-system/src/TaskCard.tsx`

```ts
export interface TaskCardProps {
  // existing
  title: string;
  owner: string;
  state: TaskState;
  cost?: string;
  betTag?: string;
  actions?: ReactNode;
  onClick?: () => void;

  // L15 additions
  threadUnreadCount?: number;
  threadExists?: boolean;
  onOpenThread?: () => void;
  onRequestStateChange?: (verb: TaskRequestVerb) => void;
}
```

Behavioural rules baked into the component:
1. The kebab is rendered inside the existing `actions` slot via the new menu sub-element. The component owns the open/close state of the dropdown (DaisyUI uses CSS `:focus-within` on the wrapper — verified pattern in DaisyUI 4 dropdown docs).
2. Title row receives `role="button"` + `tabIndex={0}` + `cursor: pointer` ONLY when `(threadUnreadCount ?? 0) > 0`. Otherwise no role, no tabindex, default cursor. (approved.md §3 + §7.)
3. Thread dot rendering: absent when `threadExists !== true && (threadUnreadCount ?? 0) === 0`; grey when `threadExists === true && (threadUnreadCount ?? 0) === 0`; primary-tint when `(threadUnreadCount ?? 0) > 0`.
4. The card NEVER mutates its own `state` prop (optimistic-update prohibition — §3.5).
5. `onClick` is preserved (legacy callers in stories/tests). Production wiring in WorkTeam routes the body-click only via the title-row guarded by unread > 0.

### 3.3 Wire format — `POST /api/threads/:thread_id/messages`

The architecture **reuses** the existing endpoint verbatim. The web posts a `plain` message:

```jsonc
// Request body
{
  "type": "plain",
  "payload": {
    "text": "Requesting: pause this task."   // exact text from requestMessageText(verb)
  },
  "clientKey": "<UUID v4 from crypto.randomUUID()>"   // see §3.4
}
```

Headers: `Content-Type: application/json`, `X-Identity: u-founder` (existing convention; auth-middleware rewrite is out-of-scope, tracked in `auth-middleware-participant-scope` follow-up).

Success response (201 Created — existing contract):

```jsonc
{
  "message": { "id": "...", "threadId": "...", "type": "plain", "payload": { "text": "..." }, ... },
  "thread":  { "id": "...", "hostKind": "task", "hostId": "<task.id>", ... }
}
```

Error responses (existing endpoint behaviour, unchanged):
- `400 validation_error` — bad JSON or schema violation.
- `400 invalid_client_key` — clientKey fails the regex `/^[A-Za-z0-9_\-:.]+$/` or length 8-128.
- `403 forbidden` — sender is not a participant (deferred to `auth-middleware-participant-scope`).
- `404 not_found` — thread id does not exist (see §4 lazy-bootstrap discussion).
- `409 idempotency_conflict` — same clientKey reused with a different payload.

### 3.4 `client_key` strategy

**Decision: `crypto.randomUUID()` per click intent**, generated at the moment the verb is selected (NOT at TaskCard mount). This satisfies the L1 idempotency rule (`unique(thread_id, sender_id, client_key)`) and matches the existing pattern in `packages/web/src/__tests__/ConversationsReview.dispatch.test.tsx:140-142` ("Plan §6.2: clientKey is a UUID generated per click intent").

A double-click on the same verb produces TWO different UUIDs, but both submit hits hit the in-flight guard (the kebab menu item shows a `loading-xs` spinner and the kebab is disabled while a request is in flight — approved.md §5). The post handler is idempotent on retry of the SAME UUID; the kebab disable is the single front-line guard against double-firing.

UUID length is 36 chars, satisfies the regex `/^[A-Za-z0-9_\-:.]+$/` and the 8-128 length window.

### 3.5 Optimistic-update prohibition — encoded in TWO places

1. **Type-level**: `TaskCardProps` does NOT expose any `state` setter, AND `TaskCard.tsx` is forbidden from calling its own `setState` for the `state` prop. The component has no internal copy of `state` — it always renders the prop directly. (Compile-time invariant.)
2. **Vitest**: `TaskCard.optimistic-prohibition.test.tsx` — render the card, fire `onRequestStateChange("mark_done")`, assert the card's StatusChip text is unchanged on the next paint frame. The handler is a `vi.fn()` that does NOT change the parent state. The card MUST display the original state until the parent re-renders with a new state prop.

Both gates are required because (1) catches accidental refactors and (2) catches behavioural drift.

### 3.6 `onOpenThread` resolution — DECISION

**Decision (open question §11.1 of approved.md): URL-param thread selection via `useSearchParams("?id=<threadId>")`.**

Rationale:
- The Submenu's selected-thread state is local to AppShell (`selectedThreadId` lifted state, `AppShell.tsx:441`). Calling `setSelectedThreadId` from WorkTeam.tsx requires drilling a callback through Outlet context — an extra coupling.
- `ConversationsReview.tsx:174` already reads thread id from `?id=<threadId>` (`window.history.replaceState({}, "", "/?id=${id}")` is the existing test fixture pattern). Routing through the URL gives us deep-linkability for free and matches the existing surface.
- L18 will replace `onOpenThread` with the Submenu thread-tab navigation when it lands. The contract for L15 is one function call — `() => navigate(\`/conversations/review?id=${threadId}\`)`. That call site moves to L18 without touching TaskCard or Kanban.
- Crucially: L15 does NOT navigate to a Submenu state change because no Submenu thread-tab exists yet (out-of-scope per §13).

The wiring lives in `WorkTeam.tsx` (the smart container). `Kanban.tsx` stays presentational.

### 3.7 Error response shape

Reused L1 shape (`packages/server/src/routes/threads.ts:140`):

```ts
interface ApiErrorResponse {
  readonly error: string;     // human-readable
  readonly code: string;      // machine-readable enum (`validation_error`, `not_found`, `forbidden`, `idempotency_conflict`)
}
```

Web treats every non-2xx as a request-failed signal. Toast copy on failure: `Could not post request — try again.` (mono 11px, alert-error variant, dismisses after `--motion-slow × 16` = 4 s).

## 4. Data model

No new tables. The existing `threads` and `messages` tables (schema.ts:175-222) already model `host_kind=task`.

### 4.1 Lazy thread bootstrap on first request — DECISION

**Decision (open question §11.3): client double-call (`POST /api/threads` then `POST /api/threads/:id/messages`).**

Rationale (rejected alternative: server-side create-on-write inside `POST /api/threads/:id/messages`):
- Create-on-write would force the `:id` route param to optionally accept `task:<task_id>` as an alternate addressing form, breaking the "id is opaque, server-generated" contract from `docs/human-interface-layer/thread-primitive.md`.
- It would also require a synthetic redirect-on-create flow, doubling the test surface (the route would have two semantics: append-to-existing vs. create-then-append).
- The existing `POST /api/threads` endpoint is purpose-built for this (atomic create + initial message in one transaction — `threads.ts:278-378`). A client that does NOT yet have a thread id must call it. We extend NO server contract.

The web flow:

```
verb picked
  └─ if task.threadId is known → POST /api/threads/<id>/messages
  └─ else                       → POST /api/threads        (atomic: create thread + post the request as `initialMessage`)
                                  on 201, capture the returned thread.id and stash on the local task model
```

Concrete `POST /api/threads` body for the create-on-first-request branch:

```jsonc
{
  "hostKind": "task",
  "hostId": "<task.id>",
  "participants": ["u-founder"],
  "pinned": false,
  "initialMessage": {
    "type": "plain",
    "payload": { "text": "Requesting: pause this task." },
    "clientKey": "<UUID v4>"
  }
}
```

Server transaction (Drizzle, sqlite — `threads.ts:310-335`):

```
db.transaction((tx) => {
  tx.insert(threads).values({ id, hostKind: "task", hostId, initiatorId: senderId,
                              participants: JSON.stringify(sortedParticipants),
                              pinned: 0, lastActiveAt: now, createdAt: now }).run();
  tx.insert(messages).values({ id: messageId, senderId, threadId,
                               type: "plain", payload: JSON.stringify({ text }),
                               clientKey, createdAt: now }).run();
});
```

Columns relied upon: `threads.id`, `host_kind`, `host_id`, `initiator_id`, `participants` (JSON array of identity ids), `pinned`, `last_active_at`, `created_at`. `messages.id`, `sender_id`, `thread_id`, `type`, `payload`, `client_key`, `created_at`. All present per `packages/db/src/schema.ts:175-222`. PostgreSQL mirror exists in `schema.pg.ts` (verified by L1 dual-driver tests).

### 4.2 Identity attribution + participants list

The server already resolves senderId via `X-Identity` header with default `u-founder` (`threads.ts:50-56`). The web client sets `X-Identity: u-founder` on every request-verb post — no new auth surface.

**Participants list on lazy-bootstrap is `["u-founder"]` only** (founder bootstraps; the task agent is added when it first replies — matches the "founder-initiated thread" pattern). The current `KanbanTask` model carries only `owner` as a display string and has no `ownerAgentId`. Adding `ownerAgentId` would force a schema/data-source change beyond L15's scope. Tracked as `task-thread-agent-participant` follow-up: when L18 wires the live thread index, it adds the task's owning agent id to the participants list at thread-fetch time (or via a server-side enrichment). Until then the founder is the sole initial participant; the agent self-adds on reply.

### 4.3 Optimistic UI is forbidden — server-emitted events drive the chip

When the agent honours a request, the server emits `TaskStateChangedEvent` (existing event-bus contract, out-of-L15) and the card subscription updates the chip. L15 must not preempt this.

## 5. Naming

| Symbol | File | Notes |
|---|---|---|
| `TaskRequestVerb`, `TASK_REQUEST_VERBS`, `RequestableVerbRow` | `packages/shared/src/task-request.ts` | New file. Primary export pattern matches `thread.ts`. SCREAMING_SNAKE_CASE for the constant array; PascalCase for the row type. `RequestableVerbRow` is honest — instances may be `disabled` (still render). |
| `getRequestableVerbRows`, `requestMessageText` | same file | camelCase functions; explicit return types. |
| `TaskCard` props additions | `packages/design-system/src/TaskCard.tsx` (existing file, primary export `TaskCard`) | No file rename. |
| `useTaskRequestVerb` (optional helper hook for the kebab post) | `packages/web/src/hooks/useTaskRequestVerb.ts` | If introduced — see §6 task #6 — primary export name matches file. |
| Drag-removal protected test | `packages/web/src/shell/__tests__/Kanban.no-dnd.test.ts` | Test file name describes the assertion. |

No barrel files added. Shared package re-exports the new symbols from `packages/shared/src/index.ts` (existing barrel — L1 follows the pattern).

## 6. Depth — file-by-file change list (in order)

| # | File (absolute) | Change | Why |
|---|---|---|---|
| 1 | `/Users/tobiasgrundmann/Development/hyperidle/.worktrees/L15-baseline2/packages/shared/src/task-request.ts` | **NEW.** `TASK_REQUEST_VERBS`, `TaskRequestVerb`, `RequestableVerbRow`, `getRequestableVerbRows(state)`, `requestMessageText(verb)`. | Single source of truth for the §4.1 verb matrix and §4.2 wire copy. Importable from web + server tests. |
| 2 | `/Users/tobiasgrundmann/Development/hyperidle/.worktrees/L15-baseline2/packages/shared/src/index.ts` | Re-export the four symbols above. | Barrel — only the package's `index.ts` is allowed (typescript.md). |
| 3 | `/Users/tobiasgrundmann/Development/hyperidle/.worktrees/L15-baseline2/packages/shared/src/__tests__/task-request.test.ts` | **NEW.** Vitest unit tests: every TaskState yields the documented ordered verb list with the documented disabled flags; every verb maps to its exact wire text. | Lock the matrix. |
| 4 | `/Users/tobiasgrundmann/Development/hyperidle/.worktrees/L15-baseline2/packages/design-system/src/TaskCard.tsx` | Add `threadUnreadCount`, `threadExists`, `onOpenThread`, `onRequestStateChange` props; render thread dot + kebab dropdown using DaisyUI `dropdown` + `menu`. Title row becomes a button only when `(threadUnreadCount ?? 0) > 0`. | Approved design §6 + §7. No new component primitive — uses DaisyUI directly. |
| 5 | `/Users/tobiasgrundmann/Development/hyperidle/.worktrees/L15-baseline2/packages/design-system/src/TaskCard.stories.tsx` | Add stories: `WithUnreadDot`, `WithReadDot`, `NoThread`, `KebabOpen`, `BlockedState`, `DoneState`. | Stories required by `.claude/rules/testing.md` for every component change. |
| 6 | `/Users/tobiasgrundmann/Development/hyperidle/.worktrees/L15-baseline2/packages/design-system/html/TaskCard.html` | Update HTML reference to mirror the kebab + thread dot rendering for visual-parity sync (`bun run ds:sync`). | `.claude/rules/visual-parity.md` — HTML is the source of truth for visual style. The HTML must show the new affordances at the same DOM shape. |
| 7 | `/Users/tobiasgrundmann/Development/hyperidle/.worktrees/L15-baseline2/packages/design-system/src/__tests__/TaskCard.kebab.test.tsx` | **NEW.** Vitest unit tests: kebab opens, menu items match `getRequestableVerbRows(state)`, click verb fires `onRequestStateChange`, click `Open thread` fires `onOpenThread`, disabled item does not fire. | Component-level unit. |
| 8 | `/Users/tobiasgrundmann/Development/hyperidle/.worktrees/L15-baseline2/packages/design-system/src/__tests__/TaskCard.title-row.test.tsx` | **NEW.** Asserts: title row has role+tabindex+cursor only when `threadUnreadCount > 0`; pressing Enter on title row fires `onOpenThread`. | Conditional body-click invariant. |
| 9 | `/Users/tobiasgrundmann/Development/hyperidle/.worktrees/L15-baseline2/packages/design-system/src/__tests__/TaskCard.optimistic-prohibition.test.tsx` | **NEW.** Render card with `state="accepted"`, fire `onRequestStateChange("mark_done")` (vi.fn that does nothing). Assert StatusChip still reads "accepted"-mapped status. | Optimistic-update prohibition (§3.5). |
| 10 | `/Users/tobiasgrundmann/Development/hyperidle/.worktrees/L15-baseline2/packages/web/src/shell/Kanban.tsx` | **DELETE** the @dnd-kit imports, `DraggableTaskCard`, `KanbanDropZone`, `resolveKanbanDrop`, `COLUMN_TO_STATE`, `onMoveTask` from `KanbanProps`, `DndContext` + `DragOverlay` wrappers, `handleDragStart`, `handleDragEnd`, `useSensors`, the `setActiveId` state. **KEEP** `STATE_TO_COLUMN`, `groupTasksByBet`, the column header/badge layout. **ADD** plumbing to map per-task `threadUnreadCount` / `threadExists` / `onOpenThread` / `onRequestStateChange` props through to TaskCard. | Approved §7. |
| 11 | `/Users/tobiasgrundmann/Development/hyperidle/.worktrees/L15-baseline2/packages/web/src/shell/Kanban.stories.tsx` | Update stories: drop drag-related variants; add `WithThreadDots`, `WithUnreadTask`. | Stories. |
| 12 | `/Users/tobiasgrundmann/Development/hyperidle/.worktrees/L15-baseline2/packages/web/src/shell/__tests__/Kanban.no-dnd.test.ts` | **NEW. PROTECTED TEST.** Reads `Kanban.tsx` source as text and asserts none of `useDraggable`, `useDroppable`, `DndContext`, `DragOverlay`, `KeyboardSensor`, `PointerSensor`, `useSensors`, `closestCenter`, `@dnd-kit/core` are present. | Regression guard — drag must never come back. |
| 13 | `/Users/tobiasgrundmann/Development/hyperidle/.worktrees/L15-baseline2/packages/web/src/shell/__tests__/Kanban.test.tsx` (extend OR new file `Kanban.props.test.tsx`) | Update / replace existing drag-resolver tests. Add: render Kanban with tasks across all states, assert columns + counts, click kebab on a task, assert call to `onRequestStateChange`, click Open-thread, assert `onOpenThread` call. Type-level assertion: `KanbanProps` lacks `onMoveTask` (`@ts-expect-error` line). | Behavioural + compile-time guard. |
| 14 | `/Users/tobiasgrundmann/Development/hyperidle/.worktrees/L15-baseline2/packages/web/src/pages/WorkTeam.tsx` | **DELETE** `handleMoveTask` (lines 116-120), the `COLUMN_TO_STATE` import, the `onMoveTask` prop on the Kanban call. **ADD** `handleOpenThread(taskId)` (navigates to `/conversations/review?id=<threadId>`) and `handleRequestStateChange(taskId, verb)` that posts the request (lazy bootstrap branch — see §4.1) and shows a toast. Per-task `threadUnreadCount` / `threadExists` come from a placeholder mock for now (the live thread index is L18's job). | Smart-container wiring. |
| 15 | _(removed — folded into WorkTeam.tsx)_ | The clientKey + in-flight + lazy-bootstrap + toast logic lives inline in `WorkTeam.tsx` because there is exactly one caller. Extract into a hook only when a second caller appears (e.g. L18 thread-from-anywhere). | Architecture-critique round 1 WARNING — binary decision, no hedge. |
| 16 | `/Users/tobiasgrundmann/Development/hyperidle/.worktrees/L15-baseline2/packages/web/src/__tests__/WorkTeam.request-post.test.tsx` | **NEW.** Stub `globalThis.fetch`. Render WorkTeam, click kebab on a task, click `Pause`, assert exactly one POST to `/api/threads/<id>/messages` (or `/api/threads` for the lazy-bootstrap branch) with the canonical body. Assert the StatusChip does NOT change (optimistic prohibition at the page level). | Behavioural integration. |
| 17 | `/Users/tobiasgrundmann/Development/hyperidle/.worktrees/L15-baseline2/packages/web/src/__tests__/WorkTeam.lazy-bootstrap.test.tsx` | **NEW.** First request on a task with no thread: assert TWO calls — one `POST /api/threads` (atomic create + initialMessage) and zero follow-up `/messages` calls. Second request on the same task: assert one `POST /api/threads/<captured-id>/messages`. | Lazy-bootstrap §4.1. |
| 18 | `/Users/tobiasgrundmann/Development/hyperidle/.worktrees/L15-baseline2/packages/web/e2e/kanban-drag-noop.spec.ts` | **NEW Playwright.** Drag a task card to a different column. Assert it stays put (DOM ancestry unchanged). Assert no fetch call to `/api/threads` was made by the drag attempt. | Acceptance from spec. |
| 19 | `/Users/tobiasgrundmann/Development/hyperidle/.worktrees/L15-baseline2/packages/web/e2e/kanban-request-verb.spec.ts` | **NEW Playwright.** Mock `/api/threads*` POSTs. Click kebab on a task, click `Pause`. Assert the toast "Request posted to thread" appears. Assert a POST happened. Assert StatusChip text on the card is unchanged. | Acceptance from spec. |
| 20 | `/Users/tobiasgrundmann/Development/hyperidle/.worktrees/L15-baseline2/packages/web/e2e/canvas-drag-still-works.spec.ts` | **EXTEND or NEW.** Drag a Canvas bet from Shaped → Committed; assert column-of-residence flips. | Survival rule for the Canvas. (May already exist — confirm during write-tests.) |
| 21 | `/Users/tobiasgrundmann/Development/hyperidle/.worktrees/L15-baseline2/plans/L15/dod.md` | **NEW.** DoD checklist mirroring the §1 table. | DoD audit input. |

**Total files in change list: 20** (11 new, 9 modified). _(Hook task #15 removed per critique round 1 — fold logic inline in WorkTeam.tsx.)_

## 7. Failure-mode coverage

| Failure | What happens | Test |
|---|---|---|
| `POST /api/threads` (lazy bootstrap) fails (5xx, network) | Toast `Could not post request — try again.`; menu reopens; no clientKey reuse on retry (each click re-rolls UUID). | `WorkTeam.lazy-bootstrap.test.tsx` — fetch returns 500, assert toast + retry path. |
| `POST /api/threads/:id/messages` fails | Same toast; kebab re-enables. | `WorkTeam.request-post.test.tsx` — fetch returns 500, assert toast. |
| Network drops mid-request (fetch rejects) | Promise rejection caught in WorkTeam handler; toast fires; in-flight flag clears. | `WorkTeam.request-post.test.tsx` — extra case where `fetch` returns `Promise.reject(new TypeError("network"))`. |
| Double-click on the same verb | Kebab is disabled while in-flight (CSS + JS). Even if click sneaks through, the SECOND click rolls a new UUID — server treats both as distinct messages. **Idempotency does NOT dedupe a double-click; the kebab disable does.** This is intentional and matches L1 contract. | `TaskCard.kebab.test.tsx` — fire two consecutive clicks, assert handler called once because the second click hit a disabled item. |
| State already matches request (e.g. "Mark blocked" on a `blocked` task) | Verb is greyed out (`disabled` from `getRequestableVerbRows`); click is a no-op. | `task-request.test.ts` — every state yields the right disabled flags. |
| Verb is disabled but client tampered with the DOM | Server has no business-rule protection (L15 does not add one). The verb is posted as a plain message; agent sees it and ignores or replies. **No state-machine harm because the server never auto-applies the verb.** Documented limitation; tracked as `task-verb-server-validation` follow-up if/when an agent auto-applies. | n/a — out-of-scope for L15. |
| Agent rejects between request and refresh | No card-level visual change. The agent's reply lands in the thread; thread dot becomes primary-tint on the next AppShell threads-fetch tick. | Out-of-scope behavioural test (L18 covers thread-dot live updates). |
| Drag attempt on touch device | No `draggable` attribute; no touch DnD listener; cursor unchanged; long-press triggers iOS text-selection (browser default). | `kanban-drag-noop.spec.ts` runs in Chromium; iOS-specific behaviour deferred to manual QA. |
| `?id=<threadId>` URL param refers to a thread that no longer exists | `ConversationsReview` already renders an error state on 404 (`ConversationsReview.tsx:174` existing path). | n/a — existing behaviour. |
| Two founders click the same verb concurrently (race) | L1 `unique(thread_id, sender_id, client_key)` lets both posts succeed because clientKeys differ; the thread now has two identical messages. Acceptable — the agent reads, dedupes the request semantically. | n/a — documented behaviour. |
| `crypto.randomUUID` unavailable (older browser) | Project requires modern Chromium for the dev/test surface; `crypto.randomUUID` is supported in all targeted browsers. Documented in `.claude/rules/frontend.md` as the runtime baseline. | n/a. |
| `crypto.randomUUID` not available (insecure context — e.g. `http://` non-localhost) | The Secure Context API requires HTTPS or localhost. Dev (vite localhost) + Playwright (localhost) + production (HTTPS) all qualify. Non-localhost HTTP is not a deployment target. | n/a. |

## 8. Simplicity

Justification per new file:

- `task-request.ts` (NEW) — required as a single source of truth: the same matrix is consumed by web (kebab render + tests) AND by server tests (verifying the wire copy maps 1:1 to the spec). Cannot live in the design-system package because the server cannot import the design system.
- `useTaskRequestVerb.ts` (NEW, optional) — extracts ~40 lines of fetch + clientKey + toast + in-flight tracking from WorkTeam.tsx. **This is the marginal call.** If the simplification scan flags it, the bias is to fold into `WorkTeam.tsx`. The hook adds one file but reduces page complexity and isolates the seam for tests.
- `Kanban.no-dnd.test.ts` (NEW) — protected test. Cannot be skipped: the drag-removal acceptance criterion needs an automated guardrail or it will silently regress when someone copy-pastes drag wiring back from git history.
- New stories — every new TaskCard variant must be visible at `/designsystem` per `.claude/rules/design-system.md`.

Code DELETED: ~80 lines (DnD wiring in Kanban.tsx + handleMoveTask in WorkTeam.tsx + COLUMN_TO_STATE map). Code ADDED: ~120 lines of TaskCard props + ~30 lines of WorkTeam wiring + ~50 lines in shared. **Net add ≈ 120 LOC**, well under the "minimal" budget.

## 9. Verifiability

### Tests per AC

| AC | Test file(s) | Test names | Assertion |
|---|---|---|---|
| Drag removed | `packages/web/src/shell/__tests__/Kanban.no-dnd.test.ts` | `Kanban source contains no @dnd-kit imports` | regex search across the file source returns 0 hits for each forbidden symbol |
| Drag removed (type) | `packages/web/src/shell/__tests__/Kanban.props.test.tsx` | `KanbanProps does not accept onMoveTask` | `@ts-expect-error` on a tsx call passing `onMoveTask` |
| Drag removed (e2e) | `packages/web/e2e/kanban-drag-noop.spec.ts` | `dragging a task card is a no-op` | mouse drag → card DOM ancestor unchanged |
| Request fires message | `packages/web/src/__tests__/WorkTeam.request-post.test.tsx` | `clicking Pause posts a plain message to the thread` | one POST, body matches `requestMessageText("pause")` |
| Lazy bootstrap | `packages/web/src/__tests__/WorkTeam.lazy-bootstrap.test.tsx` | `first request on a task without a thread creates the thread atomically` | two-step asserts |
| Open thread | `packages/design-system/src/__tests__/TaskCard.kebab.test.tsx` + `packages/web/src/__tests__/WorkTeam.open-thread.test.tsx` | `Open thread row navigates to the thread URL` | `useNavigate` mock called with `/conversations/review?id=<threadId>` |
| Verb matrix | `packages/shared/src/__tests__/task-request.test.ts` | `getRequestableVerbRows(<state>) returns the documented order and disabled flags` | every state × every verb |
| Conditional title-row click | `packages/design-system/src/__tests__/TaskCard.title-row.test.tsx` | `title row is a button only when threadUnreadCount > 0` | role/tabindex assertions |
| Toast | `packages/web/e2e/kanban-request-verb.spec.ts` | `successful request shows the Request posted toast` | `getByText('Request posted to thread')` |
| Optimistic-update prohibition | `packages/design-system/src/__tests__/TaskCard.optimistic-prohibition.test.tsx` | `state prop is the only source of StatusChip text` | StatusChip unchanged after onRequestStateChange |

### Protected tests

```
protectedTests:
  - packages/web/src/shell/__tests__/Kanban.no-dnd.test.ts
  - packages/web/src/__tests__/TaskCard.optimistic-prohibition.test.tsx
```

DoD audits these with `git diff --name-only` (CC-008).

> **Apply-review A1:** kebab/title-row/optimistic-prohibition tests live at
> `packages/web/src/__tests__/` rather than `packages/design-system/src/__tests__/`.
> They import `TaskCard` from the package barrel `@hyperidle/design-system`
> and only exercise component-level behaviour, but the test runtime
> (jsdom + @testing-library/react) is provisioned in the web package, not
> the design-system package. Adding it to design-system would be a bigger
> footprint than the protected-test path drift; we update the protected
> path here instead.

## 10. Security & abuse cases

| Concern | Status |
|---|---|
| Rate limit on POST | **Applicable + addressed by existing middleware.** `packages/server/src/middleware/rate-limit.ts` is mounted globally on the Hono app (`app.ts:194`). The thread-message route inherits the bucket; L15 adds no new endpoint, no new escape. |
| Input-trust boundary on agent-authored field | **N/A.** L15 messages are human-authored. |
| Secret handling | **N/A.** No new credential surface. |
| Path traversal | **N/A.** No path inputs. |
| SSRF | **N/A.** No outbound URL inputs. |
| Authz on POST | **Applicable.** Existing endpoint enforces "sender must be a participant" (`threads.ts:418-421`). The IDOR follow-up (`auth-middleware-participant-scope`) is documented in `plans/work-packages/follow-ups.md` and is shared with L1/L8 — L15 does NOT widen that surface. |
| Verb-tampering (client picks a disabled verb via dev-tools) | **Documented (out-of-scope).** Server posts the message verbatim; agent decides. No state machine bypass possible because the server never auto-applies the verb. Tracked as `task-verb-server-validation` follow-up. |
| Idempotency replay attacks | **Addressed by existing logic.** `unique(thread_id, sender_id, client_key)` + 409 on payload divergence. |

No new endpoints → no new attack surface. Confirmed.

## 11. Route checklist

L15 touches one server route — and only as a CONSUMER:

| Route | Method | Middleware/guards | Touched? |
|---|---|---|---|
| `/api/threads/:id/messages` | POST | rate-limit (global), CORS, body-limit, error-handler, sender-as-participant authz, idempotency unique constraint | Consumer only — no code change in `packages/server/src/routes/threads.ts`. |
| `/api/threads` | POST | same as above | Consumer only — no code change. |
| All other routes | n/a | n/a | not touched |

No new server route. No new middleware. No new handler.

## 12. Ordered task list

Granularity ≤ 30 min focused work each. `/write-tests` runs the `[tests]` and `[tests-e2e]` lines; `/write-code` runs the `[code]` lines in order.

1. **[tests]** Write `packages/shared/src/__tests__/task-request.test.ts` — verb matrix tests for every TaskState; wire-copy tests for every verb. Tests fail (helper missing).
2. **[code]** Create `packages/shared/src/task-request.ts` exporting `TASK_REQUEST_VERBS`, `TaskRequestVerb`, `RequestableVerbRowRow`, `getRequestableVerbRows`, `requestMessageText`. Re-export from `packages/shared/src/index.ts`.
3. **[tests]** Write `packages/design-system/src/__tests__/TaskCard.kebab.test.tsx` — render TaskCard, open kebab, click each verb, assert handler calls.
4. **[code]** Update `packages/design-system/html/TaskCard.html` first to mirror new DOM shape (visual-parity rule: HTML is the source of truth).
5. **[code]** Update `packages/design-system/src/TaskCard.tsx` — add four new optional props; render kebab via DaisyUI dropdown; render thread dot. Match HTML reference pixel-for-pixel.
6. **[code]** Update `packages/design-system/src/TaskCard.stories.tsx` — add `WithUnreadDot`, `WithReadDot`, `NoThread`, `KebabOpen`, `BlockedState`, `DoneState` stories.
7. **[tests]** Write `packages/design-system/src/__tests__/TaskCard.title-row.test.tsx` — conditional role/tabindex/cursor.
8. **[tests]** Write `packages/design-system/src/__tests__/TaskCard.optimistic-prohibition.test.tsx` — state prop is single source of truth.
9. **[tests]** Write `packages/web/src/shell/__tests__/Kanban.no-dnd.test.ts` — source-text guard. Initially fails (drag still in source).
10. **[code]** Edit `packages/web/src/shell/Kanban.tsx` — delete drag wiring per approved §7. Plumb new TaskCard props through.
11. **[code]** Update `packages/web/src/shell/Kanban.stories.tsx`.
12. **[tests]** Write `packages/web/src/shell/__tests__/Kanban.props.test.tsx` — `@ts-expect-error` on `onMoveTask`; behaviour tests for new props.
13. **[code]** Edit `packages/web/src/pages/WorkTeam.tsx` — delete `handleMoveTask`; add `handleOpenThread` (navigate URL) + inline `handleRequestStateChange` (clientKey gen via `crypto.randomUUID()`, lazy-bootstrap branch, error/success toast). Mock `threadUnreadCount` / `threadExists` state until L18 lands.
14. **[tests]** Write `packages/web/src/__tests__/WorkTeam.request-post.test.tsx` (includes the network-drop case).
15. **[tests]** Write `packages/web/src/__tests__/WorkTeam.lazy-bootstrap.test.tsx`.
16. **[tests]** Write `packages/web/src/__tests__/WorkTeam.open-thread.test.tsx`.
17. **[tests-e2e]** Write `packages/web/e2e/kanban-drag-noop.spec.ts`.
18. **[tests-e2e]** Write `packages/web/e2e/kanban-request-verb.spec.ts`.
19. **[tests-e2e]** Confirm Canvas drag survives — search `packages/web/e2e/work-surface.spec.ts` for an existing assertion; if absent, add a NEW `packages/web/e2e/canvas-drag-still-works.spec.ts` with one drag scenario.
20. **[code]** Run `bun run verify`. Fix linter, typecheck, test failures.
21. **[code]** Run `bun run ds:sync` — visual parity check between TaskCard.html and TaskCard.tsx; if > 5% diff, fix the TSX.
22. **[code]** Update `plans/L15/dod.md` (DoD checklist).

## 13. Plan reconciliation

### What is OUT of scope for L15

- **Submenu thread-tab navigation** — L18 introduces the inline thread-detail surface. Until then, `onOpenThread` resolves to a URL push to `/conversations/review?id=<threadId>`. L18 will replace this in WorkTeam.tsx — TaskCard contract doesn't change.
- **Thread detail surface** — already exists in `ConversationsReview.tsx`. L15 reuses it as the navigation target.
- **Agent-side honouring of requests** — agents read messages and decide. L15 does not add any auto-state-change.
- **Live thread-unread count per task** — the AppShell's `useConversationsThreads` hook is scoped to the founder's threads. A per-task index is L18's deliverable. L15 ships with a minimal local mock for `threadUnreadCount` / `threadExists` (sourced from the existing Kanban INITIAL_TASKS fixture extended with two booleans). The interface is correct; the data source is L18's job.
- **Server-side validation of disabled verbs** — tracked as `task-verb-server-validation` follow-up.
- **Server-side dual-driver tests for the lazy bootstrap** — already covered by L1 dual-driver tests on the existing routes.
- **Bulk select / multi-card actions** — explicitly rejected (approved.md §12).
- **Dark/light theme tweaks for the new affordances** — design-system tokens already cover the new DOM; visual parity check confirms.

### Spec ⇆ reality reconciliation

| Spec assumption | Reality | Plan handling |
|---|---|---|
| Tasks have a `threadId` field on the local model | The Kanban `KanbanTask` interface (`Kanban.tsx:21-28`) does NOT include `threadId`. | L15 adds optional `threadId?: string`, `threadUnreadCount?: number`, `threadExists?: boolean` to `KanbanTask`. Live data plumbing remains a mock until L18. |
| Server has a `host_kind=task` thread route convention | Verified: `HOST_KINDS` includes `task` (`packages/shared/src/thread.ts:17-26`); server `POST /api/threads` accepts arbitrary `hostKind` from the enum. | No change. |
| `client_key` regex / length | Verified: `/^[A-Za-z0-9_\-:.]+$/`, 8-128 (`threads-schema.ts:21-22`); `crypto.randomUUID()` is 36 chars and matches. | No change. |
| `TaskCard` already has an `actions` slot | Verified (`TaskCard.tsx:16`). | Reuse for the kebab. |
| Title-row 44 px touch target on mobile | Title row is 14 px × 1.5 line-height ≈ 21 px; needs an `::before` 44 px overlay when unread > 0 per approved.md §9. | TaskCard adds the overlay only when `threadUnreadCount > 0`. |
| `useNavigate` is available in the surface | Verified — `Rail.tsx`, `AppShell.tsx`, `KnowledgeList.tsx` all use it. | WorkTeam uses it for `handleOpenThread`. |

### Confusion blocks (resolved)

#### CONFUSION: how `threadUnreadCount` data lands on each task — RESOLVED
I'm uncertain about: live source of `threadUnreadCount` per task in L15 (no per-task thread index exists yet).
Options:
A) Build a per-task thread index now — consequences: scope creep, duplicates L18.
B) Use the existing `useConversationsThreads` hook — consequences: hook is global to the founder, not keyed by host_id.
C) Mock the field in WorkTeam fixture for now — consequences: e2e test for unread state is shallow, but the approved design states the live data plumbing is L18's deliverable.

**Proceeding with (C)**: TaskCard's contract is correct, kebab + dot wiring is real, the data source is mocked at the WorkTeam page level until L18 lands. Marked as known scope boundary in §13.

## Open questions answered (mapped to approved.md §11)

| # | Question | Answer |
|---|---|---|
| 1 | `onOpenThread` → route push or Submenu state change? | **Route push** to `/conversations/review?id=<threadId>` via `useNavigate`. See §3.6. |
| 2 | Reuse `POST /api/threads/:id/messages`? | **Confirmed.** Plus `POST /api/threads` for the lazy-bootstrap branch. No new endpoint. See §3.3 + §4.1. |
| 3 | Lazy bootstrap — server create-on-write vs. client double-call? | **Client double-call.** Avoids semantic overload of the messages route. See §4.1. |
| 4 | `client_key` strategy? | **`crypto.randomUUID()` per click intent.** See §3.4. |
| 5 | `getRequestableVerbRows` location? | **`packages/shared/src/task-request.ts`** — importable from web + server tests. See §3.1 + §5. |
| 6 | Optimistic-update prohibition encoded where? | **Both** — type-level (no setter on TaskCardProps; component never owns `state` internally) AND vitest (`TaskCard.optimistic-prohibition.test.tsx`). See §3.5. |

---
