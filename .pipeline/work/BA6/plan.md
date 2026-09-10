# BA6 — Tasks wait for the tasks they depend on, then start themselves

## What we need

**Outcome.** A task can be declared to depend on other tasks. While any of them are unfinished it waits
instead of being picked up. When the last one finishes, it stops waiting and, if an agent owns it,
starts.

**Why this matters.** Work that has an order is currently held only in someone's head, so agents pick up
tasks whose prerequisites are not done and produce work that has to be thrown away. Sequencing that
enforces itself is what makes a set of tasks a plan rather than a list.

**What exists today** (verified against the code 2026-09-09, correcting the registration seed):
- The column exists: `tasks.dependencies`, a nullable TEXT holding a JSON array of task ids, present
  since the first migration. No join table, no foreign key, no shape validation.
- The watcher exists and works: `checkAndUnblockDependents` fires on `task_state_changed` to `done`,
  finds `hold` tasks whose `dependencies` text contains the finished id, and moves them to `accepted`
  once every dependency is `done`.
- A writer exists but is unreachable and unvalidated: `PATCH /api/tasks/:id` accepts `dependencies` and
  writes it verbatim — no shape check, no existence check, no cycle check — and does not park the task.
  No UI control and no agent tool exposes the field. `POST /tasks` rejects it outright. So the seed's
  "nothing writes dependencies" is nearly true in effect, but the door is already open and unguarded.
- Accepting a task never reads dependencies: `transitionTask` checks team capacity, then dispatches.
- The chain is as described — `hold → accepted`, then a reaction to `session_started` promotes
  agent-owned tasks to `in_progress`, correctly leaving unowned tasks at `accepted` for a human.
- **The chain cannot be entered.** A task is born `proposed`, and `proposed → hold` is not a legal edge.

**Missing delta.** Give dependencies a validated, reachable writer; get a task with unfinished
dependencies into the waiting state and keep it from being picked up; let the existing chain carry a
freed task into progress.

**Constraints.**
- A dependency cycle must be rejected when it is created. A cycle that is accepted parks every task in
  it forever, which is worse than refusing it.
- Unowned tasks must still stop at accepted and wait for a human. Automatic progression applies only to
  tasks an agent owns.
- Reuse the existing waiting → accepted → in-progress chain. Do not add a direct waiting → in-progress
  transition.

**Out of scope.** Reintroducing automatic decomposition of a bet into tasks. Visualising the dependency
tree beyond what is needed to set and see dependencies. Emitting `dependency_met` — the event type is
declared and never emitted, and BA8 owns it.

## Acceptance criteria

- A task can be given dependencies when it is created and when it is edited, by a human and by an agent.
- A task with unfinished dependencies is not picked up for work.
- When a task's last dependency finishes, the task stops waiting; if an agent owns it, it moves into
  progress without human action.
- When a task's last dependency finishes and no agent owns it, it waits for a human rather than starting.
- An attempt to create a dependency cycle is refused, and the person or agent attempting it is told why.

## Validation scenarios

- Given task B depends on task A and A is unfinished, when work is picked up, then B is not started.
- Given task B depends only on task A and an agent owns B, when A finishes, then B moves into progress on
  its own.
- Given task B depends on task A, when someone tries to make A depend on B, then the change is refused.

## How it works

**Setting dependencies.** `POST /tasks` and `PATCH /tasks/:id` both accept a list of task ids. Both
doors validate the same way, in the same transaction as the write: every id must name a task that
exists, a task may not depend on itself, and the resulting graph must have no cycle. A rejected write
returns 409 with a message that says which rule it broke.

There is no restriction on where a dependency points — a task may depend on any task, in any tree.
Cycle rejection is what keeps that safe.

**Waiting.** `hold` is the one waiting state, whatever the wait is for. After a valid write, if any
named dependency is unfinished, the task moves to `hold`. A task is born `proposed` and `proposed →
hold` is not a legal edge today, so that edge is added — it is the entrance to the chain the seed
already told us to reuse, not a shortcut past it.

**Not picked up.** Parking is the visible half; the guard is the enforcing half. `transitionTask`
refuses a move to `accepted` while the task has unfinished dependencies, so a task cannot be dispatched
around the hold by anyone — human, agent, or a direct state edit.

**Being freed.** Two ways out, and they are not the same:
- The last dependency **finishes**: the existing watcher moves the task `hold → accepted`. Unchanged.
- A dependency is **killed**: the premise the task was planned under is gone, so it returns to
  `proposed` for re-planning rather than starting. The killed id is dropped from its dependency list at
  the same time — left in place it is a prerequisite that can never be satisfied, which parks the task
  forever the next time it is accepted.

**Starting.** Nothing new. `accepted` with an agent owner dispatches, `session_started` promotes to
`in_progress`, and an unowned task stops at `accepted` for a human, exactly as today.

