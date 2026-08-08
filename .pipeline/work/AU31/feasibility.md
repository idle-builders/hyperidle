# AU31 — Feasibility

Probes run against the live tree at `bbe82e9a` (branch `backend/AU31-layer-composition-boundary`,
worktree `.worktrees/AU31`; P11 added in the attempt-2 revision, run 2026-08-08 on the same production tree). Every result below was produced by executing the stated method in this
session, not recalled. Scratch outputs not worth keeping are discarded; the two load-bearing
inventories are reproduced inline.

---

## P1 — The baseline arithmetic: 288 total, AU31 owns 92 (+1 contested), AU31 does NOT structurally empty the file

**Question.** Is AU31 the work package whose clearing empties `governance/baseline.json` (AC #6's
conditional)?

**Method.** Parse `governance/baseline.json`, sum `sites` counts per group, partition groups by
owning WP per `.pipeline/AU.md` rows 28–32.

**Result.** 38 groups, **288 sites** total. AU31's 14 groups sum to **92**; the contested
`application → db:util [import]` (1 site, `applications/remote-server/src/create-server.ts`) makes
the 93 `progress.json.baselineScope` names. Every non-AU31 group has an owner: the `db:table`
groups (production) → AU30; `framework → EventBus`, `framework → db:table` writes,
`layer → db:util`, `db:unknown`, `db:schema-ns` → AU29; every `development`-world group → AU32
(companions) or AU29 (`tooling → raw runtime`, `application → db:unknown` dev).

**Verdict.** Whether AU31 clears last is a **schedule fact, not a plan fact** — AU29/AU30/AU32 are
registered but unshipped. The architecture therefore gives the builder a mechanical end-of-work
check (architecture.md §10) rather than a prediction. Both outcomes are planned.

---

## P2 — The legal mechanism already exists and is already ruled allowed

**Question.** Is "core converses with agent-orchestration over its HTTP app through an in-process
transport" a mechanism AU31 may build on, or a new invention?

**Method.** Read `governance/decided-rules.json` rows; read
`layers/core-api/src/services/agent-orchestration-port-composition.ts` and
`applications/remote-server/src/create-server.ts:834` (transport registration).

**Result.**
- `layer → agent-orchestration [api]` = **allowed**, 3 live production instances (the
  `AgentOrchestrationPort` seam calls). `service → agent-orchestration [api]` allowed.
  `layer → core-api [api]` allowed, 103 production instances (the `CoreApiPort` tool seam).
- The port + in-process transport (hc client over `app.fetch`, registered at the application:
  `create-server.ts:834`, `:842`) is live, typed in `@hyperidle/api-contract`
  (reach `["layer"]`, `governance/architecture.json:45-47`).
- `layer → agent-execution [api]` = **forbidden** (0 production instances) — orchestration may
  NOT dial an execution HTTP API. `harness-registry → MCP router [mcp]` = **allowed** (4
  production instances); `agent-execution → MCP router` allowed; service/layer/application → MCP
  router forbidden.

**Verdict.** The API mechanism for core→orchestration is an extension of an existing, ruled-allowed
seam. For orchestration→execution no API door exists or is permitted — the execution relationship
must ride the adapter/composition contract and the MCP dial must relocate INTO `harness-registry`
(the one actor with an allowed MCP row). This constrains architecture.md §5/§6 hard.

## P2b — The DI clause reads the WIRE's two ends, not the wiring file

**Method.** Read `scripts/lib/governance-model.ts:266-290` (clause 6, `wire-within-one-layer`).

