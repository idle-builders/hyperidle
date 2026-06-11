# AF7 — Concept Confirmation

**Verdict: concept-present.** AF7 introduces NO new primitive. It wires existing
machinery (dispatcher, session provisioning, harness registry, lifecycle
propagation). Every load-bearing noun is already defined in `docs/` and exists
in code. This doc records the contracts AF7 must honor — it does NOT redefine
anything.

## Load-bearing nouns (all pre-existing)

| Noun | Definition source | Code anchor |
|---|---|---|
| **Task** | `docs/process-layer/tasks-and-sessions.md` §6.1, `docs/process-layer/task-lifecycle.md` | `packages/db/src/schema.ts` (`tasks`), `task-state-machine.ts` |
| **Session** | `docs/process-layer/tasks-and-sessions.md` §6.2 ("one bounded run by one agent; start, end, outcome, cost") | `packages/db/src/schema.ts` (`sessions`), `session-provisioning.ts`, `session-lifecycle.ts` |
| **Dispatch / dispatcher** | AD2 (`task-dispatcher.ts` header), "ready task → provisioned session" | `packages/fabric/src/services/task-dispatcher.ts`, `provision-registry.ts` |
| **Harness adapter / registry** | `docs/agent-layer/` (harness contract), `tasks-and-sessions.md` §6.2 (pre-compaction trigger) | `packages/server/src/harness/*`, `adapter-pool.ts`, `tool-registry.ts` |
| **Workspace** | `tasks-and-sessions.md` §6.2 (materialization → `context/`/`work/`/`knowledge/`) | `workspace-adapter.ts`, `local-workspace-adapter.ts` |
| **Handoff** | `docs/process-layer/handoff-the-coordination-primitive.md` §8 (A2A-inspired) | `packages/server/src/services/handoff-protocol.ts` |
| **Lifecycle propagation** | `docs/process-layer/lifecycle-propagation.md` (session → task → bet → team) | `packages/fabric/src/services/lifecycle-propagation.ts` |

No noun is New or Reshaped. No `concept-missing`.

## Essence probes (confirmation only)

- **A Session is not a Task.** A Task is the long-lived unit of work and the
  real long-term memory; a Session is one bounded run against it. Many sessions
  per task (doc §6.2). AF7 must keep this 1-task-N-sessions cardinality — the
  dispatcher's idempotency guard (`hasActiveSession`) protects "at most one
  *active* session per task," not one session total.

- **A Session is not a Workspace.** The workspace is the materialized file tree
  the session runs in. Its lifecycle is *coupled to but distinct from* the
  session row: a crashed session preserves its workspace for post-mortem
  (`session-lifecycle.ts` crash path), so workspace cleanup is a separate
  reclamation concern (AC6), not a side effect of session teardown.

- **Dispatch is not Execution.** The dispatcher decides *when* a ready task gets
  a session and enqueues it; `provisionSession` *runs* the session. AF7's
  non-blocking requirement (AC2) lives at this seam: the request/enqueue side
  must not wait for the execution side.

- **A Handoff is not a session_ended.** Handoff deliberately does NOT emit
  `session_ended` (it is not a cost-attribution event — `handoff-protocol.ts`
  L98-103). AF7 must stop the prior agent's *tool access* on handoff without
  abusing the `session_ended` channel.

## Contracts AF7 must honor (not redefine)

1. **Kernel/strategy boundary.** `fabric` must never statically import `server`.
   The dispatcher already respects this via `provision-registry.ts` (runtime
   injection). AF7's boot-wiring must register `provisionSession` through that
   registry, not via a new import.
2. **Idempotency = at most one active session per task.** Enforced by
   `hasActiveSession` in `task-dispatcher.ts` and the in_progress guard in
   `provisionSession`. AF7 must not weaken it when adding async hand-off.
3. **Per-session tool authorization is the harness tool list**, not the registry
   (`session-provisioning.ts` L536-543). The registry sees all tools; the
   allowed set is filtered per-role per-session. AF7's isolation fix must keep
   this invariant.
4. **Cost recording uses AF10's corrected accounting** (`recordCostAndCheck`,
   `scaleForCurrency`). AF7 does not touch cost math.
5. **Worker-token security (Z8-014) is owned by AF11.** AF7 must not introduce a
   new credential path on the session/worker seam; coordinate, do not fix here.
6. **Bet/task state-machine semantics are owned by AF12.** AF7 consumes the
   `task_state_changed (toState=accepted)` seam and the propagation engine; it
   does not change transition rules.

## Out of scope (per spec)

Scheduler (AF6), notification delivery (AF8), fabric sweeps (AF9),
cost-accounting correctness (AF10), worker-token fix (AF11), bet/task
state-machine semantics (AF12).
