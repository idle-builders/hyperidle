import type { BetStatus, SessionOutcome, TaskState } from "@hyperidle/shared";
import type { KnowledgeStatus } from "@hyperidle/fabric";
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
 * Bet lifecycle status → presentation Status. Exhaustive over all 9
 * BetStatus values. `behind`, `blocked`, `paused` map to their like-named
 * presentation values; `review` maps to `behind` (action-required).
 */
export const BET_STATUS_MAP: Record<BetStatus, Status> = {
	shaped: "paused",
	committed: "healthy",
	in_progress: "healthy",
	behind: "behind",
	blocked: "blocked",
	paused: "paused",
	review: "behind",
	shipped: "done",
	killed: "error",
};

export function taskStateToStatus(state: TaskState): Status {
	return TASK_STATE_MAP[state];
}

export function knowledgeStatusToStatus(ks: KnowledgeStatus): Status {
	return KNOWLEDGE_STATUS_MAP[ks];
}

export function betStatusToStatus(bs: BetStatus): Status {
	return BET_STATUS_MAP[bs];
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
};

export function sessionOutcomeToStatus(outcome: SessionOutcome): Status {
	return SESSION_OUTCOME_MAP[outcome];
}