**Result.** DI verdict = both ends of the injected port in one layer, or the provider is the
framework. The wiring file's own role is irrelevant — which is why
`applications/remote-server/src/create-server.ts` carries a `service → service (other layer) [di]`
baseline site (`readAgentRunConfigs` wired into `settings`' backfill port, `create-server.ts:510`)
even though an application wrote the wire. Consequence: relocating a wiring file never legalizes a
cross-layer wire; the wire itself must dissolve (seam call, in-layer relocation, or a
framework/shared-typed capability).

---

## P3 — Transactional-coupling audit of every intake write site (requirements §2.4 / §8.2)

**Method.** `rg` for `enqueueWorkIntent(`, `createSessionRequest(`,
`agentWorkIntentRecorder.record(` and `tx as HyperIdleDb` across `layers/core-api/src`,
excluding tests; read each hit.

**Result — the complete classification.**

| Site | Inside a core tx? | What shares the tx | Class |
|---|---|---|---|
| `routes/sessions-routes.ts:168,185,194` | yes | `createSessionRequest` (explicit start) + baked-request resolution + intent record | **Orchestration-internal pair** — both writes are orchestration-owned tables; no core write in the tx (task read only) |
| `routes/knowledge.ts:934` | yes | knowledge flag transition (`:891`, core table) + intent | **Cross-boundary pair** |
| `routes/threads.ts:1463` | yes | `insertMessage`/`updateThread` (`:1443,:1482`, core tables) + assistant-turn intent | **Cross-boundary pair** |
| Every other write site (`bets.ts`, `tasks.ts`, `app.ts:494`, reactors `work-session-started-reactions.ts:63`, `agent-run-admission-reactions.ts:115`, `assistant-turn-coherence-trigger.ts:81`, `routine-scheduler-bindings.ts`, `policy-bindings.ts:88`, review subscriptions `service-bootstrap.ts:470`) | no (plain `db`/`exec` outside a surrounding core-write tx, or post-event reaction) | — | **Uncoupled** |

**Verdict.** Exactly **two** cross-boundary atomic pairs exist (`knowledge.ts:934`,
`threads.ts:1463`); one pair is orchestration-internal and survives intact by moving into a single
intake operation. The two cross-boundary pairs are explicitly relinquished with named windows in
architecture.md §3.1 — this is a decision, not a discovery left to build. (`policy-bindings.ts`'s
`record` port takes an `exec` that CAN be a caller's tx — the builder must re-run this audit's grep
at build time and route any tx-carrying caller through the same relinquishment decision;
verified callers today pass plain handles. Marked as a build-step check, not UNVERIFIED.)

---

## P4 — `dispatcherDeps` threading through core-api is presence-flag-only

**Question.** Do core-api's `AdapterPool`/`McpToolBridge`/`SandboxAdapter`/`mounter` options serve
anything beyond wiring orchestration's runtime?

**Method.** `rg` for `dispatcherDeps`, `adapterPool`, `mcpBridgeRegistry`, `workspaceAdapter`,
`mounter` in `layers/core-api/src/app.ts` and `service-bootstrap.ts`; read the hits.

**Result.** `service-bootstrap.ts` uses `ctx.dispatcherDeps` in exactly one expression:
`canProvision: ctx.canProvision ?? Boolean(ctx.dispatcherDeps)` (`:602`). The bundle's contents are
never dereferenced there. In `app.ts`, `mcpBridgeRegistry`/`mounter`/`workspaceAdapter`/
`sandboxBasePath` (`:137-178`) exist only to be forwarded; **`adapterPool` has real route
consumers**: `createAgentRoutes(db, options.adapterPool)` (`:376`), teams (`:378`), users
(`:404`), onboarding-status (`:429`), `/workers` (`:440`), `/harnesses` (`:444`). Those routes
type their parameter as `HarnessCapabilityReader` — a `@hyperidle/shared` type
(`routes/workers.ts:8`); only `app.ts:8` itself names the `@hyperidle/harness-registry` types.

**Verdict.** Core-api's harness-registry type imports are removable by (a) deleting the
forward-only options and replacing the presence signal with `canProvision: boolean`, and (b)
retyping `AppOptions.adapterPool` to the shared `HarnessCapabilityReader` family. No behavior
change; capability-descriptor routes keep working against the same live pool instance the
application supplies. ⚠️ One residual to verify at build: whether `/harnesses`' `redetect` POST
needs a wider shared type than `HarnessCapabilityReader` (it triggers re-discovery on the pool) —
if so, the wider interface belongs in `@hyperidle/shared/harness` next to the reader, not as a
harness-registry import.

---

## P5 — `@hyperidle/core-api/session` and `./test-utils` consumers

**Method.** `rg -l` for the two specifiers repo-wide.

**Result.** `./session`: exactly two files, both in `tools/eval`
(`tools/eval/src/provision-harness.ts`, `provision-harness.test.ts` — `runSession` +
provisioning types). `./test-utils`: zero external consumers found by the same grep (the entry
resolves to `src/__testing__/test-utils.ts`, development world).

**Verdict.** Deleting core-api's `./session` entry strands only `tools/eval` (tooling role — a
composition root, permitted to import layer faces); its import repoints to the orchestration face
that will own `runSession`. `./test-utils` can be deleted outright once builder re-greps at head.

