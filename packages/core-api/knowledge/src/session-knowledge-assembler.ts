/**
 * AU21 §9 Increment 12 (Decision H3), Wave A — the shared core-side knowledge
 * assembler that `context.ts`'s per-kind resolvers will call intra-layer once
 * they're wired in Wave B, following the exact `requireRunnableAgent`
 * precedent (`packages/core-api/users/src/runnable-agent.ts`): one shared
 * function, imported via ordinary same-layer core-api DI — not a cross-layer
 * edge, not a composition-bundle read.
 *
 * Relocates `run-orchestration/src/context.ts`'s `fetchAllForLayer` +
 * `assembleContext`'s L4/L2/L3 fetch + `ports.knowledge.rankAndBudget` call
 * (`context.ts:787-858`, unmodified this wave) fully core-side: the heaviest,
 * cross-domain piece of context assembly (`rank()` reads scoring weights from
 * the DB). `context.ts` itself is NOT touched this wave — it still does its
 * own DB reads via `ContextAssemblyPorts`; Wave B rewires it to consume this
 * function's (baked) output instead. See architecture.md §6 Decision H3 +
 * §9 Increment 12.
 */

import type { HyperIdleDb } from "@hyperidle/db";
import type { KnowledgeItemWithProjection } from "./knowledge-repository.js";
import { list } from "./knowledge-repository.js";
import { rank } from "./relevance-scoring.js";
import { communityForRole } from "./role-community-map.js";
import type { KnowledgeLayer } from "./types.js";

/** Input to assembleSessionKnowledge — the emit-time context an agent's session needs. */
export interface SessionKnowledgeInput {
	readonly teamId: string;
	readonly agentRole: string;
	readonly taskDescription: string;
}

const LIST_BATCH_SIZE = 500;

/**
 * Fetch all items for a layer, handling pagination.
 * Relocated verbatim from `context.ts`'s `fetchAllForLayer` — same batching
 * behavior (500-item pages, stop once a page returns fewer than the batch
 * size).
 */
async function fetchAllForLayer(
	db: HyperIdleDb,
	layer: KnowledgeLayer,
	scopeId?: string,
): Promise<KnowledgeItemWithProjection[]> {
	const allItems: KnowledgeItemWithProjection[] = [];
	let offset = 0;

	while (true) {
		const batch = await list(db, {
			layer,
			scopeId,
			limit: LIST_BATCH_SIZE,
			offset,
		});
		allItems.push(...batch);
		if (batch.length < LIST_BATCH_SIZE) break;
		offset += LIST_BATCH_SIZE;
	}

	return allItems;
}

/**
 * Assemble the ranked + budgeted knowledge bundle a session needs at launch:
 * fetch L4 (factory-wide) + L2 (team-scoped) + L3 (practice-community-scoped)
 * items, then rank + budget them against the task's scoring context —
 * exactly what `context.ts`'s `assembleContext` currently does at launch
 * time (`context.ts:834-858`), relocated core-side so a per-kind resolver can
 * call it and bake the result at emit time instead of `run-orchestration`
 * reading it back at launch.
 *
 * `rank()` (`relevance-scoring.ts`) already loads scoring weights from the DB
 * and trims to `DEFAULT_KNOWLEDGE_BUDGET` tokens — this function does not
 * duplicate that budget, it delegates to it (H3's payload-size note).
 */
export async function assembleSessionKnowledge(
	db: HyperIdleDb,
	input: SessionKnowledgeInput,
): Promise<readonly KnowledgeItemWithProjection[]> {
	const community = communityForRole(input.agentRole);

	const [l4Items, l2Items, l3Items] = await Promise.all([
		fetchAllForLayer(db, "L4"),
		fetchAllForLayer(db, "L2", input.teamId),
		fetchAllForLayer(db, "L3", community),
	]);

	const allItems = [...l4Items, ...l2Items, ...l3Items];

	return rank(db, allItems, {
		taskDescription: input.taskDescription,
		taskTags: [],
		agentRole: input.agentRole,
		productId: input.teamId,
	});
}
