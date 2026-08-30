# Handoff and Lifecycle Propagation

How work moves between agents (handoff) and how state changes ripple up the primitive hierarchy (propagation). Task and session state machines themselves live in [tasks-and-sessions.md](./tasks-and-sessions.md).

---

## 1. Handoff: the coordination primitive

The 2026 ecosystem converged on handoff as the coordination primitive: an agent has a transfer tool, calls it, and the system tracks the active agent on the task. We adopt this directly, inspired by Google's A2A (Agent-to-Agent) protocol: structured handoff messages with context IDs and explicit task states. We keep it simpler than A2A — no discovery or capability negotiation, because all agents are already known to the system.

No supervisor decides the handoff. The agent closest to the work decides, at runtime — same pattern as LangGraph Swarm or OpenAI Agents SDK handoffs. But the handoff message is structured, not just a string, making it parseable by the receiving agent and auditable by anyone reading the thread.

### 1.1 The wire shape

An agent calls the `handoff_to` tool. The implementation is `handoff()` in `layers/core-api/policy/src/handoff-protocol.ts`.

```ts
// handoff-protocol.ts
interface HandoffMetadata {
  context_id: string;                                        // links handoff to task + thread
  status: "completed" | "failed" | "blocked" | "in_progress"; // what the hander-off reports
  reason: string;                                            // freeform — why the handoff
  artifacts: string[];                                       // file references produced so far
  remaining_work: string[];                                  // structured description of what's left
  error?: string;
}
```

The target is a parameter, not a metadata field: `toAgent` (a specific agent id), `toRole` (e.g. `"builder"`), or `toHuman: true`. Exactly one must be given. The task comes from the session context.

Status meanings:

- `in_progress` — "I made progress but the task isn't done; pick up where I left off."
- `completed` — "My part is done; the next phase needs a different skill."
- `failed` — "I couldn't complete this; here's what went wrong."
- `blocked` — "I can't proceed without input."

### 1.2 One atomic transaction

Every handoff runs as a single DB transaction: end the session (`state: "done"`), transfer task ownership / transition task state, write the structured handoff message to the task's thread, append the task's audit trail, and optionally create an escalation or review item. Events (`task_state_changed`, `item_created`) emit only after commit. A mid-flight failure rolls back everything — session stays active, ownership unchanged, no partial messages or items (`@lore I1`).

The receiving agent starts a session, reads the previous session's notes (synced back by the run-orchestration file watcher), the handoff message, and the task thread, and continues. Thread/message mechanics are owned by [thread-primitive.md](../human-interface-layer/thread-primitive.md).

A handoff does not emit `session_ended` — cost-outcome subscribers must not fire on it.

### 1.3 Role handoff is system-resolved

When `toRole` is given, the system resolves it: `handoff-protocol.ts` queries `users.role` for an available agent with that role. If none is available, it creates an escalation item to a human ("No available &lt;role&gt; agent"). No facilitator or Product Manager sits in the loop.

### 1.4 Handoff to a human

`toHuman: true` transitions the task to `blocked` (in-transaction, audited) and creates a review thread plus a review item. When the human replies, `blocked → in_progress` is a legal transition and the agent starts a new session. Handoff to a human is the same shape as handoff to an agent — a structured message and a state change. Humans are identities like everyone else.

### 1.5 Handoff between tasks

When a task completes and it was the last upstream dependency of a downstream task in `hold`, the Dependency Watcher (`layers/core-api/work/src/dependency-watcher.ts`) auto-transitions the downstream task `hold → accepted` and notifies its owner. No central scheduler decides when to unblock — the state machine handles it. Task completion does **not** synthesize a handoff message; handoff messages exist only on explicit `handoff_to` calls.

### 1.6 Handoff is not workflow

Workflow engines wire transitions in advance. Handoff is decided at runtime by the agent that's closest to the work. The thread plus structured handoff messages are what make this safe: the entire history of who handed off what to whom, with what status and artifacts, is preserved and readable by any participant.

---

## 2. Lifecycle propagation

The DB-backed primitives form a hierarchy. A task tree is recursive — a root task (no parent) may contain subtasks, which may contain further subtasks, to any depth:

```
team
  └── task (root — no parentTaskId)
        ├── subtask
        │     └── subtask ...
        └── session
```

Lifecycle events propagate **upward**, via EventBus handlers registered by `registerLifecyclePropagation` (`layers/core-api/policy/src/lifecycle-propagation.ts`). Team status is derived on read — no write-time propagation at that level.