---

## P6 — `core-ui`'s production manifest row on `harness-registry` serves only development files

**Method.** `rg -l "@hyperidle/harness-registry" layers/core-ui`.

**Result.** Three hits, all `layers/core-ui/__scripts__/ah{1,5,6}-test-server.ts` (development
world by the `__` segment), plus the `package.json` row itself, which sits in **dependencies**
(production).

**Verdict.** Confirms requirements §8.9 — the fix is a manifest respelling (row moves to
`devDependencies`), zero code movement. Clears 1 of the 7 `layer → service (other layer)
[manifest]` sites.

---

## P7 — The MCP dial is injectable-registry-shaped already; relocation into `harness-registry` is a fold, not a rebuild

**Method.** Read `layers/agent-orchestration/run-orchestration/src/provisioner.ts:1300-1360,
1419-1462,1570`; `layers/agent-execution/harness-registry/src/mcp/index.ts`, `mcp-route.ts`.

**Result.** The provisioner touches the router through an injected optional port
(`mcpBridgeRegistry?: SessionLifecycleMcpBridgeRegistry`, `provisioner.ts:630`) plus a raw
`mcpBaseUrl` string; the URL spelling `${mcpBaseUrl}/api/mcp/${token}` appears 4×
(`:1349,1419,1449,1462`) and `close` at `:1570`. `provisionHarnessEnvironment` — which writes
`.mcp.json` and the hook scripts — is **already a harness-registry export** (wired at
`layers/core-api/src/services/run-orchestration-composition.ts:131-134`). The bridge itself
(`createMcpToolBridge`) constructs the router (`mcp/index.ts:50`) and is instantiated by the
application (`create-server.ts:566`).

**Verdict.** Everything the dial needs (token mint, URL spelling, `.mcp.json`/hook provisioning,
close) can live behind one harness-registry-owned session-scope operation invoked through the
adapter/provisioning contract, with `mcpBaseUrl` a value the application hands to the execution
face. What must remain orchestration-side is only the *decision inputs* (required return actions,
the on-return-observed reaction) — expressible as data + a callback on the already-shared harness
contract types. No blocked capability found.

---

## P8 — `SessionActivityBuffer` has zero execution coupling

**Method.** Read `layers/agent-execution/src/session-activity-buffer.ts` in full.

**Result.** The class imports only `@hyperidle/shared` types + `EventBus`; it folds
`tool_call_recorded`/`session_ended` bus events into a bounded in-memory map. Its only production
consumers are agent-orchestration's boot (`layers/agent-orchestration/src/boot.ts:29,100`) and the
routes that read `getActivity` through it.

**Verdict.** Relocation into `layers/agent-orchestration/src/` is mechanical (file move + import
updates + test move). It deletes the tree's single `layer → layer (other) [import]` and, with it,
`agent-orchestration`'s manifest row on `agent-execution` — nothing else in the layer imports
`@hyperidle/agent-execution` (grep-verified: `boot.ts:29` is the only production site).

---

## P9 — `remote-worker`'s substance already self-describes as agent-execution content

**Method.** Read `applications/remote-worker/src/index.ts`, `package.json`; `rg` desktop's usage.

**Result.** The package holds one class (`RemoteWorkerClient`), depends only on
`@hyperidle/shared`, and its own header says it is "`agent-execution` Layer: it holds a
`HarnessAdapter` and runs sessions, never touches core-api/agent-orchestration/core-ui" and exists
as a package only "so that role is a real, separately-typed unit". Desktop instantiates it
(`applications/desktop/src/main.ts:20,720`) — the `application → application [import]` site #2.

