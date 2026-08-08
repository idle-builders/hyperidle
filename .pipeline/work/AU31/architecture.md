# AU31 — Architecture

Spec of record: `.pipeline/work/AU31/plan.md`. Requirements: `requirements.md` (PASSED critique;
the five non-blocking defects D1–D5 are absorbed below at the sites marked **[D1]**…**[D5]**).
Feasibility: `feasibility.md` (probes P1–P12, cited as **[P#]**). Tier: **production**. Every
`file:line` re-traced on the live tree at base `bbe82e9a`. This is the attempt-4 revision
(adjudication 1, evaluation count reset). Attempt 2 closed round-1's B1–B3 (round 2 re-executed
and confirmed all three); attempt 3 closed round-2's **B4** by restating R2 from "any
module-scope reference" to **escape through the export surface** and absorbed round-2's N1–N5 at
the sites marked **[N1]**…**[N5]**; this revision closes round-3's **B5** under the adjudicated
strategy: R2's coverage is **derived from an enumeration of TypeScript's export-surface grammar**
(§7.2's tables, member-by-member) instead of a curated attack list. The re-executed model
([P12], runs 1–5) catches every enumerated "caught" member — including the export surface's own
direct spellings round 3 proved missing (named export of the binding, destructured exports,
live-binding assignment, module-scope mutation) and the two-line respelling of the founding case
that refuted round 3's limit statement — while the three planned-legal end-state sites stay
clean, the founding target `core-api/src/index.ts:15` still flags, and the declared residuals
are themselves executed (run 5), so §7.3/§13.1's limit statement is restated from what the runs
proved. Round-3's **N6** closes in the catching direction (getter bodies are data members, §7.2
F8), **N7** closes by catching `export =` outright (E6), and the runtime-object-graph note
(round-3 F2) lands in F9's clause for the rule's `why`. D1–D5 remain
absorbed at §11, §13.8, §7.2 **[D3]**, §3.1 **[D4]**, and §4 respectively.

This plan creates no outcome beyond the plan's seven ACs. Where it supersedes a prior in-code
decision, the supersession is listed in §13 and rides the mandatory founder gate (`plan.md:25`).

---

## 1. The end state, in one paragraph

Core-api converses with the agent layers **only** through agent-orchestration's own HTTP app,
dialled over the existing `AgentOrchestrationPort` seam — the mechanism `decided-rules.json`
already rules **allowed** with three live instances (`layer → agent-orchestration [api]`) [P2].
Results and lifecycle flow back the way they already do: bus events core subscribes to
(`service → EventBus [event]`, allowed) and agent tool calls through core's API
(`layer → core-api [api]`, allowed, 103 instances) — AU31 changes nothing on the return path.
The composition code that today lives inside `layers/core-api/src` moves behind the layer face
that owns the domain it wires. `agent-execution` grows a genuine face of its own; the MCP router
is built, mounted-out, and dialled by `harness-registry` — the only actor with an allowed MCP row
[P2]. The applications compose exactly three faces plus framework packages, and `desktop` owns its
own composition root. Zero exceptions, no transitional state: every mechanism below is the end
state.

**Hard constraints, restated unsoftened** (`plan.md:29-36`, `requirements.md:194-203`): zero
exceptions — no allowlist, no stateless-provider carve-out, no named-method exemption; the end
state is the end state — no transitional facade, no temporary cross-layer import, no "phase 1"; a
layer's manifest names no other layer or another layer's service; composition roots reach a
layer's public face only, never a service, never another application; no production export that
only tests consume; the baseline is shrink-only — clearing a group's last site deletes the entry
and that rule is at error from the same commit, with no separate or deferred promotion step; every
cleared entry is deleted, never re-tagged; if clearing empties `governance/baseline.json`, the
file and the `--adopt` escape hatch are deleted in the same commit and reintroducing either under
any name fails the build.

---

## 2. Per-service verdicts — six services, no blanket answer

The plan names a single blanket answer as the failure mode (`plan.md:27`). Each verdict below
states the mechanism, the evidence, and the rejected alternative.

### 2.1 `session-requests` — **API for the conversation; relocate the wiring**

Two distinct things hide under the 14 import files, and they get different verdicts:

**(a) The conversation — core as the channel's client** (`routes/bets.ts:11`, `tasks.ts:3`,
`threads.ts:40`, `knowledge.ts:47`, `sessions-routes.ts:3`, `app.ts:11`, reactors
`work-session-started-reactions.ts:49`, `agent-run-admission-reactions.ts:41`,
`assistant-turn-coherence-trigger.ts:50`, `routine-scheduler-bindings.ts:40`,
`policy-bindings.ts:39`, review wiring `service-bootstrap.ts:470`): **API.** The exact cross-layer
surface requirements §2.5 settled — submit a work intent, create an explicit session start,
request termination/supersede, read a request's status — becomes operations on
agent-orchestration's own app, called through the `AgentOrchestrationPort` seam (§3). The emit
stays the durable intake write (requirements §2.4): the seam op's handler runs
`enqueueWorkIntent`/`createSessionRequest` inside orchestration's own transaction, so the
durability the queue provides today is byte-identical — only the doorway changes.
**[D1]** The status-read op family covers all three read shapes in production today: the
idempotency-gate probe (`sessions-routes.ts:146-163` — a real "use", it gates a 409), the status
poll (`sessions-routes.ts:227`), and `listPendingIntentsByKind`
(`assistant-turn-coherence-trigger.ts:50,:62`). A port sized to single-request status reads is
wrong by construction.
`sessionRunRegistry` (`policy-bindings.ts:39`) never crosses: the in-process abort registry is
meaningless outside the layer that runs sessions (requirements §2.3.4), so `abort` is an
*implementation detail of the termination op*, executed orchestration-side inside the handler.

**Why not the bus:** an `EventBus` emit is not durable and returns nothing; the durable-intent
pattern is settled project law, and two call sites need the created intent back synchronously
(`knowledge.ts:955-967` emits an event carrying `intent.id`; `sessions-routes.ts` projects the
start). **Why not relocate:** rejected with four grounds in requirements §2.3; ground 2
(relocation reopens AU21 Decision L's zero-read end state) is decisive alone.

**(b) The wiring — orchestration's own runtime composed from inside core**
(`run-orchestration-composition.ts:32`, `durable-agent-queue.ts:83`, `service-bootstrap.ts:37`'s
`startLifecycleProjectionDrain`): **relocate.** Under AU26's wiring rule (a unit touched only at
boot is judged by the domain it wires), this is agent-orchestration wiring — claim, drain, lease,
lifecycle projection are exercised inside the agent layer's run loop
(`run-orchestration-composition.ts:234-246`). It moves behind `bootAgentOrchestration` (§5),
where the same imports become in-layer and legal. Nothing about the wiring is a conversation.

**Table note [D2]:** `governance/table-owners.json` assigns **all five** tables
(`agentWorkIntents`, `agentSessionRequests`, `explicitSessionStarts`, `agentLifecycleInbox`,
`triggerResolutionHistory`) to `session-requests` — requirements §2.1's "owns three, additionally
writes two" understates it; downstream phases should read all five as owned.

### 2.2 `agent-run-config` — **API**

The 8 files split into admin conversation and drain wiring:

