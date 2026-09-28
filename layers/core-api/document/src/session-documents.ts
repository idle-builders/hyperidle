// Session document assembler: fetches factory-wide + team-scoped + agent's own ordinary docs,
// ranks + budgets, then appends active capability docs (skill/rule/agent_file) unranked.
// @lore: assembleSessionDocuments is NOT a pure read — last step bumps session_use on all returned ids; joins caller's transaction

import { type DocumentRow, documents, type HyperIdleDb } from "@hyperidle/db";
import { and, eq, inArray, isNull, ne, or } from "drizzle-orm";
import {
	bumpSessionUse,
	type DocumentParentChainAncestor,
	resolveParentChain,
} from "./document-store.js";

// ---------------------------------------------------------------------------
// Scoring config.
// ---------------------------------------------------------------------------

interface ScoringWeights {
	tagMatch: number;
	recency: number;
	confidence: number;
}

interface ScoringContext {
	taskDescription: string;
	taskTags: string[];
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

// Always returns hardcoded defaults.
function loadScoringWeights(_db: HyperIdleDb): Promise<ScoringWeights> {
	return Promise.resolve({ ...DEFAULT_WEIGHTS });
}

// ---------------------------------------------------------------------------
// Token budget.
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

// Greedy budget fill; factory-scoped items are non-negotiable and included first.
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
// Private relevance-scoring helpers.
// ---------------------------------------------------------------------------

/** Recency decay window in milliseconds (30 days). */
const RECENCY_WINDOW_MS = 30 * 24 * 60 * 60 * 1000;

// Extract tags from title and meta.tags.
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

function computeConfidence(item: DocumentRow): number {
	// Parse to float; clamp to [0,1].
	if (item.confidence == null) {
		return 0.5; // neutral default
	}
	const val =
		typeof item.confidence === "string" ? Number.parseFloat(item.confidence) : item.confidence;
	if (!Number.isFinite(val)) return 0.5;
	// @lore: confidence stored as real in [0,1]; divide by 100 would scale 100× too small; clamp for historic data
	return Math.max(0, Math.min(1, val));
}

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

export interface SessionDocumentsInput {
	readonly teamId?: string;
	readonly taskDescription: string;
	// Required so callers cannot accidentally omit it and silently lose agent-bound documents.
	readonly agentId: string;
}

// Fetch ordinary documents at one scope — factory, team, or agent's own.
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
				// @lore: archived docs must never reach a session; proposed docs must (write_memory writes proposed)
				ne(documents.status, "archived"),
			),
		)
		.orderBy(documents.id);
}

// Fetch active capability items (skill/rule/agent_file) by scope.
//
// @lore: capability items do NOT use listBase — their scope is direct, not layer-keyed
function fetchCapabilityItems(
	db: HyperIdleDb,
	teamId: string | undefined,
	agentId: string | undefined,
): Promise<DocumentRow[]> {
	// Only emit scope clauses for values actually in play; undefined would silently match nothing.
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

// assembleSessionDocuments output — DocumentRow plus ancestor chain (empty for capability items).
export interface SessionDocument extends DocumentRow {
	readonly parentChain: readonly DocumentParentChainAncestor[];
}

// Fetch + rank + budget ordinary docs, then append capability items (skill/rule/agent_file) unranked.
// Capability items bypass ranking — plugin installation is a deliberate act.
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
	});

	// Ordinary items get ancestor chain resolved here at bake time; capability items are placed by slot.
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

	// No dedupe needed: ordinary fetch is slot="ordinary", capability fetch is skill/rule/agent_file — disjoint by slot.
	const result = [...rankedWithChain, ...capabilityWithChain];

	// One batched UPDATE over all returned docs; joins caller's transaction when run inside one.
	await bumpSessionUse(
		db,
		result.map((item) => item.id),
		new Date().toISOString(),
	);

	return result;
}

export { countTokens, enforceBudget };
