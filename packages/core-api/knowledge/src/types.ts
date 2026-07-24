/**
 * App runtime knowledge taxonomy, scoring, and propagation types.
 *
 * @lore O1: these types were moved from @hyperidle/shared as part of the
 * runtime split. Shared UI code imports public app vocabulary from
 * @hyperidle/shared; server app runtime keeps its local compatibility types here.
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

// --- Scope ---

/**
 * Scope discriminant for list({scope}) — kernel-side scopeKind + scopeId filter.
 *
 * @lore AU20 K1-reads: moved here from knowledge-reader.ts (which is now deleted).
 * KnowledgeScope is re-exported from the package barrel (packages/core-api/src/index.ts
 * re-exports it from @hyperidle/knowledge) — the barrel import path changes from
 * ./knowledge-reader.js to ./types.js.
 */
export interface KnowledgeScope {
	readonly scopeKind: string;
	readonly scopeId?: string | null;
}

export { KNOWLEDGE_STATUSES };
