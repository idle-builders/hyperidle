/**
 * Strategy types — fabric's knowledge taxonomy, scoring, and propagation types.
 *
 * @lore O1: these types were moved from @hyperidle/shared as part of the
 * kernel/strategy separation. Kernel code imports from @hyperidle/shared;
 * strategy/UI code that needs these imports from @hyperidle/fabric.
 */

// --- Knowledge taxonomy (fabric's classification system) ---

export type KnowledgeLayer = "L0" | "L1" | "L2" | "L3" | "L4";
export const KNOWLEDGE_LAYERS: readonly KnowledgeLayer[] = ["L0", "L1", "L2", "L3", "L4"] as const;

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

export type KnowledgeKind =
	| "pattern"
	| "anti_pattern"
	| "brief"
	| "principle"
	| "decision"
	| "failure"
	| "reflection"
	| "focus";

export const KNOWLEDGE_SCOPES = ["practice", "product", "factory"] as const;
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

// --- Strategy-specific types ---

export type RiskTier = "low" | "medium" | "high";
export type AutonomyLevel = 1 | 2 | 3 | 4;

// --- Lifecycle propagation types ---

export type PropagationLevel = "session" | "task" | "bet" | "product" | "portfolio";
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
