// @lore BB1: BetStatus removed — bet vocabulary folded into TASK_STATES.
import type {
	AgentOperationalStatus,
	DocumentStatus,
	SessionOutcome,
	TaskOutcomeVerdict,
	TaskState,
	VerdictDecision,
} from "@hyperidle/domain-model";
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
 * Document lifecycle status → presentation Status. Exhaustive over the
 * 4-value DocumentStatus ladder.
 *
 * @lore nested-knowledge-items: collapsed the old 7-value set —
 * captured/provisional/needs_human → proposed, validated → active.
 * @lore BC4: renamed from KNOWLEDGE_STATUS_MAP/knowledgeStatusToStatus —
 * values unchanged, `documents.status` carries the same four-value ladder.
 */
export const DOCUMENT_STATUS_MAP: Record<DocumentStatus, Status> = {
	proposed: "behind",
	active: "healthy",
	stale: "error",
	archived: "done",
};

export function taskStateToStatus(state: TaskState): Status {
	// noUncheckedIndexedAccess widens Record<K,V>[K] to V|undefined; the Record
	// is exhaustive so the value is always present — non-null is safe here.
	return TASK_STATE_MAP[state] as Status;
}

export function documentStatusToStatus(ds: DocumentStatus): Status {
	return DOCUMENT_STATUS_MAP[ds] as Status;
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
	// not_returned is a non-completed turn outcome; maps to "error"
	// in the UI (the turn was not accepted as a clean complete).
	not_returned: "error",
};

export function sessionOutcomeToStatus(outcome: SessionOutcome): Status {
	return SESSION_OUTCOME_MAP[outcome] as Status;
}

/**
 * Task outcome verdict → presentation Status. Exhaustive.
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
 * Agent operational status → presentation Status.
 * Closed 3-value set; lives in design-system (mapping presentation).
 * The AgentOperationalStatus type + label registry live in @hyperidle/domain-model.
 */
export const AGENT_OPERATIONAL_STATUS_MAP: Record<AgentOperationalStatus, Status> = {
	active: "healthy",
	error: "error",
	idle: "paused",
};

export function agentOperationalStatusToStatus(s: AgentOperationalStatus): Status {
	return AGENT_OPERATIONAL_STATUS_MAP[s] as Status;
}

/**
 * Map a verdict decision to a `Status` chip token. Pairs with
 * `verdictDecisionLabel` — same source-of-truth concern.
 *
 * @lore AU44-b8: moved from framework/domain-model/src/thread.ts.
 * Belongs in status-mapping.ts, its only consumer's file's sibling.
 */
export function verdictDecisionToStatus(
	decision: VerdictDecision,
): "done" | "blocked" | "behind" | "paused" {
	switch (decision) {
		case "approve":
		case "approve-with-comments":
			return "done";
		case "reject":
			return "blocked";
		case "request-changes":
			return "behind";
		case "edit":
			return "paused";
	}
}
