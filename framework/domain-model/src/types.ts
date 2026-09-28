/**
 * The full set of legal task lifecycle states. The `TaskState` union is
 * derived from this constant so the runtime list (used by Zod enums at
 * route boundaries) and the type checker cannot drift.
 *
 * @lore: TASK_STATES — routes must use z.enum(TASK_STATES); a bare z.string() lets invalid states reach the state-machine and surface as 409 instead of 400
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
 * @lore: labels render verbatim into DOM; CSS `uppercase` in StatusChip provides visual uppercasing
 */
export const TASK_STATE_LABEL: Record<TaskState, string> = {
	proposed: "Planned",
	// @lore: `proposed` = drafted, not yet picked up; `accepted` = committed to owner, counts against concurrent-task limit; labels must remain distinct
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
 * @lore: KERNEL_DOCUMENT_STATUSES — same four-value ladder as DOCUMENT_STATUSES; one lifecycle, no divergence between kernel and app-runtime
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
 * @lore: "individual" category covers factory-wide (no-team) plugin agents; "strategy" rows migrated to "individual" in 0065
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
 * `select`), so a near-miss is as fatal as nonsense. The demo world seeded
 * `"claude"` against an adapter registered as `"claude-code"`, which made its
 * builder agent permanently unrunnable — a typo no type caught, because every
 * declaration on the path was a bare `string`. Both the registration side and
 * every writer now spell the vocabulary from here.
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
 * @lore: scope_kind on kernel documents — every item knows where it belongs; fabric maps scope_kind → layer via scopeToLayer() regardless of active strategy
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
 * @lore: scopeKindToLabel — SSOT; server (core-api) and web (core-ui) import here rather than inlining copies that can drift
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
 * @lore: TaskOutcomeVerdict — records whether done condition was met; NOT set automatically; must be explicitly recorded by a human or evaluator agent
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
 * @lore: "met_with_rework"→"Rework" and "partially_met"→"Partial" are intentional abbreviations, not truncation errors
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
 * harness). Every switch(outcome) consumer MUST handle this member — see the
 * exhaustiveness guard in session-lifecycle.ts.
 *
 * @lore: SessionOutcome lives in domain-model — core-ui reads it via the barrel (cannot reach @hyperidle/event-bus); event-bus imports it back from here
 */
export type SessionOutcome = "completed" | "crashed" | "stopped" | "not_returned";
