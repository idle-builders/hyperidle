# L15 — Plan

**Story.** Strip drag/drop from Team Board's Kanban; let humans request task changes via a per-card actions menu that posts structured messages onto the task's thread. Drag survives ONLY between Canvas Shaped→Committed.

**Sources locked.**
- Spec: `docs/work-packages/TRACK-L.md` § L15 (lines 511–540).
- Approved design: `docs/design-explorations/L15/approved.md` (Variant A `quiet-menu` + 4 pulls).
- Concept: `docs/concept/HUMAN_INTERFACE_LAYER.md` § 4.5 (Thread primitive).
- Shared contract: `docs/work-packages/SHARED.md` lines 54–80.

**Depends on.** L1 (Thread primitive — shipped).

**Component budget delta.** **+1 Tier-2 component** (`TaskActionsMenu`). Justified in § 11.

---

## 1. Acceptance criteria → verification map

Spec ACs from TRACK-L § L15. Each row maps an AC to (a) the implementation artifact that satisfies it and (b) the verification artifact that proves it.

| # | Spec AC | Implementation | Verification |
|---|---|---|---|
| AC-1 | Drag-to-move is removed from Team Board's Kanban; current sensors and column-to-state mapping in `Kanban.tsx` and the `WorkTeam.tsx:116-120` move handler are gone. | § 4.1, § 4.2 | (V-1a) Vitest: `Kanban.test.tsx` asserts `Kanban` renders no `[data-droppable-column]` and tasks have no `aria-roledescription="draggable"` / `[role="button"][aria-pressed]`. (V-1b) Vitest: source-grep test asserts `packages/web/src/shell/Kanban.tsx` does NOT import `DndContext`, `useDraggable`, `useDroppable`, `DragOverlay`, `KeyboardSensor`, `PointerSensor` from `@dnd-kit/core`. (V-1c) Vitest: re-export check — `COLUMN_TO_STATE` is no longer exported from `Kanban.tsx`; importing it from `WorkTeam.tsx` is a TypeScript error. (V-1d) Playwright (E2E) `team-board-no-drag.spec.ts`: drag a task card; assert the column membership in the DOM is unchanged AND no network call to `/tasks/:id/transition` was issued. |
| AC-2 | Each task gains an affordance to request a state change OR open the task's attached thread; selecting a request posts a message to the task's thread. | § 3 (verbs), § 4.3 (`TaskActionsMenu`), § 5 (server endpoint) | (V-2a) Vitest: `TaskActionsMenu.test.tsx` renders state-conditional verb sets per § 3.5 matrix; clicking a verb calls `onRequestStateChange(taskId, verb)`. (V-2b) Vitest server: `tasks.request.test.ts` — `POST /api/tasks/:id/request` with body `{verb:"request_stop", clientKey}` returns 201, persists exactly one `plain`-type message in the task's thread whose payload has `{text:..., request:{verb:"request_stop"}}`. (V-2c) Playwright (E2E) `team-board-request.spec.ts`: open menu → click "Request stop" → toast appears → reload → message visible in the task's thread. |
| AC-3 | Drag survives ONLY between Shaped → Committed columns on the Canvas. | § 4.4 (no Canvas changes) | (V-3a) Vitest: `Canvas.test.tsx` (existing) stays green. (V-3b) Playwright (E2E) `canvas-drag-survives.spec.ts`: drag a `shaped` bet to the `committed` column → it appears there. |
| AC-4 | Vitest tests cover: drag is a no-op on task cards; request actions post messages to the right thread; opening a thread lifts it correctly. | § 12 (test list) | All tests in § 12 (Protected Tests) pass. |
| AC-5 | Playwright e2e: try to drag a task → no-op → request a state change → message appears in the task's thread. | § 12 (E2E test list) | `team-board-request.spec.ts` and `team-board-no-drag.spec.ts` pass. |
| AC-6 | `bun run check` + `bun run lint` + `bun run test` all green; full e2e suite stays green. | All affected files | CI gate. |

**Validation scenarios from spec § 521–530, mapped:**
- "User attempts to drag → action does nothing" → V-1d.
- "User requests state change → thread message appears" → V-2b + V-2c.
- "User opens task's thread → thread renders" → V-2c (the open-thread leg).

---

## 2. Open-question resolutions (locked)

These are the binding answers to the design's open questions § 10.

### 2.1 Request `MessageKind` shape — extend `PlainPayload`, do NOT add a new MessageKind

The Thread spec (§ 4.5.8 hard rule 5) forecloses adding new message types without a concept-doc update first. We do **not** add `state_change_request` as a new type. Instead we extend the `plain` payload shape:

```ts
// packages/shared/src/thread.ts (mutation)
export interface PlainPayload {
  readonly text: string;
  readonly refs?: ReadonlyArray<InlineRef>;
  readonly request?: RequestPayload; // NEW (optional)
}

// NEW
export const REQUEST_VERBS = [
  "request_stop",
  "request_hold",
  "request_unblock",
  "request_mark_done",
  "request_changes",
  "hand_back",
  "cancel_request",
] as const;
export type RequestVerb = (typeof REQUEST_VERBS)[number];

export interface RequestPayload {
  readonly verb: RequestVerb;
  readonly reason?: string;
}
```

**Rationale.** The discriminant (`type: "plain"`) is unchanged → closure is preserved. The shape extension is additive and backward-compatible: any consumer that ignored `request` previously continues to render `text` only. The agent reads `payload.request.verb` for structured branching; humans read `text` for the rendered prose. Single source of truth (the message stream) — no parallel `requests` table.

### 2.2 Pending state — read-model, derived from messages

A task is **pending** iff its thread's most-recent `plain` message with a `request` payload has a verb that is not `cancel_request` AND no later message in the same thread has resolved or superseded it. Derivation is **message-stream-only** — no comparison against `tasks.updated_at` (W-1). Two clocks (DB row `updated_at` vs `messages.created_at`) can disagree under concurrent writes; mixing them leaves the pending flag flickering during a transition. Single source of truth = the message stream.

**Operationalised as a single SQL projection:**

```
For each task in the visible board:
  latest_request_msg = (
    SELECT m FROM messages
    WHERE m.thread_id = task.thread_id
      AND m.type = 'plain'
      AND json_extract(m.payload, '$.request.verb') IS NOT NULL
    ORDER BY m.created_at DESC, m.id DESC
    LIMIT 1
  )

  pending iff (
    latest_request_msg IS NOT NULL
    AND latest_request_msg.payload.request.verb != 'cancel_request'
  )
```

When a state transition lands, the agent is expected to post a corresponding `verdict`-type message (or a follow-up `plain` reflecting the decision); future stories MAY introduce a verdict-as-resolution rule that supersedes the latest request. L15 keeps the rule conservative: cancel-or-newer-request is the only resolver. The board reads the same projection per fetch — no race window because the read is a single statement.

The web client receives the `pendingRequest` field pre-derived from a server endpoint extension (see § 5.4). No new write-side state on the task row.

**Why not write-model.** A `pending_request_message_id` column on `tasks` would (a) duplicate state already present in the message stream, (b) require ack/cancel paths the cancel-via-message flow already provides, (c) drift if a transaction races. The audit invariant is the message stream — the projection sticks with it. Performance is fine: the L1 plan already runs a similar batched-unresolved-review query per Kanban load.

### 2.3 Cancel semantics — append a new message

A cancel is a NEW `plain` message with `request: { verb: "cancel_request", reason? }`. The original request message is **not** soft-deleted. Concept § 4.5.8 mutability: "what an agent or human saw at decision time stays the same" — soft-deleting the original would erase the audit fact that the founder asked, then withdrew. The thread reads chronologically: "Founder requested stop." → "Founder cancelled the request." Agent's history is honest.

### 2.4 Canonical verb identifiers — locked

```ts
export const REQUEST_VERBS = [
  "request_stop",      // → "Request stop"        — agent decides
  "request_hold",      // → "Request hold"        — agent decides
  "request_unblock",   // → "Request unblock"     — agent decides
  "request_mark_done", // → "Request mark done"   — agent decides
  "request_changes",   // → "Request changes"     — agent decides
  "hand_back",         // → "Hand back to me"     — agent confirms
  "cancel_request",    // → "Cancel pending request" (only when pending)
] as const;
```

Lives in `packages/shared/src/thread.ts` alongside the existing `MESSAGE_TYPES`. Universal items (`open_thread`, `reply`, `snooze_24h`, `copy_link`) are NOT verbs — they are UI actions:
- `open_thread` → client-side route push, no server call.
- `reply` → existing `POST /api/threads/:id/messages` with type=plain, no `request` field.
- `snooze_24h` → new endpoint § 5.5 — sidecar workflow state, no thread message.
- `copy_link` → client-only.

**Verb→state legality matrix (from approved.md § 3.5; locked).**

| state | legal verbs |
|---|---|
| `proposed` | (none — no request menu section) |
| `accepted` | `hand_back` |
| `in_progress` | `request_stop`, `request_hold`, `request_mark_done`, `hand_back` |
| `blocked` | `request_unblock`, `request_stop`, `hand_back` |
| `review` | `request_mark_done`, `request_changes` |
| `hold` | (none) |
| `done` | (none) |
| `killed` | (none) |

`cancel_request` is legal in any state IFF the task is currently `pending`.

The matrix lives at `packages/shared/src/task-request-verbs.ts` as a `Record<TaskState, ReadonlyArray<RequestVerb>>` with exhaustive type coverage. Server validates against it on `POST /api/tasks/:id/request`.

### 2.5 Snooze 24h — hides from board, per-user

Snooze is a per-user, per-task workflow state (concept § 4.5.8 rule on sidecar workflow ops). Not a thread message. Not a state machine transition.

