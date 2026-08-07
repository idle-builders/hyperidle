import { randomUUID } from "node:crypto";
import { type HyperIdleDb, taskDispatchAttempts } from "@hyperidle/db";
import {
	canTransitionTaskState,
	type EventBus,
	TASK_STATE_TRANSITIONS,
	TaskInvalidTransitionError,
	type TaskState,
} from "@hyperidle/shared";
import { eq } from "drizzle-orm";
import type { AgentWorkIntentRecorder } from "./ports.js";
import type { StateTransitionAuditEntry, TaskAuditEntry } from "./task-audit.js";
import type { TaskRunResolverDeps } from "./task-run-resolver.js";
import { resolveTaskRunRequest } from "./task-run-resolver.js";
import * as work from "./work-service.js";

/**
 * Injected-port deps for `transitionTask`/`cascadeBetKill` (Mechanism C).
 *
 * @lore AU19 Increment 1b: `workIntents` is the same §10.3 against-grain
 * `session-requests` port as `bet-decomposition.ts`'s — interim DI wiring,
 * rewired to an EventBus subscription in Increment 3.
 *
 * @lore AU21 §6 Decision B / Increment 3: `taskRunResolver` carries the
 * shared ast-`<userId>` runnability helper (`requireRunnableAgent`,
 * `@hyperidle/users`) — injected rather than statically imported, same
 * Mechanism C shape as `assistant-turn-resolver.ts`'s
 * `AssistantTurnResolverDeps` (a nested Service may depend only on
 * `@hyperidle/db` + `@hyperidle/shared`, never another Service directly).
 */
export interface TaskStateMachineDeps {
	readonly workIntents: AgentWorkIntentRecorder;
	readonly taskRunResolver: TaskRunResolverDeps;
}

export {
	TASK_STATE_TRANSITIONS as VALID_TRANSITIONS,
	TaskInvalidTransitionError as InvalidTransitionError,
};

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
			const task = await work.get(tx, "task", taskId);
			if (!task) {
				throw new Error(`Task not found: ${taskId}`);
			}

			const fromState = task.state as TaskState;
			if (!canTransitionTaskState(fromState, toState)) {
				throw new TaskInvalidTransitionError(taskId, fromState, toState);
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

			const { applied } = await work.transition(tx, "task", {
				id: taskId,
				guard: { field: "state", equals: fromState },
				patch: {
					state: toState,
					auditTrail: JSON.stringify(existingAudit),
					updatedAt: new Date().toISOString(),
				},
			});

			// Lost the race: another concurrent transition already moved the task out
			// of `fromState`. Throwing rolls back the tx (no partial state/audit write).
			if (!applied) {
				throw new TaskInvalidTransitionError(taskId, fromState, toState);
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
				// AU21 §6 Decision B: resolve + validate the task_run run AT EMIT
				// TIME (this Service's own domain state, plus the shared
				// ast-<userId> runnability invariant) and bake the full request
				// onto the intent — the drain dispatches it directly, with zero
				// domain reads. The dispatch attempt row was just inserted above,
				// in the SAME transaction, so this read sees it.
				const bakedRequest = await resolveTaskRunRequest(
					tx as HyperIdleDb,
					attemptId,
					deps.taskRunResolver,
				);
				await deps.workIntents.record(tx, {
					kind: "task_run",
					sourceKind: "task_dispatch_attempt",
					sourceId: attemptId,
					requestedBy: task.ownerAgentId,
					idempotencyKey: `task-dispatch:${attemptId}`,
					bakedRequest,
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
