import type { HyperIdleDb } from "@hyperidle/db";
import { err, ok, type RegisteredTool, type ToolResult } from "@hyperidle/harness-protocol";
import type { Action } from "./action.js";

/**
 * This Layer's own copy of `core-api/src/actions/actions-as-tools.ts`'s MCP
 * loop: for each session action, register a tool with
 * the action's name, sentence and shape, calling it in-process as the
 * session's agent. `bootAgentOrchestration` exposes the result as this
 * Layer's own `actionTools`; each application's `createServer` joins it with
 * core's own list into `ServerHandle.actionTools` (the deferred-binding
 * join).
 */
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