- **Admin routes stay core-hosted, and this is the §8.7 finding, closed with evidence:** every
  write route gates on `users` — a core table — before persisting (`agents.ts:281,:385,:455`,
  `assistant.ts:479`, `teams-routes.ts:422,:431`, `users.ts:49`, `org.ts:306`), and the service's
  own barrel records that hosting rationale (`agent-run-config/src/index.ts` — "§D-A rule 3:
  those handlers gate on `users`, so they have exactly one legal host"). Moving them to
  orchestration's app would make orchestration read core state — the Decision L closure. **No
  route moves.** What changes is the persistence spelling: the reads
  (`agent-profile.ts:92`, `agents.ts:186,361,392,430,463`, `assistant.ts:340,483`,
  `teams-routes.ts:680`, `routine-scheduler-bindings.ts:61`) and writes become
  `AgentOrchestrationPort.runConfig` operations — `read(agentId)`, `readBatch(agentIds)`,
  `write(agentId, patch)` — backed by routes on orchestration's app. The batched read shape
  already exists (`readAgentRunConfigs`), so the agents/teams list pages stay one seam call, not N.
- **The drain read** (`run-orchestration-composition.ts:3,:173` — admission's live
  `readAgentRunConfig`) **relocates** with the composition (§5): it becomes what AU26 G1 always
  said it was, an in-layer read of orchestration's own table.
- **The two DI wires dissolve with the same change:** `org.ts:306` injects `writeAgentRunConfig`
  into `persistScaffoldedAgents` — the injected value becomes the port op (same file, same call
  site: W2 and W7 are one change). `create-server.ts:510` wires `readAgentRunConfigs` into
  `settings`' boot backfill — that becomes a seam read too, which imposes one **boot-ordering
  constraint**: the backfill call moves after in-process transport registration (today
  `create-server.ts:502` runs before `:834`). The backfill is a display-only boot projection
  (its own `@lore`, `create-server.ts:495-501`); deferring it past app construction changes no
  behavior a request can observe.

**Why not relocate the service or the routes:** the service is already in the right layer (AU26
G1); the routes are pinned by their `users` gate. **Why not bake:** AU26/AU27 deliberately moved
run-config consumption to live-at-drain ("one turn fresher", `create-server.ts:131-137`); baking
would reverse a settled decision for no AC.

### 2.3 `run-orchestration` — **API for the lifecycle verbs; relocate the composition and the tooling entry**

- **Lifecycle verbs → API.** `requestRunStopForTasks` (`bets.ts:10,:688` — bet-kill cascade),
  `endRunForHandoff` (`policy-bindings.ts:38,:105`), `createBareRun` (`sessions-routes.ts:2,:263`)
  become `AgentOrchestrationPort` write operations backed by orchestration-app routes (the layer
  already hosts its own session transition service — `agent-orchestration/src/services/
  run-transition.ts` — so the handlers compose in-layer machinery that exists). **This supersedes
  AU26 H1/H2's "a plain downward call, NOT an `AgentOrchestrationPort` method (that door stays
  read-only)"** (`policy-bindings.ts:100-105`, `bets.ts:686-688`): the downward-call spelling is
  now the forbidden crossing, and the port becomes core's one door in both read and write —
  recorded in §13 for the founder gate.
- **Composition → relocate** (`run-orchestration-composition.ts:21`, `session.ts:15`): §5.
- **The tooling entry**: `@hyperidle/core-api/session` re-exports `runSession` + harness types for
  `tools/eval` only [P5]. The entry is deleted from core-api's face; `runSession`'s production
  home moves with the composition into agent-orchestration, and eval (a tooling-role composition
  root) repoints to the orchestration face. No production export survives that only tests consume
  — eval's provisioning entry is also the harness lane's, a production-facing face export with a
  tooling consumer, which is the permitted shape.

### 2.4 `harness-registry` — **relocate behind faces; no core ↔ execution conversation remains**

The 4 core-api files split three ways, and none becomes an API — `layer → agent-execution [api]`
is ruled **forbidden** [P2], so the execution relationship must ride the composition contract:

- `app.ts:8` (type-only `AdapterPool`/`McpToolBridge`/`SandboxAdapter`): **retype and delete.**
  [P4] proved `mcpBridgeRegistry`/`mounter`/`workspaceAdapter`/`sandboxBasePath` on `AppOptions`
  are forward-only threading for a presence flag — they are deleted and
  `registerCoreDomainServices`/`registerAgentLayerServices` take `canProvision: boolean` from the
  application (`service-bootstrap.ts:602` already prefers it). `AppOptions.adapterPool` has real
  consumers (`app.ts:376,378,404,429,440,444`) and is retyped to the `@hyperidle/shared`
  capability-reader family the routes already use (`routes/workers.ts:8`); if `/harnesses`'
  redetect needs a wider probe interface, it is declared in `@hyperidle/shared/harness`, never
  imported from the service (build-time check per P4).
- `run-orchestration-composition.ts:10` (`createHarnessAdapter`, `AdapterPool`,
  `createReturnEnforcement`, `provisionHarnessEnvironment`) and `session.ts:14`: these do **not**
  simply relocate with the composition — agent-orchestration importing `harness-registry` would be
  the same `layer → service (other layer)` crossing one directory over. They dissolve into
  **agent-execution's new face** (§6): the enforcement registry, adapter construction (local and
  remote/WS), and harness-environment provisioning become face-owned; orchestration receives them
  as opaque, shared-typed runtime adapters supplied by the application through
  `bootAgentOrchestration`'s options — the exact shape face clause 3 defines,
  `AgentOrchestrationBootOptions.adapterPool` already models (`agent-orchestration/src/boot.ts:77`),
  and §4 locks and proves against the live census [P11].
- `tool-provider-bindings.ts:20-21` (`buildToolRegistry`, `returnStatusTool`): resolved in §2.5 —
  the dispatch itself leaves `harness-registry` for `tool-handlers` (it is shared-typed
  composition with zero execution content), and `returnStatusTool` plus the enforcement registry
  ride the execution adapters bundle as opaque shared-typed values. No orchestration file imports
  `@hyperidle/harness-registry` or its `/mcp` subpath afterwards.
- `layers/core-ui/package.json`'s production row: **manifest respelling** to `devDependencies` —
  [P6] proved only `__scripts__` development files import it. One-line diff, clears 1 manifest
  site.

### 2.5 `tool-handlers` and the tool stack — the wrapper file dies; the dispatch moves to the definitions; API for the one core-owned port

`tool-provider-bindings.ts` is **deleted, not relocated**. The first draft's "moves in-layer"
would re-create two cleared DI groups at new sites — probe C1 [P11] shows the framework-consumer
wire failing live at exactly the relocated spelling, and the shrink-only generator hard-fails a
cleared group's reappearance (`governance/README.md:79`). Each of the file's wires gets its own
mechanism:

- **The dispatch relocates from `harness-registry` into `tool-handlers`.** `buildToolRegistry`
  (`harness-registry/src/tool-registry.ts:62`) imports only `@hyperidle/shared`
  (`tool-registry.ts:25-38`) and holds zero execution content — it is the role-filter +
  zod-validate + workflow-route closure over shared types. Nothing inside `harness-registry`
  calls it: the MCP bridge *receives* a built registry as a value (`mcp-bridge.ts:60,:122`), and
  its only production caller is the dying core wrapper (grep-verified). Moved into
  `@hyperidle/tool-handlers` — the orchestration service that owns the definitions it
  dispatches — the wire `buildToolRegistry(allToolDefinitions, …)` has both ends in
  agent-orchestration: **legal by clause 6's own text (`governance-model.ts:282-288`), not by
  invisibility**; probe C2 [P11] confirms the census reports nothing for the end-state spelling.
  The `TDb = unknown` erasure that justified the execution-side placement (the file's own AU19
  §7.5 C1 @lore) is vestigial once the owning layer can name `HyperIdleDb`. `harness-registry`'s
  `export { buildToolRegistry }` row (`index.ts:30`) is deleted. The behavioral suites split by
  subject **[N3]**: the dispatch-mechanics suites (role filter, zod validation, workflow routing)
  move with the file into `tool-handlers`; `harness-registry`'s
  `src/__tests__/return-status-tool.test.ts` — which asserts `returnStatusTool`'s wiring
  *through* `buildToolRegistry` (`:211-225`), spanning both post-move homes — decomposes: the
  tool's own behavior assertions stay in `harness-registry` exercising the tool directly, and
  the through-the-registry wiring assertion re-lands in the §10 service-lane composed-app
  coverage, where the end state genuinely wires the moved dispatch to the bundle's tools. No
  development-world cross-layer import is left behind and no wiring assertion is dropped.
- **The role filter: the core wrapper `toolsForRole` is replaced by tool-handlers' own
  `buildToolDefinitions(ports, { role })`** (`tool-definitions.ts:1617-1649` — the AU20 Am10
  entry that already collapses build + role filter, and already calls the shared helper only with
  a list local to the function that built it). The forbidden shape — a `@hyperidle/shared`
  function receiving a cross-module-imported layer list — is fatal at any site, old or new
  (probe C1), so the end state cannot silently regress into it.
- **The workflow port becomes API.** `tool-provider-bindings.ts:22`'s import of
  `@hyperidle/review`'s `recordProposedCall`/`transitionProposedCall` would be an
  orchestration → core-api service import after the move, so it becomes `CoreApiPort`'s three
  workflow operations (capture / consume-grant / record-outcome), backed by core-hosted routes on
  `review`'s surface; the moved dispatch's injected `ProposedCallWorkflowPort` is implemented
  over the `CoreApiPort` client. Same seam, opposite door, already-allowed row
  (`layer → core-api [api]`) — agent-caused writes, exactly what that door exists for.
