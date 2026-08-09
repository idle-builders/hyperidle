# AU31 — Architecture

Spec of record: `.pipeline/work/AU31/plan.md`. Requirements: `requirements.md` (PASSED critique;
the five non-blocking defects D1–D5 are absorbed below at the sites marked **[D1]**…**[D5]**).
Feasibility: `feasibility.md` (probes P1–P12, cited as **[P#]**). Tier: **production**. Every
`file:line` re-traced on the live tree; the site inventory and the two composition probes were
re-executed at base `59b9299a` — see **"Re-grounded onto the severity dial"** below.

**This revision applies the founder's ruling at the concept gate, and it removes work rather than
adding it.** Five rounds of critique argued about how completely R2 — the rule that keeps a
service symbol from being re-exported through a layer's public face — could be made to catch every
possible spelling. The founder closed the question: *"lets avoid overengineering. we don't need to
be able to catch every exotic catch, linting is engineering guidance not protection against
malicious actors."* R2 is now a rule a reader can understand in a paragraph: it reads a module's
export declarations and flags a service symbol that a value-carrying export form names, holds,
aggregates, or reaches through a top-level alias. Deleted with the completeness ambition: the
three-grammar (28-member) enumeration, the fail-closed carrier model, the loud
unmodeled-statement-kind guard, the 54-case attack fixture, the self-attack and residual fixtures,
and the seven-run probe ceremony — all of it built to defeat an author now explicitly out of
scope. Round 5's standing blocker **B7** is resolved by the ruling, not by code, and is recorded
as out of scope in §7.3 and §13.1. What is proven by execution is the bar that matters: the
founding violation (`layers/core-api/src/index.ts:15`) still fails the build, so AC #3 cannot be
satisfied by a rule that flags nothing ([P12], run 3). The six per-service verdicts, the 93-site
arithmetic, §11's evidence run, the wave split and the composition-root plan are unchanged.
**One thing five rounds confirmed was not sound: the atomicity audit.** A later amendment (§3.1,
§3.2, §12, §13.9, and the correction block in `feasibility.md` P3) replaces it — the audit's method
could not see a cross-boundary write that arrives as an injected dependency, so it counted four
coupled sites where there are nine, and it never asked the question that actually stopped the first
build attempt. That amendment also fixes how a caller acquires the seam's port and moves two
conversions from wave A to wave B. Nothing else is reopened. The other rulings the founder made at the
same gate (both supersessions, the relinquished atomicity with **no** durable mechanism, the
two-WP split, the `application → layer` narrowing) are recorded in §13's preamble. D1–D5 remain
absorbed at §11, §13.8, §7.2 **[D3]**, §3.1 **[D4]**, and §4 respectively.

**Re-grounded onto the severity dial (base `59b9299a`, PR #464).** AU32 replaced the governance
promotion mechanism while this plan sat between phases. `governance/baseline.json`, its generator
(`npm run governance:baseline`) and the `--adopt` escape hatch are **deleted from the repository**.
In their place `governance/rule-severity.json` carries one severity per architectural rule, `error`
or `warn`, and nothing else — no paths, no counts, no dates, no adoption records. **A key absent
from that file is at `error`;** the file lists only what is not yet clean. **Promotion is now a
single act: delete your rule's key from `rule-severity.json` in the same pull request that clears
its last violation.** There is no generator to run and no later step.

Three consequences this revision writes through the plan, and nothing else changes — no verdict, no
mechanism, no wave boundary, no file assignment moves:

1. **Every mechanism sentence that named the old bookkeeping is rewritten** (§1, §2.5, §4, §6, §8,
   §10, §12, §13 and `feasibility.md` P1/P2b/P11). The rule *verdicts* those sentences justified are
   unchanged; only the description of what makes a rule bite is.
2. **AC #6 is satisfied upstream and this plan builds nothing for it** — see §13.11 and §10's row 6.
3. **One probe justification flipped and is corrected rather than left standing** (§2.5, and P11
   fact 3): a rule at `warn` now warns for *every* violation including brand-new ones, so a
   relocated wire in a still-`warn` group is reported but **no longer fails the build**. Re-executed
   on the rebased tree: probe A still ERROR + exit 1, probe C1 now WARN + exit 0. The §2.5 decision
   is unaffected — see there for why.

This plan creates no outcome beyond the plan's seven ACs. Where it supersedes a prior in-code
decision, the supersession is listed in §13 and was ruled at the founder gate (`plan.md:25`).

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
only tests consume; **promotion is one act — clearing a rule's last site deletes that rule's key
from `governance/rule-severity.json` in the same pull request, and the rule is at `error` from that
commit** (an absent key is at `error`), with no separate or deferred promotion step and nothing to
regenerate; a cleared key is deleted, never re-tagged and never re-added at a lower severity;
**nothing may rebuild a per-file allowance record under any name** — `no-per-file-allowances`
already fails the build on a new file under `governance/`, a nested value under a severity key, a
malformed rule key, or an undeclared flag on a governance CLI, and this plan designs nothing that
would trip it. One more constraint arrives with the same base: **AU32 cleared the whole development
world (0 development violations), so every development rule is at `error` with no `warn` key to fall
back on** — see §10's development-world clause.

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
would re-create two DI groups this work package is on the hook to clear — probe C1 [P11] shows the
framework-consumer wire being reported live at exactly the relocated spelling, naming the file and
the symbol.

**The strength of that argument changed with the base, and the honest version is weaker but still
decisive.** Under AU32's severity dial a rule at `warn` warns for every violation including
brand-new ones, so C1's relocated wire is now reported and the build still **passes** — re-executed
on the rebased tree: `WARN [crossing-di] … framework → layer [di] production`, 222 production
violations, exit 0 (it was ERROR + exit 1 under the deleted baseline ratchet). So the relocation is
no longer *mid-build fatal*. It is still forbidden, still detected, and still fatal to this work
package: `framework → layer [di] production` is a key AU31 must delete from
`governance/rule-severity.json` (§12's key map), and deleting it with a relocated site alive puts
the rule at `error` over a live violation and breaks the build at that commit. The decision is
therefore unchanged — dissolve the wires, do not move them — but the reason is "the key cannot be
deleted while the wire exists", not "the linter stops you the moment you write it".
`governance/README.md:78-88` states the dial; `no-per-file-allowances` forecloses any per-file
carve-out that could hold such a site open. Each of the file's wires gets its own mechanism:

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

Net effect on AC #5: both remaining DI sites in this file — `framework → layer [di]` and
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

### 2.8 `validateAgentConfig` — the one `agent-run-config` symbol §2.2 does not name

Wave A's builder converted every read and write in `routes/agents.ts` and `routes/assistant.ts` to
port operations and stopped at this one import, flagging it instead of improvising. Correct call:
the function is pure computation that needs a local, non-serializable adapter-pool reader, so it
cannot become an ordinary remote op — and the boundary rule takes no exceptions, so "it's pure"
does not make the crossing legal either. §2.2 never named it. This is the decision.

**Verdict: it moves into core-api and stays a plain function call. No port op, no new framework
module, no exception, no facade.**

New home: `layers/core-api/src/routes/validate-agent-config.ts` — layer-world, not exported from
the package's `index.ts` or any subpath in its export map — with `AgentConfigValidationError`
moving alongside it. Its unit suite moves with it, unchanged, to
`layers/core-api/src/routes/__tests__/validate-agent-config-provider-agnostic.test.ts` (it keeps
its POLISH-060 header, which is still the reason the function reads registration metadata rather
than capabilities). `agent-run-config/src/index.ts:39-40` loses both exports and
`agent-run-config/src/validate-agent-config.ts` is deleted, not left behind: repo-wide, the only
production callers are the four sites below and the only other reference is that one suite, so no
export survives that only a test consumes.

**Why core-api is the honest home, not just the convenient one.** Read the function
(`layers/agent-orchestration/agent-run-config/src/validate-agent-config.ts:39-100`): four checks,
no database, no service call, no `await`. Its entire world is `framework/shared` — `isCatalogModel`
for the model catalog, and `harnessRegistrationMeta` over the structural
`HarnessCapabilityReader` for what this process has actually registered. `framework/shared` has
reach `everyone` (`governance/architecture.json:36-39`), and both call sites already import that
exact reader type from it directly (`routes/agents.ts:36`, `routes/assistant.ts:29`) and already
hold the pool instance (`routes/agents.ts:145`, `routes/assistant.ts:269`). Core loses one import
line and gains nothing it did not already have.

What the function answers is a question about the **request**, not about the stored row: does this
body name a harness this process registered, and a model the catalog knows? That is the same
category as the zod schema a few lines above each call. The proof that this is the shipped model
and not a convenient reading: **the writer has never validated.** `writeAgentRunConfig` is called
from `layers/core-api/org/src/scaffold-agents.ts:194`,
`layers/agent-orchestration/src/routes/agent-orchestration-intake.ts:382`, and
`routes/teams-routes.ts:424,:432`, and none of those paths validates anything. Validation is
admission control on four HTTP handlers; the service that stores the columns has never used it, and
nothing anywhere in `agent-orchestration` calls it.

**Why not behind the port — "core sends, the owner validates".** Both call sites need the verdict
*before* they do something else, so the port cannot carry it:

- `routes/assistant.ts:405-421` validates before creating or loading the agent row, and its own
  `@lore` (AR4c) says why: a bad triple must never contaminate the row — 422, no side effect.
- `routes/agents.ts:248-256` (POST) validates before the `teamId` FK probe and before
  `insertUser`; the `runConfig.write` seam call happens *after* that users insert. §3.1 and §13
  item 9 already accept that those two writes are not atomic. Validating at the writer converts
  today's clean "422 and nothing happened" into a half-created agent, and spends a seam round trip
  to learn a request was malformed. That is a behavior regression AU31 does not own.
- `routes/agents.ts:380-388` and `:449-457` (PATCH) validate a triple derived from
  `data.field ?? existing`, where `existing` already arrived through a port read. The verdict is
  core's own composition of two facts, one of which it fetched — not a fact the owner holds.

**Why not a framework package.**

- `@hyperidle/shared` — mechanically legal, rejected. Its reach is already `everyone` and AU34
  exists to split it for exactly that reason. A symbol with four callers in one layer is the
  weakest possible case for growing it.
- `framework/api-contract` — the more tempting option, and still wrong. It declares itself
  type-only with no runtime code (`framework/api-contract/src/index.ts:1-7`) and its manifest
  declares **no dependencies at all**. Hosting this validator makes `@hyperidle/shared` the
  contract package's first runtime dependency, so every consumer of a wire type starts pulling the
  model catalog and the harness capability reader. It also buys no reuse: api-contract's reach is
  `["layer"]` (`governance/architecture.json:44-47`), so a service could never call the validator
  through it. A far larger architectural claim than this problem justifies.

**Which wave: A.** Both files are already in wave A's write set (`layers/core-api/src/routes/**`);
the move needs nothing wave B produces — no face, no boot relocation, no new port op, no contract
change; and leaving it stranded leaves two live sites under §12.1 row 1 that no later leaf claims.
It lands in **A2**, in the same commits as the rest of those two files.

**What it does and does not do to the manifest.** It clears row 1's last two route sites. It does
**not** clear core-api's `@hyperidle/agent-run-config` row: `services/run-orchestration-composition.ts:3`
still imports `readAgentRunConfig`, and that file relocates in wave B (§2.2's drain-read bullet,
§5). §12.1 row 5 already assigns the `agent-run-config` row to wave B, and that stays correct
exactly as written — this decision changes no key's wave and no key deletion.

**One lore correction rides along.** `agent-run-config/src/index.ts:11` and the moved file's own
header both say the validator "moved here with the columns it validates" (AU26 G1). That rationale
was that it *could* move cleanly, not that it had to; under the boundary rule the placement costs a
crossing and buys nothing. The moved file records the correction in place of the old claim.
`docs/agent-layer/model-routing-and-cost.md:36` names the old path and is added to §14.

---

## 3. The seam, extended — contract decisions (locked)

The port surface is the load-bearing public contract of this WP. Locked here; spelling of route
paths and zod schemas is the builder's.

The five numbered clauses in this section are cited elsewhere as *§3 clause N*; the numbered
subsections that follow it are §3.1 and §3.2.

1. **One door, both directions.** `AgentOrchestrationPort` (types in `@hyperidle/api-contract`,
   reach `["layer"]`) gains a write side; `CoreApiPort` gains the proposed-call workflow and
   knowledge-writeback ops. Both keep their existing transport duality (in-process `app.fetch` /
   network). **How a caller gets hold of the port changes** — the module-level transport
   registration (`create-server.ts:834`'s `registerAgentOrchestrationTransport`) is deleted, and
   §3.2 states what replaces it.
2. **`AgentOrchestrationPort` operation families** (names indicative, shapes locked by the
   call-site inventory):
   - `intents.submit(input)` → the durable enqueue; input = today's `enqueueWorkIntent` payload
     (kind, sourceKind, sourceId, requestedBy, idempotencyKey, bakedRequest); returns the created
     intent row (id + idempotencyKey — `knowledge.ts:955` needs it).
   - `intents.createExplicitStart(input)` → the **atomic pair** op: creates the explicit start and
     records the baked `session_start` intent in one orchestration-side transaction, preserving
     the atomicity `sessions-routes.ts:167-201` has today [P3b]. Core resolves the baked request
     from its own domain *before* the call and passes it in.
   - `intents.transition(...)` / `runs.stopForTasks(taskIds)` / `runs.endForHandoff(...)` /
     `runs.createBareRun(...)` / `runs.abort(sessionId)` /
     `runs.failExplicitStart(startId, code)` → the request-about-request family
     (`agent-run-admission-reactions.ts:41`'s `transitionSessionRequest`, `policy-bindings.ts`'s
     abort+`endRunForHandoff`, `bets.ts`'s stop, `sessions-routes.ts`'s bare run). In-process
     registry aborts happen inside the handlers.
     **`runs.requestTermination` is struck from this list, not deferred.** The draft listed it, and
     nothing in the production tree drives a termination-by-reason request across the boundary:
     the only core-side occurrence is `run-orchestration-composition.ts:184`'s
     `requestAgentTermination`, which is composition plumbing in a file §5 relocates into
     agent-orchestration, where the call is in-layer and needs no op at all. Building it would
     leave a production export only tests consume, which §1 forbids.
   - `requests.find(query)` — the full `findSessionRequest` query family including the
     idempotency probe and the by-intent-source read (`app.ts:52-55`), and
     `requests.listPendingIntentsByKind(kind)` **[D1]**.
   - `runConfig.read / readBatch / write` (§2.2), **plus the team defaults pair**
     `runConfig.readTeamDefaults(teamId)` / `runConfig.writeTeamDefaults(teamId, defaults)`. The
     draft's inventory omitted them; both have real wave-A consumers
     (`teams-routes.ts:540` reads, `teams-routes.ts:280` writes) and the write is one of the
     couplings §3.1 now names. Same verdict as the rest of §2.2, one more operation pair.
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

## 3.1 Writes that cross the boundary from inside a caller's transaction — corrected inventory

**The earlier count in this section was wrong, and the method behind it cannot be trusted.** The
draft said the audit found "exactly two" cross-boundary pairs (`knowledge.ts:934`,
`threads.ts:1463`) plus two run-config couplings, and five critique rounds ratified that as
complete. It is not. There are **nine** transactions in the production tree that commit a core
write and an agent-orchestration write together, carrying **ten** orchestration writes between
them — plus two orchestration *reads* that run while one of those nine holds the connection, a
question P3 never asked and the one that stopped the first build. P3 found four because of *how it
looked*, not because there are four — see the correction block in `feasibility.md` P3 and the sweep
in `probes/p3b-transaction-threading/`.

**Why the old method could not see them.** P3 searched for the literal spellings
`enqueueWorkIntent(`, `createSessionRequest(`, `agentWorkIntentRecorder.record(` and
`tx as HyperIdleDb`, scoped to `layers/core-api/src`. Two independent reasons that misses most of
the set (and the scope alone excludes the four core service packages where five of the nine sites
live):

1. **Most sites never write the function's name.** The orchestration write arrives as an injected
   dependency and is called as `deps.workIntents.record(tx, …)`,
   `ports.workIntents.enqueueWorkIntent(tx, …)`, `deps.runOrchestration.endRunForHandoff(tx, …)`
   or `ports.intentRecorder.record(innerTx, …)`. The file making the call does not import the
   orchestration package at all, so no search for the orchestration function's name reaches it.
2. **The transaction is usually opened one or two frames below the innocent-looking call.**
   `routes/tasks.ts:253` calls `transitionTask(db, …)` with a pooled handle — and `transitionTask`
   opens its own transaction and records the intent inside it
   (`work/src/task-state-machine.ts:72,:141`). `routes/threads.ts:1665` calls
   `transitionProposedCall(db, …)` with a pooled handle — and that function opens a *nested*
   transaction and records the intent inside it (`review/src/proposed-call-workflow.ts:523,:578`).
   Classifying by the executor visible at the call site marks both "uncoupled", which is exactly
   what P3's table did.

**The method that does see them, so a reviewer can check the method rather than the list.** Two
enumerations, neither keyed on a name:

- **Follow the transaction handle, not the callee.** Every `.transaction(` in the shipping roots
  (production files only), brace-matched to its callback body; inside each body, every call whose
  first argument is the handle or a local alias of it. A write can only be inside a transaction if
  the handle reached it, so this set is complete by construction. 25 bodies thread their handle
  into at least one call; four expression-body callbacks are read by hand (three are matches inside
  comments, the fourth is orchestration-internal). Script and recorded
  output: `probes/p3b-transaction-threading/` (one gotcha worth knowing: the callback's return-type
  annotation can contain a `{`, so the body match must start after the `=>` — getting that wrong
  silently drops `task-state-machine.ts`, one of the missed sites).
- **Resolve each reported callee to its owning package**, following an injected port to the
  composition root that wires it (`policy-bindings.ts:88,:105`,
  `routine-scheduler-bindings.ts:151-160`, `service-bootstrap.ts:470`, `threads.ts:1678`,
  `tasks.ts:254`, `bets.ts:684`, `app.ts:494`, `work-session-started-reactions.ts:63`). Ten of the
  25 bodies reach agent-orchestration.
- **Check the frame below that one too**, because a callee can take the handle and pass it on again.
  Recorded — script, run and verdict — in `probes/p3b-transaction-threading/frame2.md`: only
  `layers/core-api/src/**` files can name an orchestration function at all (23 of them, none in a
  core service package), and re-applying the first-argument rule inside every reported callee finds
  exactly one frame-2 call that crosses — `resolveRoutineRunRequest`'s
  `deps.agentSelection.isAtCapacity`, a read, which is one of the two hoisted below. No frame-2
  write exists, so the nine-transaction inventory is closed rather than merely swept once.

### The corrected inventory

| # | Transaction | The orchestration write inside it | Core writes committing with it |
|---|---|---|---|
| 1 | `routes/agents.ts:270` | `writeAgentRunConfig(tx, …)` `:281` | `insertUser` `:271` |
| 2 | `routes/teams-routes.ts:265` | `writeTeamRunConfigDefaults(tx, …)` `:280` | `createTeam` `:266` |
| 3 | `routes/teams-routes.ts:413` | `writeAgentRunConfig(tx, …)` `:422` | `insertUser` `:414` |
| 4 | `routes/knowledge.ts:890` | `enqueueWorkIntent(tx, …)` `:934` | knowledge flag transition `:891` |
| 5 | `routes/threads.ts:1440` | `agentWorkIntentRecorder.record(tx, …)` `:1463` | `insertMessage` `:1443`, `updateThread` `:1482,:1496-1503` |
| 6 | `work/src/task-state-machine.ts:72` | `deps.workIntents.record(tx, …)` `:141` | task CAS `:98`, dispatch-attempt insert `:120` |
| 7 | `policy/src/handoff-protocol.ts:116` | **two:** `deps.runOrchestration.endRunForHandoff(tx, …)` `:128` and `deps.sessionRequests.record(tx, …)` `:338` | task handoff claim `:117`, task patches `:144,:189,:218,:311`, thread/item/message writes `:160,:170,:225,:236,:284`, dispatch-attempt insert `:322` |
| 8 | `routine/src/routine-scheduler.ts:599` | `ports.workIntents.enqueueWorkIntent(tx, …)` `:619` | `insertRoutineRun` (outcome `running`) `:600` |
| 9 | `review/src/proposed-call-workflow.ts:523` (nested inside the caller's handle) | `ports.intentRecorder.record(innerTx, …)` `:578` | `tailoredGrants` insert `:524`, `proposedCalls` → `granted` `:537-540` |
| — | `routes/sessions-routes.ts:167` | `createSessionRequest` `:168` + `agentWorkIntentRecorder.record` `:194` | **none** — both writes are orchestration-owned |

Sites 1, 3, 4 and 5 are the four the draft named. Sites 2, 6, 7, 8 and 9 are new; site 7 carries
two orchestration writes, not one. The `sessions-routes.ts:167` row is unchanged and still
correct: no core write shares that transaction, so it survives whole as the single
`intents.createExplicitStart` operation (§3 clause 2).

Every other transaction the sweep found is core-only (`threads.ts:1070,:1155,:1213`,
`bets.ts:924`, `teams-routes.ts` is above, `users/src/invite-code.ts:104`,
`settings/src/server-config.ts:280`, `work/src/bet-state-machine.ts:167`,
`policy/src/lifecycle-propagation.ts:44`, `routine/src/routine-scheduler.ts:284,:348`,
`knowledge/src/attention-service.ts:251`) or orchestration-only
(`session-requests/src/service.ts:609,:874,:1022`, `run-orchestration/src/transition-run.ts:67`,
`src/routes/agent-orchestration-intake.ts:135`). The **reverse** direction is clean and worth
stating so nobody re-derives it: no orchestration-owned transaction wraps a write that becomes a
`CoreApiPort` op — the writeback processor calls its knowledge port with a pooled handle
(`run-orchestration/src/writeback-processor.ts:234,:268,:290,:320`) and `tool-handlers` opens no
transaction at all.

### One rule, applied to all nine

**The founder has already ruled the mechanism** (`progress.json.founderRulings.atomicity`,
verbatim): *"keep it simple and focused no overengineering for things that don't matter in
reality. hyperidle is a productivity tool without real users."* That is a principle, not a
two-site exception, so it applies to every site above:

> Cross-layer atomicity is **relinquished**. The core transaction commits; the seam call follows;
> the post-commit events that exist today emit in the order they emit today. A seam failure
> surfaces as the operation's own failure — 5xx on a route, a thrown error in a reaction or a
> scheduler tick. The core rows stay committed and the queued job is missing. **No outbox, no
> durable mechanism, no saga, no compensating write, no reconciler, no sweeper.** The window is
> named at each site in code, in a comment a maintainer reads before touching the line.

**One exception, ruled by the founder, and it is error handling rather than a mechanism.** Site 8's
failed submit leaves the routine wedged rather than merely missing a job, so its failure path marks
the run failed and lets the next scheduler tick re-fire the routine — a `catch` and one state write,
detailed at the end of this section. It re-creates nothing and recovers no work; the eight other
sites are plain relinquishment as stated above.

**One free lever is used where it is free: the order of the two writes.** Relinquishment leaves
two writes in sequence, and which one goes first is a choice with no cost. Where the seam write
needs nothing the core transaction produces, and its *absence* would strand a resource that
nothing ever cleans up, it goes **before** the core transaction instead of after. Exactly one site
qualifies:

- **Site 7's `endRunForHandoff` moves ahead of the transaction.** Its own header is the evidence:
  *"there is NO safety net behind this write. `runtime-reapers.ts`'s stale sweep selects
  `routineId is not null` — routine sessions only — so a handed-off run left `active` stays
  `active` forever"* (`run-orchestration/src/end-run-for-handoff.ts:25-29`). Relinquished in the
  default order, a failure would leave a permanently `active` run row that no reaper touches, and
  admission would count that phantom against the agent's `maxConcurrentSessions` forever — for a
  one-session agent, that agent never runs again. Ordered first, the residue instead is a run
  marked `done` whose task was not handed off: the write takes no CAS
  (`end-run-for-handoff.ts:40`), so it is idempotent and a retried handoff re-applies it; the
  in-process run's own `endSession` CASes on `active` and no-ops; the task is untouched and
  retryable. Named cost of the reorder: for the moment between the two, admission may over-admit
  that agent by one.

Site 7's second orchestration write (`deps.sessionRequests.record` at `:338`, the successor's
dispatch intent) follows the default order, as does the in-process `abort` at `:367`, which
already runs post-commit today.

### What is lost at each site, and how it is repaired

- **Sites 1 and 3** (`writeAgentRunConfig` beside `insertUser`): the agent exists with
  `DEFAULT_AGENT_RUN_CONFIG` semantics — the read path already defaults
  (`agent-run-config/src/index.ts`) — so it runs on builtin instead of the harness the caller
  asked for. The admin edit path repairs it.
- **Site 2** (`writeTeamRunConfigDefaults` beside `createTeam`): the team exists with no harness
  defaults, so agents scaffolded onto it later fall back to builtin
  (`org/src/scaffold-agents.ts:194-202`). The team settings edit repairs it.
- **Site 4** (knowledge flag + `knowledge_action` intent): a flagged item with no queued review
  action; the route returns 5xx, and a retry re-runs the idempotent flag path and re-submits under
  the same `knowledge:${id}:review:${editId}` key.
- **Site 5** (message insert + `assistant_turn` intent): a committed message with no turn intent;
  the route returns 5xx, the user re-sends, and the coherence trigger
  (`assistant-turn-coherence-trigger.ts`) re-bakes on the next thread append anyway. **[D4]** A
  re-send inserts a second *visible* message unless the client reuses its `clientKey` — the dedupe
  path exists (`threads.ts:1071-1081`) — so the worst observable outcome is one duplicated
  message, never a lost one.
- **Site 6** (task CAS + dispatch attempt + `task_run` intent): the task sits in its new state
  with a `requested` dispatch-attempt row and no session ever starts. Visible in the task view
  (state changed, nothing running). Repaired by moving the task to `hold` and back, which is the
  existing retry occasion (`task-state-machine.ts:123`'s `"retry"` path) reachable from the tasks
  route.
- **Site 7** (see the reorder above): after `endRunForHandoff` succeeds, a failed
  `sessionRequests.record` leaves the task handed off to the target agent with no session queued —
  the dispatch-attempt row exists, so the same `hold`/re-dispatch repair applies.
- **Site 9** (grant + `reengagement` intent): the human's approval is recorded and the grant is
  minted, but no reengagement session is queued. The grant row stays `consumed:false`, so the
  agent's next attempt at the same tool call consumes it
  (`proposed-call-workflow.ts:585-597`), and `applyLivenessRetry`
  (`proposed-call-workflow.ts:666`) is the existing net on the same path.

### The one site whose residue was worse than a lost job — raised to the founder, and ruled

**Site 8 (`routine-scheduler.ts:599`) cannot be relinquished as cheaply as the rest, and the
reorder lever does not reach it.** The transaction inserts the `routineRuns` row with outcome
`running` and then bakes the request *from that row* — `resolveRoutineRunRequest` reads it back
and requires `outcome === "running"` (`routine/src/routine-service.ts:357-360`) — so the intent
cannot be submitted before the row exists. Relinquished with no further handling, a failed submit
would leave a `running` routine_run with no session. Consequence, concretely: `fireGenericRoutine`'s
coalescing guard reads exactly that row (`routine-scheduler.ts:574-579`) and reports "previous run
still in progress", so **that routine would never fire again**; and the reaper that exists for this
shape keys on an `active` *session* (`run-orchestration/src/runtime-reapers.ts:170-186`), which in
this failure never existed, so nothing would clear it. The stuck run is visible in the routine's run
history and closing that one row restores the routine, but nothing does it automatically.

**The founder was asked about this one site, and ruled: add the error handling.** Verbatim intent —
catch the failure of the seam call and mark the run failed, so the next scheduler tick picks the
routine up normally. So site 8 is relinquished like the other eight *and* it cleans up after itself:

> When the post-commit `enqueueWorkIntent` call fails, the run row is moved to a terminal failed
> state before the failure propagates. The coalescing guard reads only `running` rows, so it clears,
> and the routine fires again on the next tick like any other routine whose last run failed.

**This is ordinary error handling, not machinery.** It is a `catch` plus one state write. No outbox,
no saga, no background sweeper, no reconciler, no retry loop, no new table, no new infrastructure —
and it is deliberately not a general mechanism applied to the other eight sites, which stay plain
relinquishment with the window named in code.

Concretely:

- **Owning service:** `@hyperidle/routine`, the only writer of `routine_runs`. The write goes
  through its existing entry point `updateRoutineRun`
  (`layers/core-api/routine/src/routine-service.ts:158`) — nothing new is exported.
- **State written:** `outcome: "error"`, `endedAt` set to now, `errorMessage` carrying the submit
  failure, guarded with `{ onlyIfRunning: true }`. That is the exact shape this failure already has
  a precedent for: `agent-run-admission-reactions.ts:87-95` marks the same row the same way when
  admission rejects a `routine_run`, so the routine's run history renders it as a failed run today
  with no UI or projection change.
- **Who implements it:** leaf **A2** in §12, in `layers/core-api/routine/src/routine-scheduler.ts`
  where `fireGenericRoutine` already has a `try`/`catch` around the transaction (`:628`) — the seam
  call moves out of the transaction, and its own failure path writes the row and rethrows. Rethrow,
  not swallow: a scheduler tick must still report the failure the way every other failure on this
  path is reported.
- **Why the next tick then fires it:** `fireGenericRoutine` only advances `nextRunAt` after a
  successful submit (`:652-657`), so on failure the routine is still due. With the run row no longer
  `running`, the coalescing guard at `:574-579` passes and the routine runs again — no scheduling
  change of any kind is needed to make this work.

Everything else about the site is unchanged, and the alternatives that were considered stay
rejected: a compensating write that re-creates the queued job, widening the reaper to sweep
`running` routine_runs with no session, and changing `resolveRoutineRunRequest` to bake without
reading its own row. The first two are the durable machinery the ruling rejects; the third rewrites
a core resolver's contract to dodge a failure that has not happened. Marking the run failed is
none of those — it is the same one-row write the admission-failure path already performs.

### Reads are hoisted out of the transaction, not relinquished

The deadlock the wave-A builder hit is not specific to writes: an in-process seam call issued
while a transaction holds the shared PGlite connection deadlocks whether it reads or writes. Two
orchestration **reads** run inside a core transaction today, both on the routine path and both
reached from `resolveRoutineRunRequest` at `routine-scheduler.ts:606`: `isAgentAtCapacity` (a
`sessions` read) and, inside its `concurrencyBoundReader`, `readAgentRunConfig` — wired at
`routine-scheduler-bindings.ts:153,:159`. They have no atomicity to give up: they read
orchestration-owned tables that the core transaction never writes, so the value is identical
before the transaction opens. **Both are hoisted above the transaction and their results passed
in.** No window, no behavior change, and the same treatment applies to any further seam read a
builder finds inside a transaction — the rule is "a seam call never runs while this process holds
a transaction", which is also the rule that keeps the deadlock from coming back.

### Shipped tests that assert the guarantee being relinquished

These exist, they are green today, and they were written deliberately by earlier reviews. They
assert the *old* design, so they are rewritten to assert the named window — not worked around, and
certainly not left to drive the code back to the pre-ruling shape:

- `layers/core-api/src/__tests__/agent-work-intent-production.integration.test.ts` — four cases
  (`:428` assistant message, `:450` knowledge flag, `:501` manual routine, `:518` scheduler
  routine) assert the core row is rolled back when the intent write fails. The two message/flag
  cases invert: the core row now survives and the intent is absent. The two routine cases assert
  `routineRuns` is empty, and that also inverts — the run row survives, now carrying
  `outcome: "error"` from the failure handling the founder ruled for site 8. So these two become the
  test that pins the named window and the failed-run mark, rather than the old rollback.
- `layers/core-api/src/routes/__tests__/agent-and-team-creation-atomicity.integration.test.ts` —
  AU26 review W10's fix for sites 1/2/3. Both cases invert: the agent/team row now survives with
  default run config. The finding W10 recorded (an agent silently running on the wrong harness)
  becomes the named, repairable window above.
- `layers/core-api/src/__tests__/handoff-to.integration.test.ts:354` ("leaves the run untouched
  when the handoff transaction rolls back") inverts by construction under site 7's reorder: the run
  is ended before the transaction, so a rolled-back handoff leaves an ended run. The reorder's
  residue is what this test should now assert.
- `layers/core-api/src/__tests__/handoff-protocol.integration.test.ts:664` ("rolls back session,
  task, auditTrail when messages INSERT throws") inverts the same way, on the `toAgent` branch —
  it is `handoff-to.ts:354`'s twin, and an earlier draft of this section wrongly filed it as
  unaffected. It forces the `messages` insert inside `handoff-protocol.ts:116`'s transaction to
  throw and then asserts `session.state === "active"` with a falsy `endedAt` (`:727-729`) — exactly
  the run-end guarantee the reorder gives up, since `endRunForHandoff` is step 1 and runs before
  the `toAgent`/`toRole`/`toHuman` split. Same treatment as its twin: it asserts the named window
  (the session is already ended when the transaction rolls back, so a rolled-back handoff leaves an
  ended run and an unchanged task), it is not bent back to the old behavior, and it is not deleted.
  Its task and auditTrail assertions (`:734-738`) are unaffected and stay.
- `layers/core-api/knowledge/src/__tests__/knowledge-repository.au14-round2.integration.test.ts:208`
  asserts core-only rollback within one transaction and stays as it is — re-read and confirmed: no
  orchestration write shares that transaction.

**Count, so nobody has to re-derive it:** five shipped suites were checked and four invert, so four
are rewritten — `agent-work-intent-production`, `agent-and-team-creation-atomicity`, `handoff-to`
and `handoff-protocol`. The fifth, `knowledge-repository.au14-round2`, is genuinely core-only and is
left untouched.

## 3.2 How a caller acquires the port — one instance per composition, never an ambient one

Today a caller resolves the transport from a module-level mutable variable
(`getRegisteredAgentOrchestrationTransport()`, `agent-orchestration-port-composition.ts:447-462`),
filled once at boot by `create-server.ts:834` and once per test app by
`__testing__/test-utils.ts:101`. That predates AU31 (it arrived with the seam's read side) and
with two request-path readers it was survivable. AU31 makes it untenable, and the wave-A builder
proved it: `agent-run-admission-reactions.ts` and `assistant-turn-coherence-trigger.ts` fire from
`EventBus` reactions, and the service-lane fixture registers those reactions on the bare
`{ db, eventBus }` shape *before* any app exists (`__testing__/test-fixtures.ts:38-45`), so the
handler resolves whatever app some other test registered last, or throws. That is not a test
artifact — an ambient mutable global as the seam's acquisition path is the same class of coupling
this work package exists to delete, and it makes the seam untestable in the one lane that
exercises reactions.

**The contract (locked).**

1. **The port is a value, passed in.** Core builds exactly one `AgentOrchestrationPort` per
   composition with `buildAgentOrchestrationPort(transport)` and hands it to every consumer as an
   ordinary argument. One instance is enough because the port holds no per-call state and its
   credential is read at call time, not at construction
   (`agent-orchestration-port-composition.ts:151-163`); attribution rides the payload, not the
   transport (§3 clause 4), so there is no per-actor variant to build.
2. **Reaction registrars take it in the context they already take.** `registerCoreDomainServices`'s
   ctx (`service-bootstrap.ts:295`) gains a **required** `agentOrchestration: AgentOrchestrationPort`
   field, and `registerAgentRunAdmissionReactions` / `registerAssistantTurnCoherenceTrigger`
   (`service-bootstrap.ts:339,:416`) receive it. Required, not optional — an optional field is the
   ambient path with extra steps.
3. **Routes take it the way they already take `adapterPool`.** `sessions-routes.ts:62` and
   `tasks.ts:286` stop calling `getRegistered…()` per request and receive the port from the app's
   options, alongside the handles `app.ts` already threads.
4. **The composition root owns the transport, and owns the construction cycle.** Core's app needs
   the port; the port's in-process transport needs an app to send the request to. Two facts make
   that app unavailable at the moment either layer boots, and neither has anything to do with boot
   order — agent-orchestration in fact boots *first* today (`create-server.ts:692`, before
   `bootCoreApi` at `:712`), and `resolveModel` comes from `@hyperidle/shared`
   (`create-server.ts:105`) wrapped application-side, so orchestration's boot consumes nothing core
   produces. The two real reasons: (a) the transport targets the **composed** app, the one carrying
   the `/api` prefix (`create-server.ts:812,:834`), and that app does not exist until both layers
   have booted and been mounted; (b) in wave B the `CoreApiPort` over core's app and the
   `AgentOrchestrationPort` over orchestration's app are mutually dependent, so no ordering of the
   two boots can hand each its counterpart. The cycle is real in both directions and the answer is a
   local, not a global: the root writes the transport as an arrow closing over a root-local `let`
   that it fills once the composed app exists —
   `const transport: AgentOrchestrationTransport = (req) => composed.fetch(req);`. It must be the
   composed app, not orchestration's bare one, for the same prefix reason clause 6 spells out.
   Resolution is at call time, the binding is per composition, and a second composition in the same
   process cannot see the first's. A call before the binding is filled throws the same named error
   the singleton throws today, minus the cross-test bleed.
5. **The two module-level functions are deleted**, along with every `getRegistered…()` read:
   `registerAgentOrchestrationTransport` and `getRegisteredAgentOrchestrationTransport`
   (`agent-orchestration-port-composition.ts:447-462`). Nothing reads a module-level mutable value
   for the seam afterwards, and reintroducing one under any name is a review failure, not a
   suppression.
6. **The service lane gets the same value, built the same way.** The `{ db, eventBus }` fixture
   gains an `agentOrchestration` port built over an in-process transport onto **the seam's backing
   surface only** — agent-orchestration's own app over the same `db` — not the composed core +
   orchestration app with its middleware stack. A reaction test therefore still asserts a real
   effect on a real database through the real route, and no test needs an `app` fixture to do it.
   **The path base is the part that will bite:** orchestration's app mounts its seam routes at
   `/agent-orchestration/...` with **no** `/api` prefix (`layers/agent-orchestration/src/app.ts:57,
   :60`); the prefix is added only by the application's `/api` router (`create-server.ts:814`), and
   the port client issues `/api/agent-orchestration/...` (`SEAM_PLACEHOLDER_BASE_URL`,
   `agent-orchestration-port-composition.ts:132`). So the fixture must mount orchestration's app
   under `/api` in a throwaway Hono instance (or strip the prefix in the transport) — a transport
   bound straight to the bare app answers 404. Also worth saying plainly: this fixture transport
   deliberately skips the middleware stack the production transport goes through (auth, fail-closed),
   so a reaction test proves the route's effect, not the door's authentication.
   `createTestApp` stops registering a transport (`__testing__/test-utils.ts:101` is deleted) and
   hands the port in like production does.
7. **`CoreApiPort`'s twin singleton is untouched here, and no new one is added.** The same
   acquisition rule applies to it, and wave B applies it when §2.5 moves that construction with the
   tool stack; its current readers are all on the request path with no reaction lane, so nothing in
   wave A depends on it. This is not a carve-out from a boundary rule — the `CoreApiPort` singleton
   is not a cross-layer import, and no rule key or AC covers it.

**Owning leaf:** the new **A0** in §12, ahead of A1 and A2, because every reaction conversion in
A2 depends on it. Wave B changes nothing about the contract: §5.2's `bootCoreApi` absorbs the same
construction in the same shape.

## 4. The composition handoff — the spelling law, the census's actual state, and its enforced home

The whole of §5/§6 rests on capabilities produced by one face being passed by the application into
another face: the execution adapter bundle into `bootAgentOrchestration` (§2.4, §6);
`resolveModel`, `upgradeTokenStore`, middleware and registrars out of `bootCoreApi` (§5.2). The
first draft asserted this was "the face's declared composition contract (clause 3)" with "the
census's DI rule unchanged" — an assertion the enforced code contradicts:
`governance-model.ts:265-290` has no face-content carve-out, and `layer → layer (other) [di]` is
forbidden **generatively** — clause 6 (`governance-model.ts:266-290`) decides it; `decided-rules.json`
carries no literal row for the group **[N5]**, and the group has no key in
`governance/rule-severity.json`, so it is already at `error`. This section replaces the assertion with what the census
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
   in another layer's boot argument list. Probe A shows this side needs no new rule: the DI group
   the spelling actually hits — `layer → layer (other) [di]` — has **no key in
   `governance/rule-severity.json`**, so it is at `error` and the forbidden spelling fails the build
   today, mid-build, with both packages named. Re-executed on the rebased tree at `59b9299a`:
   still `ERROR [crossing-di]`, exit 1. **[N2]** Stated precisely, because it does not generalise:
   a DI group that still *has* a `warn` key (e.g. `framework → layer [di]`, §2.5) is reported but
   not build-fatal until this work package deletes its key. One respelling
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
`application → service [import|manifest|di]` is at `error` the moment this WP deletes those three
keys from `governance/rule-severity.json` (AC #3), while R1–R3 (§7) plus the shrunken export maps stop the faces laundering service symbols
outward. After this WP the only values a composition root *can* pass are face-produced or
environmental — exactly the set the reading declares to be composition.

**The enforced home (founder-gate item §13.3; replaces the first draft's "clause 3 reading").**
Two artifacts, both landing in wave B4, both ratified at the gate per
`governance/README.md:137-139`:

1. **An attack/control pair on the existing `crossing-di` rule** in
   `scripts/lib/governance-attacks.ts` (property 2, `governance/README.md:109-124`): probe A's
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
| `services/core-api-port-composition.ts`, `services/agent-orchestration-port-composition.ts` | port client construction splits by consumer: core's outbound `AgentOrchestrationPort` client stays core-side (it is core's door out); the `CoreApiPort` client construction the tool stack needs moves with the tool stack, typed against `@hyperidle/api-contract` only. **The transport is no longer registered in a module-level variable** — the composition root builds it and the port is handed to consumers as a value (§3.2); `registerAgentOrchestrationTransport`/`getRegisteredAgentOrchestrationTransport` are deleted |
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
   [api]` + `application → MCP router [mcp]` keys leave `governance/rule-severity.json`.
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
     the final entry list lands with the build). Deleted: `./service-bootstrap`,
     `./services/*`, `./ws-connection-hub`, `./ws-subscribe-authorizer`, `./routes/*`,
     `./session`, `./routines`, **`./test-utils`** (development content on a production face —
     requirements §3.5; zero external consumers [P5]).
   - `agent-orchestration`: `.` (already face-shaped, `src/index.ts:19-23`).
   - `agent-execution`: `.` (the new boot).
   Node's exports encapsulation then makes a deep service-path import fail to resolve at all —
   the cheapest, least-gameable teeth.
2. **Three new governance-lint rules** (census rules over the existing graph; each with a
   positive attack + control twin, per `governance/README.md:109-124` property 4):
   - **R1 `layer-exports-resolve-inside-the-layer`**: a layer manifest `exports` entry may not
     resolve into a nested service package. *Attack:* mutate `layers/core-api/package.json` to add
     an entry pointing into `layers/core-api/knowledge/src/…` → expect finding. *Control:* the
     surviving face entries.
   - **R2 `service-values-do-not-escape-the-face`**: in the layer root package's own modules
     reachable from its `exports` map (reachability stops at a package boundary — service
     packages are judged by the other two rules), matching specifiers **by resolved module**
     exactly as R1/R3 do, so a relative path into a service directory is the same violation as
     the package specifier **[D3]** — a value imported from a service module may not reach the
     module's export surface.

     **The whole rule, in a paragraph.** Four export forms carry a value out: `export … from
     "<service>"` (named clause, `export *`, `export * as ns`), `export { local }` with no
     specifier, `export default <expr>`, and an exported `const`/`let`/`var`. The rule reads the
     exported expression through object and array literals, spreads, parens, `as`/`satisfies`
     and call arguments, and through top-level declarations used as aliases, transitively. A
     service symbol found anywhere in that reach is a violation, reported at the symbol's line
     with the binding name and the service specifier. **One exemption, positional, never
     named:** a bare service identifier in direct callee position of a call or `new` — calling a
     service function *produces* a value, and a produced value escaping is composition (the §4
     law's own shape); a property-chain callee is not exempt.

     **What R2 deliberately does not read.** The founder's ruling at the concept gate, verbatim:
     *"lets avoid overengineering. we don't need to be able to catch every exotic catch, linting
     is engineering guidance not protection against malicious actors."* So R2 does not read
     function-like bodies (the sanctioned face content **is** a bag of port-op arrows over the
     layer's own services, so a body that calls a service is what a correct face looks like —
     separating a launder body from a boot body would take an allowlist, which is banned),
     class/enum/namespace members, or statements that mutate an already-exported object
     (`api.tool = svc` and its variants), aliases of such objects, globals, or dynamic
     `import()`. R2 exists so the plain re-export and deps-bag spellings — the ones a developer
     writes by accident when a face needs "just one more thing" from a service — fail the build.
     The boundary itself does not depend on R2: it holds by acquisition ([P11]).

     **Executed** ([P12], four runs, verbatim in
     `probes/p12-r2-escape-predicate/outputs.txt`; the prototype runs on the census's own parser):
     eleven attack spellings each flag exactly once — the founding re-export shape, `export *`,
     `export * as ns`, the two-line respelling, an exported binding holding the symbol, an
     exported deps bag, one local alias hop, a default-export aggregate, the symbol as a call
     argument, a destructured hop off a namespace import, and exported destructuring off a
     default import (run 1); the six controls are clean — the positional exemption, the
     non-escaping wiring bag, a type-only re-export, an own-module re-export, the port-op arrow
     bag, and a framework package (run 1); the three planned-legal end-state sites (`app.ts`,
     `service-bootstrap.ts`, `tool-handlers-bindings.ts`, whose §5.3-relocated content is
     byte-identical) are clean (run 2); the rule's founding target
     (`layers/core-api/src/index.ts:15`) flags while the type-only export on the line above it
     stays clean (run 3); and the real pre-end-state surfaces still flag — the deep-entry barrels
     §7.1/§6.1 delete or replace and the three exported deps bags §2.1/§2.5/§5 reshape to the
     arrow style (run 4).
   - **R3 `deep-imports-die-with-their-entries`**: an import specifier of a layer package that
     resolves to a module absent from its `exports` map is a violation with the file and
     specifier named (satisfies validation scenario 2's error shape even where the TS resolver
     would also fail). *Attack:* overlay a file importing
     `@hyperidle/core-api/services/run-orchestration-composition` after the entry is gone →
     finding. *Control:* importing `./boot`.
   - `decided-rules.json`: **no verdict flips.** `application → layer [import]` stays allowed —
     the face split lands as the three rules above plus the shrunken export maps, so the 12
     instances D4 counted (10 deep + 2 already-face-shaped boots, **[D4]**) converge on
     face-shaped without a row change. The instance counts move; the founder ratified the rule
     texts, the narrowing, and the attack/control set at the gate (§13.1).
   - **Naming hygiene for every attack/control case this WP adds** (R1–R3's and §4/§13.3's
     `crossing-di` pair alike) **[N4]**: case ids, overlay paths, and `detail` strings name the
     spelling under test, never the work package — work-package identifiers live in
     `.pipeline/**` only, never in rule ids, JSON keys, filenames, or any field of an enforced
     artifact under `governance/` or `scripts/` (founder ruling).
3. **What R2 catches and what it does not — stated plainly, because a lint rule is guidance,
   not a wall.** Four earlier versions of this section each claimed a form of completeness and
   each was refuted by a one-line spelling. The founder closed that pursuit at the concept gate,
   and this is the statement the founder ratifies at §13.1:

   > R2 reads a module's export declarations. Every service symbol that a value-carrying export
   > form names, holds, aggregates, or reaches through a top-level alias is a violation, with the
   > single positional exemption for a service identifier in direct callee position. R2 does not
   > read function-like bodies, class/enum/namespace members, statements that mutate an
   > already-exported object, aliases of such objects, globals, or dynamic `import()`. A
   > developer determined to route a service symbol out through the face can, and that is
   > expected of a lint rule: R2's job is to stop the accident; judging the deliberate is
   > review's job.

   Three consequences worth naming, none of them a defect:
   - **Function-like bodies are the largest thing R2 does not read, and that is by design.** The
     end state's own sanctioned face content is a bag of port-op arrows over the layer's
     services, so a body that calls a service is exactly what a correct face looks like.
     Distinguishing a launder body from a boot body would take an allowlist, which is banned.
   - **Non-escaping module-scope wiring is legal, not missed** (`app.ts:213`,
     `service-bootstrap.ts:175`): no face consumer can obtain those symbols except through a
     function body, and firing there would flag this WP's own end state — round-2 **B4**'s
     finding, accepted in full and pinned by control C2.
   - **Standing critique blocker B7 is out of scope by the ruling, not fixed by code.** Round 5
     found seven spellings that attach a service symbol to an already-exported object. Every one
     of them sits in the class R2 no longer reads. The founder's reason, verbatim: *"keep it
     simple and focused no overengineering for things that don't matter in reality. hyperidle is
     a productivity tool without real users and we are currently cleaning up the architecture."*
     Nothing is built for it, and no new completeness claim replaces it.

   Besides R2, three real things hold what sits on a face, and they are recorded in the rule's
   `why`: (a) the export map is small, enumerated, founder-ratified, and changes only through
   review of a manifest diff; (b) `knip`/`knip:production` deletes any face export without a
   composition-root consumer (no production export only tests consume); (c) the reviewer lens
   judges the face content list. No allowlist and no suppression path exists in any of them.

---

## 8. Ownership overlaps with AU29 — both ruled explicitly, in opposite directions

**Overlap 1 — `application → db:util [import]`: AU29's, and AU31 must not disturb it.** One site: `create-server.ts` imports `resolveProfile` (`:77`, called `:418`). Ruling 12.3 moves
the util functions out of `db`, and their **destination is AU29's own refine question** — AU31
choosing a home would decide another WP's noun. Therefore: **AU29 owns clearing this group.**
AU31's create-server rewrite keeps the file path (`applications/remote-server/src/create-server.ts`)
and the `resolveProfile` import exactly as they are, so **AU31 leaves the
`application → db:util [import] production` key in `governance/rule-severity.json` untouched** — it
neither deletes it nor adds a site under it. If AU29 lands first, the site dissolves under whatever
home AU29 ratifies and AU31 rebases onto it. Recorded for AU29's planner in §13.
Consequence for AC #5: AU31's "every key gone" claim covers its **14 keys**, explicitly minus
this one — matching the plan's own footnote that the group is subject to this ruling
(`requirements.md:182`).

**Overlap 2 — `framework → layer [di]`: AU31's, and AU29 must not claim it.** AU29's AC reads
"Every `framework → *` … production entry is gone" (`work/AU29/plan.md:50`), which literally
covers this group; AU31's `progress.json` rule-key scope claims it too. Ruling: **AU31 clears
it.** The single site is `tool-provider-bindings.ts:64-66` — a file AU31 deletes as part of the
§2.5 tool-stack rework — and the wire has no db- or EventBus-shape that AU29's mechanisms could
dissolve: AU29's genuine `framework → *` groups are the `framework → EventBus` and
`framework → db:table` ones [P1]. AU29's planner must read its AC's `framework → *` quantifier as
excluding this group: if AU31 lands first the key is already gone; if AU29 lands first it
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
| 1 — no layer names another layer/its services (imports + manifest) | §2 verdicts + §5 relocation + §2.7 buffer + §2.4 core-ui row | `npm run lint` governance pass: the 4 keys deleted from `governance/rule-severity.json` → rules at `error`; validation scenario 2 covered by R3 + existing crossing rules |
| 2 — no cross-layer DI; API/MCP/bus only | all 14 DI sites have named mechanisms: the 9 `service → service (other layer)` sites (8 files: `app.ts:494`, `bets.ts:684` — 2 sites, `tasks.ts:254`, `threads.ts:1678`, `org.ts:306`, `service-bootstrap.ts:470`, `agent-run-admission-reactions.ts:115`, `create-server.ts:510`) convert with their imports (W2=W7); the 2 `application → service` adapter-pool wires become §4-law face handoffs (§5.3, §6); `service → layer (other)` site 1 (`service-bootstrap.ts:330`) relocates in-layer (§5); the two `tool-provider-bindings.ts` wires — `framework → layer` and `service → layer (other)` site 2 — dissolve per §2.5, probe-proven [P11] | the 4 DI keys deleted → `wire-within-one-layer` at `error` for those groups; §4's attack/control pair pins the handoff reading; validation scenario 3 |
| 3 — applications compose faces only; no service, no other application | §5.3 + §6 + §2.7 relocations; manifest end states | the `application → service [import|manifest|di]` + `application → application [import]` keys deleted; R1–R3 at `error` |
| 4 — MCP dialled only by harness-owning layer + harness; serving layer hosts the door | §6 | the `service → MCP router`, `application → MCP router`, `service → agent-execution [api]` keys deleted; attack case for the dial rule already exists in the harness table |
| 5 — every owned key gone, rules fail on reappearance | the **14 keys enumerated in §12.1** (§8 carve-out recorded) | the `governance/rule-severity.json` diff in the pull request that clears each key's last site; from that commit the key is absent, so the rule is at `error` and a reappearance fails the build |
| 6 — **MOOT: satisfied upstream, nothing built here** | AU32 (PR #464, base `59b9299a`) already deleted `governance/baseline.json`, `scripts/governance-baseline.ts` and the `--adopt` path, unconditionally rather than as a last-sibling contingency; the successor obligation — "and it never comes back" — is discharged by the registered `no-per-file-allowances` rule. AU31 builds **no** mechanism for this AC and performs no end-of-build check | `git log -1 --format=%H -- governance/baseline.json` shows the deleting commit; the file is absent on the live tree; `no-per-file-allowances` is registered and break-tested, so reintroduction under any name fails the build. Full disposition: §13.11 |
| 7 — verify green + one real agent run end to end | §11 | executed, recorded output |

**Test strategy per lane:** every new seam op gets service-lane integration coverage
(`*.integration.test.ts`, real DB + composed app fixture — the ~240-fixture `disposeApp` shape is
preserved by §5's boot design, `app.ts:520-533`); the relocated composition keeps its existing
behavioral suites moving with the files; **each of the nine relinquished windows gets a targeted
test** (seam-failure → the operation fails and the core row is committed; retry → idempotent
success), and the shipped suites that assert the pre-ruling guarantee are rewritten to assert the
named window instead — the four inverted files listed at the end of §3.1 (a fifth file there,
`knowledge-repository.au14-round2`, was re-read and is unaffected), none of them dropped and none of
them allowed to drive the code back to the transactional shape; the reaction lane gets its port
from the fixture, not a global (§3.2 clause 6); R1–R3 land with their attack + control cases (the
build fails without them). No new test harness is invented.

**Development-world constraint — AU31 may not introduce a single development violation, and there
is no `warn` key to absorb one.** AU32 cleared the development world to **zero** (live linter on the
rebased tree: `221 production + 0 development known violation(s) at warn`), and every development
rule is now at `error` because no development key remains in `governance/rule-severity.json`. So a
development-world crossing this work package writes fails the build *at that commit* — unlike a
production one, which merely warns. Two clauses follow, and they bind every test wave A and wave B
write:

1. **Arrange only states production can actually produce.** This is the criterion AU32 enforced, and
   the rule is `write-the-whole-row-set` (`scripts/lib/governance-model.ts:377-389`): a fixture that
   writes a table directly and leaves a **companion row** unwritten — the row the owning service
   always writes alongside it — is forbidden, with the message "writing X without Y builds a state
   production cannot produce". The companion groups are derived from the owning services' own
   writers (`buildCompanionGroups`, `scripts/lib/crossing-detectors.ts:366`), so the fixture is
   judged against what the owner really does, not against a list. Concretely, in AU32's own closure:
   an arranged `teams` row needs its `teamMembers` companion; an arranged `knowledgeItems` row needs
   its `knowledgeAppProjection` companion. The three ways out, in order of preference, all used by
   AU32: **(a)** write the arrangement through the owner's public route or service call (AU32 routed
   one fixture's projection through `POST /api/knowledge` instead of a second raw write); **(b)** use
   or add a parametrized seeder that mirrors the owner's writer (AU32 added `seedTeam` /
   `seedKnowledgeItem` to core-api's `_helpers.ts`); **(c)** complete the companion write inline,
   immediately after the row it belongs to. Never a suppression, never a carve-out — there is no
   mechanism for one.
2. **Do not test a mechanism production does not have.** AU32 deleted nine tests that probed
   deletions no production code path performs, on the ground that a test arranging an unreachable
   state proves nothing. The same bar applies to every test this work package writes for a
   relinquished window (§3.1): the failure must be one the production path can really reach.

The AU32 companion rule has one blind spot worth knowing before writing a fixture: the write set is
credited **per file**, so one companion write anywhere in a file can mask a sibling arrangement in
the same file that lacks one (AU32's own review round 1 found eight such sites in one file). Balance
per arranged entity, not per file.

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
green on the same tree, with every key this work package cleared already deleted from
`governance/rule-severity.json` (so those rules run at `error` in that same run) and every detector
floor recomputed per §12.2.

---

## 12. Implementation leaves, ownership, order — and the split recommendation

**Recommendation: split into two work packages** at the mechanism/composition boundary — the
plan anticipates this (`plan.md:27`). Each half is independently shippable with `verify` green
and a live run, and they touch nearly disjoint file sets. The orchestrator owns the live schedule
and the registration; if it keeps one WP, the same two waves run sequentially on one branch.

**WP/Wave A — "Core converses only through the door"** (writes: `layers/core-api/src/**` routes
+ reactors + `app.ts` + `service-bootstrap.ts`; **the four core service packages that hold a
cross-boundary write inside their own transaction — `layers/core-api/work/`,
`layers/core-api/policy/`, `layers/core-api/routine/`, `layers/core-api/review/` (§3.1 sites 6–9)**;
`layers/agent-orchestration/src/**` routes + services; `framework/api-contract`; the two port
compositions; **the one line in `applications/remote-server/src/create-server.ts` that registers
the transport, which becomes a value the root passes (§3.2)**; the two development-world fixtures
`layers/core-api/src/__testing__/test-utils.ts` and `test-fixtures.ts`;
`layers/core-api/package.json` row for `filesystems`; `layers/core-ui/package.json` respelling):
- A0. **Port acquisition (§3.2)** — build one port per composition, hand it to routes and to the
  reaction registrars, delete the two module-level transport functions and every
  `getRegistered…()` read, and give the `{ db, eventBus }` fixture its own port over
  agent-orchestration's app. Nothing else in A2 can land first: every reaction conversion depends
  on it, and converting a reaction against the global is what stranded wave A.
- A1. Port + route contracts (§3) in `api-contract` and orchestration's app, with service-lane
  tests (red first). Includes the team-defaults pair added in §3 clause 2; excludes
  `runs.requestTermination`, struck there.
- A2. Convert the conversation call sites (§2.1a, §2.2, §2.3 verbs, §2.6) — imports and injections
  die together per file; **all nine relinquishments (§3.1) land with their targeted tests, the two
  in-transaction reads are hoisted, site 7's run-end write is reordered ahead of its transaction,
  and the four shipped suites §3.1 names as inverted are rewritten in the same commits as
  the sites they cover**; site 8's failed submit marks its run `error` through the routine service
  (§3.1, one `catch` and one state write — no machinery); the backfill reorder + owner-stamp land
  here.
- A3. Manifest rows whose last import cleared. **Wave A deletes no key from
  `governance/rule-severity.json`** — §12.1 shows why: every one of AU31's 14 keys still has a live
  site after wave A. Wave A's governance obligation is only the recomputed floors (§12.2).
  Dependency: A0 → A1 → A2 → A3. After A: core-api's remaining cross-layer imports are exactly the
  composition files plus the two conversions moved to B2 below — wave B's inventory, stated so the
  reviewer can check the seam is complete.

**Two conversions move from A to B, because an op belongs in the wave whose files consume it.**
Neither is a deferral by judgement; both follow from §1's "no production export that only tests
consume", and the wave-A builder was right to stop:
- **§2.5's `CoreApiPort` workflow ops** (capture / consume-grant / record-outcome). Today
  `services/tool-provider-bindings.ts` and `@hyperidle/review` are both inside core-api, so the
  import is in-layer and legal — there is no crossing to remove yet. The crossing appears when B2
  deletes that wrapper and moves the dispatch into `@hyperidle/tool-handlers`, which is also the
  first moment anything consumes the ops. They land in **B2**.
- **§2.7's knowledge-writeback ops.** The wire is live today
  (`create-server.ts:545-562` injects `@hyperidle/knowledge` functions into
  `run-orchestration/src/writeback-processor.ts`), but both ends of the change — an application
  file and a `layers/agent-orchestration/run-orchestration/` file — sit outside wave A's write set,
  and the processor's knowledge port is what consumes the ops. They land in **B2** with the
  processor. (Nothing about the writeback needs §3.1's treatment: the processor calls its port with
  a pooled handle, never inside a transaction.)

**WP/Wave B — "The applications compose faces"** (writes: `layers/agent-execution/**`,
`layers/agent-orchestration/src/boot.ts` + `layers/agent-orchestration/tool-handlers/**` +
relocated composition files, `layers/core-api/src/boot.ts` + deleted subpath modules +
`package.json` export map, `applications/**`, `framework/shared/http` helper, `scripts/lib` +
`scripts/rules` + `governance/*`):
- B1. Execution face + MCP dial relocation + `RemoteWorkerClient` + buffer relocation (§6, §2.7).
- B2. Orchestration boot absorbs the composition (§5.1); the tool stack dissolves per §2.5
  (dispatch moves `harness-registry` → `tool-handlers`, wrapper file deleted, `returnStatusTool`
  + enforcement registry onto the adapters bundle); **the `CoreApiPort` workflow ops (§2.5) and
  knowledge-writeback ops (§2.7) land here, with their first consumers**, and the `CoreApiPort`
  client construction that moves with the tool stack adopts §3.2's acquisition rule; core boot
  absorbs its own (§5.2); `session.ts` deleted; eval repointed.
- B3. Applications rewritten (§5.3); desktop root; mount helper; manifests + export maps shrink
  to faces.
- B4. Governance: R1–R3 + attacks + README/`decided-rules` notes; the §4 attack/control pair on
  the `crossing-di` rule; **the deletion of all 14 keys from `governance/rule-severity.json`
  (§12.1)**; the recomputed detector floors (§12.2); live-run evidence + full verify. Nothing here
  is conditional and nothing is deferred — AC #6's old conditional branch is moot (§13.11).
  Dependency: B1 → B2 → B3 → B4. B depends on A (the relocated composition must not carry
  seam-shaped core imports with it; `service-bootstrap.ts` is the one file both waves touch).

### 12.1 The 14 keys AU31 deletes from `governance/rule-severity.json`, and which wave deletes each

This is the exact set of lines AU31 removes. Each is a key in the `severity` object of
`governance/rule-severity.json`, spelled with its `production` suffix — the whole line, including
its `: "warn"` value, is deleted. Site counts are the live linter on the rebased tree
(`npx tsx scripts/governance-lint.ts`, base `59b9299a`: 221 production + 0 development at warn;
AU31's share is 92 sites, matching this plan's existing "92 + 1 contested = 93" arithmetic
unchanged — **the scope did not move**).

**The load-bearing result first: wave A deletes nothing; wave B deletes all fourteen.** Every key
still has at least one live site after wave A, so there is no key wave A could legally delete.
Deleting a key early puts its rule at `error` while violations remain and breaks the build at that
commit — that is the failure mode to avoid, and here it applies to the whole set.

| # | line to delete from `governance/rule-severity.json` | sites | cleared in wave A | cleared in wave B | key deleted in |
|---|---|---|---|---|---|
| 1 | `"layer → service (other layer) [import] production"` | 36 | **26** — `app.ts:8,11`; the 14 route sites (`agent-profile`, `agents`, `assistant`, `bets`×2, `filesystems`, `knowledge`, `org`, `sessions-routes`×2, `tasks`, `teams-routes`, `threads`, `users`); `service-bootstrap.ts:37`; the 9 reactor/binding sites (`agent-run-admission-reactions:41`, `assistant-turn-coherence-trigger:50`, `durable-agent-queue:83`, `policy-bindings:38,39`, `routine-scheduler-bindings:18,39,40`, `work-session-started-reactions:49`) | **10** — `run-orchestration-composition.ts:3,5,11,22`; `tool-handlers-bindings.ts:31,32`; `tool-provider-bindings.ts:20,21`; `session.ts:9,15` | **B** (spans both) |
| 2 | `"application → service [import] production"` | 15 | 0 | 15 — `create-server.ts` ×13, `remote-server/index.ts:23`, `desktop/boot-server.ts:5` | **B** |
| 3 | `"application → service [manifest] production"` | 12 | 0 | 12 — `applications/remote-server/package.json` | **B** |
| 4 | `"service → service (other layer) [di] production"` | 9 | **8** — `app.ts:494`, `bets.ts:684,688`, `org.ts:306`, `tasks.ts:254`, `threads.ts:1678`, `service-bootstrap.ts:470`, `agent-run-admission-reactions.ts:115` | **1** — `create-server.ts:510` | **B** (spans both) |
| 5 | `"layer → service (other layer) [manifest] production"` | 7 | **2** — `core-ui`'s `harness-registry` row (§2.4 respelling), `core-api`'s `filesystems` row | **5** — `core-api`'s `agent-run-config`, `harness-registry`, `run-orchestration`, `session-requests`, `tool-handlers` rows, each held open by a wave-B import in row 1 | **B** (spans both) |
| 6 | `"application → application [import] production"` | 2 | 0 | 2 — `desktop/boot-server.ts:16`, `desktop/main.ts:20` | **B** |
| 7 | `"layer → layer (other) [manifest] production"` | 2 | 0 | 2 — `agent-orchestration/package.json` (declares `agent-execution`), `core-api/package.json` (declares `agent-orchestration`) | **B** |
| 8 | `"application → service [di] production"` | 2 | 0 | 2 — `desktop/boot-server.ts:45`, `remote-server/index.ts:39` | **B** |
| 9 | `"service → layer (other) [di] production"` | 2 | 0 | 2 — `service-bootstrap.ts:330` (relocates in-layer with §5.2's `bootCoreApi`, B2), `tool-provider-bindings.ts:60` (§2.5, B2) | **B** |
| 10 | `"layer → layer (other) [import] production"` | 1 | 0 | 1 — `agent-orchestration/src/boot.ts:29` (buffer relocation, B1) | **B** |
| 11 | `"framework → layer [di] production"` | 1 | 0 | 1 — `tool-provider-bindings.ts:65` (§2.5, B2) | **B** |
| 12 | `"service → agent-execution [api] production"` | 1 | 0 | 1 — `provisioner.ts:1349` (B1) | **B** |
| 13 | `"application → MCP router [mcp] production"` | 1 | 0 | 1 — `create-server.ts:566` (§6) | **B** |
| 14 | `"service → MCP router [mcp] production"` | 1 | 0 | 1 — `provisioner.ts:1327` (B1) | **B** |

**Three keys span both waves — rows 1, 4 and 5** (the only rows with a non-zero wave-A column).
They are called out because they are the ones a builder is tempted to delete when wave A's linter
output stops mentioning most of their sites. Do not: read the count off the live linter, and delete
a key only when that key reports **zero** sites.

**One key AU31 must NOT touch, already ruled (§8):** `application → db:util [import] production`
stays in the file — it is AU29's, and its single site (`create-server.ts:77`, called `:418`) is one
AU31's rewrite preserves byte-for-byte. The mirror-image ruling: AU31 *does* own
`framework → layer [di] production` (row 11) and deletes it, despite AU29's literal
`framework → *` AC quantifier appearing to cover it.

**Wave-B ordering inside B4.** Delete the keys in the same commit as the last site each covers,
or — if several land together — in one commit at the end of B4 with the linter reporting zero for
all fourteen first. Either satisfies the mechanism; what is forbidden is a commit where a key is
absent and a site under it is live.

**The wave-A residual — the wave-A column against the live tree, item by item.** The table above
promises wave A **36 sites** (26 import + 8 DI + 2 manifest). The live linter on this branch
reports **27 cleared** (20 import, 7 DI, 0 manifest) and nine still open. Nothing in the table is
wrong: the arithmetic holds, no site changed wave, and no key deletion moves. The gap is unfinished
work plus one decision the wave-A builder correctly refused to improvise (§2.8). It is recorded
here so nobody later reads "36" as achieved.

Snapshot: `npx tsx scripts/governance-lint.ts`, branch `backend/AU31-layer-composition-boundary`,
`a8227d34` — PASS, 194 production + 0 development violations;
`layer → service (other layer) [import]` **16** across 10 files;
`service → service (other layer) [di]` **2**; `layer → service (other layer) [manifest]` **7**.
Ten of the 16 imports and one of the 2 DI wires are the table's wave-B column and are supposed to
be live. The other nine are these. Line numbers below are the **live** ones; wave A's edits shifted
several off the table's pre-wave-A spellings (`app.ts:8` is now `:9`, `service-bootstrap.ts:37` is
now `:38`).

| open site | row | owner |
|---|---|---|
| `routes/threads.ts:40` — `enqueueWorkIntent` from `session-requests` | 1 | **wave A** — site 5 only half converted: the intent-recording use went through the port, this import did not |
| `routes/threads.ts:1697` — `intentRecorder: { record: enqueueWorkIntent }` | 4 | **wave A** — dies with the line above; §12's A2 requires the import and the injection to die together, in one file |
| `service-bootstrap.ts:38` — `startLifecycleProjectionDrain` from `session-requests` | 1 | **wave A** — the file both waves touch, so this must not be left for B |
| `services/durable-agent-queue.ts:83` — `session-requests` | 1 | **wave A** — named in row 1's own wave-A list |
| `src/app.ts:9` — type-only `AdapterPool` / `McpToolBridge` / `SandboxAdapter` | 1 | **wave A** — §2.4's first bullet, the `AppOptions` retype-and-delete. Already fully specified there; it was simply absent from the builder's task list, not undecided |
| `routes/agents.ts:24` + `routes/assistant.ts:18` — `validateAgentConfig` | 1 | **wave A** — **§2.8**, the decision this block was written alongside |
| `layers/core-api/package.json` — `@hyperidle/filesystems` row | 5 | **wave A**, now unblocked: no production file under `layers/core-api/` imports `@hyperidle/filesystems` any more — only two integration tests do |
| `layers/core-ui/package.json` — `@hyperidle/harness-registry` row | 5 | **wave A** — §2.4's last bullet, still open; only `core-ui/__scripts__/*` import it |

**How a manifest row "clears".** Both open manifest rows respell `dependencies` →
`devDependencies`; neither row is deleted, because development files still import the package. The
dependency **block** decides the world (`scripts/lib/repo-census.ts:445-450`,
`scripts/lib/crossings.ts:199-201`), and `layer → service (other layer) [manifest]` is forbidden in
production and allowed in development (`governance/decided-rules.json`). §2.4 already spells this
for core-ui; core-api's `filesystems` row takes the identical one-line diff. The same mechanism
applies to core-api's five wave-B rows when each one's last production import goes — including
`agent-run-config`, whose tests keep it resolvable.

**After these nine close**, row 1 has exactly 10 sites left and row 4 exactly 1, all in the wave-B
column: `run-orchestration-composition.ts:3,5,11,22`, `tool-handlers-bindings.ts:31,32`,
`tool-provider-bindings.ts:20,21`, `session.ts:9,15`, and `create-server.ts:510`. That is the
"After A" inventory §12 promised, stated as a number a reviewer can check with one linter run.

**Nothing here changes a key deletion.** Wave A still deletes zero keys from
`governance/rule-severity.json` — rows 1, 4 and 5 all keep live sites after wave A by design, and
rows 2, 3 and 6–14 are untouched by this correction. The instruction is unchanged: read the count
off the live linter, and delete a key only when that key reports zero.

### 12.2 Detector floors — recompute, never hand-edit, never lower

The detector floors in `scripts/governance-context.ts` (`DETECTOR_FLOORS`) survive AU32 untouched:
they are **magnitude tripwires on the census as a whole** — "did the crossing count for this kind
collapse, meaning the detector stopped measuring?" — not per-file counts, so
`no-per-file-allowances` has nothing to say about them and AU32's deletion did not reach them.
`floors-tight` fails the build when a floor drifts too far below live.

AU31 moves these counts a lot: converting cross-layer DI and imports into seam calls raises `api`
and lowers `di`/`import`. Wave A's builder already raised the `api` floor once, from 126 to 144
(`9f03c74a`, for wave A1's 15 new production routes). **Trust neither number.** The instruction for
both waves is mechanical:

1. Run `npm run governance:floors`. It prints, for every floor, the live count, the slack, the
   allowed slack, the band verdict, and **the value to write**.
2. Write exactly the value that command prints, in the same commit as the change that moved the
   count.
3. **A floor is never lowered to make a build pass** — the prohibition is written into the file's
   own header (`scripts/governance-context.ts:51`), and the reason is on the record: a stale floor
   once sat far enough below live that a deleted directory printed PASS over zero files for months.
   If a floor genuinely must come down because AU31 legitimately removed crossings, the command's
   printed value is the authority and the drop belongs in its own reviewable commit with the reason
   stated.

On the rebased tree as it stands, `npm run governance:floors` reports **20 floors, zero drift**
(`api`: live 161, declared 144) — so nothing needs writing *yet*. Re-run it at the end of each wave;
that "yet" is the whole point.

### 12.3 One more standing constraint for both waves

Zero development-world violations exist on this base and every development rule is at `error`
(§10's development-world clause). Any development file wave A or wave B writes — fixture, seeder,
integration test — that arranges a state production cannot produce fails the build immediately.
There is no `warn` key to fall back on and no per-file allowance to open one.

---

**Human gate — held, and the founder has ruled.** The founder reviewed the §13 list at the
concept gate and decided every open item; the rulings are recorded in §13's preamble, and the
R2-scope ruling is applied throughout §7 and [P12]. Nothing on the list is still open.

---

## 13. Founder-gate register: supersessions, ratifications, and handoffs

**The founder's rulings at the concept gate, applied above.** (1) **R2's scope is narrowed** —
lint is engineering guidance, not protection against a determined author: *"we don't need to be
able to catch every exotic catch."* §7 and [P12] are rewritten to the reduced rule and the
bypass-hunting apparatus is deleted; standing blocker **B7** is out of scope by this ruling rather
than fixed by code. (2) **Both supersessions are ratified** — items 2 and 5 below, with no extra
scaffolding. (3) **The relinquished atomicity is accepted** — items 4 and **9** below: the named failure
windows stand, and **no outbox or other durable mechanism is built**, explicitly rejected as
machinery for a failure that has not happened on a product with no real users. Item 9 records that
the ruling now applies to nine sites rather than the four item 4 lists. (3b) **The one site whose
residue was worse than a missing job — the routine scheduler — was raised separately, and the
founder ruled: add the error handling.** Catch the failed seam call, mark the run failed, let the
next tick re-fire the routine (§3.1; item 9(b)). One `catch` and one state write through the owning
service — still no outbox, sweeper or reconciler, and no change to the other eight sites. (4) **The two-WP
split is accepted** as §12 states it — waves A then B, sequential, each building and verifying on
its own. (5) **Narrowing `application → layer [import]`** to face-shaped imports is ratified as
part of the face definition (§7.2, `allowed`, 12 production instances).

1. **The face rule** (§7): the three rule texts, the per-layer final export maps, R2's
   attack/control set (eleven attacks, six controls — §7.2, executed [P12]), and the plain
   statement of R2's reach **verbatim as blockquoted in §7.3**: R2 reads export declarations;
   it does not read function-like bodies, class/enum/namespace members, mutation of an
   already-exported object, aliases, globals, or dynamic `import()`, and a developer determined
   to route a symbol out through the face can. Also ratified here: round-5 blocker **B7** (seven
   spellings that attach a symbol to an already-exported object) is **out of scope by the
   founder's ruling, not fixed by code** — nothing is built for it. The
   `decided-rules.json`/vocabulary change only a founder ruling may make
   (`governance/README.md:137-139`).
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
   decides it; `decided-rules.json` carries no literal row for the group, so there
   is no row to flip and none is added. The group also has no key in
   `governance/rule-severity.json`, so it is already at `error` — which is why probe A fails the
   build today and still did when re-executed at base `59b9299a`. This is the reading the whole of §5/§6 stands on.
4. **Relinquished atomicity** at `knowledge.ts:934` and `threads.ts:1463` (+ the two run-config
   write couplings), windows as named in §3.1. **Superseded in scope by item 9** — the mechanism the
   founder ruled is unchanged; the set of sites it applies to was undercounted here.
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
   stamping at submit (§3 clause 3) means an intent emitted before onboarding and drained after it
   provisions no connections where today's live resolution would. Accepted as the cost of the
   single port-side stamp — the empty-rows outcome matches today's no-owner case, but the
   *timing* of resolution does not, and the founder ratifies the delta, not only the mechanism.

9. **The atomicity ruling, applied to the sites the audit missed — and the one site that deserves
   a second look.** The founder ruled the *mechanism* (relinquish, name the window, build nothing).
   Applying that ruling to a corrected inventory is not a new decision, so §3.1's nine sites and one
   rule need no re-ruling. Three things in it do belong on the record:
   (a) **the count and the reason it was wrong** — four named, nine real, because the audit searched
   for function names and most of these sites call an injected dependency instead;
   (b) **one site's residue exceeded what item 4 describes — raised to the founder, and ruled.** At
   `routine-scheduler.ts:599` a failed submit would leave a `running` routine_run with no session,
   which makes that routine's coalescing guard report "previous run still in progress" forever and
   no reaper clears it — so the loss would not be "a queued job" but "this routine stops firing
   until someone clears one row". This was put to the founder as the one item worth a second look,
   and the founder **ruled: add the error handling** — catch the failure of the seam call, mark the
   run failed, and let the next scheduler tick pick the routine up normally. §3.1 specifies it: the
   `routine` service writes `outcome: "error"` + `endedAt` + `errorMessage` through its existing
   `updateRoutineRun` (`onlyIfRunning`), which is the same write the admission-failure path already
   performs for this row, then the failure propagates. Ordinary error handling — one `catch`, one
   state write, no outbox, saga, sweeper, reconciler, retry loop, table or other machinery. **No
   longer an open concern.** The other eight sites are unchanged: plain relinquishment, window named
   in code, nothing built;
   (c) **five shipped suites were checked; four of them assert the guarantee being given up** and
   are rewritten to assert the named window — `agent-work-intent-production`,
   `agent-and-team-creation-atomicity` (AU26 review W10's own fix),
   `handoff-to.integration.test.ts:354` and `handoff-protocol.integration.test.ts:664`. The last of
   those was undercounted in an earlier draft, which filed it as unaffected: it is `handoff-to`'s
   `toAgent` twin and asserts the same `session.state === "active"` / falsy `endedAt` that site 7's
   reorder gives up. The fifth suite checked,
   `knowledge-repository.au14-round2.integration.test.ts:208`, is genuinely core-only and stays as
   it is. Naming them here so the rewrite reads as the ruling being executed, not as tests being
   bent to make a build green.
   Also recorded: the one free lever used (site 7's run-end write moves ahead of its transaction,
   because that write has no safety net and its absence would consume an agent's only session slot
   forever), and the fact that in-transaction *reads* are hoisted rather than relinquished — a seam
   call inside an open transaction deadlocks the shared connection whether it reads or writes.
10. **The seam's port stops being acquired from an ambient global (§3.2)**, superseding the
   module-level `registerAgentOrchestrationTransport`/`getRegisteredAgentOrchestrationTransport`
   pattern the read side shipped with. One port per composition, handed to routes and reaction
   registrars as a value; the construction cycle between core's app and the seam's backing app is
   closed by a root-local binding, not a module variable. Recorded as a supersession because the
   pattern was a deliberate in-code decision; ratifying it costs nothing new — it deletes code and
   makes the reaction lane testable, which is what wave A needed and did not have.

11. **AC #6 is MOOT — satisfied upstream by AU32, and AU31 builds nothing for it.** The plan's
   sixth acceptance criterion, as originally written, made whichever of the four clearing work
   packages finished last responsible for deleting `governance/baseline.json` and the `--adopt`
   escape hatch in the same commit, and for making reintroduction under any name fail the build.
   **AU32 did all of it, and did it unconditionally rather than as a last-sibling contingency** —
   PR #464, merged as base commit `59b9299a`, which deletes `governance/baseline.json`,
   `scripts/governance-baseline.ts`, the `baseline-ratchet` rule, the `refuseGrowth` /
   `compareBaseline` / `liveGroups` machinery and the `governance:baseline` npm script, and replaces
   the whole mechanism with `governance/rule-severity.json`. The **successor obligation** — the
   "never comes back" half — is now discharged by a different artifact than this AC imagined: the
   registered rule **`no-per-file-allowances`**, which fails the build on a new file under
   `governance/`, a nested value under a severity key, a malformed rule key, or an undeclared flag
   on a governance CLI. It is registered in both `buildRules()` and `runLive()`, and carries an
   overlay attack pair plus a standalone shape-check attack, so property 4 of the break-test harness
   keeps it honest.

   **Disposition, stated so it is recorded rather than silently dropped:** AU31 designs, builds and
   verifies **nothing** for AC #6. There is no end-of-build conditional check, no deletion step, and
   no artifact of AU31's that references the deleted mechanism. Verification is a statement of fact
   about the base, not a build output: `governance/baseline.json` is absent from the tree, and
   `no-per-file-allowances` is registered and break-tested. `plan.md` — which is the authority here
   and is amended only by a maintainer — already carries this at `plan.md:52`; PR #464 rewrote that
   line and the AU29/AU30/AU31 operating instructions in `.pipeline/AU.md:48-52` at the same time.
   Nothing in this architecture asks for a plan amendment.

12. **Two stale mechanism references survive in `requirements.md`, and this architecture supersedes
   them on the mechanism only.** `requirements.md:15` describes AU31 as clearing "baseline entries,
   which per the shrink-only mechanism promotes each rule to error in the same commit
   (`governance/README.md:69-89`)", and `requirements.md:100` cites
   `governance/README.md:29-33,138-141` and `:110-124` for the founder-ruling and attack-case
   requirements. The *requirements* those sentences state are unchanged and still hold — a rule
   bites in the pull request that clears it; a verdict change needs a founder ruling; a new rule
   needs an attack case or the build fails. Only the named mechanism and the line numbers are stale
   (current anchors: the severity dial at `governance/README.md:71-93`, the shape table at `:27-32`,
   the break-test properties at `:109-124`, the founder-ruling clause at `:137-139`). A builder
   reading `requirements.md` should take §1, §10 and §12 of this document as the mechanism of
   record. Requirements is an approved upstream artifact and is left as it is rather than
   back-edited; recorded here so the discrepancy is visible instead of a trap.

## 14. Documentation made false by this change

For `/write-docs`: `docs/architecture/runtime-simplification.md` (composition-root narrative —
`createServer`'s shape, "core-api imports orchestration's route module" passages),
`docs/architecture/as-implemented-domain-architecture.md` (layer dependency figures),
`governance/README.md` gains the face-rule paragraph (the one legal home of the rule text), and
`governance/architecture.json`'s mcpRouter `why` drops "It is mounted in the wrong place today."
The two settled nouns (session-requests' identity; the public face) land in `docs/architecture/`
per requirements' DOC-CLASS. One more line, from §2.8:
`docs/agent-layer/model-routing-and-cost.md:36` cites
`layers/agent-orchestration/agent-run-config/src/validate-agent-config.ts` as where an
out-of-catalog `modelId` is rejected — after wave A that path is
`layers/core-api/src/routes/validate-agent-config.ts`. The behavior it documents is unchanged.
