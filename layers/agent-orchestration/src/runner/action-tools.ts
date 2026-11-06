import { err, ok, type RegisteredTool } from "@hyperidle/harness-protocol";
import { recordReviewSession } from "@hyperidle/run-orchestration";
import type { RunnerDb } from "@hyperidle/runner-db";
import type { CoreDoor } from "./core-door.js";

/** One action as an agent's tool: its name, sentence and shape. */
export type ActionToolDeclaration = Omit<RegisteredTool<RunnerDb>, "handler">;

/** A send that asks a person something ends the session; the answer brings that session back. */
function asksAPerson(args: unknown): boolean {
	if (typeof args !== "object" || args === null) return false;
	const body = args as { readonly review?: unknown; readonly questionnaire?: unknown };
	return body.review !== undefined || body.questionnaire !== undefined;
}

/**
 * Each action becomes a tool that calls the door as the session's agent, naming its run. When the
 * agent files a review or a question, the runner remembers which session filed it.
 */
export function actionToolsThroughDoor(
	catalog: readonly ActionToolDeclaration[],
	door: CoreDoor,
	keyFor: (agentId: string) => string | undefined,
): readonly RegisteredTool<RunnerDb>[] {
	return catalog.map((declaration) => ({
		...declaration,
		handler: async (args, ctx) => {
			const key = keyFor(ctx.agentId);
			if (!key) return err("no_key", "This agent has no key on this computer yet.");
			const result = await door.call<{ readonly message?: { readonly id: string } }>(
				key,
				declaration.name,
				args,
				{
					sessionId: ctx.sessionId,
					taskId: ctx.taskId || null,
					threadId: ctx.threadId ?? null,
				},
			);
			if (!result.ok) {
				return err(
					result.problems[0]?.code ?? "problem",
					result.problems.map((p) => p.message).join("; "),
				);
			}
			const filed = result.data.message?.id;
			if (declaration.name === "send_message" && filed && asksAPerson(args)) {
				await recordReviewSession(
					ctx.db,
					{ reviewMessageId: filed, sessionId: ctx.sessionId },
					new Date().toISOString(),
				);
			}
			return ok(result.data);
		},
	}));
}
