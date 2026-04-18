import type { BetStatus, KnowledgeStatus, TaskState } from "@hyperidle/shared";
import type { Status } from "./StatusChip";

const TASK_STATE_MAP: Record<TaskState, Status> = {
	proposed: "paused",
	accepted: "healthy",
	hold: "paused",
	in_progress: "healthy",
	blocked: "blocked",
	review: "behind",
	done: "done",
	killed: "error",
};

const KNOWLEDGE_STATUS_MAP: Record<KnowledgeStatus, Status> = {
	captured: "paused",
	provisional: "behind",
	validated: "healthy",
	active: "healthy",
	stale: "error",
	archived: "done",
};

const BET_STATUS_MAP: Record<BetStatus, Status> = {
	shaped: "paused",
	committed: "healthy",
	in_progress: "healthy",
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
