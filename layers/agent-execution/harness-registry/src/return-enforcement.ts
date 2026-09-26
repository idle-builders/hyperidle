import { type HarnessEvent, isRequiredReturnAction } from "@hyperidle/harness-protocol";
import type { EnforcementEntry, EnforcementRegistry } from "./enforcement-registry.js";

interface ReturnGate {
	observe(event: HarnessEvent): void;
	readonly returned: boolean;
}

interface ReturnEnforcement extends EnforcementRegistry {
	/**
	 * `requiredReturnActions`, when supplied,
	 * narrows the predicate in the closure: only a tool call naming one of
	 * THESE specific return actions flips `returned`. Absent ⇒ the
	 * pre-Increment-3 default (any member of the closed return set).
	 *
	 * `taskId` (B4) — the session's own task id, closed over for
	 * `edit_task`'s own-task-and-moves-away-from-the-agent gate
	 * (`isReturnAction`'s `@lore`). Absent for a task-free session.
	 */
	createGate(requiredReturnActions?: readonly string[], taskId?: string): ReturnGate;
	observe(gate: ReturnGate, event: HarnessEvent): void;
	evaluate(
		gate: ReturnGate,
		endReason: "completed" | "crashed" | "stopped",
	): "returned" | "not_returned";
}

export function createReturnEnforcement(): ReturnEnforcement {
	const entries = new Map<string, EnforcementEntry>();
	return {
		register(sessionId, entry) {
			entries.set(sessionId, entry);
		},
		get(sessionId) {
			return entries.get(sessionId);
		},
		incrementForce(sessionId) {
			const entry = entries.get(sessionId);
			if (entry) entry.forceCount += 1;
		},
		unregister(sessionId) {
			entries.delete(sessionId);
		},
		createGate(requiredReturnActions, taskId) {
			let returned = false;
			return {
				observe(event) {
					if (
						event.type === "tool_call" &&
						isRequiredReturnAction(event.toolName, requiredReturnActions, event.args, taskId)
					) {
						returned = true;
					}
				},
				get returned() {
					return returned;
				},
			};
		},
		observe(gate, event) {
			gate.observe(event);
		},
		evaluate(gate, endReason) {
			return endReason !== "completed" || gate.returned ? "returned" : "not_returned";
		},
	};
}
