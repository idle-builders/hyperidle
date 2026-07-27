# AU21 — Feasibility (re-derived 2026-07-26, post-AU20 merge PR #456)

Engineering tier: **production**. Every probe below was re-verified against the current tree (23 services,
48 DI edges, 22 EventBus edges — `plans/AU19/dependency-graph-data.json`, `generatedAt 2026-07-22`). The
paused doc's probes are superseded; where a finding survived AU20 unchanged it is re-confirmed against the
real current file, not carried on faith.

## Probe 0 (NEW, load-bearing) — the mechanical graph is BLIND to the biggest orchestration→core read set — GO-WITH-WARNING

**Question:** the fresh graph shows only **15** `agent-orchestration → core-api` DI edges, from exactly two
Services (`dispatch` 8, `tool-handlers` 7), and **zero** from `session-requests`/`run-orchestration`/`cost`/
`agent-selection`. Did AU20 delete session-requests' core-domain reads, or did it hide them?

**Finding — it hid them, they are all still live.** The durable-queue drain worker still lives in
`packages/agent-orchestration/session-requests/src/service.ts` and still reads core-api domain state in every
branch. `resolveIntentInputInternal` (≈`service.ts:709`, formerly `resolveAuthoritativeInput`) reads
`conversation.getMessageById`, `work.getTaskById`/`getBetById`/`getTaskDispatchAttemptById`,
`knowledge.findById`, `routine.getRoutineRunById`/`getRoutineById`, `review.findGrantedProposedCall`,
`teams.getTeamMembersByTeamId`, `users.getUserById`/`listUsersByTeam`/`getUserByIdScopedToTeam`,
`config.listConfiguration`, plus `requireRunnableActor` (`service.ts:700`) and `agentSelection.isAtCapacity`/
`selectAgent` in the `routine_run` branch. `failOrRelease` (`service.ts:960`) still writes
`routine.updateRoutineRunIfRunning` directly on terminal `routine_run` and still **emits nothing**.

The graph misses this because these reads are not declared in a `ports.ts`. `session-requests/src/` has **no
`ports.ts`** (only `index.ts`, `service.ts`, `session-run-registry.ts`). The deps are a single
`DurableAgentQueueDeps` interface *defined in* `session-requests/src/service.ts` but *composed in core-api*:
`packages/core-api/src/services/durable-agent-queue.ts` exports `queueDeps(db)` that wires every core-api
Service function into that bundle, and the drain is *driven from core-api* (`server-factory.ts` +
`services/run-orchestration-composition.ts`). `scripts/generate-dependency-graph.ts` scans `ports.ts` files,
so this composition-bundle pattern is invisible to it. **The same blindness recurs in the `cost` service**
(its `CostDeps` bundle wires orchestration cost logic into `users`/`teamMembers`/`bets` via `cost-bindings.ts`;
see Probe 6) — so the guard must catch the pattern generally, not just `session-requests`.

**Verdict: GO-WITH-WARNING.** The heart of Decision B is fully intact and unbuilt. (Consequence (i) is now
done: `scripts/scan-hidden-composition-edges.ts` enumerated all 37 edges from source — see `edge-disposition.md`.) Two consequences bind the
plan: (i) Increment 0 must enumerate reads from the **real source**, never the graph; (ii) the AC #5 rebaseline
and the AC #9 anti-regrowth guard must be taught to *see the composition-bundle pattern*, or the WP will
"pass" while the largest read set stays hidden.

## Probe 1 — Location-transparent transport over the literal core-api route stack — GO (runtime route-identity, not type-safety)

Unchanged and re-confirmed. `packages/core-api/src/app.ts:673` is still `export type AppType = Hono` — bare,
no per-route schema, so `hc<AppType>` gives **no** compile-time route typing. `hc` still takes an injectable
`fetch` (`packages/web/src/api/client.ts`), and Hono `app.request` (a `(Request)=>Promise<Response>`) drives
the full real route+middleware stack in-process across the codebase's integration tests. So the same client is
in-process on colocated topologies (`fetch = app.request`) and network on a split topology. Benefit is
**runtime route-identity** — an agent write traverses the exact route handler + middleware a human's UI action
does — provable by a per-method contract test, not by `tsc`. **GO.**

