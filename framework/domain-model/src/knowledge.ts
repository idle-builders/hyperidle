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
 * materialises it into the session sandbox. Widened by the knowledge-
 * attachment-slot item: role now means *where the item lands in the
 * session*, which is broader than "sandbox file or not" — `prompt` lands as
 * the run's instruction, never a file.
 *
 * - ordinary: knowledge/... files (default, backward-compatible)
 * - skill: a SKILL.md in the harness's skills directory
 * - rule: knowledge/rules/ — always present, plain text for the agent
 * - agent_file: the "## Identity" section of AGENTS.md, bound via `parentId`
 * - prompt: the run's instruction — never materialised as a sandbox file
 */
export const KNOWLEDGE_ROLES = ["ordinary", "skill", "rule", "agent_file", "prompt"] as const;
export type KnowledgeRole = (typeof KNOWLEDGE_ROLES)[number];

/**
 * @lore knowledge-attachment-slot: which table `parentId` points into. Mirrors
 * the DB CHECK `ki_parent_kind_ck` — the same relationship `KNOWLEDGE_ROLES`
 * has to `ki_role_ck`. Phase 1 writes only `routine` and `agent`; the other
 * three ship now so phase 2 and the nested-knowledge strand never reopen the
 * constraint.
 */
export const KNOWLEDGE_PARENT_KINDS = [
	"knowledge_item",
	"task",
	"thread",
	"routine",
	"agent",
] as const;
export type KnowledgeParentKind = (typeof KNOWLEDGE_PARENT_KINDS)[number];

/**
 * Reader-facing label for each role — the total map keeps
 * `npm run check` honest against `KNOWLEDGE_ROLES`: adding a role without a
 * label fails the build rather than shipping a blank badge.
 *
 * Lives in domain-model, not core-ui: its consumer is the skills-and-rules
 * list (settings), and this is document-role vocabulary — not to be confused
 * with the agent-role `roleLabel` in `./agent-roles.ts`, a different axis
 * entirely (what an agent DOES, not what a knowledge item IS).
 */
export const KNOWLEDGE_ROLE_LABEL: Record<KnowledgeRole, string> = {
	ordinary: "Knowledge",
	skill: "Skill",
	rule: "Rule",
	agent_file: "Identity",
	prompt: "Prompt",
};
