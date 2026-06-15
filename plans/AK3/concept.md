# AK3 — Concept: Committing a bet starts work

**Level:** per-workpackage. Inherits the locked track frame `docs/architecture/kernel-strategy-split.md` (boundary + nouns) and the process-layer ground truth (`docs/process-layer/`) as **fixed inputs**. This concept does not redefine bet, task, or PM agent — it makes one transition (`commit`) **load-bearing** and grounds **decomposition** at v1.

## Required reading (downstream `/design`, `/architecture` MUST read)

- `.pipeline/work-packages/TRACK-AK.md` → §AK3 (ACs, validation scenarios, out-of-scope).
- `docs/architecture/kernel-strategy-split.md` — locked boundary; §3 (as-built Strategy port), §4 (decomposition is Kernel).
- `docs/process-layer/bets-shape-commit-change-ship.md` §5.2–5.3 — the **aspirational** decomposition narrative (decentralized). AK3 ships the **v1 centralized** grounding of it.
- `docs/process-layer/decomposition-practice-grounded-decentralized.md` — the eventual model AK3 is a stepping stone toward (NOT what AK3 ships).
- `docs/process-layer/task-lifecycle.md`, `tasks-and-sessions.md` — task states `proposed→accepted→in_progress…`.
- `docs/system-prompts/product-manager.md` — the PM agent persona.
- Code (reuse, do not fork): `packages/server/src/services/bet-state-machine.ts` (`transitionBet`, emits `bet_state_changed`), `packages/fabric/src/services/lifecycle-propagation.ts` (event subscribers; acts only on `completed`/`killed` today), `packages/fabric/src/services/task-dispatcher.ts` (fires on `task_state_changed(accepted)` → `provision-registry` → `session-provisioning.ts`), `packages/server/src/services/assistant-turn.ts` (the **task-free agent turn** precedent — AH3), `packages/server/src/tools/create-task.ts`, `packages/strategy-minimal/src/minimal-strategy.ts`.

---

## Phase 0 — The nouns

| Noun | Classification | Note |
|---|---|---|
| **Commit** (the `draft→active` bet transition) | **Reshaped** | Today inert (flips status, emits event, no subscriber acts). AK3 makes it a *promise that work starts*. This is the load-bearing reshape. |
| **Decomposition** | **Reshaped (grounded at v1)** | Docs describe it aspirationally (decentralized, per-stream + PM integrates). No code exists. AK3 grounds a **v1: one PM agent produces the whole breakdown**. The noun's *meaning* is pinned by docs; AK3 pins its *first real implementation shape* and its **completion contract**. |
| **Task breakdown** | **New (satellite)** | The unit decomposition produces: a set of ≥1 task rows owned by eligible team agents, born `accepted` so the existing dispatcher takes over. |
| Bet | Stable (input) | `docs/process-layer/bets-shape-commit-change-ship.md`. Not redefined. |
| Task | Stable (input) | `docs/process-layer/task-lifecycle.md`. Not redefined. |
| PM agent (`product_manager` role) | Stable (input) | Existing role; team lead. Not redefined. AK3 *uses* it as the decomposer. |
| Eligible team agent | Stable (input) | An `active` AI user in the bet's team membership group with a role that can own work. AK3 *reads* this set; the eligibility rule is the only new predicate. |

Only **Commit**, **Decomposition**, and **Task breakdown** enter the rest of this doc.

---

## Phase 1 — Essence

### Commit (reshaped)
- **Identity.** Commit is a **human verdict that obliges the system to start work** — no longer a bare status flip. It is the irreversible-by-the-human handoff from "shaping" to "doing".
- **Essential property after AK3.** Every successful commit (`draft→active`) **either** produces a task breakdown **or** records an explicit, founder-visible blocker explaining why it could not. There is no third outcome (no silent zero-task active bet).
- **Lifecycle (unchanged for the bet).** `draft→active` is still the only transition AK3 touches; AK3 adds a *consequence*, not a new state. The capacity gate, CAS, and `bet_state_changed` emission stay exactly as in `bet-state-machine.ts`.
- **Authority.** The human commits (sovereignty). The system *responds* — it never commits on its own (AK4 drafts; the human still commits).

