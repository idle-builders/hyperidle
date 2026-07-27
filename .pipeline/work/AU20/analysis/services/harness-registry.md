# harness-registry — Service-as-Product Audit (AU20)

**Layer:** agent-execution · **Owned tables:** none (structurally — zero `@hyperidle/db` dep, Mechanism B) · **Current public exports:** 79 · **Consumers:** 2 (`session-lifecycle`, `run-orchestration`) · **Target exports:** ~15

---

## 1. Existence / Consolidation Verdict — **STANDALONE**

harness-registry earns its boundary, and the boundary is not "owns a table" (it owns none) — it is a **genuine earned security/deployment seam**: this is the one place in the system that spawns processes, makes real LLM API calls, and touches a real filesystem/sandbox. Its runtime dep set is `@hyperidle/shared` only. That zero-dependency posture is load-bearing: this code can run on a fully **untrusted `remote-worker` with no DB credentials** (Mechanism B). That is a real platform/framework product.

**Platform value delivered, to whom:** "give me a runnable harness, a pool to manage/select harnesses by capability, a sandbox to run in, and the AL6 un-bypassable return-enforcement backstop." Consumers (from the data): `session-lifecycle` (composes the concrete `HarnessPort`: startSession/stream/stop/select/sandbox/return-gate/provision) and `run-orchestration` (pool custody: has/register/unregister/pause/resume + remote-worker dispatch + remote-adapter factory).

**Candidate-cluster evaluation (`harness-execution-platform` = harness-registry + mcp-provider + tool-provider):** The cluster's *layer* is real — a zero-DB agent-execution platform. But the internal fold the hypothesis proposes — **absorb mcp-provider into harness-registry** — **fails the boundary test and I reject it.** Hard evidence: `mcp-provider` depends on `hono` + `@modelcontextprotocol/sdk` as *runtime* deps (it ships a Hono JSON-RPC sub-router). harness-registry keeps `@modelcontextprotocol/sdk`/`zod` as **dev-only** deps and `@hyperidle/shared` as its sole runtime dep. Folding mcp-provider in would drag a server router into the exact package that must stay runnable on an untrusted, router-less remote-worker — destroying the one property that justifies the service. `tool-provider` (shared+zod only) is boundary-safe but is a distinct concern (tool *schemas/wire-shapes*, not harness *processes*); no reason to absorb it here. So: **standalone; the platform is a cluster of three peers, not a merge.** AU19's "literal execution boundary / Mechanism B" rationale holds — the challenge is not existence, it is the **grossly over-exposed surface**.

**The number is the finding here:** 79 exports for 2 consumers whose *entire* real demand is ~7 capability clusters reached through DI-port wrappers. The bloat is internal machinery published as product: the full LLM client + 8 LLM wire types, the cassette **test** lane (including `__getCostAccumulatorForTest`/`__resetCostAccumulatorForTest` — literal `__…ForTest` hooks in the public barrel), 9 discovery/probe/parse functions, per-CLI config constants, capability descriptors, context-window sizing, and 4 `EMITTED_ROOTS_*` **test-assertion path constants**. None of these appear in any consumer's request list. They are pool-construction internals and test scaffolding leaking through the barrel.

---

## 2. The Deliberate Target Public API (~15 exports)

The real demand, read from the data, is five capability clusters plus two factories. Design them as general seams; push everything else internal.

| # | Interface | Shape | Subsumes (current per-caller exports) | Why a meaningful shared capability |
|---|---|---|---|---|
| 1 | **HarnessAdapter** (runtime seam) | `startSession / streamEvents / stopSession / dispatchMessage / getCapabilities` (interface already in `@hyperidle/shared`) | `BuiltinHarnessAdapter`, `BuiltinHarnessOptions`, `CliHarnessAdapter`, `RemoteHarnessAdapter`(public class), `CliAdapterConfig/Deps`, `CliAvailabilityDeps`, `CredentialResolver`, `CLAUDE_CLI_CONFIG`, `CURSOR_AGENT_CLI_CONFIG`, `CLI_TOOL_CONFIGS` | One seam every harness implements. Concrete builtin/CLI/remote classes are *internal* impls selected via the pool/factory — the product is the interface, not the three classes. |
| 2 | **AdapterPool** + `createLocalAdapterPool()` | `register/unregister/has/pause/resume/release` + `select(requirements)` | `AdapterPool`, `createLocalAdapterPool`, `AdapterInfo`, `AdapterMeta`, `SelectedEntry`, all 9 discovery/probe/parse fns (`discoverLocalHarnesses`, `probe*`, `parse*`, `BUILTIN_MODELS_FETCH_TIMEOUT_MS`), capability descriptors (`describeRegisteredHarness`, `KNOWN_HARNESS_FAMILIES`, `missingKnownHarnessDescriptors`) | Capability-based selection is the product; discovery/descriptors are how the pool *builds itself* — internal. `select(SelectRequirements)` is the general filter seam. |
| 3 | **SandboxAdapter** + `createSandboxAdapter(topology)` | `spawn/exec/destroy` interface; factory picks impl by topology | `LocalSandboxAdapter`, `DisabledSandboxAdapter` (public classes) | Topology-parameterized factory replaces a class-per-topology. |
| 4 | **ReturnEnforcement** (AL6) + `createReturnEnforcement()` | registry: `register/get/incrementForce/unregister`; gate: `observe` + `evaluateReturn(...)` | `createEnforcementRegistry`, `enforcementRegistry`, `EnforcementEntry`, `EnforcementRegistry`, `createReturnGate`, `ReturnGate`, `evaluateReturn`, `ReturnVerdict` | The force-return backstop is *one* concern split across two ports today; unify into one enforcement surface. |
| 5 | **provisionHarnessEnvironment(opts)** | writes harness-specific on-disk config before start | `writeCliMcpConfig`, `WriteCliMcpConfigParams/Result`, `provisionReturnHook`, `ProvisionReturnHookOptions`, `EMITTED_ROOTS_CLI_MCP_CONFIG`, `EMITTED_ROOTS_CLAUDE_SETTINGS`, `EMITTED_ROOTS_CODEX_HOME`, `EMITTED_ROOTS_OPENCODE_PLUGIN` | "Prepare the harness's environment" is one provisioning act; the 4 `EMITTED_ROOTS_*` are test-assertion constants, not product. |
| 6 | **createRemoteHarnessAdapter(...)** | factory → `HarnessAdapter` | `RemoteHarnessAdapter` (as a public class) | `run-orchestration` asks only for `create`; return the interface, hide the class. |

