# harness-registry — destroyer verdict

## Should this service exist?

**KEEP AS the harness door.** This is the one service whose whole job is the thing HyperIdle *is* on the execution side: reaching a real harness (builtin / claude-code / codex / opencode / cursor-agent), streaming its events, and forcing agents to return their work. Every agent session in the product flows through `pool.select()` → an adapter here → the MCP bridge here. Delete this and there are no agents.

But it carries dead substrate: a 334-line session-probe file nothing calls, a 4-arm factory with one live arm, an eval-only adapter, a sandbox `exec` surface no production code invokes, a hand-kept duplicate of MODEL_CATALOG, a process-global singleton that exists so an adapter can secretly reach a registry the composition root already owns, and one HTTP door (`GET /api/workers`) no client has ever called.

## If written today, from scratch

- `createLocalAdapterPool()` + `AdapterPool` with `select/release` (session admission), `register/unregister/has/pause/resume` (worker WS), `describe/refresh/size` (Settings harness surface)
- `BuiltinHarnessAdapter`, `CliHarnessAdapter`, `RemoteHarnessAdapter` — the three real execution paths, each behind the `HarnessAdapter` contract; `callLlm` as the builtin's engine
- `discoverLocalHarnesses()` — one table-driven probe loop, not five hand-written probes
- MCP bridge: `createMcpToolBridge` (open/close return the URL themselves), `createMcpSession`, `createMcpRouter`, `returnStatusTool`
- `provisionHarnessEnvironment` (MCP config + return hooks into the sandbox)
- `createReturnEnforcement()` as a plain factory — instance owned by the composition root, injected everywhere, no singleton
- `createSandboxAdapter` with `spawn/destroy` only

Everything outside that list is a deletion candidate by construction — and is verdicted below.

## Kill summary

| Verdict | Count |
|---|---|
| DELETE | 13 |
| MERGE | 3 |
| SIMPLIFY | 7 |
| KEEP | 46 |

Methods (sections A+B, 54 rows): DELETE 10, MERGE 3, SIMPLIFY 3, KEEP 38.
Surface: 54 methods → 41 methods (~24% cut). Files that die whole: `harness-session-probe.ts` (334 lines), `harness-adapter-factory.ts` (174), `mcp-tool-bridge.ts` shim (3); plus `exec`/`exists`/`runShell`, the `MODEL_CONTEXT_WINDOWS` map, two MCP wrappers, the enforcement singleton — roughly 700+ lines.

The KEEP count is high because this service *is* the execution spine: 30 of the 46 KEEPs are the member methods of the three adapters and the pool, each traced to a live door (session admission, worker WS, Settings UI, MCP bridge). The bloat here is in the exported-function layer and the types, not in the adapters.

## Feature-level kills

