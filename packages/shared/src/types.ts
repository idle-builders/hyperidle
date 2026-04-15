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

export type BetStatus = "shaped" | "committed" | "in_progress" | "shipped" | "killed";

export type SessionState = "active" | "done" | "crashed";

export type ModelTier = "reasoning" | "workhorse" | "fast";

export type TriggerType = "heartbeat" | "calendar" | "event" | "continuous";

export type AgentRole =
	| "builder"
	| "growth"
	| "product_manager"
	| "practice_facilitator"
	| "chief_of_staff"
	| "brand_voice";

export type AgentStatus = "active" | "paused" | "retired";

export type RiskTier = "low" | "medium" | "high";

export type AutonomyLevel = 1 | 2 | 3 | 4;
