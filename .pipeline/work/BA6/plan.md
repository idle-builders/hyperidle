# BA6 — Tasks wait for the tasks they depend on, then start themselves

## Work package

**Outcome.** A task can be declared to depend on other tasks. While any of them are unfinished it waits
instead of being picked up. When the last one finishes, it stops waiting and, if an agent owns it,
starts.

**Why this matters.** Work that has an order is currently held only in someone's head, so agents pick up
tasks whose prerequisites are not done and produce work that has to be thrown away. Sequencing that
enforces itself is what makes a set of tasks a plan rather than a list.

**What exists today.** A dependency column exists on tasks and a watcher exists to unblock dependents,
but **nothing writes dependencies** — the writer was bet decomposition, which was deliberately removed —
so the watcher has matched zero rows since. Accepting a task dispatches it with no dependency check at
all. There is no direct transition from waiting to in-progress: the existing chain moves a task from
waiting to accepted, dispatch prepares the run, and a reaction then moves agent-owned tasks to
in-progress, correctly leaving unowned tasks at accepted for a human.

**Missing delta.** Give dependencies a writer, gate acceptance on them, and let the existing chain carry
a freed task into progress.

**Depends on.** None.

**Complexity.** M

**Engineering tier.** mvp

**Pre-build.** Not required — the outcome is clear and the state machine already provides the path.

**Constraints.**
- A dependency cycle must be rejected when it is created. A cycle that is accepted parks every task in
  it forever, which is worse than refusing it.
- Unowned tasks must still stop at accepted and wait for a human. Automatic progression applies only to
  tasks an agent owns.
- Reuse the existing waiting → accepted → in-progress chain. Do not add a direct transition.

**Out of scope.** Reintroducing automatic decomposition of a bet into tasks. Dependencies that cross
bets. Visualising the dependency tree beyond what is needed to set and see dependencies.

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
