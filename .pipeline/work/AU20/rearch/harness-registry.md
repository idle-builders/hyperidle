# agent-execution-platform (harness-registry) — Product Re-Architecture (AU20, rev2)

**Layer:** agent-execution · **Owned tables:** 0 · **Substrate:** EXTERNAL-API adapter (Mechanism B: runtime dep = `@hyperidle/shared` only, never `@hyperidle/db`).
**MERGE ANCHOR:** `agent-execution-platform` = **harness-registry + tool-provider + mcp-provider**.
**Current (concatenated, the failure):** ~87 methods / ~48 types (harness-registry 55/32 + tool-provider ~25/~12 + mcp-provider 7/~4).
**Target:** **33 methods / 13 types** — ONE coherent execution-platform API, not the sum of the three barrels.

> **rev2** (post adversarial numbers review): the rev1 collapse of `AdapterPool` to 6 ops was **LOSSY** — it dropped the harness capability/availability read model that `core-api`'s `harness-capability-read-model.ts` (and 12 route files through it) genuinely consume. rev2 restores that read surface as **4 general parameterized queries** (not 7 bespoke getters), lifting the target from 28 → **33** and the AdapterPool from 6 → **11 ops**. Lean *and* complete: `featuresLost = []`.

---

## 1. INSIDE-OUT — substrate, floor, owned capabilities

### Substrate: EXTERNAL-API adapter (NOT owned-tables, NOT internal-logic)
Zero tables → there is no table→CRUD floor to derive; the inside-out anchor is the **external systems this service adapts**. This is the one package that spawns real processes, makes real LLM API calls, touches a real filesystem, and speaks the MCP wire. It is an **adapter over four external systems**, unified. Its shape is dictated by those externals, unified across backends — never one method per backend, never the union of every CLI's calls.

The four adapted external systems + their **minimal UNIFIED adapter surface** (the floor):

| External system | Unified adapter seam | Floor ops |
|---|---|---|
| **Harness CLIs** (claude / codex / opencode / cursor-agent / builtin) | `HarnessAdapter` — ONE interface every backend implements (already in `@hyperidle/shared`) | `startSession · streamEvents · dispatchMessage · stopSession · getCapabilities` = **5** |
| **OS filesystem / process sandbox** | `SandboxAdapter` — one interface, impl chosen by topology (local / disabled) | `spawn · exec · destroy` = **3** |
| **MCP protocol** (the harness↔tools wire, server side) | `McpToolBridge` — one per-server mount, session-parameterized | `open · close` (+`router` property) = **2** |
| **Tool invocation** (what a harness drives) | `ToolRegistry` — the dispatch surface handed to a harness | `invoke · toClaudeToolSpecs` = **2** |

Plus one **internal-logic** floor riding inside the platform (AL6 return-enforcement — an owned force-return state machine, no external system):
| Owned policy | Seam | Floor ops |
|---|---|---|
| **AL6 return-enforcement** | `ReturnEnforcement` — registry + gate unified | `register · observe · evaluate` = **3** |

**FLOOR = 15 unified adapter/policy ops** (5 harness + 3 sandbox + 2 mcp + 2 tool + 3 enforcement). This is the substrate-appropriate floor: a handful of ops per external system, unified — NOT a method per CLI backend, NOT the union of every CLI's flags/probes.

### Genuine owned capabilities ABOVE the floor (justified, +18)

1. **AdapterPool — the multi-harness pool: custody + selection + capability read model (11 methods).** The pool is HyperIdle's own; no external system provides "which harnesses are registered + what each can do." Two genuine faces of one owned object:
   - **Lifecycle / custody (7):** `register · unregister · has · pause · resume` (run-orchestration worker-ws custody) · `select(requirements)` + `release(id)` (session-lifecycle session-slot lifecycle — `select` increments load, `release` decrements; both live in `session-provisioning.ts`). *(rev1 dropped `release`; restored.)*
   - **Capability read model (4 general queries):** `list(filter?): AdapterInfo[]` · `describe(filter?): HarnessCapabilityDescriptor[]` · `refresh(): Promise<void>` · `size: number`. This is the **named "harness capability read model"** capability — HyperIdle-owned, genuinely consumed by `core-api`'s `harness-capability-read-model.ts` and 12 route files. *(rev1 collapsed this to zero and falsely claimed "no consumer requests capability descriptors"; restored as 4 parameterized queries, not 7 bespoke getters.)*