**New table `task_snoozes`.** PK `(user_id, task_id)`. Columns: `snoozed_until` (ISO timestamp), `created_at`. The Team Board filters out tasks where `task_snoozes.user_id = current_user AND snoozed_until > now()`. Other users still see them.

`snoozed_until <= now()` rows stay in the table for audit but no longer hide the task. They get cleaned up by a follow-up retention story (out of L15 scope).

### 2.6 Server endpoint — `POST /api/tasks/:id/request`

```
POST /api/tasks/:id/request

Body:
  { verb: RequestVerb, reason?: string, clientKey: string }

Successful Response 201:
  { message: Message, thread: Thread }

Errors:
  400 validation_error      — bad verb / verb not legal for current state /
                              clientKey malformed
  401 (auth middleware)     — missing/invalid HYPERIDLE_API_KEY
  404 not_found             — task does not exist OR sender lacks access to
                              the task's team (cross-team isolation — § 10
                              row 10; existence is hidden, not 403 — see
                              `assertTaskParticipantAuthz` in § 2.6)
  409 already_resolved      — cancel_request issued but no pending exists
                              (W-6 — distinguishes "stale view" from "bad
                              verb" for the client)
  409 idempotency_conflict  — clientKey already used with a different payload
                              on this thread (delegated to appendPlainMessage
                              — see § 5.4 helper signature)
```

**Authn vs authz.**
- *Authn:* the existing `authMiddleware` on `/api/*` validates the `HYPERIDLE_API_KEY`. The endpoint inherits this — no per-route plumbing. (See § 6 Route checklist for the full coverage trace.)
- *Authz:* the founder identity (`readSenderId(c)`) is treated as an **opaque identity string**. Verified by reading `packages/server/src/routes/threads.ts:50–56`: `readSenderId` returns either the `X-Identity` header value or the constant `DEFAULT_FOUNDER_ID = "u-founder"` — a *user-prefixed* identity, not necessarily an `agents.id`. The `threadParticipantsSchema` accepts any string (verified at `threads-schema.ts`); the participants column does not require the string resolve to an `agents` row. **Lock: `senderId` is opaque — do NOT assume it resolves to `agents.id`.** Per L1 plan § 6.1, "sender must be a participant" is the contract on the existing `POST /api/threads/:id/messages` path. The new endpoint enforces task-scoped authz BEFORE thread participation via `assertTaskParticipantAuthz` (see below).

**`assertTaskParticipantAuthz(senderId, task)` — precise contract.**

```ts
// packages/server/src/services/task-authz.ts
import type { HyperIdleDb } from "@hyperidle/db";
import type { Task } from "@hyperidle/shared";

export type TaskAuthzResult =
  | { ok: true }
  | { ok: false; status: 403 | 404; code: string; message: string };

/**
 * Resolves whether `senderId` may post a request on `task`. Pure function
 * over (db, senderId, task) — no Hono context.
 *
 * Resolution order:
 *   1. If senderId === DEFAULT_FOUNDER_ID ("u-founder") → ok. The founder
 *      is a single global identity (per L1 plan); founder bypasses team
 *      membership for ALL tasks. @lore L15 §2.6: founder is global.
 *   2. Else look up `agents` by id = senderId.
 *      - If no row → return { ok:false, status:404, code:"not_found" }
 *        (per §10 row 10: existence is hidden by 404, not 403, when the
 *        caller has no claim to the resource).
 *      - If `agent.role === "founder"` → ok (future multi-founder support).
 *      - Else if `agent.team_id === task.team_id` → ok (team-member of
 *        the agent team that owns the task).
 *      - Else → return { ok:false, status:404, code:"not_found" }
 *        (cross-team isolation: do NOT reveal task existence to outsiders).
 *   3. SenderIds that match neither the founder constant nor any
 *      `agents.id` row are rejected with 404.
 *
 * The check runs BEFORE lazy-thread-creation so a phantom identity cannot
 * pollute `participants[]`.
 */
export function assertTaskParticipantAuthz(
  db: HyperIdleDb,
  senderId: string,
  task: Task,
): TaskAuthzResult;
```

Used by all four new endpoints (`POST /:id/request`, `POST /:id/snooze`, `DELETE /:id/snooze`) and any future task-scoped writer. Centralises the "founder bypass / team-member match / 404 otherwise" rule in a single chokepoint.

**Why 404 on cross-team:** mirrors the `tasks.request.test.ts` row (e) and the §10 row 10 anti-information-leak rule — outsiders should not learn that a task in another team exists.

**Implementation.** The endpoint is a thin convenience layer over the existing `POST /api/threads/:id/messages`. It does NOT introduce a parallel write path:
1. Resolve the task; 404 if missing.
2. **Authz:** call `assertTaskParticipantAuthz(db, senderId, task)` (§ 2.6). Non-`ok` result → return its `status`/`code`/`message` body verbatim.
3. **Lazily ensure the task's thread** (race-safe; see "Lazy-thread-creation race resolution" below).
4. Validate the verb against `TASK_VERBS_BY_STATE[task.state]`; for `cancel_request`, additionally check the read-model "pending" predicate — error 400 if illegal verb / 409 if the cancel target is already cleared (see W-6 below).
5. Render `text` from a canonical mapping (see § 9 copy register).
6. Build the `MessageInput` `{ type:"plain", payload:{text, request:{verb, reason}}, clientKey }` and call `appendPlainMessage(...)` (the extracted helper — see "Helper signature" below).
7. Return 201 `{ message, thread }`.

**Lazy-thread-creation race resolution (CRITICAL-2).**

Two concurrent `POST /api/tasks/:id/request` calls can both observe `tasks.thread_id IS NULL` and both attempt to insert a thread row. Lock the resolution to **conditional-UPDATE-with-rowcount-check**:

```
ensureTaskThread(db, task, senderId) -> { threadRow, created: boolean }:
  if task.thread_id is not null:
    return { threadRow: SELECT FROM threads WHERE id = task.thread_id, created: false }

  // Speculative insert: build the thread row outside any tx with a fresh id.
  newThreadId = crypto.randomUUID()
  newThreadRow = { id: newThreadId, hostKind:"task", hostId: task.id,
                   initiatorId: senderId, participants:[senderId], ... }

  db.transaction((tx) => {
    tx.insert(threads).values(newThreadRow).run()

    // Conditional pin: only succeeds if no other writer beat us.
    result = tx.update(tasks)
                .set({ threadId: newThreadId })
                .where(and(eq(tasks.id, task.id), isNull(tasks.threadId)))
                .run()

    if (result.changes === 0):
      // Another tx pinned tasks.thread_id first. Roll back our speculative
      // thread row and use the winner's id.
      tx.delete(threads).where(eq(threads.id, newThreadId)).run()
      throw new TaskThreadRaceLost()  // sentinel
  })

  on TaskThreadRaceLost (caught at the helper boundary):
    reread task.thread_id; SELECT the existing threadRow; return { threadRow, created: false }
```

The conditional `UPDATE ... WHERE thread_id IS NULL` returning `result.changes === 0` is the race detector. The orphan thread is deleted in the same transaction so visibility never leaks. Mirrors the `VerdictRaceConflict` pattern at `threads.ts:494, 522–524` — same rowcount-on-conditional-update idiom, same sentinel-and-recover shape.

**Why not a unique constraint** on `(host_kind, host_id)` for `host_kind='task'`: would require a partial-unique index (sqlite supports it; pg does too) and a separate ON CONFLICT codepath per dialect. The conditional-UPDATE pattern is single-source-of-truth on `tasks.thread_id` (which is already the canonical pointer) and works identically on both drivers.

**Participant addition.** If `created === true`, `senderId` is in the participants list by construction. If `created === false` (existing thread), and `senderId` is not in `participants[]`, the helper APPENDS senderId via a conditional UPDATE inside the same `appendPlainMessage` transaction (see helper signature below). The append-on-existing-thread path is rare in practice — once the founder posts the first request, the participant list is set.

**Helper signature — `appendPlainMessage` (CRITICAL-1).**

The plan extracts a **narrower** helper, NOT a full `appendMessageToThread` covering all message types. Rationale: the L15 request endpoint posts ONLY `plain` messages with a `request` payload. The verdict-specific branches at `threads.ts:461–479, 510–528, 561–570` (verdict authz, `resolvesMessageRow` lookup, `VerdictRaceConflict`, verdict event emission) are NOT relevant to L15. Pulling them into a shared helper would either bloat the helper's surface (a "skip verdict logic" flag is a god-function antipattern) or force the request endpoint to pass through types it cannot produce.

**Decision: extract a plain-only helper. Leave verdict/review/questionnaire branches at the existing `POST /api/threads/:id/messages` route.**

```ts
// packages/server/src/services/append-plain-message.ts
import type { HyperIdleDb } from "@hyperidle/db";
import type { EventBus } from "@hyperidle/server/events";
import type { Message, Thread, RequestPayload, InlineRef } from "@hyperidle/shared";

export interface AppendPlainInput {
  readonly threadId: string;
  readonly senderId: string;
  readonly clientKey: string;
  readonly payload: {
    readonly text: string;
    readonly refs?: ReadonlyArray<InlineRef>;
    readonly request?: RequestPayload;
  };
}

export type AppendPlainResult =
  | { ok: true; status: 200 | 201; message: Message; thread: Thread }
  | { ok: false; status: 403 | 404 | 409 | 500; code: string; message: string };

/**
 * Single chokepoint for appending a `plain` message to an existing thread.
 * Used by:
 *   - POST /api/threads/:id/messages (when input.type === "plain")
 *   - POST /api/tasks/:id/request (always — every request is a plain msg)
 *
 * Responsibilities (moved INTO the helper):
 *   - Thread row lookup (404 if missing)
 *   - Participant authz (403 if senderId not in participants[])
 *   - Idempotency lookup on (threadId, senderId, clientKey)
 *     - matching payload → 200 with existing canonical row
 *     - divergent payload → 409 idempotency_conflict
 *   - Transactional insert of the message row
 *   - lastActiveAt bump on the thread (the `else` branch of the existing
 *     handler at threads.ts:534–536)
 *   - thread_message_appended event emission
 *
 * Responsibilities NOT moved (stay in the threads route handler):
 *   - Verdict authorization (threads.ts:461–479) — type === "verdict" only
 *   - Re-open semantics (threads.ts:484–486, 529–533) — review/questionnaire
 *   - VerdictRaceConflict guard (threads.ts:488–524) — verdict only
 *   - thread_resolved / thread_reopened event emission (threads.ts:561–582)
 *
 * The threads route handler retains its current shape for non-plain types
 * AND delegates to appendPlainMessage when input.type === "plain".
 */
export function appendPlainMessage(
  db: HyperIdleDb,
  eventBus: EventBus,
  input: AppendPlainInput,
): AppendPlainResult;
```

