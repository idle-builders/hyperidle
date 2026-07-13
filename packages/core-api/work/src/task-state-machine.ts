import { randomUUID } from "node:crypto";
import { type HyperIdleDb, taskDispatchAttempts } from "@hyperidle/db";
import type { EventBus, TaskState } from "@hyperidle/shared";
import { eq } from "drizzle-orm";
import type { AgentWorkIntentRecorder } from "./ports.js";
import type { StateTransitionAuditEntry, TaskAuditEntry } from "./task-audit.js";
import * as work from "./work-service.js";

/**
 * Injected-port deps for `transitionTask`/`cascadeBetKill` (Mechanism C).
 *
 * @lore AU19 Increment 1b: `workIntents` is the same §10.3 against-grain
 * `session-requests` port as `bet-decomposition.ts`'s — interim DI wiring,
 * rewired to an EventBus subscription in Increment 3.
 */
export interface TaskStateMachineDeps {
	readonly workIntents: AgentWorkIntentRecorder;
}

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
 *
 * @lore AF12 AC5: mirrors `transitionBet`'s CAS contract — and "mirror" means the
 * same TRANSACTION boundary, not just the WHERE-clause guard. The SELECT-validate,
 * audit read+append, and CAS-UPDATE all run inside one `db.transaction` so the
 * audit read and the state write serialize together on the SQLite/PG write-lock.
 * Without the shared tx, two concurrent transitions both read the same audit blob
 * outside any lock and the second UPDATE clobbers the first (last-writer-wins) —
 * one audit entry is silently lost even with a WHERE-only CAS. The loser's
 * `UPDATE ... WHERE id AND state = fromState` matches 0 rows → InvalidTransitionError
 * → tx rolls back (no partial write). `task_state_changed` emits AFTER commit so
 * only the winner emits exactly once.
 */
export async function transitionTask(
	db: HyperIdleDb,
	eventBus: EventBus,
	taskId: string,
	toState: TaskState,
	deps: TaskStateMachineDeps,
	dispatchOccasion?: "accepted" | "retry",
): Promise<void> {
	const transitioned = await db.transaction(
		async (tx): Promise<{ fromState: TaskState } | null> => {
			// Re-read INSIDE the tx so the audit read and the CAS write serialize together.
			// @lore AU13 addendum §A6: MUST stay `tx` (not pooled `db`) — reads the
			// pre-transition state inside the CAS tx.
			const task = await work.getTaskById(tx, taskId);
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

			const { applied } = await work.transitionTaskState(tx, {
				taskId,
				fromState,
				patch: {
					state: toState,
					auditTrail: JSON.stringify(existingAudit),
					updatedAt: new Date().toISOString(),
				},
			});

			// Lost the race: another concurrent transition already moved the task out
			// of `fromState`. Throwing rolls back the tx (no partial state/audit write).
			if (!applied) {
				throw new InvalidTransitionError(taskId, fromState, toState);
			}

			if (toState === "accepted" && task.ownerAgentId) {
				const existing = await tx
					.select({ id: taskDispatchAttempts.id })
					.from(taskDispatchAttempts)
					.where(eq(taskDispatchAttempts.taskId, task.id));
				const attemptId = randomUUID();
				await tx.insert(taskDispatchAttempts).values({
					id: attemptId,
					taskId: task.id,
					occasion: dispatchOccasion ?? (fromState === "hold" ? "retry" : "accepted"),
					agentId: task.ownerAgentId,
					ordinal: existing.length + 1,
					status: "requested",
					createdAt: entry.timestamp,
					updatedAt: entry.timestamp,
				});
				await deps.workIntents.record(tx, {
					kind: "task_run",
					sourceKind: "task_dispatch_attempt",
					sourceId: attemptId,
					requestedBy: task.ownerAgentId,
					idempotencyKey: `task-dispatch:${attemptId}`,
				});
			}

			return { fromState };
		},
	);

	if (!transitioned) return;

	eventBus.emit({
		type: "task_state_changed",
		streamId: taskId,
		taskId,
		fromState: transitioned.fromState,
		toState,
		timestamp: Date.now(),
	});
}
