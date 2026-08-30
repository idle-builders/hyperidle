/** Reactive lifecycle propagation. */

import { randomUUID } from "node:crypto";
import type { HyperIdleDb } from "@hyperidle/db";
import { canTransitionTaskState, type TaskState } from "@hyperidle/domain-model";
import type {
	EventBus,
	PropagationAppliedEvent,
	PropagationFailedEvent,
	SessionEndedEvent,
	TaskStateChangedEvent,
} from "@hyperidle/event-bus";
import { TaskInvalidTransitionError } from "./errors.js";
import type { PolicyDeps } from "./ports.js";

type LifecyclePropagationDeps = Pick<PolicyDeps, "work" | "conversation" | "users">;

async function transitionTask(
	db: HyperIdleDb,
	eventBus: EventBus,
	taskId: string,
	toState: TaskState,
	deps: LifecyclePropagationDeps,
): Promise<void> {
	const transitioned = await db.transaction(
		async (tx): Promise<{ fromState: TaskState } | null> => {
			// Re-read INSIDE the tx so the audit read and the CAS write serialize together.
			// @lore AU13 addendum §A6: MUST stay `tx` (not pooled `db`) — inside
			// propagation's CAS tx.
			const task = await deps.work.getTaskById(tx, taskId);
			if (!task) {
				throw new Error(`Task not found: ${taskId}`);
			}

			const fromState = task.state as TaskState;
			if (!canTransitionTaskState(fromState, toState)) {
				throw new TaskInvalidTransitionError(taskId, fromState, toState);
			}

			// Build audit trail
			const existingAudit: Array<{ from: string; to: string; timestamp: string }> = task.auditTrail
				? (JSON.parse(task.auditTrail) as Array<{ from: string; to: string; timestamp: string }>)
				: [];
			existingAudit.push({
				from: fromState,
				to: toState,
				timestamp: new Date().toISOString(),
			});

			const { applied } = await deps.work.transitionTaskState(tx, {
				taskId,
				fromState,
				patch: {
					state: toState,
					auditTrail: JSON.stringify(existingAudit),
					updatedAt: new Date().toISOString(),
				},
			});

			if (!applied) {
				throw new TaskInvalidTransitionError(taskId, fromState, toState);
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

/** Type guard: check if an error is an InvalidTransitionError from either source. */
function isInvalidTransitionError(err: unknown): err is Error & { name: "InvalidTransitionError" } {
	return err instanceof Error && err.name === "InvalidTransitionError";
}

/** ID of the system agent that authors propagation review threads. */
const SYSTEM_PROPAGATION_AGENT_ID = "system:propagation";

/** Terminal task states — tasks in these states count as finished. */
const TERMINAL_TASK_STATES = new Set(["done", "killed"]);

// ─── Session -> Task propagation ─────────────────────────────────────────────

async function propagateSessionToTask(
	db: HyperIdleDb,
	eventBus: EventBus,
	sessionId: string,
	taskId: string,
	outcome: string,
	deps: LifecyclePropagationDeps,
): Promise<void> {
	// F2: Only propagate on completed outcome. crashed and stopped do not trigger transitions.
	if (outcome !== "completed") return;

	// @lore AU26 J2: the "is another run still active on this task" guard is
	// DELETED, and with it core-api's last policy-side read of `sessions` (an
	// `agent-orchestration` table).
	//
	// What it defended against is NOT unreachable, and the earlier version of
	// this note claiming "a state no normal path produces" was wrong — the
	// work package's own analysis (`.pipeline/work/AU26/policy-sibling-guard.md`)
	// names two reachable paths, both confirmed in code:
	//   1. `POST /api/sessions` twice on the same task. The route checks that
	//      the task exists and the agent is runnable and nothing else
	//      (`core-api/src/routes/sessions-routes.ts`,
	//      `work/src/session-start-resolver.ts`); `concurrency.ts` caps runs per
	//      AGENT, not per task, and no DB constraint says one active run per
	//      task. No screen calls this — it is an API-only path.
	//   2. `accepted -> hold -> accepted` while the first run request is still
	//      queued (`shared/src/task-transition.ts` allows both edges). The
	//      queued request is not re-checked at drain, so a second attempt mints
	//      a second run.
	// What is genuinely absent is the ORDINARY path: a run request is only
	// created when a task enters `accepted` (`work/src/task-state-machine.ts`),
	// there is no `in_progress -> accepted` edge, and a handoff closes the old
	// run and opens the new one in ONE transaction (`handoff-protocol.ts:121`),
	// so the abandoned run is already `done` and never reaches this code
	// (`endRunForHandoff` takes no event bus, and the later `endSession` is
	// conditional on the row still being `active`).
	//
	// The residue, stated plainly: when two runs ARE live on one task, the
	// first to finish flips the task `in_progress -> review` while the second is
	// still working. The second run's end then sees a task that is no longer
	// `in_progress` and quietly does nothing. That is recoverable —
	// `review -> in_progress` is a legal move anyone can make — and under
	// ETHOS.md a preemptive wall against a state only a hand-made API call
	// reaches is not worth a cross-Layer read. Founder-ruled. No replacement
	// event, no counter, no downward call.

	// DB reads and transition inside the catch so any read error is reported via
	// propagation_failed (not an unhandled rejection).
	try {
		// Check task exists and is in_progress
		const task = await deps.work.getTaskById(db, taskId);
		if (!task) return;
		if (task.state !== "in_progress") return;

		await transitionTask(db, eventBus, taskId, "review", deps);

		// Emit propagation_applied event
		const appliedEvent: PropagationAppliedEvent = {
			type: "propagation_applied",
			streamId: taskId,
			sourceLevel: "session",
			sourceId: sessionId,
			targetLevel: "task",
			targetId: taskId,
			targetTransition: "in_progress -> review",
			timestamp: Date.now(),
		};
		eventBus.emit(appliedEvent);
	} catch (err) {
		// F1: InvalidTransitionError from a race condition — silently skip.
		if (isInvalidTransitionError(err)) return;
		// Unexpected error — emit propagation_failed for extension subscribers.
		// @lore AU44 batch6: the retry/log apparatus is gone (propagation_log
		// drop, Ruling 2). A failed hop is announced on the bus and stops; the
		// `propagation_failed` event is the extension point for any team that
		// wants a notification or retry.
		const failedEvent: PropagationFailedEvent = {
			type: "propagation_failed",
			streamId: taskId,
			sourceLevel: "session",
			sourceId: sessionId,
			targetLevel: "task",
			targetId: taskId,
			failureReason: err instanceof Error ? err.message : String(err),
			timestamp: Date.now(),
		};
		eventBus.emit(failedEvent);
	}
}

// ─── Task -> Parent propagation (recursive rollup) ───────────────────────────

/**
 * When a task reaches a terminal state (`done` or `killed`), walk its ancestor
 * chain and transition each ancestor that now has all-terminal children.
 *
 * @lore BB1: replaces the single-hop `propagateTaskToBet`. A bet was one fixed
 * level above a task; ancestors are now at any depth. We use `listAncestorIds`
 * (nearest-first) and process the chain in one call — each ancestor transition
 * commits before we read the next level, so the sibling check at level N+1 sees
 * the just-committed `done` state of level N. The `task_state_changed` event
 * emitted by each `transitionTask` re-triggers this handler for the ancestor;
 * those secondary calls find their own ancestors already done and skip (CAS).
 *
 * Only `review -> done` is legal per the task state machine. Ancestors in other
 * states (e.g. `in_progress`) cause an `InvalidTransitionError` which is caught
 * and treated as a race — the human's current state wins.
 *
 * A root task completing (`parentTaskId === null`) is what used to be a bet
 * completing. The ship-confirmation thread is created only for root tasks.
 */
async function propagateTaskToParent(
	db: HyperIdleDb,
	eventBus: EventBus,
	taskId: string,
	deps: LifecyclePropagationDeps,
): Promise<void> {
	let lastAttemptedAncestorId: string | undefined;
	try {
		const ancestorIds = await deps.work.listAncestorIds(db, taskId);
		if (ancestorIds.length === 0) {
			// taskId is itself a root — no parent to propagate to.
			return;
		}

		for (const ancestorId of ancestorIds) {
			lastAttemptedAncestorId = ancestorId;

			const ancestor = await deps.work.getTaskById(db, ancestorId);
			if (!ancestor) break;

			// Already terminal: this ancestor was completed by a prior iteration
			// or a concurrent write. Continue up the chain — the grandparent
			// might still be waiting for this ancestor AND another sibling, but
			// if the ancestor is now done we can still check higher up.
			if (TERMINAL_TASK_STATES.has(ancestor.state)) continue;

			// Check: are ALL direct children of this ancestor terminal?
			const children = await deps.work.listChildTasks(db, ancestorId);
			if (children.length === 0) break; // No children — do not auto-complete.
			const allTerminal = children.every((c) => TERMINAL_TASK_STATES.has(c.state));
			if (!allTerminal) break; // At least one child still active — stop here.

			const fromState = ancestor.state;

			// Transition to done. The task state machine requires `review -> done`;
			// if the ancestor is in another state this throws InvalidTransitionError,
			// caught below as a race (human intent wins).
			await transitionTask(db, eventBus, ancestorId, "done", deps);

			// Root task completion is what used to be a bet completing.
			// @lore BB1: anchored on parentTaskId === null, NOT on depth or a flag.
			if (ancestor.parentTaskId === null) {
				await createShipConfirmationThread(db, eventBus, ancestorId, children, deps);

				// Team status is derived on read — no write needed. Emit for observability.
				const teamEvent: PropagationAppliedEvent = {
					type: "propagation_applied",
					streamId: ancestor.teamId,
					sourceLevel: "task",
					sourceId: ancestorId,
					targetLevel: "team",
					targetId: ancestor.teamId,
					targetTransition: `${fromState} -> done`,
					timestamp: Date.now(),
				};
				eventBus.emit(teamEvent);
			}

			// Emit propagation_applied for this task -> ancestor hop.
			const appliedEvent: PropagationAppliedEvent = {
				type: "propagation_applied",
				streamId: ancestorId,
				sourceLevel: "task",
				sourceId: taskId,
				targetLevel: "task",
				targetId: ancestorId,
				targetTransition: `${fromState} -> done`,
				timestamp: Date.now(),
			};
			eventBus.emit(appliedEvent);
		}
	} catch (err) {
		if (isInvalidTransitionError(err)) {
			// F4: Race condition — ancestor was already moved by a human or a
			// concurrent propagation. Silently skip; the human intent wins.
			return;
		}
		// Unexpected error — emit propagation_failed for extension subscribers.
		const failedEvent: PropagationFailedEvent = {
			type: "propagation_failed",
			streamId: lastAttemptedAncestorId ?? taskId,
			sourceLevel: "task",
			sourceId: taskId,
			targetLevel: "task",
			targetId: lastAttemptedAncestorId ?? taskId,
			failureReason: err instanceof Error ? err.message : String(err),
			timestamp: Date.now(),
		};
		eventBus.emit(failedEvent);
	}
}

// ─── Ship-confirmation review thread ─────────────────────────────────────────

/**
 * Create a ship-confirmation thread on a ROOT task that just completed.
 *
 * @lore BB1: previously anchored on a `bet` row. A root task (`parentTaskId ===
 * null`) is the new bet equivalent — `hostKind: "task"` replaces `hostKind: "bet"`.
 */
async function createShipConfirmationThread(
	db: HyperIdleDb,
	eventBus: EventBus,
	rootTaskId: string,
	allChildren: Array<{ state: string }>,
	deps: LifecyclePropagationDeps,
): Promise<void> {
	const now = new Date().toISOString();
	const threadId = randomUUID();

	// P2: Read founder from users table (kind = 'human') instead of factorySettings.
	// @lore P2: fallback to "u-founder" for unseeded DBs — same sentinel as auth middleware.
	const humanUser = await deps.users.getFirstUserByKind(db, "human");
	const founderId = humanUser?.id ?? "u-founder";

	const doneCount = allChildren.filter((t) => t.state === "done").length;
	const killedCount = allChildren.filter((t) => t.state === "killed").length;
	const totalCount = allChildren.length;

	await deps.conversation.insertThread(db, {
		id: threadId,
		hostKind: "task",
		hostId: rootTaskId,
		initiatorId: SYSTEM_PROPAGATION_AGENT_ID,
		participants: JSON.stringify([SYSTEM_PROPAGATION_AGENT_ID, founderId]),
		lastActiveAt: now,
		createdAt: now,
	});

	const messageId = randomUUID();
	await deps.conversation.insertMessage(db, {
		id: messageId,
		senderId: SYSTEM_PROPAGATION_AGENT_ID,
		threadId,
		type: "review",
		payload: JSON.stringify({
			kind: "ship_confirmation",
			taskId: rootTaskId,
			taskSummary: { done: doneCount, killed: killedCount, total: totalCount },
			message: "All subtasks on this task are complete. Confirm shipping?",
		}),
		clientKey: `propagation-ship-${rootTaskId}-${Date.now()}`,
		createdAt: now,
	});

	eventBus.emit({
		type: "thread_created",
		streamId: threadId,
		threadId,
		hostKind: "task",
		hostId: rootTaskId,
		initiatorId: SYSTEM_PROPAGATION_AGENT_ID,
		timestamp: Date.now(),
	});
}

// ─── Public registration function ─────────────────────────────────────────────

/**
 * Register lifecycle propagation event handlers on the EventBus.
 *
 * Returns an unsubscribe function that tears down all subscriptions.
 *
 * @lore BB1: the three-handler chain (session -> task, task -> bet, bet ->
 * team) is now two handlers. Bets are gone; a root task (`parentTaskId ===
 * null`) is what a bet was. Handler 2 now drives a recursive rollup via
 * `listAncestorIds` and `listChildTasks` rather than a single fixed hop.
 *
 * @lore AU44 batch6: propagation_log table dropped (AU20 Ruling 2 affirmed
 * by founder). The retry heartbeat, `recordPropagationHop`, `retryFailedPropagations`,
 * and `LogSink` are all deleted. A failed hop emits `propagation_failed` on the
 * bus (the extension surface for plugins) and stops; manual repair is one legal
 * click.
 */
function registerLifecyclePropagation(
	db: HyperIdleDb,
	eventBus: EventBus,
	deps: LifecyclePropagationDeps,
): () => void {
	// Handler 1: session_ended -> evaluate task transition
	// @lore AF3 C9b: async handlers fail the EventHandler<T> overload (Promise<void>
	// vs void). Use sync wrapper with void async IIFE to satisfy the overload.
	// Explicit event type annotation ensures the on<T> overload resolves correctly.
	const unsubSessionEnded = eventBus.on("session_ended", (event: SessionEndedEvent) => {
		void (async () => {
			if (!event.taskId) return;
			await propagateSessionToTask(
				db,
				eventBus,
				event.sessionId,
				event.taskId,
				event.outcome,
				deps,
			);
		})();
	});

	// Handler 2: task_state_changed -> evaluate parent transition (recursive rollup).
	// Fires for every terminal state so that a kill also propagates upward.
	const unsubTaskChanged = eventBus.on("task_state_changed", (event: TaskStateChangedEvent) => {
		if (event.toState === "done" || event.toState === "killed") {
			void (async () => {
				await propagateTaskToParent(db, eventBus, event.taskId, deps);
			})();
		}
	});

	return () => {
		unsubSessionEnded();
		unsubTaskChanged();
	};
}

export { registerLifecyclePropagation };
