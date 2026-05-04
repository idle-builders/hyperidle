# L15 — Strip drag/drop from Kanban; let humans request task changes

**Status.** Architecture plan. Locked design at `docs/design-explorations/L15/approved.md`. Story: `docs/work-packages/TRACK-L.md` §L15 (lines 511-540).

This plan does NOT re-litigate visual or interaction grammar (those are locked in approved.md §11 rejection list). It pins types, file paths, endpoints, ordered tasks, and resolves the architect-facing open questions.

---

## 1. Context

The Team Board's Kanban currently uses `@dnd-kit/core` to let users drag task cards between columns. Per v3, tasks are agent-team-owned: humans request, agents decide. L15 deletes the drag affordance from `Kanban.tsx`, deletes the `handleMoveTask` handler in `WorkTeam.tsx`, and ships a per-card affordance that posts a `plain` message to the task's L1 thread.

Drag survives ONLY between Shaped → Committed columns on the Canvas (Shape Up shaping — that IS a human-owned move). `Canvas.tsx` is untouched.

---

## 2. Constraints (fixed inputs)

- L1 Thread primitive ships and supports `host_kind: 'task'` (verified: `packages/server/src/routes/__tests__/threads.routes.test.ts:131-144` round-trips all 8 host kinds; threads schema `HOST_KINDS` enum includes `task`).
- `MESSAGE_TYPES` is closed at 4 (`plain | review | questionnaire | verdict`) — `packages/shared/src/thread.ts:29`. Adding a new value requires a concept-doc update first. **The L15 message uses `type: 'plain'`** (per design §5 + rejection list item 3).
- `TaskState` enum is closed at 8 (`proposed | accepted | hold | in_progress | blocked | review | done | killed`) — `packages/shared/src/types.ts:10-21`.
- `POST /api/threads/:id/messages` and `POST /api/threads` already implement `(thread_id, sender_id, client_key)` idempotency, sender authorization (must be a participant), and event emission. No new endpoints.
- 19-component budget honoured at 19. Net components added by L15: **0** (extends `TaskCard` and `Tag` by one optional prop each).
- `bun run check` + `bun run lint` + `bun run test` + full e2e suite must stay green.
- No emojis, no off-grid spacing, no wrapping of DaisyUI primitives, no new `MESSAGE_TYPES` enum entry.

---

## 3. Plan reconciliation (spec ⇆ reality)

| Spec assumption | Reality | Action in plan |
|---|---|---|
| `Kanban.tsx` has DnD scaffolding to delete | Confirmed — `DndContext`, `useDraggable`, `useDroppable`, `KeyboardSensor`, `PointerSensor`, `DraggableTaskCard`, `KanbanDropZone`, `DragOverlay`, `STATE_TO_COLUMN`, `COLUMN_TO_STATE`, `resolveKanbanDrop`, `handleDragStart`, `handleDragEnd`, `activeId` state, `sensors` (Kanban.tsx:1-314). | Delete per §6 task list. |
| `WorkTeam.tsx:116-120` has `handleMoveTask` | Confirmed (WorkTeam.tsx:116-120 + `COLUMN_TO_STATE` import line 10 + `Kanban onMoveTask={handleMoveTask}` line 170 + `setTasks` state line 112). | Delete handler, `COLUMN_TO_STATE` import, `useState<KanbanTask[]>(INITIAL_TASKS)` becomes a fetched value (see §5.2). |
| Designer Q2 references "the existing `/api/teams/:teamId/tasks` response" | **NO such endpoint exists.** Server tasks route is `GET /api/tasks?bet_id=…` (`packages/server/src/routes/tasks.ts:88`). WorkTeam currently uses an inline `INITIAL_TASKS` mock fixture (WorkTeam.tsx:32-73). The Kanban never fetches from the server today. | Designer's premise is incorrect. The plan does NOT introduce a new team-scoped tasks endpoint for L15. The Kanban continues to use the existing fixture as the data source for the L15 visual deliverable; per-task `unreadCount` is fetched from a single batched call to the existing thread list endpoint (see §5.3 + Q2 answer in §10). A future story (out of scope for L15) wires real team-scoped task fetching. |
| L1 thread auto-creates on first message to `host_kind=task` | **Partially confirmed.** `POST /api/threads` accepts any `HOST_KIND` including `task` and does NOT pre-validate that the host row exists (verified threads.ts:278-378 — it just inserts). So "first message to task creates a thread" works as: `POST /api/threads` with `hostKind:'task', hostId:<task-id>, initialMessage: { type:'plain', payload:{text:…}, clientKey:… }, participants:[<sender>, <task-owner-agent-id>]`. There is NO server-side endpoint for "post-to-task-thread-implicitly-creating-it" — the client must do a 2-step flow (lookup-or-create) OR a single `POST /api/threads` that we treat idempotently per `clientKey`. | Plan §5.4 specifies the client-side flow: GET-list-for-task → if exists POST message, else POST thread (with initial message). |
| `taskStateToStatus` lives in shared | Lives in `packages/design-system/src/status-mapping.ts` (used by `TaskCard`). Designer assumed shared. | The `requestableVerbsFor` function lives in `@hyperidle/shared` (Q1 answer). They do not need to be co-located. |
| L1 message append already exists | Confirmed (`POST /api/threads/:id/messages` — threads.ts:381+). Sender authorization requires the sender be a participant (line 418). | Plan §5.4 ensures sender is included in the participants list when the thread is created. |
| Canvas drag for Shaped → Committed must survive | Confirmed Canvas.tsx is the separate file with its own `DndContext`. | Plan touches zero lines in Canvas.tsx. A protected-test entry (§9) freezes Canvas drag tests against accidental deletion. |
| Tests asserting drag behavior on Kanban tasks must be re-purposed | Confirmed: `packages/web/src/__tests__/WorkKanban.grouped.test.tsx:83-87` references `data-testid="draggable-task-…"`. `packages/web/src/__tests__/WorkTeam.test.tsx` references `work-team-kanban`. | The TestId `draggable-task-{id}` is replaced by `task-card-{id}` (no draggable wrapper). The grouped test stays meaningful (it asserts grouping under bet headers, not drag). |

