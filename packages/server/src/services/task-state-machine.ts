import { type HyperIdleDb, tasks } from "@hyperidle/db";
import type { EventBus, TaskState } from "@hyperidle/shared";
import { eq } from "drizzle-orm";
import type { StateTransitionAuditEntry, TaskAuditEntry } from "./task-audit.js";

/** Map of each state to its valid target states. `killed` is always valid. */
export const VALID_TRANSITIONS: Record<TaskState, readonly TaskState[]> = {
	proposed: ["accepted", "killed"],
	accepted: ["in_progress", "hold", "killed"],
	hold: ["accepted", "killed"],
	in_progress: ["review", "blocked", "killed"],
	blocked: ["in_progress", "killed"],
	review: ["done", "in_progress", "killed"],
	done: ["killed"],
	killed: [],
} as const;

export class InvalidTransitionError extends Error {
	public readonly fromState: TaskState;
	public readonly toState: TaskState;
	public readonly taskId: string;

	constructor(taskId: string, fromState: TaskState, toState: TaskState) {
		super(`Invalid transition for task ${taskId}: ${fromState} -> ${toState}`);
		this.name = "InvalidTransitionError";
		this.taskId = taskId;
		this.fromState = fromState;
		this.toState = toState;
	}
}

/**
 * Transition a task to a new state, validating the transition, updating the DB,
 * logging to the audit trail, and emitting a task_state_changed event.
 *
 * Throws InvalidTransitionError if the transition is not allowed.
 * Throws Error if the task does not exist.
 *
 * @lore I1 — audit entries use the shared `StateTransitionAuditEntry` shape from
 * `task-audit.ts` so all writers (this function, `handoff`, `revertTaskToAccepted`)
 * produce values of the same `TaskAuditEntry` union. Readers discriminate via the
 * `type: "handoff"` tag on handoff entries.
 */
export async function transitionTask(
	db: HyperIdleDb,
	eventBus: EventBus,
	taskId: string,
	toState: TaskState,
): Promise<void> {
	const [task] = await db.select().from(tasks).where(eq(tasks.id, taskId)).limit(1);
	if (!task) {
		throw new Error(`Task not found: ${taskId}`);
	}

	const fromState = task.state as TaskState;
	const allowed = VALID_TRANSITIONS[fromState];
	if (!allowed.includes(toState)) {
		throw new InvalidTransitionError(taskId, fromState, toState);
	}

	// Build audit trail — stored in auditTrail column (notes is for agent-authored prose)
	const existingAudit: TaskAuditEntry[] = task.auditTrail
		? (JSON.parse(task.auditTrail) as TaskAuditEntry[])
		: [];
	const entry: StateTransitionAuditEntry = {
		from: fromState,
		to: toState,
		timestamp: new Date().toISOString(),
	};
	existingAudit.push(entry);

	await db
		.update(tasks)
		.set({
			state: toState,
			auditTrail: JSON.stringify(existingAudit),
			updatedAt: new Date().toISOString(),
		})
		.where(eq(tasks.id, taskId));

	eventBus.emit({
		type: "task_state_changed",
		streamId: taskId,
		taskId,
		fromState,
		toState,
		timestamp: Date.now(),
	});
}