- **`returnStatusTool` and the return-enforcement registry are execution content and ride the
  execution adapters bundle (§6).** The provisioner port already types the factory opaque —
  "opaque `RegisteredTool`, never inspected here" (`provisioner.ts:291-292`) — and already feeds
  it the same bundle's enforcement registry (`provisioner.ts:1209`). Post-state both arrive from
  `bootAgentExecution`'s bundle under the §4 handoff; orchestration composes them into
  `extraTools`. No orchestration file imports `@hyperidle/harness-registry` or
  `@hyperidle/harness-registry/mcp`.
- `tool-handlers-bindings.ts:31-32` moves in-layer as before (§5.3) — composition of an
  orchestration service; the tool implementations already reach core exclusively through the
  `CoreApiPort` seam (`tool-handlers-bindings.ts:49-52`), so the move changes no conversation.

Net effect on AC #5: both remaining DI baseline sites in this file — `framework → layer [di]` and
`service → layer (other) [di]` site 2 — dissolve **in principle, not by hiding**: after this, no
framework factory receives a cross-module layer list and no execution factory receives an
orchestration value anywhere in the production tree; execution receives only finished,
shared-typed values across the boot/adapter contract.

### 2.6 `filesystems` — **API**

One production site: `routes/filesystems.ts:34` (`getFilesystem`, `saveInjection`) inside the one
injection route whose team-consistency gate reads `users` + `team_members` and therefore stays
core-hosted (the file's own header records the AU26 ruling, `routes/filesystems.ts:1-33`). The
persist becomes a seam op: orchestration's app (which already hosts every other `/api/filesystems`
route — `agent-orchestration/src/app.ts:66-69`) gains the injection-persist operation, doing its
own existence check (404 through the seam replaces the local `getFilesystem` probe). The gate
stays exactly where it is; only the downward import dies. The seam-backed persist route is
reachable by any authenticated caller like every other mounted route — that is a consistency
gate's placement, not a security boundary (ETHOS: no preemptive wall), stated in §9.

### 2.7 Cross-cutting singles

- **`SessionActivityBuffer`** (`agent-orchestration/src/boot.ts:29` — the tree's single
  `layer → layer (other) [import]`): **relocate into `layers/agent-orchestration/src/`.** [P8]
  proved zero execution coupling — it is a shared-typed bus fold serving orchestration's own read
  surface. This supersedes AU21 Decision E's placement rationale ("tokens originate in the
  execution layer") with the governance model's: the buffer is judged by the domain it serves,
  and its only consumers are orchestration's boot and routes. Deletes the import **and**
  `layers/agent-orchestration/package.json`'s `@hyperidle/agent-execution` row (grep-verified
  sole production site). Application-supplied construction was rejected: handing a pure bus-fold
  across a face adds a wire to avoid a one-directory move.
- **`RemoteWorkerClient`** (`applications/desktop/src/main.ts:20,:720` — app→app site #2):
  **relocate into `agent-execution`.** [P9] — the class self-describes as agent-execution content,
  depends only on `@hyperidle/shared`, and holds a `HarnessAdapter`. It becomes a face export
  declared in the layer's own `src/`; `applications/remote-worker` thins to a process entry
  composing that face; desktop imports the face. Desktop's dangling `devDependencies` rows on
  `remote-server`/`remote-worker` are reconciled in the same change (critique N1).
- **The writeback wire**: `create-server.ts:545-562` injects `@hyperidle/knowledge` functions into
  orchestration's writeback processor
  (`agent-orchestration/run-orchestration/src/writeback-processor.ts`) — a cross-layer wire an
  application cannot legalize by hosting [P2b]. Verdict: **API** — the processor's knowledge port
  becomes `CoreApiPort` operations (create / update-with-version-result / record-conflict). An
  agent-caused capture landing through core's API door is AU21's own design for agent writes; the
  version-conflict discriminated result crosses as the op's response shape.

---

## 3. The seam, extended — contract decisions (locked)

The port surface is the load-bearing public contract of this WP. Locked here; spelling of route
paths and zod schemas is the builder's.

1. **One door, both directions.** `AgentOrchestrationPort` (types in `@hyperidle/api-contract`,
   reach `["layer"]`) gains a write side; `CoreApiPort` gains the proposed-call workflow and
   knowledge-writeback ops. Both keep their existing transport duality (in-process `app.fetch` /
   network) and registration points at the application (`create-server.ts:834,:842` pattern).
2. **`AgentOrchestrationPort` operation families** (names indicative, shapes locked by the
   call-site inventory):
   - `intents.submit(input)` → the durable enqueue; input = today's `enqueueWorkIntent` payload
     (kind, sourceKind, sourceId, requestedBy, idempotencyKey, bakedRequest); returns the created
     intent row (id + idempotencyKey — `knowledge.ts:955` needs it).
   - `intents.createExplicitStart(input)` → the **atomic pair** op: creates the explicit start and
     records the baked `session_start` intent in one orchestration-side transaction, preserving
     the atomicity `sessions-routes.ts:167-201` has today [P3]. Core resolves the baked request
     from its own domain *before* the call and passes it in.
   - `intents.transition(...)` / `runs.requestTermination(...)` / `runs.stopForTasks(taskIds)` /
     `runs.endForHandoff(...)` / `runs.createBareRun(...)` → the request-about-request family
     (`agent-run-admission-reactions.ts:41`'s `transitionSessionRequest`, `policy-bindings.ts`'s
     abort+`endRunForHandoff`, `bets.ts`'s stop, `sessions-routes.ts`'s bare run). In-process
     registry aborts happen inside the handlers.
   - `requests.find(query)` — the full `findSessionRequest` query family including the
     idempotency probe and the by-intent-source read (`app.ts:52-55`), and
     `requests.listPendingIntentsByKind(kind)` **[D1]**.
   - `runConfig.read / readBatch / write` (§2.2).
   - `filesystems.persistInjection(...)` (§2.6).
3. **Provisioning-owner stamping.** `resolveProvisioningOwnerUserId`
   (`create-server.ts:201-213`) is deleted from the application. Core's port composition stamps
   `provisioningOwnerUserId` (its own `users` read — oldest-human rule unchanged) onto every
   submitted baked request in **one place, port-side**; orchestration's spawn passes it to its own
   `listHeldConnectionsForProvisioning` — connections stay a live-at-spawn read (AU26 E3
   preserved), only the near-immutable owner id rides the request. Edge named: a request emitted
   before onboarding and drained after resolves no owner and provisions no connections — identical
   observable outcome to today's empty-rows case.
4. **Auth + attribution.** Seam routes mount behind the application-applied auth stack like every
   orchestration route; the port injects the internal `X-API-Key` at call time (existing
   `withApiKeyHeader`, `agent-orchestration-port-composition.ts:70-86`). Actor attribution stays
   in the payload (`requestedBy`), as at every site today.
5. **Errors.** Non-2xx throws the seam's uniform method-attributed error (existing
   `throwSeamError` shape). Handlers return the same domain result codes the direct functions
   return today (`accepted | idempotent | conflict | terminal` etc.) as response bodies, so no
   call site's branching semantics change.

## 3.1 The two relinquished atomic couplings — decided, not discovered [P3]

The audit found exactly two cross-boundary pairs. For both, the mechanism **relinquishes**
cross-layer atomicity, and the window is named — silently downgrading was ruled out by
requirements §2.4:

- **`routes/knowledge.ts:934`** — flag transition + `knowledge_action` intent. End state: the
  flag's transaction commits, then the route calls `intents.submit`. **Window:** process death or
  seam failure between commit and submit leaves a flagged item with no queued review action. The
  route then returns 5xx, so the caller sees the failure; a retry re-runs the idempotent flag
  path and re-submits under the same `knowledge:${id}:review:${editId}` key. No reconciler is
  built — the failure is visible, retryable, and bounded to one flag (tier-proportionate; a
  sweeper would be an un-asked-for mechanism).
- **`routes/threads.ts:1463`** — message insert + `assistant_turn` intent. End state: the message
  transaction commits, then `intents.submit`. **Window:** a committed message with no turn
  intent; the route returns 5xx, the user re-sends, and the B‴ coherence trigger
  (`assistant-turn-coherence-trigger.ts`) re-bakes on the next thread append anyway. Named,
  accepted. **[D4]** One nuance belongs on the record: a re-send inserts a **second visible
  message** unless the client reuses its `clientKey` — the dedupe path exists
  (`threads.ts:1071-1081`) — so the window's worst observable outcome is one duplicated message,
  never a lost one.
- Everything else either has no coupling or keeps it whole (the explicit-start pair moves inside
  one orchestration op). Two write sites carry a `writeAgentRunConfig(tx,…)` coupling with a user
  insert (`agents.ts:281`, `teams-routes.ts:422`): relinquished the same way — user row commits,
  then `runConfig.write`; on failure the agent exists with `DEFAULT_AGENT_RUN_CONFIG` semantics
  (the read path already defaults, `agent-run-config/src/index.ts`) and the admin edit path
  repairs it. Named, accepted.

