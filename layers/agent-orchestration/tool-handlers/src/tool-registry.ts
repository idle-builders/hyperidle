/**
 * The dispatch: given a pre-assembled list of tool definitions (built by
 * `@hyperidle/tool-handlers`, DI-wired to domain-Service ports) + a
 * per-invocation `ToolContext`, build a `ToolRegistry` that
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
 * Build a fresh registry bound to the given context. Every agent gets every
 * definition — no tool is scoped to a role — plus the per-session
 * `extraTools`. The harness still applies its own per-session allowlist
 * (`session-provisioning.ts`).
 */
export function buildToolRegistry<TDb = unknown>(
	allToolDefinitions: readonly RegisteredTool<TDb>[],
	ctx: ToolContext<TDb>,
	options: BuildToolRegistryOptions<TDb>,
): ToolRegistry<TDb> {
	const definitions: readonly RegisteredTool<TDb>[] = options.extraTools?.length
		? [...allToolDefinitions, ...options.extraTools]
		: allToolDefinitions;

	const byName = new Map(definitions.map((d) => [d.name, d]));

	async function invoke(name: string, rawArgs: unknown): Promise<ToolResult> {
		const def = byName.get(name);
		if (!def) {
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
