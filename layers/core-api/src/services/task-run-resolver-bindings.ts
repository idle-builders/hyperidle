/**
 * AU21 §9 Increment 12 (Decision H3), Wave C — the ONE shared,
 * fully-wired `TaskRunResolverDeps` every real `task_run`-baking composition
 * site (`run-orchestration-composition.ts`'s `workAccessor.transitionTask`,
 * `policy-bindings.ts`'s pre-bound `handoffDeps.taskRunResolver`, and the
 * three direct `resolveTaskRunRequest`/`transitionTask` callers in
 * `routes/tasks.ts`, `routes/bets.ts`, `app.ts`'s dependency-watcher)
 * imports instead of each separately constructing `{ requireRunnableAgent }`
 * — the same factory-curry idiom `policy-bindings.ts`'s pre-bound `handoff`
 * already uses. Centralizing the wiring here means `getTeamById`/
 * `assembleSessionDocuments` (Decision H3's contextBundle bake) reach every
 * real `task_run` emit site from ONE place, instead of five independently
 * drifting copies.
 *
 * @lore BC4 follow-up (architecture.md §8.3): `getAgentIdentity` used to read
 * `@hyperidle/document`'s repository function directly. `TaskRunResolverDeps`
 * is built once at compose-time now, as a FACTORY closing over the composed
 * `search_documents` runner (the same `lazySearchDocuments` idiom
 * `compose.ts` already uses) — never `@hyperidle/document` itself
 * (architecture.md §8.1: a neighbour reaches documents only through the
 * three actions). `resolveTaskRunRequest` only ever hands this a raw `db`,
 * no `ActionContext` — there is no calling human/agent in scope this deep
 * in dispatch — so the actor used for the read is the agent whose identity
 * is being baked: it is always allowed to read its own `agent_file`
 * document (§5.1), and no other choice is available here. The `EventBus` on
 * the synthesized `ActionContext` is a fresh, unused instance:
 * `search_documents`'s own `run` never touches `ctx.eventBus` (a read emits
 * nothing) — the same "inert bus for a call path that never emits"
 * precedent `run-orchestration-composition.ts:404` already uses.
 */
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

// AU31 §7.2 (R2): each dependency is a wrapping arrow, never the raw service
// symbol — a bag of arrows over the layer's own services IS a face's
// sanctioned content; the raw symbol itself must never be the thing that
// escapes through an exported binding.
export function buildTaskRunResolverDeps(
	searchDocuments: SearchDocumentsRunFn,
): TaskRunResolverDeps {
	return {
		requireRunnableAgent: (db, agentId) => requireRunnableAgent(db, agentId),
		// The agent's identity document. It was missing here while the port was
		// optional, so every real `task_run` baked an empty identity.
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
