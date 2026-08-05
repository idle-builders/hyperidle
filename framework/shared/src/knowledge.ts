import type { ScopeKind } from "./types.js";

export const KNOWLEDGE_LAYERS = ["L0", "L1", "L2", "L3", "L4"] as const;
export type KnowledgeLayer = (typeof KNOWLEDGE_LAYERS)[number];

export const SCOPE_TO_LAYER: Readonly<Record<ScopeKind, KnowledgeLayer | null>> = {
	factory: "L4",
	product: "L2",
	practice: "L3",
	task: "L1",
	bet: null,
	team: null,
	user: null,
};

export function scopeToLayer(scopeKind: ScopeKind): KnowledgeLayer | null {
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

export const KNOWLEDGE_SCOPES = ["practice", "product", "factory"] as const;
export type KnowledgeScope = (typeof KNOWLEDGE_SCOPES)[number];

export const KNOWLEDGE_TOPIC_HEALTHS = ["fresh", "some_stale", "mostly_stale"] as const;
export type KnowledgeTopicHealth = (typeof KNOWLEDGE_TOPIC_HEALTHS)[number];

export type KnowledgeAccessorKind = "human" | "agent";

export interface KnowledgeRelevanceSignals {
	recency: string | null;
	accessCount30d: number | null;
	citationCount: number | null;
}

export const KNOWLEDGE_SORT_OPTIONS = ["relevance", "recency", "frequency"] as const;
export type KnowledgeSortOption = (typeof KNOWLEDGE_SORT_OPTIONS)[number];

export type RiskTier = "low" | "medium" | "high";
export type AutonomyLevel = 1 | 2 | 3 | 4;

export type PropagationLevel = "session" | "task" | "bet" | "team" | "portfolio";
export type PropagationStatus = "applied" | "skipped" | "failed" | "pending_retry";

export interface PropagationResult {
	sourceLevel: PropagationLevel;
	sourceId: string;
	targetLevel: PropagationLevel;
	targetId: string;
	targetTransition: string | null;
	status: PropagationStatus;
	failureReason?: string;
}
