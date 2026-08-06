# Process Layer

The primitives that structure how teams and agents do work — Bet, Task, Session, Team, Routine — and the cross-cutting mechanics built on them.

- [the-five-primitives.md](./the-five-primitives.md) — folder front door: why the layer exists, the five primitive shapes as shipped, top-down/bottom-up flow, and layer boundaries.
- [bets-shape-commit-change-ship.md](./bets-shape-commit-change-ship.md) — owns the bet lifecycle (`draft|active|completed|killed`), AC3b authority, promote-from-knowledge edge, and decomposition mechanics.
- [tasks-and-sessions.md](./tasks-and-sessions.md) — Task 8-state machine, hold-vs-blocked, dependency watcher, session notes, and pre-compaction consequences.
- [handoff-and-lifecycle-propagation.md](./handoff-and-lifecycle-propagation.md) — how work moves between agents (HandoffMetadata, system-resolved roles) and how state changes ripple up the primitive hierarchy.
- [teams.md](./teams.md) — Team primitive: persistent, product-bound, one-team FK, membership via review items, AK6 scaffold.
- [routines-and-retros.md](./routines-and-retros.md) — recurring work and retros (retros are built-in routines): trigger shapes, owner/stateKey, humanReview flag, four builtins.
- [artifact-primitive.md](./artifact-primitive.md) — Artifact contract, five ArtifactView embed shapes, permalinks, and AM5 composition. Path frozen (code-cited).
- [filesystem-primitive.md](./filesystem-primitive.md) — registered team-scoped file source: the filesystem-vs-tool-vs-knowledge decision rule, injection model, and lifecycle.
- [staged-operation.md](./staged-operation.md) — the Proposed Call (AL7): MCP-bridge carrier, opt-in gate machinery, and the executes-nothing boundary. Path frozen (code-cited).
- [wip-and-cost-limits.md](./wip-and-cost-limits.md) — owns the WIP ceiling at agent and team level, the duration-is-not-a-budget-axis doctrine, and the record of the deleted cost-cap feature.
- [canonical-shapes.md](./canonical-shapes.md) — cross-primitive conventions: RevisionLogEntry, Money/TokenUsage as shipped, outcome-verdict meanings, ModelTierUnknownWarning, no-FK/trust-first invariants.