**What moves vs what stays — explicit branch enumeration.**

| Branch in current `threads.ts:380–582` | Moves to `appendPlainMessage`? |
|---|---|
| JSON parse + Zod validation of body (lines 386–397) | NO — stays at the route (request endpoint does its own validation upstream) |
| `readSenderId` (line 398) | NO — caller passes senderId in |
| Thread row lookup + 404 (lines 400–404) | YES |
| Participant column Zod parse (lines 409–415) | YES |
| Sender-is-participant 403 (lines 417–421) | YES |
| Idempotency lookup + same-payload 200 + divergent-payload 409 (lines 423–459) | YES |
| Verdict authz block (lines 461–479) | NO — verdict-only, stays at the route |
| Re-open detection `wasResolved && (review|questionnaire)` (lines 484–486) | NO — non-plain types only |
| Insert message row inside tx (lines 497–508) | YES |
| Verdict resolve-update + `VerdictRaceConflict` (lines 510–524) | NO — verdict-only |
| Re-open `tx.update(threads).set({resolvedAt:null})` (lines 529–533) | NO — non-plain types only |
| `lastActiveAt` bump (lines 534–536) | YES (the `else` branch — plain messages always bump) |
| `thread_message_appended` event (lines 549–559) | YES |
| `thread_resolved` event (lines 561–570) | NO — verdict-only |
| `thread_reopened` event (lines 571–582) | NO — non-plain types only |

The threads route's POST handler becomes: parse body → if `input.type === "plain"` delegate to `appendPlainMessage(db, eventBus, {...})` and return its result; else fall through to the existing verdict/review/questionnaire path (unchanged). The `VerdictRaceConflict` flow stays exactly where it is.

**Regression coverage.** A protected test in `threads.test.ts` pins the existing verdict-race-conflict behaviour (the `WHERE resolvedAt IS NULL` rowcount path at `threads.ts:510–524` returning 409 on the second concurrent verdict). It must remain green through this refactor — see § 12 protected list (`threads.test.ts` row, "verdict-race regression" assertion lock).

### 2.7 Letter-shortcut bindings — locked

Shortcuts are **advisory** — visible in the menu, never the only path. First-letter-of-primary-verb-wins on collision; loser shows a blank shortcut chip. Locked bindings:

| Letter | Action | Note |
|---|---|---|
| S | Request stop | (only on `in_progress`, `blocked`) |
| H | Request hold OR Hand back | First-wins by render order; on `in_progress` H = hold (hand-back loses); on `accepted` H = hand-back (no collision) |
| D | Request mark done | (only on `in_progress`, `review`) |
| B | Request unblock | (only on `blocked`) |
| O | Open thread | universal |
| R | Reply in thread… | universal |
| Z | Snooze 24h | universal — locked, never reassigned |
| C | Cancel pending request | only when `pending` |

These are emitted on the menu items as `<kbd>` chrome at right; activated via a `keydown` listener on the menu element matching `event.key.toUpperCase()` against the visible items in their render order (first-match-wins). Not registered as global app shortcuts — local to the open menu.

### 2.8 Mobile bottom-sheet + on-screen keyboard — deferred

Approved.md § 6 specifies DaisyUI `modal-bottom`. The composer-modal-pinned-above-keyboard requires `env(keyboard-inset-height, 0)` (iOS 16.4+; Chromium 108+) — a recent-but-supported viewport unit. ⚠️ UNVERIFIED: whether DaisyUI 4.x's `modal-bottom` cleanly composes with `focus-trap-react` (used elsewhere) on iOS. Concrete blockers found at implementation time should be surfaced in a follow-up; **L15 desktop-first ships** with the responsive design degrading to a centred `<dialog>` modal on mobile until follow-up. AC-2 and AC-5 are met with desktop Playwright; mobile parity is a designer-flagged refinement.

### 2.9 Component-budget call — Option β: Tier-2 `TaskActionsMenu`

**Decision: Option β.** The verb mapping is non-trivial (state-conditional rendering, two-line items, shortcut bindings, pending-section conditional, per-item secondary text) and will be reused on the Task detail surface (L18) when the same menu becomes a header action. Tested in isolation, mockable in stories, single update site for the verb vocabulary. SHARED.md line 191 explicitly allows new components when necessary; the criterion is met.

Per SHARED.md § "UI Stack & Component Budget", tiering: **Tier 2 (block)** — `TaskActionsMenu` lives at `packages/design-system/src/TaskActionsMenu.tsx` + `.html` + `.stories.tsx`. Visual parity rule (`.claude/rules/visual-parity.md`) applies — the HTML is the source of truth.

---

## 3. Types — `packages/shared/src/`

### 3.1 New file: `packages/shared/src/task-request-verbs.ts`

```ts
import type { TaskState } from "./types.js";

export const REQUEST_VERBS = [
  "request_stop",
  "request_hold",
  "request_unblock",
  "request_mark_done",
  "request_changes",
  "hand_back",
  "cancel_request",
] as const;
export type RequestVerb = (typeof REQUEST_VERBS)[number];

/**
 * Verb-to-state legality matrix. Exhaustive over TaskState — adding a new
 * state forces a decision here.
 *
 * @lore L15 § 2.4: agents move state machines; humans request. The matrix
 * encodes which requests are LEGAL to send for a state, not what the agent
 * MUST honor. The agent decides.
 */
export const TASK_VERBS_BY_STATE: Record<TaskState, ReadonlyArray<RequestVerb>> = {
  proposed: [],
  accepted: ["hand_back"],
  hold: [],
  in_progress: ["request_stop", "request_hold", "request_mark_done", "hand_back"],
  blocked: ["request_unblock", "request_stop", "hand_back"],
  review: ["request_mark_done", "request_changes"],
  done: [],
  killed: [],
};

export function isVerbLegalForState(verb: RequestVerb, state: TaskState): boolean {
  return TASK_VERBS_BY_STATE[state].includes(verb);
}

/**
 * Canonical text rendering for each verb (used as the `text` field on the
 * thread message, surfaced to humans reading the thread).
 */
export const REQUEST_VERB_TEXT: Record<RequestVerb, string> = {
  request_stop: "Request stop",
  request_hold: "Request hold",
  request_unblock: "Request unblock",
  request_mark_done: "Request mark done",
  request_changes: "Request changes",
  hand_back: "Hand back to me",
  cancel_request: "Cancel pending request",
};

/**
 * Pure renderer: given a verb + optional reason, produce the canonical text
 * for the message body. Reason is appended as `: <reason>` when present.
 */
export function renderRequestText(verb: RequestVerb, reason?: string): string {
  const head = REQUEST_VERB_TEXT[verb];
  return reason ? `${head}: ${reason}` : head;
}
```

### 3.2 Mutation: `packages/shared/src/thread.ts`

Add `RequestPayload` and extend `PlainPayload`:

```ts
export interface RequestPayload {
  readonly verb: RequestVerb; // imported from ./task-request-verbs.js
  readonly reason?: string;
}

export interface PlainPayload {
  readonly text: string;
  readonly refs?: ReadonlyArray<InlineRef>;
  readonly request?: RequestPayload; // NEW
}
```

### 3.3 New shared function: pending-derivation predicate

```ts
// packages/shared/src/task-pending.ts
import type { Message } from "./thread.js";
import type { RequestVerb } from "./task-request-verbs.js";

export interface PendingRequestSummary {
  readonly messageId: string;
  readonly verb: RequestVerb;
  readonly reason?: string;
  readonly createdAt: string;
}

/**
 * Pure derivation: returns the most-recent pending request on a thread, or
 * null if there is no pending. A thread is "pending" iff its most-recent
 * plain-with-request message is NOT a cancel_request AND no later message
 * has reset state.
 *
 * Caller passes messages sorted by (createdAt, id) ASCENDING. Same ordering
 * convention as `headCollapsePredicate`.
 *
 * Caller is responsible for the "task transitioned since request" check —
 * this helper operates only on the message stream.
 */
export function derivePendingRequest(
  messages: ReadonlyArray<Message>,
): PendingRequestSummary | null;
```

### 3.4 Index export update

`packages/shared/src/index.ts` adds:

```ts
export {
  REQUEST_VERBS,
  TASK_VERBS_BY_STATE,
  REQUEST_VERB_TEXT,
  isVerbLegalForState,
  renderRequestText,
} from "./task-request-verbs.js";
export type { RequestVerb } from "./task-request-verbs.js";

export { derivePendingRequest } from "./task-pending.js";
export type { PendingRequestSummary } from "./task-pending.js";

// Existing thread.js exports already include PlainPayload (no change needed
// to the export list; the type's shape is augmented in-place).
export type { RequestPayload } from "./thread.js";
```

---

## 4. Web — TSX changes

### 4.1 `packages/web/src/shell/Kanban.tsx` — strip drag, add menu wiring

