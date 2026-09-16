# Handoff and Lifecycle Propagation

How work moves between agents (handoff) and how state changes ripple up the primitive hierarchy (propagation). Task and session state machines themselves live in [tasks-and-sessions.md](./tasks-and-sessions.md).

---

## 1. Handoff: an edit, not a protocol

Handoff used to be its own mechanism — a dedicated tool, a structured message shape, a CAS transaction, an escalation thread. It no longer is. **Handing a task to another user is an ordinary `edit_task` call that sets `ownerAgentId`** (`layers/core-api/task/src/task-actions.ts`). The caller names a user id directly; there is no role-resolution or human-escalation step, and no separate wire shape to document — `edit_task`'s own input and its `changes` row are the whole record.

The agent closest to the work still decides, at runtime — no supervisor approves a handoff. What changed is the mechanism, not who decides.

### 1.1 What happens on a handoff

Setting `ownerAgentId` to an agent, on a task that is `accepted` or `in_progress`, is what makes an edit a handoff (as opposed to an ordinary field change). Inside the edit's own transaction: the task row updates, one `changes` row records the before/after owner, and — because the task is already dispatched — a second `taskDispatchAttempts` row is inserted with `occasion: "owner_handoff"`, carrying the predecessor's live session id. After commit: the predecessor's session ends (`endRunForHandoff`), the old `task_state_changed` event fires if the state also changed, and the new owner's session starts (`submitWorkIntent`) — the same two calls an ordinary accept makes, reached by a second condition. Nothing about the re-dispatch is new; only the trigger and the record are.

A handoff to a human is the same call with a human user id — there is no `toHuman` flag, no separate review thread, and no escalation item. The person sees the ownership change and the message the caller posts to the task's thread, the same way any other owner change would surface.

### 1.2 What is gone, deliberately

Role-targeted handoff (`toRole`) and escalation-on-no-agent-available are gone — the caller names a person, not a role, and a failed lookup is the caller's problem, not the mechanism's. The dedicated `session_handoff_completed` event and the audit-trail `handoff` entry are gone with `tasks.audit_trail` itself; the `changes` row is the record now. The predecessor's run ending is not self-repairing today: a handed-off run left `active` stays `active` if the end call fails, a known and accepted limit.

### 1.3 Handoff between tasks

Unrelated to owner handoff: when a task completes and it was the last upstream dependency of a downstream task in `hold`, the Dependency Watcher (`layers/core-api/task/src/dependency-watcher.ts`) auto-transitions the downstream task `hold → accepted` and notifies its owner, via its own `edit_task` call. No central scheduler decides when to unblock — the state machine handles it.

### 1.4 Handoff is not workflow

Workflow engines wire transitions in advance. A handoff is decided at runtime by the agent closest to the work, and it is one field on one edit — not a separate primitive with its own lifecycle.

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

The transition is guarded and appends a `changes` row authored by `system:propagation`. There is no human gate on this transition; it mirrors the Session → Task path.

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

If a human manually transitions a task while propagation fires, `edit_task` returns a refused-transition problem instead of throwing; propagation catches it and logs `skipped` (not `failed`), with no retry. Human intent wins.

### 2.6 Propagation log

`propagation_log` is infrastructure, not UI — the user sees status chips change, not the mechanism. Terminal rows (`applied`/`skipped`) are TTL-swept on a retention schedule.

Lifecycle propagation does not drive the task state machine itself — it calls `edit_task`, injected as one function, as `system:propagation`, so the transition transaction boundary stays owned in the task module. What may cross which boundary is enforced, not described here; see `tools/governance/README.md`.

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
