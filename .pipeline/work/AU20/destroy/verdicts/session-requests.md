# session-requests — destroyer verdict

## Should this service exist?

**KEEP AS the durable agent-work queue — but ~40% of the file is scar tissue from the two absorptions, and it dies.**

This service is the spine of "AI agents as first-class participants": every door that makes an agent do something (a thread message, a task dispatch, a routine tick, a knowledge flag, an explicit start) funnels into `enqueueWorkIntent`, and the runtime drains intents → session requests → running sessions. That is core value, verified end-to-end: 21 doors reach `enqueueWorkIntent` (UI routes, agent tools, the routine scheduler).

What does NOT deserve to exist inside it:

1. **The entire lifecycle-projection subsystem** (`agent_lifecycle_inbox` table + claim/lease/poison drain + 1s background poller + DI port). Six projectors are registered; **five are literal no-ops** (`observeOnly`). The sixth (`explicit_session_start`) is implemented — via `queueDeps` in `layers/agent-orchestration/src/services/durable-agent-queue.ts:121` — by **calling back into this same package's `transitionSessionRequest`**. A durable outbox whose only consumer is a same-package, same-DB, same-transaction UPDATE. Every terminal session pays 3 extra writes and a forever-poller for one conditional UPDATE that belongs inline in `finishRequestInTxInternal`.
2. **The trigger-resolution scar**: `admitClaimedRequestInternal` (service.ts:570) updates `trigger_resolution_history` — a table **nothing anywhere inserts into** (confirmed by `rg -a` across all four roots: only the schema, one migration, and this UPDATE exist). The UPDATE has matched zero rows since the absorbed trigger-resolution service was deleted. Dead write, dead table.
3. **Local type mirrors** of `@hyperidle/work-intent-port`'s `BakedWorkIntentRequest`/`BakedContextBundle`/`BakedContextKnowledgeItem` (~110 lines). `run-orchestration` — the same layer — imports the canonical ones from `@hyperidle/work-intent-port` directly (context.ts:12, runtime.ts:18). Two copies of a wire format is one drift away from a corrupted session payload.
4. **Dead query/create arms**: `findSessionRequest by:"idempotencyKey"` and `createSessionRequest kind:"direct"` have zero shipping-root callers.

## If written today, from scratch

Eleven callables, one const:

- `enqueueWorkIntent` — the single intake
- `listPendingIntentsByKind` — the coherence trigger's outstanding-work reader
- `createSessionRequest` — explicit-start insert only
- `findSessionRequest` — 6 query arms (drop `idempotencyKey`)
- `listSessionRequests` — source + running filters
- `claimSessionRequest` / `renewClaim` / `releaseClaim` — the lease triplet
- `transitionSessionRequest` — the state machine, explicit-start terminal projection done inline in the terminal transaction
- `drainIntents` — intents → requests
- `reapExpired` — terminal-row GC (intents + explicit starts only)
- `sessionRunRegistry` — the abort switch for running sessions

No inbox, no projector registry, no background lifecycle poller, no `DurableAgentQueueDeps`, no type mirrors, no trigger-history write.

## Kill summary

| Verdict | Count |
|---|---|
| DELETE | 10 |
| MERGE | 0 |
| SIMPLIFY | 9 |
| KEEP | 17 |

Surface: 24 exported-function rows + 11 types + 1 const → 13 distinct callables become 11; `service.ts` 1792 lines → roughly 1100; two DB tables dropped (`agent_lifecycle_inbox`, `trigger_resolution_history`); one background interval timer removed.

(KEEP count is inflated by the overload-row format: the 17 KEEPs are overload rows of just 8 surviving methods plus `ClaimOptions` and the registry.)

## Feature-level kills