**Removed:**
- `DndContext`, `useDraggable`, `useDroppable`, `DragOverlay`, `KeyboardSensor`, `PointerSensor`, `useSensor`, `useSensors` imports.
- `KanbanDropZone`, `DraggableTaskCard` components.
- `STATE_TO_COLUMN`, `COLUMN_TO_STATE`, `resolveKanbanDrop` exports.
- `onMoveTask` from `KanbanProps`.
- Sensor setup, `handleDragStart`, `handleDragEnd`, `activeId` state, `DragOverlay` JSX.

**Kept:**
- `KanbanTask` interface (extended — see below).
- `groupTasksByBet` (pure helper, has tests).
- The 4-column `COLUMNS` array.
- `STATE_TO_COLUMN` is replaced by a private `stateToColumn(state: TaskState): KanbanColumnState | null` function (the same Record under the hood — kept private since the inverse isn't needed).
- `groupByBet` prop.

**Added:**
- New props on `KanbanProps`:

```ts
export interface KanbanTask {
  id: string;
  title: string;
  owner: string;
  state: TaskState;
  cost?: string;
  betTag?: string;
  pendingRequest?: PendingRequestSummary | null; // NEW
}

export interface KanbanProps {
  tasks: KanbanTask[];
  groupByBet?: boolean;
  // NEW — request callbacks. The page wires them to the API client.
  onRequestStateChange: (taskId: string, verb: RequestVerb, reason?: string) => void;
  onCancelPendingRequest: (taskId: string) => void;
  onOpenThread: (taskId: string) => void;
  onReplyInThread: (taskId: string, body: string) => void;
  onSnooze24h: (taskId: string) => void;
  onCopyLink: (taskId: string) => void;
}
```

- Each task card renders inside a `<TaskActionsMenu>` block (see § 4.3) instead of a `<DraggableTaskCard>`.

### 4.2 `packages/web/src/pages/WorkTeam.tsx` — delete handler, wire callbacks

- Delete `handleMoveTask` (lines 116-120) and the `COLUMN_TO_STATE` import.
- Add API-client calls for the six new callbacks. Mock implementations OK for the page-level test (the integration-test layer covers the actual network call).
- Add `pendingRequest` to each `INITIAL_TASKS` row as `null` (until the page is wired to the live feed in a follow-up — out of L15 scope but the type signature lands now).

### 4.3 New file: `packages/design-system/src/TaskActionsMenu.tsx` (Tier 2)

**Props:**

```ts
export interface TaskActionsMenuProps {
  task: { id: string; title: string; state: TaskState; pendingRequest?: PendingRequestSummary | null };
  onRequestStateChange: (verb: RequestVerb, reason?: string) => void;
  onCancelPendingRequest: () => void;
  onOpenThread: () => void;
  onReplyInThread: (body: string) => void;
  onSnooze24h: () => void;
  onCopyLink: () => void;
  /** Render slot: the menu wraps the task card so click-on-card-body opens the menu. */
  children: ReactNode;
}
```

**Composition:**
- DaisyUI `dropdown` (`details`-based or click-controlled state — lock to the `<details>` form for keyboard parity).
- Trigger: a `··· btn-ghost btn-xs` rendered absolute inside `children`'s slot AND a click-on-card-body listener delegated through a wrapper `<div>` per approved § 5.1.
- Menu items: `<li><button>` rows with two-line layout (primary verb + secondary "→ agent decides" hint).
- Cmd/Alt+click or `Cmd+Enter` on an item opens a Composer modal pre-populated for that verb.
- Letter shortcuts emitted as `<kbd>` chips; local `keydown` handler activates first-match-wins on the visible items.
- Per-state verb rendering driven by `TASK_VERBS_BY_STATE[task.state]`.

**Stories:** `TaskActionsMenu.stories.tsx` covers `accepted`, `in_progress`, `blocked`, `review`, `done`, plus a `pendingRequest` variant.

**HTML parity:** `packages/design-system/html/TaskActionsMenu.html` (Claude-Design-edited). Visual parity test runs against it (`bun run ds:sync`).

### 4.4 `packages/design-system/src/TaskCard.tsx` — pending-chip slot + click-to-open

**Mutations:**
- Add optional `pendingRequest?: PendingRequestSummary | null` prop.
- When set, the existing `cost` slot is REPLACED by a `StatusChip` with status=`request_pending` (new variant — see § 4.5). The chip has `title` = `Requested: <verb text> · <relative time>`.
- Add optional `onActivate?: () => void` prop. When set, the outer `<div>` becomes pressable (existing `clickableProps` helper). The TaskActionsMenu wires `onActivate` to "open menu".
- Story coverage: render with and without `pendingRequest`.

The `actions` slot already exists (line 16 of TaskCard.tsx) — used for the `···` button.

### 4.5 `packages/design-system/src/StatusChip.tsx` — `request_pending` variant

Add a new entry to the `Status` union AND `STATUS_STYLES` record:

```ts
export type Status = "healthy" | "behind" | "blocked" | "paused" | "done" | "error" | "request_pending"; // NEW

// STATUS_STYLES:
request_pending: {
  bg: "var(--surface-ghost)",
  border: "1px dashed var(--border-default)",
  text: "var(--text-hi)",
  label: "↪ PENDING", // single source of truth for the label
}
```

The label exception (the chip normally renders `safeStatus.toUpperCase()`) is handled by widening `StatusStyle` to allow an optional `label` override; default falls back to current behaviour.

⚠️ Visual parity rule — the matching `StatusChip.html` must be updated by Claude Design first; the TSX matches.

### 4.6 Composer reuse

The existing `Composer` (Tier 2) is reused inside a DaisyUI `<dialog className="modal">` for both "Reply in thread…" and "Request X with reason." No new component. The `TaskActionsMenu` opens the modal locally; the modal's onSubmit calls `onReplyInThread` or `onRequestStateChange(verb, reason)`.

---

## 5. Server — endpoints & schema

### 5.1 Migration: `0010_add_task_snoozes.sql` (sqlite + pg)

```sql
-- sqlite
CREATE TABLE task_snoozes (
  user_id        TEXT NOT NULL,
  task_id        TEXT NOT NULL,
  snoozed_until  TEXT NOT NULL,
  created_at     TEXT NOT NULL,
  PRIMARY KEY (user_id, task_id),
  FOREIGN KEY (task_id) REFERENCES tasks(id) ON DELETE CASCADE
);
CREATE INDEX task_snoozes_user_until_idx ON task_snoozes(user_id, snoozed_until);

-- pg: same with `TIMESTAMPTZ` for timestamps and `IF NOT EXISTS` clauses.
```

### 5.2 Drizzle schema delta

`packages/db/src/schema.ts` and `packages/db/src/schema.pg.ts`:

```ts
export const taskSnoozes = sqliteTable(
  "task_snoozes",
  {
    userId: text("user_id").notNull(),
    taskId: text("task_id").notNull().references(() => tasks.id, { onDelete: "cascade" }),
    snoozedUntil: text("snoozed_until").notNull(),
    createdAt: text("created_at").notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.userId, table.taskId] }),
    index("task_snoozes_user_until_idx").on(table.userId, table.snoozedUntil),
  ],
);
```

### 5.3 Zod schema delta — `packages/server/src/routes/threads-schema.ts`

Extend `plainPayloadSchema`:

```ts
import { REQUEST_VERBS } from "@hyperidle/shared";

const requestPayloadSchema = z.object({
  verb: z.enum(REQUEST_VERBS),
  reason: z.string().min(1).max(2048).optional(),
});

const plainPayloadSchema = z.object({
  text: z.string().max(16_384),
  refs: z.array(inlineRefSchema).optional(),
  request: requestPayloadSchema.optional(), // NEW
});
```

The discriminated `messageInputSchema` automatically picks up the extension because `plain` already references `plainPayloadSchema`.

### 5.4 New file: `packages/server/src/routes/tasks-request.ts`

The handler is added to `createTaskRoutes` — does not need its own router.

```ts
const requestBodySchema = z.object({
  verb: z.enum(REQUEST_VERBS),
  reason: z.string().min(1).max(2048).optional(),
  clientKey: clientKeySchema, // imported from threads-schema.ts
});

router.post("/:id/request", validateBody(requestBodySchema), async (c) => {
  const taskId = c.req.param("id");
  const body = c.req.valid("json" as never) as z.infer<typeof requestBodySchema>;
  const senderId = readSenderId(c);

  // 1. Resolve task; 404 if missing.
  // 2. assertTaskParticipantAuthz(db, senderId, task) — § 2.6.
  //    Non-ok result returned verbatim (404 cross-team / phantom identity).
  // 3. State-legality check via TASK_VERBS_BY_STATE[task.state]; 400 if illegal.
  //    For cancel_request: derivePendingRequest(messages); if pending is null
  //    return 409 "already_resolved" (W-6 — see § 10 row 12).
  // 4. ensureTaskThread(db, task, senderId) — race-safe lazy creation
  //    (see "Lazy-thread-creation race resolution" above).
  // 5. Build payload { text: renderRequestText(verb, reason), request: { verb, reason } }
  //    and call appendPlainMessage(db, eventBus, { threadId, senderId, clientKey, payload }).
  //    Returns AppendPlainResult — propagate 200/201/403/404/409/500 directly.
  // 6. On ok: return c.json({ message, thread }, status).
});
```

**Key contract: `appendPlainMessage` is the single chokepoint for plain-type writes.** The current `threads.ts` POST handler embeds idempotency, authz, transaction, and event emission inline (lines 380–582). L15 extracts the **plain-only branches** (see branch-enumeration table above) into `packages/server/src/services/append-plain-message.ts`. BOTH the existing `POST /api/threads/:id/messages` (when `input.type === "plain"`) AND the new `POST /api/tasks/:id/request` call it. Verdict/review/questionnaire branches stay at the threads route — they have specialised authz, race guards, and event emission that L15's request endpoint cannot produce. The protected `threads.test.ts` suite (incl. the verdict-race regression assertion locked in § 12) must stay green through this refactor.

### 5.5 New endpoints — snooze

```
POST /api/tasks/:id/snooze
Body: { hours: 24 }     // hours is a closed enum [24] for L15; future-proofing
Response 201: { snoozedUntil: ISO timestamp }

DELETE /api/tasks/:id/snooze
Response 204
```

These touch `task_snoozes` directly — no thread involvement. Per-user state via `readSenderId(c)`.

### 5.6 List endpoint extension — `GET /api/tasks` (or wherever the board sources tasks)

⚠️ FLAG: search the codebase for the current board-tasks-fetch endpoint shape. The plan needs to extend it (or its WebSocket cousin) to project `pendingRequest` per task. The shape returned per task:

```ts
{
  ...existing TaskRow fields,
  pendingRequest: PendingRequestSummary | null,  // server-derived per § 2.2
  snoozedUntil: string | null,                    // server-derived per § 2.5
}
```

**Resolution path:** the architect picks the endpoint. If the existing `GET /api/tasks` returns the bare task row, this story extends it. If the Team Board fetches tasks through a different endpoint (`/api/teams/:id/tasks` or similar), that one is extended instead. The implementation pass surfaces this with a grep at write-tests time.

The pendingRequest projection runs as a single batched query joined onto the message stream (parallel to L1's "unresolved review/questionnaire" batched query at `threads.ts:225-241`).

### 5.7 Event-bus emissions

The new `POST /api/tasks/:id/request` inherits message emission from the existing append path (`message_posted` event). No new event types. The existing `message_posted` event is the substrate L7 (verdict commit) and L18 (thread surface) already consume.

The new `POST /api/tasks/:id/snooze` emits a new `task_snoozed` event with `{ taskId, userId, snoozedUntil }`. ⚠️ FLAG: confirm event-bus typing — `packages/shared/src/events.ts` may need a new entry. Single-line addition to the discriminated union; downstream consumers (none in L15) ignore it.

---

## 6. Route checklist (L7 retro mandate)

The story changes auth/authz behavior AND adds new routes. This block enumerates every route + every file the auth/middleware must cover. `/architecture-review` greps the impl against this list.

| Route | File | Auth applies? | Reason |
|---|---|---|---|
| `POST /api/tasks/:id/request` | `packages/server/src/routes/tasks.ts` (extends existing `createTaskRoutes`) | YES — inherits `app.ts:246` `api.use("*", authMiddleware)` | New mutation endpoint; needs the global auth gate. |
| `POST /api/tasks/:id/snooze` | `packages/server/src/routes/tasks.ts` | YES — inherits global. | Per-user state mutation. |
| `DELETE /api/tasks/:id/snooze` | `packages/server/src/routes/tasks.ts` | YES — inherits global. | Per-user state mutation. |
| `GET /api/tasks` (or the team-board fetch route — see § 5.6) | `packages/server/src/routes/tasks.ts` (existing) | YES — inherits global. | Read-side mutation: the response shape gains `pendingRequest`/`snoozedUntil` fields per § 5.6. No auth change; listing here for completeness. |
| `POST /api/threads/:id/messages` | `packages/server/src/routes/threads.ts` (existing — refactored to delegate plain-type to `appendPlainMessage`) | YES — inherits global. | Plain-type single-chokepoint refactor: the existing route delegates to `services/append-plain-message.ts` when `input.type === "plain"`; verdict/review/questionnaire branches stay in-route. Auth and `VerdictRaceConflict` semantics unchanged. |

**No middleware-graph changes.** The new routes mount under `/api` and inherit the existing `api.use("*", authMiddleware)`. Confirmed by reading `packages/server/src/app.ts:240-246`. The `app.ts:262-275` route-mounting block already includes `api.route("/tasks", createTaskRoutes(...))` — the new POST handlers fall under that mount.

**Implementation greps (the review skill will run these):**
- `grep -RIn 'router\.post\|router\.delete' packages/server/src/routes/tasks.ts` — must show all 4 mutations.
- `grep -RIn 'authMiddleware' packages/server/src/app.ts` — must show single-mount under `/api`.
- `grep -RIn 'createRateLimiter' packages/server/src/app.ts` — must show pre-auth global mount (W-2 confirmation; lines 187–200).
- `grep -RIn 'readSenderId' packages/server/src/routes/tasks.ts` — must appear in every new handler (used to scope per-user authz).
- `grep -RIn 'assertTaskParticipantAuthz' packages/server/src/routes/tasks.ts` — must appear in every new handler (CRITICAL-3 chokepoint).
- `grep -RIn 'appendPlainMessage' packages/server/src/routes/` — must appear in BOTH `tasks.ts` (the request handler) AND `threads.ts` (the plain-type delegate).
- `grep -RIn 'ensureTaskThread\|TaskThreadRaceLost' packages/server/src/services/` — must appear in the lazy-thread-creation path (CRITICAL-2 idiom).

---

## 7. Plan reconciliation (spec ⇆ codebase)

| Spec assumption | Reality | Resolution |
|---|---|---|
| Drag mechanics in `Kanban.tsx` | Confirmed at lines 5–15, 75, 119, 139, 200–203, 236–312. | Removed in § 4.1. |
| `WorkTeam.tsx:116-120` move handler | Confirmed. | Deleted in § 4.2. |
| Canvas DndContext separate | Confirmed at `packages/web/src/shell/Canvas.tsx:7-14, 147`. | Untouched (§ 4.4 of approved design). |
| `tasks.threadId` exists in schema | Confirmed at `packages/db/src/schema.ts:107`. | Lazily populated on first request. |
| MESSAGE_TYPES is a closed enum | Confirmed at `packages/shared/src/thread.ts:29`. | Do NOT add new type. Extend `PlainPayload` instead (§ 2.1, § 3.2). |
| messageInputSchema validates plain payload as `{text, refs?}` | Confirmed at `packages/server/src/routes/threads-schema.ts:34-37`. | Extended in § 5.3. |
| authMiddleware applies to /api/* | Confirmed at `packages/server/src/app.ts:246`. | Inherited; no plumbing change. |
| `task_snoozes` does not exist | Confirmed (no matches). | New table in § 5.1, § 5.2. |
| TaskCard has cost slot, no actions slot for menu | TaskCard has BOTH `cost?` AND an `actions?: ReactNode` slot already (line 16). | Use `actions` for the `···`; replace cost slot with pending chip when `pendingRequest` is set. |
| StatusChip Status enum lacks `request_pending` | Confirmed at `packages/design-system/src/StatusChip.tsx:4`. | Extend in § 4.5. |
| `Kanban.keyboard-drag.test.tsx` exists and is fully drag-centric | Confirmed (`packages/web/src/__tests__/Kanban.keyboard-drag.test.tsx`). | DELETE. New tests cover no-drag invariants AND request flows. |
| `WorkTeam.test.tsx` asserts `COLUMN_TO_STATE` export | Confirmed (line 73-74). | DELETE that test case; new tests cover the request flow and the menu. |
| `Kanban.test.tsx` likely asserts on draggable wrapper | Inspect at write-tests time; expect drag-related assertions removed. | Refactor; new assertions per V-1a/b/c. |
| `WorkKanban.grouped.test.tsx` exists | Confirmed; uses `groupByBet`. | Should remain green — `groupTasksByBet` is preserved. |

Two **flagged unknowns** I am NOT silently resolving:

> ### CONFUSION: team-board task fetch endpoint
> I'm uncertain about: which endpoint the Team Board uses to source live tasks today. The current `WorkTeam.tsx` (lines 32–73) uses an `INITIAL_TASKS` constant — there's no live fetch wired in.
>
> Options:
> A) The Team Board has not yet been wired to a live endpoint; the L15 plan extends `GET /api/tasks` (the existing route in `tasks.ts`) for the projection and leaves the page-level wiring as a separate follow-up. Consequences: AC-2 V-2c (Playwright "reload → message persists") tests against a page-level fixture or against a temporary live wiring; the protected test list scopes to the API + the menu, not the live page.
> B) There is a live fetch elsewhere (not searched exhaustively) that I missed.
>
> Proceeding with (A) — the board is mocked-data today, the API + menu work lands in L15, and the live wire-up is a follow-up. Flag for the adversary.

> ### RESOLVED (post-critique): founder identity is opaque
> Earlier draft assumed `readSenderId(c)` returns an `agentId`. **Verified wrong.** Re-reading `packages/server/src/routes/threads.ts:50–56`: `readSenderId` returns the `X-Identity` header value OR the constant `DEFAULT_FOUNDER_ID = "u-founder"` — a user-prefixed identity. The `threadParticipantsSchema` (verified at `threads-schema.ts`) accepts any string array; participants are opaque IDs.
>
> The verdict-authz block at `threads.ts:472–476` queries `agents` by id specifically because it needs to discriminate `role === "founder"` for VERDICT messages. That lookup is incidental to the verdict path — it does NOT prove `senderId` is always an `agents.id`. For non-verdict types (including L15's plain-with-request), no such resolution happens; senderId is treated as opaque.
>
> **Resolution.** L15 treats `senderId` as opaque throughout. The new authz check `assertTaskParticipantAuthz` (§ 2.6) handles the founder-vs-team-member discrimination explicitly: `senderId === "u-founder"` is the founder bypass; otherwise it must resolve to an `agents.id` whose `team_id` matches the task's. A senderId resolving to neither is rejected with 404 (cross-team isolation per § 10 row 10). Cross-team-founder pollution is prevented by the test in § 12 (`tasks.request.test.ts` row e).

---

## 8. Ordered task list

Each task lists: what, files, blocking test (the verification artifact that proves it).

**Phase A — Shared types (no deps).**
1. Add `packages/shared/src/task-request-verbs.ts` (§ 3.1). Tests: `task-request-verbs.test.ts` covers `isVerbLegalForState` matrix + `renderRequestText` rendering.
2. Extend `packages/shared/src/thread.ts` (§ 3.2) — add `RequestPayload`, augment `PlainPayload`. Tests: existing thread tests stay green; new test asserts a plain message with `request` round-trips through `messageInputSchema` validation.
3. Add `packages/shared/src/task-pending.ts` (§ 3.3) — `derivePendingRequest`. Tests: pure-function unit tests on a fixture message stream; cancel-supersedes; transitions-supersede.
4. Update `packages/shared/src/index.ts` exports (§ 3.4).

**Phase B — DB schema (depends on A only structurally).**
5. New migration `0010_add_task_snoozes.sql` (sqlite + pg) (§ 5.1).
6. Add `taskSnoozes` Drizzle table to `packages/db/src/schema.ts` and `schema.pg.ts` (§ 5.2). Tests: existing `db/__tests__/schema-parity.test.ts` (or equivalent) covers parity.
7. Run `bun run db:generate` and inspect — the dual-driver pattern requires both files in lockstep.

**Phase C — Server (depends on A + B).**
8a. Extract **only the plain-type branches** of `threads.ts:380–582` (per the branch-enumeration table in § 5.4) into `packages/server/src/services/append-plain-message.ts`. Verdict / review / questionnaire branches stay at the route. Tests: `append-plain-message.test.ts` (new) + `threads.test.ts` and `threads.verdict-race.test.ts` (the protected regression-pin) stay green.
8b. Add `packages/server/src/services/task-authz.ts` exporting `assertTaskParticipantAuthz` (§ 2.6). Tests: `task-authz.test.ts` — pure unit tests.
8c. Add `packages/server/src/services/ensure-task-thread.ts` exporting `ensureTaskThread` with the conditional-UPDATE race resolution (§ 5.4 "Lazy-thread-creation race resolution"). Tests covered by `tasks.request-concurrent.test.ts`.
9. Extend `packages/server/src/routes/threads-schema.ts` — add `requestPayloadSchema`, augment `plainPayloadSchema` (§ 5.3). Tests: schema-validation unit test rejects invalid verb / accepts valid.
10. Add `POST /api/tasks/:id/request` to `packages/server/src/routes/tasks.ts` (§ 5.4). Tests: `tasks.request.test.ts`, `tasks.request-concurrent.test.ts`, `tasks.request-authz.test.ts` — see § 12 protected list.
11. Add `POST /api/tasks/:id/snooze` and `DELETE /api/tasks/:id/snooze` to `tasks.ts` (§ 5.5); both call `assertTaskParticipantAuthz` first. Tests: `tasks.snooze.test.ts`.
12. Extend `GET /api/tasks` (or the board-fetch endpoint identified in CONFUSION § 7) to project `pendingRequest` and `snoozedUntil` per task (§ 5.6). Tests: `tasks.list-pending.test.ts` covers the projection.
13. Add `task_snoozed` event to `packages/shared/src/events.ts` (§ 5.7).

**Phase D — Design system (depends on A, parallel to C).**
14. Add `request_pending` variant to `StatusChip.tsx` AND `StatusChip.html` (§ 4.5). Tests: `StatusChip.test.tsx` covers the new variant; visual parity test (`bun run ds:sync`) must pass.
15. Extend `TaskCard.tsx` AND `TaskCard.html` with `pendingRequest` slot + `onActivate` (§ 4.4). Tests: `TaskCard.test.tsx` covers the chip-replaces-cost behaviour and the press-to-open-menu wiring.
16. New `TaskActionsMenu.tsx` + `.html` + `.stories.tsx` + `__tests__/TaskActionsMenu.test.tsx` (§ 4.3). Tests in § 12.
16a. New visual-regression tests `StatusChip.visual.test.tsx`, `TaskCard.visual.test.tsx`, `TaskActionsMenu.visual.test.tsx` (W-4). Each diffs the TSX render against the corresponding HTML reference in `packages/design-system/html/`; pixel-diff threshold ≤ 5% per `.claude/rules/visual-parity.md`.

**Phase E — Web shell (depends on C + D).**
17. Strip drag from `packages/web/src/shell/Kanban.tsx` (§ 4.1). Tests: § 12 V-1a/b/c.
18. Update `packages/web/src/pages/WorkTeam.tsx` — delete `handleMoveTask`, wire the six new callbacks against the API (§ 4.2). Tests: WorkTeam.test.tsx assertion replaces the old move case.
19. **Delete** `packages/web/src/__tests__/Kanban.keyboard-drag.test.tsx`. Its assertions are obsolete — drag is gone.
20. Update `packages/web/src/__tests__/Kanban.test.tsx` to assert the new no-drag invariants (V-1a/b/c).

**Phase F — E2E (depends on E).**
21. New Playwright spec `packages/web/e2e/team-board-no-drag.spec.ts` (V-1d).
22. New Playwright spec `packages/web/e2e/team-board-request.spec.ts` (V-2c).
23. New Playwright spec `packages/web/e2e/canvas-drag-survives.spec.ts` (V-3b) — protects the Canvas drag against accidental regression in a future story that "consolidates" Kanban + Canvas.

**Phase G — DoD.**
24. `bun run check`, `bun run lint`, `bun run test` all green (the test command exercises the visual-regression suite alongside unit tests — W-4).
25. `bun run e2e` (or equivalent) green.
26. `bun run ds:sync` exits 0 (visual-parity gate against the HTML references).
27. `/architecture-review` greps the route checklist (§ 6) and the protected-test list (§ 12) against the implementation.

---

## 9. Copy register (locked from approved.md § 8)

The architect re-emits this block so write-code does not re-litigate it. Single source of truth for verb text lives in `REQUEST_VERB_TEXT` (§ 3.1); secondary lines live in the `TaskActionsMenu` story export.

| Surface | Locked copy |
|---|---|
| Section label | `REQUEST STATE CHANGE` |
| Verb (atomic) | `Request stop` · `→ asks the agent to abandon — agent decides` |
| Verb (handover) | `Hand back to me` · `→ moves ownership to you — agent confirms` |
| Universal | `Open thread` · `→ jump to the conversation` |
| Universal | `Reply in thread…` · `→ send a free-form message` |
| Pending | `Cancel pending request` · `→ withdraws the request` |
| Toast (sent) | `Request sent — agent will respond.` |
| Toast (cancelled) | `Request cancelled.` |
| Toast (reply) | `Reply posted.` |
| Toast (error) | `Request failed — try again.` (with `RETRY` action) |
| Pending chip | `↪ PENDING` (mono caps) |
| Pending chip title | `Requested: <verb> · <relative time>` |
| Composer placeholder (reason) | `Why? (optional — the agent reads this before deciding)` |
| Composer placeholder (reply) | `Reply in thread…` |

No emoji; the `↪` arrow is Unicode, rendered in the mono token.

---

## 10. Security & abuse cases

Per CC-003 — required. Each line is `applicable / addressed` OR `N/A with reason`.

| Concern | Status | How |
|---|---|---|
| **Rate-limit on every POST/PATCH** | Applicable; addressed (W-2 confirmed). | The project's `createRateLimiter` middleware is mounted globally in `packages/server/src/app.ts:187–200` BEFORE `authMiddleware` (so unauthenticated floods are rejected first). All routes under the global API mount — including the four new L15 routes — inherit it. Default budget: `HYPERIDLE_RATE_LIMIT_PER_MIN=60` (configurable). **L15 inherits the existing limiter; no per-route override.** Confirmed by reading `app.ts:10, 187–216` and `middleware/rate-limit.ts`. Impl note: the `/api/tasks/:id/request` route does NOT need to register its own bucket. |
| **Input-trust boundary for any agent-authored field** | Applicable. | The `reason` field on a request is human-authored (the founder), not agent-authored. The `verb` is enum-validated by Zod at the boundary. The endpoint NEVER accepts an arbitrary `text` field — `text` is server-rendered from the canonical `REQUEST_VERB_TEXT` map (§ 3.1). This eliminates the cross-site-rendering vector where an agent could inject text into a thread message via the request endpoint. |
| **Authn vs authz** | Addressed. | Authn: `authMiddleware` on `/api/*`. Authz: `senderId` (from API key) must (a) match a known identity row, (b) be a participant of the task's thread (added as participant on lazy creation). For tasks the founder does NOT have access to (cross-team boundary), the lazy-creation path adds them as participant — **this is the abuse risk**, see next row. |
| **Abuse: founder requests state change on a task they don't own / have no access to** | Applicable; addressed via membership check. | `assertTaskParticipantAuthz(db, senderId, task)` (spec'd in § 2.6) runs BEFORE lazy-thread-creation. Resolution: (1) `senderId === "u-founder"` → ok (global founder bypass); (2) else `agents.id = senderId` AND (`agent.role = 'founder'` OR `agent.team_id = task.team_id`) → ok; (3) else 404 (no information leak). Without this gate, ANY authenticated user could pollute any task's thread. The protected test `tasks.request.test.ts` row (e) — "cross-team-founder pollution" — pins this contract: a senderId from a different team's user attempting to request on a task they don't own returns 404, no thread row is created, no participant is added. |
| **Abuse: client floods `clientKey` to bypass idempotency** | Addressed. | The existing idempotency-conflict 409 path (`threads.ts:441-451`) covers this — same `(threadId, senderId, clientKey)` with different payload returns 409. Same payload returns 200 with the canonical id. New endpoint inherits this through the shared `appendPlainMessage` helper (§ 5.4 branch-enumeration row "Idempotency lookup"). |
| **Abuse: cancel_request without a pending — DOS via empty cancels** | Applicable. | Server validates "a pending exists" before accepting `cancel_request`. Returns 400. |
| **Abuse: snooze flood** | Applicable. | Per-user rate-limit (inherited from API). The PK `(user_id, task_id)` deduplicates: re-snoozing extends the timestamp; doesn't create a new row. |
| **Path-traversal on path inputs** | N/A. | No path inputs (only opaque IDs). |
| **SSRF on outbound URL** | N/A. | No outbound URLs. |
| **Secret handling on new credential surface** | N/A. | No new credentials. |
| **Abuse: information leak via 404 vs 403** | Applicable. | When the founder lacks access to a task, return 404 (not 403) so existence is not revealed. Mirrors L1 plan's pattern. |
| **Abuse: malicious `reason` payload (XSS via thread render)** | Applicable. | Already mitigated via React's default text-escape; the thread renderer treats `text` as text, not HTML (per concept § 4.5.1 hard rule "no untyped HTML payloads"). Server caps `reason` length at 2048. |
| **Abuse: stale `pendingRequest` in concurrent edit** | Applicable. | Read-model derivation runs at fetch time (per § 2.2); concurrent state transitions invalidate the pending implicitly. The web client treats `pendingRequest` as advisory — clicking "Cancel pending request" sends a cancel; if the server has already cleared the pending, the cancel returns **409** `already_resolved` (NOT 400). **HTTP code locked at 409** per W-6: 400 means "your request is malformed"; 409 means "your view of state is stale" — the latter matches "the action is moot." Toast on the client surfaces this as "Already resolved." Client distinguishes 400 (bad verb / illegal-for-state) from 409 (raced) for cleaner UX. |
| **Abuse: agent-impersonation via senderId** | N/A (out of L15 scope). | The auth model is "API key per identity"; impersonation is the broader auth-model story. L15 inherits whatever L1 + the global auth gate already enforce. |

---

## 11. Component-budget impact

**Δ Tier-2 = +1.** New: `TaskActionsMenu` at `packages/design-system/src/TaskActionsMenu.tsx`.

Per SHARED.md line 191 ("No strict count enforced … create new components only when necessary"), the component budget is not hard-capped; the criterion is "necessary." Justification:
- State-conditional rendering (per-state verb subset).
- Two-line item layout (primary + secondary).
- Per-item shortcut bindings.
- Reused on Task detail (L18).
- Mockable in stories.
- Single source of truth for verb-to-text-to-secondary mapping.

The alternative (Option α — compose inline) would replicate this surface in every consumer; the menu is non-trivial enough that drift is the certain outcome.

**No Tier-3 changes** (Inspector / Submenu / Rail / Canvas / Kanban / etc.). `Kanban` stays Tier-3, slimmer (drag mechanics removed; menu wiring added through callbacks).

---

## 12. Protected tests

`protectedTests` — these test files MUST exist with the assertions listed below before code is considered done. DoD audits this set with `git diff --name-only` to ensure none are silently deleted or weakened.

### Vitest (unit + integration)

```ts
protectedTests: [
  // Shared types — phase A
  "packages/shared/src/__tests__/task-request-verbs.test.ts",
  "packages/shared/src/__tests__/task-pending.test.ts",
  "packages/shared/src/__tests__/thread-plain-with-request.test.ts",

  // Server — phase C
  "packages/server/src/routes/__tests__/tasks.request.test.ts",
  "packages/server/src/routes/__tests__/tasks.request-concurrent.test.ts", // NEW — CRITICAL-2 race
  "packages/server/src/routes/__tests__/tasks.request-authz.test.ts",      // NEW — CRITICAL-3 cross-team
  "packages/server/src/routes/__tests__/tasks.snooze.test.ts",
  "packages/server/src/routes/__tests__/tasks.list-pending.test.ts",
  "packages/server/src/services/__tests__/append-plain-message.test.ts",   // RENAMED — narrower helper
  "packages/server/src/services/__tests__/task-authz.test.ts",             // NEW — assertTaskParticipantAuthz
  "packages/server/src/routes/__tests__/threads.test.ts",                  // protected: must stay green through the refactor; verdict-race assertion locked
  "packages/server/src/routes/__tests__/threads.verdict-race.test.ts",     // NEW (or existing in threads.test.ts §) — pins L1-step9 VerdictRaceConflict 409 behaviour through the L15 refactor

  // Design system — phase D
  "packages/design-system/src/__tests__/StatusChip.test.tsx",
  "packages/design-system/src/__tests__/TaskCard.test.tsx",
  "packages/design-system/src/__tests__/TaskActionsMenu.test.tsx",
  "packages/design-system/src/__tests__/TaskCard.visual.test.tsx",         // NEW — W-4 visual-regression (TaskCard at rest, with pending chip)
  "packages/design-system/src/__tests__/TaskActionsMenu.visual.test.tsx",  // NEW — W-4 visual-regression (menu open across states)
  "packages/design-system/src/__tests__/StatusChip.visual.test.tsx",       // NEW — W-4 visual-regression (request_pending variant)

  // Web — phase E
  "packages/web/src/__tests__/Kanban.test.tsx",
  "packages/web/src/__tests__/Kanban.no-drag.test.tsx", // NEW — replaces Kanban.keyboard-drag.test.tsx
  "packages/web/src/__tests__/WorkTeam.test.tsx",
  "packages/web/src/__tests__/WorkKanban.grouped.test.tsx", // existing — must stay green
]
```

**Note on visual-regression files.** The three `*.visual.test.tsx` entries are the harness used by `bun run ds:sync` (per `.claude/rules/visual-parity.md`: 5% pixel-diff threshold, non-negotiable). They render the TSX, snapshot, and diff against the corresponding `packages/design-system/html/<Name>.html`. The visual-test runner is invoked by both `bun run test` (gating CI) and `bun run ds:sync` (developer workflow). If the harness already exists at a different path, the impl pass renames these to match — the locked invariant is "one visual-regression test per touched HTML reference."

### Vitest assertion locks per file

Each protected test must contain the listed assertions (paraphrased). Adversary review checks the test bodies against this list.

| Test file | Required assertions | AC mapping |
|---|---|---|
| `task-request-verbs.test.ts` | (a) `TASK_VERBS_BY_STATE` is exhaustive over `TaskState`; (b) `isVerbLegalForState('request_stop','in_progress')` is true; (c) `isVerbLegalForState('request_stop','done')` is false; (d) `renderRequestText('request_stop','no progress')` = `"Request stop: no progress"`. | AC-2 |
| `task-pending.test.ts` | (a) Empty stream → null; (b) single request → returns it; (c) request + cancel → null; (d) request + cancel + new request → returns the new one; (e) ordering by `(createdAt, id)` ascending. | AC-2 |
| `thread-plain-with-request.test.ts` | A plain message with `payload.request = {verb:'request_stop'}` validates through `messageInputSchema`. A plain message with `payload.request.verb = 'invalid'` is rejected. | AC-2 |
| `tasks.request.test.ts` | (a) POST with valid verb returns 201, persists exactly 1 message in the task's thread, payload includes `request:{verb}`; (b) POST with illegal verb for state returns 400; (c) POST `cancel_request` without a pending returns **409 already_resolved** (W-6 — locked); (d) POST with no auth returns 401 (or whatever the existing 401 contract is); (e) POST against a task the founder doesn't have access to returns 404 (no information leak; cross-team isolation); (f) idempotency — duplicate clientKey with same payload returns the same message id (200); duplicate clientKey with divergent payload returns 409 idempotency_conflict; (g) lazily creates the task's thread when `tasks.thread_id` is null and pins it via the conditional UPDATE; (h) `appendPlainMessage` is the SAME code path as the plain-type branch of `POST /api/threads/:id/messages` (parity test: same input → same row layout). | AC-2, abuse-row-3, abuse-row-7, abuse-row-9 |
| `tasks.request-concurrent.test.ts` | **NEW (CRITICAL-2).** (a) Two concurrent `POST /api/tasks/:id/request` calls on a task with `thread_id IS NULL` → exactly ONE thread row exists for that task afterwards; (b) both messages land in the same thread (different clientKeys); (c) `tasks.thread_id` points at the surviving thread; (d) no orphan thread rows remain (the loser's speculative insert was rolled back). Use `Promise.all` with shared db handle; or stub the conditional-UPDATE to simulate the race deterministically. | CRITICAL-2 |
| `tasks.request-authz.test.ts` | **NEW (CRITICAL-3).** (a) senderId = `"u-founder"` (default founder) on any task → 201 (founder bypass); (b) senderId = an `agents.id` whose `team_id === task.team_id` → 201; (c) senderId = an `agents.id` from a DIFFERENT team's user → **404** (no information leak; no thread row created; no participant added); (d) senderId = a string matching no `agents.id` row and not the founder constant → 404; (e) cross-team-founder pollution: two teams with two different non-founder agent identities; agent A attempts a request on a task in team B → 404, team B's task has no thread row, no participant entry includes agent A. | CRITICAL-3, abuse-row-4, abuse-row-10 |
| `task-authz.test.ts` | Pure unit tests on `assertTaskParticipantAuthz(db, senderId, task)`: founder bypass, team-member match, role-founder match, phantom-identity 404, cross-team 404. No HTTP — pure function. | CRITICAL-3 |
| `threads.verdict-race.test.ts` | **NEW (regression-pin).** Two concurrent verdict messages targeting the same review → first returns 201 with `thread_resolved` event; second returns **409 verdict_race**. The L1-step9 `VerdictRaceConflict` semantic at `threads.ts:488–524` MUST survive the L15 plain-helper extraction. If the test was already inline in `threads.test.ts`, list it explicitly here so the refactor cannot silently drop it. | AC-6 (regression), L1-step9 invariant |
| `TaskCard.visual.test.tsx` | **NEW (W-4).** Renders `TaskCard` at rest AND with `pendingRequest` set; diffs against `packages/design-system/html/TaskCard.html`. Pixel diff ≤ 5% (per `.claude/rules/visual-parity.md`). | AC-2, visual-parity rule |
| `TaskActionsMenu.visual.test.tsx` | **NEW (W-4).** Renders `TaskActionsMenu` open in `accepted`, `in_progress`, `blocked`, `review` states + a `pending` variant; diffs against `packages/design-system/html/TaskActionsMenu.html`. Pixel diff ≤ 5%. | AC-2, visual-parity rule |
| `StatusChip.visual.test.tsx` | **NEW (W-4).** Renders all `Status` variants including `request_pending`; diffs against `packages/design-system/html/StatusChip.html`. Pixel diff ≤ 5%. | AC-2, visual-parity rule |
| `tasks.snooze.test.ts` | (a) POST snooze creates row with `snoozed_until = now + 24h`; (b) DELETE clears it; (c) re-snooze extends, doesn't create duplicate row; (d) cross-user isolation — founder A's snooze doesn't hide the task from founder B. | AC-2 |
| `tasks.list-pending.test.ts` | The list endpoint returns `pendingRequest` and `snoozedUntil` projections per task. Snoozed tasks are filtered when `?include_snoozed=false` (or whatever the contract is). | AC-2 |
| `append-plain-message.test.ts` | The extracted helper emits `thread_message_appended`, runs idempotency (200 same-payload / 409 divergent-payload), runs participant authz (403 non-participant), bumps `lastActiveAt`, inserts inside a transaction — feature parity with the prior inlined plain-type logic at `threads.ts:380–582`. Helper does NOT touch verdict/review/questionnaire branches (compile-time check that the import surface excludes them). | (refactor invariant) |
| `threads.test.ts` | Existing assertions must continue to pass after the refactor. Specifically: (a) plain-type append goes through `appendPlainMessage` (function-mock spy assertion) and returns identical responses to the pre-refactor baseline; (b) verdict-type append still runs the `WHERE resolvedAt IS NULL` rowcount check at the route (NOT delegated to the helper); (c) all existing 4xx/5xx error shapes preserved. | AC-6 (regression) |
| `StatusChip.test.tsx` | `request_pending` renders `↪ PENDING` with `--surface-ghost` background and dashed border. | AC-2 |
| `TaskCard.test.tsx` | (a) `pendingRequest` set → cost slot replaced with `request_pending` chip; (b) clicking the chip calls a separate handler from clicking the card body; (c) `onActivate` fires on card-body click. | AC-2 |
| `TaskActionsMenu.test.tsx` | (a) Renders state-conditional verb subset per § 2.4 matrix; (b) clicking a verb calls `onRequestStateChange(verb)`; (c) Cmd+click opens the Composer modal with reason field; (d) `cancel_request` row appears IFF `task.pendingRequest` is set; (e) letter-shortcut keydown activates the matching item; (f) Esc closes the menu. | AC-2 |
| `Kanban.test.tsx` | (a) Renders 4 columns; (b) tasks land in the right column per `STATE_TO_COLUMN`; (c) `groupByBet` works; (d) the `<DndContext>` is NOT in the rendered tree; (e) no element has `[data-droppable-column]`; (f) no element has `aria-roledescription="draggable"`; (g) `Kanban.tsx` source does NOT import any `@dnd-kit/core` symbol. | AC-1 |
| `Kanban.no-drag.test.tsx` | NEW. Replaces `Kanban.keyboard-drag.test.tsx`. Asserts: pressing arrow/space on a focused TaskCard does NOT begin a pickup. The `aria-pressed` attribute is never set on a TaskCard. No drag listener attaches at the document level after Kanban mounts. | AC-1 |
| `WorkTeam.test.tsx` | (a) Existing tests stay green minus the `COLUMN_TO_STATE` test case; (b) NEW: clicking a verb in the menu posts to `/api/tasks/:id/request`; (c) NEW: `handleMoveTask` is no longer present (compile-time check via re-reading the file). | AC-1, AC-2 |
| `WorkKanban.grouped.test.tsx` | Existing — bet-grouped column rendering stays green. | regression |

### Playwright (E2E)

```ts
[
  "packages/web/e2e/team-board-no-drag.spec.ts",
  "packages/web/e2e/team-board-request.spec.ts",
  "packages/web/e2e/canvas-drag-survives.spec.ts",
]
```

| E2E spec | Required assertions | AC mapping |
|---|---|---|
| `team-board-no-drag.spec.ts` | Open Team Board → drag a task card → DOM column membership unchanged → no `/tasks/:id/transition` network call observed → no `not-allowed` cursor ever appears (per approved R-5). | AC-1, AC-5 |
| `team-board-request.spec.ts` | Open Team Board → click `···` on a task → menu opens → click `Request stop` → toast `Request sent — agent will respond.` → reload → open the task's thread → message `Request stop` is visible in the thread. | AC-2, AC-5 |
| `canvas-drag-survives.spec.ts` | Open Team Board → drag a `shaped` bet on the Canvas → the bet appears in the `committed` column. | AC-3, AC-5 |

---

## 13. Open items the adversary will challenge

- The team-board task fetch endpoint identification (CONFUSION-1 in § 7). Resolution must happen before write-tests.
- The `appendPlainMessage` extraction is a narrower refactor (per branch-enumeration table in § 5.4); must NOT regress the `threads.test.ts` suite (verdict-race regression locked at `threads.verdict-race.test.ts`).
- The `cancel_request` legality check needs a precise definition of "a pending exists": server computes `derivePendingRequest(messages)` lazily on the cancel endpoint (single message-stream query); cheap. Returns **409 already_resolved** (NOT 400) when no pending exists — locked per W-6.
- Mobile bottom-sheet deferral (§ 2.8) needs a follow-up story; flag in `docs/work-packages/follow-ups.md` at impl time.
- Snooze 24h fixed at 24h: do we need a dropdown of durations? **Out of scope per design R-9** (no batch / no power-user knobs). Lock at 24.
- The `request` field in `PlainPayload` is optional; older messages don't carry it. Read-model handlers must handle `request === undefined` correctly. Locked: the `derivePendingRequest` helper checks `payload.request !== undefined && payload.request.verb !== ...`.

---

## 14. Spec reconciliation — every AC has artifacts

| AC | Implementation artifact | Verification artifact |
|---|---|---|
| AC-1 (drag removed) | § 4.1, § 4.2 | V-1a, V-1b, V-1c (Kanban.test.tsx, Kanban.no-drag.test.tsx) + V-1d (E2E) |
| AC-2 (request affordance) | § 3, § 4.3, § 5.4 | V-2a (TaskActionsMenu.test.tsx) + V-2b (tasks.request.test.ts) + V-2c (E2E) |
| AC-3 (Canvas drag survives) | § 4.4 (no Canvas changes) | V-3a (Canvas.test.tsx unchanged) + V-3b (E2E) |
| AC-4 (Vitest tests) | All of phases A–E | All Vitest files in § 12 |
| AC-5 (Playwright e2e) | Phase F | All E2E specs in § 12 |
| AC-6 (CI green) | Phase G | `bun run check`, `bun run lint`, `bun run test` |
| Validation V1 (drag does nothing) | § 4.1 | V-1d |
| Validation V2 (request → message in thread) | § 5.4 | V-2b + V-2c |
| Validation V3 (open thread renders) | § 4.3 (the menu's `Open thread` item) | V-2c (the open-thread leg) |

Every AC + every Validation Scenario from spec § 511–540 has both an implementation row and a verification row. No silent gaps.

---

## 15. Lore to capture

When implementation lands, the following decisions warrant `@lore` comments:

- `packages/shared/src/thread.ts`: "L15 § 2.1: `request` is an optional payload extension on `plain`, NOT a new MessageKind. Concept § 4.5.8 hard rule 5 forecloses new types without a doc update."
- `packages/shared/src/task-pending.ts`: "L15 § 2.2: pending is a read-model derivation, not a write-side field. Single source of truth = the message stream."
- `packages/server/src/routes/tasks.ts` (the new request handler): "L15 § 5.4: this endpoint is a thin convenience wrapper over `appendPlainMessage`; no parallel write path — concept § 4.5.10 rule 1. Verdict/review/questionnaire branches deliberately stay at the threads route (different authz, different race guards)."
- `packages/server/src/services/ensure-task-thread.ts`: "L15 § 5.4 CRITICAL-2: conditional UPDATE WHERE thread_id IS NULL races first-writer-wins; loser deletes its speculative thread row and re-reads the winner's id. Mirrors the `VerdictRaceConflict` rowcount idiom at `threads.ts:510–524`."
- `packages/server/src/services/task-authz.ts`: "L15 § 2.6 CRITICAL-3: `senderId` is opaque (verified `threads.ts:50–56`). Founder bypass is the literal string `u-founder`; non-founder senders must resolve to an `agents.id` whose `team_id` matches `task.team_id`. 404 (not 403) on cross-team attempts — § 10 row 10 anti-information-leak rule."
- `packages/web/src/shell/Kanban.tsx`: "L15 § 4.1: drag is removed. Tasks are agent-team-owned; humans request via TaskActionsMenu. Canvas Shaped→Committed drag survives in `Canvas.tsx` — that's the ONE valid human-owned move (Shape Up shaping)."
- `packages/db/src/schema.ts` (`task_snoozes`): "L15 § 2.5: per-user snooze is sidecar workflow state; not a thread message; not a task-state-machine transition. Hides from board only."

---

**End of plan.** Ready for `/architecture-critique`.
