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

export const BET_STATUSES = ["shaped", "committed", "in_progress", "shipped", "killed"] as const;
export type BetStatus = (typeof BET_STATUSES)[number];

export const SESSION_STATES = ["active", "paused", "done", "crashed"] as const;
export type SessionState = (typeof SESSION_STATES)[number];

export const SESSION_OUTCOMES = [
	"made_progress",
	"blocked",
	"completed",
	"handoff",
	"escalated",
] as const;
export type SessionOutcome = (typeof SESSION_OUTCOMES)[number];

export const MODEL_TIERS = ["reasoning", "workhorse", "fast"] as const;
export type ModelTier = (typeof MODEL_TIERS)[number];

export const RISK_TIERS = ["low", "medium", "high"] as const;
export type RiskTier = (typeof RISK_TIERS)[number];

export const AGENT_STATUSES = ["idle", "active", "paused", "retired"] as const;
export type AgentStatus = (typeof AGENT_STATUSES)[number];

export const TRIGGER_TYPES = ["cron", "event", "heartbeat"] as const;
export type TriggerType = (typeof TRIGGER_TYPES)[number];

export const THREAD_KINDS = ["bet", "task", "review", "general"] as const;
export type ThreadKind = (typeof THREAD_KINDS)[number];

export const AUTONOMY_LEVELS = ["L1", "L2", "L3", "L4"] as const;
export type AutonomyLevel = (typeof AUTONOMY_LEVELS)[number];

export const PRODUCT_PHASES = ["shaping", "building", "maintaining", "sunset"] as const;
export type ProductPhase = (typeof PRODUCT_PHASES)[number];

export const EDIT_TYPES = ["correction", "refinement", "rejection"] as const;
export type EditType = (typeof EDIT_TYPES)[number];
