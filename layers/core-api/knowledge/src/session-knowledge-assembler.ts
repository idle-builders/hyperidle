/**
 * AU21 §9 Increment 12 (Decision H3), Wave A — the shared core-side knowledge
 * assembler that `context.ts`'s per-kind resolvers will call intra-layer once
 * they're wired in Wave B, following the exact `requireRunnableAgent`
 * precedent (`layers/core-api/users/src/runnable-agent.ts`): one shared
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
 *
 * @lore AU44: relevance-scoring.ts deleted; rank() and all private helpers
 * moved here as private functions (Row 37/38). rank() was the only external
 * consumer; making it private removes the exported symbol.
 */

import type { HyperIdleDb } from "@hyperidle/db";
import type { KnowledgeItemWithProjection } from "./knowledge-repository.js";
import { list } from "./knowledge-repository.js";
import { communityForRole } from "./role-community-map.js";
import type { ScoringContext, ScoringWeights } from "./scoring-config.js";
import { DEFAULT_KNOWLEDGE_BUDGET, loadScoringWeights } from "./scoring-config.js";
import type { ScoredItem } from "./token-budget.js";
import { enforceBudget } from "./token-budget.js";
import type { KnowledgeLayer } from "./types.js";

// ---------------------------------------------------------------------------
// Private relevance-scoring helpers (inlined from relevance-scoring.ts)
// ---------------------------------------------------------------------------

/** Recency decay window in milliseconds (30 days). */
const RECENCY_WINDOW_MS = 30 * 24 * 60 * 60 * 1000;

/**
 * Extract tags from a knowledge item's topic and JSON meta.tags fields.
 *
 * @lore O2: meta field moved to knowledgeAppProjection; accepts KnowledgeItemWithProjection.
 */
function extractItemTags(item: KnowledgeItemWithProjection): string[] {
	const tags: string[] = [];
	if (item.topic) {
		tags.push(item.topic.toLowerCase());
	}
	const meta = item.meta ?? null;
	if (meta) {
		try {
			const parsed: unknown = JSON.parse(meta);
			if (parsed && typeof parsed === "object" && "tags" in parsed) {
				const metaTags = (parsed as { tags: unknown }).tags;
				if (Array.isArray(metaTags)) {
					for (const t of metaTags) {
						if (typeof t === "string") {
							tags.push(t.toLowerCase());
						}
					}
				}
			}
		} catch {
			// Invalid JSON in meta — skip
		}
	}
	return tags;
}

/**
 * Compute tag match factor (0-1).
 * Compares taskTags against item topic and meta.tags.
 */
function computeTagMatch(item: KnowledgeItemWithProjection, taskTags: string[]): number {
	if (taskTags.length === 0) {
		return 0;
	}

	const itemTags = extractItemTags(item);
	if (itemTags.length === 0) {
		return 0;
	}

	const normalizedTaskTags = taskTags.map((t) => t.toLowerCase());
	let matches = 0;
	for (const taskTag of normalizedTaskTags) {
		for (const itemTag of itemTags) {
			if (itemTag === taskTag || itemTag.includes(taskTag) || taskTag.includes(itemTag)) {
				matches++;
				break;
			}
		}
	}

	return matches / normalizedTaskTags.length;
}

/** Compute role match factor (0 or 1). */
function computeRoleMatch(item: KnowledgeItemWithProjection, agentRole: string): number {
	const community = communityForRole(agentRole);
	const scopeId = item.scopeId ?? null;
	if (scopeId === community) {
		return 1;
	}
	// Also match if scopeId contains the role name
	if (scopeId?.includes(agentRole)) {
		return 0.5;
	}
	return 0;
}

/** Compute recency factor (0-1). Items updated within last 30 days score higher. */
function computeRecency(item: KnowledgeItemWithProjection, now: number): number {
	const updatedAt = new Date(item.updatedAt).getTime();
	const age = now - updatedAt;

	if (age <= 0) {
		return 1;
	}
	if (age >= RECENCY_WINDOW_MS) {
		return 0;
	}

	return 1 - age / RECENCY_WINDOW_MS;
}

