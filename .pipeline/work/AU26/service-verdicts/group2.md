# AU26 pass A — group 2 verdicts

Services: `observability` · `org` · `policy` · `realtime` · `review`.
Method: requirements §2 (the rule) + §3 (bounded pass). Every path re-traced with `rg -a` on branch `pipeline/AU26` (base `origin/main` @ `75d85687`). Evidence is a call site, never prose.

---

## Verdict lines

| Service | Domain it owns | One named real core-side use | Verdict |
|---|---|---|---|
| `observability` | telemetry export (DomainEvent → adapter) | **none found** | **moves — dissolves** (depth trigger 1) |
| `org` | teams, team-membership groups, org routing edges | `packages/core-api/work/src/bet-state-machine.ts:195` writes `teams.activeBets` via org's `setActiveBets`; `:125`/`:170` gate the bet transition on team capacity | **stays, contains a part that moves** (depth trigger 3) |
| `policy` | attention/trust routing over Work items + Conversation threads | `packages/core-api/policy/src/policy-engine.ts:186` inserts a `verdict` message + `:199` resolves the thread on auto-resolve; `:213` emits `notification` on push | **stays, contains a part that moves** (depth trigger 3) |
| `realtime` | none — connection/topic transport | (transport only; the domain writes are its callers') | **moves — dissolves** (depth trigger 2) |
| `review` | the human review verdict and the grant it produces (`proposedCalls`/`tailoredGrants`/`operationOutcomes`) | `packages/core-api/src/routes/threads.ts:1695` — a human's `approve` verdict transitions the proposed call to `granted`, writing `tailoredGrants` and enqueuing a work intent | **stays, contains a part that moves** (depth trigger 3) |

---

## `observability` — moves (dissolves). Depth trigger 1.

No core-side use is findable. Traced whole surface:

- **Owns zero tables.** Its config lives in `server_config.observability`, defined by `settings` (`packages/core-api/settings/src/server-config.ts:48-55`) and reached only through an injected port (`packages/core-api/observability/src/config.ts:41-46`, `:57`, `:66`).
- **Issues zero DB queries.** All three `@hyperidle/db` imports are `import type` (`config.ts:1`, `runtime.ts:19`, `dispatcher.ts:26`); `rg -a "db\.(select|insert|update|delete|transaction)"` over non-test source returns nothing. `createDbTraceIdResolver(db)` literally does `void db;` (`dispatcher.ts:139-145`).
- **Gates nothing, enqueues nothing, emits nothing.** Its one runtime effect is `dispatcher.enqueue(...)` → adapter (`dispatcher.ts:305-412`), and the only non-noop adapter is `createConsoleObservabilityAdapter` (`console-adapter.ts`), i.e. `console.log`. Nothing in core consumes the output.
- **Its four routes have zero consumers.** Constructed once at `packages/core-api/src/app.ts:597`, mounted at `:604-613`. `rg -a "api/observability"` across `packages/` returns **no hits** — no `packages/web` fetch, no desktop, no eval. The only hits repo-wide are in `.pipeline/work/AU20/rearch/observability.md:48-51`.

Under §2 that is the disqualified argument set exactly: it's infrastructure, it's already there, core-api is the layer with the HTTP surface. None of those is a use.

**Not `agent-orchestration` either.** Three of the six event kinds it translates are pure core-domain — `task_state_changed` (`dispatcher.ts:364`), `bet_state_changed` (`:385`), `knowledge_updated` (`:401`). Relocating it would make orchestration subscribe to core-domain events, which is the opposite of AU21's boundary.

**Dissolving is the live third answer, and the seam already exists.** The `ObservabilityEvent` union it produces *already* lives in `@hyperidle/shared` (`packages/shared/src/observability/events.ts`), beside `EventBus` itself (`packages/shared/src/event-bus.ts:41`); `types.ts:1` imports it back. `summarizeToolArgs` was already relocated the same way (`packages/shared/src/redact.ts:101`). The read/write config pair is a two-line pass-through over `settings`' own port. Architecture decides the destination; the evidence supports dissolve (bus-adjacent translator → `@hyperidle/shared`, config pair → `settings`), not relocate.

**Sub-finding, for whoever executes it:** `TraceIdResolver.seed()` has **zero non-test callers** (`rg -a "\.seed\("` → only `dispatcher.integration.test.ts:230,327` and `trace-correlation.integration.test.ts:41`, plus an unrelated `scenario.seed` in `packages/eval/src/runner.ts:250`). So in production the cache is always empty, `resolve()` always returns `null` (`dispatcher.ts:141-143`), and every `traceId` is the fallback (`dispatcher.ts:315`). The whole resolver — and with it observability's last reason to hold a `HyperIdleDb` handle — is dead machinery kept alive by its own tests.

---

## `org` — stays, contains a part that moves. Depth trigger 3.

**Stays.** Domain: teams, the 1:1 team-members group, and the org routing graph. Core writes it for its own reasons and gates on it:

- `packages/core-api/work/src/bet-state-machine.ts:195`/`:203`/`:216` — activating or killing a bet writes `teams.activeBets` through org's `setActiveBets` (wired at `packages/core-api/src/routes/bets.ts:32`).
- `packages/core-api/work/src/bet-state-machine.ts:125`/`:170` — the same transition is **gated** on `teamCapacity.getByTeamId`.
- `packages/core-api/src/routes/teams-routes.ts:671` — `updateTeam(teamId, { phase })`, a human moving a team through its lifecycle.

That is a core table core writes for its own reasons plus a gate on a core operation. Closed.

### Part-level finding (pass B) — the team-level agent-config columns

**Not named in requirements §4.** `teams` carries three columns that are Item C's shape one level up:

- `packages/db/src/schema.ts:42` `defaultHarnessType`
- `packages/db/src/schema.ts:43` `defaultModelId`
- `packages/db/src/schema.ts:44` `defaultModelProvider`

Full trace of every non-test site:

- **Written** at team creation only — `packages/core-api/src/routes/teams-routes.ts:361-363`, from the onboarding form's `primaryHarness`. Accepted by `createTeam` (`packages/core-api/org/src/team-lookup.ts:216-218`, persisted at `:258-260`). `updateTeam`'s patch does not include them, so they are creation-immutable.
- **Read** in exactly one place — `packages/core-api/org/src/team-default-harness.ts:42-47`, called from `packages/core-api/org/src/scaffold-agents.ts:168`, to stamp harness/model onto a newly scaffolded **agent** user row.

No core operation reads them. No core table write depends on them. They are the §2 sentence verbatim: a human configures it and then hands it to an agent. Verdict: **part-level relocate**, same unit and same treatment as Item C's `users` columns — and it should be costed together with Item C, because both write the *same* `PrimaryHarnessConfig` shape and `scaffold-agents.ts:168` is the join point.

`persistScaffoldedAgents` itself is **not** a separate finding: it writes `users` rows through an injected `users` port, and its own domain — staffing a team — is org's. It follows org's verdict.

---

## `policy` — stays, contains a part that moves. Depth trigger 3.

**Stays.** Domain: attention/trust routing — deciding whether a Work item is pushed to a human, queued, or auto-resolved, and propagating lifecycle. Core-side effects, all core-domain:

- `packages/core-api/policy/src/policy-engine.ts:186` — on `auto_resolve`, inserts a `verdict` message into the item's conversation thread; `:196` resolves the review message; `:199` resolves the thread.
- `packages/core-api/policy/src/policy-engine.ts:213` — on `push`, emits a `notification` event.
- `packages/core-api/policy/src/policy-engine.ts:207` — on `queue`, appends to the Work item's `auditTrail` via `work.updateItemById`.
- `packages/core-api/policy/src/policy-engine.ts:39-50` — writes `propagationLog` on handler failure (its own table).

Closed.

### The `sessions` lead — two sites, two different answers

**1. `lifecycle-propagation.ts:288-293` — legitimate core read.** On `session_ended(outcome=completed)` it counts other *active* sessions on the task and, only when there are none, transitions the task `in_progress → review` (`:304`) and emits `propagation_applied` (`:311-320`). The read directly gates a core Work-state transition — a use under §2. Not a finding for AU26. (It is a direct cross-layer table read, i.e. an ownership/ACL question for the AU-track table-ownership axis, not a relocation.)

**2. `handoff-protocol.ts:120-124` — part-level finding.** Inside its own transaction, `core-api/policy` directly **writes the agent-run record**:

```
await tx.update(sessions).set({ state: "done", endedAt: now }).where(eq(sessions.id, sessionContext.sessionId));
```

Ending a session is a run-lifecycle mutation, not a core-domain write. Everything else in the same transaction is core's (task state `:135-142`, review thread `:157-166`, review item `:168-176`). The entry point is `POST /tasks/:id/handoff` (`packages/core-api/src/routes/tasks.ts:285`), wired via `packages/core-api/src/services/policy-bindings.ts:106`, and it is reached by an **agent tool** through `CoreApiPort.work.handoffTask` (`packages/core-api/src/services/core-api-port-composition.ts:449-450`). The same route also reads the `sessions` row directly at `packages/core-api/src/routes/tasks.ts:296-301` just to hand-build a `SessionContext` (`:307-326`) whose `ingestion` handle is a documented no-op (`:317-321`) and whose `traceId` is hard-coded `""` (`:325`).

Verdict on the part: **the session-ending write belongs on orchestration's side of the boundary**; policy's own core writes stay. Note the handoff already emits `session_handoff_completed` (`handoff-protocol.ts:356`) which `agent-orchestration` already consumes (`packages/agent-orchestration/run-orchestration/src/start-runtime.ts:321`) — the channel exists. Architecture designs the cut.

---

## `realtime` — moves (dissolves). Depth trigger 2. (Requirements §4 Item D.)

**It is leftover plumbing, not a service with a domain.** `WsConnectionHub` is a `Map<WsClient, Set<string>>` plus `addClient` / `removeClient` / `subscribe` / `unsubscribe` / `broadcast` / `clientCount` (`packages/core-api/realtime/src/ws-connection-hub.ts:55-128`). Zero tables owned. Zero event routing — AU21 Decision L4 already deleted the `BROADCAST_ROUTES` forwarder and its `start()`/`stop()` lifecycle (documented at `ws-connection-hub.ts:13-34`). What remains has no domain knowledge at all; its own file comment calls it "a dumb pub/sub socket transport" (`:7`).

**It is not a package boundary anyone consumes.** `rg -a "@hyperidle/realtime"` across non-test source yields exactly **two** real importers, both inside `packages/core-api/src`: `routes/ws.ts:1-2` and `server-factory.ts:65`. No Service package imports it. Its other three callers — `routes/threads.ts:104`, `services/work-state-push-gateway.ts:24`, `services/session-activity-gateway.ts:37` — each declare a local one-method structural interface (`{ broadcast(topic, data): void }`) precisely to avoid depending on it.

**It cannot move to `agent-orchestration`, with or without the session forwarding.** Its production topic space is:

| Topic | Pushed from | Domain |
|---|---|---|
| `thread:<id>` | `routes/threads.ts:1137`, `:1265`, `:1320`, `:1598`, `:1603`, `:1608` | conversation |
| `conversations` | `routes/threads.ts:760`, `:1315` | conversation |
| `work` | `services/work-state-push-gateway.ts:40`, `:51` | work |
| `session:<id>` | `services/session-activity-gateway.ts:51`, `:54`, `:57` (registered `server-factory.ts:1181`) | agent run |

Frontend subscribers confirm the same set minus one: `thread:<id>` (`packages/web/src/hooks/useThreadDetail.ts:228`, `useAssistantThread.ts:169`), `conversations` (`useConversationsThreads.ts:221`), `session:<id>` (`useSessionActivity.ts:230`). *No frontend subscriber for the `work` topic exists* — worth handing to whoever holds `work`'s verdict.

Three of the four topics are core-domain and are pushed at the exact core write that has the record in hand. So the hub stays on core's side of the wire either way.

### Verdict with, and without, the session-activity forwarding

**With it (today):** the hub multiplexes core-domain and agent-domain topics on one socket. Verdict: does not move to orchestration; **dissolves into `packages/core-api/src` as a transport primitive**, not a Service package.

**Without it (after Job 2 relocates session/harness streaming):** the same verdict, and the cut turns out to be unusually clean. Removing the `session:` topic removes:

- `realtime`'s **only** table import — `ws-connection-hub.ts:1` `sessions`, read at `:202-206` solely to authorize `session:<id>` (this is the answer to the §3 lead: it is topic authorization for the agent-run record, not a core read);
- `canSubscribeToTaskFreeSession` (`:167-184`) and the `AgentSessionSourceCorrelation` import (`:2`);
- **three of its four documented DI edges.** `deps.users` (`:162`) and `deps.org` (`:164`) are reachable *only* through `senderInTeam` (`:161`), which is called *only* from `canSubscribeToTaskFreeSession` (`:181`); `deps.work` (`:211`) is used *only* inside the `session:` branch. Only `deps.conversation` (`:152`) survives, and it is also the `thread:` branch's own check (`:218`).

So after Job 2, `@hyperidle/realtime` is a connection registry with no table, no lifecycle, no domain, and a single one-edge thread-participant check that is conversation-domain authz. It is not a Service. Architecture decides the destination (the hub is dependency-free; the residual authorizer is conversation's); this pass records only that it should not remain a Service package.

---

## `review` — stays, contains a part that moves. Depth trigger 3.

**Stays.** Domain: the human's review verdict and the grant that verdict produces. Owns `proposedCalls` / `tailoredGrants` / `operationOutcomes`, and `rg -a` confirms **no** other package touches those table objects in non-test code (only `packages/db/src/schema.ts`, `packages/db/src/index.ts`, and this Service; `packages/shared/src/tool.ts:155` and `packages/agent-execution/harness-registry/src/tool-registry.ts:17` are comments). Core-side uses:

- `packages/core-api/src/routes/threads.ts:1695` — a human approving a review message drives `transitionProposedCall({to:"granted"})`, writing the grant and enqueuing a work intent; `:1742` holds it on any non-approve.
- `packages/core-api/review/src/session-review-creator.ts:114` — creates the Work `review` item; `:104` merges the resolved human reviewers into the thread's participants; `:131` emits `item_created`, which is exactly what `policy`'s engine subscribes to (`policy-engine.ts:54`).

A human decision gating a write and an enqueue. Closed.

### The `sessions` lead — one site, and it is redundant

`packages/core-api/review/src/session-review-creator.ts:50-54` selects the `sessions` row by `event.sessionId` on `session_ended`. It uses exactly three fields from it: `session.taskId` (`:55`, `:58`, `:64`), `session.agentId` (`:78`, `:87`, `:91`) and `session.outcome` (`:112`).

**All three are already on the event.** `SessionEndedEvent` declares `agentId` (`packages/shared/src/events.ts:145`), `taskId` (`:146`) and `outcome` (`:153`). The sibling subscriber in the same file proves it — `livenessHandler` reads `event.taskId` and `event.agentId` straight off the event with the comment "SessionEndedEvent carries agentId and taskId directly — no DB lookup needed" (`session-review-creator.ts:137-141`).

Verdict on the part: **not a legitimate core read — a redundant one.** Deleting it removes `review`'s only `sessions` import (`:1`) with no behavior change and no relocation, which makes it the cheapest of the four `sessions` findings.

---

## What each service's `sessions` import turned out to be

| Service | Site | Answer |
|---|---|---|
| `policy` | `lifecycle-propagation.ts:291` | legitimate core read — gates the task `in_progress → review` transition at `:304` |
| `policy` | `handoff-protocol.ts:122` | **part-level finding** — a core-side *write* to the agent-run record (`state:"done"`, `endedAt`) |
| `realtime` | `ws-connection-hub.ts:204` | **part-level finding** — authorizes the `session:<id>` topic only; leaves with Job 2, taking realtime's last table import and 3 of its 4 DI edges |
| `review` | `session-review-creator.ts:52` | **part-level finding** — redundant; every field it reads is already on `SessionEndedEvent` |