**1. Lifecycle-projection inbox — kill the whole subsystem.**
Dies: `agent_lifecycle_inbox` table, `processLifecycleInternal`, `startLifecycleInternal`, `appendLifecycleFactInternal`, `listReapableLifecycleInternal`, `deleteLifecycleFactsInternal`, `lifecycleProjectors`, `observeOnly`, `projectExplicitStart`, exports `drainLifecycleProjections` + `startLifecycleProjectionDrain`, types `LifecycleProjectionDrainStop` + `AgentLifecycleFact` + `DurableAgentQueueDeps.lifecycleProjection`, boot wiring (`layers/agent-orchestration/src/boot.ts:352`), the self-calling port in `durable-agent-queue.ts` (`queueDeps` shrinks to `{ db, eventBus }` or disappears), `layers/core-api/src/__testing__/durable-agent-queue-test-deps.ts`, and the test files that exist only to exercise the drain (`agent-lifecycle-projectors.integration.test.ts`, `agent-lifecycle-projection.integration.test.ts`, the drain cases in `durable-queue-regressions.integration.test.ts`).
Replacement: in `finishRequestInTxInternal`, after the winner row update — `if (winner.sourceKind === "explicit_session_start") await projectStartInternal(tx, …)`. Same transaction, strictly better crash-safety than the inbox (no window between terminal commit and projection).
What breaks: nothing observable. The UI's `GET /api/sessions/starts/:startId` poll sees terminal state *sooner* (no 1s drain lag).

**2. `trigger_resolution_history` — drop the table, delete the UPDATE.**
Dies: the phantom UPDATE in `admitClaimedRequestInternal` (service.ts:570–573), the schema entry + `TriggerResolutionHistoryRow` types in `framework/db`, a drop migration.
What breaks: nothing — zero inserts exist, the table has been empty since the trigger-resolution absorption.

**3. Baked* local mirrors — delete, import canonical.**
Dies: `BakedWorkIntentRequest`, `BakedContextKnowledgeItem`, `BakedContextBundle` declarations in service.ts (~110 lines). Add `@hyperidle/work-intent-port` to package deps — precedent already set by `run-orchestration` in the same layer. No importer anywhere consumes these types *from* `@hyperidle/session-requests`.

**4. `createSessionRequest kind:"direct"` — delete the arm.**
Only caller in shipping roots: none. The intent drain inserts via `insertRequestInternal` internally. The one real caller is `tools/eval/src/provision-harness.ts:128` — development world. Hole: the eval must provision by enqueuing a baked intent through `enqueueWorkIntent` like production does, which also makes the eval exercise the real admission path instead of skipping it.

## Full method audit

Reach evidence: the code graph misses `claimSessionRequest`/`renewClaim`/`releaseClaim`/`drainIntents` (0 doors reported) because run-orchestration consumes them through structurally-typed `RuntimePorts` re-declared in `contracts.ts`, >4 hops from any door; `rg -a` confirms production callers in `runtime.ts`/`start-runtime.ts`, driven by the runtime poll loop. Tagged `SCHED:runtime-poll` below.