**Being told why.** Neither side can currently carry the reason, and both are in scope:
- the UI patch hook discards the response body on a non-2xx, so the message never reaches the person;
- the agent seam collapses a 409 into a generic thrown `Error` that the task tools do not catch, so the
  agent gets a failure instead of a reason.

**Reachable controls.** The write door already exists and is unguarded; what is missing is any way to
reach it. A dependency control goes on the task create and edit surfaces, and `dependencies` goes on the
`create_task` and `edit_task` tool schemas and the seam's `CreateTaskRequest`.

**You find the task by searching for it.** Maintainer ruling at the 2026-09-10 gate: a control that
makes a person paste a task id is not acceptable. You type part of a title and pick from the results,
and the chip shows the title. Searching is not a substitute for guarding the door — the server still
checks existence, self-dependency and cycles for any caller that skips the picker.

## How we work on this

**Dials.** complexity: feature · ambiguity: established context (was: new context — resolved by the
2026-09-09 interview) · exposure: user-facing surface.

**Decided in the interview (2026-09-09).**
- `hold` is the single waiting state — "any type of we need to wait". No new state, no migration.
- A killed dependency sends its dependents back to `proposed` to be refined again, rather than freeing
  them to start.
- No restriction on which tasks may depend on which. Simplest wins.

**Decided without asking.** Setting a dependency parks the task automatically (the outcome already says
it waits). A write naming a task that does not exist is refused. Dependencies gate being picked up; a
task already in progress is not rewound by a later dependency.

**Rounds.** No separate design or architecture round. The ground-truth pass named every surface, and the
three open decisions were settled by interview.

**Structure.** One builder, sequential — the work is heterogeneous (state machine, service, routes, agent
tools, UI). Failing tests first, then the code.

**Gates.** One: before shipping, on the running app — the three validation scenarios plus the dependency
control, shown rather than described.

**Where the proof has to run.** Maintainer ruling 2026-09-10: harnesses are only available through the
**desktop app**. The dev web server cannot run one, so the hop from `accepted` into `in_progress` for an
agent-owned task can only be shown by driving the packaged desktop build with computer-use. The earlier
reading — that boot-time harness detection was failing under load — was wrong about the cause.

**Review.** One fresh reviewer over the integrated diff, per complexity x exposure.

## Confusions

Execution added two, both fixed in `e7ca8c23e` after review: auto-parking was gated on the request
omitting `state`, which the edit panel never does, so the one human door never parked anything; and the
killed-dependency cleanup reused a query that hardcodes `state = 'hold'`, so any dependent in another
state kept a dead id and could never be accepted again — a permanent park that this package's own guard
turned from inert into fatal.

Raised by the ground-truth pass. 1, 2, 5 and 6 were settled by the 2026-09-09 interview and
are recorded under "How it works"; 3, 4 and 7 are real work this package now carries.
1. "Waiting" has no state of its own. The waiting state is `hold`, which is also the state a person picks
   by hand to pause something ("On hold" in the dropdown). The two are indistinguishable in the data.
2. The constraint "reuse the chain, do not add a transition" cannot be satisfied as written — the chain
   has no entrance from `proposed`. Either an edge is added or create writes `hold` directly.
3. "Told why" is not achievable with today's error plumbing on either side: the UI hook discards the
   response body on a non-2xx, and the agent seam collapses a 409 into a generic thrown Error that the
   `edit_task` handler does not catch.
4. "A task can be given dependencies when it is created" needs three surfaces opened, not one:
   `POST /tasks` (which currently rejects the key), the agent seam's `CreateTaskRequest`, and the
   `create_task` tool schema.
5. The seed's out-of-scope line "dependencies that cross bets" has no meaning post-BB1, where a bet is a
   root task. Either it means "stay within one root task's subtree" or it should be dropped.
6. Only `done` frees a dependent. A `killed` dependency parks its dependents forever, silently.
7. Nothing stops a dangling dependency id. The watcher reads `undefined` for a deleted task and parks the
   dependent forever, silently.

## Proposed items

Found while proving BA6 on the running app. Separate work — not this package's to fix.

1. **Harness adapters are pooled only at boot, and a failed boot probe is unrecoverable without a
   restart.** `POST /api/harnesses/redetect` re-probes and updates what the app *reports* — all four
   CLIs flipped from "not installed or not on PATH" to Ready — but it does not register adapters. The
   adapter pool is built once, at server creation, from boot-time discovery. So on a host where the
   boot probe fails, the settings screen says Ready while every agent session dies at pre-admission
   with `NoEligibleHarnessError: no harness adapters are registered`, and nothing in the UI hints that
   a restart is the cure. Observed repeatedly on this machine; the probe reads `process.env.PATH` and
   the PATH was correct in the running server process, so the boot probe appears to fail under load
   rather than for a missing binary. This is what stopped BA6's last hop being shown live.
