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
export const MUTABLE_BET_FIELDS = ["done_condition", "hypothesis", "cost_appetite"] as const;

export type MutableBetField = (typeof MUTABLE_BET_FIELDS)[number];

export interface HealthResponse {
	status: "ok";
	timestamp: string;
}

export type KnowledgeFormat = "markdown" | "toon";

/**
 * Kernel-level knowledge statuses: the three states the kernel cares about
 * (draft → active → archived). The full 7-state taxonomy lives in
 * @hyperidle/fabric as KnowledgeStatus.
 *
 * @lore O1: moved as part of kernel/strategy separation. The kernel only needs
 * to know if knowledge is draft, active, or archived. The strategy layer
 * (fabric) owns the richer 7-state lifecycle.
 */
export const KERNEL_KNOWLEDGE_STATUSES = ["draft", "active", "archived"] as const;
export type KernelKnowledgeStatus = (typeof KERNEL_KNOWLEDGE_STATUSES)[number];

/**
 * The full set of legal bet lifecycle statuses. The `BetStatus` union is
 * derived from this constant. Mirrors the I3 pattern for `TASK_STATES`.
 *
 * @lore I4 cross-cutting: required so `BET_STATUS_MAP` can be exhaustively
 * verified at runtime without drifting from the type-checked union.
 */
export const BET_STATUSES = [
	"shaped",
	"committed",
	"in_progress",
	"behind",
	"blocked",
	"paused",
	"review",
	"shipped",
	"killed",
] as const;

export type BetStatus = (typeof BET_STATUSES)[number];

export type SessionState = "active" | "paused" | "done" | "crashed";

export type ModelTier = "reasoning" | "workhorse" | "fast";

export type TriggerType = "heartbeat" | "calendar" | "event" | "continuous";

/**
 * Kernel agent roles (assigned to agents that run inside the kernel runtime).
 * Fabric roles (practice_facilitator, chief_of_staff, brand_voice) live in
 * FABRIC_AGENT_ROLES and are composed into AGENT_ROLES below.
 *
 * @lore O1: split from the flat AgentRole union as part of kernel/strategy
 * separation. Kernel services only care about kernel roles; fabric/UI code
 * uses AGENT_ROLES for the full composed list.
 */
export const KERNEL_AGENT_ROLES = ["builder", "growth", "product_manager"] as const;
export const FABRIC_AGENT_ROLES = ["practice_facilitator", "chief_of_staff", "brand_voice"] as const;
export const AGENT_ROLES = [...KERNEL_AGENT_ROLES, ...FABRIC_AGENT_ROLES] as const;
export type AgentRole = (typeof AGENT_ROLES)[number];

export type AgentStatus = "active" | "paused" | "retired";