**Verdict.** Moving `RemoteWorkerClient` into `agent-execution` (declared in the layer's own
`src/`, satisfying face clause 2) and thinning `remote-worker` to a process entry that composes the
face is a relocation with an explicit prior claim in the code itself. Desktop then imports a layer
face, not an application.

---

## P10 — Live-state caveat

The plan's premises depend only on repository state (imports, manifests, registries), which these
probes read directly. The one deployed-state AC — a real agent run end to end — is an acceptance
activity, not a planning assumption; its execution recipe is architecture.md §11. No load-bearing
assumption remains UNVERIFIED except the two ⚠️ build-time re-checks named in P3 and P4.

---

## P11 — The composition-handoff and tool-stack spellings, executed against the real census

**Question.** What does the enforced census (`scripts/governance-lint.ts` → `scripts/lib/crossing-detectors.ts` + `governance-model.ts` clause 6) actually report for (i) the face-boot handoff spellings §4/§5/§6 depend on, and (ii) the tool-stack spellings §2.5 depends on? The first draft asserted a "clause 3" reading the critique showed exists in no enforced artifact (critique B1); this probe replaces the assertion with executed evidence.

**Method.** Overlay one probe file at a time onto the live tree (real paths, production world), run `npx tsx scripts/governance-lint.ts --errors-only` (plus a full run grepped for the probe path, so warnings are covered too), record output and exit code, delete the probe. Sources and verbatim outputs: `probes/p11-composition-spelling/`.

**Result.**

| Run | Spelling | Census verdict |
|---|---|---|
| 0 | clean tree | PASS, exit 0 (221 production known violations at warn) |
| A | inline handoff — `bootAgentOrchestration({ …, adapterPool: createLocalAdapterPool() })` in an application file | **FAIL, exit 1**: `ERROR [crossing-di] … layer → layer (other) [di] production — agent-orchestration receives the result of `createLocalAdapterPool` from agent-execution` |
| B | local-binding handoff — `const pool = createLocalAdapterPool(); bootAgentOrchestration({ …, adapterPool: pool })`, plus the `exec.adapters` property-access form | **PASS, exit 0** — zero findings for the probe file, warnings included |
| C1 | a `@hyperidle/shared` helper receiving a cross-module-imported layer tool list, spelled inside `layers/agent-orchestration/src/` (the shape a naive §2.5 relocation of `tool-provider-bindings.ts` would produce; list is a call-initialized `export const`, exactly `tool-handlers-bindings.ts:200`'s shape — NOT suppressed by `buildConstantExports`, `crossing-detectors.ts:316-325`) | **FAIL, exit 1**: `ERROR [crossing-di] … framework → layer [di] production — shared receives `probeToolDefinitions` from agent-orchestration` |
| C2 | the end-state tool-stack spelling — `buildToolDefinitions(ports, { role })` called in `layers/agent-orchestration/src/` with function-local values (`@hyperidle/tool-handlers` is the layer's own service) | **PASS, exit 0** — zero findings, warnings included |

**Verdict.** Three load-bearing facts, now executed rather than argued:
1. The **inline** cross-face spelling is forbidden and fatal today — the DI heuristic fires on a call-expression argument via its callee's import provenance (`crossing-detectors.ts:991-993`), the group has zero baseline headroom, and the shrink-only ratchet cannot absorb it. The spelling law in architecture §4 is therefore self-enforcing on its visible side.
2. The **local-binding** handoff records nothing — not because a clause allows it, but because the DI predicate is import-provenance-based by design (`crossing-detectors.ts:931-934`: the crossing is between the called factory's package and "the package the injected value came from"; a face-produced runtime value held in a local has no foreign import provenance). Architecture §4 states this honestly and gives the reading an enforced home (attack + control-twin pair on the `crossing-di` rule, clause-6 `why`/README sentence) at the founder gate.
3. The two `tool-provider-bindings.ts` DI wires **cannot relocate** — C1 proves the framework-consumer wire re-fails at any new site — and the §2.5 dissolution (dispatch moved into `@hyperidle/tool-handlers`, role filter via `buildToolDefinitions(ports, { role })`) reports nothing (C2) while being legal by clause 6's own text (both ends agent-orchestration, `governance-model.ts:282-288`), not by invisibility.

