/**
 * The session read model — architecture.md §5.3. Folds `session-knowledge-
 * assembler.ts` + `token-budget.ts` + `scoring-config.ts` into one file
 * (behavior-preserving move, §2's vocabulary): `assembleSessionDocuments`
 * fetches factory-wide + team-scoped + the agent's own ordinary documents,
 * ranks + budgets them against the task's scoring context, and appends the
 * agent's active capability documents (skill/rule/agent_file) unranked —
 * exactly what `context.ts`'s `assembleContext` used to do at launch time
 * (`context.ts:834-858`), relocated core-side so a per-kind resolver can call
 * it and bake the result at emit time instead of `run-orchestration` reading
 * it back at launch.
 *
 * It is **not** reachable through `search_documents`: it ranks and budgets,
 * it ignores viewer visibility (it is the agent's own bundle), and it returns
 * `parentChain` per item.
 *
 * @lore architecture.md §6.7: NOT a pure read. Its last step is one batched
 * `bumpSessionUse(db, ids, now)` over exactly the documents it is about to
 * return — the assembler is the only place that knows the final list, so
 * putting the bump in the two run resolvers that call it
 * (`task-run-resolver-bindings.ts`, `routine-scheduler-bindings.ts`) would be
 * the same write duplicated in two files. When the bake runs inside
 * `edit_task`'s own transaction (`task-actions.ts:759-763` passes
 * `tx as HyperIdleDb`), this call joins that transaction and rolls back with
 * it — a dispatch that never committed handed no documents to anybody. The
 * function's name and signature are unchanged; only this last step is new.
 *
 * @lore architecture.md §16.1 break #7: imports `resolveParentChain` and the
 * row type from `document-store.ts`, never from `knowledge-repository.ts` —
 * the pre-rename store dies in a later block.
 */

import { type DocumentRow, documents, type HyperIdleDb } from "@hyperidle/db";
import { and, eq, inArray, isNull, ne, or } from "drizzle-orm";
import {
	bumpSessionUse,
	type DocumentParentChainAncestor,
	resolveParentChain,
} from "./document-store.js";

// ---------------------------------------------------------------------------
// Scoring config — moved from scoring-config.ts.
// ---------------------------------------------------------------------------

/**
 * @lore nested-knowledge-items D1: `roleMatch` and `layerProximity` are
 * DELETED. `roleMatch` scored against a role→community map that never
 * matched seeded data (the census found the fuzzy substring fallback did all
 * the work); `layerProximity` scored the now-deleted layer ladder. What an
 * agent receives is answered entirely by scope (factory + its team + its
 * own) — no subtree selection, no replacement weight.
 */
interface ScoringWeights {
	tagMatch: number;
	recency: number;
	confidence: number;
}

interface ScoringContext {
	taskDescription: string;
	taskTags: string[];
	agentRole: string;
	/** Optional: absent for a team-less agent. No scorer reads it today. */
	productId?: string;
}

const DEFAULT_WEIGHTS: ScoringWeights = {
	tagMatch: 0.55,
	recency: 0.2,
	confidence: 0.15,
};

/** Total context window tokens and document allocation ratio. */
const CONTEXT_WINDOW_TOKENS = 200_000;
const DOCUMENT_ALLOCATION_RATIO = 0.2;
const DEFAULT_DOCUMENT_BUDGET = CONTEXT_WINDOW_TOKENS * DOCUMENT_ALLOCATION_RATIO; // 40_000

/**
 * Scoring weights. Always the hardcoded defaults.
 *
 * @lore AU18: previously read `factory_settings.scoring.weight.*` overrides.
 * No production or eval writer ever existed for this namespace — the only
 * write path was the generic PATCH /api/status/settings catch-all, itself
 * retired this WP. Dropping the DB read is behavior-identical in practice
 * (prod always resolved to these defaults) and removes a dead config surface.
 * `db` is kept as a parameter for call-site compatibility even though it is
 * now unused — every caller passes a live db handle already.
 */
async function loadScoringWeights(_db: HyperIdleDb): Promise<ScoringWeights> {
	return { ...DEFAULT_WEIGHTS };
}

// ---------------------------------------------------------------------------
// Token budget — moved from token-budget.ts.
// ---------------------------------------------------------------------------

/** Approximate token count via whitespace split. */
function countTokens(text: string): number {
	if (!text || text.trim().length === 0) {
		return 0;
	}
	return text.split(/\s+/).length;
}

/** Count tokens for a document (title + body). */
function countItemTokens(item: DocumentRow): number {
	return countTokens(item.title) + countTokens(item.body);
}

interface ScoredItem {
	item: DocumentRow;
	score: number;
}

/**
 * Enforce a token budget on scored items using greedy fill.
 * Factory-scoped items are always included first as non-negotiable context.
 * Returns items sorted by score descending, within budget.
 *
 * @lore nested-knowledge-items D1: `layer==='L4'` (factory-wide, the widest
 * layer) is replaced by `scopeKind==='factory'` — the same "everyone always
 * gets this" rule, now stated directly on the field that carries it.
 */
