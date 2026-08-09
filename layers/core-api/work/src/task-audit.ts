import type { TaskState } from "@hyperidle/domain-model";

/**
 * Audit entry shapes for `tasks.auditTrail`.
 *
 * The audit column is a JSON array of `TaskAuditEntry` values. Two semantically
 * distinct entry kinds coexist:
 *   1. `StateTransitionAuditEntry` — written by `transitionTask` (and the
 *      provisioning revert path) when a task's state changes.
 *   2. `HandoffAuditEntry` — written by `handoff` when ownership or assignment
 *      transfers.
 *
 * Discrimination is via the presence of the literal `type: "handoff"` tag on
 * handoff entries; state transitions have no explicit tag (we preserve the
 * existing shape so downstream readers do not need to migrate).
 *
 * @lore I1 — handoff used to write these entries into `tasks.notes`, which is
 * the agent-prose lane. Collapsing them into the dedicated `auditTrail` column
 * keeps prose and audit cleanly separated. See plan §3.2.
 */
export interface StateTransitionAuditEntry {
	readonly from: TaskState;
	readonly to: TaskState;
	readonly timestamp: string;
	readonly reason?: string;
}

export interface HandoffAuditEntry {
	readonly type: "handoff";
	readonly fromAgent: string;
	readonly toAgent?: string;
	readonly toHuman?: boolean;
	readonly reason: string;
	readonly timestamp: string;
}

export type TaskAuditEntry = StateTransitionAuditEntry | HandoffAuditEntry;
