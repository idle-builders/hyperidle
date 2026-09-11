# BA6 — Tasks wait for the tasks they depend on, then start themselves

## What we need

**Outcome.** A task can be declared to depend on other tasks. While any of them are unfinished it waits
instead of being picked up. When the last one finishes, it stops waiting and, if an agent owns it,
starts.

**Why this matters.** Work that has an order is currently held only in someone's head, so agents pick up
tasks whose prerequisites are not done and produce work that has to be thrown away. Sequencing that
enforces itself is what makes a set of tasks a plan rather than a list.

**Where it started.** `tasks.dependencies` (a JSON-array TEXT column) and the `done` watcher already
existed. `PATCH /api/tasks/:id` already wrote the field — unvalidated, unparked, and reachable from no UI
control or agent tool. Accepting a task never read it, and `proposed → hold` was not a legal edge, so the
waiting chain had no entrance.

**Constraints.**
- A dependency cycle must be rejected when it is created. A cycle that is accepted parks every task in
  it forever, which is worse than refusing it.
- Unowned tasks must still stop at accepted and wait for a human. Automatic progression applies only to
  tasks an agent owns.
- Reuse the existing waiting → accepted → in-progress chain. Do not add a direct waiting → in-progress
  transition.

**Out of scope.** Reintroducing automatic decomposition of a bet into tasks. Visualising the dependency
tree beyond what is needed to set and see dependencies. Emitting `dependency_met` — BA8 owns it.

## Acceptance criteria

- A task can be given dependencies when it is created and when it is edited, by a human and by an agent.
- A task with unfinished dependencies is not picked up for work.
- When a task's last dependency finishes, the task stops waiting; if an agent owns it, it moves into
  progress without human action.
- When a task's last dependency finishes and no agent owns it, it waits for a human rather than starting.
- An attempt to create a dependency cycle is refused, and the person or agent attempting it is told why.

## How it works

**Setting dependencies.** `POST /tasks` and `PATCH /tasks/:id` both take a list of task ids and validate
it inside the write's transaction: every id must exist (404), a task may not depend on itself, the graph
may not cycle (409 `TASK_CYCLE`), and no dependency may be a `killed` task, because it can never finish
(409 `TASK_DEPENDENCY_KILLED`). Depending on a `done` task is legal and does not park. A dependency may
point at any task in any tree; cycle rejection is what keeps that safe.

**Waiting.** `hold` is the one waiting state, for any kind of wait. A valid write naming an unfinished
dependency moves the task to `hold`; `proposed → hold` was added as the chain's entrance.

**Not picked up.** Parking is the visible half; `transitionTask` is the enforcing half. While a task has
an unfinished dependency it refuses `→ accepted` from anywhere, and `→ in_progress` from every state
except `blocked` (409 `TASK_DEPENDENCY_BLOCKED`). `blocked` is exempt because its only predecessor is
`in_progress` — a blocked task was genuinely picked up, so resuming it is not a pick-up. `review` is not
exempt: it is reachable from `hold`. A test pins `blocked`'s single predecessor; changing the transition
table there means revisiting this guard.

**Being freed.** The last dependency reaching `done` moves the task `hold → accepted` (the existing
watcher). A dependency being **killed** drops its id from every dependent in any state, and returns the
dependents that were waiting in `hold` to `proposed` for re-planning — the premise they were planned
under is gone. This runs synchronously inside `cascadeTaskKill`, the only production route to `killed`.

**Starting.** Unchanged: `accepted` with an agent owner dispatches, `session_started` promotes to
`in_progress`, an unowned task stops at `accepted` for a human.

**Being told why.** The UI patch hook surfaces the server's message; the agent seam carries the error
code so `edit_task` returns a structured `err(code, message)` instead of throwing.

**Finding the task.** You type part of a title and pick from the results; the chip shows the title. The
picker is the design system's `Combobox` (generalized from `RoleCombobox`, which the agent editor also
uses) in search-driven mode, with full keyboard navigation. Arrow keys and Enter do nothing while results
load, so a result from the previous query can never be picked, and a failed search can be retried. The
picker's search (`GET /api/tasks?q=`) searches every depth and opts out of killed tasks; global search
still returns them. The server guards the door regardless of the picker.

## How we work on this

**Dials.** complexity: feature · ambiguity: established context · exposure: user-facing surface.

**Maintainer rulings.** `hold` is the single waiting state. A killed dependency sends its dependents back
to be refined, not freed to start. No restriction on which tasks may depend on which — simplest wins.
At the 2026-09-10 gate: pasting a task id is not acceptable, searching a task must be possible; and
harnesses only run through the desktop app, so the agent-owned proof runs on the packaged build.
On 2026-09-11: search-and-pick must reuse the design system (a combobox already existed); the web
version runs only remote harnesses by design, so the desktop build is the only local test and a failing
desktop build means the change broke it; the desktop database is demo data, to delete rather than keep.

**Gate and review.** One gate before shipping, on the running app. A fresh agent reviews the integrated
diff, and again over each scope-bearing change.

## Accepted limitations

- `POST /api/sessions` checks only that the task exists, not its state or dependencies. No UI reaches it,
  and the task's state still cannot change, but "not picked up" is enforced at the state label rather
  than at session admission.
- A parked task can still be marked `done` (`hold → done` is legal, and lifecycle propagation can drive a
  `hold` parent to `done`), which frees its own dependents. Dependencies are not transitive.
- The cycle check and the kill cleanup read without row locks, so two conflicting simultaneous writes
  can both pass — the same founder-accepted limit as the parent-tree `assertNoCycle`.
- Clearing the field stores `"[]"` rather than `null`; duplicate ids are stored as given.
- A write that changes `state` and `dependencies` together does not park; the guard still stops pick-up.
- A dangling-id refusal on create shows the generic error; cycle and killed refusals show the reason.
- `create_task` does not catch the seam error the way `edit_task` does; only a dangling id reaches it.
- Clicking outside or tabbing away does not close the dependency dropdown — the same as every combobox on
  `main`.
