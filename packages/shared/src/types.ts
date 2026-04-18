/**
 * The full set of legal task lifecycle states. The `TaskState` union is
 * derived from this constant so the runtime list (used by Zod enums at
 * route boundaries) and the type checker cannot drift.
 *
 * @lore I2 V1: previously the route schema accepted `z.string()`, which let
 * invalid states fall through to the state-machine and surface as 409. Routes
 * must use `z.enum(TASK_STATES)` so bad input is a 400 from validation.
 */
export const TASK_STATES = [
	"proposed",
	"accepted",
	"hold",
	"in_progress",
	"blocked",
	"review",
	"done",
	"killed",
] as const;

export type TaskState = (typeof TASK_STATES)[number];

/**
 * The mutable fields a bet caller can patch via PATCH /api/bets/:id while
 * the bet is in `in_progress`. Mirrored by the server's
 * `bet-state-machine.MUTABLE_FIELDS` set; both must stay in sync.
 *
 * @lore I2 V2: the route schema now uses `z.enum(MUTABLE_BET_FIELDS)` so a
 * bad `field` value is rejected by Zod (400) instead of falling through to
 * the service layer (which would throw a generic 500).
 */
export const MUTABLE_BET_FIELDS = ["done_condition", "hypothesis", "appetite"] as const;

export type MutableBetField = (typeof MUTABLE_BET_FIELDS)[number];

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
	| "archived"
	| "needs_human";

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

export type BetStatus =
	| "shaped"
	| "committed"
	| "in_progress"
	| "behind"
	| "blocked"
	| "paused"
	| "review"
	| "shipped"
	| "killed";

export type SessionState = "active" | "paused" | "done" | "crashed";

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
