import { randomUUID } from "node:crypto";
import { type HyperIdleDb, taskDispatchAttempts, type WriteExecutor } from "@hyperidle/db";
import type { BakedWorkIntentRequest } from "@hyperidle/domain-model";
import {
	canTransitionTaskState,
	TASK_STATE_TRANSITIONS,
	type TaskState,
} from "@hyperidle/domain-model";
import type { EventBus } from "@hyperidle/event-bus";
import { eq } from "drizzle-orm";
import {
	CapacityExceededError,
	TaskCycleError,
	TaskDependencyNotFoundError,
	TaskInvalidTransitionError,
} from "./errors.js";
import type { AgentWorkIntentRecorder, TeamCapacityReader } from "./ports.js";
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
 * `@hyperidle/db` + framework packages, never another Service directly).
 */
export interface TaskStateMachineDeps {
	readonly workIntents: AgentWorkIntentRecorder;
	readonly taskRunResolver: TaskRunResolverDeps;
	/**
	 * BB1: reads `teams.capacity` for the WIP check on `-> in_progress`. Same
	 * injected-port shape the deleted bet state machine used, minus its write
	 * half — the count is live, so there is nothing to write back.
	 */
	readonly teamCapacity: TeamCapacityReader;
}

/**
 * BB1: reject a parent link that would make the tree cyclic — a task set as its
 * own parent, or reparented under one of its own descendants.
 *
 * Called before any write that sets `parentTaskId`. The read and the write must
 * share a transaction.
 *
 * @lore BB1 — KNOWN, ACCEPTED LIMIT: this is not proof against two SIMULTANEOUS
 * reparents. The subtree is read with a plain SELECT — no row locks, no
 * SERIALIZABLE — so on real Postgres under READ COMMITTED, "reparent A under B"
 * and "reparent B under A" at the same instant can each observe an acyclic tree,
 * both pass, and together form a detached `A → B → A` loop. PGlite serialises
 * locally, so it cannot happen on a laptop, and MAX_TASK_DEPTH keeps such a loop
 * degrading reads rather than hanging them. Founder ruling (2026-08-31): "we can
 * fix that edge case when it becomes a problem" — one shared backend, two people
 * reparenting the same two tasks in the same instant, is not a real scenario yet.
 * When it is, the fix is to lock the subtree or raise the isolation level. It is
 * NOT a retry loop: retrying a check that can pass wrongly just passes wrongly
 * again.
 */
export async function assertNoCycle(
	exec: WriteExecutor,
	taskId: string,
	parentTaskId: string,
): Promise<void> {
	if (taskId === parentTaskId) {
		throw new TaskCycleError(taskId, parentTaskId);
	}
	// If the proposed parent is somewhere in this task's own subtree, linking
	// them closes a loop.
	const subtree = await work.listSubtreeIds(exec, taskId);
	if (subtree.includes(parentTaskId)) {
		throw new TaskCycleError(taskId, parentTaskId);
	}
}

export {
	TASK_STATE_TRANSITIONS as VALID_TRANSITIONS,
	TaskInvalidTransitionError as InvalidTransitionError,
};

/** BA6: read a task's `dependencies` JSON-text column as a string array. */
function parseDependencyIds(dependencies: string | null): readonly string[] {
	if (!dependencies) return [];
	try {
		const parsed: unknown = JSON.parse(dependencies);
		if (!Array.isArray(parsed)) return [];
		return parsed.filter((v): v is string => typeof v === "string");
	} catch {
		return [];
	}
}

/**
 * BA6: true when `fromId`'s dependency graph (followed transitively) already
 * reaches `targetId` — i.e. setting `targetId -> fromId` as a NEW dependency
 * edge would close a loop. Depth-capped at `MAX_TASK_DEPTH`, the same backstop
 * `listSubtreeIds`/`listAncestorIds` use for the parent tree: `dependencies`
 * is a JSON text blob, not a column a recursive CTE can join on, so the walk
 * happens in application code instead.
 */
