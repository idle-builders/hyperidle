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
 * AI4: Human-readable labels for each TaskState. Exhaustive `Record` so adding
 * a 9th TaskState is a TS error until labelled here.
 *
 * @lore AC1: "met_with_rework"→"Rework" and "partially_met"→"Partial" preserve
 * WorkBet's pre-existing abbreviations. Labels render verbatim into DOM;
 * CSS `uppercase` in StatusChip provides visual uppercasing (Decision 1a).
 */
export const TASK_STATE_LABEL: Record<TaskState, string> = {
	proposed: "Planned",
	accepted: "Planned",
	hold: "On hold",
	in_progress: "In progress",
	blocked: "Blocked",
	review: "In review",
	done: "Done",
	killed: "Killed",
};

/**
 * The mutable fields a bet caller can patch via PATCH /api/bets/:id while
 * the bet is in `in_progress`. Mirrored by the server's
 * `bet-state-machine.MUTABLE_FIELDS` set; both must stay in sync.
 *
 * @lore I2 V2: the route schema now uses `z.enum(MUTABLE_BET_FIELDS)` so a
 * bad `field` value is rejected by Zod (400) instead of falling through to
 * the service layer (which would throw a generic 500).
 */
export interface HealthResponse {
	status: "ok";
	timestamp: string;
}

/**
 * Kernel-level knowledge statuses: the three states the kernel cares about
 * (draft → active → archived). The full 7-state taxonomy lives in
 * @hyperidle/server (packages/server/src/knowledge/types.ts) as KnowledgeStatus.
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

/**
 * AI4: Human-readable labels for each BetStatus. Exhaustive `Record`.
 */
export const BET_STATUS_LABEL: Record<BetStatus, string> = {
	draft: "Draft",
	active: "Active",
	completed: "Completed",
	killed: "Killed",
};

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
 * AB0: Agent categories. Closed enum.
 * - team: bound to a team, domain specialist
 * - individual: bound to a human user (or a factory-wide agent not tied to one team)
 *
 * @lore AB0: Replaces the KERNEL_USER_ROLES / FABRIC_USER_ROLES split which was
 * about system layer, not agent category. The category system is orthogonal to
 * the role system.
 * @lore AD8a: Renamed "personal" → "individual". Migration 0027_AD8a_agent_type_rename.sql
 * updates existing DB rows.
 * @lore BA9d: "strategy" removed. Migration 0065 migrates all strategy rows to "individual".
 * The five seeded facilitators are dropped from factory-state.ts; factory-wide roles
 * (facilitator, scout, infra, platform) now use "individual".
 */
export const AGENT_CATEGORIES = ["team", "individual"] as const;
export type AgentCategory = (typeof AGENT_CATEGORIES)[number];

/**
 * AB0: Agent role is an open string. The role catalog in agent-roles.ts provides
 * known roles with metadata, but any non-empty string is a valid role.
 *
 * @lore AB0: This replaces the closed USER_ROLES tuple. The old 6-value enum
 * could not accommodate new domain-specific roles (designer, QA, ops, etc.)
 * without code changes. Open string + catalog avoids the enum expansion problem.
 */
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
 * The fabric maps scope_kind → layer via scopeToLayer() in packages/server/src/knowledge/types.ts.
 *
 * @lore AU26 F2 (founder ruling, 2026-08-04): `"filesystem"` is REMOVED. AV3
 * had added it so a knowledge item could hang off a repo/doc-set, and that one
 * usage was the only reason the `filesystems` record had to stay core-owned
 * while its mounting engine lived in agent-orchestration. A filesystem is an
 * agent's execution environment, not a place knowledge lives — the founder
 * ruled the scope out and the record whole into agent-orchestration. There is
 * no production data, so nothing is migrated.
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
 * @lore Q2: Extracted to @hyperidle/domain-model so the web dialogs (KnowledgeCreateDialog,
 * ScopeChangeDialog) and the server route (knowledge.ts) share a single source of truth.
 * @lore AV3 A2: "filesystem" added — references filesystems.id.
 * @lore AU26 F2: "filesystem" removed again with the scope kind itself.
 */
export const SCOPES_REQUIRING_ID: ReadonlySet<ScopeKind> = new Set<ScopeKind>([
	"product",
	"practice",
	"team",
	"bet",
	"task",
]);

/**
 * Maps a raw scopeKind from the API to the user-facing bucket label.
 * factory/practice/bet/task → "Shared"
 * team/product → "Team"
 * user → "Private"
 * Anything else → "Shared" (safe fallback).
 *
 * @lore AV3: SSOT for scope label mapping — lives beside ScopeKind so the
 * server (core-api) and the web (core-ui) import the same function rather than
 * inlining copies that can drift. Moved from @hyperidle/presentation-format
 * (dissolved) and core-ui/scope-labels.ts in AU44 review.
 */
export function scopeKindToLabel(scopeKind: string): string {
	if (scopeKind === "user") return "Private";
	if (scopeKind === "team" || scopeKind === "product") return "Team";
	return "Shared";
}

/**
 * AC1: Closed enum of bet outcome verdicts.
 * Adding a fifth value requires updating plans/AC1/concept.md first.
 *
 * @lore AC1: "validated" means the hypothesis held; "refuted" means it didn't;
 * "partial" means mixed results; "inconclusive" means insufficient evidence.
 * These are retrospective evaluations of hypothesis quality, distinct from the
 * thread `VerdictDecision` type (approve/reject) which is a conversational action.
 */
export const BET_OUTCOME_VERDICTS = ["validated", "refuted", "partial", "inconclusive"] as const;
export type BetOutcomeVerdict = (typeof BET_OUTCOME_VERDICTS)[number];

/**
 * AI4: Human-readable labels for each BetOutcomeVerdict (AC2, AC5).
 */
export const BET_OUTCOME_VERDICT_LABEL: Record<BetOutcomeVerdict, string> = {
	validated: "Validated",
	refuted: "Refuted",
	partial: "Partial",
	inconclusive: "Inconclusive",
};

/**
 * AC1: Closed enum of task outcome verdicts.
 * Adding a fifth value requires updating plans/AC1/concept.md first.
 *
 * @lore AC1: Records whether the task's done condition was met during review.
 * NOT set automatically by the state machine — must be explicitly recorded by
 * a human or evaluator agent.
 */
export const TASK_OUTCOME_VERDICTS = [
	"met",
	"met_with_rework",
	"partially_met",
	"not_met",
] as const;
export type TaskOutcomeVerdict = (typeof TASK_OUTCOME_VERDICTS)[number];

/**
 * AI4: Human-readable labels for each TaskOutcomeVerdict (AC2, AC5).
 *
 * @lore AC1: "met_with_rework"→"Rework" and "partially_met"→"Partial" preserve
 * WorkBet's pre-existing abbreviated rendering (not a truncation error).
 */
export const TASK_OUTCOME_VERDICT_LABEL: Record<TaskOutcomeVerdict, string> = {
	met: "Met",
	met_with_rework: "Rework",
	partially_met: "Partial",
	not_met: "Not met",
};

/**
 * AI4: Human-readable labels for each AgentOperationalStatus (Decision 3a, AC2).
 * AgentOperationalStatus type lives in `team.ts` (pre-existing).
 */
export const AGENT_OPERATIONAL_STATUS_LABEL: Record<"active" | "error" | "idle", string> = {
	active: "Active",
	error: "Error",
	idle: "Idle",
};
