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
- `in_progress → review` or `→ done` — session ends; `review` when any `doneWhen` line has `by:"review"`, else `done`.
- `done → killed` — only terminal edge; killing is always a subtree operation.

## Dependencies

`tasks.dependencies` is a JSON array of task ids. A task is born `proposed`; if it has unmet dependencies it is moved to `hold`. The dependency watcher (`checkAndUnblockDependents`, `layers/core-api/task/src/dependency-watcher.ts`) runs on every `task.changed` event: when all deps of a `hold` task are `done`, it calls `edit_task({ id, state: "accepted" })`. No notification is sent — the transition is the event. A killed dependency is dropped from dependents that carried it; those still in `hold` return to `proposed`.

A cycle, a self-dependency, or a dependency on a non-existent task is refused at the time it is set.

## Finishing: done by default, review when requested

`tasks.doneWhen` is a JSON array of `DoneWhenLine` objects. Each line has an `id`, a `what` description, a `by` field (`"check"` or `"review"`), a `state` (`"open"`, `"met"`, or `"failed"`), and an optional `how`.

| Event | No `by:"review"` line | At least one `by:"review"` line |
|---|---|---|
| Session on task ends (`completed` outcome) | task → `done` | task → `review` |
| All children reach terminal state | parent → `done` | parent → `review` |

With most tasks going straight to `done`, completion cascades up the tree automatically. A task with a `by:"review"` line is where the chain stops until a person acts.

`tasks.reasons` is a JSON array of `Reason` objects — decisions and assumptions the task records. Each reason has a `kind` (`"decision"` or `"assumption"`), a `what`, a `state` (decision: `"made"` or `"waiting"`; assumption: `"held"`, `"open"`, or `"broke"`), and an optional `why`.

Code: `layers/core-api/policy/src/lifecycle-propagation.ts`.

## Upward propagation

When a task reaches `done` or `killed`, `propagateTaskToParent` walks up the ancestor chain. At each level it checks whether all direct children are terminal. If yes, it transitions that ancestor (`done` or `review` depending on whether it has a `by:"review"` line in its `doneWhen`). The cascade continues upward until it reaches a `review`, terminal, or non-all-terminal ancestor.

A race (two children finishing at once) produces an `InvalidTransitionError` from the second one — swallowed silently. The first finisher wins.

## Ship-confirmation message

When a root task (`parentTaskId = null`) auto-completes, `system:propagation` posts a review message ("Confirm shipping?") into the task's thread. Idempotent: the `clientKey` is stable so a retriggered event posts the same message, not a second one.

Code: `createShipConfirmationThread`, `lifecycle-propagation.ts`.

## Handoff

Setting `ownerAgentId` on an `accepted` or `in_progress` task is a handoff. The previous owner's session ends, a new `task_dispatch_attempts` row with `occasion: "owner_handoff"` is inserted, and the new agent's run begins. Code: `task-actions.ts`.

## Hold and stop

A person pauses a task with `edit_task({ id, paused })`. `paused` is set on the task and on every part of it not done; the state stays as it was, so nothing is undone.

- `"hold"` — the agents finish what they are doing, then wait. Nothing new starts in the subtree: moving a paused task to `accepted` is refused (`paused`), so the dependency watcher leaves its waiting parts in `hold`. A new part made under a paused task is paused with it.
- `"stopped"` — the same, and the running sessions of the task and its subtree stop at once.
- `null` — lifts it. Every waiting part whose dependencies are all `done` is accepted. After a stop, each leaf still `in_progress` that waits on nobody's answer or review gets a `task_dispatch_attempts` row with `occasion: "restart"`, so its agent picks up where it stopped. A restart may happen once per stop, so it is left out of the one-dispatch-per-occasion index.

A finished task cannot be paused (`paused_closed`). Stop is not kill: `killed` is terminal; a stopped task starts again.

## Kill

Moving a task to `killed` via `edit_task` kills every task beneath it in the same transaction, and stops their running sessions. Kill never travels up. A kill is not a completion — propagation ignores killed subtrees.

## Outcome verdict

When a task reaches `review`, a human may record an outcome. Four values: `met`, `met_with_rework`, `partially_met`, `not_met`. Stored in `outcomeVerdict` + `outcomeSummary`. Not set automatically — always explicit.

## Description

`tasks.description` says what the task is after. `descriptionFormat` is `markdown`, or `html` to make it an app: one whole page that shows what the task is trying to do. The task page shows an app description as a card that opens beside the task; its parts, done when, decisions and assumptions stay as they are.

## Notes

`tasks.notes` is only written via `edit_task({ appendNote })` — atomic append. It is not written by sessions; sessions write `sessions.notes`.

## Source document

`tasks.sourceDocumentId` points at the document a task was promoted from. It is set by `edit_task({ sourceDocumentId })`; the app does not set it.

## Token rollup

`tasks.tokensActualJson` is a JSON string of per-tier token counts, merged by the session-end handler and written back via `edit_task({ tokensActualJson })`. The app does not show it.

## Derived need

`task.need` is a derived, never-stored field computed at read time from the task's state, thread messages, and reasons. It signals what kind of human attention the task requires right now.

| Value | When |
|---|---|
| `"stuck"` | `state === "blocked"` |
| `"input"` | An unresolved `questionnaire` message in the thread, OR a `decision` reason with `state: "waiting"` — unless the thread has questions and every one is answered |
| `"review"` | An unresolved `review` message in the thread, OR `state === "review"` with no review message in the thread yet |
| `null` | None of the above |

Precedence (highest first): `stuck > input > review > null`.

Once every question is answered and every review decided, nothing waits on a person: the agent has the task back, even before it records the decision or leaves the `review` state.

Both `search_tasks` and `open_task` return `need` on every task item. `open_task` also returns `openBelow: { input: number, review: number }` on each `TaskNode` in the `children` subtree, counting descendants (not the node itself) whose need is `input` or `review` respectively. The opened task itself carries the same count for everything below it as `openBelow` at the top of the view. Work stays live through two WebSocket topics: `tasks` is nudged on any task change, and `task:<id>` on a change to that task, to any task below it, or a message in its thread.

Source: `framework/domain-model/src/actions/task-need.ts` (pure logic), `layers/core-api/task/src/task-actions.ts` (wiring and batch message fetch).
