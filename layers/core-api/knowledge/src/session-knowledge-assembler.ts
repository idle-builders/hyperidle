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
import { knowledgeAppProjection, knowledgeItems } from "@hyperidle/db";
import { and, eq, inArray, or } from "drizzle-orm";
import type { KnowledgeItemWithProjection } from "./knowledge-repository.js";
import { list } from "./knowledge-repository.js";
import { practiceForRole } from "./role-community-map.js";
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
	// @lore BA9g: the practice is the role, so this is an exact match. It used to
	// compare against a community the role mapped into and fall back to a fuzzy
	// substring test — and the fuzzy branch was the one that fired, because
	// practice knowledge is scoped by role, never by community name.
	return (item.scopeId ?? null) === practiceForRole(agentRole) ? 1 : 0;
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
	/**
	 * @lore The agent's team, when it has one. Optional because a plugin's own
	 * agent is created `agentCategory: "individual"` and belongs to no team —
	 * and capability items (skill/rule/agent_file) are scoped factory / team /
	 * agent independently of any team, so a team-less agent must still receive
	 * the factory- and agent-scoped ones. Absent simply means the team-scoped
	 * L2 layer and team-scoped capability items contribute nothing, which is
	 * the honest answer rather than a reason to assemble nothing at all.
	 */
	readonly teamId?: string;
	readonly agentRole: string;
	readonly taskDescription: string;
	/**
	 * @lore BA9b: agentId is required to fetch agent_file items bound to this agent.
	 * Required (not optional) so no caller can accidentally omit it and silently lose
	 * agent-bound knowledge items. All three real bundle-builders (task-run-resolver,
	 * routine-service) have agent.id in scope and must pass it.
	 */
	readonly agentId: string;
}

const LIST_BATCH_SIZE = 500;

/**
 * Fetch all items for a layer, handling pagination.
 * Relocated verbatim from `context.ts`'s `fetchAllForLayer` — same batching
 * behavior (500-item pages, stop once a page returns fewer than the batch
 * size).
 *
 * @lore knowledge-attachment-slot §5 Guard 1: `role: "ordinary"` closes the
 * leak this fetch had — no role predicate at all, so every non-ordinary role
 * (a routine prompt included) arrived here whenever its layer/scope matched,
 * independently of the capability allowlist below. A role added later is then
 * excluded by default rather than included by default, the safe direction for
 * a set that decides what reaches an agent.
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
			role: "ordinary",
			limit: LIST_BATCH_SIZE,
			offset,
		});
		// @lore BA9g: a session must never be handed archived knowledge. Archived
		// items were excluded here only by ACCIDENT — a plugin document had no
		// projection row, and `list()` filters by layer through that row, so an
		// archived skill was invisible for the wrong reason. Writing the projection
		// (which every knowledge write owes) made them visible, which is what
		// surfaced this. `fetchCapabilityItems` has always filtered status; this
		// path never did.
		// The rule is NOT "only active": `write_memory` writes `captured` items and
		// R7 AC-5 requires those to reach the next session. Archived is the one
		// status that means "this reaches nobody".
		allItems.push(...batch.filter((item) => item.status !== "archived"));
		if (batch.length < LIST_BATCH_SIZE) break;
		offset += LIST_BATCH_SIZE;
	}

	return allItems;
}

/**
 * @lore BA9b: Fetch active capability items (skill/rule/agent_file) scoped to
 * this session. Capability items bypass ranking — plugin installation is a
 * deliberate act, so skills/rules/agent_files are always present (AC8 stated
 * decision).
 *
 * @lore knowledge-attachment-slot §5 Guard 1: the predicate used to be
 * `ne(role, 'ordinary')`, which also matched `prompt` — a routine prompt is
 * non-ordinary and takes factory or team scope from its owner agent, so it
 * matched directly. Named to the three roles that actually materialise here
 * instead: a role added later is excluded by default, not included by
 * default.
 *
 * Scope filter:
 *   - factory-scoped: reach all sessions.
 *   - team-scoped (scopeKind='team', scopeId=teamId): reach this team's sessions.
 *   - agent-bound (scopeKind='user', scopeId=agentId): reach only this agent's sessions.
 *
 * @lore BA9b: The 'team → null' SCOPE_TO_LAYER mapping is resolved here: we
 * do NOT route capability items through the layer system. We query them
 * directly by scope and role, and writeBundleKnowledge routes by role, not layer.
 *
 * @lore BA9b-listBase: This function does NOT use listBase(). listBase() filters
 * by `knowledgeAppProjection.layer` (a projection table field). Capability items
 * (skill/rule/agent_file) use scopeKind/scopeId from the kernel table — not layer.
 * Going through listBase would force a layer predicate onto items that have no
 * meaningful layer, silently dropping everything. The direct query is the correct
 * path; there is no drift risk because the same LEFT JOIN to knowledgeAppProjection
 * is reproduced here with the same merge logic as listBase's mergeItemWithProjection.
 */