| # | Method | Reach | Verdict | Reason |
|---|---|---|---|---|
| 1 | `enqueueWorkIntent` | UI:POST /api/threads/:id/messages (+20 more doors incl. AGENT:send_message, SCHED:routine-tick) | KEEP | The single intake spine of all agent work; fold the one-line `insertIntentInternal` passthrough into the export body. |
| 2 | `listPendingIntentsByKind` | UI:GET /api/agent-orchestration/requests/pending-intents; EVENT:thread_message_appended | KEEP | Assistant-turn coherence trigger's only outstanding-work reader — agents replying to the latest message is core conversation correctness. |
| 3 | `createSessionRequest` (direct overload) | DEAD (shipping roots; tools/eval only = dev world) | DELETE | Zero production callers; the drain inserts internally; eval must use the real intake path. |
| 4 | `createSessionRequest` (explicitStart overload) | UI:POST /api/sessions/ → seam POST /api/agent-orchestration/intents/explicit-start | KEEP | The "start a session on this task" button — a real product door with UI polling feedback. |
| 5 | `createSessionRequest` (impl) | UI (as above) | SIMPLIFY | Collapse union + overloads to a single explicit-start insert once the direct arm dies. |
| 6 | `findSessionRequest` (by id) | SCHED:runtime-poll (runtime.ts:56, provisioner) | KEEP | Targeted-run lookup in the runtime's claim path. |
| 7 | `findSessionRequest` (by idempotencyKey) | TEST-ONLY | DELETE | Zero production callers — request idempotency lives inside `insertRequestInternal`; `run-orchestration/contracts.ts` doesn't even declare this arm. |
| 8 | `findSessionRequest` (by sessionId) | EVENT:session_handoff_completed (start-runtime.ts:400) ← UI:POST /api/tasks/:id/handoff | KEEP | Handoff correlates the ended session back to its request. |
| 9 | `findSessionRequest` (by terminationReason) | UI:PATCH /api/sessions/:id (via transition-run.ts:70,131, provisioner) | KEEP | The kill-switch read: was this session asked to stop. |
| 10 | `findSessionRequest` (by claimActive) | SCHED:runtime-poll (runtime.ts:35) | KEEP | Custody check before executing a claimed request — the lease is the queue's one concurrency guarantee. |
| 11 | `findSessionRequest` (by explicitStart) | UI:GET /api/sessions/starts/:startId (+ idempotent retry on POST /api/sessions/) | KEEP | The UI poll for "did my session start" — the product feedback loop of door #4. |
| 12 | `findSessionRequest` (by intentSource) | SCHED:runtime-poll (start-runtime.ts:104, runtime.ts:272) | KEEP | Correlates an admission failure back to the originating intent for the `agent_run_admission_failed` emit. |
| 13 | `findSessionRequest` (impl) | all of the above | SIMPLIFY | Drop the `idempotencyKey` arm from `FindQuery` and the switch. |
| 14 | `listSessionRequests` | UI:GET /api/agent-orchestration/sessions; SCHED:runtime-poll (resume running on boot) | KEEP | Session listing + crash-resume of running sessions; both filters production-used. |
| 15 | `claimSessionRequest` | SCHED:runtime-poll (start-runtime.ts:91 `{next}`, runtime.ts:242 `{id}`) | KEEP | The heart of the queue — CAS claim with lease; both selectors live. |
| 16 | `renewClaim` | SCHED:runtime-poll (runtime.ts:322) | KEEP | Lease heartbeat during provisioning; without it a slow start gets double-executed after 30s. |
| 17 | `releaseClaim` | SCHED:runtime-poll (runtime.ts:404) | KEEP | Requeue on transient provisioning failure — the retry half of the lease. |
| 18 | `transitionSessionRequest` (transaction:"existing" overload) | SCHED:runtime-poll (transition-run.ts:89,104) | KEEP | Terminal transition inside the caller's event-emitting transaction. |
| 19 | `transitionSessionRequest` (plain overload) | UI:PATCH /api/sessions/:id; UI:POST /api/agent-orchestration/runs/explicit-start/fail | KEEP | The state machine's public door: running/termination-requested/terminal/admitted. |
| 20 | `transitionSessionRequest` (impl) | all of the above | SIMPLIFY | Delete the dead `deps` param (`void deps` — nothing ever reads it, every caller threading it is cargo); delete the `target:"explicitStart"` requestId-terminal arm (only caller is the dying drain port — projection moves inline into `finishRequestInTxInternal`). |
| 21 | `drainIntents` | SCHED:runtime-poll (start-runtime.ts:312) | SIMPLIFY | Live and load-bearing (intents → requests), but signature shrinks to `(db, eventBus, options)` when `DurableAgentQueueDeps` dies; make `eventBus` required — production always wires it, optionality exists only for old test call sites. |
| 22 | `drainLifecycleProjections` | TEST-ONLY | DELETE | No production caller anywhere (`rg -a` confirmed: only its own tests + one core-api test). The sync twin of a poller that shouldn't exist either. |
| 23 | `startLifecycleProjectionDrain` | BOOTSTRAP (boot.ts:352) | DELETE | A forever-poller + durable inbox whose only real work is one same-package UPDATE routed through a DI port back into itself; replaced by an inline conditional UPDATE in `finishRequestInTxInternal`. |
| 24 | `reapExpired` | SCHED:TICK AGENT_LAYER_REAP_INTERVAL_MS (start-runtime.ts:331) | SIMPLIFY | Own-table terminal-row GC stays (unbounded queue growth on a laptop DB is real); the inbox-GC third of it dies with the inbox. |

