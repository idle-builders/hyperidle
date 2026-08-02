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
  `kind`-discriminated), counted as two edges only by pair-counting. See Decision G. Two of these four are
  removed by AU21's 2026-07-27 rulings: `work → cost` (Decision D2) and `work → agent-selection` (Decision F1);
  `work`/`review → session-requests` unify into the one canonical recorder (Decision G).**
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
6. **Per-session cost + the `AgentOrchestrationPort` read door** (Decision D) do not exist; per-session cost is unserved (`tasks.ts` → `cost: null`).
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
   │    contradicts its instructions it adjusts or reports the request stale. (A deactivated agent fails
   │    provisioning — reported via the SAME pre-handoff agent_run_admission_failed channel below,
   │    failureCode TARGET_AGENT_NOT_RUNNABLE — no bespoke race handling, no stale-authority run proceeds.)
   │  ★ CONTINUED PUSH (Decision B‴): if the fact changes while work is OUTSTANDING, core-api RE-EMITS the
   │    request (same door, push-only). Orchestration, from its OWN state: not-started → supersede the pending
   │    request (freshest baked payload wins); running → deliver on next turn (follow-up session). True mid-run
   │    injection is harness-capability follow-up, not in scope.
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
   `taskId`/`teamId`, `sourceCorrelation`, and for selection families the chosen agent) — through the one
   canonical `AgentWorkIntentRecorder` port (`work`/`review → session-requests`, unified per Decision G). This
   **grows the existing permanent port's payload; it does not add an edge or reopen an AU19 ruling.** The ast-`<userId>` trust
   invariant moves here: the emitting Service reloads the real `users` row and validates `kind==="ai"` +
   active/idle before baking `defaultAgentId`, never the human sender.
2. **The drain collapses to claim-own-dedup + dispatch-the-baked-request.** The AU9 CAS/claim mechanics
   (`claimIntentInternal`, `agentSessionRequests`/`agentWorkIntents`/`explicitSessionStarts` own-state reads)
   stay verbatim. Every `deps.{conversation,work,knowledge,routine,review,teams,users,config,agentSelection}.*`
   read in `resolveIntentInputInternal` — including `requireRunnableActor` and the `taskDispatchAttempts`
   `status!=="requested"` re-check — is **deleted from the drain** (relocated to emit-time core-api, de-
   duplicated to one place). Overload → orchestration's own provision-time `ConcurrencyLimitError`.
3. **A running agent self-recovers** via the MCP/`CoreApiPort` tools it already uses. **Extended by Decision
   B‴: the push does not stop at launch** — if the fact changes while the work is still outstanding, core-api
   re-emits (same door, push-only), and orchestration supersedes the pending request or delivers the update on
   the next turn. Self-recovery via MCP remains the fallback for staleness core-api did not re-push.
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