## Probe 2 — Seam home `@hyperidle/api-contract` — GO-WITH-CONSTRAINT

Unchanged. Every orchestration Service `package.json` still lists only `@hyperidle/db` + `@hyperidle/shared`
(+ drizzle/zod); importing `AppType` (a Layer package) is forbidden by Mechanism C and buys nothing (bare).
`@hyperidle/api-contract` is still zero-dep and is the sanctioned "narrow shared ports/contracts package."
`CoreApiPort` (hand-typed narrow write/read mirrors) lives there; fidelity to the real routes is a **tested**
obligation. **GO-WITH-CONSTRAINT.**

## Probe 3 — Decision B: resolve-at-emit + collapse the drain; agent self-recovers via MCP — GO-WITH-CHANGE

**The model holds, re-verified line-by-line, with one structural sharpening AU20 makes available.**

- All the drain-time core-domain reads deletes cleanly (Probe 0 enumerates them). The protected durable-queue
  tests assert **idempotency/dedup only** (own-row CAS), never "replay re-reads core state and rejects a stale
  request" — deleting the domain re-reads breaks no protected guarantee. Re-confirmed against
  `agent-session-requests.integration.test.ts` + `agent-work-intent-worker.routine-selection.integration.test.ts`.
- **Sharpening (AU20-enabled):** the drain-worker composition already lives in core-api and is fed only
  core-api functions. So the intent→request **resolution** is already, in practice, a core-api-driven read of
  core-api's own state — it is only *housed* in an orchestration package. The clean split is therefore not
  "delete the reads and re-invent recovery" but **relocate the resolution to emit-time inside core-api**
  (reading core state once, where it is legitimate — core-api reading its own domain) and **collapse the drain
  to dedup+dispatch of a fully-baked request**. This honors the founder's positive model ("core sets off the
  event including all that's needed") *and* the R3 ruling ("delete the drain-time re-validation") — the drain
  no longer re-resolves; the resolution is de-duplicated to one place, at emit, in core-api.
- **Pre-handoff failure channel still NEW (B1).** `failOrRelease` still emits nothing;
  `agent_run_admission_failed` does not exist in `packages/shared/src/events.ts`. Post-session channels DO
  exist and are richer than the paused doc knew: `run-orchestration → policy`/`review` on `session_ended`
  (`events.ts:86`), `agent_run_lifecycle_changed` (`events.ts:25`). Deleting the drain re-check without the
  new pre-handoff channel would reintroduce the AU15 permanent-routine-brick bug (its guard depends on
  `failOrRelease` finalizing the routine run). The new channel + core-api subscribers are required.
- **`taskDispatchAttempts` ownership — RESOLVED (was B2 open).** It is **work-owned** (core-api): the store
  `work.taskDispatchAttemptStore` lives in `@hyperidle/work` and is written by `work` (`task-state-machine.ts`,
  `bet-decomposition.ts`); the drain reads it via `deps.work.getTaskDispatchAttemptById`. Its
  `attempt.status !== "requested"` re-check (session_start + task_run branches) is therefore a drain-time
  re-read of core-owned state → subject to Decision B (resolve/validate at emit, delete the drain re-check).
- **Target-agent runnability + emit→deactivate→drain race — still an authority item, unchanged.** Preferred
  cover remains provision-time credential-context failure (a deactivated agent's session cannot provision a
  valid identity); founder confirms at the concept gate.

**Verdict: GO-WITH-CHANGE.** Orchestration's drain reads go to zero by relocating resolution to emit-time
core-api and collapsing the drain, PROVIDED the new `agent_run_admission_failed` channel + subscribers are
built. Everything else deletes/relocates cleanly.

