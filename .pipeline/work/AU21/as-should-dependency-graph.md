# AU21 As-Should Dependency Graph — classification notes

Companion to `.pipeline/work/AU21/as-should-dependency-graph-data.json`. Same shape as the as-is
`plans/AU19/dependency-graph-data.json` (`services[]`, `edges[]`, `eventEdges[]`, `summary`) so the
existing "Service Dependency Explorer" artifact can render it; every edge/eventEdge carries a `status`
so the artifact can color/filter by it.

**Basis:** projected over the 2026-07-17 byte-verified as-is data (31 services, 139 port-derived DI
edges, 34 EventBus edges). Nothing here is a fresh mechanical extraction — it is the as-is data with
the `agent-orchestration → core-api` edges reclassified against AU21's architecture, and everything
else carried over verbatim.

**Honesty boundary — read this first.** The classification below is grounded in the **real method
names** in `packages/agent-orchestration/*/src/ports.ts` (already read during architecture). *Read vs.
write* is a genuinely checkable property today, so those calls are made now. But the **final
disposition of each edge is Increment 0's job** — this graph is the *expected shape*, not a
pre-executed worklist. Where the disposition is genuinely undecided, the edge is tagged
`pending-increment-0` rather than forced into `seam-write`/`deleted`. No disposition sub-count is
claimed as if Increment 0 already ran.

## `status` taxonomy

| status | meaning | count |
|---|---|---|
| `unchanged` | Not touched by AU21 — carried over verbatim. All 33 core-api intra-layer edges, all 12 agent-orchestration intra-layer edges, the 5 `agent-orchestration → agent-execution` (HarnessPort) edges, the 1 `core-ui → core-api` edge, the 5 permanent against-grain DI ports, and (in `eventEdges`) the 3 existing against-grain EventBus inversions + all other events. | 89 port edges + 34 event edges |
| `new` | Added by AU21. The `agent_run_admission_failed` EventBus inversion (§6 B5). | 1 event edge |
| `seam-write` | The port's methods are **agent tool-action writes** (the agent acting on core like a user) → become `CoreApiPort` calls over the same route stack the UI uses (Decision A). | 7 port edges |
| `deleted` | The port's methods are **pure reads of core-api domain state** (recovery / selection / build-time lookups) → deleted entirely; core validates at emit, the running agent self-recovers live via MCP (Decision B). Listed so the artifact can show "used to exist, now gone." | 44 port edges |
| `pending-increment-0` | Genuinely undecided disposition — **not** forced into seam-write/deleted. Three honest sub-reasons (below). | 17 port edges |

Port-edge total 157 = 89 unchanged + 68 reclassified (the 50 as-is `agent-orchestration → core-api`
port-interfaces, split where a single interface mixed reads and writes). Event-edge total 35 = 34
unchanged + 1 new.

## How the 50 `agent-orchestration → core-api` port-interfaces were reclassified

For each, the real `ports.ts` methods were read and each method classified **read** (`get*`/`list*`/
`find*`/`count*`/`rank*`/`resolve*`/`read*`/`sum*`/`search`/`summarize*`) vs **write** (`create*`/
`update*`/`insert*`/`delete*`/`increment*`/`reset*`/`promote*`/`upsert*`/`set*`/`transition*`/
`handoff`/`recordConflict`/`persistScaffoldedAgents`/`getOrCreate*`/`findOrCreate*`/`run*Sweep`/
`recompute*`) vs **control** (`startWatcher`/`stop`). A port-interface that mixed reads and writes was
**split into separate edges** so each carries a single, accurate `status` (e.g. `tool-handlers → work`
became one `seam-write` edge for the 7 write methods and one `deleted` edge for the 5 read methods).

### `seam-write` (7) — clear agent-tool-action writes → `CoreApiPort`
`tool-handlers → {work, conversation, org, routine, knowledge, policy}` (create_bet, send_message,
create_task, promote knowledge, handoff, …) and `capture-writeback → knowledge` (the agent's captured
sandbox output written back). These are unambiguously "the agent acting on core like a user," so they
route through the write seam. `capture-writeback` is borderline (orchestration persists the agent's
captured output) — kept as `seam-write`, Increment 0 confirms.