*Ruling — resolution ownership (Increment 0, final).* **Split per emitting Service — NOT one shared core-api
resolution module.** Each of the seven branches in `resolveIntentInputInternal`
(`session-requests/src/service.ts:719-909`) already reads exactly one domain's own tables, and every real emit
call site already lives inside or beside that domain's own package, not in one shared place: `assistant_turn` is
enqueued in `routes/threads.ts:1208` (which already imports `insertMessage`/`updateThread` straight from
`@hyperidle/conversation`'s `conversation-store.ts`); `session_start`/`task_run` in
`routes/sessions-routes.ts:392`; `bet_decomposition` literally already inside
`packages/core-api/work/src/bet-decomposition.ts:263,456`; `knowledge_action` in `routes/knowledge.ts:806`;
`reengagement` already inside `packages/core-api/review/src/proposed-call-workflow.ts:290,399`. Moving the five
resolution bodies into one shared `packages/core-api/src/services/` module would force every one of these call
sites to reach into one hub that itself imports all seven domains' read functions — recreating, inside core-api,
the exact `dispatch`-style cross-domain-hub shape (Decision B′) this WP dismantles in orchestration.
`packages/core-api/src/services/*` is, by existing convention, the Application-layer COMPOSITION ROOT
(`durable-agent-queue.ts`, `dispatch-bindings.ts`, `tool-handlers-bindings.ts`, `run-orchestration-composition.ts`,
`cost-bindings.ts`, `agent-selection-bindings.ts` — wiring DI objects together), not a home for business/
validation logic.

**Concrete placement:**
- `assistant_turn` → a resolver added to `packages/core-api/conversation/src/` (paired with its emit site,
  `routes/threads.ts`).
- `session_start`, `task_run` → resolvers added to `packages/core-api/work/src/` (paired with
  `routes/sessions-routes.ts`; `work` already owns `taskDispatchAttemptStore`, `work-service.ts:62`).
- `bet_decomposition` → extends `packages/core-api/work/src/bet-decomposition.ts` in place (already the emit
  site, `:263,456`).
- `knowledge_action` → a resolver added to `packages/core-api/knowledge/src/` (paired with `routes/knowledge.ts`).
- `routine_run` → a resolver added to `packages/core-api/routine/src/routine-service.ts`, co-located with the
  scheduler once Decision B′/B″ move it core-side (Increment 4) — at that point the emit site and the resolver
  are the same package.
- `reengagement` → extends `packages/core-api/review/src/proposed-call-workflow.ts` in place (already the emit
  site, `:290,399`).
- The one truly cross-cutting piece — `requireRunnableActor` (`session-requests/src/service.ts:700-705`;
  identical in every branch, reads only `users`) — moves to **one** exported helper in
  `packages/core-api/users/src/` (alongside `user-store.ts`), imported by each of the six packages above via
  ordinary same-layer core-api DI (already a normal pattern — `cost-cap.ts` similarly depends on
  `users`/`org`/`work`/`settings`). This is the one piece that *is* shared, because it is genuinely one
  cross-domain invariant (ast-`<userId>` trust), not five domain-specific resolutions.
- `session-requests/src/service.ts` keeps only `claimIntentInternal` (`:914`), `failOrRelease`'s CAS update,
  `processIntentsInternal`'s claim loop, and `insertIntentInternal`/`enqueueWorkIntent` — all reading/writing
  solely `agentWorkIntents`/`agentSessionRequests`/`explicitSessionStarts`, its own tables. This is the concrete
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
- **Builtin-routine bodies — per-routine disposition (Increment 0, final ruling): all four are
  core-maintenance-moved-core-side; NONE is agent-work-via-seam.** Read from source (`dispatch/service.ts`),
  none of the four launches an agent/LLM session or an orchestration run — each is a deterministic read+write
  against core-api tables, reached only through `DispatchPorts`' composition-bundle (the same graph-blindness
  pattern as §3) because the SCHEDULER that fires them happens to live in agent-orchestration today, not because
  the work itself needs an agent:
  - **post-bet-retro** (`runPostBetRetro`, `dispatch/service.ts:767-836`): reads `work.getBetById`,
    `conversation.getThreadIdsByHost`, `work.findRetroItemByThreadIds`; writes `conversation.insertThread` +
    `work.createItem` in one transaction, assembling a review item from the bet's own
    `hypothesis`/`completedAt`/`revisionLog` fields by string template — no LLM call, no agent session
    requested anywhere in the function. **Core-maintenance-moved-core-side.**
  - **portfolio-retro** (`runPortfolioRetro`, `:838-901`): reads `knowledge.listRecentByLayers`; writes the same
    `conversation.insertThread` + `work.createItem` shape from a templated aggregation of recent L3/L4 items —
    no agent involved. **Core-maintenance-moved-core-side.**
  - **knowledge-promotion** (`runKnowledgePromotion`, `:905-943`): calls only `knowledge.runAutoPromotionSweep`
    + `knowledge.recomputeAttentionForCandidates` — existing `knowledge`-owned sweep algorithms, deterministic.
    **Core-maintenance-moved-core-side** (already implied by `edge-disposition.md`'s `knowledge.{list, sweep}`
    row; this ruling confirms no agent-work reading survives in this routine).
  - **knowledge-decay** (`runKnowledgeDecay`, `:945-955`): calls only `knowledge.runStaleSweep` — same shape.
    **Core-maintenance-moved-core-side.**

  **Correction to `edge-disposition.md`'s `dispatch` table (found during this ruling):** its
  `work.create | §4 seam | retro-item creation = agent-as-user write` line is wrong — `work.createItem` in
  `runPostBetRetro`/`runPortfolioRetro` is called by the SCHEDULER firing a deterministic routine body, not by a
  running agent acting like a user; there is no agent session anywhere in this path. Corrected in
  `edge-disposition.md` to `§1/§2 core-maintenance-moved-core-side`, and the `conversation` rows there are split
  so assistant-turn's reads/writes (genuinely agent-as-user, §4 seam) are no longer bundled with retro's reads/
  writes (core-maintenance, §1/§2). Once Decision B′/Increment 4 moves the scheduler itself core-side, all four
  builtin bodies become in-package calls with **zero** residual `agent-orchestration → core-api` edge — the
  same dissolution `insertRoutineRun` gets under Decision B″.
  - **practice-meeting is deleted** (ruling #5, unchanged by this pass).
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
events (§6 B4), never a direct cross-layer write.

**Ruling (Increment 0, final): shrinks to a core-api definition-only audit derived from events — NOT an
orchestration-owned projection.** `routineRuns` (`schema.ts:693`) stays exactly where AU13 already put it —
`packages/core-api/routine/src/routine-service.ts` remains, per its own header comment, "the only module
permitted to read or write `routines`, `routine_runs`" (`routine-service.ts:1-7`); this ruling does not reopen
that boundary. What collapses is the three orchestration-side DIRECT WRITE paths into it, all confirmed by
source:
1. `dispatch/service.ts`'s `ports.routine.insertRoutineRun` (fire-time insert, 4 call sites: `:697,1032,1045,
   1064`) — dissolves by construction once Decision B′/Increment 4 moves the schedule-fire decision itself
   core-side: the insert becomes a same-package, same-transaction call inside core-api's own scheduler, not a
   cross-layer edge left to collapse at all.
2. `session-requests/src/service.ts`'s `deps.routine.updateRoutineRunIfRunning` (`failOrRelease`, `:992`) —
   already re-homed onto the new `agent_run_admission_failed` event by §6 B4/§13.
3. `run-orchestration`'s `ports.routine.updateRoutineRunById` (`transition-run.ts:180`,
   `runtime-reapers.ts:184`) — re-homed onto the existing `session_ended`/`agent_run_lifecycle_changed`
   post-session reaction (§6 B4), a core-api subscriber calling `routine-service.ts`'s `updateRoutineRun`.

Once all three collapse, `routineRuns` receives **zero** direct writes from orchestration — every mutation
originates inside core-api itself (synchronously in the fire transaction, or as an event-subscriber reaction to
orchestration's own lifecycle events). That is precisely "definition-only audit derived from events": the row
is core-api's, the table does not move, no new schema/table is invented, and the UI-facing read path
(`routes/routines-routes.ts:224`, already calling `routineService.listRoutineRuns`/`sumRunCost` in-process)
stays exactly as fast and local as it is today.

The rejected alternative — "an orchestration-owned projection of session lifecycle" — is rejected because it
would (a) require inventing a NEW table/schema owned by agent-orchestration duplicating run history, breaking
AU13's existing exclusive-ownership rule for no compounding benefit; (b) force `routines-routes.ts`'s UI-facing
run-history read to cross the seam via a new `AgentOrchestrationPort` method it does not need today; and (c)
recreate exactly the "mirror" shape Decision D spent a full source-trace proving does **not** exist anywhere
else in this system (§6 D) — there is no reason to introduce the first one here. No schema change beyond what
Increment 3 already plans (`agent_work_intents.status` gaining `superseded`, Decision B‴) — `routineRuns`'s
existing columns (`outcome`, `endedAt`, `errorMessage`, `sessionId`, `summary`, `costMinor/Currency`) are
unchanged; only the call sites of its writes move. `@lore AA1` (`packages/db/src/schema.ts:685-692`) updated
accordingly.

### Decision B‴ — The push continues: re-emit on fact-change; supersede (not-started) or deliver-on-next-turn (running) — with true mid-run injection flagged as harness-capability work (founder)
Extends Decision B step 3. Core-api does not fire-and-forget: if the underlying fact changes while the work is
still outstanding, core-api emits **another** request for the same work through the same `AgentWorkIntentRecorder`
door — still push-only, still zero orchestration read-back. Orchestration handles it from its **own** state.

**Q1 — how core-api signals "update to outstanding work" vs. "new request" (traced):** `agent_work_intents`
has a unique index `agent_work_intents_identity_uq` on `(kind, sourceId, idempotencyKey)`
(`schema.ts:381` region). `insertIntentInternal` (`session-requests/src/service.ts:1042`) **dedups**: a repeat
with the *same* `(kind, sourceId, idempotencyKey)` is a silent no-op returning the existing row; a *different*
`idempotencyKey` for the same `(kind, sourceId)` inserts a **second** row (no supersede today). **Design:** treat
`(kind, sourceId)` as the **stable work identity** and `idempotencyKey` as a **version token** — core-api bumps
it on re-emit and carries a fresh baked payload (the Decision-B start-payload). No new schema *field* is required
(identity + version already exist); the additions are (a) an orchestration **supersede** interpretation and (b)
a `superseded` value on `agentWorkIntents.status` (today `pending|claimed|handed_off|failed`, `schema.ts:424` —
an additive CHECK value, no new table).

**Q2 — how orchestration tells "not started" from "running", own-state only (traced):** sufficient with existing
state, no new tracking. `agentWorkIntents.status` (`pending`/`claimed` = not started; `handed_off` = a request
exists) + `agentSessionRequests` queried by source (`listRequestsSourceInternal(sourceKind, sourceId)`,
`service.ts:342/1825`; `status="running"` with `sessionId`) + the `sessionRunRegistry`
(`session-run-registry.ts`) of active sessions. This is the AU9 CAS bookkeeping orchestration has always been
allowed to read. Only the supersede/deliver **logic** is new.

**Q3 — "deliver into a live session" is NOT free; it is a harness-capability question (traced):** there is **no
mid-run input channel today.** `RunOptions.input` (`run-orchestration/contracts.ts:292-316`) is set **once at
launch**; `runSession` runs to a single terminal `RunResult` (`contracts.ts:281`); the worker protocol
(`worker-ingress.ts:84-90`) has message types `register/event/session_result/error/pause/resume` — **no
server→session "deliver input"** (pause/resume are worker→server pool backpressure). Decisively, harness adapters
spawn the real CLIs with **stdin closed** (`harness-session-probe.ts:23-28`, `@lore AM2`: "so interactive CLIs
don't block waiting for input"; `codex exec` "may block" on stdin) — the current claude/codex/opencode execution
model consumes its prompt at launch and cannot receive new input mid-run.

**Design (two paths):**
- **Not-yet-started → supersede (portable, in scope).** Core-api re-emits with a fresh version for the same
  `(kind, sourceId)`. The drain, before claiming, checks for a newer pending intent for that identity; the newest
  (freshest baked payload) wins, the older is marked `superseded`. Reuses the identity index + AU9 CAS. Real but
  bounded.
- **Already-running → deliver-on-next-turn (portable, in scope).** Orchestration records the update as the fresh
  pending intent for `(kind, sourceId)`; when the running session ends, the follow-up session launches with the
  freshest baked payload. For thread-backed work (assistant), this already happens naturally — a new thread
  message drives the next `assistant_turn` session with the updated transcript.
- **True mid-run *active* injection (deliver into the live session while it runs) — HARNESS-CAPABILITY WORK,
  NOT in scope here.** It requires an adapter that accepts streaming/interactive input mid-run; the current
  stdin-closed CLI adapters explicitly do not. Scope it as harness-capability-gated follow-up (advertise + use
  only where an adapter supports it) — do **not** assume it is free. This is the honest boundary: the founder's
  "deliver the update into the live session as a message, actively" is achievable *portably* only as
  next-turn delivery; simultaneous mid-run injection is a real, separate, harness-gated mechanism.

**Increment:** the supersede + deliver-on-next-turn paths **extend Increment 3** (they ride the same
emit-path + drain-collapse edit; the `superseded` status + the drain's identity-supersede check are small
additions there). True mid-run injection is a **named harness-capability follow-up**, not an AU21 increment.

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

> **SUPERSEDED for `connections` by Decision J (founder challenge, 2026-08-02).** F2's "the record stays
> core-api because the UI owns it" rationale is a *convenience/UI* argument, not a *domain* argument — the
> exact class of reasoning the founder later ruled inadmissible ("domain is the only accepted reason for such a
> cut, everything else has to engineer properly around it"). Decision J re-adjudicates `service_connections`
> against the domain bar and finds it is **agent-session-provisioning domain, not core domain** → the record
> **moves** to agent-orchestration; the `CoreApiPort.connections` seam F2 built is **retired**. F2's treatment
> of `filesystems` and the LLM-key `credentials` catalog is *not* disturbed by Decision J (see J for why
> `credentials` legitimately stays core-side and `filesystems` co-moves). Decision J is scoped as its **own
> follow-up WP**, not an AU21 increment — F2 as shipped closes the *boundary* defect; J is the *domain* refinement.

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
- Widen `@hyperidle/shared`'s `AgentWorkIntentRecorderInput` to the **complete discriminated union** (matching
  the schema CHECK constraint), and keep the one generic `AgentWorkIntentRecorder<TTx>`. **(Decision I, 2026-07-31:
  the union shrinks from seven kinds to SIX — `bet_decomposition` is removed with the built-in mechanism. Every
  "seven-kind" reference in Decisions B/G and §10/§13 below is the pre-Decision-I count; the kind-set test and the
  schema CHECK become the six-kind set `assistant_turn, session_start, knowledge_action, routine_run, task_run,
  reengagement`.)**
- Every caller (`work`, `review`, and — post-collapse — `routine`) imports that one type and **deletes its local
  mirror** (`WorkAgentWorkIntentInput`/`WorkAgentWorkIntentRecord`/work's local `AgentWorkIntentRecorder`;
  `ReviewAgentWorkIntentInput`/`ReviewAgentWorkIntentRecord`/`ReviewAgentWorkIntentRecorder`). Because they all
  reference the **same** type, `tsc` enforces conformance mechanically — no convention.
- Add a **test** asserting the shared union's `kind` members exactly equal the schema's `agent_work_intents`
  CHECK-constraint kinds, so kind drift is caught mechanically (not documented and hoped-for).
- This is the same port Decision B grows to carry the baked start-payload — so unification and the Decision-B
  emit path are the same edit. It is **one** canonical against-grain mechanism, counted once.

### Decision H — Re-derived from the founder's cycle principle (2026-07-31): ZERO orchestration reads back into core; core bakes, the agent self-recovers via MCP, orchestration only formats
**This replaces the prior "seam-route the reads" H1/H2/H3 draft entirely** (founder re-grounding). The governing
rule is stronger than "route reads through the governed seam": **agent-orchestration performs ZERO reads back
into core-api — not raw DI, not even the `CoreApiPort` seam — to prepare or run a session.** The cycle (§5)
splits cleanly into three responsibilities:
1. **core-api assembles + validates + BAKES everything a run needs, at emit time** (reading its own state —
   legal), onto the `AgentWorkIntentRecorder` payload;
2. **the running agent pulls any *live* detail through its OWN MCP / `CoreApiPort` tools** (legal shape (c) — the
   agent acting like the UI), self-recovering if reality changed;
3. **orchestration only turns the baked bundle into the format the harness/sandbox needs** (pure transport,
   zero core reads) — "information *assembly* is core's job; information *orchestration into harness format* is
   orchestration's job — that is the entire key aspect of the cycle."

This **resolves the prior draft's H-open founder question** (file-based context vs. agent-pulls-via-MCP): the
answer is *both, split by role* — core bakes the full content, orchestration keeps writing sandbox files, but
their CONTENT is the baked payload (never an orchestration read); staleness is handled by the agent's own live
MCP self-recovery (§5c), never by a launch-time re-read. It also **obsoletes most of the new seam READ surface**
the prior draft proposed (`getTaskById`/`getTeamById`/… for context assembly, `settings.readServerConfig` for
the runner): those reads are DELETED, not moved to the seam. The three re-derived shapes + one capability removal
(Decision I):

**Unifying mechanism for every orchestration→core WRITE-back (reads are baked; writes ride events).** The
founder's "zero ways to touch back into core" covers writes too. Every orchestration→core writeback in the ten
pairs becomes a **core-api event subscriber** reacting to an event orchestration already emits — the exact,
founder-accepted pattern already shipped for routine (`routine-run-session-end-reactions.ts`). Reads are baked at
emit; writes are reported via events and core-api owns the reaction. No orchestration→core call of any kind
survives.

**H1 — post-session writeback, now `task_run` ONLY (the `decomposition` half is DELETED, not migrated — see
Decision I).** `session-requests`'s lifecycle-inbox drain writes back two things today: `projectTask` (task
dispatch-attempt bookkeeping, `service.ts:93`) and `projectDecomposition` (bet `decompositionStatus`,
`service.ts:102`). **Decision I removes the whole `bet_decomposition` mechanism, so `projectDecomposition` +
`updateBetDecompositionStatusIfRunning` + the `decomposition` `sourceKind`/projector simply cease to exist —
nothing to migrate.** H1 keeps only the `task_run` half: `taskDispatchAttempts` is dispatch **bookkeeping**
(attempt/retry state keyed on `requestId`, `work-service.ts:62`), not duplicated business state, and its terminal
finalize is a legitimate post-session concern.
- **Design (unchanged from the corrected draft, task-only):** add
  `packages/core-api/src/services/work-session-end-reactions.ts` (reuse `routine-run-session-end-reactions.ts`'s
  `registeredBuses` guard + explicit `registerWorkSessionEndReactions(db, eventBus)` wiring), subscribing
  **`agent_run_lifecycle_changed` only**, keyed on its `state` field (`"completed"|"failed"|"cancelled"`,
  `events.ts:82-91`, required `requestId`, emitted on every terminal state incl. `completed`,
  `transition-run.ts:115-124`) — NOT `session_ended` (whose `SessionOutcome` `"completed"|"crashed"|"stopped"|
  "not_returned"` vocab does not match `taskDispatchAttemptStore.updateIfActive`, `work-service.ts:71-77`). For
  `sourceKind==="task"` → `updateIfActive(tx, event.requestId, {status: event.state, sessionId})`. Idempotent
  (the `status IN ('requested','running')` predicate).
- Flip `lifecycleProjectors.task` to `observeOnly`; delete `projectTask` + `DurableAgentQueueDeps.lifecycleProjection.work`.
- Relocate `reapTerminalTaskDispatchAttempts` out of `reapExpired`'s single atomic transaction
  (`service.ts:1036`) into `server-factory.ts`'s generic retention reaper (`taskDispatchAttemptStore.reapTerminal`
  directly — harmless atomicity split, pure terminal-row GC); delete `DurableAgentQueueDeps.work`.
- **Durability parity note (honest):** in-process `EventBus` delivery replaces the durable inbox for this
  writeback — the trade routine already made; reactions are idempotent + state-guarded, a lost event leaves the
  row pre-terminal and self-heals on the next lifecycle event/reaper.

**H2 — the assistant turn is NOT special: core bakes the transcript, the runner's reads are DELETED, and turning
the baked content into the harness session is ORCHESTRATION's core job — NOT an agent MCP pull (founder,
re-derived).** The prior draft ("the agent pulls its own transcript via a new `read_thread` MCP tool") is
**deleted** — it was substantially wrong. Founder, verbatim: *"the agent does not pull its own transcript. that
is THE CORE TASK of the orchestration… the orchestration has to reassemble the session… so that for the agent
session/harness it feels like it is naturally embedded in this conversation… knowing which pieces of the thread
need to be put into the new iteration in this harness session."* This does **not** reopen "zero reads back into
core": core still bakes the conversational content; orchestration still never reads core. What changes is WHO
decides which content enters this harness invocation — **orchestration**, from the baked content + its OWN
harness-session state — not the agent via a tool call.

*Verified against source (I traced this, did not assume):*
- Today an assistant turn delivers the transcript **into the assembled prompt / AGENTS.md** (`provisioner.ts:883-886`
  conversational branch) or the builtin adapter's `messages` array (`:900-903`); the reply is captured as
  `conversationalReply` (`:931-935`). `dispatch` mints a **fresh** `crypto.randomUUID()` session per turn
  (`service.ts:251`) and reads the transcript **live at execution** via `loadRawTranscript` (`:240`).
- **There is NO resumable-harness-session / per-thread-affinity concept anywhere today.** The only "resume" in the
  tree is the worker-pool pause/resume backpressure protocol (`worker-ingress.ts:82`, `adapter-pool.ts:174`) —
  unrelated. `sessionRunRegistry` (`session-run-registry.ts`) tracks LIVE sessions **only for cooperative abort**
  (register at harness-start, deregister at teardown); it does not track "what has this session already seen" or
  survive across turns. **So today every assistant turn is a brand-new harness spawn pre-loaded with the FULL
  transcript from scratch — no resumption, no delta, "always send everything."**

*The corrected design, split by size (this is the honest sizing call the coordinator asked for):*
- **In AU21 — the boundary close (small–medium, Increment 11).** Core bakes the thread's conversational content
  onto the `assistant_turn` event at emit (reading its own `conversation` state — legal; the same content
  `loadRawTranscript` reads today). **Delete** the runner's three core reads (`listMessagesByThread`,
  `getOrCreateUser`, `readServerConfig`). Orchestration constructs the harness input **from the baked transcript**
  and writes it into the prompt/AGENTS.md exactly as today's conversational branch already does (fresh spawn, full
  transcript) — orchestration deciding what goes into the harness IS its job; today's simplest form of that job is
  preserved, only the transcript's SOURCE moves from a live read to the baked payload. **No agent MCP tool, no
  `read_thread`.** Model resolves via the normal provisioning path; `systemPrompt` stays `scaffoldSpecs`-sourced
  (not a core read). Delete `registerAssistantTriggerInternal`; the pin moves core-side (F4: a
  `thread_message_appended` subscriber reading sender `kind` via same-layer DI to `users`).
- **Coherence — reconciled via Decision B‴, NOT via an agent pull (correcting F1's earlier "dissolves" claim).**
  Baking the full transcript at emit is **stale** for the concurrent-message case: msg2 emitted while turn1 is
  still running bakes a transcript missing turn1's not-yet-written reply, and the assistant serializes turns
  (fresh spawn caps at one). The fix is the machinery **AU21 already designs** — Decision B‴'s continued-push /
  supersede: when turn1's reply lands while an `assistant_turn` for that thread is still pending, core re-emits
  (re-bakes) the pending intent with the current transcript (freshest baked payload wins, older `superseded`).
  Zero orchestration read, coherent. This wires B‴ to a new trigger (a thread reply superseding a pending same-thread
  `assistant_turn`) — a bounded addition, in Increment 11.
- **NOT in AU21 — the real "meta-orchestration of harness sessions" (its OWN follow-up WP).** The founder's full
  vision — *"almost the hardest task… meta orchestration of harness sessions… many resumable agent sessions…
  which one do we resume and what do we add into the new context"* — is **resumable harness sessions keyed by
  thread, tracking what each session has already been fed, computing the DELTA (what's new since the harness last
  saw the conversation), and deciding resume-vs-new.** Verified above: **none of this exists today.** It is a
  substantial new piece of harness-session-lifecycle machinery, it is **not required to close AU21's boundary AC**
  (the boundary closes with bake + delete-reads + B‴, preserving today's fresh-spawn model), and AU21 is already
  XL. **Sizing call: this is its own follow-up WP, not Increment 11.** It is also the correct *efficiency* answer
  (resume + delta avoids re-baking/re-sending the whole transcript every turn — which also retires the
  payload-size concern below); AU21's fresh-spawn boundary close is the correct *first* form of the same job.
  Registered as a named follow-up in `.pipeline/AU.md`; its shape is captured here so it is not lost.
- **Payload-size note (real, bounded for now):** baking the full transcript onto every `assistant_turn` intent row
  grows it with thread length — the same bounded-blob consideration as H3's knowledge bundle. AU21 preserves
  today's "full transcript" behavior (bake it all); the resume/delta follow-up eliminates the re-send entirely. A
  narrower "sufficient recent window" bake is a possible interim optimization, flagged, not taken (it would change
  today's send-everything behavior).

**H3 — core BAKES the full context content; `context.ts` becomes pure format/write; DELETE the accessors (not
seam-route them).** Re-derived per the founder: "the core assembles everything that it needs… the orchestration
turns all that information into the format that the agent harness needs… zero ways to touch back into core."
- **Grow the baked payload.** `BakedWorkIntentRequest` (`service.ts:1258`) gains a `contextBundle` field carrying
  the `SessionContextData` content (`context.ts:101-123`: task/bet/agent/team — or routine/agent/team) **plus**
  the ranked+budgeted knowledge items that `assembleContext` (`context.ts:836-892`) currently reads at launch.
- **One shared core-api assembler, the `requireRunnableAgent` precedent.** The knowledge fetch→rank→budget (the
  cross-domain, heaviest piece — `list` L2/L3/L4 + `rankAndBudget`, `context.ts:836-858`, `rank` reads scoring
  weights from the DB) moves fully core-side into ONE shared function each per-kind resolver calls intra-layer —
  exactly how `requireRunnableAgent` became one `@hyperidle/users` helper that `task-run-resolver.ts`,
  `session-start-resolver.ts`, `knowledge-action-resolver.ts`, `proposed-call-workflow.ts` (reengagement) and the
  routine resolver already each import + inject. Home: `@hyperidle/knowledge` owns the ranking, so
  `assembleSessionKnowledge(db, {teamId, agentRole, taskDescription})` lives there; the entity content each
  resolver bakes from the source entity it **already loads to validate** (no new read). Each resolver, after
  resolving the agent, calls the assembler + bakes the bundle onto its own payload — the same-layer core-api call
  pattern Decision B already sanctioned (`cost-cap.ts` depends on `users`/`org`/`work`/`settings`). Only
  `task_run`/`knowledge_action`/`routine_run`/`reengagement` bake this knowledge/entity bundle; **`assistant_turn`
  bakes its own thread transcript instead** (H2) — a conversational turn needs its thread history, not ranked L2/L3/L4
  knowledge.
- **`context.ts` becomes pure format/write:** consume the baked `contextBundle` from the request and write
  `session.toon` + `context/{product,practices,factory}/*` files — **ZERO db reads**. Its `ContextAssemblyPorts`
  read methods (`knowledge`/`work`/`users`/`routine`/`org`) are **deleted**; `assembleAgentContext`'s `db` param
  and the per-layer `fetchAllForLayer`/`rankAndBudget`/`buildSessionContextData` DB calls are removed, replaced by
  a straight write of the pre-assembled bundle.
- **`run-orchestration-composition.ts`: DELETE** `contextPorts` (`:65`) + `userReader` + `settingsReader` +
  `routineAccessor` + the READ methods of `workAccessor` — not seam-route them. This is the concrete "zero reads
  back into core" for the session runtime.
- **The session-lifecycle WRITES ride events too** (same unifying mechanism). `transitionTask(taskId,
  "in_progress")` at launch (`provisioner.ts:1105`) → a core-api **work** subscriber on the existing
  `session_started` event (`sessions-routes.ts:488`) transitions the task, replacing the orchestration write.
  `updateBetById`'s `tokensActualJson` writeback at session end (`provisioner.ts:711`) → rides `session_ended`
  into a core-api work subscriber, same as routine's cost already does. `updateTaskById` (`:612`) likewise. After
  this, `workAccessor`'s write methods are deleted too — `run-orchestration` holds **zero** `→ core-api` call,
  read or write.
- **Payload-size note (real, not a blocker):** `rankAndBudget` already trims to `DEFAULT_KNOWLEDGE_BUDGET` tokens
  (`relevance-scoring.ts`), so the baked bundle equals the bounded set that would have been written to files
  anyway — it moves that bounded blob into `agentWorkIntents.bakedRequestJson` (larger intent rows). The founder's
  explicit call is "core assembles everything it needs and bakes it"; the size is bounded by the existing budget.

### Decision I — Remove the built-in `bet_decomposition` mechanism entirely (founder, 2026-07-31)
Founder, verbatim: *"[the entire built-in bet-decomposition mechanism] is wrong and needs fixed and the best fix
always is removal… maybe other users and plugins won't even do decomposition. that's a user / plugin / strategy
question not a core feature."* This is a **capability removal**, not a migration — it obsoletes the
`decomposition` half of H1 and shrinks the intent union.

**What it is today (verified from source).** A bet transitioning to `active` (`bet_state_changed`,
`toState:"active"`) **auto-fires** `runBetDecomposition` (`bet-decomposition.ts:762-766`): it finds eligible team
agents, selects a PM decomposer, records a `bet_decomposition` intent, runs a decomposition turn, writes the
resulting tasks, and stamps a terminal `decompositionStatus` (`done`/`blocked`) on the bet. It is a **hardcoded,
automatic core behavior** — there is **no** user "decompose" affordance; `WorkBet.tsx:1570-1625` only DISPLAYS
the auto-status ("Decomposing…" / "Blocked — couldn't plan the work / no eligible agent" / draft: "commit and
your team will break it into tasks").

**The founder's principle preserves the CAPABILITY, removes the hardcoding.** A human/plugin/strategy can still
attach an agent to a bet — via the **existing generic** explicit-session-start path (`session_start` /
`explicit_session_start`, `sessions-routes.ts:413`), the same mechanism any human-initiated agent request uses.
What dies is the hardcoded `bet_decomposition` intent kind + its bespoke subsystem + its automatic-on-commit
trigger. This is fully consistent with AU.md's own track vision (line 5): every event becomes triggerable, and
"decomposition work" is just a task-optional session request through the one runtime boundary — not a special
kind.

**Full removal footprint (verified):**
- **Delete** `packages/core-api/work/src/bet-decomposition.ts` entirely (`resolveBetDecompositionRequest`,
  `claimAndBakeDecompositionIntent`, `runBetDecomposition`, `registerBetDecomposition`,
  `resolveOrphanedDecompositions`, `markTerminal`, `selectBetDecomposerAgent`, the now-moot Decision-D2 cost-block
  remnants) + `work/src/index.ts:55,60` exports + `server-factory.ts:1215` `registerBetDecomposition` phase +
  `:960` orphan-sweep wiring.
- **Shrink the intent union to SIX kinds** (`assistant_turn, session_start, knowledge_action, routine_run,
  task_run, reengagement`): remove `bet_decomposition` from `shared/src/events.ts:19`,
  `shared/src/agent-work-intent-recorder.ts:95-100`, `db/src/schema.ts:436` CHECK + `:458` sourceKind CHECK,
  `session-requests/src/service.ts:1274`, `run-orchestration/src/contracts.ts:29-30`. Add a migration for the
  CHECK-constraint change; update Decision G's "kind-set == schema CHECK" test to the six-kind set.
- **Drop the `bets.decompositionStatus` + `decompositionBlockerReason` columns** (`schema.ts:187,193`) + zod
  (`zod-schemas.ts:55-56`) + the `decompositionStatus` guard branch in `work-service.ts:673-676` +
  `durable-agent-queue.ts:104` + `web/src/types/bet.ts:35,40`.
- **Remove the `decomposition` lifecycle projector + sourceKind** (`session-requests/src/service.ts:102-107,127`;
  `run-orchestration/src/contracts.ts`) — this is the piece that obsoletes H1's decomposition half.
- **Delete the `work_decompose_requested` event** + `packages/shared/src/bet-decomposition.ts` type file.
- **UI (`WorkBet.tsx`):** replace the auto-decompose empty-states (Decomposing / Blocked) with the honest state —
  a committed bet with no tasks is "no tasks yet" (and, if the strategy re-provides auto-decompose, that path
  drives tasks the normal way). Revise the draft copy ("commit and your team will break it into tasks") to match
  whatever the strategy decision (open question below) settles.

**SETTLED (founder, 2026-07-31):** *"minimal strategy provides an auto-decompose on bet creation as a default
trigger."* So the default UX is preserved via the generic mechanism (AU.md line 5), not lost: **core removes the
hardcoded `bet_decomposition` mechanism (this Decision); `packages/strategy-minimal` re-provides "auto-decompose
on bet creation" as a configurable default trigger** through the generic trigger substrate — the same
"decomposition work becomes a task-optional session request" the track vision already names.
- **Scope call — the strategy re-provision is a SEPARATE, obviously-scoped follow-up, NOT AU21.** Reason: it is
  additive *strategy configuration* (a default trigger rule in `strategy-minimal`), not a boundary-seam concern,
  and it belongs with strategy-minimal's own evolution — folding it into AU21 mixes a capability removal with
  strategy authoring. **But it is release-coupled:** because this is a versioned desktop app that finishes changes
  per release (no live cutover), the removal (AU21) and the strategy default-trigger must ship in the **same
  release**, or the default experience regresses (a committed bet stops auto-decomposing). `WorkBet.tsx`'s copy is
  finalized to match the trigger-driven flow, not an open question.
- **Dependency/risk to flag for that follow-up (verified earlier this WP):** the generic *trigger substrate* the
  strategy would use may not be fully wired — Increment 9's SECOND-pass finding recorded that `settings`'
  `kind:"trigger"` config (the "Triggers" tab) *"has had no code path anywhere that reads it to affect real agent
  selection."* So "strategy-minimal provides a default trigger" presumes that substrate is (or gets) wired; the
  follow-up must confirm/close that, and cannot be assumed free. Tracked in `.pipeline/AU.md`.

### Decision J — `connections` (service_connections) is agent-session-provisioning domain, not core domain; relocate to agent-orchestration, split the LLM-key credential catalog back out, retire the F2 seam (founder challenge, 2026-08-02)

The founder challenged, during an AU21 review of what `CoreApiPort` actually carries, whether **connections** belongs in the core-api Layer at all. The ruling that governs this decision, verbatim intent: *"domain is the only accepted reason for such a cut — everything else has to engineer properly around it."* Any argument for keeping connections in core-api must be a genuine **domain** argument (this concept truly belongs to core's business objects — work / conversation / knowledge / users), not a security-, convenience-, or UI-locality rationalization. This decision re-adjudicates the F2 "record stays core-api" ruling against that bar and reverses it for `service_connections` — while confirming the one piece that *does* belong core-side (the LLM-key credential catalog) and stating exactly how each consumer keeps working.

**J0 — the package conflates two already-documented, distinct domains (verified).** `@hyperidle/connections` (`packages/core-api/connections/src/index.ts`) bundles two SQL surfaces the docs themselves declare separate:
- **The LLM-provider credential catalog** — `server_credentials` (`schema.ts:1335`), `credential-store.ts`, `credential-resolver.ts` (`DbCredentialResolver`), `credential-encryption.ts`. `docs/architecture/credential-model.md` calls this "the **closed infra-secret catalog**" and states outright "**Credentials ≠ Connections**." Its consumer is `model-gateway` (a core-api Service) resolving a provider key (`anthropic_api_key`/`openrouter_api_key`/…) to make an LLM call.
- **User service connections** — `service_connections` (`schema.ts:1742`; `@lore AN1:1738-1740` "Separate from `server_credentials` (closed infra-secret catalog)"), `service-connection-store.ts` (CRUD), `service-connection-resolver.ts` (the sole held-token decrypt path, AN1 hard-rule 1), `service-connection-projection.ts` (`projectInheritedConnections`). Its consumers are session provisioning and filesystem reachability.

They live in one package only because `service-connection-resolver.ts` **reuses the AES-GCM primitive** from `credential-encryption.ts` ("no forked crypto", connection-model.md §Resolver) — a shared-*primitive* reason, not a shared-*domain* reason. The cut runs cleanly between them.

**J1 — the domain test, applied. `service_connections` is agent-session-provisioning domain, not core domain.** A `Connection` is defined (`docs/architecture/connection-model.md:3`) as "a per-(user × service) record that an external service is reachable by **that user's agents** … the fact of availability plus a pointer to where the auth lives." Every load-bearing property of it points at the agent/execution side, not at a core business object:
- **The inherited half is agent-sourced by construction.** Inherited connections "are **not** DB rows … live projections from the harness capability descriptor" (connection-model.md:21); `projectInheritedConnections` reads `HarnessCapabilityDescriptor.inheritedTools`. The core-api `/api/connections` route already has to reach an **agent-execution concept** to serve them — `createConnectionRoutes(db, adapterPool)` and `harness-capability-read-model.ts`'s `HarnessCapabilityReader` (`routes/connections.ts:41-44`, `app.ts:554`). Core-api reaching the harness adapter pool to answer "what are this user's connections" is the boundary smell that proves the domain sits on the other side.
- **The held half exists only to be injected into a session at spawn.** "HyperIdle resolves and injects them into the session working directory at spawn (AN2)" (connection-model.md:19); the resolver's "two consumers [are] session provisioning injection (AN2) and filesystem reachability probes (AO1)" (connection-model.md §Resolver). Both are session-launch provisioning — agent-orchestration's own job ("prepares … everything a run needs *before* handing off to execution", `runtime-simplification.md:38-39`). AU21's own F2 already moved that operation (`connection-provisioning.ts`, `filesystem-provisioning.ts` now live in `@hyperidle/run-orchestration`).
- **It is not work / conversation / knowledge / users.** Being FK-adjacent to `users` does not make it users-domain — `filesystems`, `cost`, and `agentSessionRequests` are all per-user/per-agent and none is "the users domain." A connection is a per-user *provisioning input for agent sessions*, not part of a person/agent's identity.

**Every counter-argument for keeping it core is a non-domain argument** (each rejected under the founder's bar): (a) *"the Settings UI manages it and Settings is core"* — a UI-locality argument; Settings already spans both Layers (Decision F3), and core-ui can read agent-orchestration through the door AU21 already built (below). (b) *"it's encrypted at rest, that's core infra"* — storage location ≠ domain; `session-requests` (agent-orchestration) already stores `agentWorkIntents` at rest. The encryption *primitive* is shared infra, moved to `@hyperidle/shared` (J3). (c) *"F2 said the record stays"* — F2's rationale was explicitly "the UI owns it," i.e. convenience, not domain; this decision supersedes it. **Conclusion: no domain argument holds; `service_connections` moves to agent-orchestration.**

**J2 — the credential catalog (`server_credentials`) legitimately stays core-side — stated as a consumer-locus argument, not a business-domain claim.** `server_credentials` is not a core business domain either (it is infra, like `settings`/`server_config`) — but it is not *agent-session* domain the way `service_connections` is, and it has one decisive fact: its consumer is **`model-gateway`, a core-api Service, dual-consumed by both layers.** `model-gateway` resolves a provider key for model resolution and is called both by core-api's own resolution path and (via `dispatch`'s `modelGateway` port) by orchestration sessions; `server-factory.ts:953` builds the one `DbCredentialResolver(db)` and wires it into `makeResolveModel(db, credentialResolver)` (`:1082`). Moving the catalog to agent-orchestration would force core-api's own model-gateway to reach *across* the boundary for keys it uses in a core-side call — inverting a clean edge to fix nothing. The catalog stays core-side, in a package renamed to its honest domain, `@hyperidle/credentials`. *(If the founder later wants to challenge whether `model-gateway` itself is correctly core-api — a legitimate separate question — that would re-open this; flagged, not assumed.)*

**J3 — the shared crypto primitive moves to `@hyperidle/shared` (Mechanism-C-forced, precedented).** After the split, the agent-orchestration `service_connections` Service must still AES-GCM-decrypt held tokens, but Mechanism C (Services depend only on `@hyperidle/db`/`@hyperidle/shared`/a shared contracts package — `runtime-simplification.md:137-172`) forbids it from importing the core `@hyperidle/credentials` Service. Resolution: relocate the pure primitive (`encryptCredentialValue`/`decryptCredentialValue` + key derivation) to `@hyperidle/shared` — the exact move already made for the `CredentialResolver` **type** for the identical cross-boundary reason (`cli-harness-adapter.ts:45-53` @lore: "`harness-registry` (agent-execution) may not import `@hyperidle/connections` … even type-only (Mechanism B); `CredentialResolver` is now sourced from `@hyperidle/shared`"). Both the core `@hyperidle/credentials` Service and the new agent-orchestration `connections` Service then import the primitive from `shared`. **Proof obligation:** verify `credential-encryption.ts`'s key source (`getServerSecret` → `HYPERIDLE_API_KEY` via HKDF, per credential-model.md §Encryption) carries **no** DB dependency before the move; if any part reads `server_config` from the DB, only the pure crypto moves to `shared` and the key/secret is passed in.

**J4 — the correct home is agent-orchestration, NOT agent-execution, NOT a new shared package (each ruled from the real layer model).**
- **agent-execution is disqualified — hard.** It is "the only Layer with **zero Service/table access of any kind**" and runs on a `remote-worker` "which may be a genuinely separate machine with no DB credentials at all" (`runtime-simplification.md:42-50`, founder-corrected). A SQL-owning Service cannot live there. This is not theoretical: the codebase **already deleted** agent-execution's connections import for exactly this reason (`cli-harness-adapter.ts:45-53`; `harness-registry/package.json` has no `@hyperidle/connections` dependency). So "move connections to agent-execution" is architecturally dead on arrival for the record/store half — agent-execution can't even type-import it.
- **A new shared package is disqualified.** A stateful SQL-owning Service that also depends on the harness adapter pool is not a leaf types package; Mechanism C sanctions only `db`/`shared`/contracts as shared homes. This would break the two-level Layer→Service hierarchy.
- **agent-orchestration is correct and precedented.** It is the Layer that "prepares/consumes everything a run needs before/after handing off to execution" (`runtime-simplification.md:38-39`), is always colocated with core-api (has DB access), and **already owns SQL tables** — `@hyperidle/session-requests` (deps `db`+`shared`+`drizzle-orm`) is the sole ACL-holder of `agentWorkIntents`/`agentSessionRequests`/`explicitSessionStarts`. The `runtime-simplification.md:67-72` line calling agent-orchestration Services "not SQL-owning" is stale relative to shipped code; `session-requests` is the standing counter-example. Home: a new SQL-owning Service `packages/agent-orchestration/connections/`.

**J5 — table ownership: the definition does not move; the ACL-holder does.** All table *definitions* live in `packages/db/src/schema.ts` (the shared `db` package) and stay there — `service_connections` (`:1742`) is not migrated, no data move, no new table. What changes is which Service package is the **sole importer of the `serviceConnections` table object** (Mechanism A / Table ACL): after J it is the new agent-orchestration `connections` Service, whose barrel — like every SQL-owning Service — exports typed functions only, never the raw pgTable. `server_credentials` stays owned by the core `@hyperidle/credentials` Service. No schema/migration change is required by Decision J at all.

**J6 — routes and the Settings UI: HTTP surface stays core-api-hosted, delegating to the relocated Service — the `AgentOrchestrationPort` precedent, exactly.** core-api is the Layer with the HTTP surface; agent-orchestration has none of its own. AU21 already established the pattern for "a route whose HTTP hosting lives in core-api even though the DATA and query logic are agent-orchestration's own" — `AgentOrchestrationPort` (Increment 6/7, shipped): the read door is a type-only seam in `@hyperidle/api-contract` backed by `agent-orchestration-sessions-routes.ts` mounted at `/api/agent-orchestration` in core-api's `app.ts`, with an injectable in-process/network transport (`agent-orchestration-port.ts:1-24, 89-95`). Decision J reuses that door:
- **Read path (list held ∪ inherited).** Extend `AgentOrchestrationPort` with a `connections` read family mirroring today's `GET /api/connections` response (`ServiceConnectionView[]`), served by the relocated agent-orchestration Service. core-ui reads through the same seam it already uses for per-session cost.
- **Write/validate path (POST/DELETE/validate).** `AgentOrchestrationPort` is documented **strictly read-only** (`agent-orchestration-port.ts:20-24`), so the mutations do NOT ride it. Keep the `/api/connections` routes **HTTP-hosted in core-api** (the UI path `apiFetch("/api/connections")` in `SettingsConnections.tsx:106,370,392` is unchanged), with the handlers **delegating to the relocated agent-orchestration `connections` Service** — the same "core-api Application HTTP-hosts an agent-orchestration data/mutation route" shape `agent-orchestration-sessions-routes.ts` already uses. This is Application-level composition across the boundary (legal: "only an Application may choose … a cross-process boundary" `runtime-simplification.md:159-164`), not a Service importing a Service. SSRF/rate-limit/auth middleware stay on the route exactly as today (`routes/connections.ts:7-13`). The `harness-capability-read-model.ts` `HarnessCapabilityReader` the inherited projection needs is injected into the relocated Service via the existing legal downward agent-orchestration → agent-execution edge, moving the descriptor read to the side of the boundary that owns it.

**J7 — `CoreApiPort.connections` is DELETED; the F2 seam is retired.** Once the record is agent-orchestration's own, the session-launch provisioning op (`connection-provisioning.ts`, already in `@hyperidle/run-orchestration` from F2) reads held connections **in-layer** from the relocated Service — no seam. So `CoreApiPort.connections` (`CoreApiConnectionsPort.listHeldConnectionsForProvisioning`, `core-api-port.ts:631-642`) **and** the `GET /connections/provisioning` route (`routes/connections.ts`) that backs it are removed entirely — there is no longer any cross-layer edge to seam for connections' *own internal use*. The only surviving cross-layer edge for connections is the core-ui/core-api → agent-orchestration read+manage door (J6), which is the correct, governed shape. Net edge accounting: **−1 against-grain seam (`CoreApiPort.connections`), +1 read family on the already-existing `AgentOrchestrationPort`** — a strict simplification.

**J8 — filesystems reachability co-moves (bounded).** `routes/filesystems.ts:6` imports `type ServiceConnectionResolver`; the reachability probe (AO1) resolves a held connection's token to test a filesystem. After J the resolver lives in agent-orchestration. Since AU21 F2 already relocated filesystem *provisioning* to `@hyperidle/run-orchestration`, the reachability probe co-locates there and reads the relocated resolver **in-layer**; any residual core-api-route reachability check reads via the J6 door. `filesystems` records + `/api/filesystems` routes + `SettingsFilesystems` are otherwise untouched (F2 stands for filesystems).

#### J — increment breakdown (its own follow-up WP; four independently-shippable increments)
Same execution model as §9 (architecture-touch-up → red → green → review → verify → clean commit; fresh agent per increment; `main` green between each). Each Increment lists concrete file changes + the test that proves it.

- **Increment J1 — extract the AES-GCM primitive to `@hyperidle/shared` (enabling, low-risk).** Move `encryptCredentialValue`/`decryptCredentialValue` (+ the pure key-derivation) from `packages/core-api/connections/src/credential-encryption.ts` into `@hyperidle/shared`; re-point the current `@hyperidle/connections` barrel re-exports at `shared`. **First, discharge the J3 proof obligation**: confirm the key source carries no DB dependency (if it reads `server_config`, split so only pure crypto moves and the secret is passed in). *Tests:* an encrypt→decrypt round-trip unit test in `shared` matches the pre-move output for a fixed key+plaintext; `model-gateway`'s credential resolution and the connection resolver both still decrypt unchanged (existing `credential-runtime-path.integration.test.ts` / `AN2-connection-provisioning.integration.test.ts` stay green).
- **Increment J2 — rename the core package to `@hyperidle/credentials`; it keeps ONLY the LLM-key catalog.** Rename `packages/core-api/connections/` → `packages/core-api/credentials/`, `@hyperidle/connections` → `@hyperidle/credentials`; keep `server_credentials` CRUD + `DbCredentialResolver` + the `CredentialResolver` re-export; **remove** all `service_connections` code (store/resolver/projection) — it lands in J3. Update `model-gateway` wiring, `routes/credentials.ts`, `server-factory.ts` (`:953,1082`), and `packages/shared/src/credential.ts`'s references. *Tests:* `model-gateway` resolves a provider key unchanged (`X4-model-gateway.integration.test.ts`); `handle.credentialResolver instanceof DbCredentialResolver` invariant holds (`server-factory.resolver.test.ts`, AH1 §3); `/api/credentials` returns catalog state unchanged.
- **Increment J3 — stand up the agent-orchestration `connections` Service; move provisioning in-layer; delete the F2 seam.** New SQL-owning `packages/agent-orchestration/connections/` (deps `db`+`shared`+`drizzle-orm`, barrel exports typed functions only, sole importer of the `serviceConnections` table object): `service-connection-store` (CRUD), `service-connection-resolver` (held-token decrypt via the J1 `shared` primitive), `service-connection-projection` (inherited, via an injected `HarnessDescriptorReader` port). Re-wire `run-orchestration`'s `connection-provisioning.ts` to read held connections **in-layer**; **delete** `CoreApiPort.connections` (`core-api-port.ts:631-642`) + the `GET /connections/provisioning` route. *Tests:* provisioning resolves a held connection for a launch with **zero** `CoreApiPort` call (composition assertion + the AU21 anti-regrowth guard); inherited projection from a fixed descriptor set matches the pre-move `projectInheritedConnections` output; per-user isolation preserved (cross-user resolve → `null`, AN1 hard-rule 3); the AU21 hidden-edge scanner shows the `CoreApiPort.connections` edge gone.
- **Increment J4 — re-host the management surface + extend `AgentOrchestrationPort`; co-move filesystems reachability; guard.** Keep `/api/connections` GET/POST/DELETE/validate HTTP-hosted in core-api, delegating to the J3 Service (mirror `agent-orchestration-sessions-routes.ts` wiring); add a read `connections` family to `AgentOrchestrationPort` + its §11-style contract test; relocate the `ServiceConnectionResolver` use in filesystem reachability to the in-layer resolver; extend the AU21 anti-regrowth guard so **no core-api Service imports the `serviceConnections` table object** (the ACL-holder is now agent-orchestration). *Tests:* Settings GET/POST/DELETE/validate all work end-to-end through the relocated Service (the existing `connections-provisioning-e2e.integration.test.ts` + `AF11-authz.integration.test.ts` rewired and green); the `AgentOrchestrationPort.connections` contract test reaches its backing route; a `tsc`/lint negative case proves a core-api Service reaching `serviceConnections` fails.

#### J — scope recommendation (a real call, not a punt)
**Recommendation: a dedicated follow-up work package (e.g. `AU2x — Connections is agent domain`), NOT folded into AU21.** Reasoning, weighed both ways:
- **Against folding in.** AU21 is already **XL** (§18) with 13 increments, and its critical-path ACs (#2/#9 — orchestration reads zero core-api state) are what the WP exists to close. F2/Increment 8 **already shipped** the connections/filesystems *boundary* fix (verified: `connection-provisioning.ts` in run-orchestration, `CoreApiPort.connections` in api-contract). Decision J is a **domain-purity refinement on top of a closed boundary defect**, not a boundary-close blocker — no AU21 AC is unmet without it. Adding a package relocation + package rename + crypto-primitive move + route re-hosting + `AgentOrchestrationPort` extension to a mostly-shipped XL WP risks its critical path for a non-blocking improvement.
- **For a clean follow-up.** J is a self-contained, independently-verifiable domain relocation with its own AC surface; it **depends on doors AU21 already built** (`CoreApiPort`, `AgentOrchestrationPort` — both shipped Inc 1/6/7), so it sequences cleanly *after* AU21 with zero new prerequisites; and it matches this track's established practice of spinning out coherent follow-ups (AU23/24/25).
- **Sunk-cost note (honest).** F2's `CoreApiPort.connections` seam + `/connections/provisioning` route are **throwaway** under Decision J (J7 deletes them). That is a small, already-paid, harmless sunk cost — the seam works and hurts nothing until J retires it. **The one condition under which folding into AU21 is right instead:** if this decision had landed *before* Increment 8 shipped, J's full move should have replaced F2's half-move directly, avoiding the throwaway. It didn't — Increment 8 is shipped — so the follow-up path is correct now.
- **Not urgent, no user-facing regression** from leaving F2 in place in the interim: held connections still provision, the Settings UI still works, inherited connections still project. J improves domain coherence and deletes a seam; it does not fix a live break.

**Founder decision needed** (recorded, not assumed): (1) accept the domain ruling that `service_connections` moves to agent-orchestration and `server_credentials` stays core as `@hyperidle/credentials`; (2) confirm the follow-up-WP scoping vs. folding into AU21; (3) the one genuinely-open sub-question — whether `model-gateway` itself is correctly core-api (J2's premise). Recommend registering the follow-up in `.pipeline/AU.md` once (1)/(2) are confirmed — left for the founder per this track's practice.

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

> **Status flag (2026-07-31, Decision H RE-DERIVED from the founder's cycle principle) — AC #2/#9 have a designed
> closure; not yet built.** The Increment 9 THIRD pass left **10** genuinely-open `agent-orchestration -> core-api`
> pairs (tracked in the guard's `DEFERRED_FOLLOWUP`). The founder re-grounded the fix from first principles:
> **ZERO orchestration reads back into core — not even via the governed seam.** Core BAKES everything a run needs
> at emit; the agent pulls live detail via its OWN MCP tools; orchestration only formats the baked bundle into
> harness shape. This **replaces** the prior "seam-route the reads" draft. Decision H (§6) now closes the ten via
> **H1** (task_run writeback → event subscriber — the `decomposition` half is DELETED, not migrated), **H2** (the
> assistant turn is not special: core BAKES the transcript, the runner's 3 reads are DELETED, and ORCHESTRATION
> builds the harness input from the baked content — coherence via B‴, NOT an agent MCP pull),
> **H3** (core bakes the full context bundle; `context.ts` becomes pure format/write; the read accessors are
> DELETED, and the lifecycle writes ride events). **Decision I** (§6) removes the built-in `bet_decomposition`
> mechanism entirely (founder). Built by Increments 10a/10/11/12/13 (§9). The prior draft's "H-open" question is
> **resolved** by the founder (bake + self-recover). The Decision I strategy question is now **SETTLED**
> (strategy-minimal re-provides auto-decompose on bet creation as a default trigger — a release-coupled follow-up,
> not AU21). The one genuinely-separate large piece the H2 re-derivation surfaced: the founder's full
> **meta-orchestration of harness sessions** (resumable per-thread harness sessions + delta) does NOT exist in the
> codebase today and is a SEPARATE follow-up WP — NOT required for AU21's boundary AC (which closes with
> bake + delete-reads + B‴).
>
> **CLOSED (2026-08-02, Increment 13).** All increments landed. `DEFERRED_FOLLOWUP` is genuinely empty — its
> last pair, `dispatch::conversation`, needed no founder ALLOWLIST ruling at all: it is the same
> detection-quirk false-positive class already fixed once for `tool-handlers::conversation` (a seam-satisfied
> interface, Increment 9), here at per-GROUP granularity (`SEAM_GROUPS`, `generate-dependency-graph.ts`) since
> `DispatchPorts` has other, non-seam-satisfied sibling groups — verified against `dispatch-bindings.ts`'s real
> composition wiring, not asserted. The guard's bare `inspect(process.cwd())` check is a hard `npm run lint`
> failure (already wired since Increment 9; confirmed still true), returns ZERO findings, and a new fixture
> (Scenario 6) proves it still fires on a sibling non-excluded nested group even with the exclusion in place.
> `generate-dependency-graph.ts` re-run, `plans/AU19/*` + `docs/architecture/runtime-simplification.md`
> re-baselined to the bake-at-emit + agent-self-recovery + format-only-orchestration model. **AC #2 and AC #9
> are both fully met.** Decision J (connections domain review) surfaced a genuine, separate follow-up —
> scoped as **AU26**, not built here.

| # | AC | Verification |
|---|---|---|
| 1 | Location-transparent `CoreApiPort` seam exists (Application-wired, in-process today, remote-capable) | (a) Integration test builds `CoreApiPort` with `fetch = app.request` AND a stub network `fetch`; identical call succeeds via both. (b) Per-method contract test (§11): each method reaches its real route + middleware runs. (c) `npm run check` proves the contract type-resolves from a Service depending only on `@hyperidle/api-contract`. |
| 2 | The clean loop is real end-to-end and **orchestration reads zero core-api domain state** | (a) Integration test: a core-api Service resolves + emits a baked request; the drain builds+deploys performing **zero** core-api reads (asserted via composition + the §9-Inc-9 guard, which sees the composition-bundle pattern). (b) `resolveIntentInputInternal`'s core-domain reads are gone; own-state dedup reads remain and existing idempotency tests pass unchanged. (c) Self-recovery test: a run for a source changed after emit is not pre-checked away; the session runs and the agent's MCP read observes current state (or fails → emits the failure event → core reacts). (d) An agent write lands via the core-api route path (middleware ran). **(e) Zero orchestration→core call (read OR write) survives, per the re-derived Decision H — H1 task_run writeback → event subscriber (Inc 10; decomposition removed, Inc 10a/Decision I), H2 assistant transcript BAKED by core + runner's 3 reads deleted, orchestration formats the baked transcript, coherence via B‴, no agent MCP pull (Inc 11), H3 full context baked at emit + `context.ts` format-only with the read accessors + lifecycle-write accessors deleted (Inc 12) — anti-regrowth guard green, `DEFERRED_FOLLOWUP` empty.** |
| 2b | **Pre-handoff failure report-back works and the AU15 brick is still prevented** | Integration test: force a pre-handoff terminal failure; assert `failOrRelease` emits `agent_run_admission_failed`, a core-api subscriber finalizes the routine run to `outcome="error"`, and AU15 AC-3d holds (intent `failed`, run `error`, second fire self-heals). `routine-scheduler.au15.integration.test.ts` AC-3d is rewired to the event mechanism and must pass. |
| 2c | **Routine-runs-as-sessions collapse** | A routine firing produces a session with no orchestration-side direct write to `routineRuns`; run outcome is set only via the report-back events. Test proves a fired routine's run finalizes through the event path; `@lore AA1` updated. |
| 3 | Every read/write in the regenerated worklist gets a disposition surviving re-challenge | `edge-disposition.md`: each capability + verdict + §7 disposition + reasoning; reviewer confirms. Post-fix graph shows each former read gone/baked and each write seam-routed; the new failure event shows as an against-grain EventBus inversion. |
| 4 | Phantom `session-requests → settings` absent everywhere | `grep` → zero hits (confirm; not in the current graph). |
| 5 | `generate-dependency-graph.ts` re-run; new baseline **sees the composition-bundle reads** and distinguishes seam-write / pushed-payload / raw-DI; replaces 48/22 | Run the script; assert (i) it now surfaces `DurableAgentQueueDeps`-style hidden edges, (ii) distinct edge-types, (iii) the new inversion; docs byte-consistent with JSON. |
| 6 | AU19's surviving permanent ports not silently reopened — **except the one founder-signed reopen: `work → cost` is deliberately removed (Decision D2)** | Diff check: `work → agent-selection` dissolves (selection → core-api, §Decision D2/edge-disposition), `work → cost` removed (reasoned, founder-signed), the remaining against-grain ports + inversions unchanged; a test asserts bet-decomposition proceeds when over-cap (no `blocked`); a test asserts the unified `AgentWorkIntentRecorder` (Decision G) — one shared contract, local mirrors deleted — with `kind`-set == the schema CHECK constraint. |
| 7 | practice-meeting deleted from its new home; no replacement | `packages/core-api/knowledge/src/practice-meeting.ts` + all references (`dispatch-bindings.ts`, `dispatch/service.ts` `runPracticeMeetingRoutine`, `dispatch`/`tool-handlers` ports, `routes/*`) removed; a test proves the builtin-routine registry no longer offers it and nothing else broke. |
| 8 | Per-session cost is tracked + served via `AgentOrchestrationPort`; the cap gate + aggregate display are unchanged (no mirror deleted — none exists) | Test: (a) a completed session's per-session cost is recorded by agent-orchestration and served via `AgentOrchestrationPort` (today `tasks.ts` returns `cost: null`); (b) the cost-cap gate (`checkCostCap`/`recordCostAndCheck`) still blocks at/over cap and its `costActual` columns are intact; (c) existing bet/routine/team/agent aggregate cost still renders unchanged; (d) nothing reads a cost value from a duplicate store (there is none). |
| 9 | A documented + **enforced** practice for a new orchestration→core edge | (a) Doc states the rule. (b) The guard (§9 Inc 9) fails CI on a new orchestration→core read port **or a new composition-bundle core-read** (incl. the `cost` `CostDeps` pattern); a test proves it fires. |
| 10 | The generic realtime broadcaster is retired; notifications intact; session activity streams from agent-execution gatewayed by orchestration | (a) the WS cost-forward is removed and notifications still fire the persisted row (test); (b) discrete changes use the minimal invalidation signal, no generic broadcaster; (c) an integration test observes a session stream served by `agent-execution` via the `AgentOrchestrationPort` gateway, and `SessionActivityBuffer` no longer lives in orchestration. |
| 11 | Continued push (Decision B‴): a fact-change re-emit supersedes an unstarted request and delivers on next turn for a running one — orchestration reads zero core-api state | Test: (a) re-emit for the same `(kind, sourceId)` with a fresh version while the intent is `pending` → the older intent is `superseded`, the freshest baked payload dispatches (one session, not two); (b) re-emit while a session is `running` → the update queues and the follow-up session launches on session-end with the fresh payload; (c) both decided from orchestration's own dedup/session state (no core-api read). True mid-run injection is NOT asserted (harness-capability follow-up, §16 R9). |

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
- Rules on the mechanics already scoped — **DONE, this pass (2026-07-27):** (a) where
  `resolveIntentInputInternal`'s resolution lands — split per emitting Service, see Decision B's ruling; (b)
  `routineRuns` collapse shape — core-api definition-only audit derived from events, see Decision B″'s ruling;
  (c) per-builtin-routine disposition — all four core-maintenance-moved-core-side, see Decision B′'s ruling;
  (d) target-agent runnability cover — already resolved via §12 (reuses the pre-handoff channel,
  `TARGET_AGENT_NOT_RUNNABLE`).
- Designs `agent_run_admission_failed` (shape + subscribers) — **DONE, this pass**: finalized type + full
  per-`kind` subscriber table, see §10. Clears the EventBus-inversion bar per AU19's rule (fire-and-forget, no
  shared transaction, no reply — same shape as the other sanctioned inversions).
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
`taskDispatchAttempts` ruling. Ensure the MCP surface supports live self-recovery + add its tests. **Add the
Decision B‴ continued-push handling: the `superseded` intent status + the drain's "newer pending intent for the
same `(kind, sourceId)` wins" supersede check, and the deliver-on-next-turn follow-up for an update arriving
during a running session (own-state only).** Rewire AU15 AC-3d to the event mechanism; idempotency/dedup tests
stay unchanged and green. **Largest increment — split by
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

**Increment 8 — Credentials/filesystems provisioning split + agent-selection dissolution (Decisions F1/F2).** Move the provisioning operation
(`connections.{build,apply}ProvisioningPlan`, `filesystems.{listFilesystems, startWatcher}`) into
orchestration, reading the connection/filesystem **record** via `CoreApiPort` at launch; leave the records +
their human-config routes/UI (`/api/connections`, `/api/filesystems`, `SettingsConnections`,
`SettingsFilesystems`) in core-api. Fold `isAtCapacity` into provision-time concurrency and retire
`agent-selection` as a standalone Service (Decision F1); `selectAgent` relocates into core-api's emit-time
resolution (part of Increment 3).

**Increment 9 — Re-baseline + MANDATORY anti-regrowth guard + docs.**
Extend `generate-dependency-graph.ts` to **see the composition-bundle pattern** + add `seam-write`/
`pushed-payload` edge-types + recognize `agent_run_admission_failed`; re-run; update
`plans/AU19/as-is-dependency-graph.md` + JSON (replace 48/22); confirm the phantom edge absent. Ship the guard
(a lint / `tsc`-negative-case that fails on a new orchestration→core read port **or** composition-bundle core-
read; allowlist = only founder-signed flagged items; a test proves it fires). Reword
`docs/architecture/runtime-simplification.md`'s colocation sentence + "Durable agent handoff" to the resolve-at-
emit + self-recovery + report-back model. Write the going-forward practice.

> **STATUS (2026-07-30, forensic-triage wave, THIRD/review-corrected pass — see `edge-disposition.md`'s own
> "THIRD pass" section for the full narrative).** The guard is built, wired into `npm run lint`, and its
> `--fixtures` + bare-check both pass. `ALLOWLIST` holds only the 4 founder-signed `cost::*` rows (a second pass
> had added two builder-ruled entries here — rejected on review, corrected). **AC #2 and AC #9 are NOT fully
> met.** 8 real `agent-orchestration -> core-api` pairs remain, honestly tracked (not silently masked) in the
> guard's `DEFERRED_FOLLOWUP`: `dispatch::conversation`/`::users`/`::settings` (the assistant-turn runner's
> live-transcript/identity/config reads — confirmed unsafe to bake at emit, a real staleness/coherence risk, not
> merely unmigrated), `run-orchestration`'s 6 context-assembly pairs (same risk class, larger scale), and
> `session-requests::work` (a writeback with real, evidenced feasibility for a core-api event-subscriber
> migration, not yet built/tested). 2 pairs this same pass genuinely closed (not relabeled): `dispatch::work`
> (dead task-queue code, deleted) and `dispatch::routine` (relocated core-side to `@hyperidle/routine`, including
> closing a regrowth the fix itself introduced via a new `CoreApiPort` seam route). **Do not present this work
> package as fully closing AC #2 without a founder decision on the remaining 8 pairs** — see `.pipeline/AU.md`'s
> AU21/AU23 registry rows.
>
> **Update (2026-07-31): Decision H (§6) was RE-DERIVED from the founder's cycle principle** — ZERO orchestration
> reads back into core (not even via the seam): core bakes, the agent self-recovers via MCP, orchestration only
> formats. The ten pairs close via H1 (task_run writeback → event subscriber), H2 (assistant runner reads DELETED,
> agent pulls transcript via a new MCP tool), H3 (core bakes the full context bundle; `context.ts` format-only;
> read + lifecycle-write accessors DELETED), plus **Decision I** (remove the built-in `bet_decomposition`
> mechanism — obsoletes the `decomposition` writeback half). Increments 10a/10/11/12/13. The prior draft's
> "H-open" file-based-vs-MCP question is **resolved** (bake + self-recover). Residual founder open questions
> (NON-blocking for AC #2): the minimal-strategy auto-decompose re-provision (Decision I) and the assistant
> `conversational`-mode collapse (H2 scope). See `.pipeline/AU.md`.

**Increment 10a — Remove the built-in `bet_decomposition` mechanism (Decision I).** Delete
`work/src/bet-decomposition.ts` + its exports + the `server-factory.ts` registration/orphan-sweep wiring; shrink
the intent union to six kinds everywhere (shared events/recorder, schema CHECK + sourceKind CHECK,
session-requests, run-orchestration contracts — with a CHECK-constraint migration); drop the
`bets.decompositionStatus`/`decompositionBlockerReason` columns + zod + the work-service guard branch +
`durable-agent-queue.ts` + web bet types; remove the `decomposition` lifecycle projector/sourceKind; delete the
`work_decompose_requested` event + `shared/src/bet-decomposition.ts`; rework `WorkBet.tsx`'s decompose
empty-states. Tests: (a) committing/activating a bet records **no** `bet_decomposition` intent and leaves no
`decompositionStatus`; (b) the generic explicit-session-start against a bet still provisions an agent session
(the preserved capability); (c) Decision G's kind-set test now asserts the **six**-kind union == the schema CHECK.
This obsoletes H1's decomposition writeback (Increment 10 is task-only as a result). **Founder open question
(§Decision I)** — whether the minimal strategy re-provides auto-decompose — is tracked in `.pipeline/AU.md`, does
not block this increment; `WorkBet.tsx` copy is finalized once answered.

**Increment 10 — `session-requests::work` `task_run` writeback → core-api event-subscriber (Decision H1).** Add
`packages/core-api/src/services/work-session-end-reactions.ts` (reuse `routine-run-session-end-reactions.ts`'s
structure) subscribing **`agent_run_lifecycle_changed` only**, keyed on `state` (NOT `session_ended` — vocab
mismatch, H1). `sourceKind==="task"` → `taskDispatchAttemptStore.updateIfActive(tx, event.requestId, {status:
event.state, sessionId})`. Flip `lifecycleProjectors.task` to `observeOnly`; delete `projectTask` +
`DurableAgentQueueDeps.lifecycleProjection.work`. Relocate `reapTerminalTaskDispatchAttempts` out of
`reapExpired`'s atomic transaction into `server-factory.ts`'s retention reaper; delete `DurableAgentQueueDeps.work`.
Tests: (a) a completed task session finalizes the dispatch-attempt row via the event path (no orchestration→work
write); (b) failed/cancelled likewise; (c) duplicate/redelivered event is a no-op (idempotency); (d) retention
still reaps terminal rows, core-side. (The decomposition half is gone via 10a.) After this + 10a `session-requests`
holds zero `→ work` edge.

**Increment 11 — Assistant-turn boundary close (Decision H2 re-derived): core bakes the transcript, DELETE the
runner's reads, orchestration builds the harness input from the baked content.** **Core bakes** the thread's
conversational content onto the `assistant_turn` event at emit (`routes/threads.ts`, reading its own
`conversation` state — the same content `loadRawTranscript` reads today). **Delete** `runTurnInternal`'s three
core reads (`listMessagesByThread`, `getOrCreateUser`, `readServerConfig`) — NOT seam-route them, and **NO
`read_thread` MCP tool** (the agent does not pull its own transcript — corrected). Orchestration constructs the
harness input from the **baked transcript**, written into the prompt/AGENTS.md exactly as today's conversational
branch (`provisioner.ts:883-903`) already does (fresh spawn, full transcript) — only the transcript's SOURCE moves
from a live read to the baked payload. Model resolves via the normal provisioning path; `systemPrompt` stays
`scaffoldSpecs`-sourced. **Coherence via Decision B‴ (not an agent pull):** wire a new B‴ supersede trigger — a
thread reply landing while an `assistant_turn` for that thread is still pending re-bakes (supersedes) the pending
intent with the current transcript. Move the pin into a core-api `thread_message_appended` subscriber reading
sender `kind` via same-layer DI to `users` (F4); delete `registerAssistantTriggerInternal`. Tests: (a)
**coherence** — msg2 emitted while turn1 runs, turn1 posts its reply; assert the queued `assistant_turn` is
re-baked (B‴ supersede) so turn2 runs with a transcript INCLUDING turn1's reply, with **zero** orchestration read;
(b) the assistant turn provisions + runs through the standard path with **zero** `dispatch`→core read, the
transcript sourced from the baked payload; (c) the thread pins via the core-api subscriber. After this
`dispatch/src/service.ts` holds zero `→ core-api` edge. **Sizing:** this is small–medium and fits Increment 11.
The *resumable-harness-session / delta* machinery the founder describes ("meta-orchestration of harness sessions")
does **not** exist today and is **out of AU21** — its own follow-up WP (Decision H2, `.pipeline/AU.md`).

**Increment 12 — Core bakes the full context; `run-orchestration` reads/writes NOTHING back (Decision H3).**
Grow `BakedWorkIntentRequest` with a `contextBundle` (entity `SessionContextData` content + ranked+budgeted
knowledge items). Add the shared `@hyperidle/knowledge` `assembleSessionKnowledge(db, {teamId, agentRole,
taskDescription})` (relocates `list`+`rankAndBudget` core-side, the `requireRunnableAgent` precedent) and have
each per-kind resolver (`task-run-resolver.ts`, `knowledge-action-resolver.ts`, routine resolver,
`proposed-call-workflow.ts` reengagement) call it + bake the bundle (assistant_turn bakes none). Rewrite
`context.ts` to **consume + write** the baked bundle only — delete its `ContextAssemblyPorts` reads and
`assembleAgentContext`'s `db`/fetch/rank path. **Delete** (not seam-route) `run-orchestration-composition.ts`'s
`contextPorts` + `userReader`/`settingsReader`/`routineAccessor` + `workAccessor`'s reads. Route the
session-lifecycle WRITES via events: `transitionTask("in_progress")` → a core-api work subscriber on
`session_started`; `updateBetById`/`updateTaskById` writebacks → core-api work subscribers on `session_ended`;
delete `workAccessor`'s writes. Tests: (a) a launched `task_run`/`routine_run`/`knowledge_action`/`reengagement`
session assembles its sandbox context from the **baked bundle** with **zero** `run-orchestration`→core read
(anti-regrowth composition-bundle detector green on `run-orchestration`); (b) baked ranking output matches the
pre-migration ranking for a fixed corpus; (c) `transitionTask("in_progress")` at launch fires via the
`session_started` subscriber, not an orchestration write; (d) existing session-launch integration tests pass.
After this `run-orchestration` holds zero `→ core-api` edge, read or write. **Payload-size** is bounded by the
existing knowledge budget (H3 note).

**Increment 13 — Wire the guard's bare check + re-baseline + re-affirm AC #2 / AC #9.** With 10a/10/11/12 landed,
`DEFERRED_FOLLOWUP` is empty (`ALLOWLIST` = only the 4 founder-signed `cost::*` rows). Promote
`scripts/composition-edge-anti-regrowth-guard.ts`'s bare `inspect(process.cwd())` to a hard `npm run lint`
failure; a test proves it fires on any new orchestration→core read port **or** composition-bundle core-read.
Re-run `generate-dependency-graph.ts`; update `plans/AU19/*` + `runtime-simplification.md` to the
bake-at-emit + agent-self-recovery + format-only-orchestration model. AC #2 and AC #9 are met. The Decision I
strategy open question is tracked in `.pipeline/AU.md`, separate from this AC.

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
  - **NEW `AgentRunAdmissionFailedEvent` — finalized shape (Increment 0, ready for Increment 3 to implement
    verbatim):**
    ```ts
    // packages/shared/src/events.ts — added to the DomainEvent union (KernelEvent group, beside AgentWorkIntentEvent)
    export type AgentRunAdmissionFailureCode =
      | "INVALID_WORK_SOURCE"       // baked payload's source no longer exists / no longer eligible (domain-state staleness)
      | "MAX_ATTEMPTS_EXCEEDED"     // orchestration's own claim/dedup attempt budget (agentWorkIntents.attempts) exhausted
      | "TARGET_AGENT_NOT_RUNNABLE" // resolved agent deactivated/non-existent between emit and provisioning (§12)
      | "PROVISIONING_FAILED";     // hard infra failure building/deploying the session (harness/sandbox), not a domain problem

    export interface AgentRunAdmissionFailedEvent {
      readonly type: "agent_run_admission_failed";
      readonly streamId: string;                 // same stream convention as AgentWorkIntentEvent (e.g. `task:<id>`, `routine:<id>`, `thread:<id>`)
      readonly intentId: string;                  // agentWorkIntents.id
      readonly kind: AgentWorkIntentKind;          // reuse the existing 7-kind union (events.ts, Decision G)
      readonly sourceKind: AgentSessionSourceKind | "explicit_session_start"; // reuse AgentWorkIntentEvent's exact type
      readonly sourceId: string;
      readonly failureCode: AgentRunAdmissionFailureCode;
      readonly terminal: boolean;   // true = orchestration will NOT retry this intent again (its own claim/attempt budget is spent, or the error is unrecoverable-by-retry); core-api MUST finalize + decide retry(re-emit a fresh intent)/abandon. false = informational — orchestration is still retrying internally; no core-api state mutation.
      readonly timestamp: number;
    }
    ```
    **Emission rule:** `failOrRelease` (`session-requests/src/service.ts:960`) emits this event on every failed
    claim/dispatch attempt, `terminal` set exactly as its existing computation already does
    (`error instanceof InvalidAgentWorkSourceError` → `INVALID_WORK_SOURCE`; `attempts >= maxAttempts` →
    `MAX_ATTEMPTS_EXCEEDED`; §12's deactivation race → `TARGET_AGENT_NOT_RUNNABLE`; a hard provisioning/build
    error → `PROVISIONING_FAILED`) — orchestration keeps this attempt-count/backoff bookkeeping verbatim (it is
    orchestration's own dedup state, Decision B step 2); it does not move core-side. Only `terminal===true`
    triggers a core-api reaction — `terminal===false` events are informational (orchestration is still retrying
    on its own backoff) and provoke no state mutation.

    **Full subscriber list, by `kind` (concrete enough to implement in Increment 3):**

    | `kind` | Subscribing core-api Service | Reaction on `terminal===true` |
    |---|---|---|
    | `routine_run` | `routine` | `routine-service.ts`'s `updateRoutineRun(sourceId, {outcome:"error", endedAt, errorMessage:failureCode}, {onlyIfRunning:true})` — the literal replacement for `failOrRelease`'s deleted direct write (preserves AU15 AC-3d); retry is implicit (the routine's own next scheduled fire), no separate re-emit needed. |
    | `task_run` | `work` | Mark the `taskDispatchAttempts` row (`work-service.ts:62`'s `taskDispatchAttemptStore`, work-owned) failed; decide retry (bounded by a work-owned attempt counter on the task/dispatch-attempt row — bake + re-emit a fresh `task_run` intent) vs abandon (leave the task in its current state for human/agent re-trigger). |
    | `session_start` | `work` | Mark the `explicitSessionStarts` row (`schema.ts:457`) failed. This kind is an explicit human/agent-requested start — **no automatic retry**; abandon and surface the failure to the requester (matches the "explicit" semantics — nothing should silently retry a manual trigger later). |
    | `bet_decomposition` | `work` | Reuse the **existing** `markTerminal(db, betId, "blocked", "failed")` helper (`bet-decomposition.ts:322`, already used for every other early-exit path in this file, incl. the Decision D2 cost-block removal) — no new mechanism, one more caller of the pattern already there. |
    | `knowledge_action` | `knowledge` | No durable "run" record exists for a knowledge action — leave the item's state as-is (no partial mutation occurred) and, per §6 B5 ("routes repeated failure to review/AL7"), create a review-flagged item so a human/agent sees the stalled action. |
    | `reengagement` | `review` | Reuse the **existing** retry-count pattern already in `proposed-call-workflow.ts:354-410` (`handleUnconsumedGrantOnSessionEnd`'s liveness net): `retryCount===0` → increment to 1, record a fresh `reengagement` intent (re-provision once); `retryCount>=1` → transition the proposed call to `held` + write a `failed` outcome (give up). Same file, one more trigger into the same logic. |
    | `assistant_turn` | `conversation` | No durable "run" row exists for a thread message either. Lowest-stakes family, and the only one with **zero** special-casing in today's `failOrRelease` (its `if (terminal && intent.kind === "routine_run")` guard, `:989`, is the ONLY per-kind reaction that exists right now — every other kind currently gets NOTHING on terminal failure, a gap this table closes). Reaction: informational only for Increment 3 (log / no thread mutation); a user-visible "assistant failed to respond" surfacing is a reasonable product follow-up but not required to close AU15's guarantee and is not scoped here. |

  - **EXISTING** `SessionEndedEvent` / `AgentRunLifecycleChangedEvent` (`events.ts:86` / `:25`) — post-session;
    new core-api *reaction* (the same per-`kind` table above, minus the pre-handoff-only `session_start` row
    since a `session_start` that reached a session already succeeded past admission), no shape change.
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
- **Target-agent runnability under the emit→deactivate→drain race — RE-CORRECTED (founder, 2026-08-01): the
  race needs NO mechanism at all — no read, no push, no event.** The prior "CORRECTED" entry above (a
  core-pushes-deactivation event + an orchestration subscriber cancelling pending work) was itself still
  over-engineered: it assumed orchestration needs to *learn* that an agent was deactivated so it can act on
  that knowledge. The founder rejected the premise, not just the mechanism: *"why does that even play a role
  for orchestration to know? if an agent is deactivated then core will not send a request. it doesn't matter
  if orchestration knows or not if something is deactivated. if it doesn't get a request to do something it
  doesn't do something."* Orchestration is a **blind executor** — it never initiates anything on its own; every
  unit of work it ever performs originates from a request core already sent. There is therefore no scenario
  where orchestration needs to independently discover or react to an agent's deactivation: the only lever that
  matters is whether core **sends new work** to that agent, and core already controls that unconditionally
  (deactivated agents simply stop receiving new baked requests — nothing upstream of this WP needs to change
  for that to hold). A request already baked and sitting in orchestration's own queue before deactivation
  happened represents core's authorization *at the moment it was made* — letting that one, already-authorized,
  already-queued unit of work complete is not a security gap to close; building an active
  cancellation/notification mechanism for it is exactly the kind of preemptive defensive engineering this
  project's own ethos rejects (`ETHOS.md`: security is earned from real learnings, never a wall built first;
  never design for paranoia). **Resolution:** delete `checkAgentRunnable`/
  `SessionLifecycleAgentRunnabilityReader` (the live re-check) entirely, with **no replacement of any kind** —
  no new event, no subscriber, no push. `admitSession`'s Phase 1 keeps consuming only the baked
  `BakedAgentRunnableConfig` snapshot (kind/status resolved at emit, already validated by
  `requireRunnableAgent`) purely as ordinary configuration, not as a security gate — there is no gate here to
  begin with, because there is nothing for orchestration to independently verify. The bounded race (an
  already-queued session launching after its agent was deactivated a moment after emit) is not tracked as an
  open item, not deferred to a follow-up, and not documented as a trade-off requiring future work — it is a
  non-issue given the request-driven model, full stop.
- **Stale-payload trust** — a test asserts a payload for a since-deleted source leads to the agent discovering
  it via MCP and reporting back, never a fallback orchestration core read.
- **Decision D cost query** — the new `core-ui → agent-orchestration` surface reads display data only; no core
  mutation; the write-gate stays core-side. A test asserts it cannot write.

## 13. Migrations (rename/remove/move enumeration)
- `session-requests/src/service.ts`: `delete` `resolveIntentInputInternal`'s core-domain reads +
  `requireRunnableActor` + the `taskDispatchAttempts` re-check; `keep` the CAS/dedup mechanics; `failOrRelease`
  — `remove` the direct `deps.routine.updateRoutineRunIfRunning` write, `add` an `emit` of
  `agent_run_admission_failed`. Resolution helpers `move` to core-api per the Inc-0 ruling. **(Decision B‴)**
  `add` the drain's supersede check — "a newer pending intent for the same `(kind, sourceId)` wins; mark the
  older `superseded`" — and the deliver-on-next-turn follow-up for an update during a running session (own-state).
- `packages/db/src/schema.ts`: `add` `superseded` to `agent_work_intents.status` CHECK (`:424`, additive value,
  no new table) — Decision B‴.
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
- **Cost cap (Decision D2):** `work/src/ports.ts` — `remove` the `CostCapChecker` port (`:181-199,283`);
  `work/bet-decomposition.ts:486-492` — `delete` the `checkCostCap` pre-flight + `if (!capResult.allowed)
  markTerminal(...)` block (decomposition proceeds unconditionally). No other core-api cost-block exists.
- **Agent-selection (Decision F1):** `remove` the `work → agent-selection` `AgentSelectionDefaults` port
  (`work/src/ports.ts`, `bet-decomposition.ts:223,418`); `move` `selectAgent` into core-api emit-time
  resolution; `fold` `isAtCapacity` into provision-time concurrency; retire `agent-selection` as a Service.
- **Credentials/filesystems (Decision F2):** `move` the provisioning op
  (`connections.{build,apply}ProvisioningPlan`, `filesystems.{listFilesystems, startWatcher}`) into
  orchestration reading the record via `CoreApiPort`; `keep` the records + `/api/connections`, `/api/filesystems`
  routes + `SettingsConnections`/`SettingsFilesystems` UI in core-api.
- **Recorder unification (Decision G):** `widen` `@hyperidle/shared`'s `AgentWorkIntentRecorderInput` to the
  full seven-kind union; `delete` the local mirrors in `work/src/ports.ts` (`WorkAgentWorkIntentInput`/`Record`/
  local `AgentWorkIntentRecorder`) and `review/src/ports.ts` (`ReviewAgentWorkIntent*`); every caller imports the
  one shared type (`tsc`-enforced) + a kind-set == schema-CHECK test.
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
- **Decision H1 (`session-requests::work`, `task_run` only):** `add`
  `packages/core-api/src/services/work-session-end-reactions.ts` (**`agent_run_lifecycle_changed`-only**
  subscriber keyed on `state`, `task` only — the `decomposition` half is DELETED by Decision I); `flip`
  `lifecycleProjectors.task` to `observeOnly` + `delete` `projectTask` + `DurableAgentQueueDeps.lifecycleProjection.work`;
  `move` `reapTerminalTaskDispatchAttempts` out of `reapExpired` into `server-factory.ts`'s retention reaper +
  `delete` `DurableAgentQueueDeps.work`; `wire` `registerWorkSessionEndReactions` at boot.
- **Decision H2 (`dispatch::conversation`/`::users`/`::settings`):** `bake` the thread transcript onto the
  `assistant_turn` event at emit (`routes/threads.ts`); `delete` (NOT seam-route, and NO `read_thread` MCP tool)
  `runTurnInternal`'s three core reads (`listMessagesByThread`/`getOrCreateUser`/`readServerConfig`); orchestration
  builds the harness input from the baked transcript (same prompt/AGENTS.md path as today's conversational branch,
  `provisioner.ts:883-903`); `add` a Decision-B‴ supersede trigger (a thread reply re-bakes a still-pending
  same-thread `assistant_turn`) for coherence; `move` the pin into a `@hyperidle/conversation`
  `thread_message_appended` subscriber (sender `kind` via same-layer DI to `users`); `delete`
  `registerAssistantTriggerInternal` + `DispatchPorts.conversation`/`users`. The resumable-harness-session / delta
  ("meta-orchestration") machinery is a SEPARATE follow-up WP, not AU21.
- **Decision H3 (`run-orchestration` context/lifecycle):** `grow` `BakedWorkIntentRequest` with a `contextBundle`;
  `add` shared `@hyperidle/knowledge` `assembleSessionKnowledge` (relocate `list`+`rankAndBudget` core-side) +
  have each per-kind resolver bake the bundle; `rewrite` `context.ts` to consume+write the baked bundle only
  (`delete` its `ContextAssemblyPorts` reads + `assembleAgentContext`'s `db`/fetch path); `delete` (NOT
  seam-route) `contextPorts` + `userReader`/`settingsReader`/`routineAccessor` + `workAccessor`'s reads in
  `run-orchestration-composition.ts`; route the lifecycle WRITES via events (`transitionTask("in_progress")` → a
  work subscriber on `session_started`; `updateBetById`/`updateTaskById` → work subscribers on `session_ended`) +
  `delete` `workAccessor`'s writes.
- **Decision I (remove built-in `bet_decomposition`):** `delete` `work/src/bet-decomposition.ts` + exports +
  `server-factory.ts` registration/orphan-sweep; `shrink` the intent union to SIX kinds (shared events/recorder,
  schema CHECK `:436` + sourceKind CHECK `:458` with a migration, session-requests `:1274`, run-orchestration
  contracts); `drop` `bets.decompositionStatus`/`decompositionBlockerReason` columns + zod + `work-service.ts`
  guard + `durable-agent-queue.ts` + `web/src/types/bet.ts`; `remove` the `decomposition` lifecycle
  projector/sourceKind; `delete` the `work_decompose_requested` event + `shared/src/bet-decomposition.ts`;
  `rework` `WorkBet.tsx`'s decompose empty-states; update Decision G's kind-set test to six. Founder open
  question (strategy auto-decompose) tracked in `.pipeline/AU.md`, non-blocking.

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
owner); `packages/web/src/services/ws-client.ts` + cost/session UI (new door + minimal signal); `packages/core-api/work/src/{ports.ts,bet-decomposition.ts}` (D2 cost-block removal, F1 selection port); `packages/core-api/review/src/ports.ts` + `packages/shared/src/agent-work-intent-recorder.ts` (G recorder unification); `packages/agent-orchestration/{agent-selection,cost}/src/*` (F1 dissolve, D cap gate); `packages/core-api/{connections,filesystems}/src/*` + `run-orchestration` provisioning (F2). **AU20 coordination:** none open (AU20 merged), but cross-check `log_task` + duplicate-read
cases against AU20's shipped diff before re-touching.

## 16. Risks & open questions
- **R1 (highest) — scope/effort. XL, unchanged by AU20** (§18). Mitigated by 10 independently-shippable
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
- **R9 — true mid-run session injection is harness-gated (Decision B‴).** The current adapters spawn CLIs with
  stdin closed (`harness-session-probe.ts:23-28`), so "deliver an update into the live session while it runs" is
  not free — it needs a harness that accepts mid-run input. AU21 ships the portable paths (supersede +
  deliver-on-next-turn, Increment 3); simultaneous mid-run injection is a named harness-capability follow-up, not
  in scope. Risk is scoping it in by accident — the doc flags it out explicitly.

## 17. Feasibility reference
See `feasibility.md` (re-derived): Probe 0 (graph blindness — now closed by the built scanner)
**GO-WITH-WARNING**; Probe 1 (injectable-`fetch`, bare `AppType`) **GO**; Probe 2 (seam home)
**GO-WITH-CONSTRAINT**; Probe 3 (resolve-at-emit + collapse; new pre-handoff channel; `taskDispatchAttempts` =
work-owned) **GO-WITH-CHANGE**; Probe 4 (dispatch monolith) **GO-WITH-COST**; Probe 5 (practice-meeting
delete-from-knowledge) **GO**; Probe 6 (NO cost mirror; per-session-cost gap) **GO — frame corrected**; Probe 7
(retire the realtime broadcaster; session stream in `agent-execution`) **GO**.

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
dissolution (F1) *removes* a Service; the recorder unification (Decision G) is a small refactor folded into the
Decision-B emit path (Increment 3); the Decision-B‴ continued-push handling (supersede + deliver-on-next-turn)
is bounded and rides Increment 3, with true mid-run injection deferred as harness-capability follow-up; the credentials/filesystems split (F2, Increment 8) is bounded. The one
genuinely additive piece — the cross-layer **settings reorg (F3)** — is scoped as its **own `/design` pass /
follow-up WP**, dependent on the `AgentOrchestrationPort` door, so it does not inflate AU21's build increments;
it is a named downstream design dependency, not in-scope build here. Net: still **XL**, **10 independently-shippable increments** — driven by the
behavioral core (drain read-deletion across four consumers, routine collapse, dispatch untangle) and Decision
E, not by Decision D. Summary for
`/work-planning`: the consumed surface got smaller, the behavioral core did not, and the four-Layer
door/streaming model is in scope — but the cost piece is a per-session gap, not a mirror teardown.
