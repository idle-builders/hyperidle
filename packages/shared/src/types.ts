export type TaskState =
	| "proposed"
	| "accepted"
	| "hold"
	| "in_progress"
	| "blocked"
	| "review"
	| "done"
	| "killed";

export type KnowledgeLayer = "L0" | "L1" | "L2" | "L3" | "L4";

export const KNOWLEDGE_LAYERS: readonly KnowledgeLayer[] = ["L0", "L1", "L2", "L3", "L4"] as const;

export interface HealthResponse {
	status: "ok";
	timestamp: string;
}

export type KnowledgeStatus =
	| "captured"
	| "provisional"
	| "validated"
	| "active"
	| "stale"
	| "archived";

export type KnowledgeFormat = "markdown" | "toon";

export type KnowledgeKind =
	| "pattern"
	| "anti_pattern"
	| "brief"
	| "principle"
	| "decision"
	| "failure"
	| "reflection"
	| "focus";