1. **Session-probe subsystem** (`harness-session-probe.ts`, `HarnessDiscoveryInput.sessionProbe`). "AM3 will wire it" — AM3 never did. Zero production callers; only an integration test and comments reference it. Because `runtimeFromDiscovery` gates `fileEditing/toolUse` on `sessionProbe?.ok`, those flags are already permanently false in production — deleting the probe is behavior-neutral. The AM2 real-discovery test and its fixtures die with it.
2. **`createHarnessAdapter` factory + `DirectHarnessAdapter`.** Production uses exactly one arm (`remote`, in `layers/agent-execution/src/boot.ts:196`). `builtin`/`cli` arms: production goes through `createLocalAdapterPool`'s direct `new` calls, never the factory. `direct` arm: only `tools/eval/src/provision-harness.ts` — eval tooling, not a product door. Delete the file; export `RemoteHarnessAdapter` (and `BuiltinHarnessAdapter`/`CliHarnessAdapter` for eval); move `DirectHarnessAdapter` (~90 lines) into `tools/eval` if the eval lane still wants a raw one-shot adapter.
3. **`GET /api/workers` dead door.** No UI, no client, nothing in `core-ui`/desktop/website fetches it (the desktop worker panel uses the Electron preload, not this route). Kill the route (`layers/core-api/src/routes/workers.ts`), the `workerConnections` read-model in `framework/harness-protocol`, and `AdapterPool.list` — its only production caller.
4. **Sandbox `exec` surface.** The provisioner calls `spawn` and `destroy` only (`provisioner.ts:1012,1702,1728`). `exec`, `exists`, the `runShell` helper, and `ExecResult` are test-only. The sandbox is a directory lifecycle, not a shell.
5. **`MODEL_CONTEXT_WINDOWS` duplicate catalog.** A hand-kept map with an @lore begging to be kept in sync with `MODEL_CATALOG` — which already carries `contextWindow` per model. Derive; delete the map and its two sync-assertion test files.
6. **Return-enforcement process singleton.** Exists only so `CliHarnessAdapter.streamEvents` can secretly re-fetch the shared registry (`cli-harness-adapter.ts:772`) and so tests can opt out via `{isolated: true}` — a test-only flag in production code. Inject the registry into `CliHarnessAdapter`; make `createReturnEnforcement()` a plain factory; the flag, the spec type, and the module-level global all die. Tests get simpler, not broken.
7. **MCP wrapper pair.** `closeMcpBridgeSession(bridge, token)` is literally `bridge.close(token)`. `openMcpBridgeSession` adds one string template. Fold the URL into `McpToolBridge.open`; delete both free functions. The AU31 "one Service knows `/api/mcp/`" ruling is preserved — the spelling moves inside the bridge, still in this package.
8. **Discovery probe sprawl** (SIMPLIFY, not delete). `probeCodexCli` / `probeClaudeCodeCli` / `inspectOpenCode` / `probeCursorAgentCli` are four ~60-line copies of version-check → auth-check → parse, differing only in commands and one parse rule. Collapse to one table-driven probe. The per-harness special-casing that must survive is the *config* (auth parse, models command), not four function bodies.
9. **`mcp-tool-bridge.ts` compat shim** — 3-line re-export kept "for frozen direct-import tests"; `index.ts` even routes its public `McpToolBridge` type through it. Delete; re-export from `./mcp/index.js`.
10. **Stale lore/slop:** `llm-client.ts` claims a `./llm-client` subpath that `package.json` does not export; `returnStatusTool` is a function-object `Object.assign` chimera so "both bridge factories are callable" — nothing calls it as a function; export the plain object.

## Full method audit

### A. Exported functions

