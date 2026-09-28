// @lore: task-run-resolver-bindings — actor = agent own id (allowed its agent_file); synthesized ActionContext has inert EventBus; search_documents emits nothing
import type { HyperIdleDb } from "@hyperidle/db";
import { assembleSessionDocuments } from "@hyperidle/document";
import { EventBus } from "@hyperidle/event-bus";
import { readServerConfig } from "@hyperidle/settings";
import type { TaskRunResolverDeps } from "@hyperidle/task";
import { getTeam, requireRunnableAgent } from "@hyperidle/user";
import type { ActionContext, SearchDocumentsRunFn } from "../actions/action.js";

/**
 * The agent's identity document body — `search_documents({parent:{kind:
 * "agent",id},slot:"agent_file",status:"active"})[0]?.body ?? null`. Shared
 * by every caller that needs it (`compose.ts`'s thread bag,
 * `buildTaskRunResolverDeps` below) so the query lives in exactly one place.
 */
export async function resolveAgentIdentityBody(
	ctx: ActionContext,
	agentId: string,
	searchDocuments: SearchDocumentsRunFn,
): Promise<string | null> {
	const result = await searchDocuments(ctx, {
		parent: { kind: "agent", id: agentId },
		slot: "agent_file",
		status: "active",
	});
	return result.ok ? (result.data[0]?.body ?? null) : null;
}

// Each dependency is a wrapping arrow, never the raw service
// symbol — a bag of arrows over the layer's own services IS a face's
// sanctioned content; the raw symbol itself must never be the thing that
// escapes through an exported binding.
export function buildTaskRunResolverDeps(
	searchDocuments: SearchDocumentsRunFn,
): TaskRunResolverDeps {
	return {
		requireRunnableAgent: (db, agentId) => requireRunnableAgent(db, agentId),
		getAgentIdentity: (db: HyperIdleDb, agentId: string) =>
			resolveAgentIdentityBody(
				{ actor: agentId, db, eventBus: new EventBus(), now: new Date().toISOString() },
				agentId,
				searchDocuments,
			),
		getTeamById: (db, id) => getTeam(db, { id }),
		assembleSessionDocuments: (...args: Parameters<typeof assembleSessionDocuments>) =>
			assembleSessionDocuments(...args),
		readServerConfig: (...args: Parameters<typeof readServerConfig>) => readServerConfig(...args),
		// `task-run-resolver.ts` bakes `callingThreadId` straight from
		// `task.threadId`, a real column.
	};
}
