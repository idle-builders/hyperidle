/**
 * @lore L15: text-template wire shape for human → agent state-change requests.
 * L18 will promote to a first-class `state_request` MessageType when ratified.
 * For now, a `plain` message whose `text` matches `STATE_REQUEST_PREFIX` plus
 * `<FROM_LABEL> → <TO_LABEL>` is the canonical shape; renderers detect by prefix.
 */
import type { TaskState } from "@hyperidle/shared";
import type { KanbanColumnState } from "./Kanban";

export const STATE_REQUEST_PREFIX = "Requested state change: ";

const TASK_STATE_TO_LABEL: Record<TaskState, string> = {
	proposed: "Planned",
	accepted: "Planned",
	hold: "Planned",
	blocked: "Blocked",
	in_progress: "In Progress",
	review: "In Progress",
	done: "Done",
	killed: "Done",
};

const COLUMN_TO_LABEL: Record<KanbanColumnState, string> = {
	planned: "Planned",
	blocked: "Blocked",
	in_progress: "In Progress",
	done: "Done",
};

function labelFor(value: TaskState | KanbanColumnState): string {
	if (value in COLUMN_TO_LABEL) return COLUMN_TO_LABEL[value as KanbanColumnState];
	return TASK_STATE_TO_LABEL[value as TaskState];
}

/**
 * Build the canonical state-request message text.
 * Format: `Requested state change: <FROM> → <TO>` (literal U+2192 arrow).
 */
export function formatStateRequestText(
	from: TaskState | KanbanColumnState,
	to: TaskState | KanbanColumnState,
): string {
	return `${STATE_REQUEST_PREFIX}${labelFor(from)} → ${labelFor(to)}`;
}

/**
 * Build a deterministic, regex-safe (`/^[A-Za-z0-9_\-:.]{8,128}$/`) clientKey
 * for a state-change request. Same inputs → same key (idempotent retries on
 * the server). Different timestamps → different keys (legitimate re-request).
 */
export function makeStateRequestClientKey(
	taskId: string,
	targetColumn: KanbanColumnState,
	isoTimestamp: string,
): string {
	return `state-req:${taskId}:${targetColumn}:${isoTimestamp}`;
}