| # | Method | Reach | Verdict | Reason |
|---|---|---|---|---|
| 1 | `createLocalAdapterPool` | BOOTSTRAP (agent-execution boot, local topology) | KEEP | Builds the pool every agent session runs on; the product's harness registration moment. |
| 2 | `modelContextWindow` | INTERNAL (builtin pre-compaction check) | MERGE | Duplicate of `MODEL_CATALOG.contextWindow` with a sync-burden lore comment; derive from the catalog, delete `MODEL_CONTEXT_WINDOWS`. |
| 3 | `createHarnessAdapter` (builtin overload) | TEST-ONLY (prod uses `new BuiltinHarnessAdapter` in pool factory; eval uses this) | DELETE | Factory arm with no production caller. |
| 4 | `createHarnessAdapter` (cli overload) | DEAD (prod uses `new CliHarnessAdapter` in pool factory) | DELETE | Factory arm nothing calls. |
| 5 | `createHarnessAdapter` (direct overload) | DEAD in product (only `tools/eval/provision-harness.ts:128`) | DELETE | `DirectHarnessAdapter` is eval-only; move class to tools/eval or delete outright. |
| 6 | `createHarnessAdapter` (remote overload) | BOOTSTRAP (`boot.ts:196` → worker WS) | MERGE | The one live arm; boot constructs `RemoteHarnessAdapter` directly, factory file dies. |
| 7 | `createHarnessAdapter` (implementation) | see 3–6 | DELETE | Dies with the factory; `isSocket` guard moves next to `RemoteHarnessAdapter` if kept at all. |
| 8 | `createCapabilityCatalog` | INTERNAL (AdapterPool.describe) | SIMPLIFY | Factory returning `{describe, missing}` — a wrapper around two functions; export the functions. |
| 9 | `discoverLocalHarnesses` | BOOTSTRAP + UI:POST /api/harnesses/redetect (via pool.refresh) | SIMPLIFY | Core discovery stays; collapse the four copy-paste CLI probes into one table-driven loop (feature kill 8). |
| 10 | `probeHarnessSession` | TEST-ONLY | DELETE | 334-line "AM3 will wire it" substrate; AM3 never came; deletion is behavior-neutral (caps already gated false). |
| 11 | `setLlmInterceptor` | dev-world seam (cassette installs; e2e lane entry) | KEEP | AU28 founder-ruled inversion: 15 lines that keep the replay e2e lane possible without prod→dev imports; deleting silently turns replay runs into live network calls. |
| 12 | `callLlm` | INTERNAL (builtin loop — every builtin session) | KEEP | The builtin harness's engine; retry/timeout/provider-switch is the product's direct-API path. |
| 13 | `createMcpToolBridge` | AGENT:/api/mcp/:token (mounted pre-auth by boot) | KEEP | THE tool-call door for every CLI harness session. |
| 14 | `openMcpBridgeSession` | BOOTSTRAP (boot wires provisioner port) | MERGE | One string template around `bridge.open`; fold URL construction into `McpToolBridge.open`. |
| 15 | `closeMcpBridgeSession` | BOOTSTRAP (boot wires provisioner port) | DELETE | Pure passthrough to `bridge.close` — the definition of a wrapper. |
| 16 | `createMcpSession` | INTERNAL (bridge.open) | KEEP | Token mint + per-session McpServer + stateful transport — the bridge's actual mechanics. |
| 17 | `createMcpRouter` | AGENT:/api/mcp/:token + POST .../return-status | KEEP | Routes agent JSON-RPC and adjudicates the claude/codex stop hooks — the return-enforcement door. |
| 18 | `provisionHarnessEnvironment` | INTERNAL via boot port (session provisioning, every CLI session) | KEEP | Writes the MCP config + return hook into the sandbox; without it CLI harnesses can't reach HyperIdle tools. |
| 19 | `createReturnEnforcement` | BOOTSTRAP (boot) + INTERNAL (cli adapter re-engage) | SIMPLIFY | Drop the test-only `{isolated}` spec and the module singleton; plain factory, instance injected into `CliHarnessAdapter` (feature kill 6). |
| 20 | `createSandboxAdapter` | BOOTSTRAP (boot, topology switch) | KEEP | Two-line topology switch between the only two real sandbox modes. |

### B. Class member methods

