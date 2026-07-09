/**
 * App runtime knowledge taxonomy, scoring, and propagation types.
 *
 * @lore O1: these types were moved from @hyperidle/shared as part of the
 * runtime split. Shared UI code imports public app vocabulary from
 * @hyperidle/shared; server app runtime keeps its local compatibility types here.
 */

import type { ScopeKind } from "@hyperidle/shared";

// --- Knowledge taxonomy ---

export type KnowledgeLayer = "L0" | "L1" | "L2" | "L3" | "L4";
export const KNOWLEDGE_LAYERS: readonly KnowledgeLayer[] = ["L0", "L1", "L2", "L3", "L4"] as const;

/**
 * Maps scope kinds that participate in the L0-L4 maturity flow to their
 * default layer. Returns null for scope kinds outside the maturity flow.
 *
 * @lore Q2: layer assignment is the projection service's job. The creation flow does NOT
 * set layer. This function is called inline in the knowledge route handlers.
 */
export const SCOPE_TO_LAYER: Readonly<Record<ScopeKind, KnowledgeLayer | null>> = {
	factory: "L4",
	product: "L2",
	practice: "L3",
	task: "L1",
	bet: null,
	team: null,
	user: null,
	// @lore AV3 A2: filesystem scope does not participate in the maturity flow.
	filesystem: null,
};

export function scopeToLayer(scopeKind: ScopeKind): KnowledgeLayer | null {
	// @lore AF3: SCOPE_TO_LAYER covers all ScopeKind values; undefined is
	// unreachable but noUncheckedIndexedAccess requires the guard.
	return SCOPE_TO_LAYER[scopeKind] ?? null;
}

export const KNOWLEDGE_STATUSES = [
	"captured",
	"provisional",
	"validated",
	"active",
	"stale",
	"archived",
	"needs_human",
] as const;
export type KnowledgeStatus = (typeof KNOWLEDGE_STATUSES)[number];

/**
 * AI4 Note A2: Human-readable labels for each KnowledgeStatus. Lives in
 * server app runtime. Exhaustive `Record` — adding a new KnowledgeStatus is
 * a TS error until labelled here.
 *
 * @lore AI4: archived→"Stale" is a deliberate copy choice (not a bug).
 * `stale` is a separate KnowledgeStatus value; `archived` rows are shown
 * as "Stale" in KnowledgeList because semantically they represent stale
 * knowledge that has been superseded/archived. Single-sourced here to
 * satisfy AC4 (no page-local label map).
 */
export const KNOWLEDGE_STATUS_LABEL: Record<KnowledgeStatus, string> = {
	captured: "Captured",
	provisional: "Provisional",
	validated: "Validated",
	active: "Active",
	stale: "Stale",
	archived: "Stale",
	needs_human: "Needs review",
};

export type KnowledgeKind =
	| "pattern"
	| "anti_pattern"
	| "brief"
	| "principle"
	| "decision"
	| "failure"
	| "reflection"
	| "focus";

/**
 * @deprecated Q2: Use `ScopeKind` from `@hyperidle/shared` instead. `KnowledgeScope`
 * predates the Q2 scope model and covers only three of the seven scope kinds.
 * Kept for backwards compatibility with pre-AU3 runtime code; do not use in new code.
 */
export const KNOWLEDGE_SCOPES = ["practice", "product", "factory"] as const;
/** @deprecated Use `ScopeKind` from `@hyperidle/shared`. See `KNOWLEDGE_SCOPES`. */
export type KnowledgeScope = (typeof KNOWLEDGE_SCOPES)[number];

export const KNOWLEDGE_TOPIC_HEALTHS = ["fresh", "some_stale", "mostly_stale"] as const;
export type KnowledgeTopicHealth = (typeof KNOWLEDGE_TOPIC_HEALTHS)[number];

export type KnowledgeAccessorKind = "human" | "agent";

/**
 * The three relevance signals surfaced in the UI signal triad.
 * - recency: relative time string ("2d ago") or null when never validated/accessed
 * - accessCount30d: integer count of accesses in the last 30 days, or null when no log
 * - citationCount: always null in L22 (staged for a later work-package)
 */
export interface KnowledgeRelevanceSignals {
	recency: string | null;
	accessCount30d: number | null;
	citationCount: number | null;
}

export const KNOWLEDGE_SORT_OPTIONS = ["relevance", "recency", "frequency"] as const;
export type KnowledgeSortOption = (typeof KNOWLEDGE_SORT_OPTIONS)[number];

// --- Planning policy types ---

export type RiskTier = "low" | "medium" | "high";
export type AutonomyLevel = 1 | 2 | 3 | 4;

// --- Lifecycle propagation types ---

/** @lore U1: `"product"` renamed to `"team"` to match the new domain entity name. */
export type PropagationLevel = "session" | "task" | "bet" | "team" | "portfolio";
export type PropagationStatus = "applied" | "skipped" | "failed" | "pending_retry";

export interface PropagationResult {
	sourceLevel: PropagationLevel;
	sourceId: string;
	targetLevel: PropagationLevel;
	targetId: string;
	/** e.g. "in_progress -> review" or null if no-op */
	targetTransition: string | null;
	status: PropagationStatus;
	failureReason?: string;
}
