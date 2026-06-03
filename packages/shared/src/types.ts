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
export const MUTABLE_BET_FIELDS = [
	"done_condition",
	"hypothesis",
	"cost_appetite",
	"description",
	"at_risk",
] as const;

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
 *
 * @lore U1: Simplified from 9 statuses to 4. Old status mapping:
 * shaped->draft, committed|in_progress|behind|blocked|paused|review->active,
 * shipped->completed, killed->killed. The `at_risk` boolean on bets replaces
 * the old `behind` sub-state.
 */
export const BET_STATUSES = ["draft", "active", "completed", "killed"] as const;

export type BetStatus = (typeof BET_STATUSES)[number];

export type SessionState = "active" | "paused" | "done" | "crashed";

export type ModelTier = "reasoning" | "workhorse" | "fast";

/**
 * X3: Runtime-safe tuple of all valid ModelTier values.
 * Used for Zod enum schemas at API boundaries so validation does not require
 * an unsafe `as` cast. ModelTier already exists as a type; MODEL_TIERS is the
 * corresponding const tuple for runtime use.
 */
export const MODEL_TIERS = ["reasoning", "workhorse", "fast"] as const;

export type TriggerType = "heartbeat" | "calendar" | "event" | "continuous";

/**
 * Kernel user roles (assigned to AI users that run inside the kernel runtime).
 * Fabric roles (practice_facilitator, chief_of_staff, brand_voice) live in
 * FABRIC_USER_ROLES and are composed into USER_ROLES below.
 *
 * @lore O1: split from the flat UserRole union as part of kernel/strategy
 * separation. Kernel services only care about kernel roles; fabric/UI code
 * uses USER_ROLES for the full composed list.
 * @lore P2: Renamed from KERNEL_AGENT_ROLES / AGENT_ROLES to KERNEL_USER_ROLES / USER_ROLES
 * as part of the Unified User primitive rename.
 */
export const KERNEL_USER_ROLES = ["builder", "growth", "product_manager"] as const;
export const FABRIC_USER_ROLES = ["practice_facilitator", "chief_of_staff", "brand_voice"] as const;
export const USER_ROLES = [...KERNEL_USER_ROLES, ...FABRIC_USER_ROLES] as const;
export type UserRole = (typeof USER_ROLES)[number];

export type UserStatus = "active" | "paused" | "retired";

/**
 * P2: Human vs AI kind discriminator.
 * "human" = a real person (the founder); "ai" = an AI agent.
 */
export const USER_KINDS = ["human", "ai"] as const;
export type UserKind = (typeof USER_KINDS)[number];

/**
 * P2: OrgChart edge mechanisms.
 * "direct" = edge targets a specific userId,
 * "function" = edge targets a role string,
 * "team" = edge targets a teamId.
 */
export const ORG_EDGE_MECHANISMS = ["direct", "function", "team"] as const;
export type OrgEdgeMechanism = (typeof ORG_EDGE_MECHANISMS)[number];

/**
 * Kernel-level scope kinds for knowledge items. Closed enum — adding a new
 * scope kind requires a concept-doc update per the Q2 contract.
 *
 * @lore Q2: scope_kind lives on the kernel knowledgeItems table so every
 * item knows where it belongs, regardless of which strategy fabric is active.
 * The fabric maps scope_kind → layer via scopeToLayer() in @hyperidle/fabric.
 */
export const SCOPE_KINDS = [
	"factory",
	"product",
	"practice",
	"team",
	"bet",
	"task",
	"user",
] as const;

export type ScopeKind = (typeof SCOPE_KINDS)[number];

/**
 * Scope kinds that require an external scopeId.
 * "factory" and "user" are self-referential/global — they never need an id.
 *
 * @lore Q2: Extracted to @hyperidle/shared so the web dialogs (KnowledgeCreateDialog,
 * ScopeChangeDialog) and the server route (knowledge.ts) share a single source of truth.
 */
export const SCOPES_REQUIRING_ID: ReadonlySet<ScopeKind> = new Set<ScopeKind>([
	"product",
	"practice",
	"team",
	"bet",
	"task",
]);
