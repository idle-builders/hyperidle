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

/**
 * §6 rows 4/5: writes through `edit_task` instead of the deleted private
 * `transitionTask` helper. `edit_task` appends its own `changes` row and
 * emits `task.changed` after commit — this function no longer does
 * either. A refusal (a `Problem`, not a throw) becomes
 * `TaskInvalidTransitionError`, the shape every caller here already catches.
 */
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

/**
 * States an ancestor may already be in that mean we should not attempt to
 * transition it via auto-completion. Terminal states are already finished;
 * `review` means it was advanced by a prior propagation pass (needsReview=true)
 * and is awaiting a human verdict — we do not re-trigger it.
 *
 * @lore BB1: `review` is in this set because a second sibling completing would
 * otherwise try `review -> review`, throw InvalidTransitionError, and silently
 * abort the walk. `done` and `killed` are already terminal and need no action.
 */
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
	// `review -> in_progress` is a legal move, refused only while the task
	// still carries an unfinished dependency — and under ETHOS.md a
	// preemptive wall against a state only a hand-made API call reaches is
	// not worth a cross-Layer read. Founder-ruled. No replacement
	// event, no counter, no downward call.

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
 * the just-committed `done` state of level N. The `task.changed` event
 * emitted by each `transitionTask` re-triggers this handler for the ancestor;
 * those secondary calls find their own ancestors already done and skip (CAS).
 *
 * `review` is now a legal target from every non-terminal state (BB1). Ancestors
 * that are already in `review` or a terminal state are skipped so a second
 * sibling completing does not re-attempt the same transition. The cascade
 * advances ONE level per call: leaf → middle to `review`, then when middle is
 * marked `done` by a human the next `task.changed(done)` event advances
 * root to `review`. A human verdict between levels is the point of `review`.
 *
 * A root task reaching `review` (`parentTaskId === null`) is what used to be a
 * bet completing. The ship-confirmation thread is created only for root tasks.
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

			// Already in review or terminal: skip this ancestor.
			// Terminal ancestors are already finished; `review` means a prior
			// propagation pass (or a human) already advanced this ancestor and
			// it is awaiting a verdict — do not re-trigger.
			// @lore BB1: `review` is added to the skip set because parent
			// auto-completion now targets `review`. Without this a second sibling
			// completing would try `review -> review`, throw InvalidTransitionError,
			// and silently abort the walk.
			if (SKIP_ANCESTOR_STATES.has(ancestor.state)) continue;

			// Check: are ALL direct children of this ancestor terminal?
			const children = await deps.work.listChildTasks(db, ancestorId);
			if (children.length === 0) break; // No children — do not auto-complete.
			const allTerminal = children.every((c) => TERMINAL_TASK_STATES.has(c.state));
			if (!allTerminal) break; // At least one child still active — stop here.

			const fromState = ancestor.state;

			// NeedsReview fork: parent goes to `review` only when it asked for
			// one; otherwise it goes straight to `done`. When the parent goes to
			// `done`, transitionTask emits task.changed(done) for it, which
			// re-triggers this handler for the GRANDPARENT — the cascade continues
			// upward without requiring a human verdict at every level. A task with
			// needsReview=true is where the chain deliberately stops until a person
			// acts. Every non-terminal state has a legal edge to both `review` and
			// `done` (founder ruling, 2026-08-31).
			const targetState: TaskState = ancestor.needsReview ? "review" : "done";
			await transitionTask(db, eventBus, ancestorId, targetState, deps);

			// Root task completing is what used to be a bet completing.
			// Create the ship-confirmation thread when the root reaches its final
			// auto-driven state (either `review` or `done`).
			// @lore BB1: anchored on parentTaskId === null, NOT on depth or a flag.
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
 * Post a ship-confirmation review into a ROOT task that just completed.
 *
 * @lore BC3 architecture.md §3.9: every task already owns a real thread
 * (`team`-hosted, written at creation) — this no longer creates a SECOND,
 * task-hosted thread (`hostKind: "task"` left `HOST_KINDS` with BC3; a
 * task's thread is `team`-hosted now). The review posts into the task's
 * own thread instead, the same "resolve, don't recreate" shape B7b's
 * stalled-knowledge-action review uses.
 * @lore BB1: previously anchored on a `bet` row. A root task (`parentTaskId ===
 * null`) is the new bet equivalent.
 * @lore code-review finding, BC3: posts through `sendMessage` (the injected
 * `send_message.run`) instead of a raw `conversation.insertMessage` — the
 * module-link rule (architecture.md §3.9: through the action, never the
 * table). Going through the action is what appends the `changes` row, fires
 * the websocket nudge and bumps `lastActiveAt`; the manual
 * `thread_message_appended` emit above is gone because `send_message.run`
 * already emits it on commit. The `clientKey` is stable (no `Date.now()`
 * suffix) so a duplicate call for the same root task — e.g. a retriggered
 * event — replays the same message instead of posting a second one, the
 * same idempotency shape B7b's stalled-knowledge-action review uses.
 */
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
export function registerLifecyclePropagation(
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

	// Handler 2: task.changed -> evaluate parent transition (recursive rollup).
	// Fires for every terminal state so that a kill also propagates upward.
	// `change.after.state` is present only when the edit moved the state (the
	// diff-only shape `edit_task` writes) — a title-only edit's `task.changed`
	// carries no `state` key and no-ops here.
	const unsubTaskChanged = eventBus.on("task.changed", (event: EventByType<"task.changed">) => {
		// @lore BB1: a cascade kill is not progress — skip it. The handler still
		// listens for ordinary `killed` transitions so that killing the last live
		// child advances its parent, which is the behaviour AC3 promises.
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
