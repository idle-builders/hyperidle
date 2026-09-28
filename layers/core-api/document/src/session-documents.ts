// Session document assembler: fetches factory-wide + team-scoped + agent's own ordinary docs,
// filters by discipline, ranks by tag match + recency + confidence, then appends active
// capability docs (skill/rule/agent_file) unranked.
// @lore: assembleSessionDocuments is NOT a pure read — last step bumps session_use on all returned ids; joins caller's transaction
// @lore: no document budget — these are files in a real `knowledge/` tree, never inlined into a prompt to cap against.

import { type DocumentRow, documents, type HyperIdleDb } from "@hyperidle/db";
import { and, eq, inArray, isNull, ne, or, type SQL, sql } from "drizzle-orm";
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

// Always returns hardcoded defaults.
function loadScoringWeights(_db: HyperIdleDb): Promise<ScoringWeights> {
	return Promise.resolve({ ...DEFAULT_WEIGHTS });
}

/**
 * Derive searchable keyword tokens from a task description.
 * Splits on non-alphanumeric characters, lowercases, and drops tokens
 * shorter than 3 characters (articles, prepositions, etc.).
 */
function tokenizeDescription(desc: string): string[] {
	if (!desc || desc.trim().length === 0) return [];
	return desc
		.toLowerCase()
		.split(/[^a-z0-9]+/)
		.filter((t) => t.length >= 3);
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

/** Score a single document. Returns 0-100. */
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
 * Rank items by relevance score, highest first. No cap — see the file header
 * `@lore` for why. Every item scope-and-discipline-selected for this session
 * is returned.
 */
function rankAndBudget(
	items: DocumentRow[],
	context: ScoringContext,
	weights: ScoringWeights,
	now?: number,
): DocumentRow[] {
	return items
		.map((item) => ({ item, score: scoreItem(item, context, weights, now) }))
		.sort((a, b) => b.score - a.score)
		.map((scored) => scored.item);
}

async function rank(
	db: HyperIdleDb,
	items: DocumentRow[],
	context: ScoringContext,
): Promise<DocumentRow[]> {
	const weights = await loadScoringWeights(db);
	return rankAndBudget(items, context, weights);
}

// ---------------------------------------------------------------------------
// Public assembler
// ---------------------------------------------------------------------------

export interface SessionDocumentsInput {
	readonly teamId?: string;
	readonly taskDescription: string;
	// Required so callers cannot accidentally omit it and silently lose agent-bound documents.
	readonly agentId: string;
	/**
	 * The agent's own craft, or `null`/absent for an agent with none. Every
	 * caller already has the agent's `User` row in hand (the same row
	 * `agentId` comes from) — this is threaded, never looked up again here.
	 * Filters, never ranks: a document whose own `discipline` is set and does
	 * not match this one (case-insensitive) is dropped outright, for ordinary
	 * items and for capability items in slot `skill`/`rule`. `agent_file` is
	 * exempt — it is already about exactly one agent.
	 */
	readonly agentDiscipline?: string | null;
}

/**
 * A discipline CLUSTERS, it never ranks: a document whose own `discipline`
 * is null/empty reaches everyone; one that names a discipline reaches only
 * an agent whose own matches, case-insensitively (`lower(a) = lower(b)` —
 * the column itself keeps whatever case was typed, `schema.ts`'s own `@lore`
 * on `documents.discipline`). An agent with no discipline of its own
 * therefore only ever matches the undisciplined documents.
 */
function disciplineFilter(agentDiscipline: string | null | undefined): SQL {
	const clauses = [isNull(documents.discipline), eq(documents.discipline, "")];
	if (agentDiscipline) {
		clauses.push(sql`LOWER(${documents.discipline}) = LOWER(${agentDiscipline})`);
	}
	return or(...clauses) as SQL;
}

// Fetch ordinary documents at one scope — factory, team, or agent's own.
function fetchOrdinaryItemsByScope(
	db: HyperIdleDb,
	scopeKind: "factory" | "team" | "user",
	scopeId: string | null,
	agentDiscipline: string | null | undefined,
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
				disciplineFilter(agentDiscipline),
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
	agentDiscipline: string | null | undefined,
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
				// A bound `agent_file` is already about exactly one agent — a
				// discipline on it means nothing, so it is exempt (never filtered);
				// `skill`/`rule` are fetched by scope+slot alone, so this field is
				// the only thing that can reach them.
				or(eq(documents.slot, "agent_file"), disciplineFilter(agentDiscipline)) as SQL,
			),
		)
		.orderBy(documents.id);
}

// assembleSessionDocuments output — DocumentRow plus ancestor chain (empty for capability items).
export interface SessionDocument extends DocumentRow {
	readonly parentChain: readonly DocumentParentChainAncestor[];
}

// Fetch + filter (discipline) + rank (tag match, recency, confidence) ordinary docs, no
// budget — see the file header — then append capability items (skill/rule/agent_file)
// unranked. Capability items bypass ranking — plugin installation is a deliberate act.
export async function assembleSessionDocuments(
	db: HyperIdleDb,
	input: SessionDocumentsInput,
): Promise<readonly SessionDocument[]> {
	const agentDiscipline = input.agentDiscipline;
	// A team-less agent gets no team-scoped items — never every team's.
	const [factoryItems, teamItems, ownItems, capabilityItems] = await Promise.all([
		fetchOrdinaryItemsByScope(db, "factory", null, agentDiscipline),
		input.teamId
			? fetchOrdinaryItemsByScope(db, "team", input.teamId, agentDiscipline)
			: Promise.resolve([]),
		fetchOrdinaryItemsByScope(db, "user", input.agentId, agentDiscipline),
		fetchCapabilityItems(db, input.teamId, input.agentId, agentDiscipline),
	]);

	const allItems = [...factoryItems, ...teamItems, ...ownItems];

	const rankedItems = await rank(db, allItems, {
		taskDescription: input.taskDescription,
		taskTags: tokenizeDescription(input.taskDescription),
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