## Probe 4 (NEW) — dispatch is the real bulk: a scheduler+routine+assistant+queue monolith — GO-WITH-COST

**Finding.** `packages/agent-orchestration/dispatch/src/service.ts` is 1660 lines and is simultaneously: the
**routine scheduler** (cron eval, `nextRunAt`, `insertRoutineRun`, `listActiveRoutines`, `findRunningRoutineRun`,
`sumRoutineRunCostSince` — reads+writes core-api's `routine`/`routineRuns`), the **builtin-routine engine**
(post-bet-retro, portfolio-retro, knowledge-promotion, knowledge-decay, practice-meeting — reads+writes core
`work`/`conversation`/`knowledge`), the **assistant-turn runner** (`insertMessage`/`getThreadById`/`getUserById`/
`readServerConfig`), and the **task queue drain** (`hasActiveSession`, `listTasks("accepted")`, `getTaskById`).
Its 8 core-api edges are individually load-bearing and deeply entangled. This is where the routine-runs-as-
sessions collapse (founder ruling #4) and the bulk of the read-disposition actually land.

**Verdict: GO-WITH-COST.** No technical blocker, but this is the single largest untangle in the WP and the main
reason the effort stays XL after AU20's surface reduction (§Effort in architecture.md).

## Probe 5 — practice-meeting deletion targets its NEW home — GO

Re-confirmed. `createPracticeMeeting`/`runPracticeMeetingTurn` now live in
`packages/core-api/knowledge/src/practice-meeting.ts` (relocated from `review` by AU20 Am9). `review/index.ts`
no longer exports it; the surviving references are: `dispatch-bindings.ts:60,186` (imports from
`../../knowledge/src/practice-meeting.js`, wires it under the misnamed `DispatchPorts.review.createPracticeMeeting`
key), `dispatch/service.ts:745` (`runPracticeMeetingRoutine`, a builtin routine), `dispatch/ports.ts:173`,
`tool-handlers/ports.ts`, `routes/knowledge.ts`, `routes/routines-routes.ts`, and tests. Founder ruling: delete
it from `knowledge` (its new home) + all these references + the builtin routine; build no replacement. **GO.**

## Probe 6 (re-traced 2026-07-26) — Decision D: there is NO cost mirror; the real gap is per-session cost — GO (frame corrected)

**Question:** is "delete the core-api cost mirror" even the right frame? A full trace of every cost column
against every read/write site (`rg -a` + a complete read of `cost-cap.ts` — grep unreliable on these
control-char files) says no.

**Finding — full column map:**
- `users.costActual` / `teamMembers.costActual` — written by the cost authority `cost-cap.ts` via
  `incrementUserCost`/`incrementTeamMembersCost` (`user-store.ts:178`, `team-lookup.ts:338`); **read by the cap
  gate itself** (`cost-cap.ts:145,164,242,264`) + `status.ts:70`/`teams-routes.ts:920`. **LIVE, cap-load-bearing.**
- `bets.costActualMinor` — written by `cost-cap.ts` via `incrementBetCost` (`work-service.ts:765`); read for
  display (`bets.ts`, `teams-routes.ts`). **LIVE, display-only** (bets have no cap).
- `routines.costActualMinor` — written by `run-orchestration/transition-run.ts:190` via `incrementRoutineCost`
  (`routine-service.ts:102`); read for display. **LIVE, display-only.**
- `tasks.costActual` — **no writer anywhere** (cost accrues to the bet via `task.betId`, never the task); read
  by `work-service.ts:365`/`bets.ts:541`/`WorkTask.tsx`. **DEAD VALUE** — always `0`.
- `@lore O2` (`cost-cap.ts:202,345`, `tasks.ts:117`): per-session cost columns were **deliberately stripped**
  from the sessions table; `tasks.ts:134` serves `cost: null`.

**Correction to both prior claims:** the reviewer's "`costActual` is dead" is wrong (the cap gate reads it);
the "core-api holds a **duplicate** of cost" premise is also wrong. `cost-cap.ts` (agent-orchestration) is the
*single* cost authority; each `costActual*` column is a distinct per-entity aggregate, the *sole* store for its
dimension, written into core-api's own tables via disciplined DI — **none mirrors another or a separate
orchestration truth.** There is nothing to "delete as a mirror."

**Also — a second graph-blindness instance:** `cost`'s `CostDeps` (users/org/work/settings, `cost/src/ports.ts:35`)
is wired into core-api via `cost-bindings.ts`, so the mechanical graph shows `cost` with zero outbound core-api
edges while it in fact reads+writes `users`/`teamMembers`/`bets`. Same pattern as `session-requests` (Probe 0).
(The earlier "zero core-api imports" note was surface-true but read/write-false — it reaches core-api tables
through the composed `CostDeps` bundle, not direct imports.)

**Verdict: GO — frame corrected.** No mirror deletion. The cap gate is untouched (founder). The genuine gap is
**per-session cost** (`@lore O2` stripped it; `tasks.ts` → `cost: null`) — a new capability served by
`AgentOrchestrationPort`, which narrows to per-session cost + session/run history + the Decision-E stream
gateway. Aggregate display columns stay as core-api entity attributes (no duplicate); migrating them for
ownership purity is a deferred concept-gate question, not AU21 scope.

## Probe 7 (NEW 2026-07-26) — Decision E: retire the generic realtime broadcaster; own the session stream in agent-execution — GO (conflation confirmed in code)

**Question:** is "realtime" really three conflated concerns, is the cost double-handling real, and is the
session buffer in the wrong Layer?

**Finding — all three confirmed by reading `packages/core-api/realtime/src/ws-broadcaster.ts`:**
- One `BROADCAST_ROUTES` table forwards ~16 event types across three concern-groups through one mechanism
  (`@lore AU20 Ab2` — "replaces the 16 imperative `eventBus.on()` blocks"): global `conversations`/`work`
  topics, per-`thread:<id>`, and per-`session:<id>` (`session_started`/`session_ended`/`tool_call_recorded`).
- **Cost double-handling is real, dead code:** `cost_cap_warning` is forwarded to the `work` topic
  (`ws-broadcaster.ts:59`) **and** handled statefully by `notifications` (`notifications/src/install.ts:1490`
  → persisted `notificationQueue`). Nothing consumes the forwarded copy as a cost signal — the notification
  path already owns it. (`artifact_created` at `:64` carries an explicit `@lore R6 W-3: no client subscribes to
  this yet` — the same forward-compatible-infra smell.)
- **The session buffer is in the wrong home:** `SessionActivityBuffer` lives in
  `packages/agent-orchestration/run-orchestration/src/session-activity-buffer.ts` and is read via a core-api
  route (`routes/sessions-routes.ts`). Under Decision E the buffer/stream belongs to `agent-execution` (where
  tokens/tool-calls originate); orchestration should gateway, not own.

**Verdict: GO.** Retire the broadcaster (do not slim it): remove the redundant cost-forward (trivial), give
discrete changes a minimal invalidation signal (do not rebuild the broadcaster), and build the session/harness
stream in `agent-execution` gatewayed by `agent-orchestration`, exposed via `AgentOrchestrationPort`. **Parked,
not probed:** whether the MCP tool-call *response* (live AI output as generated) should stream is explicitly
undecided and out of scope (architecture.md §16 R8).

## Not probed (mechanical, reused patterns)
- Extending `generate-dependency-graph.ts` with new edge classes — mechanical, EXCEPT the Probe-0 blindness
  fix, which is real new detection work (a probe, not a given).
- Moving a raw DI port to a seam call / deleting a dead capability — AU12–AU20 did these dozens of times.
