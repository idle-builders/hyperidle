/**
 * App runtime knowledge taxonomy, scoring, and propagation types.
 *
 * @lore O1: these types were moved from @hyperidle/domain-model as part of the
 * runtime split. Shared UI code imports public app vocabulary from
 * @hyperidle/domain-model; server app runtime keeps its local compatibility types here.
 */

// --- Knowledge taxonomy ---

export type KnowledgeLayer = "L0" | "L1" | "L2" | "L3" | "L4";

const KNOWLEDGE_STATUSES = [
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

export { KNOWLEDGE_STATUSES };
