/**
 * The full set of legal task lifecycle states. The `TaskState` union is
 * derived from this constant so the runtime list (used by Zod enums at
 * route boundaries) and the type checker cannot drift.
 *
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
 * Human-readable labels for each TaskState. Exhaustive `Record` so adding
 * a 9th TaskState is a TS error until labelled here.
 *
 */
export const TASK_STATE_LABEL: Record<TaskState, string> = {
	proposed: "Planned",
	accepted: "Accepted",
	hold: "On hold",
	in_progress: "In progress",
	blocked: "Blocked",
	review: "In review",
	done: "Done",
	killed: "Killed",
};

export interface HealthResponse {
	status: "ok";
	timestamp: string;
}

/**
 */
export const KERNEL_DOCUMENT_STATUSES = ["proposed", "active", "stale", "archived"] as const;
export type KernelDocumentStatus = (typeof KERNEL_DOCUMENT_STATUSES)[number];

export type ModelTier = "reasoning" | "workhorse" | "fast";

/**
 * Runtime-safe tuple of all valid ModelTier values.
 * Used for Zod enum schemas at API boundaries so validation does not require
 * an unsafe `as` cast. ModelTier already exists as a type; MODEL_TIERS is the
 * corresponding const tuple for runtime use.
 */
export const MODEL_TIERS = ["reasoning", "workhorse", "fast"] as const;

export type TriggerType = "heartbeat" | "calendar" | "event" | "continuous";

/**
 * Agent categories. Closed enum.
 * - team: bound to a team, domain specialist
 * - individual: bound to a human user (or a factory-wide agent not tied to one team)
 *
 */
export const AGENT_CATEGORIES = ["team", "individual"] as const;
export type AgentCategory = (typeof AGENT_CATEGORIES)[number];

/**
 * The harness types an adapter can register under, and therefore the only
 * values `agent_run_config.harness_type` can usefully hold: pinning an agent
 * to anything else means the pool can never select for it and every run of
 * that agent fails.
 *
 * Selection compares this string for exact equality (`adapter-pool.ts`'s
 * `select`), so a near-miss is as fatal as nonsense. Spellings must match exactly — a near-miss is as fatal as nonsense.
 */
export const HARNESS_TYPES = ["claude-code", "codex", "opencode", "cursor-agent"] as const;
export type HarnessType = (typeof HARNESS_TYPES)[number];

/**
 * OrgChart edge mechanisms.
 * "direct" = edge targets a specific userId,
 * "function" = edge targets a role string,
 * "team" = edge targets a teamId.
 */
export const ORG_EDGE_MECHANISMS = ["direct", "function", "team"] as const;
export type OrgEdgeMechanism = (typeof ORG_EDGE_MECHANISMS)[number];

/**
 * Kernel-level scope kinds for documents. Closed enum — three concentric rings:
 * factory (everyone) > team (a team) > user (one person).
 *
 */
export const SCOPE_KINDS = ["factory", "team", "user"] as const;

export type ScopeKind = (typeof SCOPE_KINDS)[number];

/**
 * Scope kinds that require an external scopeId.
 * "factory" and "user" are self-referential/global — they never need an id.
 */
export const SCOPES_REQUIRING_ID: ReadonlySet<ScopeKind> = new Set<ScopeKind>(["team"]);

/**
 * Maps a raw scopeKind from the API to the user-facing bucket label.
 * factory → "Shared", team → "Team", user → "Private".
 * Anything else → "Shared" (safe fallback).
 *
 */
export function scopeKindToLabel(scopeKind: string): string {
	if (scopeKind === "user") return "Private";
	if (scopeKind === "team") return "Team";
	return "Shared";
}

/**
 * Closed enum of task outcome verdicts.
 * Adding a fifth value is a concept change, not a type change.
 *
 */
export const TASK_OUTCOME_VERDICTS = [
	"met",
	"met_with_rework",
	"partially_met",
	"not_met",
] as const;
export type TaskOutcomeVerdict = (typeof TASK_OUTCOME_VERDICTS)[number];

/**
 * Human-readable labels for each TaskOutcomeVerdict.
 *
 */
export const TASK_OUTCOME_VERDICT_LABEL: Record<TaskOutcomeVerdict, string> = {
	met: "Met",
	met_with_rework: "Rework",
	partially_met: "Partial",
	not_met: "Not met",
};

export const AGENT_OPERATIONAL_STATUS_LABEL: Record<"active" | "error" | "idle", string> = {
	active: "Active",
	error: "Error",
	idle: "Idle",
};

/**
 * "not_returned" is a non-completed outcome for a turn that exhausted its
 * stream without a return action (after force budget spent, or on a Tier-2
 * harness). Every switch(outcome) consumer MUST handle this member.
 *
 */
export type SessionOutcome = "completed" | "crashed" | "stopped" | "not_returned";
