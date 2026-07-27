# AU21 — Architecture: seam the `agent-orchestration → core-api` boundary; make the clean loop real

**Engineering tier:** production. **Type:** backend. **Design phase:** not required (no UI).
**Reads:** `.pipeline/work/AU21/plan.md`, `requirements.md` (founder-approved), `feasibility.md`.
**Writes:** this file.

> **Re-derivation note (2026-07-26).** Fully re-derived against `origin/main` post-AU20 (PR #456). The paused
> doc's reasoning and founder rulings are preserved; every concrete file path, method name, service name, and
> edge count is freshly verified and many changed. The single most important correction: AU20 did **not** do
> AU21's behavioral work — it reduced the *surface* (31→23 services, 139→48 DI edges) and reorganized the
> composition, which **hid** the largest orchestration→core read set from the mechanical graph rather than
> removing it. All the hard behavioral changes remain fully ahead. Effort stays **XL** (§18).

## 1. Context — what problem, why now

Four Layers, four boundaries. Three have a location-transparent seam: `core-ui → core-api` (type-only Hono RPC
client), `agent-orchestration → agent-execution` (`HarnessPort`), and against-grain `core-api →
agent-orchestration` (EventBus + a small set of named permanent DI ports). The fourth —
`agent-orchestration → core-api` — is ungoverned raw downward DI. The founder named the "orchestration is
always colocated with core-api, so DI is fine" assumption as the **root cause**: it removed the forcing
function that would make anyone question a new direct wire.

The founder's sharpening (unchanged, not re-litigated): the problem is not "raw DI vs. an API call" — it is
that **orchestration reaches into core-api's domain state at all** to make its own decisions. Core-api must
validate its own state and **push** everything a run needs before handing off; orchestration touches only its
own dedup/bookkeeping state; a running **agent self-recovers** live via MCP if reality changed; failures report
back via explicit events and core-api owns the retry/recovery decision. "Success" is not literally zero
read-back — a small number of individually-argued, human-signed exemptions (matching AU19's permanent-port bar)
are fine — but the *default* must be seam / push / self-recovery.

## 2. What AU20 already changed vs. what is still fully open (the delta that drove this re-derivation)

**Already changed (verified):**
- Surface collapsed: 23 services (core-api 16, agent-orchestration 6, agent-execution 1); **48** DI edges,
  **22** EventBus edges, 412 exposed methods+types (`plans/AU19/dependency-graph-data.json`).
- The `agent-orchestration → core-api` DI edges the graph *sees* are down to **15**, from exactly two
  Services: `dispatch` (8) and `tool-handlers` (7). `session-requests`/`run-orchestration`/`cost`/
  `agent-selection` show **zero**.
- The durable-queue composition moved into core-api (`packages/core-api/src/services/durable-agent-queue.ts`,
  `queueDeps(db)`), driven from `server-factory.ts` + `services/run-orchestration-composition.ts`.
- `practice-meeting` relocated `review → knowledge` (`packages/core-api/knowledge/src/practice-meeting.ts`).
- One AU19 permanent against-grain port disappeared: `policy → session-requests` is gone. The remaining four
  against-grain DI ports are `work → session-requests` (`AgentWorkIntentRecorder`), `work → agent-selection`
  (`AgentSelectionDefaults`), `work → cost` (`CostCapChecker`), `review → session-requests`. **`work →
  session-requests` and `review → session-requests` are NOT two independent exceptions — they are the same
  canonical `AgentWorkIntentRecorder` mechanism (one `enqueueWorkIntent`/`agent_work_intents` operation,
  `kind`-discriminated), counted as two edges only by pair-counting. See Decision G.**
- Rich post-session report-back events exist: `run-orchestration → policy`/`review` on `session_ended`
  (`packages/shared/src/events.ts:86`); `agent_run_lifecycle_changed` (`events.ts:25`).

**Still fully open (this WP's real work):**
1. **The drain worker's core-domain reads are intact and hidden** (§3). The graph's "15 edges / zero from
   session-requests" is a **script blind spot**, not a fix — `session-requests/src/service.ts`'s
   `resolveIntentInputInternal` still reads core state in every branch.
2. **Routine-runs-as-sessions collapse** — `routineRuns` (`packages/db/src/schema.ts:693`, `@lore AA1:687`) is
   unchanged: `outcome` NOT NULL and mutable, written by both the drain and the `dispatch` scheduler. Fully
   open.
3. **`dispatch` is a 1660-line scheduler+routine+assistant+queue monolith** reading/writing core state — the
   bulk of the disposition.
4. **The write-back seam** (`CoreApiPort`) does not exist.
5. **The pre-handoff failure channel** (`agent_run_admission_failed`) does not exist.
6. **The cost display API** (Decision D) does not exist.
7. **practice-meeting** still live via a stale `review`-named port; founder ruling is delete-from-`knowledge`.

## 3. The critical structural fact: the mechanical graph is blind to the biggest read set

`packages/agent-orchestration/session-requests/src/service.ts` houses the durable-queue drain worker. Its
core-domain reads are injected through a single `DurableAgentQueueDeps` interface that is **defined** in that
file but **composed** in core-api (`durable-agent-queue.ts` `queueDeps(db)`) and **driven** from core-api
(`server-factory.ts`, `run-orchestration-composition.ts`). Because `session-requests/src/` has **no
`ports.ts`**, `scripts/generate-dependency-graph.ts` (which scans `ports.ts`) cannot see these edges.

Concretely, `resolveIntentInputInternal` (≈`service.ts:709`) reads, per branch:
`conversation.getMessageById`; `work.getTaskById`/`getBetById`/`getTaskDispatchAttemptById`;
`knowledge.findById`; `routine.getRoutineRunById`/`getRoutineById`; `review.findGrantedProposedCall`;
`teams.getTeamMembersByTeamId`; `users.getUserById`/`listUsersByTeam`/`getUserByIdScopedToTeam`;
`config.listConfiguration`; `agentSelection.isAtCapacity`/`selectAgent`; and `requireRunnableActor`
(`service.ts:700`) in every branch. `failOrRelease` (`service.ts:960`) writes
`routine.updateRoutineRunIfRunning` directly and emits nothing.

**Architectural reading:** the intent→request resolution is *already* a core-api-driven read of core-api's own
state — it is merely **housed** in an orchestration package. The boundary is blurred, which is exactly the
founder's complaint. AU21 resolves the blur by deciding ownership (§6 B) rather than by re-plumbing a read that
the graph happens not to show. A second, smaller instance of the same blindness is the `cost` service's
`CostDeps` (§6 D) — orchestration's cost logic reading/writing core-api tables via a core-api-composed bundle,
also invisible to the mechanical graph. **This blindness is now closed mechanically:**
`scripts/scan-hidden-composition-edges.ts` (built + run for AU21, generalized to any consumer) detects the
composition-bundle pattern and, cross-checked against source, produces the complete enumeration — **37**
distinct `agent-orchestration → core-api` edges (15 the old graph saw + 22 hidden), across **six** consumers
including two the graph showed as zero and the paused analysis never enumerated: `agent-selection` and
`run-orchestration` (the session runtime, the largest hidden consumer). Full worklist + per-edge dispositions:
`.pipeline/work/AU21/edge-disposition.md`.

## 4. Fixed inputs (not re-litigated)
- AU19's remaining against-grain DI ports + EventBus inversions stand as decided **with ONE founder-authorized
  exception (2026-07-27): the `work → cost` `CostCapChecker` port is deliberately reopened and removed** — core
  never blocks on cost (Decision D2). Every other AU19 ruling stands. The one that vanished
  (`policy → session-requests`) is AU20's doing, not this WP's; do not resurrect it.
- `HarnessPort` (`agent-orchestration ↔ agent-execution`) is the reference precedent, not in scope.
- No new authorization layer for agent-initiated core writes (named follow-up) — the seam is chosen so that
  follow-up lands on one choke point.
- No UI change **except** Decision D's new cost-display query (founder's explicit call, §6 D).
- Behavior changes only where fixing a named/verified bug, removing confirmed-dead capability, or where a
  ruling relocates emit-time validation, deletes a drain-time re-read, re-homes a report-back write onto an
  event, or deletes practice-meeting.

## 5. The clean loop (the pinned noun) — as-built target

```
core-api Service (work / conversation / knowledge / routine / review / …) detects it needs an agent
   │  VALIDATES ITS OWN STATE NOW and RESOLVES THE RUN at emit time (agent identity + correlation; the
   │  ast-<userId> assistant-agent is validated as a real runnable AI, never the human sender)
   │  ENQUEUES a FULLY-BAKED request (not a thin intent needing later resolution) via the existing
   │  against-grain AgentWorkIntentRecorder port  ──────────────────────────────┐
   ▼                                                                             ▼
agent-orchestration (durable queue)  ── claims/writes ONLY its own dedup rows (AU9 CAS). Does NOT re-read
   │  core state. Dispatches the baked request AS GIVEN. Overload → own provision-time ConcurrencyLimitError.
   │  Builds + deploys; dispatches via HarnessPort  ─────────────┐
   ▼                                                              ▼
agent-execution  ── runs the session (LLM / harness / MCP)
   │  ★ SELF-RECOVERY: the running agent pulls CURRENT reality live via MCP / CoreApiPort tools; if reality
   │    contradicts its instructions it adjusts or reports the request stale. (A deactivated agent fails at
   │    provision-time credential context — no stale-authority run proceeds.)
   │  agent acts on core data (create_bet, send_message, read_task, …)  ──▶ CoreApiPort (same route+
   ▼                                                                          middleware door core-ui uses)
core-api
   ── FAILURE report-back — two explicit channels, each with a core-api reaction ──▶
      • PRE-handoff (bad payload / MAX_ATTEMPTS / provisioning fail, before any session):
        drain emits NEW  agent_run_admission_failed {intentId, kind, sourceKind, sourceId, failureCode,
        terminal}  →  core-api Services finalize their own state (routine → run outcome="error", replacing
        failOrRelease's deleted direct write) + decide retry/abandon.
      • POST-session (a session ran, then failed): existing session_ended / agent_run_lifecycle_changed
        {state:"failed"}  →  core-api retry/abandon reaction.
   ▼
   retry → core-api re-validates + PUSHES a fresh baked request  ▲── loops back      abandon → done.
```

Hard rule (applied per capability in Increment 0's worklist): **any orchestration read of core-api domain
state to make its own decision is a defect.** Legal shapes: (a) core-api resolves + bakes at emit;
(b) orchestration acts on its own dedup state + the baked request; (c) the running **agent** reads current
reality live via MCP/`CoreApiPort` (the agent acting like the UI — this read is legal and routes *through* the
seam, it is not deleted); (d) a failure reported via one of the two events, re-decision owned by core-api.

## 6. Design decisions (design-it-twice)

### Decision A — Write-back leg mechanism — UNCHANGED (re-verified)
**Reuse the literal core-api route stack via `hc<AppType>` with an Application-injected transport; benefit is
runtime route-identity, not type-safety** (`AppType` is still bare `Hono`, `app.ts:673`).
- *Alt 1 (chosen)* — `fetch = app.request` in-process (colocated), network `fetch` on a split topology; same
  call site. Wins: provably the same door the user uses (same handler + auth + validation + middleware), reuses
  the shipped injectable-`fetch` pattern (`packages/web/src/api/client.ts`), one authz choke point for the
  deferred follow-up. Costs: slight in-process HTTP overhead; bare `AppType` → no compile-time route typing
  (hand-typed mirrors validated by §11 contract tests).
- *Alt 2 (rejected)* — bespoke `CoreApiWritePort` function seam: a parallel path that drifts from the UI's
  route/validation/authz; "same door" becomes an assertion, not a runtime fact.

### Decision B — The read leg: RESOLVE-AT-EMIT + COLLAPSE THE DRAIN; agents self-recover; failures on explicit channels
The founder's model, made concrete against the current code:

1. **Core-api resolves + validates the run at emit time**, inside the emitting Service, reading core-api's own
   state (legitimate). It enqueues a **fully-baked request** — the shape `resolveIntentInputInternal` returns
   today (`defaultAgentId` resolved + runnability-validated, `sourceKind`, `sourceId`, `streamId`,
   `taskId`/`teamId`, `sourceCorrelation`, and for selection families the chosen agent) — through the existing
   against-grain `AgentWorkIntentRecorder` port (`work`/`review → session-requests`). This **grows an existing
   permanent port's payload; it does not add an edge or reopen an AU19 ruling.** The ast-`<userId>` trust
   invariant moves here: the emitting Service reloads the real `users` row and validates `kind==="ai"` +
   active/idle before baking `defaultAgentId`, never the human sender.
2. **The drain collapses to claim-own-dedup + dispatch-the-baked-request.** The AU9 CAS/claim mechanics
   (`claimIntentInternal`, `agentSessionRequests`/`agentWorkIntents`/`explicitSessionStarts` own-state reads)
   stay verbatim. Every `deps.{conversation,work,knowledge,routine,review,teams,users,config,agentSelection}.*`
   read in `resolveIntentInputInternal` — including `requireRunnableActor` and the `taskDispatchAttempts`
   `status!=="requested"` re-check — is **deleted from the drain** (relocated to emit-time core-api, de-
   duplicated to one place). Overload → orchestration's own provision-time `ConcurrencyLimitError`.
3. **A running agent self-recovers** via the MCP/`CoreApiPort` tools it already uses; post-emit staleness is
   the agent's job, not a hardwired orchestration pre-check.
4. **Failures report back on two explicit channels — both core-api reactions are NEW:**
   - **Pre-handoff** (bad baked payload, `MAX_ATTEMPTS_EXCEEDED`, `INVALID_WORK_SOURCE`, hard provisioning
     fail — before any session): `failOrRelease` emits a **new** `agent_run_admission_failed` — a new
     against-grain (`agent-orchestration → core-api`) EventBus inversion, legal by AU19's rule (fire-and-forget,
     no shared transaction, no reply). Core-api subscribes: `routine` finalizes the run to `outcome="error"`
     (replacing `failOrRelease`'s deleted direct `updateRoutineRunIfRunning` write, preserving AU15 AC-3d);
     each family decides retry/abandon.
   - **Post-session** (a session ran, then failed): the existing `session_ended` / `agent_run_lifecycle_changed`
     — channel exists, the retry/re-decide reaction is new.
5. **Core-api owns retry/recovery** off either event; on retry it re-validates and pushes a fresh baked
   request; bounds attempts (relocate the failure-code + backoff logic core-side) and routes repeated failure
   to review/AL7 rather than looping.

*Note — resolution ownership.* Because resolution now happens once at emit inside core-api, the residual
question is where `resolveIntentInputInternal`'s code *physically lives*. Increment 0 rules on the cleanest
placement (move the resolution helpers into the emitting core-api Services / a core-api resolution module;
`session-requests` keeps only the dedup/claim mechanics, which read solely its own tables). This is the concrete
form of "orchestration touches only its own bookkeeping state."

*Alt (rejected, R3)* — "relocate the 7-branch validation into core-api but keep it as a **drain-time**
re-validation": still a hardwired pre-check re-reading at launch. Resolution moves to **emit** time; the drain
does not re-resolve.

**Verified it holds:** the protected durable-queue tests assert idempotency/dedup only (own-row CAS), never
"replay re-reads core state and rejects a stale request" — the deletes break no protected guarantee. The AU15
AC-3d test *does* assert pre-handoff-failure finalization (routine run → `error`, second fire self-heals) —
that is what §6 B4's new channel preserves (a §14 proof obligation). `taskDispatchAttempts` is **work-owned**
(store in `@hyperidle/work`, written by `work`), so its drain re-check is a core read subject to this decision.

### Decision B′ — dispatch: untangle the scheduler / builtin-routine / assistant-runner monolith
`dispatch` (`packages/agent-orchestration/dispatch/src/service.ts`, 1660 lines) holds 8 of the 15 visible
edges and four distinct responsibilities that each read/write core state. Disposition:
- **Routine scheduler + `routineRuns` lifecycle** (cron eval, `nextRunAt`, `insertRoutineRun`,
  `listActiveRoutines`, `findRunningRoutineRun`, `sumRoutineRunCostSince`) → **core-api**, per founder ruling
  #4 (routines = pure definition; a firing = an orchestration session). A firing emits a baked request; core-api
  owns the schedule evaluation and the run record. See Decision B″ for `routineRuns` itself. (Increment 4.)
- **Builtin-routine bodies** (post-bet-retro, portfolio-retro, knowledge-promotion, knowledge-decay,
  practice-meeting) → per-routine disposition (Increment 5): each is either agent work (→ an agent session that
  writes back via the seam) or core-maintenance (→ moved core-side). **practice-meeting is deleted** (ruling
  #5).
- **Assistant-turn runner** (`insertMessage`/`getThreadById`/`getUserById`/`readServerConfig`) → the write-back
  conversation writes go through `CoreApiPort`; the config/thread reads are baked at emit or read by the agent
  live. (Increment 2/3.)
- **Task queue drain** (`hasActiveSession`, `listTasks("accepted")`, `getTaskById`) → own-dedup stays; core
  reads baked at emit. (Increment 3.)

### Decision B″ — routine-runs-as-sessions collapse (ruling #4)
`routineRuns` today is a mutable-status row (`outcome` NOT NULL, `endedAt`, `errorMessage`, `sessionId`,
`schema.ts:693`) that **both** the drain (`projectRoutine`/`failOrRelease`) and the `dispatch` scheduler mutate.
Target: a routine firing is an agent-orchestration session; the run's status is the *session's* lifecycle, not
a core-api field orchestration reaches in to mutate. Concretely: core-api's `routine` stays definition
(schedule/owner); the firing emits a baked request; the run outcome is finalized only via the report-back
events (§6 B4), never a direct cross-layer write. Increment 4 chooses whether `routineRuns` becomes an
orchestration-owned projection of session lifecycle or shrinks to a core-api definition-only audit derived from
events — and updates `@lore AA1`.

### Decision C — Seam shape (write + agent-read side)
**`CoreApiPort` — a per-core-Service family of narrow hand-typed method groups in `@hyperidle/api-contract`,
each mirroring a real core-api route, Application-adapted onto the `hc` client.** The **main consumer is
`tool-handlers`**: the running agent's MCP tool calls — **both reads and writes** — route through the seam,
because they are the agent acting like the UI ("goes via MCP API back to core, just like the user would"). This
is distinct from the drain-worker reads of §6 B, which are orchestration deciding for itself and are deleted.
Method types are hand-written mirrors the compiler cannot verify against routes (bare `AppType`) — fidelity is
a **tested** obligation (§11).
- *Alt (rejected)* — expose full `hc<AppType>`: Mechanism-C violation + bare `AppType` buys nothing + unbounded
  surface.
- Typed-`AppType` restore — DEFERRED (separate change across all `routes/*.ts` + the web client); §11 contract
  tests are the compensating control.

### Decision D — Cost: there is no mirror to delete; the real gap is per-session cost; `AgentOrchestrationPort` serves what orchestration genuinely owns
A clean trace of every cost column (below) overturns both the paused-doc premise ("core-api holds a
**duplicate** of cost just so the UI can read it") and the round-2 reviewer's claim ("`costActual` is dead").
Verified with `rg -a` + a full read of `cost-cap.ts` (grep is unreliable on these control-char files).

| Column (table) | Written by | Read by | Verdict |
|---|---|---|---|
| `users.costActual` | cost authority `cost-cap.ts` → `deps.users.incrementUserCost` (`user-store.ts:178`) | cap gate `checkCostCap`/`recordCostAndCheck` (`cost-cap.ts:145,242`), `spend`, `status.ts:70` | **LIVE, cap-load-bearing** |
| `teamMembers.costActual` | `cost-cap.ts` → `incrementTeamMembersCost` (`team-lookup.ts:338`) | cap gate (`cost-cap.ts:164,264`), `teams-routes.ts:920` | **LIVE, cap-load-bearing** |
| `bets.costActualMinor/Currency` | `cost-cap.ts` → `incrementBetCost` via `task.betId` (`work-service.ts:765`) | `bets.ts`, `teams-routes.ts` (display) | **LIVE, display-only** (bets have no cap) |
| `routines.costActualMinor/Currency` | `run-orchestration/transition-run.ts:190` → `incrementRoutineCost` (`routine-service.ts:102`) | `routines-routes.ts`, `teams-routes.ts` (display) | **LIVE, display-only** |
| `tasks.costActual` | **no writer** (cost accrues to the bet via `task.betId`, never the task) | `work-service.ts:365`, `bets.ts:541`, `WorkTask.tsx` | **DEAD VALUE** — read but never written; always `0` |
| `costCap`/`costCapMinor`/`costCapCurrency`, `routines.costCapPerRunMinor` | admin/routes (the limits) | cap gate | config, untouched |

**What the map proves (state plainly):**
- The reviewer's "`costActual` is dead" is wrong — the cap gate reads `agent.costActual`/`team.costActual`
  for its decision (`cost-cap.ts:145,164`). The `@lore L17` "removed (computed from sessions)" comment is stale
  documentation of a migration that never landed.
- The "core-api holds a **duplicate**" premise is also wrong. `cost-cap.ts` (agent-orchestration) is the
  *single* cost authority; it writes per-entity running totals directly into core-api's own entity tables via
  disciplined DI (`incrementUserCost`/`incrementTeamMembersCost`/`incrementBetCost`), and `run-orchestration`
  writes `routines.costActualMinor`. Each column is a **distinct aggregate** (agent / team / bet / routine),
  the *sole* store for its dimension — none mirrors another, and none mirrors a separate orchestration-side
  truth. `@lore O2` confirms per-session cost is *deliberately not persisted* (stripped from the sessions
  table). **There is no cost mirror to delete** — "delete the mirror" is retired as a frame.

**The genuine, narrower reality:**
- **The real gap — per-session cost.** `@lore O2` stripped session cost columns; `tasks.ts:134` serves
  `cost: null`; `tasks.costActual` is a dead value (never written). Nothing records or serves per-session cost.
  IF the product wants per-session cost display, that is a **new capability**: `agent-orchestration` records
  per-session cost in its own state (it already computes `totalCostCents` at session end) and serves it via
  `AgentOrchestrationPort`. Not a deletion. Per the founder's cut, display shows the best tracked value — no
  live recompute per request.
- **The cap gate is untouched** (founder): `checkCostCap`/`recordCostAndCheck`/`CostDeps` + their
  `costActual`/`costCap*` columns stay — deleting them breaks the gate.
- **The aggregate display columns (`bets.costActualMinor`, `routines.costActualMinor`) stay** as core-api
  entity attributes, written by the cost authority via DI (the same shape as any cross-Service write). No
  duplicate to remove; migrating them to orchestration would be principle-churn that closes no gap — an
  **explicit deferred open question** for the concept gate, recommended NOT scoped into AU21.
- **`AgentOrchestrationPort`'s cost role narrows** to what orchestration genuinely owns and core-api does not
  already carry as an entity attribute: **per-session cost** (the gap) + **session/run history** + gatewaying
  Decision E's session-activity stream. It does not replace the cap gate or the aggregate display columns.

**Second graph-blindness instance (extends §3 / Probe 0):** `cost`'s `CostDeps` (users/org/work/settings,
`cost/src/ports.ts:35`) wires orchestration's cost logic into core-api services via the `cost-bindings.ts`
composition root, so the mechanical graph shows `cost` with zero outbound core-api edges while it in fact
reads+writes `users`/`teamMembers`/`bets` core tables. Like `session-requests` (§3), this is a real
orchestration→core coupling the graph cannot see — but it is the founder-untouched cap gate, so it is a
**flagged, founder-signed exemption**, not a deletion. Increment 0's guard must see this pattern.

- *Alt (rejected)* — "delete the mirror": there is none; the columns are the sole per-aggregate store,
  cap-load-bearing or display, written via disciplined DI.
- *Alt (rejected, reviewer)* — "`costActual` is dead": the cap gate reads it.
- *Alt (deferred, not rejected)* — migrate the display aggregates to orchestration ownership: real
  principle-purity, closes no current gap; a concept-gate question, not AU21 scope.

### Decision D2 — Core-api NEVER blocks on cost; the `work → cost` port is removed (founder, 2026-07-27)
Founder, verbatim: *"we always need to compose, we cannot stop working because of costs, there is no way to
recover otherwise. Cost is a pure orchestration matter, never a core matter."* This **deliberately reopens** the
one AU19 permanent port the rest of AU21 leaves alone (§2), for an explicit, signed reason: a core-api "refuse
on cost" decision is the same stuck-unrecoverable class as the routine-brick bug.
- **Remove the `work → cost` `CostCapChecker` synchronous port** (`work/src/ports.ts:181-199,283`) and the block
  it feeds: `bet-decomposition.ts:486-492` (`if (!capResult.allowed) markTerminal("blocked","failed"); return`).
  Decomposition just proceeds — unconditionally. This deletes an against-grain (`work → cost`) edge; it does not
  add one.
- **Audited every core-api cost decision (per founder instruction).** The only core-api "should this proceed
  based on cost" block is that one site. `routes/artifacts.ts:282` uses `costOps.record` — pure bookkeeping
  (accumulate + emit warning/breach events), **never refuses** the artifact post — the correct pattern, left
  as-is. `run-orchestration-composition.ts:141` wires `checkCostCap` for orchestration's **session-launch** gate
  — the one legitimate place cost gates, untouched. **No second hidden instance.** (Called out explicitly per the
  coordinator's audit instruction — this did not hide the way the composition-bundle reads did.)
- Cost enforcement is entirely orchestration's session-launch cap gate (Decision D — `cost-cap.ts`, untouched).

### Decision E — Retire the generic realtime broadcaster; separate the three conflated concerns
`packages/core-api/realtime/src/ws-broadcaster.ts` is a generic cross-cutting Service: one `BROADCAST_ROUTES`
table rebroadcasts ~16 event types spanning conversations, work, and sessions through one mechanism
(`@lore AU20 Ab2` — "replaces the 16 imperative `eventBus.on()` blocks"). This conflates three unrelated
concerns. **Retire the pattern** (do not slim it); separate:
- **(a) Notifications** — already correctly designed (persisted `notificationQueue`, own domain,
  `notifications/src/install.ts`). Keep as-is. **Remove only** the redundant WS re-forward of the same events
  (`{ eventName:"cost_cap_warning", deriveTopic:()=>"work" }`, `ws-broadcaster.ts:59` — notifications already
  own it, nothing consumes the forwarded copy as a cost signal). Trivial deletion.
- **(b) Discrete state changes** (thread messages, task/bet state, knowledge, artifacts — the `conversations`/
  `work`/`thread:<id>` routes) — a write, not a stream: an agent writes via `CoreApiPort` → persisted → done.
  The UI needs at most a lightweight "something changed, refetch" invalidation signal — likely nothing beyond
  normal client query invalidation or a trivial ping. **Do not rebuild the broadcaster's weight.** Increment 7
  designs the minimal signal actually needed and no more.
- **(c) Session/harness diving** (`session:<id>`: `session_started`/`session_ended`/`tool_call_recorded`) — a
  deliberate per-session looking-glass into the harness; the one place genuine low-latency streaming is
  warranted. It belongs **owned/served by `agent-execution`** (where tokens/tool-calls originate), with
  **`agent-orchestration` as the gateway/router** when executions are distributed (orchestration already tracks
  which execution runs which session — it routes without owning the stream content). Today's
  `SessionActivityBuffer` lives in `agent-orchestration/run-orchestration/src/session-activity-buffer.ts` — the
  wrong home for the buffer under this model. The move to `agent-execution` violates no data-access rule: the
  buffer is an ephemeral in-memory ring buffer (`@lore Q1` — "Activity is intentionally not persisted"),
  importing only types and touching no DB/Drizzle, so it carries no persistence into a Layer that must stay
  thin. Exposed to the UI via `AgentOrchestrationPort` (Decision D) as the gateway door.

- *Alt (rejected)* — keep one broadcaster, prune dead routes only: preserves the conflation and the wrong
  ownership of the session stream; the next event type re-grows the same shape.

Naming: **"the clean loop"** for the cycle; **`CoreApiPort`** / **`AgentOrchestrationPort`** for the two doors.

### Decision F — Agent-selection dissolves; credentials/filesystems split; settings become a cross-layer union (founder, 2026-07-27)
Three related rulings that resolve `edge-disposition.md`'s three founder-flags:

**F1 — `agent-selection` dissolves (resolves Flag 2).** *Who* is assigned is a core-api business decision,
already baked at emit (Decision B step 1); `selectAgent` reads only core-api roster (users/org), so it folds
into core-api's emit-time resolution. What remains for orchestration is only *capacity* — `isAtCapacity`
(active-session count vs `maxConcurrentSessions`) folds into the existing provision-time concurrency logic. The
`work → agent-selection` `AgentSelectionDefaults` port **ceases to exist** (selection is core-api's own logic
now) — a dissolution, not a reopen; nothing reaches into orchestration for selection anymore. `agent-selection`
likely does not survive as a standalone Service (its remaining job is a light capacity check).

**F2 — credentials/filesystems: record stays core-api, provisioning op moves to orchestration (resolves Flag 1
+ the §6 "session-launch infrastructure" category).** Verified: `connections`/`filesystems` serve human config
surfaces (`SettingsConnections.tsx` → `/api/connections`; `SettingsFilesystems.tsx`). So the **record** a human
configures stays core-api (the UI owns it); only the **provisioning operation** —
`connections.{buildProvisioningPlan, applyProvisioningPlan}` and `filesystems.{listFilesystems, startWatcher}`
(sandbox mount + writeback watcher) — becomes orchestration's own job at session launch, **reading the record
once through `CoreApiPort` (seam), not owning it.** This converts the two `run-orchestration` §6 flags from
"open founder call" to "seam read + orchestration-owned provisioning op."

**F3 — settings become a cross-layer union — SCOPED DESIGN PASS (resolves Flag / answers Q4).** Founder: the
settings page is "a union of core settings and orchestration settings, and we probably need to reorganize/
redesign the settings screens." Today `packages/web/src/settings/*` has 17 screens spanning both layers — core
(`SettingsConnections`, `SettingsFilesystems`, `SettingsModels`, `SettingsNotifications`, `SettingsProfile`,
`SettingsOrgChart`, `SettingsAgents`) and orchestration/execution (`SettingsHarnesses`, `SettingsWorker`,
`SettingsAgentBehavior`, cost caps, session config). Target: **one unified settings surface backed by two API
doors** (`CoreApiPort` + `AgentOrchestrationPort`), Application-composed — the same one-door-per-owner pattern
used everywhere. This is real UI/IA design (screen reorg, not just a data-source swap) and **needs its own
scoped `/design` pass** — flagged here, not resolved inline. Recommend a dedicated design WP (or an AU21 design
phase) once the two doors exist; it depends on Decision D/E landing the `AgentOrchestrationPort` surface.

### Decision G — There is ONE canonical "request an agent session" mechanism; "two permanent exceptions" is a mechanical-audit artifact (verified from source)
The founder asked why `work → session-requests` and `review → session-requests` are two "permanent
exceptions" rather than one uniform mechanism. Traced from real source — **they are one mechanism, not two.**

**The three "recorders" are the same interface.** `work`'s `AgentWorkIntentRecorder.record(tx, input):
Promise<{id, idempotencyKey}>` (`packages/core-api/work/src/ports.ts:143-145`), `review`'s
`ReviewAgentWorkIntentRecorder.record(tx, input): Promise<{id, idempotencyKey}>`
(`packages/core-api/review/src/ports.ts:52-58`), and the canonical `AgentWorkIntentRecorder<TTx>.record(tx,
input): Promise<{id, idempotencyKey}>` (`packages/shared/src/agent-work-intent-recorder.ts:65-71`) are
**structurally identical** — same method, same `WriteExecutor`/`tx` arg, same `{id, idempotencyKey}` return.
Their `*Input` types have the **identical field structure** `{kind, sourceKind, sourceId, requestedBy?,
idempotencyKey}` (`work/ports.ts:121-135`, `review/ports.ts:44-50`, `shared/agent-work-intent-recorder.ts:44-64`)
— they differ **only** in which `kind`/`sourceKind` literals each caller uses (work: `bet_decomposition`/
`task_run`; review: `reengagement`; shared: `assistant_turn`/`session_start`). That is a discriminated union,
not three shapes.

**One table, one operation, one concrete impl.** All resolve to the same `enqueueWorkIntent`
(`session-requests/src/service.ts:1759`) → `insertIntentInternal` (`:1042`) → `.insert(agentWorkIntents)`
(`:1057`). The `agent_work_intents` table (`packages/db/src/schema.ts:381`) has one `kind` column with a CHECK
constraint enumerating **all seven** canonical kinds (`schema.ts` ≈`:415`:
`assistant_turn, session_start, knowledge_action, routine_run, bet_decomposition, task_run, reengagement`).
Every caller wires `record` to that one `enqueueWorkIntent`: routes/threads.ts (assistant_turn, via the shared
`AgentWorkIntentRecorder<HyperIdleDb>`), routes/sessions-routes.ts (session_start), routes/bets.ts,
work/bet-decomposition.ts (`enqueueWorkIntent(tx, …)`), review, policy/handoff-protocol.ts (task),
routes/knowledge.ts (knowledge_action), dispatch (routine_run, intra-layer). One mechanism, `kind`-discriminated,
atomic with each caller's own domain write.

**Why it was labeled "two exceptions" — mechanical, not substantive.** AU19's dependency graph counts
**Service-pair** DI edges. `work → session-requests` and `review → session-requests` are two distinct
Service-pairs, so the pair-counter records two edges each "needing justification." The justification is **one
and the same** — a same-transaction atomic intent write an `eventBus.emit()` cannot serve (`work/ports.ts:69-93`,
`agent-work-intent-recorder.ts:29-32`). There is **no substantive difference**: same operation, same table, same
interface, same impl. The "N exceptions" count is an artifact of pair-counting a single canonical mechanism with
multiple callers.

**The local mirrors are redundant, NOT Mechanism-C-forced.** The canonical port already lives in the sanctioned
shared package `@hyperidle/shared` (a leaf every Service depends on — where `HarnessPort` also lives).
`work` and `review` both depend on `@hyperidle/shared` (their `package.json`), and `work/ports.ts:110` already
imports other symbols (`EventBus, UserRole`) from it — yet both **re-declare** their own recorder locally
instead of importing the canonical one. The re-declaration exists only because the shared
`AgentWorkIntentRecorderInput` was scoped to AC-9's two kinds (`assistant_turn`/`session_start`) and never
widened to the full seven.

**Design — unify onto the one shared contract (enforced, not by convention):**
- Widen `@hyperidle/shared`'s `AgentWorkIntentRecorderInput` to the **complete seven-kind discriminated union**
  (matching the schema CHECK constraint), and keep the one generic `AgentWorkIntentRecorder<TTx>`.
- Every caller (`work`, `review`, and — post-collapse — `routine`) imports that one type and **deletes its local
  mirror** (`WorkAgentWorkIntentInput`/`WorkAgentWorkIntentRecord`/work's local `AgentWorkIntentRecorder`;
  `ReviewAgentWorkIntentInput`/`ReviewAgentWorkIntentRecord`/`ReviewAgentWorkIntentRecorder`). Because they all
  reference the **same** type, `tsc` enforces conformance mechanically — no convention.
- Add a **test** asserting the shared union's `kind` members exactly equal the schema's `agent_work_intents`
  CHECK-constraint kinds, so kind drift is caught mechanically (not documented and hoped-for).
- This is the same port Decision B grows to carry the baked start-payload — so unification and the Decision-B
  emit path are the same edit. It is **one** canonical against-grain mechanism, counted once.

## 7. Disposition rule (applied to every capability in Increment 0's worklist)
Per capability behind an `agent-orchestration → core-api` read/write (visible in the graph **or** hidden in a
composition-bundle like `DurableAgentQueueDeps`), in order:
1. **Dead / duplicate** → remove (a test proves the survivor works; cross-check AU20 first).
2. **A drain/schedule/build-time read of core domain state to make an orchestration decision** → **resolve it
   at emit inside core-api and bake the result; delete the orchestration read.**
3. **Agent-selection input** → baked at emit; overload → orchestration's own provision-time concurrency check.
4. **The running agent acting on core like a user (read or write)** → `CoreApiPort` (Decision A/C).
5. **A failure/terminal signal orchestration must send core** → `agent_run_admission_failed` (pre-handoff) or
   `session_ended`/`agent_run_lifecycle_changed` (post-session); core-api owns the reaction.

There is **no "recovery read" category.** The only individually-flagged items are (i) target-agent runnability
authority (§6 B, provision-time cover) and (ii) any Decision-D display query the founder signs — recorded in
`edge-disposition.md`, not a general bucket.

## 8. Acceptance criteria → verification
| # | AC | Verification |
|---|---|---|
| 1 | Location-transparent `CoreApiPort` seam exists (Application-wired, in-process today, remote-capable) | (a) Integration test builds `CoreApiPort` with `fetch = app.request` AND a stub network `fetch`; identical call succeeds via both. (b) Per-method contract test (§11): each method reaches its real route + middleware runs. (c) `npm run check` proves the contract type-resolves from a Service depending only on `@hyperidle/api-contract`. |
| 2 | The clean loop is real end-to-end and **orchestration reads zero core-api domain state** | (a) Integration test: a core-api Service resolves + emits a baked request; the drain builds+deploys performing **zero** core-api reads (asserted via composition + the §9-Inc-8 guard, which sees the composition-bundle pattern). (b) `resolveIntentInputInternal`'s core-domain reads are gone; own-state dedup reads remain and existing idempotency tests pass unchanged. (c) Self-recovery test: a run for a source changed after emit is not pre-checked away; the session runs and the agent's MCP read observes current state (or fails → emits the failure event → core reacts). (d) An agent write lands via the core-api route path (middleware ran). |
| 2b | **Pre-handoff failure report-back works and the AU15 brick is still prevented** | Integration test: force a pre-handoff terminal failure; assert `failOrRelease` emits `agent_run_admission_failed`, a core-api subscriber finalizes the routine run to `outcome="error"`, and AU15 AC-3d holds (intent `failed`, run `error`, second fire self-heals). `routine-scheduler.au15.integration.test.ts` AC-3d is rewired to the event mechanism and must pass. |
| 2c | **Routine-runs-as-sessions collapse** | A routine firing produces a session with no orchestration-side direct write to `routineRuns`; run outcome is set only via the report-back events. Test proves a fired routine's run finalizes through the event path; `@lore AA1` updated. |
| 3 | Every read/write in the regenerated worklist gets a disposition surviving re-challenge | `edge-disposition.md`: each capability + verdict + §7 disposition + reasoning; reviewer confirms. Post-fix graph shows each former read gone/baked and each write seam-routed; the new failure event shows as an against-grain EventBus inversion. |
| 4 | Phantom `session-requests → settings` absent everywhere | `grep` → zero hits (confirm; not in the current graph). |
| 5 | `generate-dependency-graph.ts` re-run; new baseline **sees the composition-bundle reads** and distinguishes seam-write / pushed-payload / raw-DI; replaces 48/22 | Run the script; assert (i) it now surfaces `DurableAgentQueueDeps`-style hidden edges, (ii) distinct edge-types, (iii) the new inversion; docs byte-consistent with JSON. |
| 6 | AU19's surviving permanent ports not silently reopened — **except the one founder-signed reopen: `work → cost` is deliberately removed (Decision D2)** | Diff check: `work → agent-selection` dissolves (selection → core-api, §Decision D2/edge-disposition), `work → cost` removed (reasoned, founder-signed), the remaining against-grain ports + inversions unchanged; a test asserts bet-decomposition proceeds when over-cap (no `blocked`); a test asserts the unified `AgentWorkIntentRecorder` (Decision G) — one shared contract, local mirrors deleted — with `kind`-set == the schema CHECK constraint. |
| 7 | practice-meeting deleted from its new home; no replacement | `packages/core-api/knowledge/src/practice-meeting.ts` + all references (`dispatch-bindings.ts`, `dispatch/service.ts` `runPracticeMeetingRoutine`, `dispatch`/`tool-handlers` ports, `routes/*`) removed; a test proves the builtin-routine registry no longer offers it and nothing else broke. |
| 8 | Per-session cost is tracked + served via `AgentOrchestrationPort`; the cap gate + aggregate display are unchanged (no mirror deleted — none exists) | Test: (a) a completed session's per-session cost is recorded by agent-orchestration and served via `AgentOrchestrationPort` (today `tasks.ts` returns `cost: null`); (b) the cost-cap gate (`checkCostCap`/`recordCostAndCheck`) still blocks at/over cap and its `costActual` columns are intact; (c) existing bet/routine/team/agent aggregate cost still renders unchanged; (d) nothing reads a cost value from a duplicate store (there is none). |
| 9 | A documented + **enforced** practice for a new orchestration→core edge | (a) Doc states the rule. (b) The guard (§9 Inc 8) fails CI on a new orchestration→core read port **or a new composition-bundle core-read** (incl. the `cost` `CostDeps` pattern); a test proves it fires. |
| 10 | The generic realtime broadcaster is retired; notifications intact; session activity streams from agent-execution gatewayed by orchestration | (a) the WS cost-forward is removed and notifications still fire the persisted row (test); (b) discrete changes use the minimal invalidation signal, no generic broadcaster; (c) an integration test observes a session stream served by `agent-execution` via the `AgentOrchestrationPort` gateway, and `SessionActivityBuffer` no longer lives in orchestration. |

Floor: `npm run verify` green; service-lane integration tests cover the loop, the write seam, both failure
channels, the routine collapse, the new per-session-cost door via `AgentOrchestrationPort` (no columns
deleted — cap gate + aggregate columns untouched), and the retired-broadcaster +
session-stream paths.

## 9. Ordered tasks (increments)

**Execution model.** Each Increment is an **independently shippable cycle**: architecture-touch-up (if needed)
→ write-tests (red) → write-code (green) → review → verify → **clean commit**, before the next. Fresh agents
per increment; each leaves `main` green. No mega-build.

**Increment 0 — Execute/verify the already-designed worklist (BLOCKER, reduced).**
The worklist is **already built and committed** — `edge-disposition.md` enumerates all **37** distinct
`agent-orchestration → core-api` edges (15 the graph saw + 22 hidden across `session-requests`, `cost`,
`run-orchestration`, `agent-selection`), each with a §7 verdict + reasoning, produced by
`scripts/scan-hidden-composition-edges.ts` (a real, generalized, run detector — §3) cross-checked against
source. Increment 0 does **not** re-discover; it:
- Verifies the disposition list against the current tree (re-run the scanner; confirm no drift) and gets the
  reviewer's sign-off on `edge-disposition.md`.
- Resolves the three founder-call open questions `edge-disposition.md` flags: (i) `run-orchestration`'s §6
  session-launch-infrastructure reads (`connections` provisioning, `filesystems` sandbox) — allowlist vs.
  bake; (ii) `agent-selection`'s Service fate under emit-time selection; (iii) confirm the whole `cost`
  consumer as the founder-signed cap-gate exemption.
- Rules on the mechanics already scoped: (a) where `resolveIntentInputInternal`'s resolution lands (§6 B);
  (b) `routineRuns` collapse shape (§6 B″); (c) per-builtin-routine disposition (§6 B′); (d) target-agent
  runnability cover.
- Designs `agent_run_admission_failed` (shape + subscribers) and confirms it clears the EventBus-inversion bar.
- Folds `scan-hidden-composition-edges.ts` into `generate-dependency-graph.ts` and turns it into the
  anti-regrowth guard (catches a new `ports.ts` core-read **and** a new composition-bundle core-read; allowlist
  = only the founder-signed flags). **Gate:** disposition-execution (Inc 2–5) begins after the reviewer signs
  `edge-disposition.md` + the founder answers the three §6 flags.

**Increment 1 — `CoreApiPort` write seam + transport + contract-test harness; prove one write.**
Add `CoreApiPort` (interfaces only) to `@hyperidle/api-contract` seeded with `work.createBet`; expose core-api's
Hono `app` as an in-process dispatcher; add `buildCoreApiPort(transport)`; wire the Application composition
roots (colocated in-process + split network); stand up the §11 contract-test harness. Migrate one
`tool-handlers` write (`create_bet`); delete its raw write port.

**Increment 2 — Route `tool-handlers` (agent-as-user) reads **and** writes through the seam.**
Migrate the remaining `tool-handlers` tool reads+writes (`create_task`, `send_message`, promote knowledge,
handoff, `create_item`, `create_team`, `add_agent`, `getTaskById`/`getBetById`/`search`/… reads) onto
`CoreApiPort`, each with its §11 contract test; remove the raw ports. Migrate `dispatch`'s assistant-turn
conversation write-backs.

**Increment 3 — Resolve-at-emit + collapse the drain; agent self-recovery; explicit failure channels (Decision B).**
Move each family's emit-time validation + run resolution (incl. the ast-`<userId>` runnability check) into the
emitting core-api Services; grow the `AgentWorkIntentRecorder` payload to the baked request. **Delete**
`resolveIntentInputInternal`'s core reads; collapse the drain to claim-and-dispatch; keep the AU9 CAS/dedup
reads. Build `agent_run_admission_failed` + core-api subscribers (routine finalize replacing the direct write;
retry/abandon) and the post-session retry reaction on `session_ended`/`agent_run_lifecycle_changed`. Apply the
`taskDispatchAttempts` ruling. Ensure the MCP surface supports live self-recovery + add its tests. Rewire AU15
AC-3d to the event mechanism; idempotency/dedup tests stay unchanged and green. **Largest increment — split by
intent family** (assistant_turn → task_run/session_start → routine_run → bet_decomposition → knowledge_action →
reengagement), each committed.

**Increment 4 — Routine-runs-as-sessions collapse + routine-scheduler ownership (ruling #4).**
Move the routine schedule evaluation + `routineRuns` lifecycle per §6 B″; `dispatch` stops mutating
`routine`/`routineRuns` as core tables; a firing emits a baked request and finalizes via events. Update
`@lore AA1`.

**Increment 5 — Dispose dispatch's builtin-routine + scheduler residue; delete practice-meeting (ruling #5).**
Per-routine disposition (agent session via seam vs. core-maintenance moved core-side). **Delete** practice-
meeting (`knowledge/src/practice-meeting.ts` + `runPracticeMeetingRoutine` + the `DispatchPorts.review`
port + `dispatch-bindings.ts` wiring + `tool-handlers`/`dispatch` port refs + `routes/*` + tests); build no
replacement. Every removal proven still served (test) — via baked payload, live MCP pull, or the seam.

**Increment 6 — Per-session cost + `AgentOrchestrationPort` (Decision D).**
No mirror deletion — there is none (§Decision D). Build `AgentOrchestrationPort` (agent-orchestration's read
door, symmetric to `CoreApiPort`) serving what orchestration owns and core-api does not already carry:
per-session cost + session/run history. Close the per-session cost gap — orchestration records per-session cost
(it already computes `totalCostCents` at session end; `@lore O2` stripped the old columns) and serves it via
the port, replacing `tasks.ts`'s `cost: null`; per the founder's cut, display shows the best tracked value, no
live recompute. Optionally remove the dead `tasks.costActual` value (never written). Leave the cap gate and the
aggregate display columns untouched. (Migrating `bets`/`routines.costActualMinor` to orchestration ownership is
a deferred concept-gate question, not this increment.)

**Increment 7 — Retire the realtime broadcaster; scope the three concerns (Decision E).**
Remove the redundant WS cost-forward (`ws-broadcaster.ts:59`; trivial). Retire `packages/core-api/realtime/` as
a generic Service: design the minimal (b) discrete-change invalidation signal (do **not** rebuild a
broadcaster); build the (c) session/harness streaming capability owned by `agent-execution`, gatewayed by
`agent-orchestration`, exposed via `AgentOrchestrationPort`; move `SessionActivityBuffer` out of orchestration
into `agent-execution`. Notifications (a) untouched.

**Increment 7b — Credentials/filesystems provisioning split (Decision F2).** Move the provisioning operation
(`connections.{build,apply}ProvisioningPlan`, `filesystems.{listFilesystems, startWatcher}`) into
orchestration, reading the connection/filesystem **record** via `CoreApiPort` at launch; leave the records +
their human-config routes/UI (`/api/connections`, `/api/filesystems`, `SettingsConnections`,
`SettingsFilesystems`) in core-api. Fold `isAtCapacity` into provision-time concurrency and retire
`agent-selection` as a standalone Service (Decision F1); `selectAgent` relocates into core-api's emit-time
resolution (part of Increment 3).

**Increment 8 — Re-baseline + MANDATORY anti-regrowth guard + docs.**
Extend `generate-dependency-graph.ts` to **see the composition-bundle pattern** + add `seam-write`/
`pushed-payload` edge-types + recognize `agent_run_admission_failed`; re-run; update
`plans/AU19/as-is-dependency-graph.md` + JSON (replace 48/22); confirm the phantom edge absent. Ship the guard
(a lint / `tsc`-negative-case that fails on a new orchestration→core read port **or** composition-bundle core-
read; allowlist = only founder-signed flagged items; a test proves it fires). Reword
`docs/architecture/runtime-simplification.md`'s colocation sentence + "Durable agent handoff" to the resolve-at-
emit + self-recovery + report-back model. Write the going-forward practice.

## 10. Contracts / type signatures
```
// @hyperidle/api-contract (zero runtime deps — TYPE-ONLY)
export interface CoreApiPort { readonly work: CoreApiWorkPort; readonly conversation: CoreApiConversationPort; /* … */ }
export interface CoreApiWorkPort { createBet(input: CreateBetRequest): Promise<CreateBetResponse>; getTaskById(id: string): Promise<TaskView | undefined>; /* the agent's tool reads+writes */ }
export type CoreApiTransport = (req: Request) => Promise<Response>;   // === hc's injectable fetch
```
- `buildCoreApiPort(transport: CoreApiTransport): CoreApiPort` — Application-layer factory.
- **Baked request (produced at emit):** `resolveIntentInputInternal`'s current *return* shape —
  `defaultAgentId` (resolved + runnability-validated at emit), `sourceKind`, `sourceId`, `streamId`,
  `taskId`/`teamId`, `sourceCorrelation`, chosen agent for selection families. A start-payload, **not** a
  re-validatable snapshot — the agent pulls current detail live via MCP. Carried by the existing
  `AgentWorkIntentRecorder` port (payload growth, not a new edge).
- **Failure report-back — two events:**
  - **NEW** `AgentRunAdmissionFailedEvent { type:"agent_run_admission_failed", intentId, kind, sourceKind,
    sourceId, failureCode, terminal, timestamp }` in `packages/shared/src/events.ts` (added to the
    `DomainEvent` union) — emitted by `failOrRelease` (pre-handoff). New against-grain EventBus inversion.
  - **EXISTING** `SessionEndedEvent` / `AgentRunLifecycleChangedEvent` (`events.ts:86` / `:25`) — post-session;
    new core-api *reaction*, no shape change.
- No new SQL tables assumed; any persisted field is an additive column on an orchestration-owned table (the
  `routineRuns` collapse in Inc 4 is the one schema decision, ruled in Inc 0/4).

## 11. Route / seam-capability contract obligation (TESTED, not a grep)
`AppType` is bare, so a grep of seam methods against `routes/*.ts` silently rots. Replaced by a hard tested
obligation: every `CoreApiPort` method has a contract test invoking it through the in-process transport,
asserting it reaches its real backing route and gets the expected response shape. The reviewer checks each seam
method in `edge-disposition.md` has a backing route + a passing contract test.

## 12. Security & abuse cases
- **Input-trust boundary for agent-authored fields** — agent writes now traverse the same validation/zod/
  middleware a human's do (net improvement over raw DI); a §11 contract test asserts middleware ran.
- **ast-`<userId>` templated-ID trust invariant** — preserved: the emitting core-api Service reloads the real
  `users` row and validates `kind==="ai"` + active/idle before baking `defaultAgentId`, never the human sender.
  A test asserts an assistant run for a human sender resolves to the AI assistant agent and rejects a non-
  runnable one at emit.
- **Auth/actor on agent writes** — the seam carries the agent's owning identity as route actor
  (`c.get("userId")`); a test asserts it. Per-agent authorization is the deferred follow-up; this WP must not
  regress actor correctness.
- **Target-agent runnability under self-recovery + emit→deactivate→drain race** — provision-time credential-
  context failure (a deactivated agent cannot provision valid identity); a test asserts a deactivated agent's
  run does not proceed with authority. Founder confirms at the concept gate.
- **Stale-payload trust** — a test asserts a payload for a since-deleted source leads to the agent discovering
  it via MCP and reporting back, never a fallback orchestration core read.
- **Decision D cost query** — the new `core-ui → agent-orchestration` surface reads display data only; no core
  mutation; the write-gate stays core-side. A test asserts it cannot write.

## 13. Migrations (rename/remove/move enumeration)
- `session-requests/src/service.ts`: `delete` `resolveIntentInputInternal`'s core-domain reads +
  `requireRunnableActor` + the `taskDispatchAttempts` re-check; `keep` the CAS/dedup mechanics; `failOrRelease`
  — `remove` the direct `deps.routine.updateRoutineRunIfRunning` write, `add` an `emit` of
  `agent_run_admission_failed`. Resolution helpers `move` to core-api per the Inc-0 ruling.
- Emitting core-api Services (`work`/`conversation`/`knowledge`/`routine`/`review`/`org`/`users`): `add`
  emit-time validation + baked-request assembly; `add` an `agent_run_admission_failed` subscriber (routine →
  finalize run `error`) + the retry/abandon reaction.
- `packages/core-api/src/services/durable-agent-queue.ts`: `shrink` `queueDeps` to the own-state deps the
  collapsed drain still needs.
- `packages/shared/src/events.ts`: `add` `AgentRunAdmissionFailedEvent` to the `DomainEvent` union.
- `dispatch/src/service.ts` + `dispatch-bindings.ts`: `move` routine scheduler + `routineRuns` lifecycle
  core-side; `dispose` builtin-routine bodies; `delete` practice-meeting path; `reroute` assistant-turn writes
  to the seam.
- `packages/core-api/knowledge/src/practice-meeting.ts`: `delete` (+ all references).
- **Cost (Decision D) — addition only, NO column deletion.** There is no cost mirror (§6 D): the cap gate
  reads `users`/`teamMembers.costActual` and the aggregate columns are the sole per-entity stores. `keep` all
  four `costActual`/`costActualMinor` columns + their writers (`cost-cap.ts`, `user-store.ts`, `team-lookup.ts`,
  `work-service.ts`, `routine-service.ts`) + the cap gate, entirely untouched. `add` orchestration-side
  per-session cost tracking + `AgentOrchestrationPort` (read API) in `@hyperidle/api-contract` + Application
  wiring for `core-ui`, serving per-session cost (replacing `tasks.ts`'s `cost: null`) + session/run history.
  Optionally `delete` only the dead-value `tasks.costActual` (never written).
- **Realtime (Decision E):** `remove` the WS cost-forward (`ws-broadcaster.ts:59`); `retire`
  `packages/core-api/realtime/` as a generic Service; `add` a minimal discrete-change invalidation signal;
  `move` `SessionActivityBuffer` from `agent-orchestration/run-orchestration` into `agent-execution`; `add`
  the session-stream gateway on `agent-orchestration` exposed via `AgentOrchestrationPort`.
- `routineRuns` (`schema.ts:693`): `collapse` per Inc-4 ruling; update `@lore AA1`.
- `scripts/generate-dependency-graph.ts`: `extend` (composition-bundle detection + edge classes + guard).
  `as-is-dependency-graph.md` + JSON: `rebaseline`. `runtime-simplification.md`: `reword`.

## 14. Protected tests
- **Idempotency/dedup — STAY GREEN UNCHANGED.** `agent-session-requests.integration.test.ts` (idempotent
  create; concurrent-duplicate → `winners.toHaveLength(1)`) and
  `agent-work-intent-worker.routine-selection.integration.test.ts` (idempotent record). They assert dedup, not
  domain re-validation; the own-row CAS is kept verbatim.
- **AU15 permanent-routine-brick guard — PROOF OBLIGATION, rewired not dropped.**
  `routine-scheduler.au15.integration.test.ts` AC-3d must still pass after the direct finalize is re-homed onto
  `agent_run_admission_failed` + a subscriber; the *guarantee* (no permanent brick) is identical.
- **Selection tests — REWRITTEN in Increment 3** to the baked-agent + provision-defer mechanism.
- The surviving against-grain DI ports + EventBus inversions behavior tests (AC #6) — unchanged.
- The `HarnessPort` seam tests — untouched.
- **New protected guarantee:** the AC #2a "orchestration reads zero core-api domain state" test (must include
  the composition-bundle path, not only `ports.ts`).

## 15. Shared files (parallel-WP overlap)
`packages/api-contract/src/*` (seam); `packages/shared/src/events.ts` (payload growth + new event);
`packages/core-api/src/app.ts` / `server-factory.ts` (dispatcher + drain driver);
`packages/core-api/src/services/{durable-agent-queue,run-orchestration-composition,dispatch-bindings,
tool-handlers-bindings}.ts`; the emitting core-api Service packages; `packages/core-api/knowledge/*`
(practice-meeting delete); `packages/agent-orchestration/{session-requests,dispatch,tool-handlers}/src/*`; the
Application composition roots (colocated boot + remote-server); `scripts/generate-dependency-graph.ts` +
`plans/AU19/*`; `packages/db/src/schema.ts` (cost-mirror columns); `packages/core-api/realtime/*` +
`packages/core-api/notifications/src/install.ts` (Decision E); `packages/agent-execution/*` (session-stream
owner); `packages/web/src/services/ws-client.ts` + cost/session UI (new door + minimal signal). **AU20 coordination:** none open (AU20 merged), but cross-check `log_task` + duplicate-read
cases against AU20's shipped diff before re-touching.

## 16. Risks & open questions
- **R1 (highest) — scope/effort. XL, unchanged by AU20** (§18). Mitigated by 9 independently-shippable
  increments + Inc 3's per-family split + Inc 4/5's per-routine split.
- **R2 — the graph blindness (§3).** If Inc 0 enumerates from the graph instead of source, the largest read set
  is missed and the WP "passes" hollow. Mitigation: AC #2a + AC #5 + the guard all require seeing the
  composition-bundle pattern.
- **R3 — dispatch untangle (Decision B′/B″).** The scheduler+routine+assistant+queue monolith is the biggest
  single refactor; the routine-collapse touches live scheduling. Mitigation: Inc 4/5 isolate it; protected
  scheduler tests + AU15 AC-3d gate.
- **R4 — pre-handoff channel is genuinely new.** Under-building it reopens the AU15 brick. Mitigation: AC #2b +
  the rewired AC-3d test are hard gates; Inc 0 designs the event + subscribers before any deletion.
- **R5 — seam↔route fidelity without compile-time typing** (bare `AppType`). Mitigation: §11 hard obligation;
  typed-`AppType` deferred.
- **R6 — Decisions D + E, re-scoped after the cost trace.** D shrank: there is **no cost mirror to delete**
  (verified — `cost-cap.ts` is the single authority writing per-aggregate totals into core-api tables via DI;
  the cap gate reads them, so nothing is dead or duplicated). D's real content is the per-session cost gap +
  the narrowed `AgentOrchestrationPort`, both bounded. E is the larger piece: retire the generic broadcaster
  (the redundant cost-forward deletion is trivial), a minimal invalidation signal, and a scoped
  `agent-execution`-owned session stream. Mitigation: Inc 6/7 trace from source; cap gate untouched; do not
  force the aggregate-column migration (deferred concept-gate question).
- **R7 — actor identity through the write seam.** §12 tested obligation.
- **R8 — MCP tool-call *response* streaming — PARKED, not decided.** Whether the AI's live output as it is
  generated (as opposed to the recorded `tool_call_recorded` log) should stream into core/UI is a real,
  separate, undecided question. Explicitly out of scope for this pass; do not design or fold it in. Flagged so
  Decision E is not mistaken for having settled it.

## 17. Feasibility reference
See `feasibility.md` (re-derived): Probe 0 (graph blindness) **GO-WITH-WARNING**; Probe 1 (injectable-`fetch`,
bare `AppType`) **GO**; Probe 2 (seam home) **GO-WITH-CONSTRAINT**; Probe 3 (resolve-at-emit + collapse; new
pre-handoff channel; `taskDispatchAttempts` = work-owned) **GO-WITH-CHANGE**; Probe 4 (dispatch monolith)
**GO-WITH-COST**; Probe 5 (practice-meeting delete-from-knowledge) **GO**; Probe 6 (cost display API)
**GO-WITH-DISCOVERY**.

## 18. Effort / complexity call — **XL (reaffirmed; not reduced by AU20)**
The consumed *surface* shrank ~65% (139→48 DI edges; 45→15 visible cross-layer edges; 31→23 services), and the
seam/`CoreApiPort` portion is genuinely **smaller** now (only `tool-handlers` + a slice of `dispatch` consume
it). But AU20 did **surface/method-count reduction and composition tidying, not behavioral decoupling** — every
hard change AU21 exists for is 100% still ahead, and two of them are, if anything, harder than when last scoped:
- The largest orchestration→core read set is **hidden**, not removed (§3) — same deletion work, plus new
  detection/guard work so it can't stay hidden.
- `dispatch` has become a single 1660-line scheduler+routine+assistant+queue monolith — the routine-runs-as-
  sessions collapse (ruling #4) and the builtin-routine disposition now cut through one deeply entangled file.
- The drain read-deletion, the new pre-handoff failure channel, the practice-meeting deletion, and the new cost
  API are all unchanged in difficulty.
The 2026-07-26 seam/state-ownership additions, after tracing the cost columns from source, are smaller than
first drafted. **Decision D carries no mirror deletion** — there is no cost duplicate (`cost-cap.ts` is the
single authority writing per-aggregate running totals into core-api tables via DI; the cap gate reads them, so
nothing is dead or duplicated). D reduces to a **bounded** per-session-cost capability + the narrowed
`AgentOrchestrationPort`. **Decision E is the real added work**: retiring the generic broadcaster (the redundant
cost-forward deletion is trivial), a minimal discrete-change signal, and a scoped `agent-execution`-owned
session stream. The mechanical hidden-edge scan (§3, `scan-hidden-composition-edges.ts`) moved the worklist *into*
architecture (Increment 0 shrinks from "discover + decide" to "verify + rule on 3 flags"), but it also grew the
count: **37** edges, not 15 — and revealed **two more hidden read-heavy consumers** (`run-orchestration`,
`agent-selection`) the paused analysis never enumerated. So the Decision-B read-deletion surface is *larger*
than previously scoped (session-requests + run-orchestration + agent-selection + dispatch), which reinforces —
not lowers — the XL call. The 2026-07-27 founder decisions net roughly neutral on build effort: `work → cost`
removal (Decision D2) is a small deletion that *simplifies* (a port + a block gone); `agent-selection`
dissolution (F1) *removes* a Service; the credentials/filesystems split (F2, Increment 7b) is bounded. The one
genuinely additive piece — the cross-layer **settings reorg (F3)** — is scoped as its **own `/design` pass /
follow-up WP**, dependent on the `AgentOrchestrationPort` door, so it does not inflate AU21's build increments;
it is a named downstream design dependency, not in-scope build here. Net: still **XL**, **9 independently-shippable increments** — driven by the
behavioral core (drain read-deletion across four consumers, routine collapse, dispatch untangle) and Decision
E, not by Decision D. Summary for
`/work-planning`: the consumed surface got smaller, the behavioral core did not, and the four-Layer
door/streaming model is in scope — but the cost piece is a per-session gap, not a mirror teardown.
