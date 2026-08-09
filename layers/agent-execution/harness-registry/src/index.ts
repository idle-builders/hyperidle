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
 */
export {
	type AdapterFilter,
	AdapterPool,
	createLocalAdapterPool,
	type SelectRequirements,
} from "./adapter-pool.js";
export { createHarnessAdapter, type HarnessAdapterSpec } from "./harness-adapter-factory.js";
export type { McpToolBridge } from "./mcp-tool-bridge.js";
export {
	type ProvisionOptions,
	provisionHarnessEnvironment,
} from "./provision-harness-environment.js";
export {
	createReturnEnforcement,
	type ReturnEnforcementSpec,
} from "./return-enforcement.js";
export {
	createSandboxAdapter,
	type ExecResult,
	type SandboxAdapter,
	type SandboxHandle,
} from "./sandbox-adapter.js";
