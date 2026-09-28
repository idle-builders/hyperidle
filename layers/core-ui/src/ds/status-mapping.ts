import type {
	AgentOperationalStatus,
	DocumentStatus,
	SessionOutcome,
	TaskOutcomeVerdict,
	TaskState,
	VerdictDecision,
} from "@hyperidle/domain-model";
import type { Status } from "./StatusChip";

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

export const DOCUMENT_STATUS_MAP: Record<DocumentStatus, Status> = {
	proposed: "behind",
	active: "healthy",
	stale: "error",
	archived: "done",
};

export function taskStateToStatus(state: TaskState): Status {
	// noUncheckedIndexedAccess widens exhaustive Record to V|undefined; non-null cast is safe here
	return TASK_STATE_MAP[state] as Status;
}

export function documentStatusToStatus(ds: DocumentStatus): Status {
	return DOCUMENT_STATUS_MAP[ds] as Status;
}

export const SESSION_OUTCOME_MAP: Record<SessionOutcome, Status> = {
	completed: "done",
	crashed: "error",
	stopped: "paused",
	not_returned: "error",
};

export function sessionOutcomeToStatus(outcome: SessionOutcome): Status {
	return SESSION_OUTCOME_MAP[outcome] as Status;
}

export const TASK_OUTCOME_VERDICT_STATUS: Record<TaskOutcomeVerdict, Status> = {
	met: "healthy",
	met_with_rework: "behind",
	partially_met: "behind",
	not_met: "error",
};

export function taskOutcomeVerdictToStatus(v: TaskOutcomeVerdict): Status {
	return TASK_OUTCOME_VERDICT_STATUS[v] as Status;
}

export const AGENT_OPERATIONAL_STATUS_MAP: Record<AgentOperationalStatus, Status> = {
	active: "healthy",
	error: "error",
	idle: "paused",
};

export function agentOperationalStatusToStatus(s: AgentOperationalStatus): Status {
	return AGENT_OPERATIONAL_STATUS_MAP[s] as Status;
}

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
