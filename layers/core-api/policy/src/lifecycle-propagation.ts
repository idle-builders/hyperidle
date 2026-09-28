/** Reactive lifecycle propagation. */

import type { HyperIdleDb } from "@hyperidle/db";
import { createLogger } from "@hyperidle/diagnostics";
import type { TaskState } from "@hyperidle/domain-model";
import type {
	EventBus,
	EventByType,
	PropagationAppliedEvent,
	PropagationFailedEvent,
	SessionEndedEvent,
} from "@hyperidle/event-bus";
import { TaskInvalidTransitionError } from "./errors.js";
import type { PolicyDeps } from "./ports.js";

const logger = createLogger({ pkg: "policy.lifecycle-propagation" });

type LifecyclePropagationDeps = Pick<PolicyDeps, "work" | "editTask" | "sendMessage">;

// Write through edit_task; a refusal becomes TaskInvalidTransitionError.
async function transitionTask(
	db: HyperIdleDb,
	eventBus: EventBus,
	taskId: string,
	toState: TaskState,
	deps: LifecyclePropagationDeps,
): Promise<void> {
	const task = await deps.work.getTaskById(db, taskId);
	if (!task) {
		throw new Error(`Task not found: ${taskId}`);
	}
	const fromState = task.state as TaskState;
	const now = new Date().toISOString();
	const result = await deps.editTask(
		{ actor: SYSTEM_PROPAGATION_AGENT_ID, db, eventBus, now },
		{ id: taskId, state: toState },
	);
	if (!result.ok) {
		throw new TaskInvalidTransitionError(taskId, fromState, toState);
	}
}

/** Type guard: check if an error is an InvalidTransitionError from either source. */
function isInvalidTransitionError(err: unknown): err is Error & { name: "InvalidTransitionError" } {
	return err instanceof Error && err.name === "InvalidTransitionError";
}

/** ID of the system agent that authors propagation review threads. */
const SYSTEM_PROPAGATION_AGENT_ID = "system:propagation";

/** Terminal task states — tasks in these states count as finished. */
const TERMINAL_TASK_STATES = new Set(["done", "killed"]);

// @lore: `review` in SKIP_ANCESTOR_STATES — a second sibling completing would try review→review, throw, and abort the walk
const SKIP_ANCESTOR_STATES = new Set(["done", "killed", "review"]);

// ─── Session -> Task propagation ─────────────────────────────────────────────

