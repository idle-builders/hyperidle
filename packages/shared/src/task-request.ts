/**
 * L15 — Pure helpers for the task-request affordance.
 *
 * `requestableStatesFor` is the authoritative gating contract. The
 * designer-owned verb labels (Start/Resume/Block/Review/Done/Abandon) live
 * here too so the menu UI and the posted message text agree on a single
 * vocabulary.
 *
 * @lore L15 plan §3.2: co-located with TaskState (closed enum) so any new
 * TaskState forces a decision in this switch via the `exhaustiveAssert`
 * default branch.
 */
import { exhaustiveAssert } from "./thread.js";
import type { TaskState } from "./types.js";

/**
 * Maps `(current, target)` to the user-facing verb. Approved.md §3 table:
 *  - accepted          → in_progress = "Start"
 *  - hold | blocked    → in_progress = "Resume"
 *  - any → blocked     = "Block"
 *  - any → review      = "Review"
 *  - any → done        = "Done"
 *  - any → killed      = "Abandon"
 *
 * Throws on any target that `requestableStatesFor` cannot produce — proposed,
 * accepted, hold are never valid request targets.
 */
export function verbLabelFor(current: TaskState, target: TaskState): string {
	if (target === "in_progress") {
		return current === "accepted" ? "Start" : "Resume";
	}
	switch (target) {
		case "blocked":
			return "Block";
		case "review":
			return "Review";
		case "done":
			return "Done";
		case "killed":
			return "Abandon";
		case "proposed":
		case "accepted":
		case "hold":
			throw new Error(`verbLabelFor: ${target} is not a requestable target state`);
		default:
			return exhaustiveAssert(target);
	}
}

export function requestableStatesFor(current: TaskState): readonly TaskState[] {
	switch (current) {
		case "proposed":
			return [];
		case "accepted":
			return ["in_progress", "blocked", "killed"];
		case "hold":
			return ["in_progress", "killed"];
		case "in_progress":
			return ["blocked", "review", "done", "killed"];
		case "blocked":
			return ["in_progress", "killed"];
		case "review":
			return ["done", "blocked", "killed"];
		case "done":
			return ["killed"];
		case "killed":
			return [];
		default:
			return exhaustiveAssert(current);
	}
}

/**
 * Generates the canonical Plain message text the menu posts. Pure.
 *
 * Approved.md §5 table:
 *   - state target only:        `Please move "{taskTitle}" to {targetVerb}.`
 *   - state target + note:      `Please move "{taskTitle}" to {targetVerb} — {note}`
 *   - note only (no target):    `Note: {note}`
 *
 * @lore L15 plan §3.2: verb labels are passed in (designer-owned) so this
 * helper stays shared-package-pure with no design vocabulary leakage. The
 * structured `request_state_change` ref is the trust boundary for agent
 * intent parsing (CONFUSION-B); the prose `text` is human-readable only.
 */
export interface RequestMessageInput {
	readonly taskTitle: string;
	readonly targetState: TaskState | null;
	readonly targetVerbLabel: string | null;
	readonly note: string | null;
}

export function generateRequestMessageText(input: RequestMessageInput): string {
	const { taskTitle, targetVerbLabel, note } = input;
	const trimmedNote = note === null ? null : note.trim();
	if (targetVerbLabel === null) {
		if (trimmedNote === null || trimmedNote === "") {
			throw new Error("generateRequestMessageText: at least one of targetVerb or note is required");
		}
		return `Note: ${trimmedNote}`;
	}
	if (trimmedNote === null || trimmedNote === "") {
		return `Please move "${taskTitle}" to ${targetVerbLabel}.`;
	}
	return `Please move "${taskTitle}" to ${targetVerbLabel} — ${trimmedNote}`;
}
