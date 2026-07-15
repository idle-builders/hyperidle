/**
 * Barrel for @hyperidle/tool-provider (agent-execution Layer Service).
 *
 * DB-free: deps = @hyperidle/shared only, never @hyperidle/db (Mechanism B).
 * Holds the harness-facing tool surface only: descriptors (name/schema/
 * roles/description) + the dispatch that calls an injected handler port.
 * Zero domain Service, zero table, zero `@hyperidle/db` — the DB-/domain-
 * touching handler bodies live in `@hyperidle/tool-handlers`
 * (agent-orchestration).
 *
 * @lore AU19 Increment 4 (§7.5 C1 resolution): migrated the execution-side
 * half of `packages/server/src/tools/{tool-registry,tool-result,
 * assistant-tool-result,return-status-tool}.ts`. The pure erasure/
 * classification helpers (`toRegistered`/`toClaudeToolSpec`/
 * `classifyReversibility`/`composeWorkflowAllowDeny`/`canonicalJson`/
 * `identityHash`/`toolsForRole`) and every cross-boundary type moved to
 * `@hyperidle/shared` (both `tool-provider` and `tool-handlers` need them,
 * and Mechanism B forbids `tool-handlers` from depending on
 * `@hyperidle/tool-provider`).
 */

export type {
	AssistantToolResult,
	AssistantToolShape,
	BuildToolRegistryOptions,
	ClaudeToolSpec,
	ProposedCallWorkflowPort,
	RegisteredTool,
	RegistrySessionWorkflow,
	ToolContext,
	ToolDefinition,
	ToolHandler,
	ToolRegistry,
	ToolResult,
} from "@hyperidle/shared";
export {
	canonicalJson,
	classifyReversibility,
	composeWorkflowAllowDeny,
	err,
	identityHash,
	ok,
	toClaudeToolSpec,
	toolsForRole,
	toRegistered,
	wrapForRegistry,
} from "@hyperidle/shared";
export { type ReturnStatusResult, returnStatusTool } from "./return-status-tool.js";
export { buildToolRegistry } from "./tool-registry.js";