---

## 4. The composition handoff — the spelling law, the census's actual state, and its enforced home

The whole of §5/§6 rests on capabilities produced by one face being passed by the application into
another face: the execution adapter bundle into `bootAgentOrchestration` (§2.4, §6);
`resolveModel`, `upgradeTokenStore`, middleware and registrars out of `bootCoreApi` (§5.2). The
first draft asserted this was "the face's declared composition contract (clause 3)" with "the
census's DI rule unchanged" — an assertion the enforced code contradicts:
`governance-model.ts:265-290` has no face-content carve-out, and `layer → layer (other) [di]` is
forbidden **generatively** — clause 6 (`governance-model.ts:266-290`) over an empty baseline;
`decided-rules.json` carries no literal row for the group **[N5]**. This section replaces the assertion with what the census
actually does — proven by executing it, not arguing it — and gives the surviving reading an
enforced home.

**What the census actually reports — executed [P11]** (probe sources and verbatim outputs:
`probes/p11-composition-spelling/`; each probe overlaid on the live tree at a real production
path, `scripts/governance-lint.ts --errors-only` run, output and exit code recorded):

| Spelling | Census result |
|---|---|
| A — inline: `bootAgentOrchestration({ …, adapterPool: createLocalAdapterPool() })` in an application file | **FAIL, exit 1**: `ERROR [crossing-di] … layer → layer (other) [di] production — agent-orchestration receives the result of `createLocalAdapterPool` from agent-execution` |
| B — local binding: `const pool = createLocalAdapterPool(); bootAgentOrchestration({ …, adapterPool: pool })`, and the `exec.adapters` property-access form | **PASS, exit 0** — zero findings for the probe file, warnings included |

**Which state holds, stated plainly.** The mediated local-binding handoff is not "ruled allowed"
by any clause — it is **outside the DI predicate by that predicate's own design**. The detector
defines the crossing as "between the package whose factory is CALLED and the package the injected
value came from" (`crossing-detectors.ts:931-934`), where "came from" is **import provenance**: an
argument records a crossing only when its identifier, or its inline callee, was imported from a
foreign package (`crossing-detectors.ts:949-999`). A value produced at runtime by a face boot and
held in a local carries no foreign import provenance, so nothing is recorded. That is deliberate
provenance semantics, not an accident — the same design already suppresses imported literal
constants as "an ordinary import, not an injected port" (`crossing-detectors.ts:294-298`).

**The spelling law (locked; self-enforcing on its identifier-spelled visible side — the one
namespace respelling it cannot see is named in rule 2, not claimed away).**

1. A composition root binds each face boot result to a local binding before any part of it enters
   another face's options.
2. No identifier imported from a layer or service package — and no inline call of one — may appear
   in another layer's boot argument list. Probe A shows this side needs no new rule: every DI
   group the spelling could hit is forbidden with zero baseline headroom, so the forbidden
   spelling fails the build today, mid-build, with both packages named. **[N2]** One respelling
   on this side is census-invisible, stated honestly: the namespace-mediated inline call —
   `import * as exec from "@hyperidle/agent-execution"; bootAgentOrchestration({ …,
   adapterPool: exec.createLocalAdapterPool() })` — records nothing, because the DI heuristic's
   inline-call branch requires an identifier callee (`crossing-detectors.ts:991-993`) and a
   namespace import of a layer face is an allowed import edge. It opens no conversation channel
   — the value is face-produced either way, and service-symbol acquisition stays censused
   (`repo-census.ts:683-714`) — but the law's mechanical teeth cover identifier spellings only;
   the namespace respelling is review territory, the same class as §7.3's function-body residue.
3. Everything a composition root hands across is either an environment fact (port, path, flag, db
   handle, bus) or a value some face boot returned, and its type lives in `@hyperidle/shared` or
   `@hyperidle/api-contract` — never in a service package.

