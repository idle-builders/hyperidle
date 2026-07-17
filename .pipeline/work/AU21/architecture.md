# AU21 — Architecture: seam the `agent-orchestration → core-api` boundary; make the clean loop real

**Engineering tier:** production. **Type:** backend. **Design phase:** not required (no UI).
**Reads:** `.pipeline/work/AU21/plan.md`, `.pipeline/work/AU21/requirements.md` (founder-approved,
Phase 3), `.pipeline/work/AU21/feasibility.md`. **Writes:** this file.

> **Revision note.** R1 (post architecture-critique): (C1) `AppType` is bare `Hono` — seam benefit is
> *runtime route-identity*, not type-safety; (C2) fabricated sub-counts removed; (C4) anti-regrowth
> guard mandatory; per-increment execution. **R2 — founder rejected the DI-vs-API framing:**
> orchestration must never read core-api domain state; core-api validates + *pushes*; failures report
> back; core owns re-decision. **R3 — founder pushed further (2026-07-17):** the drain-time
> re-validation of core state (`resolveAuthoritativeInput`) is an *inherited, never-independently-chosen*
> crash-recovery mechanism (AU9 PR #425 → hardened by AU12/13/15 → relocated by AU19). Ruling: delete
> it; agents self-recover live via MCP. **R4 (post round-3 critique, 2026-07-17) — two verified
> blockers fixed:** (B1) the drain worker emits **nothing** — `agent_run_lifecycle_changed` fires only
> *post-session* (`session-lifecycle.ts:158`), so **pre-handoff** drain failures have **no** report-back
> channel today; deleting the drain-time re-check as first drafted would reintroduce the AU15
> permanent-routine-brick bug. Fixed by designing an explicit pre-handoff failure channel (§6 B5) and
> making the AU15 AC-3d guard a proof obligation (§14). (B2) `taskDispatchAttempts` is written by three
> **core-api** Services (`work/task-state-machine.ts:126`, `work/bet-decomposition.ts:260`,
> `policy/handoff-protocol.ts:344`) — the earlier "orchestration-owned, keep as-is" claim was wrong;
> now an explicit Increment-0 ownership question (§6 B, §9 Inc 0). WARNING items (ast-`<userId>` trust
> invariant, emit→deactivate→drain race) handled in §6 B / §12 / §16-R3.

## 1. Context — what problem, why now

Four Layers, four boundaries. Three already have a location-transparent seam: `core-ui → core-api`
(type-only RPC client), `agent-orchestration → agent-execution` (`HarnessPort`), and against-grain
`core-api → agent-orchestration` (EventBus + 5 permanent DI ports). The fourth —
`agent-orchestration → core-api`, the **busiest** boundary (45 of ~59 cross-layer Service-pairs) — is
ungoverned raw downward DI. The founder named the "orchestration is always colocated with core-api, so
DI is fine" assumption (`runtime-simplification.md`, flagged) as the **root cause** of the sprawl.

The founder's R2/R3 sharpening: the problem is not "raw DI vs. an API call" — it is that
**orchestration reaches into core-api's domain state at all**. The deepest instance — orchestration
re-reading core state at session-launch to "recover" from staleness — is an inherited mechanism nobody
chose; **delete it, the agent self-recovers live via MCP.** R4 makes that safe: the failure/recovery
paths the old drain-time reads implicitly protected (esp. AU15's routine-brick prevention) get a real,
explicit report-back channel instead of vanishing.

## 2. Fixed inputs (not re-litigated)

- AU19's 3 EventBus inversions + 5 permanent against-grain DI ports stand as decided.
- `agent-orchestration ↔ agent-execution`'s `HarnessPort` is the reference precedent, not in scope.
- No new authorization layer for agent-initiated core writes (named follow-up, out of scope) — the seam
  is chosen so that follow-up lands on one choke point.
- No UI change. Behavior changes only where fixing a named/verified bug, removing confirmed-dead
  capability, or where R2/R3/R4 relocate an emit-time validation to core-api, delete a drain-time
  re-read, or re-home a report-back write onto an event.

## 3. Required reading (for the builder, before implementing)

1. `.pipeline/work/AU21/requirements.md` — sharpened goal, "the clean loop" noun, worklist-provenance
   flag, seam-mechanism open question.
2. `plans/AU19/as-is-dependency-graph.md` — the 45-edge list, the against-grain EventBus-inversion bar,
   the concentration point (`dispatch`/`session-requests`/`tool-handlers`).
3. `docs/architecture/runtime-simplification.md` — §Applications/Layers/Services, Mechanism C, and
   §"Durable agent handoff" (the recovery contract R3 deletes the domain-re-read part of; R4 replaces
   its implicit failure paths with explicit channels).
4. `packages/shared/src/harness-port.ts` — the seam precedent.
5. `packages/web/src/api/client.ts` + `packages/core-api/src/app.ts:749` — injectable-`fetch`
   `hc<AppType>` client; `AppType` is bare `Hono` (no per-route schema, @lore AF4/§4g).
6. `packages/agent-orchestration/session-requests/src/agent-work-intent-worker.ts` — **read line by
   line.** `resolveAuthoritativeInput` reads core-api domain state in all 7 branches (deleted, R3);
   `claimAgentWorkIntent`/`drainAgentWorkIntents` CAS/dedup (kept); `failOrRelease` (`worker:416-467`)
   — the pre-handoff failure path that today writes `agentWorkIntents` + directly finalizes the routine
   run (`worker:460-465`, AU15 brick prevention) and **emits nothing** (the B1 gap).
7. `packages/shared/src/events.ts` — `AgentWorkIntentEvent`; `AgentRunLifecycleChangedEvent`
   (`state: completed|failed|cancelled`, `events.ts:25`, emitted **only post-session** at
   `session-lifecycle.ts:158`).
8. `packages/core-api/src/services/__tests__/routine-scheduler.au15.integration.test.ts` — the
   **AC-3d** test (`intent.status==="failed"`, `finalizedRun.outcome==="error"`, second-fire
   self-heals) that guards the permanent-routine-brick bug; the R4 proof obligation.
9. `packages/agent-execution/mcp-provider/*` + `tool-provider/*` — the MCP surface a running agent uses
   to pull current reality live (R3 self-recovery).
10. `packages/agent-orchestration/tool-handlers/src/ports.ts` +
    `packages/core-api/src/services/tool-handlers-bindings.ts` — the raw write ports the seam replaces.
11. `packages/api-contract/src/index.ts` — seam-contract home. `scripts/generate-dependency-graph.ts` —
    classification scan to extend. `docs/architecture/system-boundary.md` — vocabulary.

## 4. Plan reconciliation (spec ⇆ reality)

| Spec assumption | Reality | Plan handling |
|---|---|---|
| A per-edge disposition **worklist already exists**; WP "starts from disposition" | **FALSE — verified.** No verdicts committed anywhere. Structural graph current (2026-07-17): **139 DI + 34 EventBus edges; 45 are `agent-orchestration → core-api`**. No sub-count exists. | **Increment 0** re-runs the challenge, commits the worklist; disposition gated on it. |
| Seam "modeled on `HarnessPort`" (2 methods) | 45 Service-pair edges across ~10 Services. | Seam is a **family** (`CoreApiPort`); its **read** side is **deleted** (payload-pushed / live MCP pull), not rerouted. §6 C. |
| Write-back "same door `core-ui` uses"; `hc<AppType>` typed RPC | `AppType` bare `Hono` (`app.ts:749`) — no compile-time route typing; door real at runtime. | **Decision A**: literal route stack, injected transport, runtime route-identity; §11 contract tests stand in for typing. Typed-`AppType` restore deferred (Decision C). |
| Event carries everything; orchestration re-reads core state at drain for crash-safety | `resolveAuthoritativeInput` re-reads core state in all 7 branches; the drain worker **emits nothing** on failure (B1). | **Decision B (R2+R3+R4):** core-api validates + resolves + pushes at emit; orchestration reads only its own dedup rows and dispatches; drain-time domain re-reads **deleted**; agents self-recover via MCP; failures report back on **two explicit channels** — a **new** `agent_run_admission_failed` (pre-handoff) + the existing `agent_run_lifecycle_changed` (post-session) — each with a **new** core-api reaction. §6. |
| `taskDispatchAttempts` is orchestration-owned dedup state | **Written by 3 core-api Services** (`work`×2, `policy`); read+updated+deleted by orchestration; sits in `UNOWNED_SHARED_TABLES`. Its `task_run` read (`status !== "requested"`) is a drain-time re-validation of core-written state. | **Increment-0 ownership question** (§9 Inc 0) — who owns it; if core-api does, does the `task_run` re-check get the same delete-and-self-recover treatment. Not assumed favorable. |
| `session-requests → settings` edge | Confirmed phantom. | Increment 5 verifies absence (AC #4). |
| A Service can type-only-import `AppType` from core-api | No (Layer import) + bare anyway. | Seam contract in `@hyperidle/api-contract` (zero-dep). §6 C. |
| Orchestration must read core roster to *select* an agent | Selection is core roster × orchestration WIP. | Core-api resolves + bakes the agent (or candidates+roles) at emit; overload → orchestration's existing provision-time `ConcurrencyLimitError` defer/retry (own state). §6 B. |

### Blast radius (surfaces/obligations, not a file inventory)

- **`session-requests` drain worker** (`agent-work-intent-worker.ts`) — `resolveAuthoritativeInput`
  collapses to "read my own dedup row → build from baked payload → dispatch"; all 7-branch core-domain
  reads deleted. `failOrRelease` gains an **emit** (the new pre-handoff failure event) and loses its
  direct core write.
- **The emitting core-api Services** (`work`, `conversation`, `knowledge`, `routine`, `review`, `org`,
  `users`) — validate own state + resolve the run + bake the start-payload at emit; **and** subscribe
  to the new failure event to finalize their own state (e.g. `routine` finalizes the routine run,
  replacing the AU15 direct write).
- **New domain event** `agent_run_admission_failed` in `packages/shared/src/events.ts` — the
  pre-handoff report-back channel.
- **The MCP/tool surface** (`agent-execution` mcp-provider/tool-provider + `tool-handlers`) — must let
  a running agent pull current source state live (R3 self-recovery). Confirm coverage in Increment 0.
- **The composition root** `*-bindings.ts` — remove read ports; move writes to the seam; wire the new
  event's subscribers.
- **~10 orchestration Service packages** — each `ports.ts` loses core-api **read** ports; writes → seam.
- **`@hyperidle/api-contract`** — gains `CoreApiPort` (write methods); zero-dep.
- **`packages/desktop/src/boot-server.ts` + `packages/remote-server/src/index.ts`** — transport wiring.
- **`packages/core-api/src/app.ts` / `server-factory.ts`** — expose the Hono `app` in-process dispatcher.
- **Event payloads** — the request envelope carries the baked run start-payload.
- **`generate-dependency-graph.ts` + `as-is-dependency-graph.md` + JSON** — new classification + guard
  (the new `agent_run_admission_failed` edge must show as an against-grain EventBus inversion).
- **AU20 overlap** — `log_task`, duplicate-read cases: cross-reference, do not fix twice.

## 5. The clean loop (the pinned noun) — as-built target (push + self-recovery + explicit report-back)

```
core-api Service (work/conversation/knowledge/routine/review/…) detects it needs an agent
   │  VALIDATES ITS OWN STATE NOW; resolves the run (agent identity + correlation; validates the
   │  deterministic ast-<userId> assistant agent is a real runnable AI, never the human sender)
   │  emits ONE request carrying the baked run START-payload (current at emit by construction)
   ▼
agent-orchestration  ── reads/writes ONLY its own dedup state (AU9 CAS). Does NOT re-read core state.
   │  Dispatches the session AS REQUESTED. Baked agent at WIP → own provision-time ConcurrencyLimitError.
   │  Builds + deploys; dispatches via HarnessPort  ─────────────┐
   ▼                                                              ▼
agent-execution  ── runs the session (LLM/harness/MCP)
   │  ★ SELF-RECOVERY: the running agent pulls CURRENT reality live via MCP / CoreApiPort tools;
   │    if reality contradicts its instructions it adjusts or reports the request stale — no hardwired
   │    orchestration pre-check. (A deactivated agent fails at provision-time credential context.)
   │  agent acts on core data (create_bet, send_message, …)  ──▶ CoreApiPort (same route stack as UI)
   ▼
core-api

   ── FAILURE report-back — TWO explicit channels, each with a NEW core-api reaction ──▶
      • PRE-handoff (bad payload / MAX_ATTEMPTS / provisioning fail, before any session):
        drain worker emits NEW `agent_run_admission_failed {intentId,kind,sourceKind,sourceId,
        failureCode,terminal}`  →  core-api Services finalize their own state
        (routine → run outcome="error", replacing the deleted direct write) + decide retry/abandon.
      • POST-session (a session ran and failed): existing `agent_run_lifecycle_changed {state:"failed"}`
        (`session-lifecycle.ts:158`)  →  NEW core-api retry/abandon reaction.
   ▼
   retry → core-api re-validates + PUSHES a fresh request  ▲──── loops back    abandon → done.
```

Hard rule (per edge in Increment 0's worklist): **any orchestration read of core-api domain state is a
defect.** Legal shapes: (a) core-api validates + pushes at emit; (b) orchestration acts on its own
dedup state + the baked payload; (c) the running **agent** pulls current reality live via MCP and
self-recovers; (d) failure reported via one of the two explicit events, re-decision owned by core-api.

## 6. Design decisions (design-it-twice)

### Decision A — Write-back leg mechanism (open question #1) — UNCHANGED

**Reuse the literal core-api route stack via `hc<AppType>`, Application-injected transport; benefit is
runtime route-identity, not type-safety.**
- *Alt 1 (chosen)* — `fetch = app.request` in-process (`desktop`), network fetch split
  (`remote-server`). Trade-offs: slight in-process HTTP overhead; bare `AppType` → no compile-time route
  typing (hand-typed mirrors validated by §11 contract tests). Wins: provably the same door the user
  uses at runtime (same handler+auth+validation+middleware), reuses the shipped injectable-`fetch`
  pattern, one authz choke point for the deferred follow-up.
- *Alt 2 (rejected)* — bespoke `CoreApiWritePort` function seam: a parallel write path drifting from the
  UI's route/validation/authz; "same door" becomes an assertion, not a runtime fact.

### Decision B — The read leg: DELETE orchestration's core-domain reads; agents self-recover; failures reported on explicit channels (R2+R3+R4)

**Founder R3:** *"the agent can also recover itself… pull the latest information via mcp. agents are
better at recovery than any hardwired system."*

**The model.**

1. **Core-api validates + resolves the run at emit time** and emits a request carrying the baked
   **start-payload** — the resolved agent identity + correlation (today's `resolveAuthoritativeInput`
   *return* shape; and for selection families, candidate roster+roles). Produced by the emitting
   Service, current at emit by construction. **Includes preserving the ast-`<userId>` trust invariant**
   (`worker:93-103` @lore): the deterministic `ast-<userId>` assistant-agent ID is *only a lookup key*;
   the emitting core-api Service (users/conversation) must reload the real `users` row and validate
   `kind==="ai"` + active/idle **before** baking `defaultAgentId` (never the human sender). This
   validation does not disappear with the read — it **moves to emit time**, where it belongs.
2. **Orchestration reads/writes only its own dedup state.** The drain worker claims its own
   `agentWorkIntents` row (AU9 CAS — kept verbatim) and dispatches from the baked payload — **zero**
   core-api domain reads. Selection agent identity is baked; if at WIP, orchestration's existing
   provision-time `ConcurrencyLimitError` (own session state, `worker:237` note) defers+retries.
3. **The drain-time domain re-validation is DELETED** — every `deps.conversation.*`/`deps.work.*`/
   `deps.knowledge.*`/`deps.routine.get*`/`deps.review.*`/`deps.org.*`/`deps.users.*` call in
   `resolveAuthoritativeInput` and its eligibility guards. They were inherited crash-recovery, not
   independently chosen.
4. **A running agent self-recovers** via the same MCP/`CoreApiPort` tools it already uses; if the fact
   changed between emit and launch it adjusts or reports the request stale.
5. **Failures are reported back on two explicit channels — neither is "already wired to a core-api
   recovery reaction"; both reactions are NEW (this corrects the round-3 draft's false "channel already
   exists" claim):**
   - **Pre-handoff** (a failure *before* any session starts — bad baked payload,
     `MAX_ATTEMPTS_EXCEEDED`, `INVALID_WORK_SOURCE`, a hard provisioning failure): today the drain
     worker's `failOrRelease` **emits nothing** (verified — no `emit`/`eventBus` anywhere in the
     worker). **Add a new domain event `agent_run_admission_failed { intentId, kind, sourceKind,
     sourceId, failureCode, terminal }`, emitted by `failOrRelease`.** This is a **genuinely new
     against-grain (`agent-orchestration → core-api`) EventBus inversion** — legal by AU19's rule, and
     it clears the EventBus-inversion bar (fire-and-forget, no shared transaction, no reply needed:
     `failOrRelease`'s current routine finalize is already a separate, idempotent `WHERE
     outcome='running'` no-op write, not atomic with the intent update), same class as AU19's 3 existing
     inversions. It is **additive** — it does not reopen any AU19 ruling. Core-api Services subscribe:
     `routine` finalizes the routine run to `outcome="error"` (replacing the deleted direct
     `updateRoutineRunIfRunning` write, preserving AU15 AC-3d); each family decides retry/abandon.
   - **Post-session** (a session ran, then failed): the **existing** `agent_run_lifecycle_changed
     {state:"failed"|"cancelled"}` (`events.ts:25`, `session-lifecycle.ts:158`). The channel exists;
     the core-api **retry/re-decide reaction is new** (today the only core-api observers are telemetry
     in `observability/dispatcher.ts:498` + `sessions-routes`/review-creator — none does retry).
6. **Core-api owns retry/recovery** off either event (automatic policy or a human via review/AL7); on
   retry it re-validates and **pushes a fresh request** (same emit path). Bounds attempts (reuse the
   `AGENT_WORK_INTENT_FAILURE_CODES` + backoff logic, relocated core-side) and routes repeated failure
   to review/AL7 rather than looping.

- *Alt (rejected, R1)* — "neutral intent + seam-routed drain re-read + named exemptions": kept
  orchestration reading core state.
- *Alt (rejected, R2 interim)* — "relocate the 7-branch validation into core-api but keep it as a
  drain-time re-validation": still a hardwired pre-check; the re-validation itself is deleted (R3).

**Does it hold up? — verified line-by-line against real code.**

- *Classification of every read in `resolveAuthoritativeInput`:*
  - **(a) Orchestration's OWN dedup state — KEEP:** the `agentWorkIntents` CAS claim
    (`claimAgentWorkIntent`); `explicitSessionStarts` (session-requests-owned per `TABLE_OWNER`,
    `session_start` branch — its `status!=="requested"` check is a read of its **own** state, allowed).
  - **(a?) `taskDispatchAttempts` — OWNERSHIP UNRESOLVED, Increment-0 question (B2 fix):** verified
    written by **three core-api Services** (`work/task-state-machine.ts:126`,
    `work/bet-decomposition.ts:260`, `policy/handoff-protocol.ts:344`), read/updated/deleted by
    orchestration, and currently in `UNOWNED_SHARED_TABLES`. Its `task_run`-branch read
    (`attempt.status !== "requested"`) **is** a drain-time re-validation of state core-api writes — the
    pattern the model bans. The earlier "orchestration-owned, keep as-is" claim was wrong. Increment 0
    must resolve: who owns it; if core-api does, does the `task_run` re-check get the same
    delete-and-self-recover treatment as everything else, or is there a real reason it differs.
  - **(b) Core-api domain state — DELETE (all 7 branches):** `conversation.getMessageById`;
    `work.getTaskById`/`getBetById`; `knowledge.findById`; `routine.getRoutineRunById`/`getRoutineById`;
    `review.findGrantedProposedCall`; `org.getTeamMembersByTeamId` + `users.listUsersByTeam`/
    `getUserById`; `users.getUserById` via `requireRunnableActor`.
- *What the protected crash-replay tests actually assert (verified):* idempotency/dedup only —
  `recordAgentWorkIntent` idempotent (`second.id === first.id`, `rows.toHaveLength(1)`);
  `createAgentSessionRequest` idempotent + concurrent-duplicate → `winners.toHaveLength(1)`. **No test
  asserts "replay re-reads core state and rejects a stale request."** Deleting the (b) reads breaks no
  protected dedup guarantee (the own-row CAS stays). **But** the AU15 **AC-3d** test *does* assert a
  pre-handoff-failure finalization (routine run → `error`, second-fire self-heals) — that is what B1's
  new channel preserves; it is a §14 proof obligation, not an assertion.
- *The two flagged items (argued from the founder's framing, not a general exception bucket):*
  1. **`taskDispatchAttempts` ownership** (above) — Increment 0.
  2. **Target-agent runnability + the emit→deactivate→drain race.** `requireRunnableActor` is an
     *authority* check (a deactivated agent must not run). Moving it to emit (step 1) covers the common
     case, but names a real race: an agent deactivated in the gap between core-api emitting and
     orchestration draining. **Preferred answer (per reviewer, cleaner than a supersede/cancel
     mechanism): provision-time credential-context failure** — a deactivated agent's provisioned
     session has no valid credential/identity context and fails to start, so no stale-authority run
     proceeds; core-api need not hunt down and cancel outstanding requests. Increment 0 confirms the
     provision path enforces this; founder confirms the item at the concept gate.

### Decision C — Seam shape (open question #2, write side); the read side is deleted

**`CoreApiPort` — a per-core-Service family of narrow hand-typed **write** method groups in
`@hyperidle/api-contract`, each mirroring a real core-api route, Application-adapted onto the `hc`
client.** (Sketch in §10.) Under Decision B the seam's **read** methods **do not exist** — former read
edges become event-payload fields (pushed) or live agent MCP pulls, not seam calls. `CoreApiPort` = the
write-back leg.

- **Method types are hand-written mirrors the compiler can't verify against routes** (`AppType` bare) —
  fidelity is a **tested** obligation (§11); the top write-leg correctness risk.
- *Alt (rejected)* — expose full `hc<AppType>`: Mechanism-C violation + bare `AppType` buys nothing +
  unbounded surface.

**Typed-`AppType` restore — DEFERRED** (separate change across all `routes/*.ts` + web client). §11
contract tests are the compensating control; follow-up named, not owned.

Naming: **"the clean loop"** for the cycle; **`CoreApiPort`** for the write seam.

## 7. Disposition rule (applied to every edge in Increment 0's worklist)

Per capability behind a `agent-orchestration → core-api` edge, in order:
1. **Dead / duplicate** → remove (a test proves the survivor works). Cross-check AU20 first.
2. **A drain/build-time read of core domain state** → **delete the read.** Core-api validated at emit
   and baked what's needed; runtime detail is pulled live by the agent via MCP.
3. **Agent selection input** → baked at emit; overload → orchestration's own provision-time concurrency
   check. No core read.
4. **A write — the agent acting on core like a user** → `CoreApiPort` (Decision A).
5. **A failure/terminal signal orchestration must send core** → the new `agent_run_admission_failed`
   (pre-handoff) or the existing `agent_run_lifecycle_changed` (post-session); core-api owns the
   reaction (Decision B5–6). This also re-homes `failOrRelease`'s current direct routine write.

There is **no** "recovery read" category. A surviving orchestration→core domain read is a defect. The
only individually-flagged items are (i) `taskDispatchAttempts` ownership and (ii) target-agent
runnability authority (§6 B) — both resolved in Increment 0 / founder-confirmed, not a general bucket.

## 8. Acceptance criteria → verification

| # | AC | Verification |
|---|---|---|
| 1 | Location-transparent `CoreApiPort` **write** seam exists (Application-wired, in-process today, remote-capable) | (a) Integration test builds `CoreApiPort` with `fetch = app.request` AND a stub network `fetch`; identical call succeeds via both. (b) **Per-method contract test** (§11): each method reaches its real route + middleware runs. (c) `npm run check` proves the contract type-resolves from a Service depending only on `@hyperidle/api-contract`. |
| 2 | The push+self-recovery loop is real end-to-end and **orchestration reads zero core-api domain state** | (a) Integration test: a core-api Service validates + emits with the start-payload baked; the drain builds+deploys performing **zero** core-api reads (asserted via the composition root + the §9-Inc-5 guard). (b) `resolveAuthoritativeInput`'s core-domain reads are gone; its own-state dedup reads remain and the **existing idempotency tests pass unchanged**. (c) Self-recovery test: a run for a source changed after emit is not pre-checked away; the session runs and the agent's MCP read observes current state (or fails → emits the failure event → core reacts). (d) Agent write lands via the core-api route path (middleware ran). |
| 2b | **Pre-handoff failure report-back works and the AU15 brick is still prevented (B1)** | Integration test: force a pre-handoff terminal failure (routine deactivated / `MAX_ATTEMPTS`); assert the drain worker emits `agent_run_admission_failed`, a core-api subscriber finalizes the routine run to `outcome="error"`, and the AU15 **AC-3d** guarantee holds (intent `failed`, run `error`, second fire self-heals, no permanent brick). The existing `routine-scheduler.au15.integration.test.ts` AC-3d is rewired to the event mechanism and **must pass**. |
| 3 | Every edge in the regenerated worklist gets a disposition surviving re-challenge | `edge-disposition.md` (Increment 0): each capability + verdict + §7 disposition + reasoning; reviewer confirms. Post-fix graph shows each former read edge **gone** or write edge **seam-routed**; the new failure event shows as an against-grain EventBus inversion. |
| 4 | Phantom `session-requests → settings` absent everywhere | `grep` → zero hits. |
| 5 | `generate-dependency-graph.ts` re-run; new baseline distinguishes seam-write / pushed-payload / raw-DI; replaces 139/34/45 | Run the script; assert distinct edge-types + the new EventBus inversion; docs updated + byte-consistent with JSON. |
| 6 | AU19's 5 permanent DI ports + 3 EventBus inversions not silently reopened | Diff check: those 8 edges unchanged (the new event is additive, a 4th inversion, not a change to them); protected assertion covers behavior. |
| 7 | A documented + **enforced** practice for a new orchestration→core edge | (a) Doc states the rule. (b) The **mandatory guard** (§9 Inc 5) fails CI on a new orchestration→core read port or Service dep — a test proves it fires. |

Floor: `npm run verify` green; service-lane integration tests cover the loop, the write seam, and both
failure channels.

## 9. Ordered tasks (increments)

**Execution model.** Each Increment is an **independently shippable cycle**: architecture-touch-up (if
needed) → write-tests (red) → write-code (green) → review → verify → **clean commit**, before the next.
Fresh agents per increment; each leaves `main` green.

**Increment 0 — Re-establish the worklist (BLOCKER).**
- Re-run the AU19 two-phase adversarial challenge over the **45 cross-layer edges** + capabilities. For
  each **read**: classify (a) own dedup / (b) core domain → delete, and what the emitting Service bakes
  vs. what the agent pulls live. For each **write**: the backing route.
- **Resolve `taskDispatchAttempts` ownership (B2):** who owns it (3 core-api writers vs. orchestration
  read/update/delete); if core-api owns it, whether the `task_run` `status!=="requested"` re-check gets
  the delete-and-self-recover treatment or is genuinely different. Record the ruling.
- **Design the pre-handoff failure channel (B1):** finalize `agent_run_admission_failed`'s shape +
  which core-api Services subscribe + how each finalizes its own state (routine finalize first). Confirm
  it clears the EventBus-inversion bar and does not reopen AU19.
- Confirm the MCP/tool surface exposes the source reads a running agent needs for self-recovery; confirm
  the provision-time credential-context path enforces target-agent runnability (§6 B item 2).
- Commit `edge-disposition.md`: per-capability verdict + §7 disposition + reasoning + the two flagged
  rulings. Cross-reference AU20. **Gate:** disposition (Inc 2–4) begins only after commit + review.

**Increment 1 — Build the `CoreApiPort` write seam + transport + contract-test harness; prove one write.**
- Add `CoreApiPort` (interfaces only) to `@hyperidle/api-contract` seeded with `work.createBet`; expose
  core-api's Hono `app` as an in-process dispatcher; add `buildCoreApiPort(transport)`; wire `desktop`
  (in-process) + `remote-server` (network); stand up the §11 contract-test harness. Migrate one
  `tool-handlers` write (`create_bet`); delete its raw write port.
- Tests: dual-transport (AC #1a), contract test (AC #1b), `create_bet` via route (AC #2d).

**Increment 2 — Write-back leg.** Migrate `tool-handlers`'s remaining writes (send_message, create_task,
promote knowledge, handoff, create_item, create_team, add_agent, …) + UI-mirroring
`dispatch`/`session-requests` writes onto `CoreApiPort`, each with its §11 contract test; remove raw
write ports.

**Increment 3 — Delete the read leg; push at emit; agent self-recovery; explicit failure channels (Decision B).**
- Move each family's emit-time validation + run-resolution (incl. the ast-`<userId>` runnability check,
  §6 B1) into the emitting core-api Services; extend the emitted request payload with the baked
  start-payload (+candidates+roles).
- **Delete** `resolveAuthoritativeInput`'s (b) core reads; collapse the drain worker to
  claim-and-build-from-payload; keep the AU9 CAS/dedup reads. Overload → existing provision-time
  `ConcurrencyLimitError`.
- **Build the pre-handoff failure channel (B1):** add `agent_run_admission_failed`; emit it from
  `failOrRelease`; add core-api subscribers (routine finalize replacing the direct write; retry/abandon
  decision). **Build the post-session retry reaction** on the existing `agent_run_lifecycle_changed`.
  Bound attempts (relocated `AGENT_WORK_INTENT_FAILURE_CODES` + backoff); route repeats to review/AL7.
- Apply the `taskDispatchAttempts` ruling from Increment 0.
- Ensure the MCP/tool surface supports live self-recovery; add its tests.
- **Rewire the AU15 AC-3d test** to the event mechanism; it and AC #2b must pass. Rewrite only the
  **selection** tests (routine WIP/delegate, decomposition candidate) to the baked-agent + provision-defer
  behavior. The **idempotency/dedup tests stay unchanged and green** (§14).
- Largest increment; split by intent family if it exceeds one cycle (assistant_turn → task_run/
  session_start → routine_run → bet_decomposition → knowledge_action → reengagement), each committed.

**Increment 4 — Dispose the residue.** Remove UNJUSTIFIED/duplicate edges; every removal proven still
served (test) — via payload, live MCP pull, or the write seam.

**Increment 5 — Re-baseline + MANDATORY anti-regrowth guard.**
- **Mandatory:** a lint / `tsc`-negative-case that **fails** when an `agent-orchestration` Service
  declares a core-api **read** port or depends on a core-api Service package. Allowlist = only the
  founder-approved flagged items if any (target-agent runnability, and the `taskDispatchAttempts`
  ruling if it lands core-side), recorded in `edge-disposition.md`; a test proves it fires on a
  deliberate violation (AC #7b).
- Extend `generate-dependency-graph.ts` with `seam-write`/`pushed-payload` edge-types + recognize the
  new `agent_run_admission_failed` inversion; re-run; update `as-is-dependency-graph.md` (replace
  139/34/45); confirm phantom edge absent.
- Reword `runtime-simplification.md`'s colocation sentence AND "Durable agent handoff" to the push +
  self-recovery + explicit-report-back model.
- Write the going-forward practice (AC #7a).

## 10. Contracts / type signatures

- `CoreApiPort` + per-Service **write** sub-interfaces in `@hyperidle/api-contract`, type-only,
  hand-written route mirrors; fidelity via §11 contract tests.

```
// @hyperidle/api-contract  (zero runtime deps — TYPE-ONLY)
export interface CoreApiPort { readonly work: CoreApiWorkPort; readonly conversation: CoreApiConversationPort; /* … */ }
export interface CoreApiWorkPort { createBet(input: CreateBetRequest): Promise<CreateBetResponse>; /* only surviving WRITES */ }
export type CoreApiTransport = (req: Request) => Promise<Response>;  // === hc's injectable fetch
```

- `buildCoreApiPort(transport: CoreApiTransport): CoreApiPort` — Application-layer factory.
- **Run start-payload (baked at emit):** today's `resolveAuthoritativeInput` *return* shape —
  `defaultAgentId` (resolved + runnability-validated at emit), `sourceKind`, `sourceId`, `streamId`,
  `taskId`/`teamId`, `sourceCorrelation`, and (selection families) `candidates: {agentId, role}[]`. A
  **start-payload, not a re-validatable snapshot** — the agent pulls current detail live via MCP.
- **Failure report-back — two events:**
  - **NEW** `AgentRunAdmissionFailedEvent { type:"agent_run_admission_failed", intentId, kind,
    sourceKind, sourceId, failureCode, terminal, timestamp }` in `packages/shared/src/events.ts`, added
    to the `DomainEvent` union — emitted by the drain worker's `failOrRelease` (pre-handoff). A new
    against-grain EventBus inversion (§6 B5).
  - **EXISTING** `AgentRunLifecycleChangedEvent {state, requestId, sourceKind, sourceId}`
    (`events.ts:25`) — post-session. No shape change; the new code is core-api's *reaction*.
- Core-api gains **new reactions** to both events (routine finalize on the new event; retry/abandon on
  both). No new SQL tables assumed; any persisted payload field is an additive column on an
  orchestration-owned table (never a core-api table).

## 11. Route / seam-capability contract obligation (TESTED, not a grep)

`AppType` is bare, so a grep of seam methods against `routes/*.ts` silently rots. Replaced by a **hard,
tested obligation**: every `CoreApiPort` **write** method has a contract test invoking it through the
in-process transport, asserting it reaches its real backing route and gets the expected response shape.
Every seam write must map to a real existing route (confirmed present: `POST /bets`, `POST
/bets/:id/commit|ship|…`, `PATCH /bets/:id`, conversation message routes). The reviewer checks each seam
method in `edge-disposition.md` has a backing route + a passing contract test.

## 12. Security & abuse cases

- **Input-trust boundary for agent-authored fields** — APPLICABLE. Agent writes now traverse the same
  validation/zod/middleware a human's do (net improvement over raw DI); a §11 contract test asserts
  middleware ran (`app.request` runs the full stack; must not be bypassed).
- **ast-`<userId>` templated-ID trust invariant (WARNING)** — APPLICABLE, explicitly preserved.
  Deleting `requireRunnableActor` must **not** drop the `worker:93-103` invariant: the deterministic
  `ast-<userId>` ID is only a lookup key; the emitting core-api Service reloads the real `users` row and
  validates `kind==="ai"` + active/idle before baking it as `defaultAgentId`, never the human sender. A
  test asserts an assistant run for a human sender resolves to the AI assistant agent and rejects a
  non-runnable one at emit.
- **Auth/actor on agent writes** — APPLICABLE, scoped. The seam carries the agent's owning identity as
  route actor (`c.get("userId")`), not spoofed/empty; a test asserts it. Per-agent authorization is the
  deferred follow-up; this WP must not regress actor correctness.
- **Target-agent runnability under self-recovery + the emit→deactivate→drain race** — APPLICABLE (§6 B
  item 2). Covered by provision-time credential-context failure (a deactivated agent's session cannot
  provision valid identity); a test asserts a deactivated agent's run does not proceed with authority.
  Founder confirms the item.
- **Stale-payload trust** — a test asserts a payload for a since-deleted source leads to the agent
  discovering it via MCP and reporting back (`agent_run_admission_failed`/lifecycle `failed`), never a
  fallback core read.
- **Rate-limit** — N/A-new (seam reuses existing route middleware). **Secret/path-traversal/SSRF** —
  N/A.

## 13. Migrations (rename/remove/move enumeration)

- `agent-work-intent-worker.ts`: `delete` the (b) core-domain reads + eligibility guards from
  `resolveAuthoritativeInput` (collapses to build-from-payload); `keep` the (a) own-state dedup/CAS
  reads; `failOrRelease` — `remove` the direct `deps.routine.updateRoutineRunIfRunning` core write
  (`worker:460-465`) and `add` an `emit` of `agent_run_admission_failed` in its place.
- Emitting core-api Services (`work`/`conversation`/`knowledge`/`routine`/`review`/`org`/`users`):
  `add` per-family emit-time validation (incl. ast-`<userId>` runnability) + start-payload assembly;
  `add` a subscriber to `agent_run_admission_failed` (routine → finalize run to `error`) + the
  retry/abandon reaction.
- `packages/shared/src/events.ts`: `add` `AgentRunAdmissionFailedEvent` to the `DomainEvent` union.
- `taskDispatchAttempts`: apply the Increment-0 ownership ruling (`move`/`keep`/`delete` per outcome).
- Each orchestration Service `src/ports.ts`: `remove` core-api **read** ports; `reroute` write ports to
  the seam; keep intra-orchestration + against-grain ports.
- `*-bindings.ts`: `reroute` (writes) / `delete` (reads) / `wire` (new event subscribers).
- `generate-dependency-graph.ts`: `extend` (+ guard). `as-is-dependency-graph.md` + JSON: `rebaseline`.
- `runtime-simplification.md` colocation sentence + "Durable agent handoff": `reword` (Inc 5).

## 14. Protected tests

`protectedTests` (verified against real assertions):
- **Idempotency/dedup — STAY GREEN UNCHANGED.** `agent-work-intent-worker.routine-selection.integration.test.ts`
  (idempotent record: `second.id === first.id`, `rows.toHaveLength(1)`) and
  `agent-session-requests.integration.test.ts` (idempotent create; concurrent-duplicate →
  `winners.toHaveLength(1)`). They assert dedup, not domain re-validation; the own-row CAS that
  satisfies them is kept verbatim.
- **AU15 permanent-routine-brick guard — PROOF OBLIGATION (B1), rewired not dropped.**
  `routine-scheduler.au15.integration.test.ts` **AC-3d** ("pre-hand-off intent failure finalizes the
  run, self-healing coalescing": `intent.status==="failed"`, `finalizedRun.outcome==="error"`,
  `secondFire.reason !== "previous run still in progress"`) must **still pass** after the direct
  finalize write is re-homed onto `agent_run_admission_failed` + a core-api subscriber. Increment 3
  updates the test's wiring to the event mechanism; the *guarantee* (no permanent brick) is identical.
  This is the load-bearing verification that R4 closed B1.
- **Selection tests — REWRITTEN in Increment 3** (routine WIP/delegate, decomposition candidate) to the
  baked-agent + provision-defer mechanism.
- The 5 permanent against-grain DI ports + 3 EventBus inversions behavior tests (AC #6) — unchanged
  (the new event is a 4th, additive inversion).
- The `HarnessPort` seam tests — untouched.
- **New protected guarantee:** the AC #2a "orchestration reads zero core-api domain state" test.

Builder records the concrete file set at write-tests time; the DoD audit checks it with `git diff
--name-only`.

## 15. Shared files (parallel-WP overlap)

`sharedFiles`:
- `packages/api-contract/src/*` (seam). `packages/shared/src/events.ts` (payload growth + the new
  `agent_run_admission_failed` event).
- `packages/core-api/src/app.ts`, `server-factory.ts` (dispatcher), `services/*-bindings.ts` (root +
  new subscribers).
- The emitting core-api Service packages (`work`/`conversation`/`knowledge`/`routine`/`review`/`org`/
  `users`) — emit-time validation + failure-event subscribers.
- The MCP/tool surface (`agent-execution` mcp-provider/tool-provider, `tool-handlers`) — self-recovery.
- `packages/desktop/src/boot-server.ts`, `packages/remote-server/src/index.ts` (wiring).
- `scripts/generate-dependency-graph.ts`, `plans/AU19/as-is-dependency-graph.md`, the JSON.
- **AU20 coordination** — `log_task` + duplicate-read cases; sequence Increment 0 to reconcile first.

## 16. Risks & open questions

- **R1 (highest) — scope.** **XL**, not L: the challenge (Inc 0) + write seam + delete-the-read-leg +
  build **two** failure-report-back channels + relocate emit-time validation into 7 core-api Services,
  across 6 increments. Mitigated by per-increment shipping + Inc 3's per-family split. Flag
  `/work-planning` to reassess to XL.
- **R2 — seam↔route fidelity without compile-time typing (C1).** Bare `AppType` → hand-typed mirrors
  only as correct as §11's contract tests. Mitigation: §11 hard obligation; typed-`AppType` deferred.
- **R3 — target-agent runnability + emit→deactivate→drain race (WARNING, §6 B item 2).** Deleting
  `requireRunnableActor` removes orchestration's drain-time gate; the emit→deactivate→drain race is
  real. Preferred cover: **provision-time credential-context failure** (cleaner than supersede/cancel).
  Increment 0 confirms the provision path enforces it; founder confirms. Argued as an authority
  question, not a recovery-read exemption.
- **R4 — the pre-handoff failure channel is genuinely new (B1).** `agent_run_admission_failed` is a new
  against-grain EventBus inversion + new core-api subscribers; under-building it re-opens the AU15
  permanent-brick bug. Mitigation: AC #2b + the rewired AU15 AC-3d test are hard gates; Increment 0
  designs the event + subscriber set before any deletion.
- **R5 — `taskDispatchAttempts` ownership (B2).** Written by 3 core-api Services; its `task_run` read is
  a re-validation. Unresolved by design — Increment 0 rules on ownership + whether the re-check deletes.
  Getting this wrong (assuming orchestration-owned) would leave a hidden core read. Not assumed.
- **R6 — actor identity through the write seam.** §12 tested obligation.
- **R7 — worklist re-run cost.** Inc 0 re-runs the challenge the spec wrongly assumed done.
  Non-negotiable per the provenance finding.

## 17. Feasibility reference

See `.pipeline/work/AU21/feasibility.md`: Probe 1 (injectable-`fetch` transport shipped; runtime
route-identity; bare `AppType`) **GO**; Probe 2 (seam home `@hyperidle/api-contract`) **GO-WITH-
CONSTRAINT**; Probe 3 (the push + agent-self-recovery model vs. the inherited drain-time re-read —
verified line-by-line: all 7 branches read core-api state and delete cleanly; the protected tests
assert dedup not domain re-validation; **the drain worker emits nothing today, so the pre-handoff
failure channel `agent_run_admission_failed` is genuinely new** (B1); `taskDispatchAttempts` ownership
is an Increment-0 question (B2)) **GO — model holds; two items (taskDispatchAttempts ownership,
target-agent runnability/race) flagged for Increment 0 / founder**.
```