2. **provisionHarnessEnvironment (1).** Owned act: writes HyperIdle's `.mcp.json`/`config.toml` + the AL6 return-hook into the harness's host working dir *before* spawn. Folds `writeCliMcpConfig` + `provisionReturnHook`.
3. **Factories that hand back the interface, hiding concrete classes (6).** `createHarnessAdapter(spec)` (folds builtin/CLI/remote concrete classes + run-orchestration's `create`), `createLocalAdapterPool()` (folds the 9 discovery/probe/parse **fns** + capability-descriptor **builders** — pool self-construction is internal), `createSandboxAdapter(topology)`, `createReturnEnforcement()`, `createMcpToolBridge({enforcement})`, `buildToolRegistry(defs, ctx, options)`.
4. **returnStatusTool (0 methods — a data descriptor export).** The AL6 `hyperidle_return_status` tool as data, injected via `options.extraTools`; not a method surface.

**TARGET = floor 15 + 11 pool + 1 provision + 6 factories = 33 methods.** 33 / 15 = **2.2× floor** — near-floor, every method tied to an external-adapter floor op, the AL6 policy, a named consumer demand, or an interface-hiding factory.

#### How the 4 read queries fold the 7 bespoke reads (de-fragmentation, NOT loss)
| Current bespoke read (pool + read-model) | Consumed by | Served in rev2 by |
|---|---|---|
| `list()` / `workerConnections(reader)` → `AdapterInfo[]` | `GET /api/workers`, connections projection | `list(filter?)` — filter by `kind`/`type` |
| `size` / `registeredHarnessCount(reader)` | `agent-profile.ts` availability | `size` |
| `listCapabilityDescriptors(opts)` / `harnessCapabilityDescriptors` | `/harnesses`, connections, teams, users, assistant | `describe(filter?)` — `{ includeKnownMissing }` in filter |
| `getCapabilityDescriptorByType(type\|null)` | descriptor-per-type reads | `describe({ type })[0]` |
| `getCapabilitiesByType(type\|null)` → `HarnessCapabilities` | `agent-profile.ts:310,385` (availability + `mapCapabilities`) | `describe({ type })[0].runtime` (descriptor carries `runtime: HarnessRuntimeCapabilities`, derived from the same `getCapabilities()`); availability = `describe({ type }).length > 0` |
| `getRegistrationMetaByType(type)` → `AdapterMeta` | `agents.ts:135,165` (`modelProviders` for `validateAgentConfig`) | `describe({ type })[0].modelProviders` (descriptor carries top-level `modelProviders`) |
| `refreshDiscoveries()` / `refreshHarnessDiscoveries` | `POST /api/harnesses/redetect` | `refresh()` |

`describe()` returns `HarnessCapabilityDescriptor`, which already carries `type · name · kind · accessMode · authAction · discovery · models · runtime · modelProviders · inheritedTools` — a **superset** of the raw `HarnessCapabilities`/`AdapterMeta` the two per-type getters returned. Folding them into `describe()` collapses the current two-sources-of-truth (`meta.modelProviders` vs `getCapabilities()`, flagged in POLISH-060 lore) into ONE read shape. The `core-api` read model narrows this via `Pick` to keep routes off execution/selection methods — that `HarnessCapabilityReader` narrowing survives unchanged (it now Picks `list · describe · refresh · size`).

---

## 2. OUTSIDE-IN — real consumer demand (from the data + call-site scan)

The service-data `consumers[]` lists only **run-orchestration** (custody + dispatch + create). That undercounts: the `core-api` composition root drives a second, genuinely-owned demand — the harness capability/availability read model — that the data omitted. rev1 trusted the data alone and dropped it. Corrected demand:

- **run-orchestration** requests: `dispatchMessage` (route a turn to a pooled harness), `has / register / unregister / pause / resume` (pool custody for remote-worker dispatch), `create` (mint a remote harness adapter). → served by `AdapterPool` lifecycle + `HarnessAdapter.dispatchMessage` + `createHarnessAdapter(remote spec)`.
- **session-lifecycle** (via the `core-api` composition root): compose a per-session `HarnessPort` (startSession/stream/stop), `select`/`release` a pooled adapter, get a `SandboxAdapter`, build a per-session `ToolRegistry`, `open`/`close` an MCP bridge, provision the harness env, hold the `ReturnEnforcement` gate. → served by `HarnessAdapter` + `AdapterPool.select/release` + `SandboxAdapter` + `buildToolRegistry` + `createMcpToolBridge` + `provisionHarnessEnvironment` + `createReturnEnforcement`.
- **core-api harness capability read model** (`services/harness-capability-read-model.ts` → 12 route files: `harnesses`, `agents`, `agent-profile`, `users`, `workers`, `connections`, `teams-routes`, `assistant`): the harness **availability + capability display** feature — `/harnesses` (`harnessCapabilityDescriptors`, `refreshHarnessDiscoveries`), `/workers` (`workerConnections`), agent-profile availability (`harnessCapabilitiesForType`, `registeredHarnessCount`), agents (`harnessRegistrationMeta`). → served by `AdapterPool.list / describe / refresh / size`.
- **composition root**: mounts `mcpBridge.router` on the Hono app.

No consumer requests the LLM client, cassette lane, context-window sizing, the raw discovery/probe/parse **fns**, per-CLI config constants, or any `EMITTED_ROOTS_*` / `__…ForTest` symbol. Those are internal machinery + test scaffolding leaked through three barrels — distinct from the capability **read queries** above, which are real product demand.

---

## 3. THE COHERENT PRODUCT API (fused, 8 exported constructs → 33 methods / 13 types)

| # | Interface / factory | Shape | Lens | From (owned capability / demand) |
|---|---|---|---|---|
| 1 | **HarnessAdapter** (+ `createHarnessAdapter(spec)`) | `startSession · streamEvents · dispatchMessage · stopSession · getCapabilities`; `spec` discriminates builtin / CLI-family / remote — folds all 3 concrete classes AND run-orchestration's `create` | both | External harness-CLI floor + `dispatchMessage`/`create` demand |
| 2 | **AdapterPool** (+ `createLocalAdapterPool()`) | lifecycle `register · unregister · has · pause · resume · select(requirements) · release(id)`; read model `list(filter?) · describe(filter?) · refresh() · size` | both | Owned pool: run-orchestration custody + session-slot lifecycle + core-api capability read model |
| 3 | **SandboxAdapter** (+ `createSandboxAdapter(topology)`) | `spawn · exec · destroy`; topology picks local/disabled impl | inside-out | External OS-fs floor |
| 4 | **ReturnEnforcement** (+ `createReturnEnforcement()`) | `register · observe · evaluate(spec)` — registry + return-gate unified | inside-out | AL6 owned policy (internal-logic floor) |
| 5 | **ToolRegistry** (+ `buildToolRegistry(defs, ctx, options)`) | registry: `invoke(name,args) · toClaudeToolSpecs()`; role-filter + spec-projection are internal steps keyed by `options` | both | Folded tool-provider dispatch closure + session-lifecycle demand |
| 6 | **McpToolBridge** (+ `createMcpToolBridge({enforcement})`) | `open(session) → {token} · close(token)` + `router` property; adjudicates against the injected `ReturnEnforcement` | both | Folded mcp-provider wire; session-parameterized, harness-agnostic |
| 7 | **provisionHarnessEnvironment(opts)** | writes harness on-disk config + AL6 return-hook before spawn | inside-out | Owned provisioning act |
| 8 | **returnStatusTool** | `ToolDefinition` data + `.forRegistry(registry)`; injected via `options.extraTools` | outside-in | AL6 enforcement, composes into #5 |

**Types (13):** `HarnessAdapter`, `HarnessAdapterSpec`, `SelectRequirements`, `AdapterInfo`, `AdapterMeta`, `AdapterFilter` (the shared `list`/`describe` filter — `type`/`kind`/`includeKnownMissing`), `HarnessCapabilityDescriptor` (re-export from shared, the single capability read shape), `SandboxAdapter`, `ReturnEnforcementSpec`, `ToolRegistry`, `BuildToolRegistryOptions`, `McpToolBridge`, `ProvisionOptions`. (Tool wire-types `ToolDefinition`/`ToolContext`/`RegisteredTool` and `HarnessCapabilities`/`HarnessRuntimeCapabilities` are consumed from `@hyperidle/shared` directly, not re-exported.)

Every construct is **general and composed by argument**: `select(requirements)` not `selectByCost`; `list(filter)`/`describe(filter)` not a getter per shape; `createSandboxAdapter(topology)` not a class per topology; `open(session)` not a bridge per harness; `buildToolRegistry(defs, ctx, options)` absorbs role/extraTools/workflow-mode as parameters. New harness → internal `HarnessAdapter` impl registered inside `createLocalAdapterPool`, **zero new exports**.

---

## 4. TARGET NUMBERS & what gets DELETED vs INTERNALIZED

**87 → 33 methods · ~48 → 13 types.** Floor = 15; +18 justified (11 pool = 7 lifecycle + 4 read model, 1 provision, 6 factories).

DELETED from the product surface entirely (test-only, dead, or a redundant façade — not merely hidden):
- **tool-provider's 22 pass-through re-exports of `@hyperidle/shared`** (`toRegistered`, `toClaudeToolSpec`, `classifyReversibility`, `composeWorkflowAllowDeny`, `canonicalJson`, `identityHash`, `toolsForRole`, `wrapForRegistry`, `err`, `ok` + 12 types) — consumers import from `@hyperidle/shared` directly (most already do); 4 had **zero consumers**. The whole tool-provider package + barrel + build target dissolves.
- **mcp-provider's leaked internals** (`createMcpBridge`, `createMcpBridgeRegistry`, `createMcpRoute`, `McpBridgeRegistry`, `CreateMcpBridgeOptions`, `McpBridgeInstance`, `toolResultToCallToolResult`) — collapse into `createMcpToolBridge`; the package dissolves.
- **4 `EMITTED_ROOTS_*` path constants + `__getCostAccumulatorForTest`/`__resetCostAccumulatorForTest`** — test-assertion scaffolding, deleted from the barrel.

INTERNALIZED (kept in-package, off the product surface — moved, not deleted):
- **LLM client + 8 wire types + cost-estimate + context-window sizing** → private to the builtin adapter's API loop (no consumer asks; not product). *(verified test/eval-only importers)*
- **Cassette test lane** (`recordLlm`/`replayLlm`/`buildCassetteKey`/…) → `./testing` subpath export, off the product barrel (`knip:production` polices it).
- **The 9 discovery/probe/parse FNS + per-CLI config constants + the descriptor-BUILDER helpers** (`describeRegisteredHarness`/`missingKnownHarnessDescriptors`) → folded into `createLocalAdapterPool` (pool self-construction). **NB (rev2 correction):** this is the *construction* machinery only. The descriptor **READ QUERIES** (`describe`/`list`/`refresh`/`size`) are NOT internalized — they are exposed product surface on `AdapterPool`, because routes consume them. rev1 conflated the two and disguised a capability removal as cleanup; corrected.

**Not lost — proof every current real feature is still deliverable:**
| Real user feature | Delivered by |
|---|---|
| Multi-harness pooling + remote-worker dispatch | `AdapterPool` lifecycle + `HarnessAdapter.dispatchMessage` + `createHarnessAdapter(remote)` |
| Session-slot custody (load balance) | `AdapterPool.select` / `release` |
| `/harnesses` availability + capability display | `AdapterPool.describe(filter)` + `refresh` |
| `/workers` connection list | `AdapterPool.list(filter)` |
| Agent-profile harness availability + capabilities | `AdapterPool.describe({type})[0].runtime` + `.length` + `size` |
| Agent config validation (`modelProviders`) | `AdapterPool.describe({type})[0].modelProviders` |
| Per-session tool registry | `buildToolRegistry` |
| MCP tool-serving wire | `createMcpToolBridge` (+ `router`) |
| AL6 return enforcement | `ReturnEnforcement` + `returnStatusTool` + provisioned return-hook |
| Sandbox isolation | `SandboxAdapter` |

→ **`featuresLost = []`.**

---

## 5. UNIFIED ANCHOR — three folds become ONE product, not the sum

Naive sum = 55 + 25 + 7 = 87 (the failure). The unification is real, not arithmetic, because the three folded parts are the **two faces of one platform boundary**:

1. **harness-registry** = *what harnesses are available (+ their capabilities) + how you run one* (adapters, pool, capability read model, sandbox, enforcement, provisioning).
2. **tool-provider** = *what a running harness invokes* (`buildToolRegistry`) — literally the object the harness in #1 drives. Its 25 exports were 22 redundant `@hyperidle/shared` pass-throughs + 2 real symbols; the pass-throughs delete, the 2 symbols re-home.
3. **mcp-provider** = *the wire the harness reaches tools over* — its return-status route already mutates harness-registry's `enforcementRegistry`, and harness-registry's `writeCliMcpConfig` already advertises mcp-provider's endpoint URL. They are two halves of one contract split across a package boundary for no reason; `createMcpToolBridge` reunites them.

All three share the exact **Mechanism-B security seam** (runtime dep = `@hyperidle/shared` only — must run on an untrusted, DB-less, router-optional remote-worker). Merging makes that seam **one lint on one package** instead of three micro-packages maintained in lockstep — the seam gets stronger, not weaker. The one caveat (mcp-provider drags `hono` runtime dep in) is contained by keeping the Hono router as a `.router` property the composition root mounts — the remote-worker path never touches it; `@hyperidle/shared` remains the sole hard runtime dep.

The product is ONE API: *"pick a harness by capability, spawn it in a sandbox with its env provisioned, hand it a tool registry served over the MCP bridge, and enforce return — and let core-api read which harnesses exist and what they can do."* Eight composable constructs, 33 methods — lean (2.2× floor, no bloat) **and** complete (every real feature deliverable, none lost).