function enforceBudget(scoredItems: ScoredItem[], maxTokens: number): DocumentRow[] {
	// Separate factory-scoped items (non-negotiable) from the rest
	const factoryItems: ScoredItem[] = [];
	const otherItems: ScoredItem[] = [];

	for (const si of scoredItems) {
		if (si.item.scopeKind === "factory") {
			factoryItems.push(si);
		} else {
			otherItems.push(si);
		}
	}

	// Sort both groups by score descending
	factoryItems.sort((a, b) => b.score - a.score);
	otherItems.sort((a, b) => b.score - a.score);

	const result: DocumentRow[] = [];
	let usedTokens = 0;

	// Include all factory-scoped items first (non-negotiable)
	for (const si of factoryItems) {
		const tokens = countItemTokens(si.item);
		usedTokens += tokens;
		result.push(si.item);
	}

	// Greedily fill remaining budget with highest-scored items
	for (const si of otherItems) {
		const tokens = countItemTokens(si.item);
		if (usedTokens + tokens <= maxTokens) {
			usedTokens += tokens;
			result.push(si.item);
		}
	}

	return result;
}

// ---------------------------------------------------------------------------
// Private relevance-scoring helpers — moved from session-knowledge-assembler.ts.
// ---------------------------------------------------------------------------

/** Recency decay window in milliseconds (30 days). */
const RECENCY_WINDOW_MS = 30 * 24 * 60 * 60 * 1000;

/**
 * Extract tags from a document's title and JSON meta.tags fields.
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
 * Compares taskTags against item title and meta.tags.
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

/** Score a single document against the given context. Returns 0-100. */
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

	return enforceBudget(scored, budgetTokens);
}

async function rank(
	db: HyperIdleDb,
	items: DocumentRow[],
	context: ScoringContext & { readonly tokenLimit?: number },
): Promise<DocumentRow[]> {
	const weights = await loadScoringWeights(db);
	return rankAndBudget(items, context, weights, context.tokenLimit ?? DEFAULT_DOCUMENT_BUDGET);
}

// ---------------------------------------------------------------------------
// Public assembler
// ---------------------------------------------------------------------------

/** Input to assembleSessionDocuments — the emit-time context an agent's session needs. */
export interface SessionDocumentsInput {
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
	 * agent-bound documents. All three real bundle-builders (task-run-resolver,
	 * routine-service) have agent.id in scope and must pass it.
	 */
	readonly agentId: string;
}

/**
 * Fetch ordinary documents at one scope — factory (scopeId `null`), team, or
 * the agent's own.
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
				// @lore BA9g: a session must never be handed an archived document. The
				// rule is NOT "only active": `write_memory` writes `proposed` items
				// and R7 AC-5 requires those to reach the next session. Archived is
				// the one status that means "this reaches nobody".
				ne(documents.status, "archived"),
			),
		)
		.orderBy(documents.id);
}

/**
 * @lore BA9b: Fetch active capability documents (skill/rule/agent_file)
 * scoped to this session. Capability documents bypass ranking — plugin
 * installation is a deliberate act, so skills/rules/agent_files are always
 * present (AC8 stated decision).
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
 * directly by scope and slot, and writeBundleKnowledge routes by slot, not layer.
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
 * `assembleSessionDocuments`'s output — `DocumentRow` plus the ancestor chain
 * `BakedContextDocument.parentChain` needs (review.md B4). Populated for
 * ordinary items only; a capability item (skill/rule/agent_file) is placed by
 * slot, never by tree position, so it carries an empty chain.
 */
export interface SessionDocument extends DocumentRow {
	readonly parentChain: readonly DocumentParentChainAncestor[];
}

/**
 * Assemble the ranked + budgeted document bundle a session needs at launch:
 * fetch factory-wide + team-scoped + the agent's own ordinary documents, then
 * rank + budget them against the task's scoring context, then append the
 * agent's active capability documents unranked.
 *
 * @lore nested-knowledge-items D1: replaces the L4/L2/L3 layer fetch — scope
 * (factory + team + own) is now the entire selection rule, no subtree
 * selection.
 *
 * `rank()` reads scoring weights from the DB and trims to
 * `DEFAULT_DOCUMENT_BUDGET` tokens — this function delegates to it.
 *
 * @lore BA9b: capability items (slot != 'ordinary') are appended AFTER the
 * ranked ordinary items. They are not ranked/budgeted — plugin installation
 * is a deliberate act (AC8 stated decision).
 *
 * @lore architecture.md §6.7: the last step below — `bumpSessionUse` — is
 * what makes this NOT a pure read; see the file header `@lore`.
 */
export async function assembleSessionDocuments(
	db: HyperIdleDb,
	input: SessionDocumentsInput,
): Promise<readonly SessionDocument[]> {
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
	// (review.md B4). A capability item is placed by slot, not tree
	// position, so it never needs one.
	const rankedWithChain: SessionDocument[] = await Promise.all(
		rankedItems.map(async (item) => ({
			...item,
			parentChain: await resolveParentChain(db, item.id),
		})),
	);
	const capabilityWithChain: SessionDocument[] = capabilityItems.map((item) => ({
		...item,
		parentChain: [],
	}));

	// Capability items are appended after ranked ordinary items. No dedupe
	// needed: the scope fetches above are slot:"ordinary" only and
	// `fetchCapabilityItems` fetches skill/rule/agent_file only — the two
	// lists are disjoint by slot, so a factory-scoped skill can no longer
	// arrive through both paths.
	const result = [...rankedWithChain, ...capabilityWithChain];

	// architecture.md §6.7: one batched UPDATE over exactly the documents
	// this call is about to return, raised here because this is the one place
	// that knows the final list. Joins the caller's transaction when this
	// bake runs inside one (`task-actions.ts:759-763` passes `tx as
	// HyperIdleDb`) — the counter rolls back with it.
	await bumpSessionUse(
		db,
		result.map((item) => item.id),
		new Date().toISOString(),
	);

	return result;
}

export { countTokens, enforceBudget };
