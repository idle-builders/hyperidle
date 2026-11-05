import type { HyperIdleDb } from "@hyperidle/db";
import type { RegisteredTool } from "@hyperidle/harness-protocol";
import type { Action } from "./action.js";

/** One action as an agent's tool: name, sentence and shape. Its runner calls the door as the agent. */
export type ActionToolDeclaration = Omit<RegisteredTool<HyperIdleDb>, "handler">;

/**
 * Every action, as the tools an agent's session gets. No `roles`: every actor gets every action;
 * authorization is an invariant, not a filter.
 */
export function actionCatalog(actions: readonly Action[]): readonly ActionToolDeclaration[] {
	return actions.map((action) => ({
		name: action.declaration.name,
		description: action.declaration.sentence,
		inputSchema: action.declaration.input,
	}));
}