The system is done-when-done: no cycles, no sprints, no artificial deadlines. Work flows forward through states; reversals are intentional exceptions. Capacity limits are owned by [wip-and-cost-limits.md](./wip-and-cost-limits.md).

### 2.1 Session → Task (automatic)

| Session event | Condition | Task effect |
|---|---|---|
| Session ends with `outcome=completed` | Task is `in_progress` AND has no other active sessions | Task transitions to `review` |
| Session ends with `outcome=completed` | Task has other active sessions still running | No transition — last completer triggers |
| Session ends with `outcome=crashed` | Any | Task stays `in_progress` — agent can retry |
| Session ends with `outcome=stopped` | Any | Task stays `in_progress` — human-stopped, may resume |

A completed session means the agent believes the work is done; `review` is the natural next step. A crash or stop never auto-transitions, because the work may need retry.

### 2.2 Task → parent task (automatic, recursive walk)

When **all children** of a task reach a terminal state (`done` or `killed`) and the parent is `in_progress`, the parent transitions to `review` — same as the session→task rule. The walk continues upward: if that parent's own parent then satisfies the same condition, it propagates again, until the root is reached or a parent still has non-terminal children.

The transition is CAS-guarded and appends an entry to the parent's `auditTrail` authored by `system:propagation`. There is no human gate on this transition; it mirrors the Session → Task path.

After a root task (no `parentTaskId`) completes, a `task_state_changed` event fires with the new state. Routines listening on that event — such as the `post-task-retro` routine from the knowledge-management plugin — can pick it up and fire. See [routines-and-retros.md](./routines-and-retros.md).

### 2.3 Task → Team (derived on read)

Team status is computed from team state and in-progress task counts on every read (`deriveTeamStatus`, `layers/core-api/src/routes/teams-routes.ts`). Portfolio counters are also computed per request from the same data. No write-time propagation at this level.

### 2.4 Retry contract

Every propagation attempt is logged to `propagation_log`:

1. Success → `status = "applied"`.
2. Skipped (e.g. task already in review, race) → `status = "skipped"`.
3. Transient failure → `status = "pending_retry"`.
4. A 30-second heartbeat retries `pending_retry` rows (`lifecycle-propagation.ts`). Retries resolve the **original** row in place — never a parallel row (AF7).
5. After 3 failed attempts (`MAX_RETRY_ATTEMPTS`, `lifecycle-propagation.ts`) → `status = "failed"` (CAS-guarded so a since-succeeded row is never flipped) plus a `notification_queue` entry with `severity = "warning"`, `eventType = "propagation_exhausted"`.

Nothing is silently dropped; every attempt is observable.

### 2.5 Race handling

If a human manually transitions a task while propagation fires, the resulting `InvalidTransitionError` is caught and logged as `skipped` (not `failed`), with no retry. Human intent wins.

### 2.6 Propagation log

`propagation_log` is infrastructure, not UI — the user sees status chips change, not the mechanism. Terminal rows (`applied`/`skipped`) are TTL-swept on a retention schedule.

Lifecycle propagation does not drive the task state machine itself — it calls the work service through an injected port (`transitionTaskState`), so the transition transaction boundary stays owned in one place. What may cross which boundary is enforced, not described here; see `tools/governance/README.md`.

---

## 3. Settled boundaries

- **No platform team.** There is no separate platform team, and cross-team tasks are not modelled. HyperIdle itself is a product, developed by a product team using HyperIdle — dogfooding its own framework. Teams have end-to-end ownership; there is no "platform exception" to it.
- **No trajectory thresholds.** The Product Manager senses task trajectory by reading task comments and notes — no hardcoded signal set, no numerical thresholds. Analytics (cost burn slope, blocker frequency) can layer in later once the base system has run.

---

## Cross-references

- [tasks-and-sessions.md](./tasks-and-sessions.md) — task/session state machines, hold vs blocked, session notes.
- [the-four-primitives.md](./the-four-primitives.md) — the hierarchy itself.
- [routines-and-retros.md](./routines-and-retros.md) — post-task-retro and the plugin routine system.
- [thread-primitive.md](../human-interface-layer/thread-primitive.md) — thread/message shapes handoffs write into.
- [review-primitive.md](../human-interface-layer/review-primitive.md) — escalation/review-item surface.