### `deleted` (44) — pure core-domain reads → gone
Every read the drain worker / context assembly / selection / cost-attribution paths make into core
tables. Notable groups: all of `context-assembly`'s reads (knowledge/work/users/routine/org — the
largest single deletion, replaced by a pushed context bundle at emit and/or live MCP assembly), all of
`session-requests`' `resolveAuthoritativeInput` domain reads (conversation/knowledge/review/work/org +
the decomposition-candidate `users.listUsersByTeam`), `agent-selection`'s roster reads,
`trigger-resolution`'s reads, `session-lifecycle`'s credential/provisioning reads, and the read halves
of the split `tool-handlers`/`dispatch`/`cost` interfaces. One special case:
`session-requests → routine.updateRoutineRunIfRunning` is a *write*, but it is the AU15 pre-handoff
routine-finalize — it is tagged `deleted` with the reason that it is **re-homed onto the new
`agent_run_admission_failed` event** (the routine subscriber finalizes its own run), preserving AU15
AC-3d.

### `pending-increment-0` (17) — genuinely undecided
Three sub-reasons, each carried in the edge's `reason`:
1. **Orchestration-side bookkeeping / projection writes** (the bulk): `cost → {users, org, work,
   settings}` (cost accrual), `lifecycle-projection → {routine, work}` (lifecycle projection),
   `session-lifecycle → {routine, work}` (task/bet/routine state transitions on session start/end),
   `dispatch → {work, routine, conversation, users, review, knowledge}` (scheduler writes, assistant-
   reply persistence, knowledge sweeps). These are writes, but **not** agent-user-actions — they are
   orchestration mutating core-owned state as a side effect. Under the founder's model each should
   likely become a **core-owned EventBus inversion** (core updates its own state on an orchestration
   event), but some may route via the seam. Which one is per-edge Increment-0 work — not guessable from
   method shape, so not forced into `seam-write`.
2. **Filesystem-watcher lifecycle control**: `context-assembly → filesystems` (`startWatcher`, `stop`).
   Neither a domain read nor a write — watcher control. Disposition (a legitimate orchestration-owned
   capability, or relocate) is unclear; Increment 0 decides.
3. **Target-agent runnability authority**: `session-requests → users.getUserById` (the
   `requireRunnableActor` check). An *authority* check, not a recovery read — moves to emit-time
   validation and/or provision-time credential-context failure; founder-confirmed item (architecture
   §6 B).

## The one `new` edge

`session-requests → routine`, `eventType: agent_run_admission_failed`, `status: new` — the pre-handoff
failure channel designed in architecture §6 B5. A new against-grain (`agent-orchestration → core-api`)
EventBus inversion, added because the drain worker emits nothing today (verified: no `emit`/`eventBus`
call in `agent-work-intent-worker.ts`; `agent_run_lifecycle_changed` fires only post-session). The
routine subscriber finalizes its run to `error`, replacing the deleted direct write and preserving AU15
AC-3d. Additional per-family retry subscribers are Increment-3 detail and are **not** invented here.

## Caveat not representable as an edge — `taskDispatchAttempts`

The `task_run` branch's `taskDispatchAttempts.status !== "requested"` check (architecture B2) is a
**raw shared-table read**, not one of the port-interface edges, so it has no edge object here. It is
flagged in architecture §9 Increment 0 as an ownership question (three core-api Services —
`work`×2, `policy` — write that table; it sits in `UNOWNED_SHARED_TABLES`). Noted here so the graph is
not read as if that concern were resolved.

## What did NOT change (carried over verbatim, `status: unchanged`)

33 core-api intra-layer edges · 12 agent-orchestration intra-layer edges · 5 `agent-orchestration →
agent-execution` (HarnessPort) edges · 1 `core-ui → core-api` edge · the 5 permanent against-grain DI
ports (`work → session-requests`, `work → agent-selection`, `work → cost`, `policy → session-requests`,
`review → session-requests`) · the 3 existing against-grain EventBus inversions
(`filesystems → capture-writeback`, `policy → cost`, `policy → session-lifecycle`) · all other event
edges. AU21 touches none of these (architecture §2, §4).