| # | Method | Reach | Verdict | Reason |
|---|---|---|---|---|
| 21 | `AdapterPool.refresh` | UI:POST /api/harnesses/redetect | KEEP | The Settings "redetect" button; refreshes readiness/auth/models. |
| 22 | `AdapterPool.size` | UI:agent-profile (`registeredHarnessCount` → harnessAvailable) | KEEP | One-line getter feeding a real UI availability flag. |
| 23 | `AdapterPool.register` | BOOTSTRAP + AGENT:WS /ws/worker (worker-ingress:194) | KEEP | How every adapter — local at boot, remote at worker register — enters the pool. |
| 24 | `AdapterPool.unregister` | AGENT:WS /ws/worker (close + stale-reconnect evict) | KEEP | Worker lifecycle; without it dead workers stay selectable. |
| 25 | `AdapterPool.has` | AGENT:WS /ws/worker (duplicate-id hijack guard) | KEEP | One-line guard the worker reconnect path depends on. |
| 26 | `AdapterPool.list` | DEAD door (only `workerConnections` → GET /api/workers, which nothing calls) | DELETE | Kill the route, the read-model, and this method together (feature kill 3). |
| 27 | `AdapterPool.pause` | UI:SettingsWorker toggle → WS pause msg | KEEP | Live shipped worker-pause control. |
| 28 | `AdapterPool.resume` | UI:SettingsWorker toggle → WS resume msg | KEEP | Other half of the same control. |
| 29 | `AdapterPool.select` | INTERNAL→provisioner:950 (every agent-session door) | KEEP | The pool's reason to exist — least-loaded eligible adapter per session. |
| 30 | `AdapterPool.describe` | UI:GET /api/harnesses (+ agent-profile, validate-agent-config) | KEEP | The capability-descriptor surface behind the harness picker and guided setup. |
| 31 | `AdapterPool.release` | INTERNAL→provisioner (session end/crash paths) | KEEP | Load accounting; without it capacity leaks to zero. |
| 32 | `BuiltinHarnessAdapter.setSessionToolRegistry` | INTERNAL→provisioner:1247 | KEEP | Per-session tool injection — the builtin's whole tool surface arrives here. |
| 33 | `BuiltinHarnessAdapter.startSession` | INTERNAL→provisioner (pool.select) | KEEP | HarnessAdapter contract; builtin session start. |
| 34 | `BuiltinHarnessAdapter.streamEvents` | INTERNAL→provisioner drain | KEEP | Event stream the whole session lifecycle consumes. |
| 35 | `BuiltinHarnessAdapter.stopSession` | INTERNAL→provisioner | KEEP | Contract; abort + outcome. |
| 36 | `BuiltinHarnessAdapter.getCapabilities` | INTERNAL→pool.describe + provisioner | KEEP | Feeds descriptor surface and channel selection. |
| 37 | `BuiltinHarnessAdapter.getForceReturnCount` | INTERNAL→provisioner:1617 | KEEP | Unifies in-turn force count into the turn metric the drain gate reads. |
| 38 | `CliHarnessAdapter.checkAvailability` | BOOTSTRAP (pool factory registration gate) | KEEP | Decides which CLI harnesses register at all; drop the test-only `whichFn` deps while here. |
| 39 | `CliHarnessAdapter.startSession` | INTERNAL→provisioner (pool.select) | KEEP | Spawns the real claude/codex/opencode/cursor-agent process — the core door. |
| 40 | `CliHarnessAdapter.streamEvents` | INTERNAL→provisioner drain | KEEP | ndjson→HarnessEvent translation + opencode process-reengage; live return enforcement. |
| 41 | `CliHarnessAdapter.stopSession` | INTERNAL→provisioner | KEEP | SIGTERM→SIGKILL teardown; contract. |
| 42 | `CliHarnessAdapter.getCapabilities` | INTERNAL→pool.describe + provisioner | KEEP | Declares channel + MCP dialect the provisioner branches on. |
| 43 | `DisabledSandboxAdapter.spawn` | BOOTSTRAP (server topology) | KEEP | Loud-reject guard letting the shared backend boot with zero agents (AQ1). |
| 44 | `DisabledSandboxAdapter.exec` | DEAD (port member `exec` has no production caller anywhere) | DELETE | Dies with the port member (row 68). |
| 45 | `DisabledSandboxAdapter.destroy` | BOOTSTRAP (server topology) | KEEP | Same guard, teardown half. |
| 46 | `LocalSandboxAdapter.spawn` | INTERNAL→provisioner:1012 | KEEP | Creates the per-session working directory — every local session. |
| 47 | `LocalSandboxAdapter.exec` | TEST-ONLY (`workspace-adapter.test.ts` only) | DELETE | No production caller; `runShell` helper and its lore die too. |
| 48 | `LocalSandboxAdapter.destroy` | INTERNAL→provisioner:1702,1728 | KEEP | Sandbox teardown on session end. |
| 49 | `LocalSandboxAdapter.exists` | TEST-ONLY | DELETE | Not even on the port; a test convenience living in production. |
| 50 | `RemoteHarnessAdapter.startSession` | AGENT:WS /ws/worker (dispatch to worker) | KEEP | Shared-mode's only agent execution path — a peer desktop runs the session. |
| 51 | `RemoteHarnessAdapter.streamEvents` | AGENT:WS /ws/worker | KEEP | Worker event relay into the same drain loop. |
| 52 | `RemoteHarnessAdapter.stopSession` | AGENT:WS /ws/worker | KEEP | Stop over the wire + result await. |
| 53 | `RemoteHarnessAdapter.getCapabilities` | INTERNAL→pool.describe + provisioner | KEEP | Declares process-reengage channel for remote. |
| 54 | `RemoteHarnessAdapter.dispatchMessage` | AGENT:WS /ws/worker (worker-ingress:214) | KEEP | The S2-F07 routing without which every remote streamEvents hangs forever. |