async function propagateSessionToTask(
	db: HyperIdleDb,
	eventBus: EventBus,
	sessionId: string,
	taskId: string,
	outcome: string,
	deps: LifecyclePropagationDeps,
): Promise<void> {
	// Only propagate on completed outcome. crashed and stopped do not trigger transitions.
	if (outcome !== "completed") return;

	// @lore: no "is another run still active" guard — two simultaneous runs recoverable; first flips in_progress→review, second sees non-in_progress and skips

	// DB reads and transition inside the catch so any read error is reported via
	// propagation_failed (not an unhandled rejection).
	try {
		// Check task exists and is in_progress
		const task = await deps.work.getTaskById(db, taskId);
		if (!task) return;
		if (task.state !== "in_progress") return;

		// NeedsReview fork: only tasks that explicitly asked for review go
		// to `review`; everything else completes directly to `done`, keeping the
		// upward cascade moving without requiring a verdict at every leaf.
		const targetState: TaskState = task.needsReview ? "review" : "done";
		await transitionTask(db, eventBus, taskId, targetState, deps);

		// Emit propagation_applied event
		const appliedEvent: PropagationAppliedEvent = {
			type: "propagation_applied",
			streamId: taskId,
			sourceLevel: "session",
			sourceId: sessionId,
			targetLevel: "task",
			targetId: taskId,
			targetTransition: `in_progress -> ${targetState}`,
			timestamp: Date.now(),
		};
		eventBus.emit(appliedEvent);
	} catch (err) {
		// InvalidTransitionError from a race condition — silently skip.
		if (isInvalidTransitionError(err)) return;
		// Unexpected error — emit propagation_failed for extension subscribers.
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

// Walk ancestor chain; transition each ancestor with all-terminal children.
// Each transition commits before reading the next level (sibling check sees just-committed state).
// Root task reaching review = bet completing; ship-confirmation thread created only for root tasks.
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

			// Already in review or terminal: skip this ancestor.
			// Terminal ancestors are already finished; `review` means a prior
			// propagation pass (or a human) already advanced this ancestor and
			// it is awaiting a verdict — do not re-trigger.
			if (SKIP_ANCESTOR_STATES.has(ancestor.state)) continue;

			// Check: are ALL direct children of this ancestor terminal?
			const children = await deps.work.listChildTasks(db, ancestorId);
			if (children.length === 0) break; // No children — do not auto-complete.
			const allTerminal = children.every((c) => TERMINAL_TASK_STATES.has(c.state));
			if (!allTerminal) break; // At least one child still active — stop here.

			const fromState = ancestor.state;

			// needsReview=true → review (chain stops for human); otherwise done (cascade continues upward).
			const targetState: TaskState = ancestor.needsReview ? "review" : "done";
			await transitionTask(db, eventBus, ancestorId, targetState, deps);

			if (ancestor.parentTaskId === null) {
				await createShipConfirmationThread(
					db,
					eventBus,
					ancestorId,
					ancestor.threadId,
					children,
					deps,
				);

				// Team status is derived on read — no write needed. Emit for observability.
				const teamEvent: PropagationAppliedEvent = {
					type: "propagation_applied",
					streamId: ancestor.teamId,
					sourceLevel: "task",
					sourceId: ancestorId,
					targetLevel: "team",
					targetId: ancestor.teamId,
					targetTransition: `${fromState} -> ${targetState}`,
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
				targetTransition: `${fromState} -> ${targetState}`,
				timestamp: Date.now(),
			};
			eventBus.emit(appliedEvent);
		}
	} catch (err) {
		if (isInvalidTransitionError(err)) {
			// Race condition — ancestor was already moved by a human or a
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

// Post ship-confirmation review into the root task's existing thread (not a new one).
// @lore: posts through sendMessage (not insertMessage) — gets changes row, WS nudge, lastActiveAt bump
//
// @lore: clientKey is stable — duplicate trigger replays same message, not a second one
async function createShipConfirmationThread(
	db: HyperIdleDb,
	eventBus: EventBus,
	rootTaskId: string,
	rootThreadId: string,
	allChildren: Array<{ state: string }>,
	deps: LifecyclePropagationDeps,
): Promise<void> {
	const now = new Date().toISOString();

	const doneCount = allChildren.filter((t) => t.state === "done").length;
	const killedCount = allChildren.filter((t) => t.state === "killed").length;
	const totalCount = allChildren.length;

	const result = await deps.sendMessage(
		{ actor: SYSTEM_PROPAGATION_AGENT_ID, db, eventBus, now },
		{
			threadId: rootThreadId,
			clientKey: `propagation-ship-${rootTaskId}`,
			review: {
				title: "Confirm shipping?",
				reasoning: [
					`All subtasks on this task are complete: ${doneCount} done, ${killedCount} killed, ${totalCount} total.`,
				],
			},
		},
	);
	if (!result.ok) {
		logger.warn("createShipConfirmationThread: send_message refused", {
			rootTaskId,
			rootThreadId,
			problems: result.problems,
		});
	}
}

// ─── Public registration function ─────────────────────────────────────────────

// Register lifecycle propagation handlers. Returns unsubscribe function.
export function registerLifecyclePropagation(
	db: HyperIdleDb,
	eventBus: EventBus,
	deps: LifecyclePropagationDeps,
): () => void {
	// Handler 1: session_ended -> evaluate task transition
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

	// Handler 2: task.changed -> evaluate parent transition (recursive rollup).
	// Fires for every terminal state so that a kill also propagates upward.
	// `change.after.state` is present only when the edit moved the state (the
	// diff-only shape `edit_task` writes) — a title-only edit's `task.changed`
	// carries no `state` key and no-ops here.
	const unsubTaskChanged = eventBus.on("task.changed", (event: EventByType<"task.changed">) => {
		// @lore: cascade kill skipped — not progress; ordinary killed transitions still advance the parent
		if (event.cascade === true) return;
		const state = event.change.after.state;
		if (state === "done" || state === "killed") {
			void (async () => {
				await propagateTaskToParent(db, eventBus, event.change.objectId, deps);
			})();
		}
	});

	return () => {
		unsubSessionEnded();
		unsubTaskChanged();
	};
}
