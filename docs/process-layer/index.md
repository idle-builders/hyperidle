# Process Layer

The primitives that structure how teams and agents do work — Task, Session, Team, Routine — and the cross-cutting mechanics built on them.

> **BB1 (2026-08-30):** Bet and Task merged into one recursive Task. A task has a goal and may have subtasks to any depth; a bet is a task with no parent. `bets-shape-commit-change-ship.md` is deleted — its lifecycle is now the task state machine.

- [the-four-primitives.md](./the-four-primitives.md) — folder front door: why the layer exists, the four primitive shapes as shipped, top-down/bottom-up flow, and layer boundaries.
- [tasks-and-sessions.md](./tasks-and-sessions.md) — the Task tree and its 8-state machine, hold-vs-blocked, dependency watcher, session notes, and pre-compaction consequences.
- [handoff-and-lifecycle-propagation.md](./handoff-and-lifecycle-propagation.md) — how work moves between agents (HandoffMetadata, system-resolved roles) and how state changes ripple up the primitive hierarchy.
- [teams.md](./teams.md) — Team primitive: persistent, product-bound, one-team FK, membership via review items, AK6 scaffold.
- [routines-and-retros.md](./routines-and-retros.md) — recurring work and retros: trigger shapes, owner/stateKey, humanReview flag. Retros are a **plugin**, not core machinery.
- [artifact-primitive.md](./artifact-primitive.md) — Artifact contract, five ArtifactView embed shapes, permalinks, and AM5 composition. Path frozen (code-cited).
- [filesystem-primitive.md](./filesystem-primitive.md) — registered team-scoped file source: the filesystem-vs-tool-vs-knowledge decision rule, injection model, and lifecycle.
- [staged-operation.md](./staged-operation.md) — the Proposed Call (AL7): MCP-bridge carrier, opt-in gate machinery, and the executes-nothing boundary. Path frozen (code-cited).
- [wip-and-cost-limits.md](./wip-and-cost-limits.md) — owns the WIP ceiling at agent and team level (concurrent `in_progress` tasks, counted live), the duration-is-not-a-budget-axis doctrine, and the record of the deleted cost-cap feature.
- [canonical-shapes.md](./canonical-shapes.md) — cross-primitive conventions: RevisionLogEntry, Money/TokenUsage as shipped, outcome-verdict meanings, ModelTierUnknownWarning, no-FK/trust-first invariants.
