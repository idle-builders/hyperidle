/**
 * AU21 §6 Decision B placement ruling — the `knowledge_action` emit-time
 * resolver, paired with its real emit site (`routes/knowledge.ts`'s
 * `POST /:id/flag`). Does exactly what `resolveIntentInputInternal`'s
 * "knowledge_action" case did at drain time
 * (`session-requests/src/service.ts:738-756`, deleted there by this wave),
 * reading only `knowledge`'s own tables, plus the shared ast-`<userId>`
 * runnability invariant (`@hyperidle/users`' `requireRunnableAgent`) — so the
 * emitting route can bake the full request at emit time instead of leaving
 * it for the drain to resolve later.
 *
 * @lore Mechanism C (composition-boundary-guard): `@hyperidle/knowledge`
 * depends ONLY on `@hyperidle/db` + `@hyperidle/shared` (`package.json`) —
 * never on another Service (`@hyperidle/users`) directly, even for the one
 * genuinely cross-cutting invariant §6 Decision B carves out. This resolver
 * therefore takes `requireRunnableAgent` as an INJECTED dependency
 * (`KnowledgeActionResolverDeps`), not a static import; the real emit site
 * (`routes/knowledge.ts`, core-api Layer code — not a nested Service, so it
 * may legitimately import both `@hyperidle/knowledge` and `@hyperidle/users`)
 * wires the real `requireRunnableAgent` in at the call site. Same shape as
 * `assistant-turn-resolver.ts`'s `AssistantTurnResolverDeps` /
 * `task-run-resolver.ts`'s `TaskRunResolverDeps`.
 */

import type { HyperIdleDb } from "@hyperidle/db";
import { get } from "./knowledge-repository.js";

/** Injected dependency — see the Mechanism C `@lore` above. */
export interface KnowledgeActionResolverDeps {
	requireRunnableAgent(db: HyperIdleDb, agentId: string): Promise<unknown>;
}

/** Thrown when the source knowledge item does not exist or is archived. */
export class KnowledgeActionSourceUnavailableError extends Error {}

/** The baked `knowledge_action` request shape, matching `resolveIntentInputInternal`'s former return. */
export interface BakedKnowledgeActionRequest {
	readonly defaultAgentId: string;
	readonly sourceKind: "knowledge";
	readonly sourceId: string;
	readonly streamId: string;
	readonly sourceCorrelation: {
		readonly knowledgeItemId: string;
		readonly action: "review";
		readonly scopeId?: string;
	};
}

/**
 * Resolve + validate a `knowledge_action` run at emit time: strip the
 * `knowledge:` prefix from `sourceId` to get the bare item id, load the item
 * (rejecting if missing or archived), resolve the target agent as the item's
 * own `updatedBy` (the reviewer is whoever last touched the item, never the
 * flagging requester), validate that agent's runnability via the shared
 * core-api invariant, and bake the full request.
 */
export async function resolveKnowledgeActionRequest(
	db: HyperIdleDb,
	sourceId: string,
	deps: KnowledgeActionResolverDeps,
): Promise<BakedKnowledgeActionRequest> {
	const itemId = sourceId.replace(/^knowledge:/, "");
	const item = await get(db, itemId);
	if (!item || item.status === "archived") {
		throw new KnowledgeActionSourceUnavailableError("Knowledge item is unavailable");
	}
	await deps.requireRunnableAgent(db, item.updatedBy);
	return {
		defaultAgentId: item.updatedBy,
		sourceKind: "knowledge",
		sourceId,
		streamId: `knowledge:${item.id}`,
		sourceCorrelation: {
			knowledgeItemId: item.id,
			action: "review",
			...(item.scopeId ? { scopeId: item.scopeId } : {}),
		},
	};
}
