/**
 * @lore AU31 §2.5: `buildToolRegistry` (the dispatch — role-filter +
 * zod-validate + workflow-route closure over shared types, zero execution
 * content) moved to `@hyperidle/tool-handlers` — the agent-orchestration
 * Service that owns the definitions it dispatches. Its only production
 * caller was the core wrapper AU31 deleted (`services/tool-provider-
 * bindings.ts`); nothing inside this package called it.
 *
 * @lore AU34: the `AdapterInfo`/`AdapterMeta`/`HarnessAdapter`/
 * `HarnessCapabilityDescriptor`/`ToolRegistry` re-export from the (now-
 * deleted) `@hyperidle/shared` barrel had zero consumers importing them
 * through this package — every real caller already reached them via
 * `@hyperidle/harness-protocol`/`@hyperidle/harness-capability`/
 * `@hyperidle/tool-protocol` directly, so the re-export is dropped rather
 * than repointed.
 *
 * @lore AU44-review: the worker-protocol.ts copy is deleted; the wire
 * protocol types live in @hyperidle/harness-protocol only. Consumers that
 * previously imported them through this package (agent-execution, core-api
 * tests) were moved to import from @hyperidle/harness-protocol directly —
 * re-exporting is blocked by no-laundered-re-exports because harness-protocol
 * is a named-audience package.
 */

export {
	type ActionGateEntry,
	type ActionGateRegistry,
	createActionGateRegistry,
	type GateRule,
	type PendingBlock,
} from "./action-gate-registry.js";
export {
	type AdapterFilter,
	AdapterPool,
	createLocalAdapterPool,
	type SelectRequirements,
} from "./adapter-pool.js";
export { BuiltinHarnessAdapter } from "./builtin-harness-adapter.js";
export { type CliAdapterConfig, CliHarnessAdapter } from "./cli-harness-adapter.js";
export {
	type PluginStdioServer,
	writePluginStdioMcpEntries,
} from "./cli-mcp-config.js";
export type { EnforcementEntry, EnforcementRegistry } from "./enforcement-registry.js";
export { normalizeHarnessEvent, preMapClaudeEvent } from "./harness-event-normalization.js";
export { type CallLlmOptions, callLlm } from "./llm-client.js";
export type { McpToolBridge } from "./mcp-tool-bridge.js";
export { type GateHookOptions, installGateHook } from "./provision-gate-hook.js";
export {
	type ProvisionOptions,
	provisionHarnessEnvironment,
} from "./provision-harness-environment.js";
export { RemoteHarnessAdapter, type WsLike } from "./remote-harness-adapter.js";
export { createReturnEnforcement } from "./return-enforcement.js";
export {
	createSandboxAdapter,
	type SandboxAdapter,
	type SandboxHandle,
} from "./sandbox-adapter.js";
