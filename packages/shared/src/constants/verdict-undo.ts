/**
 * @lore L4: shared defaults for verdict undo. Snapshot per `responses` row
 * so concurrent setting edits don't change in-flight windows. Clamp range
 * [3, 15] enforced by both UI validate-time and server clamping.
 */
export const DEFAULT_UNDO_WINDOW_SECONDS = 8;
export const UNDO_WINDOW_MIN = 3;
export const UNDO_WINDOW_MAX = 15;
export const UNDO_WINDOW_OPTIONS = [3, 5, 8, 10, 12, 15] as const;
export const DEFAULT_VERDICT_DOUBLE_CLICK = true;

export type VerdictAction =
	| "approve"
	| "approve-with-comments"
	| "comment"
	| "inline-comment"
	| "request-changes"
	| "edit"
	| "reject"
	| "reply"
	| "snooze"
	| "escalate"
	| "pause";