### Decomposition (reshaped → grounded v1)
- **Identity.** Decomposition is **the kernel work-planning act that turns a committed bet's goal + concept into a set of tasks**. Per the locked doc it is **Kernel** (work-planning + running a PM agent); the Strategy only *feeds the PM agent context* via the port.
- **v1 shape (what AK3 ships).** A **single PM agent** reads the bet (goal/done-condition + concept body) and proposes the whole breakdown. This is a *task-free agent turn* (the AH3 `runAssistantTurn` pattern): run the PM through the harness to produce a breakdown **without** a pre-existing task or sandbox-coupled session polluting the task graph.
- **Strategy coupling.** The PM agent's context comes **via the active Strategy port** (`assembleContext`). Under the **minimal Strategy** (no injected knowledge) decomposition must still work — the PM decomposes from the bet alone. Under the Fabric it gets practice/knowledge context. AK3's correctness does not depend on which Strategy is active.
- **Lifecycle of the act.** `triggered (on bet_state_changed→active)` → `running (PM turn)` → **terminal**: `produced` (≥1 task) **or** `blocked` (no eligible agent / PM produced nothing / PM turn failed). Terminal-blocked is a first-class, surfaced outcome, never a silent no-op.
- **Authority.** The Kernel owns and triggers decomposition. The PM agent (an AI team member) authors the task content. No human approves the breakdown in AK3 (the human-attention gate is **out of scope**, deferred to the unified-attention concept).

### Task breakdown (new satellite)
- **Identity.** The output artifact of a decomposition act: a set of task rows on the bet.
- **Essential properties.** (a) ≥1 task; (b) every task `betId` = the committed bet, `teamId` = the bet's team; (c) every task has an `ownerAgentId` set to an **eligible team agent**; (d) every task is created such that it reaches `accepted` (so `task-dispatcher` fires). A task with no owner is not part of a valid breakdown.
- **Lifecycle.** Tasks enter at `proposed` or directly `accepted` (architecture decides the exact insert state + transition; the **contract** is they end up `accepted` with an owner so dispatch picks them up). From there the existing task→session→propagation machinery owns them.
- **Authority.** Authored by the PM agent's decomposition; owned (each task) by the assigned eligible agent; mutated thereafter only by the existing task state machine + tools.

---

## Phase 2 — Rejection list

### Commit is NOT…
- **NOT a guarantee a session runs.** Commit guarantees *a breakdown is attempted and its outcome is honest*, not that an LLM session succeeds. Capacity, cost cap, credentials, and harness availability can still defer/deny a session downstream — that surfaces through existing dispatch/session states, not by re-promising in the bet UI. Why: the dispatcher already owns provisioning outcomes; re-promising would be a second false promise.
- **NOT reversible by the human in AK3.** AK3 adds no "un-commit". Why: out of scope; the bet lifecycle has no `active→draft` transition and AK3 must not invent one.
- **NOT a new bet state.** Why: the bet state machine is locked at 4 states (`draft|active|completed|killed`); AK3 adds a consequence to an existing transition, not a state.

### Decomposition is NOT…
- **NOT decentralized per-stream in v1.** The aspirational model (each member proposes their stream, PM integrates) is the *destination*, not AK3. AK3 ships **one PM agent decomposes the whole bet**. Why: AK3 explicitly scopes *decomposition quality / which agent / how granular* OUT; shipping the centralized v1 unblocks the wedge now, and the decentralized model is a later workpackage. This is a **known, deliberate divergence from `bets-shape-commit-change-ship.md` §5.3** — recorded here so it is not mistaken for a bug.
- **NOT a Strategy responsibility.** Why: locked doc §4 — decomposition is Kernel work-planning; the Strategy only feeds the PM context via the port. Putting task creation behind the Strategy port would violate the boundary.
- **NOT gated by a human review before tasks are created.** Why: the human-attention gate is out of scope (deferred to unified-attention concept). v1 produces the breakdown directly; the founder sees it after, on the bet surface.
- **NOT a deterministic server-side template.** The breakdown is authored by an agent (judgement), not a hardcoded task list. Why: a template would freeze granularity and discipline; the point of "running a PM agent" (locked doc) is agent judgement. (Architecture may still need a deterministic fallback for the *blocked* path — that is a blocker, not a breakdown.)

### Task breakdown is NOT…
- **NOT a separate plan document.** Per docs: "the plan is the current state of the task list." The breakdown is just task rows. Why: no new entity; reuse `tasks`.
- **NOT cross-team.** Every task's team = the bet's team. Why: cross-team decomposition is explicitly out of scope.
- **NOT owned by the PM agent by default.** The PM authors; ownership goes to the eligible agent for the work. Why: `create_task` today sets `ownerAgentId = ctx.agentId` (the caller) — for a PM-authored breakdown that would wrongly assign every task to the PM and could strand work if the PM isn't a builder. Architecture must assign owners to eligible *team* agents, not the author. (Load-bearing — see Contracts.)

---

## Phase 3 — Vocabulary

