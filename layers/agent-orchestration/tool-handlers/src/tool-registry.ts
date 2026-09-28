import {
	type ClaudeToolSpec,
	err,
	type RegisteredTool,
	type ToolContext,
	type ToolRegistry,
	type ToolResult,
} from "@hyperidle/harness-protocol";
import { type BuildToolRegistryOptions, toClaudeToolSpec } from "./tool-types.js";

// Build a fresh registry; every agent gets every definition plus per-session extraTools.
export function buildToolRegistry<TDb = unknown>(
	allToolDefinitions: readonly RegisteredTool<TDb>[],
	ctx: ToolContext<TDb>,
	options: BuildToolRegistryOptions<TDb>,
): ToolRegistry<TDb> {
	const definitions: readonly RegisteredTool<TDb>[] = options.extraTools?.length
		? [...allToolDefinitions, ...options.extraTools]
		: allToolDefinitions;

	const byName = new Map(definitions.map((d) => [d.name, d]));

	function invoke(name: string, rawArgs: unknown): Promise<ToolResult> {
		const def = byName.get(name);
		if (!def) {
			return Promise.resolve(err("NOT_FOUND", `Unknown tool: ${name}`));
		}

		const parsed = def.inputSchema.safeParse(rawArgs ?? {});
		if (!parsed.success) {
			return Promise.resolve(err("INVALID_INPUT", parsed.error.message));
		}

		return def.handler(parsed.data, ctx);
	}

	return {
		definitions,
		invoke,
		toClaudeToolSpecs: (): readonly ClaudeToolSpec[] => definitions.map((d) => toClaudeToolSpec(d)),
	};
}