/** Compute confidence factor (0-1). Confidence stored as string in projection table. */
function computeConfidence(item: KnowledgeItemWithProjection): number {
	// @lore O2: confidence moved to knowledgeAppProjection as text column.
	// Parse to float; clamp to [0,1].
	if (item.confidence == null) {
		return 0.5; // neutral default
	}
	const val =
		typeof item.confidence === "string" ? Number.parseFloat(item.confidence) : item.confidence;
	if (!Number.isFinite(val)) return 0.5;
	// @lore I3 (TRACK-I.md L147-149): the previous `/ 100` divisor scaled this
	// 100× too small (a confidence of 0.8 became a factor of 0.008). The
	// schema stores `confidence` as `real` already in [0,1] — no normalization
	// needed. Clamp keeps us safe against out-of-range historic data.
	return Math.max(0, Math.min(1, val));
}

/**
 * Compute layer proximity factor (0-1).
 * Items closer to task context (lower layers) score higher for task work.
 * L0 (session) and L1 (task) are closest, L4 (factory) is furthest but always included.
 *
 * @lore O2: layer field is now optional (from projection table).
 */
function computeLayerProximity(item: KnowledgeItemWithProjection): number {
	const layerScores: Record<string, number> = {
		L0: 1.0,
		L1: 0.9,
		L2: 0.7,
		L3: 0.5,
		L4: 0.3,
	};
	return layerScores[item.layer ?? ""] ?? 0;
}

/** Compute attention score factor (0-1). attentionScore stored as string in projection table. */
function computeAttentionScore(item: KnowledgeItemWithProjection): number {
	// @lore O2: attentionScore moved to knowledgeAppProjection as text column.
	if (item.attentionScore == null) {
		return 0.5; // neutral default
	}
	const val =
		typeof item.attentionScore === "string"
			? Number.parseFloat(item.attentionScore)
			: item.attentionScore;
	if (!Number.isFinite(val)) return 0.5;
	// @lore I3: same fix as `computeConfidence` — drop the `/ 100` divisor.
	return Math.max(0, Math.min(1, val));
}

/** Score a single knowledge item against the given context. Returns 0-100. */
function scoreItem(
	item: KnowledgeItemWithProjection,
	context: ScoringContext,
	weights: ScoringWeights,
	now?: number,
): number {
	const timestamp = now ?? Date.now();

	const tagMatch = computeTagMatch(item, context.taskTags);
	const roleMatch = computeRoleMatch(item, context.agentRole);
	const recency = computeRecency(item, timestamp);
	const confidence = computeConfidence(item);
	const layerProximity = computeLayerProximity(item);
	const attentionScoreFactor = computeAttentionScore(item);

	const weighted =
		tagMatch * weights.tagMatch +
		roleMatch * weights.roleMatch +
		recency * weights.recency +
		confidence * weights.confidence +
		layerProximity * weights.layerProximity +
		attentionScoreFactor * weights.attentionScore;

	// Normalize to 0-100
	const totalWeight =
		weights.tagMatch +
		weights.roleMatch +
		weights.recency +
		weights.confidence +
		weights.layerProximity +
		weights.attentionScore;

	if (totalWeight === 0) {
		return 0;
	}

	return Math.round((weighted / totalWeight) * 100);
}

/**
 * Rank items by relevance score and enforce a token budget.
 * L4 items are always included (non-negotiable).
 * Returns the top-scoring items that fit within the budget.
 */
function rankAndBudget(
	items: KnowledgeItemWithProjection[],
	context: ScoringContext,
	weights: ScoringWeights,
	budgetTokens: number,
	now?: number,
): KnowledgeItemWithProjection[] {
	const scored: ScoredItem[] = items.map((item) => ({
		item,
		score: scoreItem(item, context, weights, now),
	}));

	return enforceBudget(scored, budgetTokens) as KnowledgeItemWithProjection[];
}

async function rank(
	db: HyperIdleDb,
	items: KnowledgeItemWithProjection[],
	context: ScoringContext & { readonly tokenLimit?: number },
): Promise<KnowledgeItemWithProjection[]> {
	const weights = await loadScoringWeights(db);
	return rankAndBudget(items, context, weights, context.tokenLimit ?? DEFAULT_KNOWLEDGE_BUDGET);
}

// ---------------------------------------------------------------------------
// Public assembler
// ---------------------------------------------------------------------------

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
 * `rank()` reads scoring weights from the DB and trims to
 * `DEFAULT_KNOWLEDGE_BUDGET` tokens — this function delegates to it.
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