async function fetchCapabilityItems(
	db: HyperIdleDb,
	teamId: string | undefined,
	agentId: string | undefined,
): Promise<KnowledgeItemWithProjection[]> {
	// A clause per scope that is actually in play. `teamId` is absent for a
	// team-less agent; emitting a `scopeId = undefined` comparison there would
	// silently match nothing AND drag the whole OR down with it in some
	// drivers, so the clause is omitted rather than fed a missing value.
	const scopeClauses = [
		eq(knowledgeItems.scopeKind, "factory"),
		...(teamId
			? [and(eq(knowledgeItems.scopeKind, "team"), eq(knowledgeItems.scopeId, teamId))]
			: []),
		...(agentId
			? [and(eq(knowledgeItems.scopeKind, "user"), eq(knowledgeItems.scopeId, agentId))]
			: []),
	];
	const scopeFilter = or(...scopeClauses);

	const rows = await db
		.select({ item: knowledgeItems, projection: knowledgeAppProjection })
		.from(knowledgeItems)
		.leftJoin(knowledgeAppProjection, eq(knowledgeAppProjection.knowledgeItemId, knowledgeItems.id))
		.where(
			and(
				inArray(knowledgeItems.role, ["skill", "rule", "agent_file"]),
				eq(knowledgeItems.status, "active"),
				scopeFilter,
			),
		)
		.orderBy(knowledgeItems.id);

	return rows.map(({ item, projection }) => ({
		...item,
		layer: projection?.layer ?? null,
		kind: projection?.kind ?? null,
		attentionScore: projection?.attentionScore ?? null,
		confidence: projection?.confidence ?? null,
		meta: projection?.meta ?? null,
		scopeId: projection?.scopeId ?? item.scopeId,
	}));
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
 *
 * @lore BA9b: capability items (role != 'ordinary') are appended AFTER the
 * ranked ordinary items. They are not ranked/budgeted — plugin installation
 * is a deliberate act (AC8 stated decision).
 */
export async function assembleSessionKnowledge(
	db: HyperIdleDb,
	input: SessionKnowledgeInput,
): Promise<readonly KnowledgeItemWithProjection[]> {
	const community = practiceForRole(input.agentRole);

	// L2 is the team layer. `list()` applies a scope filter only when `scopeId`
	// is defined, so passing an absent team through would return EVERY team's L2
	// knowledge rather than none — a team-less agent would inherit other teams'
	// working agreements. No team means no team layer.
	const [l4Items, l2Items, l3Items, capabilityItems] = await Promise.all([
		fetchAllForLayer(db, "L4"),
		input.teamId ? fetchAllForLayer(db, "L2", input.teamId) : Promise.resolve([]),
		fetchAllForLayer(db, "L3", community),
		fetchCapabilityItems(db, input.teamId, input.agentId),
	]);

	const allItems = [...l4Items, ...l2Items, ...l3Items];

	const rankedItems = await rank(db, allItems, {
		taskDescription: input.taskDescription,
		taskTags: [],
		agentRole: input.agentRole,
		productId: input.teamId,
	});

	// Capability items are appended after ranked ordinary items. No dedupe
	// needed: `fetchAllForLayer` now fetches `role: "ordinary"` only and
	// `fetchCapabilityItems` fetches skill/rule/agent_file only — the two
	// lists are disjoint by role, so a factory-scoped skill can no longer
	// arrive through both paths.
	return [...rankedItems, ...capabilityItems];
}
