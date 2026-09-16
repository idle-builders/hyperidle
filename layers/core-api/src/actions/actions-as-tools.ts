import type { HyperIdleDb } from "@hyperidle/db";
import { err, ok, type RegisteredTool, type ToolResult } from "@hyperidle/harness-protocol";
import type { Action } from "./action.js";

/**
 * the MCP loop: for each action, register a tool with the action's
 * name, sentence and shape, calling it in-process as the session's agent —
 * the first tool that does not dial its own process over HTTP. No `roles`:
 * every actor gets every action; authorization is an invariant, not a
 * filter. the architecture doc §7.
 */
export function actionsAsTools(actions: readonly Action[]): readonly RegisteredTool<HyperIdleDb>[] {
	return actions.map((action) => ({
		name: action.declaration.name,
		description: action.declaration.sentence,
		inputSchema: action.declaration.input,
		handler: async (args, ctx): Promise<ToolResult> => {
			const result = await action.run(
				{ actor: ctx.agentId, db: ctx.db, eventBus: ctx.eventBus, now: new Date().toISOString() },
				args,
			);
			return result.ok
				? ok(result.data)
				: err(
						result.problems[0]?.code ?? "problem",
						result.problems.map((p) => p.message).join("; "),
					);
		},
	}));
}
