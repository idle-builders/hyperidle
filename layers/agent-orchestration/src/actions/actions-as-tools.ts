import type { HyperIdleDb } from "@hyperidle/db";
import { err, ok, type RegisteredTool, type ToolResult } from "@hyperidle/harness-protocol";
import type { Action } from "./action.js";

export function actionsAsTools(actions: readonly Action[]): readonly RegisteredTool<HyperIdleDb>[] {
	return actions.map((action) => ({
		name: action.declaration.name,
		description: action.declaration.sentence,
		inputSchema: action.declaration.input,
		handler: async (args, ctx): Promise<ToolResult> => {
			const result = await action.run(
				{
					actor: ctx.agentId,
					db: ctx.db,
					eventBus: ctx.eventBus,
					now: new Date().toISOString(),
					caller: {
						sessionId: ctx.sessionId,
						taskId: ctx.taskId || null,
						threadId: ctx.threadId ?? null,
					},
				},
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
