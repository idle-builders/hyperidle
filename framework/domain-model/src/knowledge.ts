import type { ScopeKind } from "./types.js";

export const KNOWLEDGE_LAYERS = ["L0", "L1", "L2", "L3", "L4"] as const;
export type KnowledgeLayer = (typeof KNOWLEDGE_LAYERS)[number];

export const SCOPE_TO_LAYER: Readonly<Record<ScopeKind, KnowledgeLayer | null>> = {
	factory: "L4",
	product: "L2",
	practice: "L3",
	task: "L1",
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

export const KNOWLEDGE_SORT_OPTIONS = ["relevance", "recency", "frequency"] as const;
export type KnowledgeSortOption = (typeof KNOWLEDGE_SORT_OPTIONS)[number];

export type PropagationLevel = "session" | "task" | "team" | "portfolio";

/**
 * @lore BA9b: Role of a knowledge item — determines how context assembly
 * materialises it into the session sandbox.
 *
 * - ordinary: knowledge/... files (default, backward-compatible)
 * - skill: a SKILL.md in the harness's skills directory
 * - rule: knowledge/rules/ — always present, plain text for the agent
 * - agent_file: AGENTS.md-shaped content written only when scopeId === agentId
 */
export const KNOWLEDGE_ROLES = ["ordinary", "skill", "rule", "agent_file"] as const;
export type KnowledgeRole = (typeof KNOWLEDGE_ROLES)[number];
