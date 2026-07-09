import type {
	AgentOperationalStatus,
	BetOutcomeVerdict,
	BetStatus,
	KnowledgeStatus,
	RoutineState,
	SessionOutcome,
	TaskOutcomeVerdict,
	TaskState,
} from "@hyperidle/shared";
import type { Status } from "./StatusChip";

/**
 * Task lifecycle state → presentation Status. Exhaustive over all 8 TaskState
 * values so a new state added to the shared union surfaces as a TS error
 * rather than silently rendering an undefined chip.
 */
export const TASK_STATE_MAP: Record<TaskState, Status> = {
	proposed: "paused",
	accepted: "healthy",
	hold: "paused",
	in_progress: "healthy",
	blocked: "blocked",
	review: "behind",
	done: "done",
	killed: "error",
};

/**
 * Knowledge lifecycle status → presentation Status. Exhaustive over all 7
 * KnowledgeStatus values.
 *
 * @lore I4 (CONFUSION resolved): `needs_human` maps to `behind` — the
 * literal name signals action-required, not idle. Mapping to `paused` would
 * read as awaiting silently, which underplays the founder-attention need.
 */
export const KNOWLEDGE_STATUS_MAP: Record<KnowledgeStatus, Status> = {
	captured: "paused",
	provisional: "behind",
	validated: "healthy",
	active: "healthy",
	stale: "error",
	archived: "done",
	needs_human: "behind",
};

/**
 * Bet lifecycle status → presentation Status. Exhaustive over all 4
 * BetStatus values post-U1 simplification.
 *
 * @lore U1: status simplified from 9 values to 4:
 *   shaped → draft, committed|in_progress|behind|blocked|paused|review → active,
 *   shipped → completed.
 */
export const BET_STATUS_MAP: Record<BetStatus, Status> = {
	draft: "paused",
	active: "healthy",
	completed: "done",
	killed: "error",
};

export function taskStateToStatus(state: TaskState): Status {
	// noUncheckedIndexedAccess widens Record<K,V>[K] to V|undefined; the Record
	// is exhaustive so the value is always present — non-null is safe here.
	return TASK_STATE_MAP[state] as Status;
}

export function knowledgeStatusToStatus(ks: KnowledgeStatus): Status {
	return KNOWLEDGE_STATUS_MAP[ks] as Status;
}

export function betStatusToStatus(bs: BetStatus): Status {
	return BET_STATUS_MAP[bs] as Status;
}

/**
 * Session outcome → presentation Status. Exhaustive over all 3 SessionOutcome
 * values so a new outcome added to the shared union surfaces as a TS error.
 *
 * @lore L19: "completed" maps to "done" (not the raw "completed" string) —
 * StatusChip renders the status label, which shows "DONE" to the founder.
 * This is deliberate: the chip vocabulary is the presentation system's, not
 * the session domain's.
 */
export const SESSION_OUTCOME_MAP: Record<SessionOutcome, Status> = {
	completed: "done",
	crashed: "error",
	stopped: "paused",
	// AL6 v2: not_returned is a non-completed turn outcome; maps to "error"
	// in the UI (the turn was not accepted as a clean complete).
	not_returned: "error",
};

export function sessionOutcomeToStatus(outcome: SessionOutcome): Status {
	return SESSION_OUTCOME_MAP[outcome] as Status;
}

/**
 * Routine lifecycle state → presentation Status. Exhaustive over all 3
 * RoutineState values added in AA1.
 *
 * - active → healthy: routine is running on schedule.
 * - paused → paused: routine is suspended, no action required yet.
 * - error → error: last run failed; operator attention required.
 */
export const ROUTINE_STATE_MAP: Record<RoutineState, Status> = {
	active: "healthy",
	paused: "paused",
	error: "error",
};

export function routineStateToStatus(state: RoutineState): Status {
	return ROUTINE_STATE_MAP[state] as Status;
}

/**
 * AI4 Decision 6: Bet outcome verdict → presentation Status. Exhaustive.
 *
 * Color rationale (reviewer-approved):
 *   validated → healthy (green) — hypothesis held
 *   refuted → error (red) — hypothesis failed
 *   partial → behind (amber) — "not a clean win, look closer"
 *   inconclusive → paused (blue) — insufficient evidence
 */
export const BET_OUTCOME_VERDICT_STATUS: Record<BetOutcomeVerdict, Status> = {
	validated: "healthy",
	refuted: "error",
	partial: "behind",
	inconclusive: "paused",
};

export function betOutcomeVerdictToStatus(v: BetOutcomeVerdict): Status {
	return BET_OUTCOME_VERDICT_STATUS[v] as Status;
}

/**
 * AI4 Decision 6: Task outcome verdict → presentation Status. Exhaustive.
 *
 * @lore AI4 Decision 6: partial/rework → behind (amber). "Not a clean win."
 */
export const TASK_OUTCOME_VERDICT_STATUS: Record<TaskOutcomeVerdict, Status> = {
	met: "healthy",
	met_with_rework: "behind",
	partially_met: "behind",
	not_met: "error",
};

export function taskOutcomeVerdictToStatus(v: TaskOutcomeVerdict): Status {
	return TASK_OUTCOME_VERDICT_STATUS[v] as Status;
}

/**
 * AI4 Decision 3a: Agent operational status → presentation Status.
 * Closed 3-value set; lives in design-system (mapping presentation).
 * The AgentOperationalStatus type + label registry live in @hyperidle/shared.
 */
export const AGENT_OPERATIONAL_STATUS_MAP: Record<AgentOperationalStatus, Status> = {
	active: "healthy",
	error: "error",
	idle: "paused",
};

export function agentOperationalStatusToStatus(s: AgentOperationalStatus): Status {
	return AGENT_OPERATIONAL_STATUS_MAP[s] as Status;
}