**Retained supporting types (justified):** `SelectRequirements` (the pool filter), `SandboxHandle` + `ExecResult` (sandbox seam I/O), `ReturnVerdict` (enforcement result), `HarnessCapabilityDescriptor` (re-export from shared, the capability contract), `HarnessProvisionOptions`. **Target: ~15 exports (down from 79, ~80% collapse).**

**Removed from the public surface entirely (internal or test-only):**
- **LLM client + wire types (12):** `callLlm`, `callLlmDirect`, `CallLlmOptions`, `estimateCostUsd`, and all 8 `Llm*` types → private to the builtin adapter's API loop. No consumer requests them.
- **Cassette test lane (7):** `recordLlm`, `replayLlm`, `buildCassetteKey`, `loadCassetteEntries`, `CassetteEntry`, `__getCostAccumulatorForTest`, `__resetCostAccumulatorForTest` → move behind a `./testing` subpath export; test hooks must never sit in the product barrel.
- **Context-window sizing (4):** `contextWindowForModel`, `isAboveThreshold`, `MODEL_CONTEXT_WINDOWS`, `DEFAULT_CONTEXT_WINDOW` → internal to the builtin loop's context management.
- **Discovery/probe/descriptor/config internals** → folded into `createLocalAdapterPool` (rows 1–2).

---

## 3. Inside Lens — staying clean/evolvable

- **Mechanism B stays the invariant:** runtime dep = `@hyperidle/shared` only; the MCP SDK and zod stay dev-only. A lint/knip guard on the barrel keeps the router-less, DB-less posture that lets this run on a remote-worker — the reason mcp-provider must *not* fold in.
- **Interface-over-implementations:** builtin/CLI/remote harnesses and local/disabled sandboxes all sit *behind* `HarnessAdapter` / `SandboxAdapter`. Adding a variant touches only internals + one registration line.
- **Test scaffolding off the product surface:** cassette + `__…ForTest` + `EMITTED_ROOTS_*` move to a `./testing` entrypoint. The product barrel stops advertising test machinery, and `knip:production` can police it.
- **One AL6 surface:** enforcement registry + return gate unify, removing the split-port seam and making the backstop a single evolvable object.

---

## 4. Scaling Argument — sub-linear

**Today (method/class-per-variant, super-linear):** a new CLI harness ("gemini-cli") = a new `*_CLI_CONFIG` constant + a `probeGeminiCli` + a `parseGeminiModelsOutput` + a capability descriptor + a registration — **~4 new public exports per harness.** A new sandbox topology = a new public `*SandboxAdapter` class. This is exactly the method-per-intent sprawl the frame rejects; hundreds of future calls would demand hundreds of exports.

**Target (parameterized seams, sub-linear):**
- New harness → new *internal* `HarnessAdapter` impl, registered inside `createLocalAdapterPool`. `select(requirements)` already routes to it by capability. **Zero new exports.**
- New sandbox topology → new *internal* `SandboxAdapter` impl behind `createSandboxAdapter(topology)`. **Zero new exports.**
- New selection need (e.g., "pick by cost ceiling") → a field on `SelectRequirements`, not a `selectByCost` method. **Zero new exports.**
- New enforcement policy → a parameter/strategy on `ReturnEnforcement`, not a new registry.

New use-cases **compose** from `HarnessAdapter` × `AdapterPool.select(filter)` × `SandboxAdapter` × `ReturnEnforcement`. The surface holds flat as consumers and harnesses multiply — the scaling test passes.

---

## 5. Key Collapses

1. **3 concrete harness classes + 4 CLI-config/deps types + 3 CLI config constants → 1 `HarnessAdapter` interface + a factory** (~11 exports → 2). The seam, not the implementations.
2. **9 discovery/probe/parse fns + 3 capability-descriptor exports + 3 pool detail types → folded into `createLocalAdapterPool` / `AdapterPool.select`** (~15 exports → 2). Pool self-construction is internal.
3. **Entire LLM stack (client + 8 wire types + cost) → private to the builtin adapter** (12 exports → 0). No consumer asked; not product.
4. **Cassette + `__…ForTest` test lane → `./testing` subpath** (7 exports → 0 on the product barrel). Test hooks out of the product surface.
5. **Enforcement registry + return gate → one `ReturnEnforcement`** (8 exports → 3).
6. **`writeCliMcpConfig` + `provisionReturnHook` + 4 `EMITTED_ROOTS_*` → one `provisionHarnessEnvironment`** (8 exports → 1). Test-assertion path constants deleted from the surface.

Net: **79 → ~15**, with the product now a small set of composable execution seams and every retained export tied to a named consumer demand.