**Why detector-invisibility is not a hole.** The blindness covers only values with no foreign
import provenance, and the import rules close the acquisition path for everything else: for an
application to hand a raw service symbol across, it must first import it, and
`application → service [import|manifest|di]` is at error the moment this WP clears those groups
(AC #3), while R1–R3 (§7) plus the shrunken export maps stop the faces laundering service symbols
outward. After this WP the only values a composition root *can* pass are face-produced or
environmental — exactly the set the reading declares to be composition.

**The enforced home (founder-gate item §13.3; replaces the first draft's "clause 3 reading").**
Two artifacts, both landing in wave B4, both ratified at the gate per
`governance/README.md:138-141`:

1. **An attack/control pair on the existing `crossing-di` rule** in
   `scripts/lib/governance-attacks.ts` (property 2, `governance/README.md:110-125`): probe A's
   spelling as the attack (expected finding: `layer → layer (other) [di]`), probe B's spelling as
   the control twin (expected: nothing reported). From that commit the ratified reading is
   break-tested on every lint run — if the detector ever stops flagging the inline spelling, or
   ever starts flagging the mediated handoff, the build fails.
2. **The clause text.** Clause 6's `why` and the governance README's DI paragraph gain the
   provenance sentence: a DI crossing is a *named symbol imported from another package's inside*
   handed into a foreign factory; a face-boot-produced value passed onward by the composition
   root is composition, not injection. **No verdict flips** — `layer → layer (other) [di]` stays
   forbidden; the sentence records what the predicate already means, so the ratified reading
   lives in the enforced model's own documentation instead of only in this plan.

---

## 5. Where composition lives — the per-file map (`requirements.md` §8.3)

No third neutral composition package (AU26 ruling, upheld); no application imports another
application. Each file:

| Today (`layers/core-api/src/…`) | End state |
|---|---|
| `services/run-orchestration-composition.ts` | moves into `layers/agent-orchestration/src/` (boot-internal); its harness-registry imports dissolve into execution-face adapters (§2.4); its `agentRunConfig`/session-requests imports become in-layer |
| `services/durable-agent-queue.ts` | moves with it (pure session-requests wiring) |
| `service-bootstrap.ts` — `startLifecycleProjectionDrain` (`:330`) | moves into `bootAgentOrchestration` |
| `service-bootstrap.ts` — everything else in `registerCoreDomainServices` | **stays core** (core's own domain reactions and reapers); its two cross-layer wires (`:470` intent recorder, admission reactions) become port ops per §2.1 |
| `service-bootstrap.ts` — `registerAgentLayerServices` (`:570`) | stays core minus the dead `dispatcherDeps` bundle [P4]: builtin-routine reactions and the routine scheduler are core's domain (AU15); the scheduler's enqueue + capacity read become port ops (`routine-scheduler-bindings.ts:39-40,:61`), `canProvision` becomes an application-passed boolean |
| `services/tool-handlers-bindings.ts` | moves into `layers/agent-orchestration/src/` (§2.5); the review workflow port becomes `CoreApiPort` ops |
| `services/tool-provider-bindings.ts` | **deleted** (§2.5): the dispatch it wrapped moves `harness-registry` → `tool-handlers`; role filtering becomes `buildToolDefinitions(ports, { role })`; `returnStatusTool` + the enforcement registry arrive via the execution adapters bundle |
| `services/core-api-port-composition.ts`, `services/agent-orchestration-port-composition.ts` | port client construction splits by consumer: core's outbound `AgentOrchestrationPort` client stays core-side (it is core's door out); the `CoreApiPort` client construction the tool stack needs moves with the tool stack, typed against `@hyperidle/api-contract` only — the transport keeps being registered by the application |
| `session.ts` | deleted; `runSession` + provisioning types surface on the orchestration face; eval repoints [P5] |
| `ws-connection-hub.ts`, `ws-subscribe-authorizer.ts`, `routes/health.ts`, `routes/ws.ts`, `work-state-push-gateway` | stay core; their deep-import *entries* fold into what `bootCoreApi` returns (§5.2) so the application stops naming them as subpaths |

### 5.1 `bootAgentOrchestration` grows into the layer's real face

Options added (all application-supplied values or opaque shared-typed handles): the execution
adapter bundle (§6), `resolveModel` capability, `sandboxBasePath`, `mcpBaseUrl` is **gone from
this boot** (it belongs to the execution face, §6). The boot internally: starts the runtime
(poller/drain/watcher — today's `startRuntime` at `create-server.ts:631`), the lifecycle
projection drain, wires its own services' provisioning reads (`heldConnections` via
`@hyperidle/connections`, `injectedFilesystems` via `@hyperidle/filesystems`,
`RegistryFilesystemMounter` via `@hyperidle/filesystem-mounting` with an application-supplied
`capturesDir` — all in-layer once here, killing three of `create-server.ts`'s app→service
imports at `:36-39,:79-80`), and the tool stack. `dispose` extends accordingly. The existing
options (`sessionStream`, `registerWorkerWebSocket`, `adapterPool`) keep their shape
(`boot.ts:46-78`).

### 5.2 `bootCoreApi` absorbs core's remaining self-composition

The credential boot migration (`create-server.ts:465-478` — `credentials` is core's own service),
settings backfill (with the §2.2 seam read and its ordering constraint), upgrade-token store
creation (`users`' `createUpgradeTokenStore`, `create-server.ts:661`), the WS hub + subscribe
authorizer construction (`:676-680` — `conversation`'s `findThread` wire is core-internal), and a
`resolveModel` capability built from its own `settings`/`credentials` services replacing the
application's `makeResolveModel` (`create-server.ts:151-181`). The boot RESULT exposes what the
application must pass onward (`upgradeTokenStore`, `resolveModel`, middleware, apps, pre-auth
registrars) — **the application mediates every cross-face handoff; no layer imports another**. Every one of
these handoffs follows the §4 spelling law, whose census state is proven by [P11] and whose
enforced home rides the founder gate (§13.3).

### 5.3 The applications

- **`remote-server/src/create-server.ts`** shrinks to: env/DB open (`resolveProfile` — see §8),
  `EventBus`, `bootAgentExecution` (§6) → `bootCoreApi` → `bootAgentOrchestration` → mount →
  listen → dispose. Its 13 `application → service [import]`s and 12 manifest rows die; the
  manifest ends at three layer faces + framework packages (`application → layer [manifest]` is
  allowed).
- **`desktop`** gets its **own composition root** (no `remote-server` import): same boot calls,
  its own environment facts (loopback, port 0, PGlite path, static dir, local adapter pool from
  the execution face). The middleware/mount ordering — probe-proven fragile
  (`create-server.ts:18-27` notFound trap; pre-auth vs auth ordering `:781-814`) — is extracted
  into a **layer-blind helper in `@hyperidle/shared/http`** taking only Hono values and
  registrar callbacks as parameters. That is not a third composition package: it names no layer,
  it is Hono plumbing in the framework package that already owns the middleware pieces. If the
  builder finds it cannot stay layer-blind, the fallback is duplicating the ~40-line recipe in
  both roots — never a package that imports layers.
- **`remote-worker`** thins to a process entry composing the execution face (§2.7).

---

## 6. `agent-execution`'s face and the MCP router's home (AC #4)

The registries decided the end state (`governance/architecture.json:111-115`, Ruling 12.3); this
section is the mechanism. **[D5]** correction absorbed: the layer hosts no *app* today, but the
router's `Hono` instance is constructed inside its service
(`harness-registry/src/mcp/mcp-route.ts:70`) — what is misplaced is who *builds the bridge* and
who *dials* it, not where the router code lives.

1. **The face.** `layers/agent-execution/src/` grows a genuine boot
   (`bootAgentExecution(options)`), declared in the layer's own src (clause 2), replacing the
   current re-export barrel (`src/index.ts:15-21` — the clause-2 violation requirements §3.5
   names). It owns: constructing the adapter pool (local discovery or empty), sandbox adapters,
   the return-enforcement registry, the MCP bridge + its router, and the harness-environment
   provisioning. Options: `mcpBaseUrl` (the application knows its own origin — today's
   `create-server.ts:567`), sandbox base path. Result: `{ mountMcpRouter(api), adapters,
   workerClient, dispose }` — where `adapters` is the opaque, shared-typed bundle
   `bootAgentOrchestration` accepts. The application mounts the router pre-auth exactly where the
   bridge router mounts today (`create-server.ts:803`), which clears
   `application → MCP router [mcp]` — the application mounts a face handle, it no longer imports
   `@hyperidle/harness-registry/mcp` (`create-server.ts:86,:566`).
2. **The dial.** The provisioner's bridge-open, URL construction and close
   (`provisioner.ts:1327,1349,1419,1449,1462,1570`) relocate into `harness-registry`'s own
   session-scope provisioning — the fold P7 proved cheap: `provisionHarnessEnvironment` (already
   harness-registry's) grows into "provision the session's MCP presence": mint the token, write
   `.mcp.json`/hooks, expose the URL to the harness, close on session end. What orchestration
   passes across the adapter contract is data + the return-observation callback the contract
   already carries shapes for: required return actions, the tool registry, `onToolCall`-class
   hooks (`shared`'s harness types). End state matches the decided rows exactly:
   `harness-registry → MCP router` (allowed) does the dialling, `harness → MCP router` (allowed)
   keeps dialling over HTTP, and the `service → MCP router [mcp]` + `service → agent-execution
   [api]` + `application → MCP router [mcp]` baseline entries clear.
3. **Consistency check that holds** (requirements §4): the router needs no DB; agent-execution
   has no DB credentials; a remote-worker deployment of the face carries the router with the
   harness relationship. `httpApiLayers` stays `["core-api","agent-orchestration"]` — the MCP
   router is not a layer HTTP API; it remains the token-authed harness door mounted by the
   application, so **no `architecture.json` endpoint edit is needed** beyond deleting the "It is
   mounted in the wrong place today" sentence when it stops being true.

---

## 7. The face rule — enforceable, with its attack cases (**[D3]**, requirements §3.4/§8.4)

D3's finding is accepted in full: clauses 1–2 alone leave today's deep imports on the allowed
side, and clause 3 is not machine-decidable. The architecture makes the rule bite mechanically
where it can and says honestly where it cannot:

1. **The manifest export map IS the face — and it shrinks.** End state per layer:
   - `core-api`: `.` , `./boot`, `./app` (whatever `bootCoreApi`'s contract genuinely needs —
     final entry list is the founder-gate exhibit). Deleted: `./service-bootstrap`,
     `./services/*`, `./ws-connection-hub`, `./ws-subscribe-authorizer`, `./routes/*`,
     `./session`, `./routines`, **`./test-utils`** (development content on a production face —
     requirements §3.5; zero external consumers [P5]).
   - `agent-orchestration`: `.` (already face-shaped, `src/index.ts:19-23`).
   - `agent-execution`: `.` (the new boot).
   Node's exports encapsulation then makes a deep service-path import fail to resolve at all —
   the cheapest, least-gameable teeth.
2. **Three new governance-lint rules** (census rules over the existing graph; each with a
   positive attack + control twin, per `governance/README.md:110-125` property 4):
   - **R1 `layer-exports-resolve-inside-the-layer`**: a layer manifest `exports` entry may not
     resolve into a nested service package. *Attack:* mutate `layers/core-api/package.json` to add
     an entry pointing into `layers/core-api/knowledge/src/…` → expect finding. *Control:* the
     surviving face entries.
   - **R2 `service-values-do-not-escape-the-face`** (restated after critique round-2 B4;
     replaces both the first draft's spelling and attempt 2's "anywhere outside a runtime
     function body" widening, which flagged this plan's own end state): in the layer root
     package's own modules reachable from its `exports` map (reachability stops at a package
     boundary — service packages are judged by the other rules), matching specifiers **by
     resolved module** exactly as R1/R3 do — so a relative path into a service directory is the
     same violation as the package specifier **[D3]** — it is a violation for a **value binding
     imported from a service module to escape the module's export surface as a value**. R2
     exists to catch a service symbol being laundered through the face (refine-critique D3;
     AU28's round-2 precedent); escape is what laundering *is*, so escape is what the predicate
     measures. **Coverage is derived from an enumeration, not a curated list** (the adjudicated
     strategy — three rounds of hand-picked attack sets each forgot a spelling class).
     TypeScript's export surface is a **closed, finite grammar**: every way a binding can leave
     a module is an AST shape the census's own parser produces (`ts.createSourceFile`,
     `repo-census.ts:644-646`). The predicate's verdict is therefore stated **per grammar
     member**, and the attack/control set derives from the tables below — every "caught" row
     has an executed attack case (labelled with its member id in the fixture), every deliberate
     narrowing an executed control twin, every review-territory row an executed residual case —
     so a future reviewer checks completeness against the grammar, not against anyone's
     imagination. The [P12] prototype **is the executed model** (five runs, verbatim in
     `probes/p12-r2-escape-predicate/outputs.txt`; the enumeration is restated in the
     prototype's own header).

     **The export-surface statements** (every top-level AST kind that creates an export edge):

     | # | Grammar member | Verdict |
     |---|---|---|
     | E1–E3 | `ExportDeclaration` with a module specifier — named clause with/without `as` (incl. `as default`), `export *`, `export * as ns` | caught by resolved specifier (A1, A2) |
     | E4 | `ExportDeclaration` without a specifier — `export { x }`, `export { x as y }`, `export { x as default }` | caught — the exported **local** is tested against the service bindings and marked escaping (X1–X3b; round 3's B5 hole, closed) |
     | E5/E6 | `ExportAssignment` — `export default <expr>` / `export = <expr>` | caught — the expression is scanned as escaping (A6, X23; `export =` is also a tsc error under these packages' NodeNext ESM, caught anyway so a module-format change cannot silently open it) |
     | E7 | exported `const`/`let`/`var`, identifier name | caught (A3, A4) |
     | E8/E9 | exported destructuring declarations — object and array patterns, nested, with defaults and rest | caught — pattern defaults and the initializer scanned whole; bound names escape (X4–X6) |
     | E10 | exported function declarations, incl. `export default function` | the function **value** is own-module code; its body is review territory (F10); the exported name is escape-tracked so mutation flow (F2–F5) sees it |
     | E11 | exported class declarations, incl. anonymous `export default class` | caught for every module-evaluation position — field initializers (static and instance), heritage `extends` expressions, decorators, static blocks, getter bodies (A7, X15, X18–X21); method/setter/constructor bodies are F10 |
     | E12 | exported enums | caught — member initializers scanned (X16) |
     | E13 | exported namespaces (`export namespace`) | caught conservatively — the body is scanned whole (X17; zero instances in the production tree today) |
     | E14 | `[export] import x = require("m")` | caught — the binding is recorded and exporting it flags (X22) |
     | — | CommonJS (`module.exports`, `exports.x`) | not a member of the grammar: the shipping packages compile ESM/NodeNext, where `module` is undefined at module scope — the spelling cannot function as an export |

     **Module-scope value flow into that surface:**

     | # | Grammar member | Verdict |
     |---|---|---|
     | F1 | initializer flow, transitive over module-scope bindings | caught (A5, A11) |
     | F2 | assignment to an escaping name, any assignment operator, incl. statements nested in module-level control flow (function bodies are the boundary) | caught (X7–X9; round 3's live-binding evidence, closed) |
     | F3 | destructuring assignment targeting an escaping name | caught (X10) |
     | F4 | property/element mutation whose base chain roots at an escaping binding | caught (X11) |
     | F5 | a module-scope call whose callee chain roots at an escaping binding, or that receives an escaping binding as an argument — all arguments scanned (conservative) | caught (X12, X13) |
     | F6 | value positions inside an escaping expression: literal members, spreads, call/`new` arguments, property-access objects, template spans, computed names, conditional/binary/`await`/`as`/`satisfies`/parens, tagged templates | caught by generic recursion (A4, A9, A10, A12) |
     | F7 | a function-expression body immediately invoked inside an escaping expression | caught — the body is part of the expression (A8) |
     | F8 | getter bodies of an escaping value, object-literal and class | caught — a getter yields its value on **property access**, so it is a data member in disguise (X14, X15); a getter returning a *produced* value stays clean (control C7). Closes the prior text-vs-model contradiction in the catching direction |
     | F9 | **exactly one exemption, positional, never named**: the bare imported identifier in direct callee position of a call or `new` | exempt — calling a service function produces a value, and a produced value escaping is composition (the §4 law's own shape); the symbol does not flow into its own call's result (controls C5, C7). A property-chain callee is not exempt (A10). Runtime object graphs (`new C()` → `.constructor`; produced values closing over service internals) are inherent to **every** face-produced composition value, not a defect of the exemption: R2 governs static binding escape, not runtime reachability — one clause in the rule's `why` |
     | F10 | function-like bodies that run on a consumer's call: arrows, function expressions and declarations, methods (class and object-literal), setters, constructors — incl. a named local function invoked at module scope | **review territory**, executed as residual (run 5, cases RES1/RES2): machine-indistinguishable from boot composition (§7.3) |
     | F11 | mutation through a module-scope alias of an escaping object | **review territory**, executed as residual (run 5, case RES3): object identity is points-to semantics, not grammar (§7.3) |
     | F12 | non-export side channels (`globalThis.leak = svc`) | outside R2 — not the export surface (run 5, case RES4; §7.3) |
     | F13 | dynamic `import()` of a service module | outside the binding model — the acquisition edge itself is censused (`repo-census.ts:705-712`) and its group is at error post-clear, so the spelling fails the build as an import crossing |
     | F14 | non-escaping module-scope wiring — the wiring-bag style (`app.ts:213`, `service-bootstrap.ts:175`: a non-exported literal over the layer's own services, consumed only inside the module's functions) | **legal composition, not a miss** — no face consumer can obtain the symbol except through a function body (F10's territory); firing here would flag this WP's own end state (round-2 B4); pinned by its control twin (C2) |

     Type-only spellings (`import type`, `export type … from`) are outside R2 — no value
     escapes; the face's type surface is governed by the ratified export map and the §4 law's
     type-home clause. **Executed ([P12], five runs, verbatim results in `outputs.txt`):**
     every attack case flags with one finding per spelling and the control fixture is clean
     (run 1); the three planned-legal end-state sites B4 named — `app.ts`,
     `service-bootstrap.ts`, and `tool-handlers-bindings.ts` (whose §5.3-relocated content is
     byte-identical) — are clean (run 2); the rule's founding target
     (`core-api/src/index.ts:15`) still flags (run 3); the **two-line respelling of the
     founding case** (`import { list } from "@hyperidle/knowledge"; export { list as
     listKnowledge };`) — round 3's decisive evidence — flags (run 4); and the three declared
     residual classes record nothing (run 5), so the §7.3 limit statement is itself executed
     evidence, not prose.
   - **R3 `deep-imports-die-with-their-entries`**: an import specifier of a layer package that
     resolves to a module absent from its `exports` map is a violation with the file and
     specifier named (satisfies validation scenario 2's error shape even where the TS resolver
     would also fail). *Attack:* overlay a file importing
     `@hyperidle/core-api/services/run-orchestration-composition` after the entry is gone →
     finding. *Control:* importing `./boot`.
   - `decided-rules.json`: **no verdict flips.** `application → layer [import]` stays allowed —
     the face split lands as the three rules above plus the shrunken export maps, so the 12
     instances D4 counted (10 deep + 2 already-face-shaped boots, **[D4]**) converge on
     face-shaped without a row change. The instance counts move; the founder ratifies the rule
     texts, the final export maps, and the attack set at the human gate.
   - **Naming hygiene for every attack/control case this WP adds** (R1–R3's and §4/§13.3's
     `crossing-di` pair alike) **[N4]**: case ids, overlay paths, and `detail` strings name the
     spelling under test, never the work package — work-package identifiers live in
     `.pipeline/**` only, never in rule ids, JSON keys, filenames, or any field of an enforced
     artifact under `governance/` or `scripts/` (founder ruling).
3. **The honest limit — derived from the enumeration, executed, stated so it survives a
   counterexample hunt.** R2's mechanical coverage is exactly the "caught" rows of §7.2's two
   tables — nothing more is claimed, and every claim has an executed case. **[N1]** Three
   classes are review territory, each named with its reason and each **executed as a residual
   case** (run 5, `fixture-residuals.ts.txt`: all record nothing) so the limit is evidence,
   not prose:
   - **Function-body spellings that run on a consumer's call (F10) — the true residual.** A
     call-wrapping function (`export const listKnowledge = (db) => list(db);` — residual RES1),
     a value-returning function (`export const getApi = () => ({ list });`), a method or
     setter body, an exported function returning a non-escaping wiring bag, or a **named**
     local function invoked from an escaping initializer (`function make() { return { list };
     } export const api = make();` — residual RES2: it evaluates during module load, yet the
     reference sits in a function body; only the *inline* immediately-invoked function
     expression is scanned, because its body is part of the escaping expression itself).
     These shapes are machine-indistinguishable from legitimate boot composition — a boot's
     body calls service functions by design — and separating them would take an allowlist,
     which is banned. Getter bodies are **not** in this class: a getter yields its value on
     property access, so the executed model scans them (F8) — the previous statement's "a
     getter or method body is review territory" is corrected here to match the model.
   - **Mutation through a module-scope alias of an escaping object (F11).** `const alias =
     api; alias.tool = svc;` (residual RES3) records nothing: the direct mutation spellings are
     caught (F2–F5), but object identity is points-to semantics, not grammar — a rule chasing
     aliases has no finite syntactic enumeration and would end in heuristics or an allowlist.
   - **Non-export side channels (F12).** `globalThis.leak = svc` (residual RES4) is not the
     export surface; R2 governs the face. A determined author writing this is review's
     business, like any other deliberate subversion.
   Non-escaping module-scope wiring (F14) is legal, not missed — firing on it would measure
   module-scope-ness instead of laundering and would flag this WP's own end state (round-2
   B4's finding, accepted in full). The residual is held by three real things, recorded in
   the rule's `why`: (a) the export map is small, enumerated, founder-ratified, and changes
   only through review of a manifest diff; (b) `knip`/`knip:production` deletes any face
   export without a composition-root consumer (no production export only tests consume); (c)
   the reviewer lens judges the face content list. The limit statement the founder ratifies
   at §13.1 is exactly this — **every member of the export-surface grammar and of direct
   module-scope value flow — including named exports of the binding itself, destructured
   exports, live-binding and compound assignment, destructuring assignment, property mutation
   and mutating calls on escaping values, class/enum/namespace member positions, and getter
   bodies — is caught mechanically, proven per member by an executed case; non-escaping
   module-scope wiring is legal composition; the review territory is exactly three executed
   classes — function bodies that run on a consumer's call (including a named local function
   invoked at module scope), mutation through a module-scope alias of an escaping value, and
   non-export side channels; runtime object graphs are outside any static rule, because R2
   governs static binding escape** — replacing its three predecessors: round 1's "a launder
   must be a call-wrapping function" (refuted in round 1), attempt 2's "caught if evaluated
   at module load" (refuted by the `make()` spelling, round-2 N1), and attempt 3's "escaping
   module-scope spellings are caught mechanically" (refuted by the export surface's own
   direct spellings, round-3 B5). Unlike its predecessors, it claims only what runs 1–5
   executed. No allowlist, no suppression path exists in any of the three holds.

---

## 8. Ownership overlaps with AU29 — both ruled explicitly, in opposite directions

**Overlap 1 — `application → db:util [import]`: AU29's, and AU31 must not disturb it.** One site: `create-server.ts` imports `resolveProfile` (`:77`, called `:418`). Ruling 12.3 moves
the util functions out of `db`, and their **destination is AU29's own refine question** — AU31
choosing a home would decide another WP's noun. Therefore: **AU29 owns clearing this group.**
AU31's create-server rewrite keeps the file path (`applications/remote-server/src/create-server.ts`)
and the `resolveProfile` import exactly as they are, so the baseline entry is neither cleared nor
grown here (the generator forbids both silently anyway). If AU29 lands first, the site dissolves
under whatever home AU29 ratifies and AU31 rebases onto it. Recorded for AU29's planner in §13.
Consequence for AC #5: AU31's "every entry gone" claim covers its **14 groups**, explicitly minus
this one — matching the plan's own footnote that the group is subject to this ruling
(`requirements.md:182`).

**Overlap 2 — `framework → layer [di]`: AU31's, and AU29 must not claim it.** AU29's AC reads
"Every `framework → *` … production entry is gone" (`work/AU29/plan.md:50`), which literally
covers this group; AU31's `progress.json.baselineScope` claims it too. Ruling: **AU31 clears
it.** The single site is `tool-provider-bindings.ts:64-66` — a file AU31 deletes as part of the
§2.5 tool-stack rework — and the wire has no db- or EventBus-shape that AU29's mechanisms could
dissolve: AU29's genuine `framework → *` groups are the `framework → EventBus` and
`framework → db:table` ones [P1]. AU29's planner must read its AC's `framework → *` quantifier as
excluding this group: if AU31 lands first the entry is already gone; if AU29 lands first it
leaves the site untouched. Recorded for the orchestrator to echo into AU29's artifacts in §13.6,
exactly as the db:util handoff is echoed in the other direction — requirements §8.1's bar,
"neither silently claiming nor silently dropping", applied to both overlaps.

---

## 9. Security — surfaces this change reaches

- **New state-changing endpoints** (intake, run-config write, injection persist, lifecycle verbs)
  on orchestration's app: all mount **behind** the application-applied auth + fail-closed stack
  (`create-server.ts:807-812` ordering preserved by the §5.3 helper); payloads are zod-validated
  like the sibling routes; idempotency keys bound replay. Abuse case: an authenticated agent
  calling the intake door directly — that is the trust model working as designed (agents are
  trusted actors; the same agent can already enqueue via existing core routes), not a new
  privilege. The injection-persist op is reachable without the core-side team-consistency gate —
  named in §2.6: the gate is a consistency check, not a wall; no gate-by-default classifier is
  added (ETHOS).
- **MCP surface:** paths, token minting, and token-in-URL auth are byte-identical
  (`mcp-route.ts:83-115` untouched); only the constructor/dialler moves. The pre-auth mount
  ordering keeps riding the composition helper, pinned by the same route-table assertions AU26
  left.
- **Credentials:** untouched — the resolver stays `DbCredentialResolver`, the encrypted token is
  still never baked (AU21 K1 invariant), and the provisioning-owner stamp carries an id, never a
  secret.
- **Not touched:** the public pre-auth surface set, WS auth, upload paths, outbound requests. No
  new dependency is added anywhere in this plan.

---

## 10. AC-to-obligation map and verification

| AC (`plan.md:47-53`) | Obligation here | Verified by |
|---|---|---|
| 1 — no layer names another layer/its services (imports + manifest) | §2 verdicts + §5 relocation + §2.7 buffer + §2.4 core-ui row | `npm run lint` governance pass: the 4 groups' baseline entries deleted → rules at error; validation scenario 2 covered by R3 + existing crossing rules |
| 2 — no cross-layer DI; API/MCP/bus only | all 14 DI baseline sites have named mechanisms: the 9 `service → service (other layer)` sites (8 files: `app.ts:494`, `bets.ts:684` — 2 sites, `tasks.ts:254`, `threads.ts:1678`, `org.ts:306`, `service-bootstrap.ts:470`, `agent-run-admission-reactions.ts:115`, `create-server.ts:510`) convert with their imports (W2=W7); the 2 `application → service` adapter-pool wires become §4-law face handoffs (§5.3, §6); `service → layer (other)` site 1 (`service-bootstrap.ts:330`) relocates in-layer (§5); the two `tool-provider-bindings.ts` wires — `framework → layer` and `service → layer (other)` site 2 — dissolve per §2.5, probe-proven [P11] | 4 DI groups' entries deleted → `wire-within-one-layer` at error; §4's attack/control pair pins the handoff reading; validation scenario 3 |
| 3 — applications compose faces only; no service, no other application | §5.3 + §6 + §2.7 relocations; manifest end states | `application → service [import|manifest|di]` + `application → application [import]` entries deleted; R1–R3 at error |
| 4 — MCP dialled only by harness-owning layer + harness; serving layer hosts the door | §6 | `service → MCP router`, `application → MCP router`, `service → agent-execution [api]` entries deleted; attack case for the dial rule already exists in the harness table |
| 5 — every named baseline entry gone, rules fail on reappearance | 14 groups (§8 carve-out recorded) | `governance/baseline.json` diff per commit; shrink-only generator enforces promotion |
| 6 — baseline-empty conditional | mechanical end-of-build check: if `groups` is empty after this WP's clears, delete `governance/baseline.json` + the `--adopt` path in `scripts/` in the same commit; [P1] says this is schedule-dependent, so the check runs unconditionally and acts only if true | the commit itself + `npm run lint` green with no baseline file |
| 7 — verify green + one real agent run end to end | §11 | executed, recorded output |

**Test strategy per lane:** every new seam op gets service-lane integration coverage
(`*.integration.test.ts`, real DB + composed app fixture — the ~240-fixture `disposeApp` shape is
preserved by §5's boot design, `app.ts:520-533`); the relocated composition keeps its existing
behavioral suites moving with the files; the two relinquished windows get targeted tests
(seam-failure → 5xx + committed core row, retry → idempotent success); R1–R3 land with their
attack + control cases (the build fails without them). No new test harness is invented.

## 11. The end-to-end evidence run (AC #7 — executed, not read)

Named recipe, run locally at ship time with a real harness on PATH (claude/codex/opencode are
installed and authed per project law):

1. Boot the real composed server through the **new** application root
   (`createServer(0, { adapterPool: <local pool from the execution face>, workspaceAdapter:
   <local sandbox>, … })` — the same shape `applications/desktop/src/boot-server.ts` ships), with
   a migrated scratch DB and `HYPERIDLE_API_KEY` set.
2. Seed one team + task through the public API, then `POST /api/sessions` with an
   `Idempotency-Key` (the durable explicit-start path).
3. **Proof of intake:** `GET` the start projection / `requests.find` seam route until it leaves
   `requested` — this is the work intent observable in `session-requests` through the same door
   core now uses.
4. **Proof of execution:** the session reaches a terminal state with a real harness transcript
   (session row via `GET /api/agent-orchestration/sessions?...`), and the MCP return action
   arrives through the relocated bridge (the run cannot go terminal-with-return without it).
5. **Proof of landing:** the task's state transition and the calling-thread reply message exist
   via core's own API.
Record the three observations (request id → terminal state → landed result) in
`.pipeline/work/AU31/probes/e2e-run.md`. **[D1]** The first draft claimed the existing
real-binary harness-lane test as a second, independent proof of the relocated dial; that claim
was false and is withdrawn: that test wires the enforcement pieces "directly from the registries
rather than via `provisionSession`" (its own words,
`layers/core-api/src/__tests__/real-harness-return-enforcement-realbinary.integration.test.ts:141`)
and constructs its own bridge and URL (`:168-169, :380`), so its green proves nothing about the
relocation. The recipe above carries AC #7 alone — step 4 already observes the relocated dial
live, because terminal-with-return is impossible without the bridge. `npm run verify` must be
green on the same tree (governance lint at error for every cleared group).

---

## 12. Implementation leaves, ownership, order — and the split recommendation

**Recommendation: split into two work packages** at the mechanism/composition boundary — the
plan anticipates this (`plan.md:27`). Each half is independently shippable with `verify` green
and a live run, and they touch nearly disjoint file sets. The orchestrator owns the live schedule
and the registration; if it keeps one WP, the same two waves run sequentially on one branch.

**WP/Wave A — "Core converses only through the door"** (writes: `layers/core-api/src/**` routes
+ reactors + `app.ts` + `service-bootstrap.ts`; `layers/agent-orchestration/src/**` routes +
services; `framework/api-contract`; the two port compositions; `layers/core-api/package.json`
row for `filesystems`; `layers/core-ui/package.json` respelling):
- A1. Port + route contracts (§3) in `api-contract` and orchestration's app, with service-lane
  tests (red first).
- A2. Convert the conversation call sites (§2.1a, §2.2, §2.3 verbs, §2.5 workflow ops, §2.6,
  writeback §2.7) — imports and injections die together per file; the two relinquishments land
  with their targeted tests; the backfill reorder + owner-stamp land here.
- A3. Manifest rows whose last import cleared; baseline shrinks ride every commit.
  Dependency: A1 → A2 → A3. After A: core-api's remaining cross-layer imports are exactly the
  composition files — wave B's inventory, stated so the reviewer can check the seam is complete.

**WP/Wave B — "The applications compose faces"** (writes: `layers/agent-execution/**`,
`layers/agent-orchestration/src/boot.ts` + `layers/agent-orchestration/tool-handlers/**` +
relocated composition files, `layers/core-api/src/boot.ts` + deleted subpath modules +
`package.json` export map, `applications/**`, `framework/shared/http` helper, `scripts/lib` +
`scripts/rules` + `governance/*`):
- B1. Execution face + MCP dial relocation + `RemoteWorkerClient` + buffer relocation (§6, §2.7).
- B2. Orchestration boot absorbs the composition (§5.1); the tool stack dissolves per §2.5
  (dispatch moves `harness-registry` → `tool-handlers`, wrapper file deleted, `returnStatusTool`
  + enforcement registry onto the adapters bundle); core boot absorbs its own (§5.2);
  `session.ts` deleted; eval repointed.
- B3. Applications rewritten (§5.3); desktop root; mount helper; manifests + export maps shrink
  to faces.
- B4. Governance: R1–R3 + attacks + README/`decided-rules` notes; the §4 attack/control pair on
  the `crossing-di` rule; conditional baseline deletion; live-run evidence + full verify.
  Dependency: B1 → B2 → B3 → B4. B depends on A (the relocated composition must not carry
  seam-shaped core imports with it; `service-bootstrap.ts` is the one file both waves touch).

**Human gate:** after this architecture and its independent critique, before any code — the
founder ratifies the §13 list. High-stakes; in an autonomous run this parks at the gate.

---

## 13. Founder-gate register: supersessions, ratifications, and handoffs

1. **The face rule** (§7): rule texts, per-layer final export maps, the
   enumeration-derived attack/control/residual set, and the limit statement **as restated in
   §7.3** — the export-surface grammar and direct module-scope value flow caught mechanically,
   proven per enumerated member by an executed case; non-escaping module-scope wiring legal
   composition; review territory exactly three executed classes (function bodies that run on
   a consumer's call, including the module-scope-invoked named local function; alias-mediated
   mutation; non-export side channels); runtime object graphs outside any static rule — the
   `decided-rules.json`/vocabulary change only a founder ruling may make
   (`governance/README.md:138-141`).
2. **`AgentOrchestrationPort` gains a write side**, superseding AU26 H1/H2's "downward call, the
   door stays read-only" (`policy-bindings.ts:100-105`). Rationale: the downward call is now the
   forbidden crossing; one door both directions is the smaller system.
3. **The composition-handoff reading and its enforced home (§4)**: the DI predicate is import
   provenance, so a face-boot-produced value passed onward by the composition root is
   composition, not injection — proven against the live census, not asserted ([P11]: the inline
   spelling fails the build; the mediated spelling records nothing, by the predicate's design).
   Ratified as (a) the attack/control pair on the `crossing-di` rule — probe A the attack, probe
   B the control twin — and (b) the provenance sentence in clause 6's `why` and the governance
   README. **No verdict flips** — stated precisely **[N5]**: the
   `layer → layer (other) [di]` verdict is generative, clause 6 (`governance-model.ts:266-290`)
   over an empty baseline; `decided-rules.json` carries no literal row for the group, so there
   is no row to flip and none is added. This is the reading the whole of §5/§6 stands on.
4. **Relinquished atomicity** at `knowledge.ts:934` and `threads.ts:1463` (+ the two run-config
   write couplings), windows as named in §3.1.
5. **Relocations that supersede a recorded decision**: `SessionActivityBuffer` out of
   agent-execution, superseding AU21 Decision E's placement note. **The in-decision alternative
   is on the table for this ratification**: keep the buffer in agent-execution, export it on the
   new execution face, and have the application construct it and pass it into
   `bootAgentOrchestration` — that clears the crossing without superseding Decision E ([P8]:
   `boot.ts:29` is the sole production site). Rejected because it preserves a placement AU26's
   own domain-served test rejects ([P8]: zero execution coupling; the buffer's only consumers are
   orchestration's boot and routes) and adds a cross-face wire to avoid a one-directory move of a
   pure bus fold — but the founder ratifies with the alternative in view, not only the rejection.
   Also here: `RemoteWorkerClient` into agent-execution (fulfils that package's own recorded
   intent).
6. **AU29 handoffs** (§8), both directions: `application → db:util [import]` is AU29's group and
   AU31 leaves the site untouched; `framework → layer [di]` is AU31's group and AU29's literal
   "Every `framework → *`" AC quantifier (`work/AU29/plan.md:50`) must be read as excluding it.
   Both to be echoed into AU29's planning artifacts by the orchestrator.
7. **Findings, not designs** (out-of-scope axes respected): no route changes host (§2.2, §2.6
   evidence); no domain moves layers; `connections`/`filesystems` placement untouched (AU26's
   axis); table ownership untouched (AU30); development-world crossings untouched except the two
   production manifest rows that serve them (§2.4 core-ui, desktop devDeps reconciliation).
8. **Provisioning-owner stamping is a behavior delta, not only a mechanism change [D2]**: today
   the owner resolves at provisioning time, application-side (`create-server.ts:201-213`);
   stamping at submit (§3.3) means an intent emitted before onboarding and drained after it
   provisions no connections where today's live resolution would. Accepted as the cost of the
   single port-side stamp — the empty-rows outcome matches today's no-owner case, but the
   *timing* of resolution does not, and the founder ratifies the delta, not only the mechanism.

## 14. Documentation made false by this change

For `/write-docs`: `docs/architecture/runtime-simplification.md` (composition-root narrative —
`createServer`'s shape, "core-api imports orchestration's route module" passages),
`docs/architecture/as-implemented-domain-architecture.md` (layer dependency figures),
`governance/README.md` gains the face-rule paragraph (the one legal home of the rule text), and
`governance/architecture.json`'s mcpRouter `why` drops "It is mounted in the wrong place today."
The two settled nouns (session-requests' identity; the public face) land in `docs/architecture/`
per requirements' DOC-CLASS.
