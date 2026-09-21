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

import { type DocumentRow, documents, type HyperIdleDb } from "@hyperidle/db";
import { and, eq, inArray, isNull, ne, or } from "drizzle-orm";
import type { KnowledgeParentChainAncestor } from "./knowledge-repository.js";
import { resolveParentChain } from "./knowledge-repository.js";
import type { ScoringContext, ScoringWeights } from "./scoring-config.js";
import { DEFAULT_KNOWLEDGE_BUDGET, loadScoringWeights } from "./scoring-config.js";
import type { ScoredItem } from "./token-budget.js";
import { enforceBudget } from "./token-budget.js";

// ---------------------------------------------------------------------------
// Private relevance-scoring helpers (inlined from relevance-scoring.ts)
// ---------------------------------------------------------------------------

/** Recency decay window in milliseconds (30 days). */
const RECENCY_WINDOW_MS = 30 * 24 * 60 * 60 * 1000;

/**
 * Extract tags from a knowledge item's title and JSON meta.tags fields.
 *
 * @lore nested-knowledge-items: `topic` is gone with the flat vocabulary it
 * belonged to — the title is the closest surviving honest signal (same
 * substitution `attention-classifier.ts` makes for its own topic gate).
 */
function extractItemTags(item: DocumentRow): string[] {
	const tags: string[] = [item.title.toLowerCase()];
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
function computeTagMatch(item: DocumentRow, taskTags: string[]): number {
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

/** Compute recency factor (0-1). Items updated within last 30 days score higher. */
function computeRecency(item: DocumentRow, now: number): number {
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

/** Compute confidence factor (0-1). Confidence stored as a text column on the row. */
function computeConfidence(item: DocumentRow): number {
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

/** Score a single knowledge item against the given context. Returns 0-100. */
function scoreItem(
	item: DocumentRow,
	context: ScoringContext,
	weights: ScoringWeights,
	now?: number,
): number {
	const timestamp = now ?? Date.now();

	const tagMatch = computeTagMatch(item, context.taskTags);
	const recency = computeRecency(item, timestamp);
	const confidence = computeConfidence(item);

	const weighted =
		tagMatch * weights.tagMatch + recency * weights.recency + confidence * weights.confidence;

	// Normalize to 0-100
	const totalWeight = weights.tagMatch + weights.recency + weights.confidence;

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
	items: DocumentRow[],
	context: ScoringContext,
	weights: ScoringWeights,
	budgetTokens: number,
	now?: number,
): DocumentRow[] {
	const scored: ScoredItem[] = items.map((item) => ({
		item,
		score: scoreItem(item, context, weights, now),
	}));

	return enforceBudget(scored, budgetTokens) as DocumentRow[];
}

async function rank(
	db: HyperIdleDb,
	items: DocumentRow[],
	context: ScoringContext & { readonly tokenLimit?: number },
): Promise<DocumentRow[]> {
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

/**
 * Fetch ordinary knowledge items at one scope — factory (scopeId `null`),
 * team, or the agent's own.
 *
 * @lore nested-knowledge-items D1: "what an agent receives" is answered
 * entirely by scope now — factory + its team + its own, no subtree
 * selection. Replaces the layer-keyed `fetchAllForLayer` (L4/L2/L3), which
 * had nothing to key on once `layer` was deleted.
 */
function fetchOrdinaryItemsByScope(
	db: HyperIdleDb,
	scopeKind: "factory" | "team" | "user",
	scopeId: string | null,
): Promise<DocumentRow[]> {
	return db
		.select()
		.from(documents)
		.where(
			and(
				eq(documents.slot, "ordinary"),
				eq(documents.scopeKind, scopeKind),
				scopeId === null ? isNull(documents.scopeId) : eq(documents.scopeId, scopeId),
				// @lore BA9g: a session must never be handed archived knowledge. The
				// rule is NOT "only active": `write_memory` writes `proposed` items
				// and R7 AC-5 requires those to reach the next session. Archived is
				// the one status that means "this reaches nobody".
				ne(documents.status, "archived"),
			),
		)
		.orderBy(documents.id);
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
 * @lore BA9b-listBase: This function does NOT use listBase(). Capability items
 * (skill/rule/agent_file) use scopeKind/scopeId from the row directly — not
 * layer. Going through listBase would force a layer predicate onto items that
 * have no meaningful layer, silently dropping everything.
 */
function fetchCapabilityItems(
	db: HyperIdleDb,
	teamId: string | undefined,
	agentId: string | undefined,
): Promise<DocumentRow[]> {
	// A clause per scope that is actually in play. `teamId` is absent for a
	// team-less agent; emitting a `scopeId = undefined` comparison there would
	// silently match nothing AND drag the whole OR down with it in some
	// drivers, so the clause is omitted rather than fed a missing value.
	const scopeClauses = [
		eq(documents.scopeKind, "factory"),
		...(teamId ? [and(eq(documents.scopeKind, "team"), eq(documents.scopeId, teamId))] : []),
		...(agentId ? [and(eq(documents.scopeKind, "user"), eq(documents.scopeId, agentId))] : []),
	];
	const scopeFilter = or(...scopeClauses);

	return db
		.select()
		.from(documents)
		.where(
			and(
				inArray(documents.slot, ["skill", "rule", "agent_file"]),
				eq(documents.status, "active"),
				scopeFilter,
			),
		)
		.orderBy(documents.id);
}

/**
 * `assembleSessionKnowledge`'s output — `DocumentRow` plus
 * the ancestor chain `BakedContextKnowledgeItem.parentChain` needs (review.md
 * B4). Populated for ordinary items only; a capability item (skill/rule/
 * agent_file) is placed by role, never by tree position, so it carries an
 * empty chain.
 */
export interface SessionKnowledgeItem extends DocumentRow {
	readonly parentChain: readonly KnowledgeParentChainAncestor[];
}

/**
 * Assemble the ranked + budgeted knowledge bundle a session needs at launch:
 * fetch factory-wide + team-scoped + the agent's own ordinary items, then
 * rank + budget them against the task's scoring context — exactly what
 * `context.ts`'s `assembleContext` currently does at launch time
 * (`context.ts:834-858`), relocated core-side so a per-kind resolver can call
 * it and bake the result at emit time instead of `run-orchestration` reading
 * it back at launch.
 *
 * @lore nested-knowledge-items D1: replaces the L4/L2/L3 layer fetch — scope
 * (factory + team + own) is now the entire selection rule, no subtree
 * selection.
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
): Promise<readonly SessionKnowledgeItem[]> {
	// A team-less agent gets no team-scoped items — never every team's.
	const [factoryItems, teamItems, ownItems, capabilityItems] = await Promise.all([
		fetchOrdinaryItemsByScope(db, "factory", null),
		input.teamId ? fetchOrdinaryItemsByScope(db, "team", input.teamId) : Promise.resolve([]),
		fetchOrdinaryItemsByScope(db, "user", input.agentId),
		fetchCapabilityItems(db, input.teamId, input.agentId),
	]);

	const allItems = [...factoryItems, ...teamItems, ...ownItems];

	const rankedItems = await rank(db, allItems, {
		taskDescription: input.taskDescription,
		taskTags: [],
		agentRole: input.agentRole,
		productId: input.teamId,
	});

	// architecture.md §5: an ordinary item's ancestor chain can only be
	// resolved here, at bake time — `writeContextBundle` does zero DB reads
	// (review.md B4). A capability item is placed by role, not tree
	// position, so it never needs one.
	const rankedWithChain: SessionKnowledgeItem[] = await Promise.all(
		rankedItems.map(async (item) => ({
			...item,
			parentChain: await resolveParentChain(db, item.id),
		})),
	);
	const capabilityWithChain: SessionKnowledgeItem[] = capabilityItems.map((item) => ({
		...item,
		parentChain: [],
	}));

	// Capability items are appended after ranked ordinary items. No dedupe
	// needed: the scope fetches above are role:"ordinary" only and
	// `fetchCapabilityItems` fetches skill/rule/agent_file only — the two
	// lists are disjoint by role, so a factory-scoped skill can no longer
	// arrive through both paths.
	return [...rankedWithChain, ...capabilityWithChain];
}