## Types / DI ports

| Declaration | Verdict | Reason |
|---|---|---|
| `LifecycleProjectionDrainStop` | DELETE | Dies with `startLifecycleProjectionDrain`; no external importer. |
| `BakedWorkIntentRequest` | DELETE | Local mirror of `@hyperidle/work-intent-port`'s canonical type; nobody imports it from this package; same-layer precedent for importing the real one exists. |
| `BakedContextKnowledgeItem` | DELETE | Same mirror, same fix. |
| `BakedContextBundle` | DELETE | Same mirror, same fix. |
| `WorkIntentInput` | SIMPLIFY | Live (intake route contract) — but make `bakedRequest` required and delete the drain's unbaked-intent terminal-failure branch; every kind bakes at emit since AU21, the optionality guards a migration that finished. |
| `CreateSessionRequestInput` | SIMPLIFY | Drop the `direct` arm (row 3); the union collapses to the explicit-start shape. |
| `FindQuery` | SIMPLIFY | Drop the `idempotencyKey` arm (row 7). |
| `SessionRequestTransition` | SIMPLIFY | Drop the `target:"explicitStart"` requestId-terminal arm (drain-only); keep `transaction:"existing"` — transition-run uses it in production. |
| `ClaimOptions` | KEEP | The lease contract shared by claim/renew; three fields, all read. |
| `AgentLifecycleFact` | DELETE | Dies with the inbox; no production importer outside this package. |
| `DurableAgentQueueDeps` | DELETE | `lifecycleProjection` was its reason to exist and it's a self-call; what remains is `{ db, eventBus }` — pass them as parameters. `queueDeps()` and `durable-agent-queue.ts`'s port const die with it. |

## Holes this leaves

1. **`tools/eval/src/provision-harness.ts` breaks** — it provisions sessions via the deleted `createSessionRequest kind:"direct"`. Fix is to enqueue a baked intent via `enqueueWorkIntent`, which also makes the eval exercise the real admission path it currently bypasses. Until repointed, `tools/eval` does not compile.
2. **Two drop migrations needed** — `agent_lifecycle_inbox` and `trigger_resolution_history`. `trigger_resolution_history` has FK constraints to `users`/`agent_session_requests`; the drop must remove them.
3. **Tests die with the machinery** — `agent-lifecycle-projectors.integration.test.ts`, core-api's `agent-lifecycle-projection.integration.test.ts`, the drain/poison cases in `durable-queue-regressions.integration.test.ts`, `layers/core-api/src/__testing__/durable-agent-queue-test-deps.ts`. The surviving invariant (explicit-start row reaches terminal state when its request does) needs one new assertion against the inline projection.
4. **If `eventBus` becomes required on `drainIntents`**, every bare `queueDeps(db)`-style test call site must wire a bus. Deliberate: an admission failure that emits nowhere is a silent black hole.
5. **`agent_lifecycle_inbox` loses its incidental audit-trail role** — terminal facts for all six source kinds stop being recorded anywhere. Nothing reads them today (five no-op projectors, GC deletes the rows after 30 days); if someone later wants lifecycle history, the event bus + `agent_session_requests` terminal rows already carry it.
