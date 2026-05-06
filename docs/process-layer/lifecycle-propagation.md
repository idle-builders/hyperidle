# Lifecycle Propagation Across the Five Levels

## Overview

HyperIdle's five primitives form a hierarchy:

```
portfolio
  └── product
        └── bet
              └── task
                    └── session
```

Lifecycle events propagate **upward** through this hierarchy. A session ending can affect its task. A task completing can affect its bet. A bet shipping affects the product status. The portfolio reflects everything in real time.

---

## The Kanban Principle

The system is kanban-like: **done when done**. No cycles, no sprints, no artificial deadlines. WIP limits (via team capacity) create sparsity. Work flows forward through states; reversals are intentional exceptions, not the norm.

---

## Propagation Rules by Level

### Session → Task (automatic)

| Session event | Condition | Task effect |
|---|---|---|
| Session ends with `outcome=completed` | Task has no other active sessions AND task state is `in_progress` | Task transitions to `review` |
| Session ends with `outcome=crashed` | Any | Task stays `in_progress` — agent can retry |
| Session ends with `outcome=stopped` | Any | Task stays `in_progress` — human-stopped, may resume |
| Session ends with `outcome=completed` | Task has other active sessions still running | No transition — wait for all sessions |

**Rationale:** A completed session means the agent believes the work is done. Moving to `review` is the natural next step. A crash or stop does NOT auto-transition because the work may need retry. Multiple active sessions (parallel work on a single task) must all complete before transition.

### Task → Bet (automatic check, shipped requires confirmation)

| Task event | Condition | Bet effect |
|---|---|---|
| Task transitions to `done` | All tasks on the bet are `done` or `killed` | Bet transitions to `review` (automatic) |
| Task transitions to `done` | Some tasks are still open | No transition |
| Task transitions to `killed` | All remaining tasks are `done` or `killed` | Bet transitions to `review` (automatic) |
| Bet enters `review` | User confirms via review thread | Bet transitions to `shipped` (requires human confirmation) |

**Rationale:** When all tasks complete, the bet enters `review`. The shipped transition requires human confirmation per the process-layer spec: "A bet ships when its done condition is met AND its high-risk artifacts have passed review." The system cannot evaluate the done condition — only the human can confirm it was met.

### Bet → Product (automatic, derived on read)

| Bet event | Product effect |
|---|---|
| Bet transitions to `shipped` | Product status recalculates on next read |
| Bet transitions to `killed` | Product's `activeBets` counter decrements |
| Bet transitions to `committed` | Product's `activeBets` counter increments |

**Rationale:** Product status is **derived, not stored**. `deriveProductStatus` computes it from team state and active bet states on every read. No write-time propagation needed — the existing read-time derivation already works.

### Product → Portfolio (automatic, derived on read)

Portfolio counters (ship rate, progress, active bet counts) are computed from real data on each request. No write-time propagation needed.

---

## Summary: Automatic vs. Human Confirmation

| Transition | Mode |
|---|---|
| Session ended → task to review | Automatic |
| Task done → bet to review | Automatic |
| Bet review → bet shipped | Human confirmation (review thread) |
| Bet shipped/killed → product status | Automatic (derived on read) |
| Product change → portfolio | Automatic (derived on read) |

**Only ONE transition requires human confirmation** — this satisfies the simplicity bias of the system.

---

## Retry Contract

Failed propagations are logged to `propagation_log` and retried:

1. Every propagation attempt creates a `propagation_log` entry.
2. If the propagation succeeds: `status = "applied"`.
3. If the propagation is skipped (e.g., task already in review, race condition): `status = "skipped"`.
4. If the propagation fails with a transient error: `status = "pending_retry"`.
5. A heartbeat (30-second interval) retries `pending_retry` rows.
6. After 3 failed attempts: `status = "failed"`, a notification queue entry is created with `severity = "warning"`.

**Nothing is silently dropped.** Every propagation attempt is observable.

---

## Race Condition Handling

The propagation engine handles concurrent modifications gracefully:

- **Task race:** If a human manually transitions a task while propagation fires, `InvalidTransitionError` is caught and logged as `status = "skipped"` (not "failed"). The bet was already moved intentionally — no retry needed.
- **Bet race:** Same pattern — if the bet is manually killed while propagation tries to move it to `review`, the `InvalidTransitionError` is caught and logged as `skipped`.

This is correct behavior: the human intent takes precedence.

---

## Ship-Confirmation Review Thread

When all tasks on a bet complete and the bet auto-transitions to `review`, the propagation engine creates a review thread:

- `hostKind = "bet"`, `hostId = <betId>`
- Message type: `"review"` with payload `{ kind: "ship_confirmation", ... }`
- Sender: `"system:propagation"` (a seeded system agent)
- Participants: `["system:propagation", "u-founder"]`

The founder reviews this thread and approves (or rejects) shipping. Approval triggers `bet → shipped` via the existing verdict mechanism in the Conversations view.

---

## Propagation Log

The `propagation_log` table records every propagation attempt. It is infrastructure — not surfaced in the UI. The user sees the **result** of propagation (status chips changing), not the mechanism.

**Note:** The propagation log has no retention policy. Rows accumulate indefinitely. At current expected volumes (~10 propagations/day) a year's worth is ~3,650 rows — negligible. A follow-up story should add a TTL sweep if volumes increase significantly.

---

## Cross-References

- **Sessions and tasks:** See [tasks-and-sessions.md](./tasks-and-sessions.md) — session completion can trigger task state changes.
- **Task lifecycle:** See [task-lifecycle.md](./task-lifecycle.md) — task completion triggers bet state changes.
- **Bet lifecycle:** See [bets-shape-commit-change-ship.md](./bets-shape-commit-change-ship.md) — the `review → shipped` transition requires founder approval.
- **The five primitives overview:** See [the-five-primitives.md](./the-five-primitives.md).
