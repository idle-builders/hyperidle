# L15 — Concept brief (no new noun introduced)

## Verdict
L15 introduces **no new primitive**. It removes a verb (`drag-to-move-task`) and replaces it with a thin UI affordance over two existing primitives:

1. **Thread** — L1 `docs/concept/HUMAN_INTERFACE_LAYER.md` §4.5; SHARED.md "Thread primitive" entry. Already implemented (`packages/shared/src/thread.ts`, `packages/server/src/routes/threads.ts`).
2. **Task** — already a host-kind in the closed enum (`HOST_KINDS = […, "task", …]`).

The "request a state change" affordance is **a `plain` Message appended to a Thread whose `(hostKind, hostId) = ("task", task.id)`**. This is the existing message dispatch — no new `MessageType`, no new host kind, no schema change.

## Why this is not a new noun
- "Request a state change" reads like a domain operation but is **prose written by a human in a thread message**. Agents read the thread; agents decide. There is no enum, no command bus, no separate "task-change-request" entity. Adding one would violate Search Before Building and inflate the message-type closed enum (L1 §4.5: "adding a type requires concept-doc update first").
- The state-change "intent" lives in the message text (or a structured `payload.refs` inline reference to the desired state, rendered as a chip). The agent honoring the request emits the actual state transition through the existing task state machine (`packages/server/src/services/task-state-machine.ts`). The thread captures the audit trail per HIL §4.5.10 ("threads are the source of truth for the conversation history").
- This is the founder direction made concrete: **humans request, agents decide**. A typed "request" entity would be a command, not a request.

## Affordances reused (no new design system component required for the surface itself)
- `TaskCard` (design-system) already accepts an `actions: ReactNode` slot (`packages/design-system/src/TaskCard.tsx:13`). The L15 affordance lands here.
- `BlockActionsPopover` (design-system) is the canonical right-anchored menu primitive (`role=menu`, items `role=menuitem`, Escape closes). The "Request state change / Open thread" menu reuses its shape (the designer call in Mode 2 is whether to reuse the exact component or extend `actions` with a smaller pattern — the budget is 19 components, this is the cap-respecting move).
- Thread navigation pattern: `useNavigate("/conversations/<thread-id>")` mirrors Rail/AppShell conversation routing.

## Concept boundary the story must respect
- **Drag is a human-owned move only between Shaped → Committed on the Canvas** (Shape Up shaping; Canvas already implements this via `onMoveBet(betId, "shaped" | "committed")`). All other drag is removed.
- **Tasks are agent-team-owned.** Humans never directly mutate `task.state` from the Kanban. The only path from human-input to state-change is `human → thread message → agent reads → agent calls task-state-machine`.
- **No new host-kind, no new message-type.** The thread is host=`task`. The message is type=`plain` carrying a structured-but-prose payload (text + optional inline ref to the desired state).

## Open question deferred to Mode 2
- Whether the menu offers a structured "select target state" sub-action (chips: `blocked`, `in_progress`, `done`, `hold`, `kill`) or a free-text composer-only path. **Both produce the same `plain` message**; the difference is purely UI ergonomics. Mode 2 decides.

## What L15 does NOT need
- No DB migration.
- No new shared types.
- No new server route (the thread-create + thread-message-append endpoints in `packages/server/src/routes/threads.ts` cover the entire backend path).
- No new event type (`thread_message_appended` already emitted).

## Cross-references
- HIL §4.5 Thread primitive (host kinds, message types, immutability)
- HIL §4.5.10 Thread vs Item/Response (threads are source of truth)
- SHARED.md "Thread primitive" entry
- L1 plan / approved.md (already shipped; threads + messages tables exist)
- L18 (deferred — "Thread primitive attached to bets, tasks, knowledge, artifacts") will deepen the task-detail thread surface; L15 is the **first consumer** of task-attached threads from the Team Board.

**Mode 1 outcome:** no concept work needed; reuse L1 primitives. Proceed to Mode 2.