---

## 4. Designer's open questions — answers

### Q1. Where does `requestableVerbsFor(state: TaskState): ReadonlyArray<RequestVerb>` live?

**Answer: `@hyperidle/shared`** — new file `packages/shared/src/task-verbs.ts`, re-exported from `packages/shared/src/index.ts`.

Rationale:
- Pure function, no I/O, no React, no DB. Same input → same output. Same constraints as the existing `TASK_STATES` constant.
- Will likely be consumed by both web (popover) and server (validation, future agent-side parsing of the deterministic body). Putting it in shared is the only way to get one source of truth.
- `taskStateToStatus` lives in `design-system` for historical reasons (it's a UI mapping). `requestableVerbsFor` is a domain function (closed verb enum derived from a closed state enum), not a presentation mapping — `shared` is the right home.
- The exhaustive `switch` over `TaskState` becomes a build-time guard: a new TaskState forces a decision on which verbs are requestable.

Signature:
```ts
// packages/shared/src/task-verbs.ts
export const REQUEST_VERBS = [
  "pause",
  "resume",
  "mark_blocked",
  "ready_for_review",
  "kill",
] as const;
export type RequestVerb = (typeof REQUEST_VERBS)[number];

export function requestableVerbsFor(state: TaskState): ReadonlyArray<RequestVerb>;
export function verbDisplayLabel(verb: RequestVerb): string;
```

`verbDisplayLabel` ships in the same module so the deterministic body string is generated identically on web and (future) server.

### Q2. How is per-task `unreadCount` resolved on the Kanban?

**Answer: server-side projection on the thread-list endpoint, plus a client-side batched lookup using `?host_kind=task` enumeration.**

The premise in the question (`/api/teams/:teamId/tasks` carries the projection) is rejected — that endpoint does not exist (see §3 reconciliation). The pragmatic answer that fits the existing endpoints:

1. **L15 ships only the Kanban-fixture data path.** Tasks come from the existing `INITIAL_TASKS` mock. The Kanban renders the new action footer with `threadCount` and `threadUnread` taken from the `KanbanTask` shape (extended with these two optional fields, defaulting to `0`).
2. **Reading thread state for the displayed tasks** uses `GET /api/threads?host_kind=task&host_id=<id>` per task. Because the existing endpoint does NOT batch by `host_id IN (…)`, L15 issues one request per visible task **at mount** (typical Kanban shows ≤ 25 tasks; ≤ 25 GETs is acceptable). Promise.all collects results.
3. **`unreadCount` is read-state semantics that L1 does NOT yet ship.** The thread-list response carries `lastActiveAt` and `hasUnresolvedReview` but no per-recipient read marker. **L15 cannot accurately compute "unread since the user last opened the thread" because the server does not store per-user read pointers.** Plan answer: `threadUnread` is approximated as `0` for all cards in L15, and the unread-tinted Tag variant is shipped behind a "future" flag — the visual contract is in place, the data feed is `0` until a follow-up story lands per-user read state. The unread chip is still TESTED (with synthetic data in unit tests) so the renderer is correct on the day the data arrives.

Plan-level escalation: **the unread signal is a designer-promised feature that has no server data feed today.** Two acceptable responses:
- (A — chosen) Ship the renderer behind defaulted-to-zero data; render correctly when data arrives. No new endpoint in L15. Add follow-up story `read-state-pointer-per-thread` to `docs/work-packages/follow-ups.md`.
- (B — rejected) Add a per-user read-pointer table + endpoint in L15. Out of scope; doubles L15's effort; not in the AC list.

### Q3. Popover anchor: DaisyUI `dropdown` vs `@floating-ui/react`?

**Answer: DaisyUI `dropdown`** (designer's preference).

Rationale:
- The design's popover is fixed-content (≤ 5 verb rows + textarea + 2 buttons), 240px wide, never auto-flips between vertical placements (only horizontal anchor swap at the right viewport edge).
- DaisyUI `dropdown` + `dropdown-content` is already used elsewhere in the codebase (no new dependency).
- Edge-clip handling: a CSS-only check using `dropdown-end` modifier on the rightmost Kanban column. The Kanban renders 4 columns; `dropdown-end` is applied to cards in column index 3 (`in_progress`) and beyond. This is detectable at render time from the existing `STATE_TO_COLUMN` map and the column index in the loop.
- `@floating-ui/react` IS a registered dep in SHARED.md ("Behavior: focus-trap-react (modals), @floating-ui/react (positioning)") — so we COULD use it. But DaisyUI's CSS-only solution is sufficient here and matches L1's already-shipped popover grammar (rejection list item 15: "no wrapping of DaisyUI primitives just to apply L15 styles").
- The design's rejection list does not forbid `@floating-ui/react`; choosing DaisyUI is on simplicity grounds.

⚠️ UNVERIFIED: DaisyUI 5 `dropdown-end` modifier on a per-card basis. Verified via DaisyUI 5 docs (https://daisyui.com/components/dropdown/) — the `dropdown-end` class anchors the dropdown content to the right edge of the trigger. Standard pattern, no custom JS.

### Implicit thread creation (approved.md §12 question 5)

`POST /api/threads` with `hostKind:'task'` works today (see §3 reconciliation). The first request from a card flows:
1. Web: `GET /api/threads?host_kind=task&host_id=<task-id>` → if non-empty, take threads[0].id.
2. If no thread exists: `POST /api/threads` with `hostKind:'task'`, `hostId:<task-id>`, `participants:[founderId, ownerAgentId]`, `initialMessage:{ type:'plain', payload:{text:<deterministic body>}, clientKey:<ulid>}`. Returns the new thread + initial message (201).
3. If a thread exists: `POST /api/threads/<id>/messages` with `{type:'plain', payload:{text:<body>}, clientKey:<ulid>}`. Returns the appended message (201).

Server-side test gap: confirm `POST /api/threads` accepts `hostKind:'task'` end-to-end (it should — the test file at threads.routes.test.ts:131-144 already covers all 8 host kinds in a parameterized loop). No new server test required for thread-creation; one new server test required for "first message from L15 client flow with `host_kind:'task'`" because it asserts the L15-specific `participants` shape (founder + agent owner).

### Idempotency of the request post (approved.md §12 question 6)

Client-side `clientKey` generator: **ULID** (Crockford-base32, sortable, 26 chars). Same picker as L11. Format passes the existing server regex `/^[A-Za-z0-9_\-:.]+$/` and length bounds (8-128). Generated on `Send` button click, included in the request body, and discarded on 201/200 success. On retryable error (network, 5xx), re-sent with the same `clientKey` so a server-side retry collapses to one row. On 409 `idempotency_conflict` (different payload with same key), surface the design's `--danger` strip.

**Verified consistent with L11 implementation.** The L11 `RichMessageCard` action surface generates `clientKey` as a string (see `packages/web/src/__tests__/RichMessageCard.test.tsx:139-140` — `typeof payload.clientKey === "string"`, length > 0; tests at lines 143-156 verify each click generates a NEW key). No ULID library is imported anywhere in `packages/web`. **Plan: use `crypto.randomUUID()`** (Web Crypto API; 36 chars; matches the server regex `/^[A-Za-z0-9_\-:.]+$/` and length bounds 8–128). Single line, no dependency, consistent with the existing pattern.

---

## 5. Design (types, files, contracts)

### 5.1 New / extended types

**New module — `packages/shared/src/task-verbs.ts`:**
```ts
export const REQUEST_VERBS = [
  "pause", "resume", "mark_blocked", "ready_for_review", "kill",
] as const;
export type RequestVerb = (typeof REQUEST_VERBS)[number];

export function requestableVerbsFor(state: TaskState): ReadonlyArray<RequestVerb> {
  switch (state) {
    case "proposed":    return ["mark_blocked", "kill"];
    case "accepted":    return ["pause", "mark_blocked", "kill"];
    case "hold":        return ["resume", "kill"];
    case "in_progress": return ["pause", "mark_blocked", "ready_for_review", "kill"];
    case "blocked":     return ["resume", "kill"];
    case "review":      return ["mark_blocked", "kill"];
    case "done":        return [];
    case "killed":      return [];
  }
}

export function verbDisplayLabel(verb: RequestVerb): string {
  switch (verb) {
    case "pause":            return "Pause";
    case "resume":           return "Resume";
    case "mark_blocked":     return "Mark blocked";
    case "ready_for_review": return "Ready for review";
    case "kill":             return "Kill";
  }
}

/** Deterministic message body. Agents parse line 1 with regex. */
export function formatRequestMessageBody(args: {
  actorName: string;     // human-readable; e.g. "A. Founder"
  verb: RequestVerb;
  note?: string;         // trimmed; if empty after trim, omit line 2
}): string;
```

Re-exported from `packages/shared/src/index.ts` next to `TASK_STATES`.

**Extended `Tag` (`packages/design-system/src/Tag.tsx`):** the existing `kind` prop is a registry-driven enum (`TAG_KIND_ICONS`). The design's "unread" variant is structurally different from the icon-tag family. Rather than overload `kind`, add a separate optional prop:

```ts
export interface TagProps {
  label: string;
  kind?: TagKind;
  /** When true, renders the unread-state visual (--primary dot prefix + primary tint background). Mutually exclusive with `kind`. */
  unread?: boolean;
}
```

`unread` is rendered only when `kind` is absent (per design — the unread chip never carries an icon). The Tag's existing `TAG_BASE` surface is overridden with the unread tint when `unread === true`.

⚠️ Trade-off: the design said "add an optional `kind: 'unread'`". The codebase's `Tag` already has `kind` as a registry-driven icon enum, NOT an open string. Overloading it would force every existing tag-kind consumer to handle the unread case. A separate boolean prop is structurally cleaner and lints cleanly.

**Extended `TaskCard` (`packages/design-system/src/TaskCard.tsx`):** the `actions?: ReactNode` prop ALREADY EXISTS (line 16). No type change required — the L15 caller passes the popover + thread chip as children of the action slot. The footer divider is rendered ONLY when `actions` is truthy (already the case at line 56: `{actions}` renders unconditionally; we add the divider styling around it).

**Edit needed on TaskCard:** wrap the `{actions}` slot in a divider container so the design's `border-t` + `pt-[4px]` lands. This is a styling edit, not an API change.

**New shell component — `packages/web/src/shell/TaskRequestPopover.tsx`:** extracts the dropdown + verb list + textarea + commit buttons. Lives in `packages/web/src/shell/` because it composes DaisyUI `dropdown` + `btn` + `textarea` directly (per "use DaisyUI primitives directly" rule), and is bound to the L15 page concern (request-state-change against an L1 thread). It is NOT a Tier 3 component — it's a page-internal composition. No story file required (the Kanban's story renders it implicitly).

```ts
interface TaskRequestPopoverProps {
  task: { id: string; state: TaskState; ownerAgentId: string };
  founderId: string;
  founderName: string;
  /** Server-confirmed thread id when one exists; null when a fresh thread is created on the first send. */
  threadId: string | null;
  /**
   * Callback after the server confirms 201/200. Parent uses this to (a) cache the
   * resolved threadId for next time and (b) bump the chip count optimistically by +1.
   * The popover does NOT re-fetch a fresh count; the parent owns the count delta and
   * reconciles the canonical value on the next Kanban mount.
   */
  onSent: (result: { threadId: string }) => void;
}
```

**`KanbanTask` extension (`packages/web/src/shell/Kanban.tsx`):**
```ts
export interface KanbanTask {
  id: string;
  title: string;
  owner: string;            // display name
  ownerAgentId: string;     // NEW — server id used as thread participant
  state: TaskState;
  cost?: string;
  betTag?: string;
  threadId?: string | null; // NEW — null when no thread exists yet
  threadCount?: number;     // NEW — total messages
  threadUnread?: number;    // NEW — defaults 0 in L15 (see §4 Q2)
}
```

`onMoveTask` is REMOVED from `KanbanProps`. `groupByBet` survives.

**Fixture `ownerAgentId` values (`packages/web/src/pages/WorkTeam.tsx` `INITIAL_TASKS`):** the existing five rows gain `ownerAgentId` derived deterministically from the existing `owner` display string: `"Dev Agent 1"` → `"agent-dev-1"`; `"Dev Agent 2"` → `"agent-dev-2"`. These are *fixture-only* synthetic ids; the real agent-team-membership lookup is tracked in follow-up `team-scoped-tasks-and-agent-membership` (see §11). The fixture is the source of truth for L15's UI deliverable; no server roundtrip resolves these ids.

### 5.2 Files touched

**Web:**
- `packages/web/src/shell/Kanban.tsx` — delete DnD scaffolding (§2.3 of approved.md), extend `KanbanTask`, render the new action footer slot via `TaskCard.actions`.
- `packages/web/src/shell/TaskRequestPopover.tsx` — NEW. The popover composition.
- `packages/web/src/pages/WorkTeam.tsx` — delete `handleMoveTask` + `COLUMN_TO_STATE` import + `setTasks`. Add a `useEffect` that, for each visible task, issues `GET /api/threads?host_kind=task&host_id=<id>` and merges `threadId` + `threadCount` into the local task list. Mock fixture stays as the task source.
- `packages/web/src/router.tsx` — add a new route `path: "work/team/tasks/:taskId/thread"` mounting a new `WorkTeamTaskThread` page (renders `ThreadShell` for the task's thread).
- `packages/web/src/pages/WorkTeamTaskThread.tsx` — NEW. Looks up or creates the thread for `:taskId`, renders `<ThreadShell>` (mirrors the `ConversationsReview` page's fetch + decode pattern).
- `packages/web/src/__tests__/WorkKanban.grouped.test.tsx` — replace `draggable-task-{id}` testids with `task-card-{id}` (the wrapper-div testid moves to the card body).
- `packages/web/src/__tests__/Kanban.keyboard-drag.test.tsx` — **DELETE entirely.** This file (verified to exist at HEAD) tests `onMoveTask`, `draggable-task-*` selectors, `resolveKanbanDrop`, and `handleDragEnd` — all of which are deleted in §5.4. Its assertions become invariants of the new no-op behaviour, covered by `Kanban.test.tsx` step 7 below. Removing this file is intentional and is *not* a protected-test breach (the breach rule is "don't change existing assertions on protected files"; this file is not on the protected list).
- `packages/web/src/__tests__/WorkTeam.test.tsx` — drop drag-related assertions; add no-op-on-drag assertion + request-action assertion (vitest interactions).
- `packages/web/src/__tests__/Kanban.test.tsx` (NEW) — drag is no-op; popover renders; `Send` posts the right payload to the right thread.
- `packages/web/src/__tests__/TaskRequestPopover.test.tsx` (NEW) — verb derivation rendering, `Cmd+Enter` submit, error strip on failure, focus return.
- `packages/web/e2e/team-request.spec.ts` (NEW) — Playwright: try drag (mouse.down + mouse.move + mouse.up over a task) and assert the card's column container (`STATE_TO_COLUMN`-derived) still contains the card after the gesture → click Request → click Mark blocked → click Send → navigate to thread route → assert message body.

**Design system:**
- `packages/design-system/src/Tag.tsx` — add `unread?: boolean` prop + render branch.
- `packages/design-system/src/Tag.stories.tsx` — add an "Unread" story variant.
- `packages/design-system/src/TaskCard.tsx` — add the `border-t` divider around the `{actions}` slot when `actions` is truthy. Update the existing TaskCard story to demonstrate the action-footer slot.
- `packages/design-system/src/__tests__/Tag.test.tsx` (NEW — file does not currently exist; verified) — assertions: (a) when `unread === true` and `kind` is undefined, the rendered output contains a leading `<span>` with the unread-dot class (CSS-attached background, NOT a unicode glyph per AQ-105), the chip background uses the `--primary` tint mix, and the label still renders; (b) when both `unread === true` and `kind` is set, the unread branch is skipped and `kind` wins (mutual exclusion documented in TagProps); (c) the default render path (no `unread`, no `kind`) is unchanged byte-for-byte from HEAD (snapshot test against the current `TAG_BASE` output). Co-locate with the convention `packages/design-system/src/__tests__/<Component>.test.tsx`.

**Shared:**
- `packages/shared/src/task-verbs.ts` — NEW (verb enum + derivation + display labels + body formatter).
- `packages/shared/src/index.ts` — re-export `REQUEST_VERBS`, `RequestVerb`, `requestableVerbsFor`, `verbDisplayLabel`, `formatRequestMessageBody`.
- `packages/shared/src/__tests__/task-verbs.test.ts` — NEW (exhaustiveness + body-format snapshot).

**Server:**
- No new endpoints. No schema changes.
- `packages/server/src/routes/__tests__/threads.routes.test.ts` — add a test asserting that POST /api/threads with `hostKind:'task'` + `participants:[founder, agent]` + `initialMessage:{type:'plain', payload:{text}}` succeeds, and that the round-trip of the message body matches the deterministic L15 format. (Defensive — covers the L15 client flow's server expectations.)

### 5.3 Data flow (L15 client → L1 server)

```
Kanban renders.
  for each visible task:
    GET /api/threads?host_kind=task&host_id={taskId}
      → returns { threads: [...], nextCursor }
    if threads.length > 0:
      KanbanTask.threadId   = threads[0].id
      KanbanTask.threadCount = (separate fetch)  ← see note
    else:
      KanbanTask.threadId   = null
      KanbanTask.threadCount = 0
    KanbanTask.threadUnread = 0  // see §4 Q2

User clicks Request ▾ → DaisyUI dropdown opens (popover).
User clicks "Mark blocked" → row tints (--primary-dim).
User types optional note.
User clicks Send.
  body = formatRequestMessageBody({ actorName, verb, note })
  clientKey = crypto.randomUUID()
  payload = { type: "plain", payload: { text: body }, clientKey }

  if KanbanTask.threadId is null:
    POST /api/threads
      body: {
        hostKind: "task",
        hostId: KanbanTask.id,
        participants: [founderId, KanbanTask.ownerAgentId],
        initialMessage: payload,
      }
    → 201 { thread: {...}, messages: [...] }
    Cache the new threadId on the task. messageCount = 1.
  else:
    POST /api/threads/{threadId}/messages
      body: payload
    → 201 { message: {...}, thread: {...} }
    messageCount = (existing + 1)

Popover closes; focus returns to Request ▾ button.
Thread (N) chip animates n → n+1 over --motion-medium.

User clicks Thread (N) chip:
  router.push("/work/team/tasks/{taskId}/thread")
  WorkTeamTaskThread page mounts.
    if route param has no resolvable threadId:
      GET /api/threads?host_kind=task&host_id={taskId}
      if empty → render EmptyState ("No thread yet — send a request to start one.")
      else → GET /api/threads/{threadId} → render <ThreadShell>
```

**Note on `threadCount`:** the existing `GET /api/threads` list endpoint returns thread rows but NOT message counts. Two options:

- (A — chosen) For each visible task with a thread, issue `GET /api/threads/{id}` (returns `messages: [...]`); count = `messages.length`. Cost: ≤ 25 GETs at mount + ≤ 25 follow-ups. Acceptable for the L15 fixture-driven Kanban.
- (B — rejected) Extend the list endpoint with `messageCount` per row. Out of L15 scope; touches a shipped, well-tested route. Add to follow-ups under `thread-list-include-message-count`.

This `(A)` choice is documented in code with a `@lore L15` comment and a TODO referencing the follow-up story.

**Fan-out parallelism + perf budget:** all per-task GETs are issued via `Promise.allSettled` (NOT `Promise.all`) so a single failed fetch does not abort the batch. Total wall-time SLO on local SQLite dev driver: **≤ 800ms p95** for ≤ 25 visible tasks. If the budget is exceeded, escalate to follow-up `kanban-thread-metadata-batched-endpoint` (added to `docs/work-packages/follow-ups.md` in this plan). Vitest assertion: a mocked-fetch test renders the Kanban with 10 tasks and asserts all 10 mock-fetches were issued before any first paint of `Thread (N)` chip data.

**Per-task fetch failure semantics:** when a per-task GET fails (network, 4xx, 5xx) the affected card renders with `threadId=null, threadCount=0, threadUnread=0` — i.e. the orphan-no-thread variant from design §3 ("Populated — orphan task"). The next user request through the popover will create the thread implicitly. **No retry logic, no error toast, no loading-forever skeleton.** The chip simply reads as "Open thread" and the next mount re-attempts. This is a deliberate boring choice: failures are transient and the founder retries by clicking.

### 5.4 Drag is dead

In `Kanban.tsx`:
- Delete imports: `DndContext`, `DragEndEvent`, `DragOverlay`, `DragStartEvent`, `KeyboardSensor`, `PointerSensor`, `useDraggable`, `useDroppable`, `useSensor`, `useSensors` from `@dnd-kit/core`.
- Delete `KanbanDropZone` component (replace with a plain `<div className="flex flex-col gap-2">`).
- Delete `DraggableTaskCard` component (render `<TaskCard …>` directly, with the new `actions` slot populated).
- Delete `COLUMN_TO_STATE` const.
- Delete `resolveKanbanDrop` exported helper (and its tests).
- Delete `handleDragStart`, `handleDragEnd`, `setActiveId`, `activeId`, `sensors`, the wrapping `<DndContext>` JSX and `<DragOverlay>` JSX.
- KEEP `STATE_TO_COLUMN` (read-direction grouping is still needed).
- KEEP `groupTasksByBet` and the grouped rendering path.
- KEEP `data-testid="work-team-kanban"`.

In `WorkTeam.tsx`:
- Delete the `useCallback` for `handleMoveTask` and the `COLUMN_TO_STATE` import.
- Replace `useState<KanbanTask[]>(INITIAL_TASKS)` with `useState<KanbanTask[]>` populated by a fetch + merge on mount (see §5.3).
- The `setTasks` is no longer mutated by drag — it IS still used by the on-mount thread merge.

`@dnd-kit/core` stays a dependency (Canvas.tsx still imports it). Do not remove from `package.json`.

### 5.5 Cursor change

Per design §6.6, `cursor: grab` becomes `cursor: pointer` on TaskCard. The TaskCard already uses `clickableProps(onClick, …)` which sets `cursor-pointer` when `onClick` is defined. L15 wires a placeholder `onClick={() => {}}` is REJECTED — instead, the cursor is set explicitly via the `clickableProps` API or via a future `onClick` to a task-detail route. **For L15 the card body has no click action yet** — the design's "future task-detail navigation" is out of scope. The cursor stays the default (no grab) when `onClick` is not provided. Verified: `clickableProps` returns no cursor utility when `onClick` is undefined. No code change needed beyond removing the DnD wrapper that was setting drag cursor styling.

---

## 6. Ordered task list

| # | Task | Files | Verifies |
|---|------|-------|----------|
| 1 | Add `task-verbs.ts` to shared (verb enum, `requestableVerbsFor`, `verbDisplayLabel`, `formatRequestMessageBody`). Re-export from index. | `packages/shared/src/task-verbs.ts`, `packages/shared/src/index.ts` | T1 vitest |
| 2 | Vitest: verb derivation is exhaustive and matches the design table; `formatRequestMessageBody` round-trips with and without note. | `packages/shared/src/__tests__/task-verbs.test.ts` | runs in step 1 |
| 3 | Extend `Tag` with `unread?: boolean` prop; add story variant. | `packages/design-system/src/Tag.tsx`, `packages/design-system/src/Tag.stories.tsx`, `packages/design-system/src/__tests__/Tag.test.tsx` | DS vitest |
| 4 | Extend `TaskCard.tsx` to render the `actions` slot inside a `border-t` divider container; update story. | `packages/design-system/src/TaskCard.tsx`, `packages/design-system/src/TaskCard.stories.tsx` | DS vitest |
| 5 | Build `TaskRequestPopover.tsx` (DaisyUI dropdown + verb buttons + textarea + Cancel/Send). Implements the request-post flow per §5.3 (lookup-or-create + message append). | `packages/web/src/shell/TaskRequestPopover.tsx`, `packages/web/src/__tests__/TaskRequestPopover.test.tsx` | step 5 vitest |
| 6 | Extend `KanbanTask` interface with `ownerAgentId`, `threadId?`, `threadCount?`, `threadUnread?`. | `packages/web/src/shell/Kanban.tsx` | typecheck |
| 7 | Delete DnD scaffolding from `Kanban.tsx` per §5.4. Render `TaskCard` directly with the new action-footer composition. | `packages/web/src/shell/Kanban.tsx` | step 8 vitest |
| 7.5 | **Delete** `packages/web/src/__tests__/Kanban.keyboard-drag.test.tsx` in full. Its `onMoveTask` / `draggable-task-*` / `resolveKanbanDrop` / `handleDragEnd` assertions are obsolete (the symbols are deleted in step 7). The replacement contract — drag-is-a-no-op — is asserted in `Kanban.test.tsx` (new in step 8). | `packages/web/src/__tests__/Kanban.keyboard-drag.test.tsx` | runs in step 8 |
| 8 | Update existing Kanban tests: drag-related testids removed, no-op-on-drag added. New `Kanban.test.tsx` includes a positive assertion: simulating a `dragstart` + `dragend` on a `task-card-{id}` produces zero column changes (the rendered task list is reference-equal before and after the gesture). | `packages/web/src/__tests__/WorkKanban.grouped.test.tsx`, `packages/web/src/__tests__/Kanban.test.tsx` (new) | runs in step 7 |
| 9 | Strip `handleMoveTask` + `COLUMN_TO_STATE` import from `WorkTeam.tsx`. Add the on-mount thread fetch + merge. Add `ownerAgentId` to the fixture rows. | `packages/web/src/pages/WorkTeam.tsx` | step 10 vitest |
| 10 | Update `WorkTeam.test.tsx` to drop drag assertions; add fetch mocking + assertion that the action footer renders. | `packages/web/src/__tests__/WorkTeam.test.tsx` | runs in step 9 |
| 11 | Add `WorkTeamTaskThread.tsx` page + route in `router.tsx`. Mirrors `ConversationsReview` fetch+decode+ThreadShell pattern. | `packages/web/src/pages/WorkTeamTaskThread.tsx`, `packages/web/src/router.tsx` | step 12 vitest |
| 12 | Vitest: route mounts ThreadShell for an existing thread; renders EmptyState when no thread exists. | `packages/web/src/__tests__/WorkTeamTaskThread.test.tsx` | runs in step 11 |
| 13 | Add server test confirming `POST /api/threads` with `hostKind:'task'` + initial `plain` message succeeds and round-trips the deterministic body string. | `packages/server/src/routes/__tests__/threads.routes.test.ts` | server vitest |
| 14 | Playwright e2e: navigate to /work/team → attempt drag (no state change) → click Request → click Mark blocked → click Send → navigate to /work/team/tasks/{id}/thread → assert message renders with deterministic body. | `packages/web/e2e/team-request.spec.ts` | playwright |
| 15 | Run `bun run verify` (check + lint + test) + Playwright suite. Fix any failures. | — | gate |

Ordering rationale: step 1-2 lock the contract before any UI consumes it. Step 3-4 ship the design-system primitives that the popover and Kanban need. Steps 5-12 build the UI in dependency order. Step 13 closes the server gap. Step 14 closes the e2e AC. Step 15 is the green-bar gate.

---

## 7. Route checklist

Per L7 retro PROPOSED-L7-B: every route the L15 work consumes or adds must be enumerated, and every middleware/auth/projection that should cover those routes must be listed.

| Route | Method | Existing? | Used by | Middleware/projection | Rate-limit |
|---|---|---|---|---|---|
| `/api/threads` | GET | yes (threads.ts:154) | Kanban on-mount fetch (per task `?host_kind=task&host_id=…`). | Existing — no L15 change. | NONE (read; inherited gap, see follow-ups: `thread-message-rate-limit`) |
| `/api/threads/:id` | GET | yes (threads.ts:250) | `WorkTeamTaskThread` page; thread-count derivation. | Existing — no L15 change. | NONE (read; inherited gap) |
| `/api/threads` | POST | yes (threads.ts:278) | First-request-creates-thread flow. | Existing — `createThreadBodySchema` Zod; `participants` includes the founder; idempotency on `(threadId, sender, clientKey)`; event emission. No L15 change. | **NONE** (inherited gap, see follow-ups: `thread-message-rate-limit`). 80ms minimum-show in popover is UX, not security. |
| `/api/threads/:id/messages` | POST | yes (threads.ts:381) | Subsequent-request appends. | Existing — sender-must-be-participant authz; idempotency; verdict authz N/A (we only post `plain`). No L15 change. | **NONE** (inherited gap). |
| `/work/team/tasks/:taskId/thread` | GET (web route) | NEW | Thread (N) chip click. | React Router; mounts `WorkTeamTaskThread`. No server route. | N/A |

**Files the route guards/middleware must cover:**
- `packages/server/src/routes/threads.ts` — already covers all 4 server routes above. No new middleware required.
- `packages/web/src/router.tsx` — adds the `/work/team/tasks/:taskId/thread` route. No auth gating beyond what AppShell already provides.

**No new server routes are introduced by L15.** The server-side test step (#13 in §6) is defensive coverage for the L15 client flow against the existing routes.

---

## 8. Security & abuse cases

| Case | Applicable? | Mitigation |
|---|---|---|
| Rate-limit on `POST /api/threads` and `POST /api/threads/:id/messages` | Applicable. | **Inherited from L1.** L1 does not currently rate-limit; this is tracked in `docs/work-packages/follow-ups.md` (`thread-message-rate-limit`). L15 does not add a per-card rate limiter — the design's "minimum 80ms saving state" floors the user-facing burst rate but is not a security control. Defer to the L1 follow-up. **Flag:** if `/architecture-critique` requires a rate limit before merge, scope a rate-limiter middleware on `/api/threads*` POSTs (per-sender, 30 req/min). Currently marked as inherited risk. |
| Input-trust boundary for the `note` textarea | Applicable. | The note is rendered as plain text inside the L1 message stream (the existing `ThreadShell` already escapes HTML — verified by L1's tests). The deterministic line-1 body (`@<actorName> requested: <verb-label>`) is server-stored verbatim; the actorName is read from server-trusted founder identity (`X-Identity` or default) — NOT from client input. Note is bounded to 280 chars client-side and to 16,384 chars server-side (`plainPayloadSchema.text.max(16_384)`). |
| Verb tampering (client sending an unsupported verb) | Applicable. | The verb ENUM is enforced client-side via `requestableVerbsFor`. The verb does NOT travel as a structured field — it's encoded into the `text` field of the plain payload via `formatRequestMessageBody`. The server never validates "is this a legal verb" because the verb has no semantic meaning to the server (it's a string in the message body). The agent reading the thread is responsible for deciding whether to honour it. **No security issue** — humans request, agents decide; verb forgery has no privileged effect. |
| Posting to a thread the user is not a participant of (IDOR) | Applicable. | Existing L1 authz: `POST /api/threads/:id/messages` enforces sender-must-be-participant (threads.ts:418). For first-creation via `POST /api/threads`, the sender is added to `participants` server-side (threads.ts:294-297). L15 always passes `participants:[founderId, ownerAgentId]` so the founder is a participant from the start. **No new IDOR surface.** |
| Posting to a thread for a task the user does not have access to | Applicable. | **Inherited gap from L1.** There is no per-task ACL today. The L8 review (threads.ts:147-153) flagged the same IDOR pattern for thread reads. Fix lives in `auth-middleware-participant-scope` follow-up. L15 does not introduce a new gap; it inherits the existing one. |
| Idempotency replay attacks | Applicable. | Existing L1 contract (threads.ts:435+): replays with the same `clientKey` collapse to one row; replays with a different payload return 409. L15 generates a fresh `clientKey` per `Send` click via `crypto.randomUUID()`. |
| Path-traversal | N/A. | No path inputs. |
| SSRF | N/A. | No outbound URLs. |
| Secret-handling | N/A. | No new credential surface. |
| XSS via task title or owner display | Applicable inherited. | TaskCard renders strings as text (React-escaped). No new injection surface. |
| The popover Send button being mass-clicked to flood the thread | Applicable. | The 80ms minimum-show + the `Saving…` button replacement disables further clicks during in-flight. Still, a fast scripted client could flood — this is the rate-limit follow-up above. |

**Net L15 security delta: zero new risks; one inherited rate-limit gap acknowledged and tracked.**

---

## 9. Protected tests

Tests whose assertions must NOT change during L15 implementation (DoD audits via `git diff --name-only`):

```yaml
protectedTests:
  - packages/web/src/__tests__/Canvas.test.tsx           # Canvas drag MUST survive (verified to be the only Canvas test file at HEAD; Canvas.dnd.test.tsx does not exist)
  - packages/server/src/routes/__tests__/threads.routes.test.ts  # L1 contract
  - packages/shared/src/__tests__/message-types.test.ts          # MESSAGE_TYPES closure
  - packages/shared/src/__tests__/types.test.ts                  # TASK_STATES closure
  - packages/web/src/__tests__/ThreadShell.test.tsx              # L1 ThreadShell
  - packages/web/src/__tests__/ConversationsReview.test.tsx      # ThreadShell mount path
  - packages/design-system/src/__tests__/StatusChip.test.tsx     # status chip closure
```

If any of the protected tests must legitimately be edited (e.g. test 13 in §6 ADDS a new test to threads.routes.test.ts), the addition is a new `describe` block and existing assertions remain unchanged. The protected-test rule is "don't change existing assertions"; appending new ones is allowed.

---

## 10. Trade-offs

**What we're choosing.**
1. Extend `KanbanTask` with thread metadata fields (defaulted to empty) rather than introduce a parallel `KanbanTaskThreadInfo` map. Simpler call sites, one source of truth.
2. Per-task `GET /api/threads` calls at mount instead of a new batched endpoint. Defers an endpoint addition until a real product need (post-L15) demands it.
3. DaisyUI `dropdown` instead of `@floating-ui/react`. CSS-only, matches the existing popover grammar.
4. ULID-via-`crypto.randomUUID()` for the client key. No new dependency.
5. Approximate `threadUnread` as `0` in L15. Ship the renderer; defer the data feed.
6. Web-only route for the thread page (`/work/team/tasks/:taskId/thread`). Mirrors the `ConversationsReview` fetch path; no new server endpoints.
7. Tag's unread state as a separate `unread?: boolean` prop, NOT a new `kind: "unread"` enum value. The existing `kind` is registry-driven (icons + tints); shoehorning `unread` into it would force every existing kind-handler to learn the unread case.

**What we're giving up.**
1. Real per-user unread state (defers to a follow-up; L15 ships with `0`).
2. Single batched fetch for thread metadata across the Kanban (defers to a follow-up; ≤ 25 task GETs is acceptable today).
3. Auto-flip popover placement at the bottom edge (DaisyUI `dropdown` does NOT auto-flip vertically; the design accepts horizontal-only flipping). Bottom-edge clipping risk is acceptable for L15 — the Kanban scroll container is short and the verb list maxes at 5 rows; re-evaluate if verbs ever expand.
4. Real task data fetching on the Team Board (L15 keeps the existing `INITIAL_TASKS` mock; the team-scoped tasks endpoint is a separate concern).

**Design-it-twice — `WorkTeamTaskThread.tsx` vs reusing `ConversationsReview`.** The Kanban chip click needs to land on a thread surface that renders `host_kind=task` threads.
- (A — chosen) Add `WorkTeamTaskThread.tsx` mounted at `/work/team/tasks/:taskId/thread`. Pros: (1) `ConversationsReview` is *review-grammar specific* — its surface assumes verdict-message UX (request-changes / approve / etc.) and an Artifact context. Threads on tasks are `plain`-message conversations with no verdict semantics; routing them through the review surface would either bleed verdict UX into a non-verdict context or require conditional shape-shifting based on `host_kind`. (2) Surface URL communicates intent (`work/team/tasks/.../thread` is greppable; `conversations/review?threadId=…` is not). (3) Future task-detail page (out of L15 scope) will share this route's task-context loader. Cons: one new page file (~80 LOC), one new route, one new test file.
- (B — rejected) Route the chip click to `ConversationsReview` with the threadId as a query param. Pros: zero new pages. Cons: reuses a surface whose grammar (verdict, review-message-embed) does not match the data; either render-bug-prone or requires adding `host_kind`-conditional rendering to a shipped page (CC-007 risk: editing a working surface to support a category it wasn't designed for).

(A) is chosen because the `ConversationsReview` surface is review-shaped and a task thread is `plain`-shaped; reusing it would import the wrong grammar. The new page is a thin loader (mirrors the `ConversationsReview` *fetch* pattern, not its rendering surface) wrapping the existing `<ThreadShell>` primitive — `ThreadShell` is the actual L1 thread-rendering component, and IT is reused.

---

## 11. Open risks

1. **Designer's Q2 premise was incorrect.** No `/api/teams/:teamId/tasks` endpoint exists. Plan handles it by keeping the existing fixture and using per-task thread fetches. Flag for designer awareness — if they expected the Kanban to fetch real tasks in L15, that's a separate story.
2. **Per-user read-state ships as `0`.** The unread chip is visible only when synthetic data is present (e.g. in stories). Real users will never see it until the read-state follow-up lands. Confirm this is acceptable to the designer.
3. **Rate-limit on POST messages is inherited gap.** The L1 follow-up covers this; if `/architecture-critique` flags it as a blocker, scope a per-sender rate-limit middleware in step 13.5.
4. **Implicit thread creation is a 2-step client flow.** A future server convenience endpoint (`POST /api/tasks/:id/thread/messages` that does lookup-or-create atomically) would eliminate the GET+POST round trip. Out of L15 scope; flagged as a future ergonomics improvement.
5. **The `cursor: grab → pointer` change.** Without an `onClick` on TaskCard, the cursor stays the default. The design's "200ms left-border flash on card click" is therefore visually deferred; the chip-click path still flashes as designed because the chip itself is clickable.

---

## 12. Plan reconciliation summary

Spec assumptions reconciled with reality:
- ✓ Drag deletion targets confirmed (Kanban.tsx + WorkTeam.tsx:116-120).
- ✓ L1 thread routes for `host_kind:'task'` confirmed working.
- ✓ `MESSAGE_TYPES` closure forces `plain` (rejected new enum value).
- ⚠ `/api/teams/:teamId/tasks` does NOT exist — plan keeps fixture data path.
- ⚠ Per-user read state does NOT exist — plan ships chip with default-0 data.
- ✓ Canvas drag is in a separate file; protected by the protected-tests list.
- ✓ `requestableVerbsFor` lives in `@hyperidle/shared` (Q1).
- ✓ DaisyUI `dropdown` for the popover anchor (Q3).

---

## 13. Cross-references

- Story: `docs/work-packages/TRACK-L.md` §L15 lines 511-540.
- Approved design: `docs/design-explorations/L15/approved.md`.
- L1 contract: `docs/work-packages/SHARED.md` "Thread primitive".
- Existing files modified: `packages/web/src/shell/Kanban.tsx`, `packages/web/src/pages/WorkTeam.tsx`, `packages/design-system/src/TaskCard.tsx`, `packages/design-system/src/Tag.tsx`, `packages/web/src/router.tsx`.
- New files: `packages/shared/src/task-verbs.ts`, `packages/web/src/shell/TaskRequestPopover.tsx`, `packages/web/src/pages/WorkTeamTaskThread.tsx`.
- L1 server routes (unchanged): `packages/server/src/routes/threads.ts` (lines 154, 250, 278, 381).
