/**
 * Barrel for @hyperidle/harness-registry (agent-execution Layer Service).
 *
 * DB-free: deps = @hyperidle/shared only, never @hyperidle/db (Mechanism B).
 * Typed functions/classes only — no raw table (there is none; this Service
 * owns zero tables).
 *
 * @lore AU19 Increment 4: finalized from the Increment-0 minimal-slice
 * proof (a single synthetic `harness-capabilities.ts`) into the real
 * migration of `packages/server/src/harness/*` (21 files). The adapter
 * pool, all harness adapters (builtin/CLI/remote), harness discovery,
 * capability descriptors, the LLM client + cassette lane, sandbox adapters,
 * return-enforcement registry, return-gate, and CLI provisioning helpers all
 * live here now.
 */

export type { HarnessCapabilityDescriptor } from "@hyperidle/shared";
// -- adapter-pool (registry of HarnessAdapter instances) --
export type { AdapterInfo, AdapterMeta } from "./adapter-pool.js";
export {
	AdapterPool,
	createLocalAdapterPool,
	type SelectedEntry,
	type SelectRequirements,
} from "./adapter-pool.js";
// -- builtin harness adapter (direct LLM API loop) --
export { BuiltinHarnessAdapter } from "./builtin-harness-adapter.js";
// -- CLI harness adapter (claude/codex/opencode/cursor-agent) --
export { CliHarnessAdapter } from "./cli-harness-adapter.js";
// -- CLI MCP config (writes .mcp.json / config.toml for CLI auto-discovery) --
export {
	EMITTED_ROOTS_CLI_MCP_CONFIG,
	type WriteCliMcpConfigParams,
	type WriteCliMcpConfigResult,
	writeCliMcpConfig,
} from "./cli-mcp-config.js";
// -- context window (model context-window sizing / near-limit detection) --
export {
	contextWindowForModel,
	DEFAULT_CONTEXT_WINDOW,
	isAboveThreshold,
	MODEL_CONTEXT_WINDOWS,
} from "./context-window.js";
// -- disabled sandbox adapter (no-filesystem fallback) --
export { DisabledSandboxAdapter } from "./disabled-sandbox-adapter.js";
// -- harness capability descriptors --
export {
	describeRegisteredHarness,
	KNOWN_HARNESS_FAMILIES,
	missingKnownHarnessDescriptors,
} from "./harness-capability-descriptors.js";
// -- harness discovery (local CLI probing) --
export {
	BUILTIN_MODELS_FETCH_TIMEOUT_MS,
	discoverLocalHarnesses,
	type HarnessDiscoveryInput,
	type HarnessDiscoveryResult,
	type HarnessSessionProbeResult,
	parseClaudeModelsOutput,
	parseOpencodeModelsOutput,
	probeClaudeCodeMcpList,
	probeCodexMcpList,
	probeEnvironmentClis,
	probeOpenCodeCli,
	probeOpencodeMcpList,
} from "./harness-discovery.js";
// -- harness session probe (post-provision readiness probe) --
export { probeHarnessSession } from "./harness-session-probe.js";
// LLM client, cassette, cost, wire types: INTERNAL to builtin adapter.
// Access via @hyperidle/harness-registry/llm-client subpath (test/eval use only).
// -- local sandbox adapter (per-session working-dir sandbox) --
export { LocalSandboxAdapter } from "./local-sandbox-adapter.js";
// -- provision-return-hook (per-harness AL6 enforcement provisioning) --
export {
	EMITTED_ROOTS_CLAUDE_SETTINGS,
	EMITTED_ROOTS_CODEX_HOME,
	EMITTED_ROOTS_OPENCODE_PLUGIN,
	type ProvisionReturnHookOptions,
	provisionReturnHook,
} from "./provision-return-hook.js";
// -- remote harness adapter (WS client speaking to a remote-worker) --
export { RemoteHarnessAdapter } from "./remote-harness-adapter.js";
// -- return-enforcement registry (per-session force-return bookkeeping) --
export {
	createEnforcementRegistry,
	type EnforcementEntry,
	type EnforcementRegistry,
	enforcementRegistry,
} from "./return-enforcement-registry.js";
// -- return-gate (drain-end un-bypassable backstop) --
export {
	createReturnGate,
	evaluateReturn,
	type ReturnGate,
	type ReturnVerdict,
} from "./return-gate.js";
// -- sandbox adapter interface --
export type { ExecResult, SandboxAdapter, SandboxHandle } from "./sandbox-adapter.js";