async function dependsOnTransitively(
	exec: WriteExecutor,
	fromId: string,
	targetId: string,
	depth = 0,
): Promise<boolean> {
	if (depth >= work.MAX_TASK_DEPTH) return false;
	const from = await work.get(exec, "task", fromId);
	const depIds = parseDependencyIds(from?.dependencies ?? null);
	for (const depId of depIds) {
		if (depId === targetId) return true;
		if (await dependsOnTransitively(exec, depId, targetId, depth + 1)) return true;
	}
	return false;
}

/**
 * BA6: validate a task's proposed `dependencies` list before it is written —
 * every id must name a task that exists, a task may not depend on itself, and
 * the resulting graph must have no cycle. Called from inside the same
 * transaction as the write (both `POST /tasks` and `PATCH /tasks/:id`).
 *
 * Throws `TaskDependencyNotFoundError` for a dangling id (mapped to 404) or
 * `TaskCycleError` for a self-dependency or cycle (mapped to 409 `TASK_CYCLE`).
 */
export async function assertValidDependencies(
	exec: WriteExecutor,
	taskId: string,
	dependencyIds: readonly string[],
): Promise<void> {
	for (const depId of dependencyIds) {
		if (depId === taskId) {
			throw new TaskCycleError(taskId, depId, "dependency");
		}
		const dep = await work.get(exec, "task", depId);
		if (!dep) {
			throw new TaskDependencyNotFoundError(depId);
		}
		if (await dependsOnTransitively(exec, depId, taskId)) {
			throw new TaskCycleError(taskId, depId, "dependency");
		}
	}
}

/**
 * BA6: true when any of the given dependency ids names a task that is not
 * `done` — the same "finished" definition the dependency watcher's own
 * all-deps check uses (`dependency-watcher.ts`), kept consistent on purpose.
 * A missing/dangling id counts as unfinished (never satisfies the wait).
 */