| Term | Definition | Aliases not to use |
|---|---|---|
| **Commit** | The `draft→active` bet transition; the human verdict that obliges the system to attempt a breakdown. | "start", "activate" (use only when naming the state `active`), "kick off". |
| **Decomposition** | The Kernel work-planning act that turns a committed bet into a task breakdown by running a PM agent. | "planning" (too broad), "task generation", "central planner" (we reject central as the *eventual* model but v1 IS centralized — say "v1 PM decomposition"). |
| **Task breakdown** | The set of ≥1 owner-assigned tasks a decomposition produces on a bet. | "task graph" (implies dependency edges AK3 doesn't require), "subtasks", "task plan". |
| **Eligible team agent** | An `active` AI user in the bet's team membership group whose role can own a task. | "available agent", "assignee" (use only after assignment). |
| **Decomposition blocker** | The surfaced terminal-blocked outcome of a decomposition (no eligible agent, or PM produced nothing / failed). | "error", "empty state" (the *no-eligible-agent* case is a blocker, not a generic empty). |

---

## Phase 4 — Contracts

- **C1 — Honesty (hard rule).** A bet that has been `active` for more than the decomposition window has **either** ≥1 task **or** a surfaced decomposition blocker on its bet surface. The permanent "Tasks will appear here once agents start work" promise over a silently empty list is **forbidden** — its presence is a concept violation. *(Maps AC3.)*
- **C2 — Cardinality.** One commit triggers **at most one** decomposition act per bet (idempotent: re-firing `bet_state_changed→active`, retries, or duplicate events must not produce duplicate breakdowns). A valid breakdown has ≥1 task; each task attaches to exactly one bet and exactly one owner. *(Concurrency/idempotency is an architecture concern; the contract is "no duplicate breakdown".)*
- **C3 — Ownership.** Every produced task has `ownerAgentId` = an eligible team agent (NOT the PM author unless the PM is itself the eligible owner). A breakdown with any unowned task is invalid. *(Maps AC2.)*
- **C4 — Dispatch reuse (hard rule).** Produced tasks reach `accepted` and flow into the **existing** `task-dispatcher → provision-registry → session-provisioning` path. AK3 forks **no** second provisioning route. *(Maps AC2, constraint.)*
- **C5 — Boundary.** Decomposition runs Kernel-side. The PM agent's context is obtained only through the active Strategy port (`assembleContext`); decomposition works under the minimal Strategy with zero injected knowledge. Task creation is never behind the Strategy port. *(Maps locked doc §4.)*
- **C6 — Sovereignty (hard rule).** Decomposition takes **no irreversible external action** and bypasses **no** existing review gate. Producing internal task rows + provisioning sessions is the existing reviewed loop (tasks hitting `review` produce review threads per existing machinery). AK3 adds no new external side effect. *(Maps AC5.)*
- **C7 — Blocker specificity.** When the team has no eligible agent, the founder sees an **explicit reason** ("This team has no agent that can take this work"), not a generic empty state and not a false promise. The blocker is recoverable info (e.g. add an agent to the team), not a dead error. *(Maps AC4.)*
- **C8 — Closure.** The set of decomposition terminal outcomes is closed: `{produced, blocked}`. Adding a third (e.g. `pending_human_review`) requires reshaping this concept (it is the deferred attention-gate).

---

## Rationale

Empirically (track preamble) committing a bet is **inert**: `POST /bets/:id/commit` flips `draft→active` and emits `bet_state_changed`, but no subscriber acts on `active` — `lifecycle-propagation` handles only `completed`/`killed`, and no decomposition code exists anywhere. Meanwhile the bet UI promises "Your team will pick this up" / "Tasks will appear here once agents start work" — a **permanent false promise**. This is the spine of the Plan→Interact→Review→Repeat wedge: "Interact" never begins.

Two reshapes resolve it. First, **Commit** stops being a status flip and becomes a *promise the system honors* — the C1 honesty rule forbids the silent-empty state that exists today. Second, **Decomposition** gets grounded: the docs describe an aspirational *decentralized* model (each member proposes their stream, the PM integrates), but that is a destination, not a v1. AK3 ships the smallest real seam — **one PM agent decomposes the whole bet** as a task-free agent turn (reusing the AH3 precedent so the task graph isn't polluted by a fake parent-task session) — and routes the result into the dispatcher that already works. The centralized-vs-decentralized divergence is deliberate and recorded (Phase 2) so the next agent does not read it as a bug.

The load-bearing trap caught here: `create_task` today assigns `ownerAgentId = ctx.agentId` (the calling agent) and derives `betId` from a **parent task** (`ctx.taskId`). A PM decomposition has *no* parent task and must assign owners to *eligible team agents*, not to the PM author — so AK3 cannot naively reuse `create_task`'s ownership/parent semantics. C3 + the Phase-2 rejection pin this before it becomes a stranded-work bug (PM-owned builder tasks the PM can't run).
