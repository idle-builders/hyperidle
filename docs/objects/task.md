# Task

A task is a unit of work. Tasks form a tree via `parentTaskId`; a root task has no parent. Every task has a thread (`tasks.threadId NOT NULL`, team-hosted).

Source: `framework/domain-model/src/actions/task.ts`, `framework/domain-model/src/types.ts`, `layers/core-api/task/src/`.

## States

Eight states, declared in `TASK_STATES` (`types.ts`):

| State | Meaning |
|---|---|
| `proposed` | Drafted, not yet picked up |
| `accepted` | Owner committed; dispatch attempt queued |
| `hold` | Waiting — for a dependency or by hand |
| `in_progress` | At least one session has run |
| `blocked` | Owner hit something it cannot resolve alone |
| `review` | Awaiting a human verdict |
| `done` | Finished |
| `killed` | Abandoned |

`done` and `review` are legal targets from every non-terminal state. That lets the auto-completion cascade reach any ancestor, even one that was never personally worked.

## Transitions

Full transition map in `TASK_STATE_TRANSITIONS` (`actions/task.ts`). Key edges:

- `proposed → hold` — entering the dependency-wait chain.
- `hold → accepted` — dependency watcher fires when all deps are `done`.
- `hold → proposed` — a dependency was killed; the task returns for re-planning.
- `in_progress → review` or `→ done` — session ends, governed by `needsReview`.
- `done → killed` — only terminal edge; killing is always a subtree operation.

## Dependencies

`tasks.dependencies` is a JSON array of task ids. A task is born `proposed`; if it has unmet dependencies it is moved to `hold`. The dependency watcher (`checkAndUnblockDependents`, `layers/core-api/task/src/dependency-watcher.ts`) runs on every `task.changed` event: when all deps of a `hold` task are `done`, it calls `edit_task({ id, state: "accepted" })`. No notification is sent — the transition is the event. A killed dependency is dropped from dependents that carried it; those still in `hold` return to `proposed`.

A cycle, a self-dependency, or a dependency on a non-existent task is refused at the time it is set.

## Finishing: done by default, review on request

`tasks.needsReview` (boolean, default `false`) decides where a task goes when its work ends.

| Event | `needsReview = false` | `needsReview = true` |
|---|---|---|
| Session on task ends (`completed` outcome) | task → `done` | task → `review` |
| All children reach terminal state | parent → `done` | parent → `review` |

With most tasks going straight to `done`, completion cascades up the tree automatically. A task with `needsReview = true` is where the chain stops until a person acts.

Code: `layers/core-api/policy/src/lifecycle-propagation.ts`.

## Upward propagation

When a task reaches `done` or `killed`, `propagateTaskToParent` walks up the ancestor chain. At each level it checks whether all direct children are terminal. If yes, it transitions that ancestor (`done` or `review` per its own `needsReview`). The cascade continues upward until it reaches a `review`, terminal, or non-all-terminal ancestor.

A race (two children finishing at once) produces an `InvalidTransitionError` from the second one — swallowed silently. The first finisher wins.

## Ship-confirmation message

When a root task (`parentTaskId = null`) auto-completes, `system:propagation` posts a review message ("Confirm shipping?") into the task's thread. Idempotent: the `clientKey` is stable so a retriggered event posts the same message, not a second one.

Code: `createShipConfirmationThread`, `lifecycle-propagation.ts`.

## Handoff

Setting `ownerAgentId` on an `accepted` or `in_progress` task is a handoff. The previous owner's session ends, a new `task_dispatch_attempts` row with `occasion: "owner_handoff"` is inserted, and the new agent's run begins. Code: `task-actions.ts`.

## Kill

Moving a task to `killed` via `edit_task` kills every task beneath it in the same transaction, and stops their running sessions. Kill never travels up. A kill is not a completion — propagation ignores killed subtrees.

## Outcome verdict

When a task reaches `review`, a human may record an outcome. Four values: `met`, `met_with_rework`, `partially_met`, `not_met`. Stored in `outcomeVerdict` + `outcomeSummary`. Not set automatically — always explicit.

## Notes

`tasks.notes` is only written via `edit_task({ appendNote })` — atomic append. It is not written by sessions; sessions write `sessions.notes`.

## Source document

`tasks.sourceDocumentId` points at the document a task was promoted from. The promotion is done in `DocumentDetail.tsx`; the field is set by `edit_task({ sourceDocumentId })`.

## Token rollup

`tasks.tokensActualJson` is a JSON string of per-tier token counts, merged by the session-end handler and written back via `edit_task({ tokensActualJson })`. Displayed as a rollup on the task page.
