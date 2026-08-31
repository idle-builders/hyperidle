/**
 * The dispatch: given a pre-assembled list of tool definitions (built by
 * `@hyperidle/tool-handlers`, DI-wired to domain-Service ports) + a
 * per-invocation `ToolContext`, build a `ToolRegistry` that role-filters,
 * validates args against each tool's zod schema, and calls the matched
 * handler.
 *
 * @lore AU19 Increment 4 (§7.5 C1): this is `packages/server/src/tools/
 * tool-registry.ts`'s `buildToolRegistry`/`invoke`, split at the DB boundary.
 * Zero domain Service or `@hyperidle/db` import here.
 *
 * @lore AU31 §2.5: relocated from `@hyperidle/harness-registry` (agent-
 * execution) into `@hyperidle/tool-handlers` (agent-orchestration) — this
 * file imports only `@hyperidle/tool-protocol` and holds zero execution content,
 * so it belongs with the layer that owns the definitions it dispatches, not
 * the layer that owns harness adapters.
 */

import {
	type ClaudeToolSpec,
	err,
	type RegisteredTool,
	type ToolContext,
	type ToolRegistry,
	type ToolResult,
} from "@hyperidle/harness-protocol";
import { type BuildToolRegistryOptions, toClaudeToolSpec } from "./tool-types.js";

/**
 * Build a fresh registry bound to the given context, filtered to the agent's
 * role.
 *
 * @lore I2 review W3: when the requested tool exists in the global tool
 * catalogue but is filtered out for this role, `invoke()` returns
 * `FORBIDDEN` (not `NOT_FOUND`). NOT_FOUND is reserved for genuinely
 * unknown tool names so an operator debugging "missing tool" failures
 * can distinguish a typo (NOT_FOUND) from a role-boundary breach
 * (FORBIDDEN). The harness still applies its own per-session allowlist
 * (`session-provisioning.ts`); this is the inner gate.
 */
export function buildToolRegistry<TDb = unknown>(
	allToolDefinitions: readonly RegisteredTool<TDb>[],
	ctx: ToolContext<TDb>,
	options: BuildToolRegistryOptions<TDb>,
): ToolRegistry<TDb> {
	const roleFiltered = options.useOnlyExtraTools
		? []
		: allToolDefinitions.filter((d) => d.roles === undefined || d.roles.includes(options.role));
	const definitions: readonly RegisteredTool<TDb>[] = options.extraTools?.length
		? [...roleFiltered, ...options.extraTools]
		: roleFiltered;

	const byName = new Map(definitions.map((d) => [d.name, d]));
	const allByName = new Map(allToolDefinitions.map((d) => [d.name, d]));

	async function invoke(name: string, rawArgs: unknown): Promise<ToolResult> {
		const def = byName.get(name);
		if (!def) {
			if (allByName.has(name)) {
				return err("FORBIDDEN", `Tool not available to this role: ${name}`);
			}
			return err("NOT_FOUND", `Unknown tool: ${name}`);
		}

		const parsed = def.inputSchema.safeParse(rawArgs ?? {});
		if (!parsed.success) {
			return err("INVALID_INPUT", parsed.error.message);
		}

		return def.handler(parsed.data, ctx);
	}

	return {
		definitions,
		invoke,
		toClaudeToolSpecs: (): readonly ClaudeToolSpec[] => definitions.map((d) => toClaudeToolSpec(d)),
	};
}
