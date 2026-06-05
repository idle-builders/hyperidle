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
export const KERNEL_KNOWLEDGE_STATUSES = ["draft", "active", "archived", "needs_human"] as const;
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
 * AB0: Agent categories. Closed enum — adding a fourth requires a concept-doc update.
 * - team: bound to a team, domain specialist
 * - strategy: factory-wide, strategy-controlled
 * - personal: bound to a human user
 *
 * @lore AB0: Replaces the KERNEL_USER_ROLES / FABRIC_USER_ROLES split which was
 * about system layer, not agent category. The category system is orthogonal to
 * the role system.
 */
export const AGENT_CATEGORIES = ["team", "strategy", "personal"] as const;
export type AgentCategory = (typeof AGENT_CATEGORIES)[number];

/**
 * AB0: Agent role is an open string. The role catalog in agent-roles.ts provides
 * known roles with metadata, but any non-empty string is a valid role.
 *
 * @lore AB0: This replaces the closed USER_ROLES tuple. The old 6-value enum
 * could not accommodate new domain-specific roles (designer, QA, ops, etc.)
 * without code changes. Open string + catalog avoids the enum expansion problem.
 */
export type UserRole = string;

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