export async function hasUnfinishedDependency(
	exec: WriteExecutor,
	dependencyIds: readonly string[],
): Promise<boolean> {
	for (const depId of dependencyIds) {
		const dep = await work.get(exec, "task", depId);
		if (dep?.state !== "done") return true;
	}
	return false;
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
 *
 * @lore AU31 §3.1 site 6 — `deps.workIntents.record` is called AFTER this
 * transaction commits, not inside it. Cross-layer atomicity with
 * `agent-orchestration` is relinquished (founder ruling, architecture.md
 * §3.1/§13 item 9): on a failed record, the task sits in its new state with a
 * `requested` dispatch-attempt row and no session ever starts — visible in
 * the task view (state changed, nothing running), repaired by moving the
 * task to `hold` and back (the existing `"retry"` occasion path below,
 * reachable from the tasks route).
 */
export async function transitionTask(
	db: HyperIdleDb,
	eventBus: EventBus,
	taskId: string,
	toState: TaskState,
	deps: TaskStateMachineDeps,
	dispatchOccasion?: "accepted" | "retry",
	/**
	 * BB1: marks this transition as part of a deliberate subtree kill, so upward
	 * completion propagation ignores it. Only `cascadeTaskKill` passes it.
	 */
	opts?: { readonly cascade?: boolean },
): Promise<void> {
	let pendingDispatch:
		| {
				readonly attemptId: string;
				readonly bakedRequest: BakedWorkIntentRequest;
				readonly ownerAgentId: string;
		  }
		| undefined;
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

			// BA6: the enforcing half. Parking (`-> hold`) is the visible half;
			// this is what actually stops a task with an unfinished dependency
			// from being dispatched, no matter who calls for `accepted` — human,
			// agent, or a direct state edit. Reuses `TaskInvalidTransitionError`
			// rather than a new error class: while a named dependency is unmet,
			// `-> accepted` is not a legal move for this task, which is exactly
			// what that error already means.
			//
			// Covers `-> in_progress` too, not only `-> accepted`: `accepted` is
			// reachable with a stale dependency still attached (e.g. dependencies
			// were added to an already-`accepted` task), and `accepted ->
			// in_progress` is a legal edge in `TASK_STATE_TRANSITIONS`. Without
			// this second check, a task could sit `accepted` holding an unfinished
			// dependency and then be picked up via the `session_started ->
			// in_progress` reaction — the exact "not picked up for work" AC this
			// package exists to satisfy, entered through a different door.
			if (toState === "accepted" || toState === "in_progress") {
				const depIds = parseDependencyIds(task.dependencies);
				if (depIds.length > 0 && (await hasUnfinishedDependency(tx, depIds))) {
					throw new TaskInvalidTransitionError(taskId, fromState, toState);
				}
			}

			const now = new Date().toISOString();

			// BB1: the WIP limit, enforced AT THE DOOR — the moment work is
			// dispatched to an agent, which is this same transition (`accepted`
			// with an owner is what inserts the dispatch attempt and records the
			// work intent, below).
			//
			// @lore BB1: it was first put on the transition INTO `in_progress`,
			// which is one step too late and actively harmful. Nothing in the
			// dispatch chain consulted capacity, so at capacity a session still
			// started and the agent did real, paid work — and then the reaction
			// that moves the task to `in_progress` (`work-session-started-
			// reactions.ts`) was refused, stranding the task in `accepted`. Since
			// session-end propagation requires `in_progress`, the task never
			// reached `review` and the work was silently lost. A limit must
			// refuse work at the door; once a session exists, the transition is
			// RECORDING a fact and must never fail.
			//
			// The count spans the whole team at every depth: what bounds the
			// factory is how much work is actually running, not how many top-level
			// commitments exist. Counted live inside this transaction rather than
			// read off a stored tally, so two dispatches racing cannot both see
			// the same stale count.
			if (toState === "accepted" && task.ownerAgentId && fromState !== "accepted") {
				const team = await deps.teamCapacity.getByTeamId(tx, task.teamId);
				if (!team) {
					throw new Error(`Team not found: ${task.teamId}`);
				}
				const running = await work.countTeamTasksInProgress(tx, task.teamId);
				if (running >= team.capacity) {
					throw new CapacityExceededError(task.teamId, team.capacity);
				}
			}

			const { applied } = await work.transition(tx, "task", {
				id: taskId,
				guard: { field: "state", equals: fromState },
				patch: {
					state: toState,
					updatedAt: now,
					// BB1: moved off the deleted bet path, which stamped this on
					// completion. Every task records when it finished.
					...(toState === "done" ? { completedAt: now } : {}),
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
					createdAt: now,
					updatedAt: now,
				});
				// AU21 §6 Decision B: resolve + validate the task_run run AT EMIT
				// TIME (this Service's own domain state, plus the shared
				// ast-<userId> runnability invariant) and bake the full request
				// onto the intent — the drain dispatches it directly, with zero
				// domain reads. The dispatch attempt row was just inserted above,
				// in the SAME transaction, so this read sees it.
				const bakedRequest = await resolveTaskRunRequest(
					tx as HyperIdleDb,
					{ kind: "task_run", attemptId },
					deps.taskRunResolver,
				);
				// AU31 §3.1 site 6: the bake reads the dispatch-attempt row just
				// inserted above, so it stays IN this transaction; only the seam
				// WRITE (`workIntents.record`) moves out, post-commit (see this
				// function's top `@lore`).
				pendingDispatch = { attemptId, bakedRequest, ownerAgentId: task.ownerAgentId };
			}

			return { fromState };
		},
	);

	if (!transitioned) return;

	if (pendingDispatch) {
		await deps.workIntents({
			kind: "task_run",
			sourceKind: "task_dispatch_attempt",
			sourceId: pendingDispatch.attemptId,
			requestedBy: pendingDispatch.ownerAgentId,
			idempotencyKey: `task-dispatch:${pendingDispatch.attemptId}`,
			bakedRequest: pendingDispatch.bakedRequest,
		});
	}

	eventBus.emit({
		type: "task_state_changed",
		streamId: taskId,
		taskId,
		fromState: transitioned.fromState,
		toState,
		timestamp: Date.now(),
		...(opts?.cascade === true ? { cascade: true } : {}),
	});
}