### Types / DI ports

| Declaration | Verdict | Reason |
|---|---|---|
| `SelectRequirements` | KEEP | All three members production-live: provisioner passes modelProviders/harnessType, admitSession passes disabledTypes (AM4). |
| `AdapterFilter` | SIMPLIFY | `kind` member has zero production callers (routes filter by type/includeKnownMissing only); drop `kind`, and the type shrinks further when `list` dies. |
| `HarnessAdapterSpec` | DELETE | Dies with the factory (rows 3–7). |
| `CallLlmOptions` | KEEP | `callLlm`'s signature; internal. |
| `LlmInterceptor` | KEEP | The AU28 seam's type (row 11). |
| `LlmContentBlock` | KEEP | `LlmMessage.content`'s element type; internal wire shape. |
| `LlmMessage` | KEEP | Internal wire shape both providers normalize to. |
| `LlmResponse` | KEEP | Same. |
| `McpToolBridge` | SIMPLIFY | Survives as the bridge port, but `open` absorbs baseUrl/url (row 14) and the type moves out of the `mcp-tool-bridge.ts` shim. |
| `ProvisionOptions` | KEEP | `provisionHarnessEnvironment`'s input; every field production-used. |
| `ReturnEnforcementSpec` | DELETE | `isolated` is set by tests only; dies with the singleton (feature kill 6). |
| `SandboxHandle` | KEEP | spawn/destroy contract; provisioner holds it across the session. |
| `ExecResult` | DELETE | Dies with `exec` (rows 44/47). |
| `SandboxAdapter` | SIMPLIFY | Drop `exec`; the port becomes `spawn`/`destroy` — what the product actually uses. |

### Const / enum exports

| Declaration | Verdict | Reason |
|---|---|---|
| `returnStatusTool` | SIMPLIFY | Production-live (AGENT: `return_status` tool, injected per session by provisioner:1237) — but the callable-function `Object.assign` chimera serves nothing that calls it as a function; export the plain definition object. |

## Holes this leaves

- **Session probe:** the AM2 real-harness-discovery integration test and its committed fixtures die. Runtime `fileEditing/toolUse` capability flags stay false for undiscovered families — exactly what production already does today, so no observable change. If AM3-style probe-gated capabilities are ever wanted, the probe gets rewritten against that real need.
- **Factory deletion:** `tools/eval/provision-harness.ts` must construct `BuiltinHarnessAdapter`/`CliHarnessAdapter` directly (requires exporting both classes from the barrel) and absorb `DirectHarnessAdapter` (~90 lines) into tools/eval — or the eval "external raw adapter" mode dies with it.
- **`GET /api/workers`:** worker admin visibility over HTTP is gone. The desktop worker panel is unaffected (it uses the Electron preload). If a shared-server admin view is ever actually built, re-add the route then — earned, not preserved.
- **Sandbox `exec`:** any future "run a command in the sandbox from the server" feature re-adds it against a real caller. Today that caller does not exist.
- **Enforcement singleton removal:** touches `CliHarnessAdapter`'s constructor (inject the registry) and ~8 test files that currently pass `{isolated: true}` — they call the plain factory instead, which is strictly simpler.
- **MERGE of MCP wrappers:** `boot.ts` re-wires `openMcpBridge`/`closeMcpBridge` to the bridge methods; the provisioner port is unchanged.
- **`MODEL_CONTEXT_WINDOWS` merge:** the two catalog-sync test files (`context-window.test.ts` re-keying asserts, `AH2-cost-context.test.ts`) die — the sync problem itself no longer exists.
