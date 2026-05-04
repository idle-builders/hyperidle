# L15 — Architecture

## Goal

Strip drag-to-move from Kanban task cards; add a Task Sheet that lets a human request a state change OR navigate to the task's attached thread. Use the existing L1 Thread primitive end-to-end. Canvas Shaped→Committed drag is untouched.

## Non-goals

- Persisting tasks to the server (the WorkTeam page still uses `INITIAL_TASKS` local state — that migration is out of scope for L15).
- Inline thread rendering inside the Sheet (that's L18).
- New endpoints, new MessageType, new payload variant.

## Source-driven notes

- Hono routes: confirmed in-repo at `packages/server/src/routes/threads.ts` (L1a). No need to verify against external docs for this story — we are reusing endpoints already proven by L1's tests.
- React Router v6 `useNavigate` + query string: standard pattern; no UNVERIFIED concerns.
- DaisyUI `modal` / `drawer-end` primitives: in active use elsewhere in the codebase (`PitchSelector` uses an overlay-style pattern; `ConversationsChat` uses dialog primitives). No version-pinning concern.

## Type / schema changes

**None** in `packages/shared`, `packages/db`, `packages/server`. The Thread/Message contract (`packages/shared/src/thread.ts`) and the route schemas (`packages/server/src/routes/threads-schema.ts`) are sufficient as-is.

## Server endpoints — reuse only

| Need | Endpoint | File |
|---|---|---|
| List threads scoped to a task | `GET /api/threads?host_kind=task&host_id=<taskId>` | `packages/server/src/routes/threads.ts:154` |
| Create a task-attached thread | `POST /api/threads` body `{ hostKind: "task", hostId, participants, initialMessage: { type: "plain", payload: { text }, clientKey } }` | `packages/server/src/routes/threads.ts:277` |
| Append a request message | `POST /api/threads/:id/messages` body `{ type: "plain", payload: { text }, clientKey }` | `packages/server/src/routes/threads.ts:381` |

No route changes. No schema changes. No event-bus changes (the existing `ThreadCreatedEvent` and `ThreadMessageAppendedEvent` cover the wire-up.)

## Client changes

### A. Strip drag from `Kanban.tsx`

File: `packages/web/src/shell/Kanban.tsx`.

Remove:
- `@dnd-kit/core` imports.
- `KanbanProps.onMoveTask` (and the prop pass-through everywhere).
- `KanbanColumnState` type (remove from public exports).
- `STATE_TO_COLUMN` keeps EXISTING role: it still maps every `TaskState` to a display column. This stays. Rename to `TASK_STATE_TO_COLUMN` for clarity if helpful, but not required.
- `COLUMN_TO_STATE` — DELETE (dead after drag removal).
- `resolveKanbanDrop` — DELETE (dead).
- `KanbanDropZone` — DELETE; replace with a plain `<div>` for the column body.
- `DraggableTaskCard` — DELETE; replace with `<TaskCard …onClick={() => onSelectTask(task)} />` directly inline.
- `useDraggable`, `useDroppable`, `useSensor`, `useSensors`, `KeyboardSensor`, `PointerSensor`, `DndContext`, `DragOverlay`, `closestCenter`, `DragStartEvent`, `DragEndEvent` imports — DELETE.
- `activeId` state, `handleDragStart`, `handleDragEnd`, the `DragOverlay` JSX — DELETE.

Add to `KanbanProps`:
- `onSelectTask?: (taskId: string) => void` — optional callback raised when the user activates a task card. Optional so existing call sites that don't yet wire the Sheet don't blow up.

Rename: keep `Kanban` as the export name. The empty-state copy `"Drag tasks here or create new ones to populate this column."` must change — proposed copy: `"No tasks yet."` (drop the drag instruction; AC blocks "drag" mention).

### B. Strip move-task handler from `WorkTeam.tsx`

File: `packages/web/src/pages/WorkTeam.tsx` lines 116-120 (`handleMoveTask`).

- DELETE `handleMoveTask` (lines 116-120) and its `import { COLUMN_TO_STATE } from "../shell/Kanban"`.
- DELETE the prop pass-through `onMoveTask={handleMoveTask}` at line 170.

Add:
- A `selectedTaskId: string | null` state.
- A `handleSelectTask(taskId)` callback that sets it.
- Wire `<Kanban … onSelectTask={handleSelectTask} />` (line 170 area).
- Render `<TaskSheet task={selectedTask} open={selectedTask !== null} onClose={…} />` next to the Kanban.

### C. New file: `packages/web/src/shell/TaskSheet.tsx` (Tier 3 shell component)

Public API (signature only — no implementation in this doc):

```ts
export interface TaskSheetProps {
  task: KanbanTask | null;
  open: boolean;
  onClose: () => void;
  /**
   * Resolves (or creates) the attached thread for a task and returns its id.
   * Wired by WorkTeam to the threads API.
   */
  resolveThreadId: (taskId: string) => Promise<string>;
  /**
   * Posts a plain request message on the resolved thread.
   * Wired by WorkTeam to the threads API.
   */
  postRequest: (threadId: string, text: string, clientKey: string) => Promise<void>;
  /**
   * Navigate to the conversations chat surface for a thread id.
   * Wired by WorkTeam to react-router's navigate.
   */
  onNavigateToThread: (threadId: string) => void;
}

export function TaskSheet(props: TaskSheetProps): JSX.Element | null;
```

Inside `TaskSheet`:
- A closed intent vocabulary constant (matches the table in `design/approved.md`):
  ```ts
  const REQUEST_INTENTS = [
    { id: "blocked", label: "Move to BLOCKED", template: "Request: move to BLOCKED." },
    { id: "in_progress", label: "Unblock and resume", template: "Request: unblock and resume." },
    { id: "done", label: "Mark DONE", template: "Request: mark DONE." },
    { id: "hold", label: "Put on HOLD", template: "Request: put on HOLD." },
    { id: "killed", label: "Stop (kill)", template: "Request: stop (kill)." },
  ] as const;
  ```
- Local state: `selectedIntent: typeof REQUEST_INTENTS[number]["id"] | null`, `note: string`, `submitting: boolean`, `status: { kind: "success" | "error"; text: string } | null`.
- **Feedback surface (inline, no toast).** Decision: per CRITICAL #2 of architecture-critique, L15 does NOT depend on a `useToast` hook (none exists in `packages/web/src/` or `packages/design-system/src/`). Instead, the Sheet renders its own feedback region just above the `Send request` button:
  - `<div role="status" aria-live="polite">Sent.</div>` for success.
  - `<div role="alert" aria-live="assertive">Couldn't send — try again.</div>` for error.
  - `<div role="alert" aria-live="assertive">Couldn't open thread — try again.</div>` for the `Open thread` failure path.
  - Same DOM region (only one of the messages can be present at a time); `status` is cleared when the user changes the intent or note.
- On `Send request`:
  1. Build `text = template + (note.trim() ? ` ${note.trim()}` : "")`.
  2. Mint `clientKey = crypto.randomUUID()` (concept §Probe 4 — stable retry safety provided by L1's idempotency contract; the menu closes optimistically so the user can't naturally double-click).
  3. `threadId = await resolveThreadId(task.id)`.
  4. `await postRequest(threadId, text, clientKey)`.
  5. Set `status = { kind: "success", text: "Sent." }`. After ~800ms, `onClose()`. (Sheet self-closes; no global toast surface.)
  6. On any throw at step 3 OR 4: set `status = { kind: "error", text: "Couldn't send — try again." }`, leave the sheet open with selection preserved, `submitting = false`.
- On `Open thread`:
  1. `threadId = await resolveThreadId(task.id)`.
  2. `onNavigateToThread(threadId)` (which itself closes the sheet).
  3. On any throw at step 1: set `status = { kind: "error", text: "Couldn't open thread — try again." }`, leave the sheet open. (Same inline `role="alert"` region as the request error.)

`@lore` to add when the file is written: **"Task ↔ thread resolution is N+1 for now — every Sheet open issues a fresh GET. The list endpoint already supports `(host_kind=task, host_id=<id>)` filtering and there is no caching layer in v1 beyond browser HTTP cache. A bet-detail-style preload could come in L18, but for L15 the Sheet is opened on demand and one round-trip is acceptable."**

### D. New file: `packages/web/src/services/task-threads.ts`

Pure helpers wired into `WorkTeam.tsx`. Centralizes the threads-API calls so `TaskSheet` stays presentation-focused and tests can exercise the helpers directly.

```ts
export async function resolveOrCreateTaskThread(
  taskId: string,
  founderId: string,
  agentParticipantId: string,
): Promise<string>;

export async function postRequestMessage(
  threadId: string,
  text: string,
  clientKey: string,
): Promise<void>;
```

`resolveOrCreateTaskThread` does:
1. `GET /api/threads?host_kind=task&host_id=<taskId>` → if `threads.length > 0`, return `threads[0].id`.
2. Else `POST /api/threads` with `{ hostKind: "task", hostId: taskId, participants: [founderId, agentParticipantId], initialMessage: { type: "plain", payload: { text: "Thread started." }, clientKey: <uuid> } }` → return the created thread's id.

`@lore` to add: **"`founderId` / `agentParticipantId` are pulled from the page's identity context (or `'u-founder'` fallback used elsewhere — see `threads.ts:48` `DEFAULT_FOUNDER_ID`). The agent participant is a placeholder until the task→agent assignment lands; for L15 we accept a static fallback so the request flow works end-to-end without blocking on the agent-assignment story."**

### E. `Kanban.stories.tsx` updates

File: `packages/web/src/shell/Kanban.stories.tsx`.

Remove `onMoveTask` from all stories. Replace with `onSelectTask={fn()}` (or omit, since prop is optional).

### F. Existing tests to update

| File | What changes |
|---|---|
| `packages/web/src/__tests__/Kanban.test.tsx` | Audit before build. Read the file at step 1 of the ordered tasks and explicitly enumerate which assertions reference drag (e.g. `aria-roledescription="draggable"`, `onMoveTask`, drop zones); delete only those. Keep render / column / grouping assertions. Replace any `onMoveTask` mocks with `onSelectTask`. The "if any" wording is REMOVED — the builder must produce a one-line audit log of which assertions died. |
| `packages/web/src/__tests__/Kanban.keyboard-drag.test.tsx` | DELETE the file. Drag is gone. |
| `packages/web/src/__tests__/WorkKanban.grouped.test.tsx` | Remove `onMoveTask={vi.fn()}` from all renders; group tests stay. |
| `packages/web/src/__tests__/WorkTeam.test.tsx` | DELETE lines 73-90 (the `it("exports a COLUMN_TO_STATE map …")` test block). The file as a whole STAYS — the other six tests (render, columns, task cards, pitch selector open/close, Canvas-above-Kanban DOM order) are unrelated to drag and remain green. Only the COLUMN_TO_STATE shape assertion goes. |
| `packages/web/src/shell/Kanban.stories.tsx` | See E above. |

Removing `Kanban.keyboard-drag.test.tsx` is correct: the drag flow it tests no longer exists. The replacement Vitest is in §Test strategy below.

### F.1 Protected tests retired

| Frozen contract | File:lines | Why it goes |
|---|---|---|
| `Kanban` exports `COLUMN_TO_STATE` with `{ planned: "accepted", in_progress: "in_progress", blocked: "blocked", done: "done" }` (I4 K1/K2 lossy-round-trip guard) | `packages/web/src/__tests__/WorkTeam.test.tsx:73-90` | The export is being removed by design. The test exists to guard the column-key → `TaskState` translation that a drag handler performs in `WorkTeam.tsx:handleMoveTask`. With drag stripped (§A) and `handleMoveTask` deleted (§B), the export has zero callers; the inverse-mapping invariant has nothing to protect. The contract is moot — there is no longer any code path that turns a column key into a `TaskState`. |

**E2E retirements (added post-CI fix):**

| E2E test | File:lines | Why it goes |
|---|---|---|
| `KeyboardSensor activates on Space when a TaskCard wrapper is focused` | `packages/web/e2e/keyboard-and-responsive.spec.ts:84-111` | Tests `draggable-task-t1` testid that no longer exists after drag removal. The KeyboardSensor is gone from Kanban by design. |
| `Tab → Space → ArrowRight → Space moves a task between columns (I4 DoD B2)` | `packages/web/e2e/keyboard-and-responsive.spec.ts:113-161` | Tests `data-droppable-column` attributes and keyboard-driven Kanban drag, both removed by §A. |

These two tests formed the `test.describe("Kanban keyboard drag (I4 KB4)")` block. The block was deleted; the remainder of `keyboard-and-responsive.spec.ts` (Keyboard Navigation + Responsive Layout describes) is preserved.

**E2E selector fix (added post-CI fix):**

The `[aria-roledescription="draggable"]` assertion in `L15-task-request.spec.ts` step 2 was scoped to `[data-testid='work-team-kanban']` because Canvas (above the Kanban) retains `@dnd-kit` for bet-card drag and its draggable elements carry `aria-roledescription="draggable"` via the `useDraggable({...attributes})` spread. The architecture §A assertion spec (§§F.2 line) assumed a page-wide zero count, which was incorrect given Canvas drag is a non-goal (see §Non-goals).

This retirement is the only protected-test contract L15 breaks; recording it explicitly satisfies CC-008 (silent protected-test removal regression).

## Test strategy

### Vitest tests (TDD red phase first)

| File | What it covers |
|---|---|
| `packages/web/src/__tests__/Kanban.no-drag.test.tsx` | (NEW) Renders Kanban with tasks; asserts no `data-testid="draggable-task-*"` element, asserts no `[data-droppable-column]`, asserts no `DndContext` (via `aria-roledescription="draggable"` absence is the non-DOM proxy). Also asserts that clicking a task card raises `onSelectTask(taskId)`. |
| `packages/web/src/__tests__/TaskSheet.test.tsx` | (NEW) Mounted with a fixture task and stubbed `resolveThreadId` / `postRequest` / `onNavigateToThread`. Cases: (a) opens with `task` set + `open=true`, sheet visible; (b) `Send request` is disabled until an intent is selected; (c) selecting + clicking calls `postRequest(threadId, expectedText, expectedClientKey)` then renders an inline `[role="status"]` element with text "Sent." and calls `onClose` after ~800ms (use fake timers); (d) error path: when `postRequest` rejects, the sheet stays open, `[role="alert"]` renders with text "Couldn't send — try again.", and the previously selected intent + note are preserved; (e) clicking `Open thread` calls `onNavigateToThread(threadId)`; (f) `Open thread` failure: when `resolveThreadId` rejects, the sheet stays open and `[role="alert"]` renders with text "Couldn't open thread — try again."; (g) ESC closes; (h) close-button click closes. |
| `packages/web/src/__tests__/task-threads.service.test.ts` | (NEW) Mocks `fetch`. Cases: (a) `resolveOrCreateTaskThread` returns existing thread id when GET returns ≥1 thread; (b) creates and returns id when GET returns 0; (c) `postRequestMessage` POSTs the right body; (d) idempotent retry — second call with the same `clientKey` returns 200 and is treated as success (concept §Probe 4). |
| `packages/web/src/__tests__/WorkTeam.task-request.test.tsx` | (NEW) Renders `WorkTeam`, clicks a task → asserts the Sheet renders with that task's title; mocks `fetch` so a request submission flows through `task-threads.service` and the Sheet closes on success. |

### Playwright e2e

File: `packages/web/e2e/L15-task-request.spec.ts` (NEW).

1. Navigate to `/work/team` (or whatever the Team Board URL is — confirm in `router.tsx` during build).
2. **Drag affordance is structurally absent (positive guard, not "drag does nothing").** Before any drag attempt, assert ALL of:
   - `await expect(page.locator('[data-droppable-column]')).toHaveCount(0)` — no DnD-Kit drop zones in the DOM.
   - `await expect(page.locator('[data-testid^="draggable-task-"]')).toHaveCount(0)` — no draggable wrappers.
   - `await expect(page.locator('[aria-roledescription="draggable"]')).toHaveCount(0)` — no DnD-Kit-issued ARIA descriptors.
   These are positive structural assertions: each line proves the markup is gone, independent of whether a drag gesture would throw. Then attempt `dragTo()` from one card to another column anyway and assert the task's parent column is unchanged (defense-in-depth check that the no-op stays a no-op even if a future change re-introduces the markup).
3. Click a task card. Assert the Task Sheet opens (`role=dialog`).
4. Click "Move to BLOCKED" intent.
5. Click `Send request`.
6. Assert: the inline `[role="status"]` element renders with text "Sent.", and the sheet auto-closes (`role=dialog` count returns to 0).
7. Navigate to `/conversations/chat`, select the task's thread, assert the request text is the latest message.
8. Re-open the same task card → click `Open thread` → assert URL is `/conversations/chat?thread=<id>` and the chat surface shows the thread.

### Existing e2e to verify still green

- The Canvas drag e2e (Shaped → Committed bet move) — confirm path: search for `Canvas` keyword in `e2e/`. This must stay green; it's untouched.

## Ordered task breakdown for builder

1. **Red phase — write failing tests.** Add the four Vitest files and the Playwright spec listed above. They MUST fail before any production code lands.
2. **Server confirm.** No server code changes. Run `bun run --cwd packages/server test threads` to confirm the L1 endpoints we depend on are still green; if any are flaky, fix before continuing.
3. **Strip drag from `Kanban.tsx`.** Apply §A in one commit. Tests in `Kanban.no-drag.test.tsx` should now pass; legacy keyboard-drag test is deleted; existing grouped-by-bet test still passes after removing `onMoveTask` props. **In the same commit, delete `WorkTeam.test.tsx:73-90`** (the `it("exports a COLUMN_TO_STATE map …")` block) — that test imports the now-deleted export and would otherwise fail at module load. See §F.1 for the protected-tests rationale.
4. **Strip from `WorkTeam.tsx`.** Apply §B in one commit. The Kanban no longer wires drag; `selectedTaskId` state is added but the Sheet isn't rendered yet (placeholder).
5. **Add `task-threads.ts` service.** Apply §D. Run service tests — green.
6. **Add `TaskSheet.tsx`.** Apply §C. Run sheet tests + integration test — green.
7. **Wire `WorkTeam.tsx`** to render `TaskSheet` and pass the service helpers + `useNavigate`-bound `onNavigateToThread`. Run `WorkTeam.task-request.test.tsx` — green.
8. **Stories.** Add `TaskSheet.stories.tsx` (closed, open-no-intent, open-with-intent, submitting, error). Update `Kanban.stories.tsx` per §E.
9. **Playwright e2e.** Run `bun run e2e` for the L15 spec; debug until green. Confirm Canvas drag e2e still green.
10. **Verify.** `bun run check` + `bun run lint` + `bun run test` — all green.

## Rollback / migration concerns

- **`onMoveTask` removal.** Call sites inventory (already grepped):
  - `packages/web/src/shell/Kanban.tsx` — definition (removed).
  - `packages/web/src/shell/Kanban.stories.tsx` — three story renders pass `onMoveTask`. Update per §E.
  - `packages/web/src/pages/WorkTeam.tsx:170` — pass-through (removed).
  - `packages/web/src/__tests__/Kanban.test.tsx`, `WorkKanban.grouped.test.tsx`, `Kanban.keyboard-drag.test.tsx` — listed in §F.
  No external/published consumers; safe to break the prop signature.

- **`COLUMN_TO_STATE` removal.** Inventory: production call sites are `Kanban.tsx` (definition + co-located inverse) and `WorkTeam.tsx:10` (import). Both die in §A and §B. **One protected-test caller:** `packages/web/src/__tests__/WorkTeam.test.tsx:73-90` imports the export and asserts its shape (the I4 K1/K2 lossy round-trip guard). That assertion block is deleted as part of step 3 (see §F.1 for rationale). Safe — no other consumers in repo, no external publishers.

- **Empty-state copy.** AC implicitly requires no "drag tasks here" instruction (since drag is removed). The copy change is part of §A.

- **Public API of `Kanban`.** The `KanbanColumnState` exported type goes away. Its only external consumer is `WorkTeam.tsx:9` (which dies in §B). Safe.

- **Test inventory.** `Kanban.keyboard-drag.test.tsx` is deleted intentionally; CI will not flag missing tests because the tests we add (`Kanban.no-drag.test.tsx`, etc.) cover the new behavior.

## Security & abuse cases

L15 introduces no new server endpoints; it exercises three reused L1 endpoints. The risk surface is bounded to (a) the new client-side request flow and (b) input that flows from the textarea into the existing `messages` table. Below is the exhaustive enumeration per architecture-critique CC-003.

| Concern | Disposition |
|---|---|
| **Rate-limiting on `POST /api/threads/:id/messages`.** | Inherited from L1. The route at `packages/server/src/routes/threads.ts:381` already runs in the global Hono pipeline; if there is no per-route limiter today, L15 does NOT add one — the threat model is "user-spams-own-thread", which is bounded by the user's own UI (the Sheet auto-closes on success and disables the button while `submitting=true`). **Accepted risk for L15.** Follow-up: a per-user message-post throttle is a cross-cutting concern that should land as its own workpackage when any client surface (Conversations chat, Task Sheet, future surfaces) needs it — not bolted on inside L15. |
| **Rate-limiting on `POST /api/threads`.** | Same disposition as above. The Sheet only POSTs `/api/threads` when `resolveOrCreateTaskThread` finds zero existing threads — at most one creation per task per user, ever. Bounded by domain logic. |
| **Input trust — free-form `note` textarea.** | The note text is treated as **untrusted user input**. It is sent to the server verbatim as `payload.text` (the server stores it as the literal string — see `packages/server/src/routes/threads.ts:381` body schema). Rendering MUST be escape-only: the existing Conversations chat renderer is responsible for escaping `<`, `>`, `&` etc. when displaying message text. **L15 adds NO HTML rendering of the note** — the Sheet itself never echoes the note back as HTML; it lives in the `<textarea>` DOM node only, which is text-mode by browser. A Vitest case in `task-threads.service.test.ts` documents this trust boundary explicitly: when the note contains `<script>alert(1)</script>`, the POST body's `payload.text` is sent as the literal string (no client-side stripping, no client-side escaping — the rendering layer owns it). |
| **`clientKey` idempotency.** | Concept §Probe 4 mandates a stable `clientKey` for every request POST. Enforced at two sites: (1) `TaskSheet.tsx` mints `crypto.randomUUID()` once per `Send request` click and passes it to `postRequest`; (2) `task-threads.ts::postRequestMessage` forwards it verbatim to the server. The server's idempotency key is `(threadId, senderId, clientKey)` per `threads.ts:381`. A retry of the SAME click (e.g. user double-tap before the spinner kicks in, or a transient network blip handled by the browser) returns 200 + the original message, NOT a duplicate. The Sheet's `submitting` flag adds belt-and-braces protection by disabling the button between click and response. |
| **Authorization.** | Inherited from L1's auth model. The user posting is whoever owns the API key on the request; same trust posture as Conversations chat. No new authorization surface. |
| **SSRF / path-traversal.** | N/A. The Sheet has zero URL inputs and zero path inputs. The only server-bound strings are (a) the templated request text + optional note (treated as opaque text) and (b) the task id used as `host_id` query param. The task id is URL-encoded at the call site (`encodeURIComponent(taskId)`) per the suggestion in architecture-critique. |
| **Cross-tab / replay.** | Same `clientKey` posture as L1. Out of scope for L15. |

## Open questions for reviewer (Phase 2)

1. ~~**Toast helper location.**~~ **RESOLVED — Option A: inline status / alert.** No `useToast` hook exists in `packages/web/src/` or `packages/design-system/src/` (verified by grep during architecture-critique round 2). L15 does NOT add one — instead the Sheet renders its own `[role="status"]` for success and `[role="alert"]` for error in its own DOM, then auto-closes after ~800ms on success. This keeps the step count down, avoids a global mount, and matches the workpackage's "minimum to pass tests" principle. Both `architecture.md` §C and `design/approved.md` reflect this.

2. **Agent participant id placeholder.** `task-threads.ts` uses a static `agentParticipantId` until task→agent assignment is wired (a separate workpackage). The string used is `"agent-unassigned"`, exported as `PLACEHOLDER_AGENT_PARTICIPANT_ID` from `task-threads.ts` so the test fixtures and production code share the literal. Architecture-critique flagged this as a WARNING; pinning the string here is the response.

3. ~~**Sheet vs. the existing PitchSelector overlay pattern.**~~ **RESOLVED by design-critique** — the Sheet is the right pattern because it's a per-row detail surface; PitchSelector is a full-section view. No coherence violation.

4. **Whether `Kanban.no-drag.test.tsx` should also assert that dragging via @dnd-kit's keyboard sensor is impossible.** Since the sensor is removed entirely, this is implicitly true; an explicit assertion would require importing the sensor only to confirm it's not wired, which is silly. Skipped.
