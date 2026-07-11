/**
 * App runtime knowledge taxonomy, scoring, and propagation types.
 *
 * @lore O1: these types were moved from @hyperidle/shared as part of the
 * runtime split. Shared UI code imports public app vocabulary from
 * @hyperidle/shared; server app runtime keeps its local compatibility types here.
 */

// --- Knowledge taxonomy ---

export type KnowledgeLayer = "L0" | "L1" | "L2" | "L3" | "L4";

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

// --- Lifecycle propagation types ---

/** @lore U1: `"product"` renamed to `"team"` to match the new domain entity name. */
export type PropagationLevel = "session" | "task" | "bet" | "team" | "portfolio";
